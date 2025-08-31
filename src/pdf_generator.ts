import {
  PDFDocument,
  type PDFFont,
  type PDFPage,
  StandardFonts,
  rgb,
} from "pdf-lib";
import type {
  Action,
  Dialogue,
  FountainScript,
  Scene,
  StyledText,
  TextElementWithNotesAndBoneyard,
  Transition,
} from "./fountain";

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
const PAGE_WIDTH = 612; // 8.5" in points
const PAGE_HEIGHT = 792; // 11" in points

// Margins in points
const MARGIN_TOP = 72; // 1"
const MARGIN_BOTTOM = 72; // 1"
const MARGIN_LEFT = 90; // 1.25"
const MARGIN_RIGHT = 72; // 1"

// Element positions (from left edge) - Phase 2 implementation
// const SCENE_NUMBER_INDENT = 90; // 1.25" - TODO: Use when implementing scene numbers
const SCENE_HEADING_INDENT = 126; // 1.75"
const ACTION_INDENT = 126; // 1.75"
const CHARACTER_INDENT = 306; // ~4.25" (centered)
const DIALOGUE_INDENT = 198; // 2.75"
const PARENTHETICAL_INDENT = 252; // 3.5"
const TRANSITION_INDENT = 522; // Right-aligned to 7.25" (PAGE_WIDTH - 90)

// Title page positioning
const TITLE_PAGE_CENTER_START = 475.2; // ~40% down from top (PAGE_HEIGHT - PAGE_HEIGHT * 0.4)
const TITLE_PAGE_CENTER_X = 306; // Page center (PAGE_WIDTH / 2)

// Page state type for tracking position and layout
type PageState = {
  // Vertical position tracking
  currentY: number; // Current vertical position (points from top)
  remainingHeight: number; // Remaining usable height on current page

  // Page information
  pageNumber: number; // Current page number (1-based)
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
  font: PDFFont; // Base Courier font
  boldFont: PDFFont; // Bold Courier font
  italicFont: PDFFont; // Italic Courier font
  boldItalicFont: PDFFont; // Bold italic Courier font

  // Element spacing
  lastElementType: string | null; // Type of previous element for spacing rules
  pendingSpacing: number; // Additional spacing needed before next element
};

/**
 * Main entry point for PDF generation
 * Converts a FountainScript AST into a properly formatted PDF document
 */
export async function generatePDF(
  fountainScript: FountainScript,
): Promise<PDFDocument> {
  // Create new PDF document
  const pdfDoc = await PDFDocument.create();

  // Embed Courier font variants (essential for proper screenplay formatting)
  const courierFont = await pdfDoc.embedFont(StandardFonts.Courier);
  const courierBoldFont = await pdfDoc.embedFont(StandardFonts.CourierBold);
  const courierObliqueFont = await pdfDoc.embedFont(
    StandardFonts.CourierOblique,
  );
  const courierBoldObliqueFont = await pdfDoc.embedFont(
    StandardFonts.CourierBoldOblique,
  );

  // Create first page
  pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

  // Initialize page state
  let currentState: PageState = {
    currentY: PAGE_HEIGHT - MARGIN_TOP,
    remainingHeight: PAGE_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM,
    pageNumber: 1,
    isTitlePage: true,
    margins: {
      top: MARGIN_TOP,
      bottom: MARGIN_BOTTOM,
      left: MARGIN_LEFT,
      right: MARGIN_RIGHT,
    },
    fontSize: FONT_SIZE,
    lineHeight: LINE_HEIGHT,
    font: courierFont,
    boldFont: courierBoldFont,
    italicFont: courierObliqueFont,
    boldItalicFont: courierBoldObliqueFont,
    lastElementType: null,
    pendingSpacing: 0,
  };

  // Phase 3: Render title page if it exists
  if (fountainScript.titlePage.length > 0) {
    currentState = await renderTitlePage(pdfDoc, currentState, fountainScript);
  } else {
    currentState = { ...currentState, isTitlePage: false, pageNumber: 1 };
  }

  // Phase 2: Render the actual script elements
  await renderScript(pdfDoc, currentState, fountainScript);

  return pdfDoc;
}

