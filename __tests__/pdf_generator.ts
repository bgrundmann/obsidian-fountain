import { describe, expect, test } from "@jest/globals";
import { PDFDocument } from "pdf-lib";
import { parse } from "../src/fountain_parser";
import { generatePDF } from "../src/pdf_generator";

describe("PDF Generator", () => {
  test("should create a basic PDF document", async () => {
    // Create a minimal fountain script for testing using the parser
    const fountainText = `Title: Test Script

FADE IN:

INT. TEST ROOM - DAY

This is a test action.

CHARACTER
This is test dialogue.
`;
    const fountainScript = parse(fountainText, {});

    const pdfDoc = await generatePDF(fountainScript);

    // Verify PDF was created
    expect(pdfDoc).toBeInstanceOf(PDFDocument);

    // Verify PDF has at least one page
    const pages = pdfDoc.getPages();
    expect(pages.length).toBeGreaterThan(0);

    // Verify PDF can be serialized (basic sanity check)
    const pdfBytes = await pdfDoc.save();
    expect(pdfBytes).toBeInstanceOf(Uint8Array);
    expect(pdfBytes.length).toBeGreaterThan(0);

    // Check that the PDF starts with PDF magic bytes
    const pdfHeader = new TextDecoder().decode(pdfBytes.slice(0, 5));
    expect(pdfHeader).toBe("%PDF-");
  });

  test("should handle empty fountain script", async () => {
    const emptyScript = parse("", {});

    const pdfDoc = await generatePDF(emptyScript);

    expect(pdfDoc).toBeInstanceOf(PDFDocument);
    const pages = pdfDoc.getPages();
    expect(pages.length).toBe(1); // Should still create one page
  });

  test("should include title from fountain script", async () => {
    const fountainText = `Title: My Test Script
Author: Test Author

FADE IN:
`;
    const scriptWithTitle = parse(fountainText, {});

    const pdfDoc = await generatePDF(scriptWithTitle);

    // Basic verification that PDF was created successfully
    expect(pdfDoc).toBeInstanceOf(PDFDocument);
    const pdfBytes = await pdfDoc.save();
    expect(pdfBytes.length).toBeGreaterThan(0);
  });
});
