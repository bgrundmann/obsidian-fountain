import { PDFDocument, type PDFPage, StandardFonts, rgb } from "pdf-lib";
import {
  type Action,
  type Dialogue,
  type FountainScript,
  type Scene,
  type StyledText,
  type Synopsis,
  type TextElementWithNotesAndBoneyard,
  type Transition,
  extractTransitionText,
} from "./fountain";
import type { PDFOptions } from "./pdf_options_dialog";

// Color type for text rendering
export type Color = "red" | "green" | "black" | "gray" | "yellow";

// Convert Color to RGB values
export function rgbOfColor(color: Color): { r: number; g: number; b: number } {
  switch (color) {
    case "red":
      return { r: 0.8, g: 0, b: 0 };
    case "green":
      return { r: 0, g: 0.6, b: 0 };
    case "gray":
      return { r: 0.5, g: 0.5, b: 0.5 };
    case "yellow":
      return { r: 1, g: 1, b: 0.6 };
    default:
      return { r: 0, g: 0, b: 0 };
  }
}

// Instruction types for PDF generation
export type Instruction = NewPageInstruction | TextInstruction;

export interface NewPageInstruction {
  type: "new-page";
  width: number; // Page width in points
  height: number; // Page height in points
}

export interface TextInstruction {
  type: "text";
  data: string;
  x: number; // X coordinate in points from left edge
  y: number; // Y coordinate in points from bottom edge (PDF standard)
  bold: boolean;
  italic: boolean;
  underline: boolean;
  color: Color; // Text color
  strikethrough: boolean; // Whether to render with strikethrough
  backgroundColor?: Color; // Background highlight color
}

// Type for tracking styled text segments during rendering
type StyledTextSegment = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: Color;
  strikethrough?: boolean;
  backgroundColor?: Color;
};

// Page layout constants (all measurements in PDF points - 1/72 inch)
const FONT_SIZE = 12;
const LINE_HEIGHT = 12; // Single spacing

// Character limits for text wrapping (Phase 1: extracted from hardcoded values)
const DEFAULT_CHARACTERS_PER_LINE = {
  action: 62,
  dialogue: 35,
  parenthetical: 25,
  titlePageCenter: 60,
  titlePageSides: 55,
};

// Page dimensions based on paper size
const PAPER_SIZES = {
  letter: { width: 612, height: 792 }, // 8.5" × 11" in points
  a4: { width: 595.28, height: 841.89 }, // 210 × 297 mm in points
};

// Industry standard layout constants
const LINES_PER_PAGE = 60; // Industry standard for page-a-minute timing

// Fixed margins (industry standards)
const MARGIN_LEFT = 108; // 1.5" for binding (updated from 1.25")

// Character width calculation for Courier font
function getCharacterWidth(fontSize: number): number {
  return fontSize * 0.6; // Exact width of a courier font character
}

// Element positions (from left edge) - updated for 1.5" left margin
const SCENE_HEADING_INDENT = 108; // 1.5" (matches left margin)
const ACTION_INDENT = 108; // 1.5" (matches left margin)
const CHARACTER_INDENT = 288; // ~4" (adjusted for new left margin)
const DIALOGUE_INDENT = 180; // 2.5" (adjusted for new left margin)
const PARENTHETICAL_INDENT = 234; // 3.25" (adjusted for new left margin)

// Title page positioning (calculated dynamically based on page height)
function getTitlePageCenterStart(pageHeight: number): number {
  return pageHeight * 0.6;
}

function getTitlePageCenterX(pageWidth: number): number {
  return pageWidth / 2;
}

// Dynamic margin calculation functions (Phase 2)
function calculateRightMargin(
  pageWidth: number,
  maxCharactersPerLine: number,
  fontSize: number,
): number {
  // Formula: right_margin = page_width - left_margin - (characters_per_line * character_width)
  return (
    pageWidth - MARGIN_LEFT - maxCharactersPerLine * getCharacterWidth(fontSize)
  );
}

function calculateVerticalMargins(pageHeight: number): {
  top: number;
  bottom: number;
} {
  // Center the desired number of lines on the page
  const totalTextHeight = LINES_PER_PAGE * LINE_HEIGHT;
  const availableHeight = pageHeight - totalTextHeight;
  const verticalMargin = availableHeight / 2;

  return {
    top: verticalMargin,
    bottom: verticalMargin,
  };
}

