import { FountainScript } from "../src/fountain";
import type {
  Action,
  Dialogue,
  Scene,
  Synopsis,
  Transition,
} from "../src/fountain";
import {
  type Instruction,
  type NewPageInstruction,
  type TextInstruction,
  generateInstructions,
  renderInstructionsToPDF,
} from "../src/pdf_generator";

describe("PDF Instruction Generation", () => {
  const createMockScript = (
    document: string,
    script: any[],
    titlePage: any[] = [],
  ): FountainScript => {
    // Create a minimal mock that satisfies the FountainScript interface
    return {
      titlePage,
      script,
      document,
      allCharacters: new Set<string>(),
      extractAsHtml: (range: any) => document.substring(range.start, range.end),
      unsafeExtractRaw: (range: any) =>
        document.substring(range.start, range.end),
      charactersOf: (dialogue: any) => [
        document
          .substring(dialogue.characterRange.start, dialogue.characterRange.end)
          .trim(),
      ],
      styledTextToHtml: () => true,
      withHiddenElementsRemoved: () =>
        createMockScript(document, script, titlePage),
    } as any as FountainScript;
  };

  describe("generateInstructions", () => {
    it("should generate new-page instruction as first instruction", () => {
      const script = createMockScript("INT. OFFICE - DAY", [
        { kind: "scene", range: { start: 0, end: 17 } } as Scene,
      ]);

      const instructions = generateInstructions(script);

      expect(instructions.length).toBeGreaterThan(0);
      expect(instructions[0]).toEqual({
        type: "new-page",
        width: 612,
        height: 792,
      } as NewPageInstruction);
    });

    it("should generate text instruction for scene heading", () => {
      const script = createMockScript("INT. OFFICE - DAY", [
        { kind: "scene", range: { start: 0, end: 17 } } as Scene,
      ]);

      const instructions = generateInstructions(script);

      const textInstructions = instructions.filter(
        (inst) => inst.type === "text",
      ) as TextInstruction[];

      expect(textInstructions.length).toBeGreaterThan(0);

      const sceneInstruction = textInstructions.find(
        (inst) => inst.data === "INT. OFFICE - DAY",
      );
      expect(sceneInstruction).toBeDefined();
      expect(sceneInstruction!.bold).toBe(false);
      expect(sceneInstruction!.italic).toBe(false);
      expect(sceneInstruction!.underline).toBe(false);
      expect(sceneInstruction!.x).toBe(108); // SCENE_HEADING_INDENT
    });

    it("should generate text instructions for action blocks", () => {
      const script = createMockScript("John enters the room.", [
        {
          kind: "action",
          lines: [
            {
              elements: [{ kind: "text", range: { start: 0, end: 21 } }],
            },
          ],
        } as Action,
      ]);

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
      expect(actionText!.x).toBe(108); // ACTION_INDENT
    });

    it("should generate instructions for dialogue", () => {
      const script = createMockScript("JOHN\nHello, world!", [
        {
          kind: "dialogue",
          characterRange: { start: 0, end: 4 },
          characterExtensionsRange: { start: 4, end: 4 },
          parenthetical: null,
          lines: [
            {
              elements: [{ kind: "text", range: { start: 5, end: 17 } }],
            },
          ],
        } as Dialogue,
      ]);

      const instructions = generateInstructions(script);

      const textInstructions = instructions.filter(
        (inst) => inst.type === "text",
      ) as TextInstruction[];

      // Should have character name and dialogue text
      const characterInstruction = textInstructions.find(
        (inst) => inst.data === "JOHN",
      );
      expect(characterInstruction).toBeDefined();
      expect(characterInstruction!.x).toBe(288); // CHARACTER_INDENT

      const dialogueText = textInstructions.find(
        (inst) => inst.data.includes("Hello") || inst.data.includes("world"),
      );
      expect(dialogueText).toBeDefined();
      expect(dialogueText!.x).toBe(180); // DIALOGUE_INDENT
    });

    it("should generate instructions for dialogue with parenthetical", () => {
      const script = createMockScript("JOHN\n(softly)\nHello there.", [
        {
          kind: "dialogue",
          characterRange: { start: 0, end: 4 },
          characterExtensionsRange: { start: 4, end: 4 },
          parenthetical: { start: 5, end: 13 },
          lines: [
            {
              elements: [{ kind: "text", range: { start: 14, end: 25 } }],
            },
          ],
        } as Dialogue,
      ]);

      const instructions = generateInstructions(script);
      const textInstructions = instructions.filter(
        (inst) => inst.type === "text",
      ) as TextInstruction[];

      const parentheticalInstruction = textInstructions.find(
        (inst) => inst.data === "(softly)",
      );
      expect(parentheticalInstruction).toBeDefined();
      expect(parentheticalInstruction!.x).toBe(234); // PARENTHETICAL_INDENT
    });

    it("should generate instructions for transitions", () => {
      const script = createMockScript("FADE OUT.", [
        { kind: "transition", range: { start: 0, end: 9 } } as Transition,
      ]);

      const instructions = generateInstructions(script);
      const textInstructions = instructions.filter(
        (inst) => inst.type === "text",
      ) as TextInstruction[];

      const transitionInstruction = textInstructions.find(
        (inst) => inst.data === "FADE OUT.",
      );
      expect(transitionInstruction).toBeDefined();
      // Should be right-aligned (position depends on text width estimation)
      expect(transitionInstruction!.x).toBeLessThan(522); // Should be less than TRANSITION_INDENT
    });

    it("should generate title page instructions", () => {
      const script = createMockScript(
        "Test Title",
        [],
        [
          {
            key: "title",
            values: [[{ kind: "text", range: { start: 0, end: 10 } }]],
          },
        ],
      );

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
      const script = createMockScript("This is **bold** text.", [
        {
          kind: "action",
          lines: [
            {
              elements: [
                { kind: "text", range: { start: 0, end: 8 } }, // "This is "
                {
                  kind: "bold",
                  elements: [
                    { kind: "text", range: { start: 10, end: 14 } }, // "bold"
                  ],
                },
                { kind: "text", range: { start: 16, end: 22 } }, // " text."
              ],
            },
          ],
        } as Action,
      ]);

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
      expect(boldInstruction!.bold).toBe(true);

      const normalInstructions = textInstructions.filter(
        (inst) => inst.data !== "bold",
      );
      normalInstructions.forEach((inst) => {
        expect(inst.bold).toBe(false);
      });
    });

    it("should use PDF coordinate system (bottom-left origin)", () => {
      const script = createMockScript("INT. OFFICE - DAY", [
        { kind: "scene", range: { start: 0, end: 17 } } as Scene,
      ]);

      const instructions = generateInstructions(script);
      const textInstructions = instructions.filter(
        (inst) => inst.type === "text",
      ) as TextInstruction[];

      textInstructions.forEach((instruction) => {
        expect(instruction.x).toBeGreaterThan(0);
        expect(instruction.y).toBeGreaterThan(0);
        // Y coordinate should be converted from top-origin to bottom-origin
        expect(instruction.y).toBeLessThan(792); // PAGE_HEIGHT
      });
    });

    it("should use character limits from PageState for text wrapping", () => {
      // Test that character limits are read from PageState, not hardcoded
      const longActionText = "A".repeat(100); // Text longer than any character limit
      const script = createMockScript(longActionText, [
        {
          kind: "action",
          range: { start: 0, end: longActionText.length },
          lines: [
            {
              range: { start: 0, end: longActionText.length },
              elements: [
                {
                  range: { start: 0, end: longActionText.length },
                  kind: "text",
                },
              ],
              centered: false,
            },
          ],
        } as Action,
      ]);

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
      const script = createMockScript(
        "INT. OFFICE - DAY\n\nJohn enters the room.",
        [
          { kind: "scene", range: { start: 0, end: 17 } } as Scene,
          {
            kind: "action",
            range: { start: 19, end: 40 },
            lines: [
              {
                range: { start: 19, end: 40 },
                elements: [
                  {
                    range: { start: 19, end: 40 },
                    kind: "text",
                  },
                ],
                centered: false,
              },
            ],
          } as Action,
        ],
      );

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
      expect(letterNewPage!.width).toBe(612); // Letter width
      expect(letterNewPage!.height).toBe(792); // Letter height
      expect(a4NewPage!.width).toBe(595.28); // A4 width
      expect(a4NewPage!.height).toBe(841.89); // A4 height

      // Text positioning should remain consistent (same left margin and indentations)
      const letterTextInstructions = letterInstructions.filter(
        (inst): inst is TextInstruction => inst.type === "text",
      );
      const a4TextInstructions = a4Instructions.filter(
        (inst): inst is TextInstruction => inst.type === "text",
      );

      // All text should use the same left margin (108pt = 1.5")
      letterTextInstructions.forEach((inst) => {
        expect(inst.x).toBeGreaterThanOrEqual(108); // At or beyond left margin
      });
      a4TextInstructions.forEach((inst) => {
        expect(inst.x).toBeGreaterThanOrEqual(108); // At or beyond left margin
      });

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
          gray: false,
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
          gray: false,
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
          gray: false,
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
          gray: false,
        },
        {
          type: "text",
          data: "Italic Text",
          x: 200,
          y: 700,
          bold: false,
          italic: true,
          underline: false,
          gray: false,
        },
        {
          type: "text",
          data: "Underline text",
          x: 72,
          y: 680,
          bold: false,
          italic: false,
          underline: true,
          gray: false,
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
          gray: false,
        },
      ];

      await expect(renderInstructionsToPDF(instructions)).rejects.toThrow(
        "Text instruction encountered without a current page",
      );
    });
  });

  describe("End-to-end integration", () => {
    it("should generate complete PDF from fountain script", async () => {
      const script = createMockScript(
        "INT. OFFICE - DAY\n\nJohn enters the room.\n\nJOHN\nHello, world!\n\nFADE OUT.",
        [
          { kind: "scene", range: { start: 0, end: 17 } } as Scene,
          {
            kind: "action",
            lines: [
              {
                elements: [{ kind: "text", range: { start: 19, end: 40 } }],
              },
            ],
          } as Action,
          {
            kind: "dialogue",
            characterRange: { start: 42, end: 46 },
            characterExtensionsRange: { start: 46, end: 46 },
            parenthetical: null,
            lines: [
              {
                elements: [{ kind: "text", range: { start: 47, end: 59 } }],
              },
            ],
          } as Dialogue,
          { kind: "transition", range: { start: 61, end: 70 } } as Transition,
        ],
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
      expect(allText).toContain("FADE OUT");

      // Should have multiple text instructions
      expect(textInstructions.length).toBeGreaterThan(3);
    });

    it("should generate reasonable page count for typical script", () => {
      // Create a script that simulates a typical short screenplay
      const typicalScript = createMockScript(
        "INT. OFFICE - DAY\n\nJohn sits at his desk, typing.\n\nJOHN\nThis is taking forever.\n\nHe looks up as Sarah enters.\n\nSARAH\nAny progress on the report?\n\nJOHN\n(sighing)\nAlmost done.\n\nSarah nods and exits.\n\nJOHN (CONT'D)\nFinally, some peace.\n\nHe returns to typing.\n\nFADE OUT.\n\nINT. HALLWAY - MOMENTS LATER\n\nSarah walks down the hallway.\n\nSARAH\n(to herself)\nHe'll never finish on time.\n\nShe disappears around the corner.\n\nFADE OUT.",
        [
          { kind: "scene", range: { start: 0, end: 17 } } as Scene,
          {
            kind: "action",
            lines: [
              {
                elements: [{ kind: "text", range: { start: 19, end: 49 } }],
              },
            ],
          } as Action,
          {
            kind: "dialogue",
            characterRange: { start: 51, end: 55 },
            characterExtensionsRange: { start: 55, end: 55 },
            parenthetical: null,
            lines: [
              {
                elements: [{ kind: "text", range: { start: 56, end: 77 } }],
              },
            ],
          } as Dialogue,
          {
            kind: "action",
            lines: [
              {
                elements: [{ kind: "text", range: { start: 79, end: 110 } }],
              },
            ],
          } as Action,
          {
            kind: "dialogue",
            characterRange: { start: 112, end: 117 },
            characterExtensionsRange: { start: 117, end: 117 },
            parenthetical: null,
            lines: [
              {
                elements: [{ kind: "text", range: { start: 118, end: 150 } }],
              },
            ],
          } as Dialogue,
          {
            kind: "dialogue",
            characterRange: { start: 152, end: 156 },
            characterExtensionsRange: { start: 156, end: 156 },
            parenthetical: { start: 157, end: 166 },
            lines: [
              {
                elements: [{ kind: "text", range: { start: 167, end: 178 } }],
              },
            ],
          } as Dialogue,
        ],
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
      textInstructions.forEach((instruction) => {
        expect(instruction.y).toBeGreaterThan(0);
        expect(instruction.y).toBeLessThan(792); // Page height
      });
    });

    describe("withHiddenElementsRemoved", () => {
      test("should remove notes when hideNotes is true", () => {
        const script = new FountainScript(
          "This is action text.\n[[This is a note]]\n\nMore action text.",
          [],
          [
            {
              kind: "action",
              range: { start: 0, end: 65 },
              lines: [
                {
                  range: { start: 0, end: 19 },
                  elements: [{ kind: "text", range: { start: 0, end: 19 } }],
                  centered: false,
                },
                {
                  range: { start: 20, end: 38 },
                  elements: [
                    {
                      kind: "note",
                      noteKind: "note",
                      range: { start: 20, end: 38 },
                      textRange: { start: 22, end: 36 },
                    },
                  ],
                  centered: false,
                },
                {
                  range: { start: 40, end: 57 },
                  elements: [{ kind: "text", range: { start: 40, end: 57 } }],
                  centered: false,
                },
              ],
            } as Action,
          ],
        );

        const filtered = script.withHiddenElementsRemoved({ hideNotes: true });

        expect(filtered.script).toHaveLength(1);
        expect(filtered.script[0].kind).toBe("action");
        const actionBlock = filtered.script[0] as Action;
        expect(actionBlock.lines).toHaveLength(2); // Note line should be removed
        expect(actionBlock.lines[0].elements).toHaveLength(1);
        expect(actionBlock.lines[0].elements[0].kind).toBe("text");
      });

      test("should remove synopsis when hideSynopsis is true", () => {
        const script = new FountainScript(
          "= This is a synopsis\n\nThis is action text.",
          [],
          [
            {
              kind: "synopsis",
              range: { start: 0, end: 20 },
              linesOfText: [{ start: 2, end: 20 }],
            },
            {
              kind: "action",
              range: { start: 22, end: 44 },
              lines: [
                {
                  range: { start: 22, end: 44 },
                  elements: [{ kind: "text", range: { start: 22, end: 44 } }],
                  centered: false,
                },
              ],
            } as Action,
          ],
        );

        const filtered = script.withHiddenElementsRemoved({
          hideSynopsis: true,
        });

        expect(filtered.script).toHaveLength(1);
        expect(filtered.script[0].kind).toBe("action");
      });

      test("should remove action blocks that become empty after filtering", () => {
        const script = new FountainScript(
          "[[This is a note]]",
          [],
          [
            {
              kind: "action",
              range: { start: 0, end: 18 },
              lines: [
                {
                  range: { start: 0, end: 18 },
                  elements: [
                    {
                      kind: "note",
                      noteKind: "note",
                      range: { start: 0, end: 18 },
                      textRange: { start: 2, end: 16 },
                    },
                  ],
                  centered: false,
                },
              ],
            } as Action,
          ],
        );

        const filtered = script.withHiddenElementsRemoved({ hideNotes: true });

        expect(filtered.script).toHaveLength(0); // Action block should be completely removed
      });

      test("should stop processing at boneyard section when hideBoneyard is true", () => {
        const script = new FountainScript(
          "This is action text.\n\n# BONEYARD\n\nThis should be hidden.",
          [],
          [
            {
              kind: "action",
              range: { start: 0, end: 19 },
              lines: [
                {
                  range: { start: 0, end: 19 },
                  elements: [{ kind: "text", range: { start: 0, end: 19 } }],
                  centered: false,
                },
              ],
            } as Action,
            {
              kind: "section",
              range: { start: 22, end: 33 },
              depth: 1,
            },
            {
              kind: "action",
              range: { start: 35, end: 58 },
              lines: [
                {
                  range: { start: 35, end: 58 },
                  elements: [{ kind: "text", range: { start: 35, end: 58 } }],
                  centered: false,
                },
              ],
            } as Action,
          ],
        );

        const filtered = script.withHiddenElementsRemoved({
          hideBoneyard: true,
        });

        expect(filtered.script).toHaveLength(1); // Only first action should remain
        expect(filtered.script[0].kind).toBe("action");
      });
    });

    test("should preserve empty lines in action blocks", () => {
      const script = new FountainScript(
        "Test\n\n\n\nthree empty lines",
        [],
        [
          {
            kind: "action",
            range: { start: 0, end: 22 },
            lines: [
              {
                range: { start: 0, end: 4 },
                elements: [{ kind: "text", range: { start: 0, end: 4 } }],
                centered: false,
              },
              {
                range: { start: 5, end: 5 },
                elements: [],
                centered: false,
              },
              {
                range: { start: 6, end: 6 },
                elements: [],
                centered: false,
              },
              {
                range: { start: 7, end: 7 },
                elements: [],
                centered: false,
              },
              {
                range: { start: 8, end: 22 },
                elements: [{ kind: "text", range: { start: 8, end: 22 } }],
                centered: false,
              },
            ],
          } as Action,
        ],
      );

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
      const script = new FountainScript(
        "This is visible text.\n[[This line only has a note]]\nAnother visible line.",
        [],
        [
          {
            kind: "action",
            range: { start: 0, end: 68 },
            lines: [
              {
                range: { start: 0, end: 21 },
                elements: [{ kind: "text", range: { start: 0, end: 21 } }],
                centered: false,
              },
              {
                range: { start: 22, end: 49 },
                elements: [
                  {
                    kind: "note",
                    noteKind: "note",
                    range: { start: 22, end: 49 },
                    textRange: { start: 24, end: 47 },
                  },
                ],
                centered: false,
              },
              {
                range: { start: 50, end: 68 },
                elements: [{ kind: "text", range: { start: 50, end: 68 } }],
                centered: false,
              },
            ],
          } as Action,
        ],
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
      const script = new FountainScript(
        "= This is a synopsis\n\nThis is action [[with a note]] text.",
        [],
        [
          {
            kind: "synopsis",
            range: { start: 0, end: 20 },
            linesOfText: [{ start: 2, end: 20 }],
          } as Synopsis,
          {
            kind: "action",
            range: { start: 22, end: 63 },
            lines: [
              {
                range: { start: 22, end: 63 },
                elements: [
                  { kind: "text", range: { start: 22, end: 37 } },
                  {
                    kind: "note",
                    noteKind: "note",
                    range: { start: 37, end: 52 },
                    textRange: { start: 39, end: 50 },
                  },
                  { kind: "text", range: { start: 52, end: 58 } },
                ],
                centered: false,
              },
            ],
          } as Action,
        ],
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
      expect(synopsisInstruction!.italic).toBe(true);
      expect(synopsisInstruction!.gray).toBe(true);

      // Find note instruction (notes get broken into individual words)
      const noteInstruction = instructions.find(
        (inst): inst is TextInstruction =>
          inst.type === "text" && inst.data === "note",
      );
      expect(noteInstruction).toBeDefined();
      expect(noteInstruction!.italic).toBe(true);
      expect(noteInstruction!.gray).toBe(true);

      // Also verify that "with" (first word of note) has correct formatting
      const noteWordInstruction = instructions.find(
        (inst): inst is TextInstruction =>
          inst.type === "text" && inst.data === "with",
      );
      expect(noteWordInstruction).toBeDefined();
      expect(noteWordInstruction!.italic).toBe(true);
      expect(noteWordInstruction!.gray).toBe(true);
    });
  });
});
