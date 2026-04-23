/**
 * Main entry point for PDF generation.
 * This module ties together instruction generation and PDF rendering.
 */

import type { PDFDocument } from "pdf-lib";
import type { FountainScript } from "../fountain";
import type { PDFOptions } from "./options_dialog";
import { generateInstructions } from "./instruction_generator";
import { renderInstructionsToPDF } from "./renderer";
import {
  UnsupportedCharacterError,
  findFirstNonWin1252Char,
} from "./types";

// Re-export types and utilities that external code may need
export {
  UnsupportedCharacterError,
  findFirstNonWin1252Char,
} from "./types";

export type {
  Instruction,
  NewPageInstruction,
  TextInstruction,
  Color,
} from "./types";

export { generateInstructions } from "./instruction_generator";
export { renderInstructionsToPDF } from "./renderer";

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
    hideMarginMarks: false,
  },
): Promise<PDFDocument> {
  // Check for unsupported characters before generating any instructions
  const invalidChar = findFirstNonWin1252Char(fountainScript.document);
  if (invalidChar) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    throw new UnsupportedCharacterError(invalidChar, invalidChar.codePointAt(0)!);
  }

  // Generate instructions
  const instructions = generateInstructions(fountainScript, options);

  // Execute instructions to create PDF
  return renderInstructionsToPDF(instructions, options);
}