// Page state type for tracking position and layout
type PageState = {
  // Vertical position tracking (measured from top of page)
  currentY: number; // Current vertical position (points from top)
  remainingHeight: number; // Remaining usable height on current page

  // Page information
  pageNumber: number; // Current page number (1-based)
  pageWidth: number; // Current page width (including margins)
  pageHeight: number; // Current page height (including margins)
  isTitlePage: boolean; // Whether this is the title page

  // Layout constraints
  margins: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };

  // Text formatting state
  fontSize: number; // Current font size
  lineHeight: number; // Current line height

  // Character limits for different element types
  charactersPerLine: {
    action: number;
    dialogue: number;
    parenthetical: number;
    titlePageCenter: number;
    titlePageSides: number;
  };

  // Element spacing
  lastElementType: string | null; // Type of previous element for spacing rules
};

/**
 * Helper function to emit a text instruction and return the new x position
 */
function emitText(
  instructions: Instruction[],
  pageState: PageState,
  options: {
    data: string;
    x: number;
    bold: boolean;
    italic: boolean;
    underline: boolean;
    color?: Color;
    strikethrough?: boolean;
    backgroundColor?: Color;
  },
): number {
  instructions.push({
    type: "text",
    data: options.data,
    x: options.x,
    y: pageState.currentY,
    bold: options.bold,
    italic: options.italic,
    underline: options.underline,
    color: options.color || "black",
    strikethrough: options.strikethrough || false,
    backgroundColor: options.backgroundColor,
  });

  return (
    options.x + options.data.length * getCharacterWidth(pageState.fontSize)
  );
}

/**
 * Helper function to emit a new page instruction and update page state
 */
function emitNewPage(
  instructions: Instruction[],
  pageState: PageState,
): PageState {
  instructions.push({
    type: "new-page",
    width: pageState.pageWidth,
    height: pageState.pageHeight,
  });

  return {
    ...pageState,
    currentY: pageState.pageHeight - pageState.margins.top,
    pageNumber: pageState.pageNumber + 1,
    lastElementType: null, // Reset spacing for new page
  };
}

/**
 * Helper function to ensure enough lines are available on the current page
 * If not enough space, adds a new page instruction and updates page state
 */
function needLines(
  instructions: Instruction[],
  pageState: PageState,
  numLines: number,
): PageState {
  const requiredSpace = numLines * pageState.lineHeight;

  if (pageState.currentY - requiredSpace < pageState.margins.bottom) {
    return emitNewPage(instructions, pageState);
  }

  return pageState;
}

/**
 * Helper function to advance to the next line
 */
function advanceLine(pageState: PageState): PageState {
  return {
    ...pageState,
    currentY: pageState.currentY - pageState.lineHeight,
  };
}

/**
 * Helper function to add spacing before an element if there was a previous element
 */
function addElementSpacing(pageState: PageState): PageState {
  if (pageState.lastElementType !== null) {
    return advanceLine(pageState);
  }
  return pageState;
}

/**
 * Main entry point for PDF generation
 * Converts a FountainScript AST into a properly formatted PDF document
 */
export async function generatePDF(
  fountainScript: FountainScript,
  options: PDFOptions = {
    sceneHeadingBold: false,
    paperSize: "letter",
    hideNotes: true,
    hideSynopsis: false,
  },
): Promise<PDFDocument> {
  // Generate instructions
  const instructions = generateInstructions(fountainScript, options);

  // Execute instructions to create PDF
  return renderInstructionsToPDF(instructions, options);
}

/**
 * Generates all instructions for the entire fountain script
 */