/**
 * Phase 2: Core rendering functions for script elements
 */

/**
 * Renders the entire script by iterating through all elements
 */
async function renderScript(
  doc: PDFDocument,
  pageState: PageState,
  fountainScript: FountainScript,
): Promise<PageState> {
  let currentState = pageState;

  for (const element of fountainScript.script) {
    switch (element.kind) {
      case "scene":
        currentState = await renderScene(
          doc,
          currentState,
          element,
          fountainScript,
        );
        break;
      case "action":
        currentState = await renderAction(
          doc,
          currentState,
          element,
          fountainScript,
        );
        break;
      case "dialogue":
        currentState = await renderDialogue(
          doc,
          currentState,
          element,
          fountainScript,
        );
        break;
      case "transition":
        currentState = await renderTransition(
          doc,
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
 * Phase 3: Title page generation
 * Renders title page metadata according to Fountain specifications
 */
async function renderTitlePage(
  doc: PDFDocument,
  pageState: PageState,
  fountainScript: FountainScript,
): Promise<PageState> {
  const page = doc.getPages()[doc.getPageCount() - 1];
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
    // Ignore all other keys as per specification
  }

  // Render centered elements
  if (centeredElements.length > 0) {
    currentState = await renderCenteredTitleElements(
      page,
      currentState,
      centeredElements,
      fountainScript,
    );
  }

  // Render lower-left elements
  if (lowerLeftElements.length > 0) {
    currentState = await renderLowerLeftTitleElements(
      page,
      currentState,
      lowerLeftElements,
      fountainScript,
    );
  }

  // Render lower-right elements
  if (lowerRightElements.length > 0) {
    currentState = await renderLowerRightTitleElements(
      page,
      currentState,
      lowerRightElements,
      fountainScript,
    );
  }

  // Mark that we're no longer on title page and create new page for script
  currentState.isTitlePage = false;
  currentState.pageNumber = 2;

  // Add new page for the actual script content
  doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  currentState.currentY = PAGE_HEIGHT - MARGIN_TOP;
  currentState.remainingHeight = PAGE_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM;

  return currentState;
}

/**
 * Renders centered title page elements (title, credit, author, source)
 */
async function renderCenteredTitleElements(
  page: PDFPage,
  pageState: PageState,
  elements: { key: string; values: StyledText[] }[],
  fountainScript: FountainScript,
): Promise<PageState> {
  let currentY = TITLE_PAGE_CENTER_START;

  for (const element of elements) {
    // Render the values (no keys on title page)
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
          const font = selectFont(pageState, segment);
          lineWidth += font.widthOfTextAtSize(segment.text, pageState.fontSize);
        }

        let x = TITLE_PAGE_CENTER_X - lineWidth / 2;

        // Draw each segment with appropriate styling
        for (const segment of line) {
          const font = selectFont(pageState, segment);

          page.drawText(segment.text, {
            x,
            y: currentY,
            size: pageState.fontSize,
            font,
            color: rgb(0, 0, 0),
          });

          // Handle underline
          if (segment.underline) {
            const textWidth = font.widthOfTextAtSize(
              segment.text,
              pageState.fontSize,
            );
            page.drawLine({
              start: { x, y: currentY - 2 },
              end: { x: x + textWidth, y: currentY - 2 },
              thickness: 1,
              color: rgb(0, 0, 0),
            });
          }

          x += font.widthOfTextAtSize(segment.text, pageState.fontSize);
        }

        currentY -= pageState.lineHeight;
      }
    }

    // Add spacing between different keys
    currentY -= pageState.lineHeight;
  }

  return { ...pageState, currentY };
}

/**
 * Renders lower-left title page elements (contact, draft date)
 */
