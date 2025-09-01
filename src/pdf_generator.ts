import { PDFDocument, type PDFPage, StandardFonts, rgb } from "pdf-lib";
import type {
  Action,
  Dialogue,
  FountainScript,
  Scene,
  StyledText,
  TextElementWithNotesAndBoneyard,
  Transition,
} from "./fountain";
import type { PDFOptions } from "./pdf_options_dialog";

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
}

// Type for tracking styled text segments during rendering
type StyledTextSegment = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
};

// Page layout constants (all measurements in PDF points - 1/72 inch)
const FONT_SIZE = 12;
const LINE_HEIGHT = 12; // Single spacing

// Page dimensions based on paper size
const PAPER_SIZES = {
  letter: { width: 612, height: 792 }, // 8.5" × 11" in points
  a4: { width: 595.28, height: 841.89 }, // 210 × 297 mm in points
};

// Margins in points
const MARGIN_TOP = 72; // 1"
const MARGIN_BOTTOM = 72; // 1"
const MARGIN_LEFT = 90; // 1.25"
const MARGIN_RIGHT = 72; // 1"

// Element positions (from left edge)
const SCENE_HEADING_INDENT = 126; // 1.75"
const ACTION_INDENT = 126; // 1.75"
const CHARACTER_INDENT = 306; // ~4.25" (centered)
const DIALOGUE_INDENT = 198; // 2.75"
const PARENTHETICAL_INDENT = 252; // 3.5"
const TRANSITION_INDENT = 522; // Right-aligned to 7.25" (PAGE_WIDTH - 90)

// Title page positioning (calculated dynamically based on page height)
function getTitlePageCenterStart(pageHeight: number): number {
  return pageHeight * 0.4;
}

function getTitlePageCenterX(pageWidth: number): number {
  return pageWidth / 2;
}