export function generateInstructions(
  fountainScript: FountainScript,
  options: PDFOptions = {
    sceneHeadingBold: false,
    paperSize: "letter",
    hideNotes: true,
    hideSynopsis: false,
  },
): Instruction[] {
  const instructions: Instruction[] = [];
  const paperSize = PAPER_SIZES[options.paperSize];

  // Calculate dynamic margins based on paper size and industry standards (Phase 2)
  const verticalMargins = calculateVerticalMargins(paperSize.height);
  const rightMargin = calculateRightMargin(
    paperSize.width,
    DEFAULT_CHARACTERS_PER_LINE.action,
    FONT_SIZE,
  );

  // Initialize page state (using PDF coordinates - bottom-left origin)
  let currentState: PageState = {
    currentY: paperSize.height - verticalMargins.top, // Start at calculated top margin
    remainingHeight:
      paperSize.height - verticalMargins.top - verticalMargins.bottom,
    pageNumber: 1,
    pageWidth: paperSize.width,
    pageHeight: paperSize.height,
    isTitlePage: true,
    margins: {
      top: verticalMargins.top,
      bottom: verticalMargins.bottom,
      left: MARGIN_LEFT, // Fixed 1.5" for binding
      right: rightMargin, // Calculated based on character limits
    },
    fontSize: FONT_SIZE,
    lineHeight: LINE_HEIGHT,
    charactersPerLine: DEFAULT_CHARACTERS_PER_LINE,
    lastElementType: null,
  };

  // Add first page
  currentState = emitNewPage(instructions, currentState);

  // Generate title page instructions if it exists
  if (fountainScript.titlePage.length > 0) {
    currentState = generateTitlePageInstructions(
      instructions,
      currentState,
      fountainScript,
      options,
    );
  } else {
    currentState = { ...currentState, isTitlePage: false, pageNumber: 1 };
  }

  // Filter out hidden elements for consistent behavior
  const filteredScript = fountainScript.withHiddenElementsRemoved({
    hideBoneyard: true,
    hideNotes: options.hideNotes,
    hideSynopsis: options.hideSynopsis,
  });

  // Generate script instructions
  generateScriptInstructions(
    instructions,
    currentState,
    filteredScript,
    options,
  );

  return instructions;
}

/**
 * Generates instructions for the entire script by iterating through all elements
 */
function generateScriptInstructions(
  instructions: Instruction[],
  pageState: PageState,
  fountainScript: FountainScript,
  options: PDFOptions,
): PageState {
  let currentState = pageState;

  for (const element of fountainScript.script) {
    switch (element.kind) {
      case "scene":
        currentState = generateSceneInstructions(
          instructions,
          currentState,
          element,
          fountainScript,
          options,
        );
        break;
      case "action":
        currentState = generateActionInstructions(
          instructions,
          currentState,
          element,
          fountainScript,
          options,
        );
        break;
      case "dialogue":
        currentState = generateDialogueInstructions(
          instructions,
          currentState,
          element,
          fountainScript,
          options,
        );
        break;
      case "transition":
        currentState = generateTransitionInstructions(
          instructions,
          currentState,
          element,
          fountainScript,
        );
        break;
      case "synopsis":
        if (!options.hideSynopsis) {
          currentState = generateSynopsisInstructions(
            instructions,
            currentState,
            element,
            fountainScript,
          );
        }
        break;
      case "page-break":
        currentState = emitNewPage(instructions, currentState);
        break;
      case "section":
        // TODO
        break;
    }
  }

  return currentState;
}

/**
 * Generates instructions for title page metadata
 */
function generateTitlePageInstructions(
  instructions: Instruction[],
  pageState: PageState,
  fountainScript: FountainScript,
  options: PDFOptions,
): PageState {
  let currentState = { ...pageState };

  // Separate title page elements by positioning
  const centeredKeys = new Set([
    "title",
    "credit",
    "author",
    "authors",
    "source",
  ]);
  const lowerLeftKeys = new Set(["contact"]);
  const lowerRightKeys = new Set(["draft date"]);

  const centeredElements: { key: string; values: StyledText[] }[] = [];
  const lowerLeftElements: { key: string; values: StyledText[] }[] = [];
  const lowerRightElements: { key: string; values: StyledText[] }[] = [];

  // Categorize title page elements
  for (const element of fountainScript.titlePage) {
    const keyLower = element.key.toLowerCase();
    if (centeredKeys.has(keyLower)) {
      centeredElements.push(element);
    } else if (lowerLeftKeys.has(keyLower)) {
      lowerLeftElements.push(element);
    } else if (lowerRightKeys.has(keyLower)) {
      lowerRightElements.push(element);
    }
  }

  // Generate centered elements
  if (centeredElements.length > 0) {
    currentState = generateCenteredTitleElementInstructions(
      instructions,
      currentState,
      centeredElements,
      fountainScript,
      options,
    );
  }

  // Generate lower-left elements
  if (lowerLeftElements.length > 0) {
    currentState = generateLowerLeftTitleElementInstructions(
      instructions,
      currentState,
      lowerLeftElements,
      fountainScript,
      options,
    );
  }

  // Generate lower-right elements
  if (lowerRightElements.length > 0) {
    currentState = generateLowerRightTitleElementInstructions(
      instructions,
      currentState,
      lowerRightElements,
      fountainScript,
      options,
    );
  }

  // Mark that we're no longer on title page and create new page for script
  currentState.isTitlePage = false;

  // Add new page for the actual script content
  currentState = emitNewPage(instructions, currentState);
  currentState.remainingHeight =
    pageState.pageHeight - pageState.margins.top - pageState.margins.bottom;

  return currentState;
}