async function renderLowerLeftTitleElements(
  page: PDFPage,
  pageState: PageState,
  elements: { key: string; values: StyledText[] }[],
  fountainScript: FountainScript,
): Promise<PageState> {
  // Calculate total height needed for all elements
  let totalHeight = 0;
  for (const element of elements) {
    for (const styledText of element.values) {
      const segments = extractStyledSegments(
        styledText,
        fountainScript.document,
      );
      const wrappedLines = wrapStyledText(segments, 55);
      totalHeight += wrappedLines.length * pageState.lineHeight;
    }
    totalHeight += pageState.lineHeight; // spacing between elements
  }

  // Start from bottom margin and work upward
  let currentY = MARGIN_BOTTOM + totalHeight;

  for (const element of elements) {
    // Render the values (no keys on title page)
    for (const styledText of element.values) {
      const segments = extractStyledSegments(
        styledText,
        fountainScript.document,
      );
      const wrappedLines = wrapStyledText(segments, 55); // Max ~55 chars for lower-left

      for (const line of wrappedLines) {
        let x = MARGIN_LEFT;

        // Draw each segment with appropriate styling
        for (const segment of line) {
          const font = selectFont(pageState, segment);

          page.drawText(segment.text, {
            x,
            y: currentY,
            size: pageState.fontSize,
            font,
            color: rgb(0, 0, 0),
          });

          // Handle underline
          if (segment.underline) {
            const textWidth = font.widthOfTextAtSize(
              segment.text,
              pageState.fontSize,
            );
            page.drawLine({
              start: { x, y: currentY - 2 },
              end: { x: x + textWidth, y: currentY - 2 },
              thickness: 1,
              color: rgb(0, 0, 0),
            });
          }

          x += font.widthOfTextAtSize(segment.text, pageState.fontSize);
        }

        currentY -= pageState.lineHeight;
      }
    }

    // Add spacing between different keys
    currentY -= pageState.lineHeight;
  }

  return { ...pageState, currentY };
}

/**
 * Renders lower-right title page elements (draft date)
 */
async function renderLowerRightTitleElements(
  page: PDFPage,
  pageState: PageState,
  elements: { key: string; values: StyledText[] }[],
  fountainScript: FountainScript,
): Promise<PageState> {
  // Calculate total height needed for all elements
  let totalHeight = 0;
  for (const element of elements) {
    for (const styledText of element.values) {
      const segments = extractStyledSegments(
        styledText,
        fountainScript.document,
      );
      const wrappedLines = wrapStyledText(segments, 55);
      totalHeight += wrappedLines.length * pageState.lineHeight;
    }
    totalHeight += pageState.lineHeight; // spacing between elements
  }

  // Start from bottom margin and work upward
  let currentY = MARGIN_BOTTOM + totalHeight;

  for (const element of elements) {
    // Render the values (no keys on title page)
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
          const font = selectFont(pageState, segment);
          lineWidth += font.widthOfTextAtSize(segment.text, pageState.fontSize);
        }

        let x = PAGE_WIDTH - MARGIN_RIGHT - lineWidth;

        // Draw each segment with appropriate styling
        for (const segment of line) {
          const font = selectFont(pageState, segment);

          page.drawText(segment.text, {
            x,
            y: currentY,
            size: pageState.fontSize,
            font,
            color: rgb(0, 0, 0),
          });

          // Handle underline
          if (segment.underline) {
            const textWidth = font.widthOfTextAtSize(
              segment.text,
              pageState.fontSize,
            );
            page.drawLine({
              start: { x, y: currentY - 2 },
              end: { x: x + textWidth, y: currentY - 2 },
              thickness: 1,
              color: rgb(0, 0, 0),
            });
          }

          x += font.widthOfTextAtSize(segment.text, pageState.fontSize);
        }

        currentY -= pageState.lineHeight;
      }
    }

    // Add spacing between different keys
    currentY -= pageState.lineHeight;
  }

  return { ...pageState, currentY };
}

/**
 * Renders a scene heading with proper positioning and formatting
 */
