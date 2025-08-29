import { PDFDocument, type PDFFont, StandardFonts, rgb } from "pdf-lib";
import type {
  FountainScript,
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

// TODO: These will be used in Phase 2 for element positioning
// const SCENE_NUMBER_INDENT = 90; // 1.25"
// const SCENE_HEADING_INDENT = 126; // 1.75"
// const ACTION_INDENT = 126; // 1.75"
// const CHARACTER_INDENT = 306; // ~4.25" (centered)
// const DIALOGUE_INDENT = 198; // 2.75"
// const PARENTHETICAL_INDENT = 252; // 3.5"

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
  const firstPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

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

  // For Phase 1 Step 1: Create a simple "Hello World" PDF to verify pdf-lib integration
  // This will be replaced with actual fountain rendering in subsequent steps
  firstPage.drawText("Hello World - PDF Generation Test", {
    x: pageState.margins.left,
    y: pageState.currentY,
    size: pageState.fontSize,
    font: pageState.font,
    color: rgb(0, 0, 0),
  });

  // Add test text to verify proper formatting
  pageState.currentY -= pageState.lineHeight * 2;
  const titleKv = fountainScript.titlePage.find(
    (kv) => kv.key.toLowerCase() === "title",
  );
  const titleText = titleKv
    ? extractPlainText(titleKv.values, fountainScript.document)
    : "Untitled";
  firstPage.drawText(`Fountain Script Title: ${titleText}`, {
    x: pageState.margins.left,
    y: pageState.currentY,
    size: pageState.fontSize,
    font: pageState.font,
    color: rgb(0, 0, 0),
  });

  pageState.currentY -= pageState.lineHeight * 2;
  firstPage.drawText(`Script Elements: ${fountainScript.script.length}`, {
    x: pageState.margins.left,
    y: pageState.currentY,
    size: pageState.fontSize,
    font: pageState.font,
    color: rgb(0, 0, 0),
  });

  // TODO: In Phase 2, this will be replaced with:
  // pageState = await renderTitlePage(pdfDoc, pageState, fountainScript.titlePage);
  // pageState = await renderScript(pdfDoc, pageState, fountainScript.script);

  return pdfDoc;
}

// TODO: Phase 2 - Utility functions for page management
// These will be implemented when we add proper page break handling

// function createNewPage(doc: PDFDocument, pageState: PageState): PageState {
//   const newPage = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
//   return {
//     ...pageState,
//     currentY: PAGE_HEIGHT - pageState.margins.top,
//     remainingHeight: PAGE_HEIGHT - pageState.margins.top - pageState.margins.bottom,
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