// Page state type for tracking position and layout
type PageState = {
  // Vertical position tracking (measured from top of page)
  currentY: number; // Current vertical position (points from top)
  remainingHeight: number; // Remaining usable height on current page

  // Page information
  pageNumber: number; // Current page number (1-based)
  pageWidth: number; // Current page width
  pageHeight: number; // Current page height
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
  });

  // Note: this is the exact width of a courier font character (validated externally)
  return options.x + options.data.length * (pageState.fontSize * 0.6);
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
  options: PDFOptions = { sceneHeadingBold: false, paperSize: "letter" },
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
  options: PDFOptions = { sceneHeadingBold: false, paperSize: "letter" },
): Instruction[] {
  const instructions: Instruction[] = [];
  const paperSize = PAPER_SIZES[options.paperSize];

  // Initialize page state (using PDF coordinates - bottom-left origin)
  let currentState: PageState = {
    currentY: paperSize.height - MARGIN_TOP, // Start at top margin in PDF coords
    remainingHeight: paperSize.height - MARGIN_TOP - MARGIN_BOTTOM,
    pageNumber: 1,
    pageWidth: paperSize.width,
    pageHeight: paperSize.height,
    isTitlePage: true,
    margins: {
      top: MARGIN_TOP,
      bottom: MARGIN_BOTTOM,
      left: MARGIN_LEFT,
      right: MARGIN_RIGHT,
    },
    fontSize: FONT_SIZE,
    lineHeight: LINE_HEIGHT,
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

  // Generate script instructions
  generateScriptInstructions(
    instructions,
    currentState,
    fountainScript,
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
        );
        break;
      case "dialogue":
        currentState = generateDialogueInstructions(
          instructions,
          currentState,
          element,
          fountainScript,
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
      case "section":
      case "page-break":
        // TODO: Phase 3 - implement advanced elements
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
    );
  }

  // Generate lower-left elements
  if (lowerLeftElements.length > 0) {
    currentState = generateLowerLeftTitleElementInstructions(
      instructions,
      currentState,
      lowerLeftElements,
      fountainScript,
    );
  }

  // Generate lower-right elements
  if (lowerRightElements.length > 0) {
    currentState = generateLowerRightTitleElementInstructions(
      instructions,
      currentState,
      lowerRightElements,
      fountainScript,
    );
  }

  // Mark that we're no longer on title page and create new page for script
  currentState.isTitlePage = false;

  // Add new page for the actual script content
  currentState = emitNewPage(instructions, currentState);
  currentState.remainingHeight =
    pageState.pageHeight - MARGIN_TOP - MARGIN_BOTTOM;

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
): PageState {
  let currentY = getTitlePageCenterStart(pageState.pageHeight);

  for (const element of elements) {
    // Generate instructions for the values (no keys on title page)
    for (const styledText of element.values) {
      const segments = extractStyledSegments(
        styledText,
        fountainScript.document,
      );
      const wrappedLines = wrapStyledText(segments, 60); // Max 60 chars for title page

      for (const line of wrappedLines) {
        // Calculate line width for centering
        let lineWidth = 0;
        for (const segment of line) {
          // Estimate width using average character width for Courier
          lineWidth += segment.text.length * (pageState.fontSize * 0.6);
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
): PageState {
  // Start from bottom left area
  let currentY = MARGIN_BOTTOM;

  for (const element of elements) {
    for (const styledText of element.values) {
      const segments = extractStyledSegments(
        styledText,
        fountainScript.document,
      );
      const wrappedLines = wrapStyledText(segments, 55);

      for (const line of wrappedLines) {
        let x = MARGIN_LEFT;

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
): PageState {
  // Start from bottom right area
  let currentY = MARGIN_BOTTOM;

  for (const element of elements) {
    for (const styledText of element.values) {
      const segments = extractStyledSegments(
        styledText,
        fountainScript.document,
      );
      const wrappedLines = wrapStyledText(segments, 55);

      for (const line of wrappedLines) {
        // Calculate line width for right alignment
        let lineWidth = 0;
        for (const segment of line) {
          lineWidth += segment.text.length * (pageState.fontSize * 0.6);
        }

        let x = pageState.pageWidth - MARGIN_RIGHT - lineWidth;

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
  });

  // Update page state
  return {
    ...advanceLine(currentState),
    lastElementType: "scene",
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
): PageState {
  // Extract styled text from all lines in the action block
  const actionLines: StyledTextSegment[][] = [];

  for (const line of action.lines) {
    if (line.elements.length > 0) {
      const styledSegments = extractStyledSegments(
        line.elements,
        fountainScript.document,
      );
      const wrappedLines = wrapStyledText(styledSegments, 62);
      actionLines.push(...wrappedLines);
    } else {
      actionLines.push([]);
    }
  }

  // Add spacing before action block and ensure we have space for all lines
  let currentState = addElementSpacing(pageState);
  currentState = needLines(instructions, currentState, actionLines.length);

  // Generate instructions for each line of the action block
  for (const line of actionLines) {
    // Ensure we have space for this line
    currentState = needLines(instructions, currentState, 1);

    // Generate instructions for the line with styled segments
    if (line.length > 0) {
      let currentX = ACTION_INDENT;
      for (const segment of line) {
        if (segment.text.length > 0) {
          currentX = emitText(instructions, currentState, {
            data: segment.text,
            x: currentX,
            bold: segment.bold || false,
            italic: segment.italic || false,
            underline: segment.underline || false,
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
  });
  currentState = advanceLine(currentState);

  // Generate instructions for parenthetical if it exists
  if (dialogue.parenthetical) {
    const parentheticalText = fountainScript.document
      .substring(dialogue.parenthetical.start, dialogue.parenthetical.end)
      .trim();

    const wrappedParentheticals = wrapPlainText(parentheticalText, 16);

    for (const parentheticalLine of wrappedParentheticals) {
      currentState = needLines(instructions, currentState, 1);

      emitText(instructions, currentState, {
        data: parentheticalLine,
        x: PARENTHETICAL_INDENT,
        bold: false,
        italic: false,
        underline: false,
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
      );
      const wrappedLines = wrapStyledText(styledSegments, 35);

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
  const transitionText = fountainScript.document
    .substring(transition.range.start, transition.range.end)
    .trim()
    .toUpperCase();

  // Add spacing before transition and ensure we have space
  let currentState = addElementSpacing(pageState);
  currentState = needLines(instructions, currentState, 1);

  // Calculate right-aligned position
  const textWidth = transitionText.length * (pageState.fontSize * 0.6);
  const rightAlignedX = TRANSITION_INDENT - textWidth;

  // Generate instruction for transition
  emitText(instructions, currentState, {
    data: transitionText,
    x: rightAlignedX,
    bold: false,
    italic: false,
    underline: false,
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
  options: PDFOptions = { sceneHeadingBold: false, paperSize: "letter" },
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

        // Render text
        currentPage.drawText(instruction.data, {
          x: instruction.x,
          y: instruction.y,
          size: FONT_SIZE,
          font,
          color: rgb(0, 0, 0),
        });

        // Handle underline if needed
        if (instruction.underline) {
          const textWidth = font.widthOfTextAtSize(instruction.data, FONT_SIZE);
          currentPage.drawLine({
            start: { x: instruction.x, y: instruction.y - 2 },
            end: { x: instruction.x + textWidth, y: instruction.y - 2 },
            thickness: 1,
            color: rgb(0, 0, 0),
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
        const boldSegments = extractStyledSegments(element.elements, document);
        segments.push(...boldSegments.map((seg) => ({ ...seg, bold: true })));
        break;
      }
      case "italics": {
        const italicSegments = extractStyledSegments(
          element.elements,
          document,
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
        );
        segments.push(
          ...underlineSegments.map((seg) => ({ ...seg, underline: true })),
        );
        break;
      }
      case "note":
      case "boneyard":
        // Skip notes and boneyard content for PDF output
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