/**
 * Generates instructions for centered title page elements
 */
function generateCenteredTitleElementInstructions(
  instructions: Instruction[],
  pageState: PageState,
  elements: { key: string; values: StyledText[] }[],
  fountainScript: FountainScript,
  options: PDFOptions,
): PageState {
  let currentY = getTitlePageCenterStart(pageState.pageHeight);

  for (const element of elements) {
    // Generate instructions for the values (no keys on title page)
    for (const styledText of element.values) {
      const segments = extractStyledSegments(
        styledText,
        fountainScript.document,
        options,
      );
      const wrappedLines = wrapStyledText(
        segments,
        pageState.charactersPerLine.titlePageCenter,
      );

      for (const line of wrappedLines) {
        // Calculate line width for centering
        let lineWidth = 0;
        for (const segment of line) {
          // Estimate width using average character width for Courier
          lineWidth +=
            segment.text.length * getCharacterWidth(pageState.fontSize);
        }

        let x = getTitlePageCenterX(pageState.pageWidth) - lineWidth / 2;

        // Generate instruction for each segment with appropriate styling
        for (const segment of line) {
          if (segment.text.length > 0) {
            x = emitText(
              instructions,
              { ...pageState, currentY },
              {
                data: segment.text,
                x,
                bold: segment.bold || false,
                italic: segment.italic || false,
                underline: segment.underline || false,
                color: segment.color || "black",
                strikethrough: segment.strikethrough || false,
                backgroundColor: segment.backgroundColor,
              },
            );
          }
        }

        currentY -= pageState.lineHeight; // Move down for next line
      }
    }

    // Add spacing between different keys
    currentY -= pageState.lineHeight; // Move down for spacing
  }

  return { ...pageState, currentY };
}

/**
 * Generates instructions for lower-left title page elements
 */
function generateLowerLeftTitleElementInstructions(
  instructions: Instruction[],
  pageState: PageState,
  elements: { key: string; values: StyledText[] }[],
  fountainScript: FountainScript,
  options: PDFOptions,
): PageState {
  // Start from bottom left area
  let currentY = pageState.margins.bottom;

  for (const element of elements) {
    for (const styledText of element.values) {
      const segments = extractStyledSegments(
        styledText,
        fountainScript.document,
        options,
      );
      const wrappedLines = wrapStyledText(
        segments,
        pageState.charactersPerLine.titlePageSides,
      );

      for (const line of wrappedLines) {
        let x = pageState.margins.left;

        for (const segment of line) {
          if (segment.text.length > 0) {
            x = emitText(
              instructions,
              { ...pageState, currentY },
              {
                data: segment.text,
                x,
                bold: segment.bold || false,
                italic: segment.italic || false,
                underline: segment.underline || false,
                color: segment.color || "black",
                strikethrough: segment.strikethrough || false,
                backgroundColor: segment.backgroundColor,
              },
            );
          }
        }

        currentY += pageState.lineHeight; // Move up from bottom
      }
    }

    currentY += pageState.lineHeight; // Add spacing between elements
  }

  return { ...pageState, currentY };
}

/**
 * Generates instructions for lower-right title page elements
 */
function generateLowerRightTitleElementInstructions(
  instructions: Instruction[],
  pageState: PageState,
  elements: { key: string; values: StyledText[] }[],
  fountainScript: FountainScript,
  options: PDFOptions,
): PageState {
  // Start from bottom right area
  let currentY = pageState.margins.bottom;

  for (const element of elements) {
    for (const styledText of element.values) {
      const segments = extractStyledSegments(
        styledText,
        fountainScript.document,
        options,
      );
      const wrappedLines = wrapStyledText(
        segments,
        pageState.charactersPerLine.titlePageSides,
      );

      for (const line of wrappedLines) {
        // Calculate line width for right alignment
        let lineWidth = 0;
        for (const segment of line) {
          lineWidth +=
            segment.text.length * getCharacterWidth(pageState.fontSize);
        }

        let x = pageState.pageWidth - pageState.margins.right - lineWidth;

        for (const segment of line) {
          if (segment.text.length > 0) {
            x = emitText(
              instructions,
              { ...pageState, currentY },
              {
                data: segment.text,
                x,
                bold: segment.bold || false,
                italic: segment.italic || false,
                underline: segment.underline || false,
                color: segment.color || "black",
                strikethrough: segment.strikethrough || false,
                backgroundColor: segment.backgroundColor,
              },
            );
          }
        }

        currentY += pageState.lineHeight; // Move up from bottom
      }
    }

    currentY += pageState.lineHeight; // Add spacing between elements
  }

  return { ...pageState, currentY };
}

