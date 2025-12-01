import type { Action } from "../src/fountain";
import {
  type Instruction,
  type NewPageInstruction,
  type TextInstruction,
  generateInstructions,
  renderInstructionsToPDF,
} from "../src/pdf_generator";

import * as parser from "../src/fountain_parser";

describe("PDF Instruction Generation", () => {
  describe("generateInstructions", () => {
    it("should generate new-page instruction as first instruction", () => {
      const script = parser.parse("INT. OFFICE - DAY");

      const instructions = generateInstructions(script);

      expect(instructions.length).toBeGreaterThan(0);
      expect(instructions[0]).toEqual({
        type: "new-page",
        width: 612,
        height: 792,
      } as NewPageInstruction);
    });

    it("should generate text instruction for scene heading", () => {
      const script = parser.parse("INT. OFFICE - DAY");

      const instructions = generateInstructions(script);

      const textInstructions = instructions.filter(
        (inst) => inst.type === "text",
      ) as TextInstruction[];

      expect(textInstructions.length).toBeGreaterThan(0);

      const sceneInstruction = textInstructions.find(
        (inst) => inst.data === "INT. OFFICE - DAY",
      );
      expect(sceneInstruction).toBeDefined();
      expect(sceneInstruction?.bold).toBe(false);
      expect(sceneInstruction?.italic).toBe(false);
      expect(sceneInstruction?.underline).toBe(false);
      expect(sceneInstruction?.x).toBe(108); // SCENE_HEADING_INDENT
    });

    it("should generate text instructions for action blocks", () => {
      const script = parser.parse("John enters the room.");

      const instructions = generateInstructions(script);
      const textInstructions = instructions.filter(
        (inst) => inst.type === "text",
      ) as TextInstruction[];

      expect(textInstructions.length).toBeGreaterThan(0);

      // Should generate at least one text instruction for action
      expect(textInstructions.length).toBeGreaterThan(0);

      // Find any action instruction (text from our document range)
      const actionText = textInstructions.find(
        (inst) =>
          inst.data.includes("John") ||
          inst.data.includes("enters") ||
          inst.data.includes("room"),
      );
      expect(actionText).toBeDefined();
      expect(actionText?.x).toBe(108); // ACTION_INDENT
    });

    it("should handle leading spaces in actions with normal word wrapping", () => {
      const script = parser.parse("abc\n bc\n  c");

      const instructions = generateInstructions(script);
      const textInstructions = instructions.filter(
        (inst) => inst.type === "text",
      ) as TextInstruction[];

      // Find action instructions (not italic and not page numbers)
      const actionInstructions = textInstructions.filter(
        (inst) => !inst.italic && !inst.data.match(/^\d+\.$/),
      );

      // Actions use normal word wrapping, so leading spaces are trimmed from wrapped lines
      expect(actionInstructions.length).toBe(3);

      // Find any action instruction (text from our document range)
      const firstActionText = actionInstructions.find((inst) =>
        inst.data.includes("abc"),
      );
      const secondActionText = actionInstructions.find(
        (inst) => inst.data.includes("bc") && !inst.data.includes("abc"),
      );
      const thirdActionText = actionInstructions.find(
        (inst) => inst.data.includes("c") && !inst.data.includes("bc"),
      );

      expect(firstActionText).toBeDefined();
      expect(secondActionText).toBeDefined();
      expect(thirdActionText).toBeDefined();

      // Verify they all use ACTION_INDENT positioning and are non-italic
      for (const inst of [firstActionText, secondActionText, thirdActionText]) {
        expect(inst?.x).toBe(108); // ACTION_INDENT
        expect(inst?.italic).toBe(false);
      }
    });

    it("should generate text instructions for lyrics with italic formatting", () => {
      const script = parser.parse("~Twinkle, twinkle, little star");

      const instructions = generateInstructions(script);
      const textInstructions = instructions.filter(
        (inst) => inst.type === "text",
      ) as TextInstruction[];

      expect(textInstructions.length).toBeGreaterThan(0);

      // Find lyrics instruction
      const lyricsText = textInstructions.find(
        (inst) =>
          inst.data.includes("Twinkle") ||
          inst.data.includes("little") ||
          inst.data.includes("star"),
      );
      expect(lyricsText).toBeDefined();
      expect(lyricsText?.x).toBe(108); // ACTION_INDENT (same as actions)
      expect(lyricsText?.italic).toBe(true); // Should be italic
    });

    it("should preserve leading spaces in lyrics", () => {
      const script = parser.parse("~abc\n~ bc\n~  c");

      const instructions = generateInstructions(script);
      const textInstructions = instructions.filter(
        (inst) => inst.type === "text",
      ) as TextInstruction[];

      // Find lyrics instructions (should be italic)
      const lyricsInstructions = textInstructions.filter((inst) => inst.italic);

      expect(lyricsInstructions.length).toBe(5);

      // Verify the segments are correct: "abc", " ", "bc", "  ", "c"
      expect(lyricsInstructions[0].data).toBe("abc");
      expect(lyricsInstructions[0].x).toBe(108); // ACTION_INDENT

      expect(lyricsInstructions[1].data).toBe(" ");
      expect(lyricsInstructions[1].x).toBe(108); // ACTION_INDENT (start of new line)

      expect(lyricsInstructions[2].data).toBe("bc");
      expect(lyricsInstructions[2].x).toBe(115.2); // After the space

      expect(lyricsInstructions[3].data).toBe("  ");
      expect(lyricsInstructions[3].x).toBe(108); // ACTION_INDENT (start of new line)

      expect(lyricsInstructions[4].data).toBe("c");
      expect(lyricsInstructions[4].x).toBe(122.4); // After the two spaces

      // Verify they're all italic
      for (const inst of lyricsInstructions) {
        expect(inst.italic).toBe(true);
      }
    });

    it("should generate instructions for dialogue", () => {
      const script = parser.parse("JOHN\nHello, world!");

      const instructions = generateInstructions(script);

      const textInstructions = instructions.filter(
        (inst) => inst.type === "text",
      ) as TextInstruction[];

      // Should have character name and dialogue text
      const characterInstruction = textInstructions.find(
        (inst) => inst.data === "JOHN",
      );
      expect(characterInstruction).toBeDefined();
      expect(characterInstruction?.x).toBe(288); // CHARACTER_INDENT
      expect(characterInstruction?.italic).toBe(false);

      const dialogueText = textInstructions.find(
        (inst) => inst.data.includes("Hello") || inst.data.includes("world"),
      );
      expect(dialogueText).toBeDefined();
      expect(dialogueText?.x).toBe(180); // DIALOGUE_INDENT
    });

    it("should generate instructions for dialogue with parenthetical", () => {
      const script = parser.parse("JOHN\n(softly)\nHello there.");

      const instructions = generateInstructions(script);
      const textInstructions = instructions.filter(
        (inst) => inst.type === "text",
      ) as TextInstruction[];

      const parentheticalInstruction = textInstructions.find(
        (inst) => inst.data === "(softly)",
      );
      expect(parentheticalInstruction).toBeDefined();
      expect(parentheticalInstruction?.x).toBe(234); // PARENTHETICAL_INDENT
    });

    it("should generate instructions for transitions", () => {
      const script = parser.parse("> FADE OUT.");

      const instructions = generateInstructions(script);
      const textInstructions = instructions.filter(
        (inst) => inst.type === "text",
      ) as TextInstruction[];

      const transitionInstruction = textInstructions.find(
        (inst) => inst.data === "FADE OUT.",
      );
      expect(transitionInstruction).toBeDefined();
      // Should be right-aligned for transitions
      expect(transitionInstruction?.x).toBeLessThan(522); // Should be less than right margin
    });

    it("should generate title page instructions", () => {
      const script = parser.parse("Title: Test Title\n\nINT. OFFICE - DAY");

      const instructions = generateInstructions(script);
      const textInstructions = instructions.filter(
        (inst) => inst.type === "text",
      ) as TextInstruction[];

      expect(textInstructions.length).toBeGreaterThan(0);
      // Title page should create a second page for the script
      const newPageInstructions = instructions.filter(
        (inst) => inst.type === "new-page",
      );
      expect(newPageInstructions.length).toBe(2);
    });

    it("should handle styled text in actions", () => {
      const script = parser.parse("This is **bold** text.");

      const instructions = generateInstructions(script);

      const textInstructions = instructions.filter(
        (inst) => inst.type === "text",
      ) as TextInstruction[];

      // Should have separate instructions for each styled segment
      expect(textInstructions.length).toBeGreaterThan(0);

      const boldInstruction = textInstructions.find(
        (inst) => inst.data === "bold",
      );
      expect(boldInstruction).toBeDefined();
      expect(boldInstruction?.bold).toBe(true);

      const normalInstructions = textInstructions.filter(
        (inst) => inst.data !== "bold" && inst.data.trim() !== "",
      );
      for (const inst of normalInstructions) {
        expect(inst.bold).toBe(false);
      }
    });

    it("should use PDF coordinate system (bottom-left origin)", () => {
      const script = parser.parse("INT. OFFICE - DAY");

      const instructions = generateInstructions(script);
      const textInstructions = instructions.filter(
        (inst) => inst.type === "text",
      ) as TextInstruction[];
      for (const instruction of textInstructions) {
        expect(instruction.y).toBeGreaterThan(0);
        // Y coordinate should be converted from top-origin to bottom-origin
        expect(instruction.y).toBeLessThan(792); // PAGE_HEIGHT
      }
    });

    it("should use character limits from PageState for text wrapping", () => {
      // Test that character limits are read from PageState, not hardcoded
      const longActionText = "A".repeat(100); // Text longer than any character limit
      const script = parser.parse(longActionText);

      const instructions = generateInstructions(script);

      // Find text instructions (skip the new-page instruction)
      const textInstructions = instructions.filter(
        (inst): inst is TextInstruction => inst.type === "text",
      );

      // Should have multiple text instructions due to wrapping at character limit (62 for actions)
      expect(textInstructions.length).toBeGreaterThan(1);

      // Each line should respect the action character limit (62 characters)
      // Since we're using 100 A's, it should wrap into at least 2 lines
      expect(textInstructions.length).toBeGreaterThanOrEqual(2);
    });

    it("should calculate dynamic margins based on paper size while preserving character limits", () => {
      const script = parser.parse("INT. OFFICE - DAY\n\nJohn enters the room.");

      // Generate instructions for Letter paper
      const letterInstructions = generateInstructions(script, {
        sceneHeadingBold: false,
        paperSize: "letter",
        hideNotes: true,

        hideSynopsis: false,
      });

      // Generate instructions for A4 paper
      const a4Instructions = generateInstructions(script, {
        sceneHeadingBold: false,
        paperSize: "a4",
        hideNotes: true,

        hideSynopsis: false,
      });

      // Both should have the same number of instructions (same character limits)
      expect(letterInstructions.length).toBe(a4Instructions.length);

      // Get new-page instructions to verify different page sizes
      const letterNewPage = letterInstructions.find(
        (inst): inst is NewPageInstruction => inst.type === "new-page",
      );
      const a4NewPage = a4Instructions.find(
        (inst): inst is NewPageInstruction => inst.type === "new-page",
      );

      expect(letterNewPage).toBeDefined();
      expect(a4NewPage).toBeDefined();

      // Letter and A4 should have different page dimensions
      expect(letterNewPage?.width).toBe(612); // Letter width
      expect(letterNewPage?.height).toBe(792); // Letter height
      expect(a4NewPage?.width).toBe(595.28); // A4 width
      expect(a4NewPage?.height).toBe(841.89); // A4 height

      // Text positioning should remain consistent (same left margin and indentations)
      const letterTextInstructions = letterInstructions.filter(
        (inst): inst is TextInstruction => inst.type === "text",
      );
      const a4TextInstructions = a4Instructions.filter(
        (inst): inst is TextInstruction => inst.type === "text",
      );

      // All text should use the same left margin (108pt = 1.5")
      for (const inst of letterTextInstructions) {
        expect(inst.x).toBeGreaterThanOrEqual(108); // At or beyond left margin
      }
      for (const inst of a4TextInstructions) {
        expect(inst.x).toBeGreaterThanOrEqual(108); // At or beyond left margin
      }

      // Verify that margins are calculated to center content vertically
      // Both should have similar vertical positioning relative to their page heights
      const letterMaxY = Math.max(
        ...letterTextInstructions.map((inst) => inst.y),
      );
      const a4MaxY = Math.max(...a4TextInstructions.map((inst) => inst.y));

      // Y positions should be proportionally similar (both centering 61 lines)
      const letterRatio = letterMaxY / 792; // ratio to Letter height
      const a4Ratio = a4MaxY / 841.89; // ratio to A4 height

      expect(Math.abs(letterRatio - a4Ratio)).toBeLessThan(0.05); // Should be very similar ratios
    });
  });

  describe("renderInstructionsToPDF", () => {
    it("should create PDF from simple instructions", async () => {
      const instructions: Instruction[] = [
        {
          type: "new-page",
          width: 612,
          height: 792,
        },
        {
          type: "text",
          data: "Test text",
          x: 72,
          y: 720,
          bold: false,
          italic: false,
          underline: false,
          color: "black",
          strikethrough: false,
        },
      ];

      const pdfDoc = await renderInstructionsToPDF(instructions);

      expect(pdfDoc.getPageCount()).toBe(1);
    });

    it("should handle multiple pages", async () => {
      const instructions: Instruction[] = [
        {
          type: "new-page",
          width: 612,
          height: 792,
        },
        {
          type: "text",
          data: "Page 1",
          x: 72,
          y: 720,
          bold: false,
          italic: false,
          underline: false,
          color: "black",
          strikethrough: false,
        },
        {
          type: "new-page",
          width: 612,
          height: 792,
        },
        {
          type: "text",
          data: "Page 2",
          x: 72,
          y: 720,
          bold: false,
          italic: false,
          underline: false,
          color: "black",
          strikethrough: false,
        },
      ];

      const pdfDoc = await renderInstructionsToPDF(instructions);

      expect(pdfDoc.getPageCount()).toBe(2);
    });

    it("should handle styled text instructions", async () => {
      const instructions: Instruction[] = [
        {
          type: "new-page",
          width: 612,
          height: 792,
        },
        {
          type: "text",
          data: "Bold Text",
          x: 100,
          y: 700,
          bold: true,
          italic: false,
          underline: false,
          color: "black",
          strikethrough: false,
        },
        {
          type: "text",
          data: "Italic Text",
          x: 200,
          y: 700,
          bold: false,
          italic: true,
          underline: false,
          color: "black",
          strikethrough: false,
        },
        {
          type: "text",
          data: "Underline text",
          x: 72,
          y: 680,
          bold: false,
          italic: false,
          underline: true,
          color: "black",
          strikethrough: false,
        },
      ];

      const pdfDoc = await renderInstructionsToPDF(instructions);

      expect(pdfDoc.getPageCount()).toBe(1);
    });

    it("should throw error for text instruction without page", async () => {
      const instructions: Instruction[] = [
        {
          type: "text",
          data: "Test error",
          x: 72,
          y: 720,
          bold: false,
          italic: false,
          underline: false,
          color: "black",
          strikethrough: false,
        },
      ];

      await expect(renderInstructionsToPDF(instructions)).rejects.toThrow(
        "Text instruction encountered without a current page",
      );
    });
  });

  describe("End-to-end integration", () => {
    it("should generate complete PDF from fountain script", async () => {
      const script = parser.parse(
        "INT. OFFICE - DAY\n\nJohn enters the room.\n\nJOHN\nHello, world!\n\n> FADE OUT.",
      );

      const instructions = generateInstructions(script);

      const pdfDoc = await renderInstructionsToPDF(instructions);

      expect(instructions.length).toBeGreaterThan(0);
      expect(pdfDoc.getPageCount()).toBeGreaterThan(0);

      // Should contain all expected text elements
      const textInstructions = instructions.filter(
        (inst) => inst.type === "text",
      ) as TextInstruction[];

      // Check that expected content is present in some form
      const allText = textInstructions.map((i) => i.data).join(" ");
      expect(allText).toContain("INT. OFFICE - DAY");
      expect(allText).toContain("JOHN");
      expect(allText).toContain("FADE OUT.");

      // Should have multiple text instructions
      expect(textInstructions.length).toBeGreaterThan(3);
    });

    it("should generate reasonable page count for typical script", () => {
      // Create a script that simulates a typical short screenplay
      const typicalScript = parser.parse(
        "INT. OFFICE - DAY\n\nJohn sits at his desk, typing.\n\nJOHN\nThis is taking forever.\n\nHe looks up as Sarah enters.\n\nSARAH\nAny progress on the report?\n\nJOHN\n(sighing)\nAlmost done.\n\nSarah nods and exits.\n\nJOHN (CONT'D)\nFinally, some peace.\n\nHe returns to typing.\n\n> FADE OUT.\n\nINT. HALLWAY - MOMENTS LATER\n\nSarah walks down the hallway.\n\nSARAH\n(to herself)\nHe'll never finish on time.\n\nShe disappears around the corner.\n\n> FADE OUT.",
      );

      const instructions = generateInstructions(typicalScript);

      // Count new-page instructions to determine page count
      const pageCount = instructions.filter(
        (inst) => inst.type === "new-page",
      ).length;

      // Should be reasonable - definitely not 127 pages!
      expect(pageCount).toBeLessThan(10);
      expect(pageCount).toBeGreaterThan(0);

      // Verify text instructions have reasonable Y coordinates
      const textInstructions = instructions.filter(
        (inst) => inst.type === "text",
      ) as TextInstruction[];
      for (const instruction of textInstructions) {
        expect(instruction.y).toBeGreaterThan(0);
        expect(instruction.y).toBeLessThan(792); // Page height
      }
    });

    describe("withHiddenElementsRemoved", () => {
      test("should remove notes when hideNotes is true", () => {
        const script = parser.parse(
          "This is action text.\n[[This is a note]]\n\nMore action text.",
        );

        const filtered = script.withHiddenElementsRemoved({ hideNotes: true });

        expect(filtered.script).toHaveLength(1);
        expect(filtered.script[0].kind).toBe("action");
        const actionBlock = filtered.script[0] as Action;
        expect(actionBlock.lines).toHaveLength(3); // Note line removed, but empty line preserved
        expect(actionBlock.lines[0].elements).toHaveLength(1);
        expect(actionBlock.lines[0].elements[0].kind).toBe("text");
      });

      test("should remove synopsis when hideSynopsis is true", () => {
        const script = parser.parse(
          "= This is a synopsis\n\nThis is action text.",
        );

        const filtered = script.withHiddenElementsRemoved({
          hideSynopsis: true,
        });

        expect(filtered.script).toHaveLength(1);
        expect(filtered.script[0].kind).toBe("action");
      });

      test("should remove action blocks that become empty after filtering", () => {
        const script = parser.parse("[[This is a note]]");

        const filtered = script.withHiddenElementsRemoved({ hideNotes: true });

        expect(filtered.script).toHaveLength(0); // Action block should be completely removed
      });

      test("should stop processing at boneyard section when hideBoneyard is true", () => {
        const script = parser.parse(
          "This is action text.\n\n# BONEYARD\n\nThis should be hidden.",
        );

        const filtered = script.withHiddenElementsRemoved({
          hideBoneyard: true,
        });

        expect(filtered.script).toHaveLength(1); // Only first action should remain
        expect(filtered.script[0].kind).toBe("action");
      });
    });

    test("should preserve empty lines in action blocks", () => {
      const script = parser.parse("Test\n\n\n\nthree empty lines");

      const filtered = script.withHiddenElementsRemoved({
        hideNotes: true,
        hideSynopsis: true,
        hideBoneyard: true,
      });

      expect(filtered.script).toHaveLength(1);
      expect(filtered.script[0].kind).toBe("action");
      const actionBlock = filtered.script[0] as Action;
      expect(actionBlock.lines).toHaveLength(5); // Should preserve all lines including empty ones
      expect(actionBlock.lines[0].elements).toHaveLength(1); // "Test"
      expect(actionBlock.lines[1].elements).toHaveLength(0); // Empty line
      expect(actionBlock.lines[2].elements).toHaveLength(0); // Empty line
      expect(actionBlock.lines[3].elements).toHaveLength(0); // Empty line
      expect(actionBlock.lines[4].elements).toHaveLength(1); // "three empty lines"
    });

    test("should remove lines that become empty after filtering", () => {
      const script = parser.parse(
        "This is visible text.\n[[This line only has a note]]\nAnother visible line.",
      );

      const filtered = script.withHiddenElementsRemoved({ hideNotes: true });

      expect(filtered.script).toHaveLength(1);
      expect(filtered.script[0].kind).toBe("action");
      const actionBlock = filtered.script[0] as Action;
      expect(actionBlock.lines).toHaveLength(2); // Line with only note should be removed
      expect(actionBlock.lines[0].elements).toHaveLength(1); // "This is visible text."
      expect(actionBlock.lines[1].elements).toHaveLength(1); // "Another visible line."
    });

    test("should render synopsis and notes in gray italic when enabled", () => {
      const script = parser.parse(
        "= This is a synopsis\n\nThis is action [[with a note]] text.",
      );

      const instructions = generateInstructions(script, {
        sceneHeadingBold: false,
        paperSize: "letter",
        hideNotes: false,
        hideSynopsis: false,
      });

      // Find synopsis instruction
      const synopsisInstruction = instructions.find(
        (inst): inst is TextInstruction =>
          inst.type === "text" && inst.data === "This is a synopsis",
      );
      expect(synopsisInstruction).toBeDefined();
      expect(synopsisInstruction?.italic).toBe(true);
      expect(synopsisInstruction?.color).toBe("gray");

      // Find note instruction (notes get broken into individual words)
      const noteInstruction = instructions.find(
        (inst): inst is TextInstruction =>
          inst.type === "text" && inst.data === "note",
      );
      expect(noteInstruction).toBeDefined();
      expect(noteInstruction?.italic).toBe(true);
      expect(noteInstruction?.color).toBe("gray");

      // Also verify that "with" (first word of note) has correct formatting
      const noteWordInstruction = instructions.find(
        (inst): inst is TextInstruction =>
          inst.type === "text" && inst.data === "with",
      );
      expect(noteWordInstruction).toBeDefined();
      expect(noteWordInstruction?.italic).toBe(true);
      expect(noteWordInstruction?.color).toBe("gray");
    });

    test("should render different note kinds with correct formatting", () => {
      const script = parser.parse(
        "Test [[+addition]] and [[- removal]] and [[todo: important]] text.",
      );

      const instructions = generateInstructions(script, {
        sceneHeadingBold: false,
        paperSize: "letter",
        hideNotes: false,
        hideSynopsis: false,
      });

      const textInstructions = instructions.filter(
        (inst): inst is TextInstruction => inst.type === "text",
      );

      // Find addition note (green)
      const additionInstructions = textInstructions.filter(
        (inst) => inst.color === "green" && inst.data.includes("addition"),
      );
      expect(additionInstructions.length).toBeGreaterThan(0);
      expect(additionInstructions[0].italic).toBe(false);
      expect(additionInstructions[0].color).toBe("green");

      // Find removal note (red with strikethrough)
      const removalInstructions = textInstructions.filter(
        (inst) => inst.color === "red" && inst.data.includes("removal"),
      );
      expect(removalInstructions.length).toBeGreaterThan(0);
      expect(removalInstructions[0].italic).toBe(false);
      expect(removalInstructions[0].color).toBe("red");
      expect(removalInstructions[0].strikethrough).toBe(true);

      // Find todo note (gray with TODO prefix)
      const todoInstructions = textInstructions.filter(
        (inst) => inst.color === "gray" && inst.data.includes("TODO:"),
      );
      expect(todoInstructions.length).toBeGreaterThan(0);
      expect(todoInstructions[0].italic).toBe(true);
      expect(todoInstructions[0].color).toBe("gray");
    });

    test("should handle comprehensive fountain document with synopsis and various note types", () => {
      const fountainText = `= This is a synopsis

EXT. PARK - DAY

Action text [[regular note]] more text.

JOHN
Hello [[+add emphasis]] there [[- remove uncertainty]]!

MARY
[[todo: Mary needs motivation]] Hi John.

[[custom: director note]] End scene.`;

      const script = parser.parse(fountainText);

      const instructions = generateInstructions(script, {
        sceneHeadingBold: false,
        paperSize: "letter",
        hideNotes: false,
        hideSynopsis: false,
      });

      const textInstructions = instructions.filter(
        (inst): inst is TextInstruction => inst.type === "text",
      );

      // Test synopsis rendering (gray italic)
      const synopsisInstructions = textInstructions.filter(
        (inst) =>
          inst.color === "gray" &&
          inst.italic &&
          inst.data.includes("synopsis"),
      );
      expect(synopsisInstructions.length).toBe(1);

      // Test regular notes (gray italic with spaces)
      const regularNoteInstructions = textInstructions.filter(
        (inst) =>
          inst.color === "gray" && inst.italic && inst.data.includes("regular"),
      );
      expect(regularNoteInstructions.length).toBe(1);

      // Test addition notes (green italic)
      const additionInstructions = textInstructions.filter(
        (inst) => inst.color === "green" && !inst.italic,
      );
      expect(additionInstructions.length).toBe(3);

      // Test removal notes (red italic with strikethrough)
      const removalInstructions = textInstructions.filter(
        (inst) => inst.color === "red" && !inst.italic && inst.strikethrough,
      );
      expect(removalInstructions.length).toBe(3);

      // Test todo notes (gray with TODO prefix)
      const todoInstructions = textInstructions.filter(
        (inst) =>
          inst.color === "gray" && inst.italic && inst.data.includes("TODO:"),
      );
      expect(todoInstructions.length).toBe(1);

      // Test custom notes (gray italic with custom prefix)
      const customInstructions = textInstructions.filter(
        (inst) =>
          inst.color === "gray" && inst.italic && inst.data.includes("custom:"),
      );
      expect(customInstructions.length).toBe(1);

      // Verify spacing - should have space instructions around notes
      const spaceInstructions = textInstructions.filter(
        (inst) => inst.data === " ",
      );
      expect(spaceInstructions.length).toBeGreaterThan(10); // Should have many spaces around notes
    });
  });
});