async function renderScene(
  doc: PDFDocument,
  pageState: PageState,
  scene: Scene,
  fountainScript: FountainScript,
): Promise<PageState> {
  // Extract the scene text from the document
  const sceneText = fountainScript.document
    .substring(scene.range.start, scene.range.end)
    .trim()
    .toUpperCase(); // Scene headings are typically uppercase

  // Get the current page
  const currentPage = doc.getPages()[doc.getPageCount() - 1];

  // Add spacing before scene heading if there was a previous element
  let newY = pageState.currentY;
  if (pageState.lastElementType !== null) {
    newY -= pageState.lineHeight; // Single line spacing before scene
  }

  // Check if we need a page break (simplified logic for Phase 2)
  if (newY - pageState.lineHeight < pageState.margins.bottom) {
    // Create new page
    doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    newY = PAGE_HEIGHT - pageState.margins.top;
  }

  // Render the scene heading (always use base font for scene headings)
  currentPage.drawText(sceneText, {
    x: SCENE_HEADING_INDENT,
    y: newY,
    size: pageState.fontSize,
    font: pageState.boldFont,
    color: rgb(0, 0, 0),
  });

  // Update page state
  return {
    ...pageState,
    currentY: newY - pageState.lineHeight,
    lastElementType: "scene",
    pendingSpacing: 0,
  };
}

/**
 * Renders an action block with proper text wrapping and positioning
 */