/**
 * Generates instructions for a scene heading
 */
function generateSceneInstructions(
  instructions: Instruction[],
  pageState: PageState,
  scene: Scene,
  fountainScript: FountainScript,
  options: PDFOptions,
): PageState {
  // Extract the scene text from the document
  const sceneText = fountainScript.document
    .substring(scene.range.start, scene.range.end)
    .trim()
    .toUpperCase(); // Scene headings are typically uppercase

  // Add spacing before scene heading and ensure we have space
  let currentState = addElementSpacing(pageState);
  currentState = needLines(instructions, currentState, 1);

  // Generate instruction for scene heading
  emitText(instructions, currentState, {
    data: sceneText,
    x: SCENE_HEADING_INDENT,
    bold: options.sceneHeadingBold,
    italic: false,
    underline: false,
    color: "black",
    strikethrough: false,
    backgroundColor: undefined,
  });

  // Update page state
  return {
    ...advanceLine(currentState),
    lastElementType: "scene",
  };
}

/**
 * Generates instructions for a synopsis
 */
function generateSynopsisInstructions(
  instructions: Instruction[],
  pageState: PageState,
  synopsis: Synopsis,
  fountainScript: FountainScript,
): PageState {
  // Add spacing before synopsis and ensure we have space
  let currentState = addElementSpacing(pageState);

  // Extract and render each line of the synopsis
  for (const lineRange of synopsis.linesOfText) {
    const synopsisText = fountainScript.document
      .substring(lineRange.start, lineRange.end)
      .trim();

    if (synopsisText.length > 0) {
      // Wrap synopsis text to fit within action line width
      const wrappedLines = wrapPlainText(
        synopsisText,
        pageState.charactersPerLine.action,
      );

      for (const line of wrappedLines) {
        currentState = needLines(instructions, currentState, 1);

        emitText(instructions, currentState, {
          data: line,
          x: ACTION_INDENT,
          bold: false,
          italic: true, // Synopsis in CourierOblique
          underline: false,
          color: "gray", // Synopsis in gray
          strikethrough: false,
          backgroundColor: undefined,
        });

        currentState = advanceLine(currentState);
      }
    } else {
      // Empty synopsis line
      currentState = needLines(instructions, currentState, 1);
      currentState = advanceLine(currentState);
    }
  }

  return {
    ...currentState,
    lastElementType: "synopsis",
  };
}

/**
 * Generates instructions for an action block
 */
function generateActionInstructions(
  instructions: Instruction[],
  pageState: PageState,
  action: Action,
  fountainScript: FountainScript,
  options: PDFOptions,
): PageState {
  // Extract styled text from all lines in the action block, preserving centering info
  type ActionLineInfo = {
    segments: StyledTextSegment[];
    centered: boolean;
  };

  const actionLines: ActionLineInfo[] = [];

  for (const line of action.lines) {
    if (line.elements.length > 0) {
      const styledSegments = extractStyledSegments(
        line.elements,
        fountainScript.document,
        options,
      );
      const wrappedLines = wrapStyledText(
        styledSegments,
        pageState.charactersPerLine.action,
      );

      // Add each wrapped line with the original centering information
      for (const wrappedLine of wrappedLines) {
        actionLines.push({
          segments: wrappedLine,
          centered: line.centered,
        });
      }
    } else {
      actionLines.push({
        segments: [],
        centered: line.centered,
      });
    }
  }

  // Add spacing before action block and ensure we have space for all lines
  let currentState = addElementSpacing(pageState);
  currentState = needLines(instructions, currentState, actionLines.length);

  // Generate instructions for each line of the action block
  for (const lineInfo of actionLines) {
    // Ensure we have space for this line
    currentState = needLines(instructions, currentState, 1);

    // Generate instructions for the line with styled segments
    if (lineInfo.segments.length > 0) {
      let currentX: number;

      if (lineInfo.centered) {
        // Calculate line width for centering
        let lineWidth = 0;
        for (const segment of lineInfo.segments) {
          lineWidth +=
            segment.text.length * getCharacterWidth(pageState.fontSize);
        }

        // Center the line
        currentX = (pageState.pageWidth - lineWidth) / 2;
      } else {
        // Use standard action indent
        currentX = ACTION_INDENT;
      }

      for (const segment of lineInfo.segments) {
        if (segment.text.length > 0) {
          currentX = emitText(instructions, currentState, {
            data: segment.text,
            x: currentX,
            bold: segment.bold || false,
            italic: segment.italic || false,
            underline: segment.underline || false,
            color: segment.color || "black",
            strikethrough: segment.strikethrough || false,
            backgroundColor: segment.backgroundColor,
          });
        }
      }
    }

    currentState = advanceLine(currentState);
  }

  return {
    ...currentState,
    lastElementType: "action",
  };
}

