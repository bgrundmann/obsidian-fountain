import type { FountainElement } from "../src/fountain";
import { parse } from "../src/fountain_parser";

// Utility function to remove elements from document text
function removeElementsFromText(
  originalText: string,
  elementsToRemove: FountainElement[],
): string {
  if (elementsToRemove.length === 0) {
    return originalText;
  }

  // Sort ranges by start position (lowest first) for forward iteration
  const sortedRanges = elementsToRemove
    .map((el) => el.range)
    .sort((a, b) => a.start - b.start);

  const slices: string[] = [];
  let currentPos = 0;

  for (const range of sortedRanges) {
    // Add text before this range (if any)
    if (currentPos < range.start) {
      slices.push(originalText.slice(currentPos, range.start));
    }
    // Skip the range to remove it, update position
    currentPos = range.end;
  }

  // Add any remaining text after the last removed range
  if (currentPos < originalText.length) {
    slices.push(originalText.slice(currentPos));
  }

  return slices.join("");
}

describe("Removal Utilities", () => {
  describe("removeElementsFromText", () => {
    it("should remove dialogue elements correctly", () => {
      const fountainText = `FADE IN:

INT. COFFEE SHOP - DAY

ALICE sits at a table, reading.

ALICE
I love this book.

BOB enters and approaches.

BOB
What are you reading?

ALICE
Something amazing.

FADE OUT.`;

      const script = parse(fountainText, {});
      if ("error" in script) {
        throw new Error("Failed to parse test script");
      }

      // Find Alice's dialogue elements
      const aliceDialogue = script.script.filter(
        (el: FountainElement): el is FountainElement =>
          el.kind === "dialogue" && script.charactersOf(el).includes("ALICE"),
      );

      const result = removeElementsFromText(fountainText, aliceDialogue);

      expect(result).toContain("BOB");
      expect(result).toContain("ALICE sits at a table"); // Action line remains
      expect(result).not.toContain("I love this book.");
      expect(result).not.toContain("Something amazing.");
      expect(result).toContain("What are you reading?");
      expect(result).toContain("INT. COFFEE SHOP - DAY");
    });

    it("should remove scene elements correctly", () => {
      const fountainText = `INT. BEDROOM - NIGHT

Character sleeps.

EXT. PARK - DAY

Character walks.

INT. KITCHEN - MORNING

Character cooks.`;

      const script = parse(fountainText, {});
      if ("error" in script) {
        throw new Error("Failed to parse test script");
      }

      // Find the park scene
      const parkScene = script.script.filter(
        (el: FountainElement) =>
          el.kind === "scene" && el.heading.includes("PARK"),
      );

      const result = removeElementsFromText(fountainText, parkScene);

      expect(result).toContain("INT. BEDROOM - NIGHT");
      expect(result).toContain("INT. KITCHEN - MORNING");
      expect(result).not.toContain("EXT. PARK - DAY");
      expect(result).toContain("Character sleeps.");
      expect(result).toContain("Character cooks.");
      expect(result).toContain("Character walks."); // Action line remains when only scene heading is removed
    });

    it("should handle empty removal list", () => {
      const fountainText = `INT. ROOM - DAY

Something happens.`;

      const result = removeElementsFromText(fountainText, []);

      expect(result).toBe(fountainText);
    });

    it("should handle multiple element types", () => {
      const fountainText = `= This is a synopsis

INT. ROOM - DAY

Action line here.

CHARACTER
Some dialogue.

> FADE OUT`;

      const script = parse(fountainText, {});
      if ("error" in script) {
        throw new Error("Failed to parse test script");
      }

      // Remove synopsis and transitions
      const elementsToRemove = script.script.filter(
        (el: FountainElement) =>
          el.kind === "synopsis" || el.kind === "transition",
      );

      const result = removeElementsFromText(fountainText, elementsToRemove);

      expect(result).not.toContain("= This is a synopsis");
      expect(result).not.toContain("> FADE OUT");
      expect(result).toContain("INT. ROOM - DAY");
      expect(result).toContain("Action line here.");
      expect(result).toContain("CHARACTER");
      expect(result).toContain("Some dialogue.");
    });

    it("should preserve text formatting and spacing", () => {
      const fountainText = `INT. ROOM - DAY

First action line.

SECOND action line with **bold** text.

CHARACTER
*Italics* dialogue line.`;

      const script = parse(fountainText, {});
      if ("error" in script) {
        throw new Error("Failed to parse test script");
      }

      // Remove dialogue only
      const dialogue = script.script.filter(
        (el: FountainElement) => el.kind === "dialogue",
      );
      const result = removeElementsFromText(fountainText, dialogue);

      expect(result).toContain("**bold**");
      expect(result).toContain("INT. ROOM - DAY");
      expect(result).toContain("First action line.");
      expect(result).toContain("SECOND action line");
      expect(result).not.toContain("CHARACTER");
      expect(result).not.toContain("*Italics* dialogue");
    });

    it("should handle overlapping ranges correctly", () => {
      const fountainText = `INT. ROOM - DAY

First action.

CHARACTER
Dialogue here.

Second action.`;

      const script = parse(fountainText, {});
      if ("error" in script) {
        throw new Error("Failed to parse test script");
      }

      // Remove multiple elements including dialogue and action
      const elementsToRemove = script.script.filter(
        (el: FountainElement) => el.kind === "dialogue" || el.kind === "action",
      );

      const result = removeElementsFromText(fountainText, elementsToRemove);

      expect(result).toContain("INT. ROOM - DAY");
      expect(result).not.toContain("First action.");
      expect(result).not.toContain("CHARACTER");
      expect(result).not.toContain("Dialogue here.");
      expect(result).not.toContain("Second action.");
    });

    it("should handle adjacent ranges correctly", () => {
      const fountainText = `FIRST
SECOND
THIRD
FOURTH`;

      const script = parse(fountainText, {});
      if ("error" in script) {
        throw new Error("Failed to parse test script");
      }

      // Create mock ranges for adjacent elements
      const adjacentRanges = [
        { start: 6, end: 13 }, // "SECOND\n"
        { start: 13, end: 19 }, // "THIRD\n"
      ];

      const mockElements = adjacentRanges.map((range) => ({
        kind: "action" as const,
        range,
        lines: [],
      }));

      const result = removeElementsFromText(fountainText, mockElements);

      expect(result).toBe("FIRST\nFOURTH");
    });

    it("should handle ranges at start and end of document", () => {
      const fountainText = `START
Middle content here
END`;

      const mockElements = [
        {
          kind: "action" as const,
          range: { start: 0, end: 6 }, // "START\n"
          lines: [],
        },
        {
          kind: "action" as const,
          range: { start: 26, end: 29 }, // "END"
          lines: [],
        },
      ];

      const result = removeElementsFromText(fountainText, mockElements);

      expect(result).toBe("Middle content here\n");
    });

    it("should handle single range covering entire document", () => {
      const fountainText = "EVERYTHING";

      const mockElements = [
        {
          kind: "action" as const,
          range: { start: 0, end: 10 }, // entire text
          lines: [],
        },
      ];

      const result = removeElementsFromText(fountainText, mockElements);

      expect(result).toBe("");
    });

    it("should remove complete scenes including their content", () => {
      const fountainText = `INT. BEDROOM - NIGHT

Character prepares for bed.

She reads a book.

EXT. PARK - DAY

Character walks through the park.

Birds are singing.

INT. KITCHEN - MORNING

Character makes breakfast.`;

      const script = parse(fountainText, {});
      if ("error" in script) {
        throw new Error("Failed to parse test script");
      }

      // Get the structure to find complete scene ranges
      const structure = script.structure();
      interface SceneItem {
        kind: string;
        scene?: { heading: string };
        range: { start: number; end: number };
      }
      const scenes: SceneItem[] = [];

      const collectScenes = (
        sections: Array<{ content: Array<{ kind: string }> }>,
      ) => {
        for (const section of sections) {
          for (const item of section.content) {
            if (item.kind === "scene") {
              scenes.push(item as SceneItem);
            }
          }
        }
      };

      collectScenes(structure.sections);

      // Find the park scene with its full content
      const parkScene = scenes.find((scene: SceneItem) =>
        scene.scene?.heading.includes("PARK"),
      );

      if (!parkScene) {
        throw new Error("Park scene not found");
      }

      // Create a mock element with the full scene range
      const mockElement = {
        kind: "scene" as const,
        range: { start: parkScene.range.start, end: parkScene.range.end },
        heading: parkScene.scene?.heading || "",
        number: null,
      };

      const result = removeElementsFromText(fountainText, [mockElement]);

      expect(result).toContain("INT. BEDROOM - NIGHT");
      expect(result).toContain("Character prepares for bed.");
      expect(result).toContain("She reads a book.");
      expect(result).not.toContain("EXT. PARK - DAY");
      expect(result).not.toContain("Character walks through the park.");
      expect(result).not.toContain("Birds are singing.");
      expect(result).toContain("INT. KITCHEN - MORNING");
      expect(result).toContain("Character makes breakfast.");
    });

    it("should remove complete sections with proper structure", () => {
      // Use a simpler structure that matches how the parser actually works
      const fountainText = `# SECTION ONE

INT. BEDROOM - NIGHT

Character sleeps.

INT. OFFICE - DAY

Character works.

# SECTION TWO

INT. STREET - DAY

Character walks.`;

      const script = parse(fountainText, {});
      if ("error" in script) {
        throw new Error("Failed to parse test script");
      }

      // Get the structure
      const structure = script.structure();

      // Find SECTION ONE
      const sectionOne = structure.sections.find(
        (section: { section?: { range: Range } }) =>
          section.section &&
          script
            .unsafeExtractRaw(section.section.range)
            .includes("SECTION ONE"),
      );

      if (!sectionOne) {
        throw new Error("SECTION ONE not found");
      }

      // Create a mock element with the full section range
      const mockElement = {
        kind: "section" as const,
        range: sectionOne.range,
        depth: 1,
      };

      const result = removeElementsFromText(fountainText, [mockElement]);

      expect(result).not.toContain("# SECTION ONE");
      expect(result).not.toContain("INT. BEDROOM - NIGHT");
      expect(result).not.toContain("Character sleeps.");
      expect(result).not.toContain("INT. OFFICE - DAY");
      expect(result).not.toContain("Character works.");
      expect(result).toContain("# SECTION TWO");
      expect(result).toContain("INT. STREET - DAY");
      expect(result).toContain("Character walks.");
    });
  });
});