async function renderAction(
  doc: PDFDocument,
  pageState: PageState,
  action: Action,
  fountainScript: FountainScript,
): Promise<PageState> {
  // Extract styled text from all lines in the action block
  const actionLines: StyledTextSegment[][] = [];

  for (const line of action.lines) {
    if (line.elements.length > 0) {
      // Extract styled text segments from the line elements
      const styledSegments = extractStyledSegments(
        line.elements,
        fountainScript.document,
      );
      // Wrap styled segments to fit within action block width (max ~55 characters)
      const wrappedLines = wrapStyledText(styledSegments, 55);
      actionLines.push(...wrappedLines);
    } else {
      // Empty line - preserve spacing
      actionLines.push([]);
    }
  }

  // Get the current page
  let currentPage = doc.getPages()[doc.getPageCount() - 1];
  let currentY = pageState.currentY;

  // Add spacing before action block if there was a previous element
  if (pageState.lastElementType !== null) {
    currentY -= pageState.lineHeight; // Single line spacing before action
  }

  // Render each line of the action block
  for (let i = 0; i < actionLines.length; i++) {
    const line = actionLines[i];

    // Check if we need a page break
    if (currentY - pageState.lineHeight < pageState.margins.bottom) {
      // Create new page
      doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      currentPage = doc.getPages()[doc.getPageCount() - 1];
      currentY = PAGE_HEIGHT - pageState.margins.top;
    }

    // Render the line with styled segments
    if (line.length > 0) {
      let currentX = ACTION_INDENT;
      for (const segment of line) {
        if (segment.text.length > 0) {
          // Select appropriate font based on styling
          const selectedFont = selectFont(pageState, segment);

          // Render the text with appropriate font
          currentPage.drawText(segment.text, {
            x: currentX,
            y: currentY,
            size: pageState.fontSize,
            font: selectedFont,
            color: rgb(0, 0, 0),
          });

          // Draw underline if needed
          if (segment.underline) {
            const textWidth = selectedFont.widthOfTextAtSize(
              segment.text,
              pageState.fontSize,
            );
            const underlineY = currentY - 2; // Position underline slightly below baseline
            currentPage.drawLine({
              start: { x: currentX, y: underlineY },
              end: { x: currentX + textWidth, y: underlineY },
              thickness: 1,
              color: rgb(0, 0, 0),
            });
          }

          // Calculate text width to position next segment
          const textWidth = selectedFont.widthOfTextAtSize(
            segment.text,
            pageState.fontSize,
          );
          currentX += textWidth;
        }
      }
    }

    // Move to next line
    currentY -= pageState.lineHeight;
  }

  // Update page state
  return {
    ...pageState,
    currentY: currentY,
    lastElementType: "action",
    pendingSpacing: 0,
  };
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
 * Selects the appropriate font based on styling flags
 */
function selectFont(pageState: PageState, segment: StyledTextSegment): PDFFont {
  if (segment.bold && segment.italic) {
    return pageState.boldItalicFont;
  }
  if (segment.bold) {
    return pageState.boldFont;
  }
  if (segment.italic) {
    return pageState.italicFont;
  }
  return pageState.font;
}

// Utility functions for page management - TODO: Use these when implementing advanced page break logic
// function createNewPage(doc: PDFDocument, pageState: PageState): PageState {
//   const newPage = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
//   return {
//     ...pageState,
//     currentY: PAGE_HEIGHT - pageState.margins.top,
//     remainingHeight:
//       PAGE_HEIGHT - pageState.margins.top - pageState.margins.bottom,
//     pageNumber: pageState.pageNumber + 1,
//     isTitlePage: false,
//     lastElementType: null,
//     pendingSpacing: 0,
//   };
// }

// function checkPageBreak(elementHeight: number, pageState: PageState): boolean {
//   return pageState.currentY - elementHeight < pageState.margins.bottom;
// }

/**
 * Renders a dialogue block with character name, parenthetical, and speech lines
 */
async function renderDialogue(
  doc: PDFDocument,
  pageState: PageState,
  dialogue: Dialogue,
  fountainScript: FountainScript,
): Promise<PageState> {
  let currentPage = doc.getPages()[doc.getPageCount() - 1];
  let currentY = pageState.currentY;

  // Add spacing before dialogue block if there was a previous element
  if (pageState.lastElementType !== null) {
    currentY -= pageState.lineHeight; // Single line spacing before dialogue
  }

  // Extract character name (always uppercase for character names)
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

  // Check if we need a page break for character name
  if (currentY - pageState.lineHeight < pageState.margins.bottom) {
    doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    currentPage = doc.getPages()[doc.getPageCount() - 1];
    currentY = PAGE_HEIGHT - pageState.margins.top;
  }

  // Render character name (centered)
  currentPage.drawText(fullCharacterLine, {
    x: CHARACTER_INDENT,
    y: currentY,
    size: pageState.fontSize,
    font: pageState.font,
    color: rgb(0, 0, 0),
  });
  currentY -= pageState.lineHeight;

  // Render parenthetical if it exists
  if (dialogue.parenthetical) {
    // Check if we need a page break for parenthetical
    if (currentY - pageState.lineHeight < pageState.margins.bottom) {
      doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      currentPage = doc.getPages()[doc.getPageCount() - 1];
      currentY = PAGE_HEIGHT - pageState.margins.top;
    }

    const parentheticalText = fountainScript.document
      .substring(dialogue.parenthetical.start, dialogue.parenthetical.end)
      .trim();

    // Wrap parenthetical text to fit within limits (max ~16 characters)
    const wrappedParentheticals = wrapPlainText(parentheticalText, 16);

    for (const parentheticalLine of wrappedParentheticals) {
      if (currentY - pageState.lineHeight < pageState.margins.bottom) {
        doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        currentPage = doc.getPages()[doc.getPageCount() - 1];
        currentY = PAGE_HEIGHT - pageState.margins.top;
      }

      currentPage.drawText(parentheticalLine, {
        x: PARENTHETICAL_INDENT,
        y: currentY,
        size: pageState.fontSize,
        font: pageState.font,
        color: rgb(0, 0, 0),
      });
      currentY -= pageState.lineHeight;
    }
  }

  // Render dialogue lines
  for (const line of dialogue.lines) {
    if (line.elements.length > 0) {
      // Extract styled text segments from the line elements
      const styledSegments = extractStyledSegments(
        line.elements,
        fountainScript.document,
      );
      // Wrap styled segments to fit within dialogue width (max ~35 characters)
      const wrappedLines = wrapStyledText(styledSegments, 35);

      for (const wrappedLine of wrappedLines) {
        // Check if we need a page break
        if (currentY - pageState.lineHeight < pageState.margins.bottom) {
          doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
          currentPage = doc.getPages()[doc.getPageCount() - 1];
          currentY = PAGE_HEIGHT - pageState.margins.top;
        }

        // Render the line with styled segments
        if (wrappedLine.length > 0) {
          let currentX = DIALOGUE_INDENT;
          for (const segment of wrappedLine) {
            if (segment.text.length > 0) {
              // Select appropriate font based on styling
              const selectedFont = selectFont(pageState, segment);

              // Render the text with appropriate font
              currentPage.drawText(segment.text, {
                x: currentX,
                y: currentY,
                size: pageState.fontSize,
                font: selectedFont,
                color: rgb(0, 0, 0),
              });

              // Draw underline if needed
              if (segment.underline) {
                const textWidth = selectedFont.widthOfTextAtSize(
                  segment.text,
                  pageState.fontSize,
                );
                const underlineY = currentY - 2; // Position underline slightly below baseline
                currentPage.drawLine({
                  start: { x: currentX, y: underlineY },
                  end: { x: currentX + textWidth, y: underlineY },
                  thickness: 1,
                  color: rgb(0, 0, 0),
                });
              }

              // Calculate text width to position next segment
              const textWidth = selectedFont.widthOfTextAtSize(
                segment.text,
                pageState.fontSize,
              );
              currentX += textWidth;
            }
          }
        }
        currentY -= pageState.lineHeight;
      }
    } else {
      // Empty line - preserve spacing
      if (currentY - pageState.lineHeight < pageState.margins.bottom) {
        doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        currentPage = doc.getPages()[doc.getPageCount() - 1];
        currentY = PAGE_HEIGHT - pageState.margins.top;
      }
      currentY -= pageState.lineHeight;
    }
  }

  // Update page state
  return {
    ...pageState,
    currentY: currentY,
    lastElementType: "dialogue",
    pendingSpacing: 0,
  };
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

/**
 * Renders a transition with proper right-alignment
 */
async function renderTransition(
  doc: PDFDocument,
  pageState: PageState,
  transition: Transition,
  fountainScript: FountainScript,
): Promise<PageState> {
  // Extract the transition text from the document
  const transitionText = fountainScript.document
    .substring(transition.range.start, transition.range.end)
    .trim()
    .toUpperCase(); // Transitions are typically uppercase

  // Get the current page
  let currentPage = doc.getPages()[doc.getPageCount() - 1];
  let currentY = pageState.currentY;

  // Add spacing before transition if there was a previous element
  if (pageState.lastElementType !== null) {
    currentY -= pageState.lineHeight; // Single line spacing before transition
  }

  // Check if we need a page break
  if (currentY - pageState.lineHeight < pageState.margins.bottom) {
    // Create new page
    doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    currentPage = doc.getPages()[doc.getPageCount() - 1];
    currentY = PAGE_HEIGHT - pageState.margins.top;
  }

  // Calculate the width of the text to position it right-aligned
  const textWidth = pageState.font.widthOfTextAtSize(
    transitionText,
    pageState.fontSize,
  );
  const rightAlignedX = TRANSITION_INDENT - textWidth;

  // Render the transition (right-aligned)
  currentPage.drawText(transitionText, {
    x: rightAlignedX,
    y: currentY,
    size: pageState.fontSize,
    font: pageState.font,
    color: rgb(0, 0, 0),
  });

  // Update page state
  return {
    ...pageState,
    currentY: currentY - pageState.lineHeight,
    lastElementType: "transition",
    pendingSpacing: 0,
  };
}

/**
 * Utility function to extract plain text from StyledText
 * Recursively walks through styled elements and extracts raw text from the document
 */
function extractPlainText(styledText: StyledText[], document: string): string {
  const textParts: string[] = [];

  for (const styledTextArray of styledText) {
    for (const element of styledTextArray) {
      textParts.push(extractTextFromElement(element, document));
    }
  }

  return textParts.join("");
}

/**
 * Helper function to extract text from a single text element
 */
function extractTextFromElement(
  element: TextElementWithNotesAndBoneyard,
  document: string,
): string {
  switch (element.kind) {
    case "text":
      // Extract raw text from the document using the range
      return document.substring(element.range.start, element.range.end);
    case "bold":
    case "italics":
    case "underline":
      // Recursively extract text from styled elements
      return extractPlainText([element.elements], document);
    case "note":
    case "boneyard":
      // Skip notes and boneyard content for PDF output
      return "";
  }
}
