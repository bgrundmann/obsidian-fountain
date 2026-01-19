/**
 * Renders PDF instructions to an actual PDF document using pdf-lib.
 */

import { PDFDocument, type PDFPage, StandardFonts, rgb } from "pdf-lib";
import type { PDFOptions } from "./pdf_options_dialog";
import {
  type Instruction,
  FONT_SIZE,
  rgbOfColor,
} from "./pdf_types";

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
    hideMarginMarks: false,
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