/**
 * Generates instructions for a dialogue block
 */
function generateDialogueInstructions(
  instructions: Instruction[],
  pageState: PageState,
  dialogue: Dialogue,
  fountainScript: FountainScript,
  options: PDFOptions,
): PageState {
  // Add spacing before dialogue block and ensure space for character name
  let currentState = addElementSpacing(pageState);
  currentState = needLines(instructions, currentState, 1);

  // Extract character name
  const characterName = fountainScript.document
    .substring(dialogue.characterRange.start, dialogue.characterRange.end)
    .trim()
    .toUpperCase();

  // Extract character extensions if they exist
  let characterExtensions = "";
  if (
    dialogue.characterExtensionsRange.start !==
    dialogue.characterExtensionsRange.end
  ) {
    characterExtensions = fountainScript.document
      .substring(
        dialogue.characterExtensionsRange.start,
        dialogue.characterExtensionsRange.end,
      )
      .trim();
  }

  const fullCharacterLine = characterName + characterExtensions;

  // Generate instruction for character name
  emitText(instructions, currentState, {
    data: fullCharacterLine,
    x: CHARACTER_INDENT,
    bold: false,
    italic: false,
    underline: false,
    color: "black",
    strikethrough: false,
    backgroundColor: undefined,
  });
  currentState = advanceLine(currentState);

  // Generate instructions for parenthetical if it exists
  if (dialogue.parenthetical) {
    const parentheticalText = fountainScript.document
      .substring(dialogue.parenthetical.start, dialogue.parenthetical.end)
      .trim();

    const wrappedParentheticals = wrapPlainText(
      parentheticalText,
      pageState.charactersPerLine.parenthetical,
    );

    for (const parentheticalLine of wrappedParentheticals) {
      currentState = needLines(instructions, currentState, 1);

      emitText(instructions, currentState, {
        data: parentheticalLine,
        x: PARENTHETICAL_INDENT,
        bold: false,
        italic: false,
        underline: false,
        color: "black",
        strikethrough: false,
        backgroundColor: undefined,
      });
      currentState = advanceLine(currentState);
    }
  }

  // Generate instructions for dialogue lines
  for (const line of dialogue.lines) {
    if (line.elements.length > 0) {
      const styledSegments = extractStyledSegments(
        line.elements,
        fountainScript.document,
        options,
      );
      const wrappedLines = wrapStyledText(
        styledSegments,
        pageState.charactersPerLine.dialogue,
      );

      for (const wrappedLine of wrappedLines) {
        currentState = needLines(instructions, currentState, 1);

        if (wrappedLine.length > 0) {
          let currentX = DIALOGUE_INDENT;
          for (const segment of wrappedLine) {
            if (segment.text.length > 0) {
              currentX = emitText(instructions, currentState, {
                data: segment.text,
                x: currentX,
                bold: segment.bold || false,
                italic: segment.italic || false,
                underline: segment.underline || false,
                color: segment.color || "black",
                strikethrough: segment.strikethrough || false,
                backgroundColor: segment.backgroundColor,
              });
            }
          }
        }
        currentState = advanceLine(currentState);
      }
    } else {
      currentState = needLines(instructions, currentState, 1);
      currentState = advanceLine(currentState);
    }
  }

  return {
    ...currentState,
    lastElementType: "dialogue",
  };
}

/**
 * Generates instructions for a transition
 */
