/**
 * Shared types, constants, and utilities for PDF generation.
 */

/**
 * Error thrown when the script contains characters that cannot be encoded in Windows-1252.
 */
export class UnsupportedCharacterError extends Error {
  constructor(
    public readonly char: string,
    public readonly codePoint: number,
  ) {
    const hex = codePoint.toString(16).toUpperCase().padStart(4, "0");
    super(
      `The script contains at least one character that we cannot render in the PDF: '${char}' (unicode code point: U+${hex}). Please remove it to proceed.`,
    );
    this.name = "UnsupportedCharacterError";
  }
}

/**
 * Regex matching characters NOT in Windows-1252 encoding.
 * Windows-1252 covers:
 * - ASCII (U+0000–U+007F)
 * - Latin-1 supplement (U+00A0–U+00FF)
 * - Specific characters in 0x80–0x9F range (curly quotes, em-dash, euro, etc.)
 */
// eslint-disable-next-line no-control-regex
const WIN1252_INVALID = /[^\x00-\x7F\xA0-\xFF\u20AC\u201A\u0192\u201E\u2026\u2020\u2021\u02C6\u2030\u0160\u2039\u0152\u017D\u2018\u2019\u201C\u201D\u2022\u2013\u2014\u02DC\u2122\u0161\u203A\u0153\u017E\u0178]/u;

/**
 * Finds the first character in the text that cannot be encoded in Windows-1252.
 * Returns null if all characters are valid.
 */
export function findFirstNonWin1252Char(text: string): string | null {
  const match = text.match(WIN1252_INVALID);
  return match ? match[0] : null;
}

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
export type StyledTextSegment = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: Color;
  strikethrough?: boolean;
  backgroundColor?: Color;
  marginMark?: boolean;
};

// A wrapped line with its associated margin marks
export type WrappedLine = {
  segments: StyledTextSegment[];
  marginMarks: string[];
};

// Page layout constants (all measurements in PDF points - 1/72 inch)
export const FONT_SIZE = 12;
export const LINE_HEIGHT = 12; // Single spacing

// Character limits for text wrapping (Phase 1: extracted from hardcoded values)
export const DEFAULT_CHARACTERS_PER_LINE = {
  action: 61,
  dialogue: 34,
  parenthetical: 25,
  titlePageCenter: 60,
  titlePageSides: 55,
};

// Page dimensions based on paper size
export const PAPER_SIZES = {
  letter: { width: 612, height: 792 }, // 8.5" × 11" in points
  a4: { width: 595.28, height: 841.89 }, // 210 × 297 mm in points
};

// Industry standard layout constants
export const LINES_PER_PAGE = 60; // Industry standard for page-a-minute timing

// Fixed margins (industry standards)
export const MARGIN_LEFT = 108; // 1.5" for binding (updated from 1.25")

// Character width calculation for Courier font
export function getCharacterWidth(fontSize: number): number {
  return fontSize * 0.6; // Exact width of a courier font character
}

// Element positions (from left edge) - updated for 1.5" left margin
export const SCENE_HEADING_INDENT = 108; // 1.5" (matches left margin)
export const ACTION_INDENT = 108; // 1.5" (matches left margin)
export const CHARACTER_INDENT = 288; // ~4" (adjusted for new left margin)
export const DIALOGUE_INDENT = 180; // 2.5" (adjusted for new left margin)
export const PARENTHETICAL_INDENT = 234; // 3.25" (adjusted for new left margin)

// Title page positioning (calculated dynamically based on page height)
export function getTitlePageCenterStart(pageHeight: number): number {
  return pageHeight * 0.6;
}

export function getTitlePageCenterX(pageWidth: number): number {
  return pageWidth / 2;
}

// Dynamic margin calculation functions (Phase 2)
export function calculateRightMargin(
  pageWidth: number,
  maxCharactersPerLine: number,
  fontSize: number,
): number {
  // Formula: right_margin = page_width - left_margin - (characters_per_line * character_width)
  return (
    pageWidth - MARGIN_LEFT - maxCharactersPerLine * getCharacterWidth(fontSize)
  );
}

export function calculateVerticalMargins(pageHeight: number): {
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
export type PageState = {
  // Vertical position tracking (measured from top of page)
  currentY: number; // Current vertical position (points from top)
  remainingHeight: number; // Remaining usable height on current page

  // Page information
  pageNumber: number; // Current page number (1-based)
  pageWidth: number; // Current page width (including margins)
  pageHeight: number; // Current page height (including margins)
  isTitlePage: boolean; // Whether this is the title page
  documentHasTitlePage: boolean; // Whether the document has a title page

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

// Prepared dialogue data for rendering
export type PreparedDialogue = {
  characterLine: string;
  parentheticalLines: string[];
  dialogueLines: WrappedLine[];
  contd: boolean;
};