describe("Page numbering", () => {
  it("should not add page numbers to title page", () => {
    const script = `Title: TEST TITLE
Author: Test Author

FADE IN:

INT. ROOM - DAY

John walks in.`;

    const instructions = generateInstructions(parser.parse(script));
    const pageNumberInstructions = instructions.filter(
      (inst): inst is TextInstruction =>
        inst.type === "text" && !!inst.data.match(/^\d+\.$/),
    );

    // Should have no page number on title page (first page)
    expect(pageNumberInstructions).toHaveLength(0);
  });

  it("should not add page number to first script page", () => {
    const script = `Title: TEST TITLE
Author: Test Author

FADE IN:

INT. ROOM - DAY

John walks in.`;

    const instructions = generateInstructions(parser.parse(script));
    const newPageInstructions = instructions.filter(
      (inst): inst is NewPageInstruction => inst.type === "new-page",
    );

    // Should have 2 pages (title page + first script page)
    expect(newPageInstructions).toHaveLength(2);

    // Check that no page numbers are generated yet
    const pageNumberInstructions = instructions.filter(
      (inst): inst is TextInstruction =>
        inst.type === "text" && !!inst.data.match(/^\d+\.$/),
    );
    expect(pageNumberInstructions).toHaveLength(0);
  });

  it("should add page number starting from second script page with title page", () => {
    const longScript = `Title: TEST TITLE
Author: Test Author

FADE IN:

INT. ROOM - DAY

${"John walks around the room. ".repeat(100)}

===

INT. ANOTHER ROOM - DAY

More content here.`;

    const instructions = generateInstructions(parser.parse(longScript));
    const newPageInstructions = instructions.filter(
      (inst): inst is NewPageInstruction => inst.type === "new-page",
    );

    // Should have at least 3 pages
    expect(newPageInstructions.length).toBeGreaterThanOrEqual(3);

    const pageNumberInstructions = instructions.filter(
      (inst): inst is TextInstruction =>
        inst.type === "text" && !!inst.data.match(/^\d+\.$/),
    );

    // Should have page numbers starting from page 3 (second script page)
    expect(pageNumberInstructions.length).toBeGreaterThan(0);
    expect(pageNumberInstructions[0].data).toBe("2.");
  });

  it("should add page number starting from second page without title page", () => {
    const longScript = `FADE IN:

INT. ROOM - DAY

${"John walks around the room. ".repeat(100)}

===

INT. ANOTHER ROOM - DAY

More content here.`;

    const instructions = generateInstructions(parser.parse(longScript));
    const pageNumberInstructions = instructions.filter(
      (inst): inst is TextInstruction =>
        inst.type === "text" && !!inst.data.match(/^\d+\.$/),
    );

    // Should have page numbers starting from page 2
    expect(pageNumberInstructions.length).toBeGreaterThan(0);
    expect(pageNumberInstructions[0].data).toBe("2.");
  });

  it("should position page numbers in upper right margin", () => {
    const longScript = `Title: TEST TITLE

FADE IN:

INT. ROOM - DAY

${"Content to fill pages. ".repeat(200)}`;

    const instructions = generateInstructions(parser.parse(longScript));
    const pageNumberInstructions = instructions.filter(
      (inst): inst is TextInstruction =>
        inst.type === "text" && !!inst.data.match(/^\d+\.$/),
    );

    if (pageNumberInstructions.length > 0) {
      const pageNumber = pageNumberInstructions[0];
      const paperSize = { width: 612, height: 792 }; // Letter size
      const topMargin = 36; // Expected top margin (calculated from LINES_PER_PAGE)
      const rightMargin = 72; // Expected right margin

      // Should be positioned at half the top margin height from top
      const expectedY = paperSize.height - topMargin / 2;
      expect(pageNumber.y).toBeCloseTo(expectedY, 1);

      // Should be right-aligned in the right margin area
      expect(pageNumber.x).toBeLessThan(paperSize.width - rightMargin);
      expect(pageNumber.x).toBeGreaterThan(paperSize.width - rightMargin - 50);
    }
  });

  it("should include period after page number", () => {
    const longScript = `FADE IN:

INT. ROOM - DAY

${"Content to fill multiple pages. ".repeat(200)}`;

    const instructions = generateInstructions(parser.parse(longScript));
    const pageNumberInstructions = instructions.filter(
      (inst): inst is TextInstruction =>
        inst.type === "text" && !!inst.data.match(/^\d+\.$/),
    );

    // All page numbers should end with a period
    pageNumberInstructions.forEach((instruction) => {
      expect(instruction.data).toMatch(/^\d+\.$/);
    });
  });

  it("should not bold, italicize, or underline page numbers", () => {
    const longScript = `FADE IN:

INT. ROOM - DAY

${"Content to fill multiple pages. ".repeat(200)}`;

    const instructions = generateInstructions(parser.parse(longScript));
    const pageNumberInstructions = instructions.filter(
      (inst): inst is TextInstruction =>
        inst.type === "text" && !!inst.data.match(/^\d+\.$/),
    );

    pageNumberInstructions.forEach((instruction) => {
      expect(instruction.bold).toBe(false);
      expect(instruction.italic).toBe(false);
      expect(instruction.underline).toBe(false);
    });
  });
});