function generateTransitionInstructions(
  instructions: Instruction[],
  pageState: PageState,
  transition: Transition,
  fountainScript: FountainScript,
): PageState {
  // Extract the transition text from the document
  const transitionText = extractTransitionText(
    transition,
    fountainScript,
  ).toUpperCase();

  // Add spacing before transition and ensure we have space
  let currentState = addElementSpacing(pageState);
  currentState = needLines(instructions, currentState, 1);

  // Calculate right-aligned position
  const textWidth =
    transitionText.length * getCharacterWidth(pageState.fontSize);
  const rightAlignedX =
    pageState.pageWidth - pageState.margins.right - textWidth;

  // Generate instruction for transition
  emitText(instructions, currentState, {
    data: transitionText,
    x: rightAlignedX,
    bold: false,
    italic: false,
    underline: false,
    color: "black",
    strikethrough: false,
    backgroundColor: undefined,
  });

  return {
    ...advanceLine(currentState),
    lastElementType: "transition",
  };
}

/**
 * Executes instructions to create the final PDF document
 */
export async function renderInstructionsToPDF(
  instructions: Instruction[],
  options: PDFOptions = {
    sceneHeadingBold: false,
    paperSize: "letter",
    hideNotes: true,
    hideSynopsis: false,
  },
): Promise<PDFDocument> {
  const pdfDoc = await PDFDocument.create();

  // Embed Courier font variants
  const courierFont = await pdfDoc.embedFont(StandardFonts.Courier);
  const courierBoldFont = await pdfDoc.embedFont(StandardFonts.CourierBold);
  const courierObliqueFont = await pdfDoc.embedFont(
    StandardFonts.CourierOblique,
  );
  const courierBoldObliqueFont = await pdfDoc.embedFont(
    StandardFonts.CourierBoldOblique,
  );

  let currentPage: PDFPage | null = null;

  for (const instruction of instructions) {
    switch (instruction.type) {
      case "new-page":
        currentPage = pdfDoc.addPage([instruction.width, instruction.height]);
        break;

      case "text": {
        if (!currentPage) {
          throw new Error(
            "Text instruction encountered without a current page",
          );
        }

        // Select appropriate font
        let font = courierFont;
        if (instruction.bold && instruction.italic) {
          font = courierBoldObliqueFont;
        } else if (instruction.bold) {
          font = courierBoldFont;
        } else if (instruction.italic) {
          font = courierObliqueFont;
        }

        // Determine text color
        const colorRgb = rgbOfColor(instruction.color);
        const textColor = rgb(colorRgb.r, colorRgb.g, colorRgb.b);

        // Draw background highlight if specified
        if (instruction.backgroundColor) {
          const bgColorRgb = rgbOfColor(instruction.backgroundColor);
          const bgColor = rgb(bgColorRgb.r, bgColorRgb.g, bgColorRgb.b);
          const textWidth = font.widthOfTextAtSize(instruction.data, FONT_SIZE);

          currentPage.drawRectangle({
            x: instruction.x,
            y: instruction.y - 1,
            width: textWidth,
            height: FONT_SIZE - 2,
            color: bgColor,
          });
        }

        // Render text
        currentPage.drawText(instruction.data, {
          x: instruction.x,
          y: instruction.y,
          size: FONT_SIZE,
          font,
          color: textColor,
        });

        // Handle underline if needed
        if (instruction.underline) {
          const textWidth = font.widthOfTextAtSize(instruction.data, FONT_SIZE);
          currentPage.drawLine({
            start: { x: instruction.x, y: instruction.y - 2 },
            end: { x: instruction.x + textWidth, y: instruction.y - 2 },
            thickness: 1,
            color: textColor,
          });
        }

        // Handle strikethrough if needed
        if (instruction.strikethrough) {
          const textWidth = font.widthOfTextAtSize(instruction.data, FONT_SIZE);
          currentPage.drawLine({
            start: { x: instruction.x, y: instruction.y + FONT_SIZE / 3 },
            end: {
              x: instruction.x + textWidth,
              y: instruction.y + FONT_SIZE / 3,
            },
            thickness: 1,
            color: textColor,
          });
        }
        break;
      }
    }
  }

  return pdfDoc;
}

/**
 * Extracts styled text segments from line elements, preserving formatting information
 */
