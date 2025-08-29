import { PDFDocument, type PDFFont, StandardFonts, rgb } from "pdf-lib";
import type {
  FountainScript,
  Scene,
  StyledText,
  TextElementWithNotesAndBoneyard,
} from "./fountain";

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
// const ACTION_INDENT = 126; // 1.75" - TODO: Use when implementing action blocks
// const CHARACTER_INDENT = 306; // ~4.25" (centered) - TODO: Use when implementing dialogue
// const DIALOGUE_INDENT = 198; // 2.75" - TODO: Use when implementing dialogue
// const PARENTHETICAL_INDENT = 252; // 3.5" - TODO: Use when implementing parentheticals

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
  font: PDFFont; // Embedded Courier font

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

  // Embed Courier font (essential for proper screenplay formatting)
  const courierFont = await pdfDoc.embedFont(StandardFonts.Courier);

  // Create first page
  pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

  // Initialize page state
  const pageState: PageState = {
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
    lastElementType: null,
    pendingSpacing: 0,
  };

  // Phase 2: Render the actual script elements
  await renderScript(pdfDoc, pageState, fountainScript);

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
        // TODO: Phase 2 - implement action rendering
        break;
      case "dialogue":
        // TODO: Phase 2 - implement dialogue rendering
        break;
      case "transition":
        // TODO: Phase 2 - implement transition rendering
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

  // Render the scene heading
  currentPage.drawText(sceneText, {
    x: SCENE_HEADING_INDENT,
    y: newY,
    size: pageState.fontSize,
    font: pageState.font,
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