function extractStyledSegments(
  elements: TextElementWithNotesAndBoneyard[],
  document: string,
  options: PDFOptions,
): StyledTextSegment[] {
  const segments: StyledTextSegment[] = [];

  for (const element of elements) {
    switch (element.kind) {
      case "text":
        segments.push({
          text: document.substring(element.range.start, element.range.end),
        });
        break;
      case "bold": {
        const boldSegments = extractStyledSegments(
          element.elements,
          document,
          options,
        );
        segments.push(...boldSegments.map((seg) => ({ ...seg, bold: true })));
        break;
      }
      case "italics": {
        const italicSegments = extractStyledSegments(
          element.elements,
          document,
          options,
        );
        segments.push(
          ...italicSegments.map((seg) => ({ ...seg, italic: true })),
        );
        break;
      }
      case "underline": {
        const underlineSegments = extractStyledSegments(
          element.elements,
          document,
          options,
        );
        segments.push(
          ...underlineSegments.map((seg) => ({ ...seg, underline: true })),
        );
        break;
      }
      case "note":
        // Include notes if they should be shown
        if (
          !options.hideNotes &&
          !element.noteKind.startsWith("[[") &&
          !element.noteKind.startsWith("/*")
        ) {
          // Add leading space
          segments.push({
            text: " ",
          });

          const noteText = document.substring(
            element.textRange.start,
            element.textRange.end,
          );

          // Handle different note kinds
          switch (element.noteKind) {
            case "+":
              segments.push({
                text: noteText,
                italic: false,
                color: "green",
              });
              break;
            case "-":
              segments.push({
                text: noteText,
                italic: false,
                color: "red",
                strikethrough: true,
              });
              break;
            case "todo":
              segments.push({
                text: `TODO: ${noteText}`,
                italic: true,
                color: "gray",
                backgroundColor: "yellow",
              });
              break;
            case "":
              // Empty note kind - just the text
              segments.push({
                text: noteText,
                italic: true,
                color: "gray",
              });
              break;
            default:
              // Other note kinds - include the kind as prefix
              segments.push({
                text: `${element.noteKind}: ${noteText}`,
                italic: true,
                color: "gray",
              });
              break;
          }

          // Add trailing space
          segments.push({
            text: " ",
          });
        }
        break;
      case "boneyard":
        // Skip boneyard content for PDF output
        break;
    }
  }

  return segments;
}

/**
 * Wraps styled text segments to fit within specified character limit while preserving styling
 */
function wrapStyledText(
  segments: StyledTextSegment[],
  maxChars: number,
): StyledTextSegment[][] {
  if (segments.length === 0) {
    return [[]];
  }

  const lines: StyledTextSegment[][] = [];
  let currentLine: StyledTextSegment[] = [];
  let currentLineLength = 0;

  for (const segment of segments) {
    const words = segment.text.split(/(\s+)/); // Split on whitespace but keep separators

    for (const word of words) {
      if (word.length === 0) continue;

      // Handle very long words
      if (word.length > maxChars) {
        // Finish current line if it has content
        if (currentLine.length > 0) {
          lines.push(currentLine);
          currentLine = [];
          currentLineLength = 0;
        }

        // Split long word into chunks
        for (let i = 0; i < word.length; i += maxChars) {
          const chunk = word.substring(i, i + maxChars);
          lines.push([{ ...segment, text: chunk }]);
        }
        continue;
      }

      // Check if adding this word would exceed the limit
      if (
        currentLineLength + word.length > maxChars &&
        currentLine.length > 0
      ) {
        // Start new line
        lines.push(currentLine);
        currentLine = [];
        currentLineLength = 0;
      }

      // Add word to current line
      if (word.trim().length > 0 || currentLine.length > 0) {
        // Don't start lines with whitespace
        currentLine.push({ ...segment, text: word });
        currentLineLength += word.length;
      }
    }
  }

  // Add the last line if it has content
  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [[]];
}

/**
 * Simple text wrapping for plain text (used for parentheticals)
 */
function wrapPlainText(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) {
    return [text];
  }

  const lines: string[] = [];
  const words = text.split(/(\s+)/); // Split on whitespace but keep separators
  let currentLine = "";

  for (const word of words) {
    if (word.length === 0) continue;

    // Handle very long words
    if (word.length > maxChars) {
      // Finish current line if it has content
      if (currentLine.length > 0) {
        lines.push(currentLine.trim());
        currentLine = "";
      }

      // Split long word into chunks
      for (let i = 0; i < word.length; i += maxChars) {
        const chunk = word.substring(i, i + maxChars);
        lines.push(chunk);
      }
      continue;
    }

    // Check if adding this word would exceed the limit
    if (currentLine.length + word.length > maxChars && currentLine.length > 0) {
      // Start new line
      lines.push(currentLine.trim());
      currentLine = "";
    }

    // Add word to current line
    if (word.trim().length > 0 || currentLine.length > 0) {
      // Don't start lines with whitespace
      currentLine += word;
    }
  }

  // Add the last line if it has content
  if (currentLine.length > 0) {
    lines.push(currentLine.trim());
  }

  return lines.length > 0 ? lines : [""];
}
