import type {
  FountainElement,
  FountainScript,
  SceneHeading,
} from "../src/fountain";
import { parse } from "../src/fountain_parser";

describe("Scene numbering functionality", () => {
  describe("Add scene numbers", () => {
    test("adds numbers to scenes without existing numbers", () => {
      const input =
        "INT. HOUSE - DAY\n\nEXT. PARK - NIGHT\n\nINT. CAR - DAY\n\n";
      const script = parse(input, {});

      const scenes = script.script.filter(
        (element: FountainElement): element is SceneHeading =>
          element.kind === "scene",
      );

      expect(scenes).toHaveLength(3);
      expect(scenes[0].number).toBe(null);
      expect(scenes[1].number).toBe(null);
      expect(scenes[2].number).toBe(null);

      // Simulate adding scene numbers
      let currentNumber = 1;
      const modifications: Array<{
        range: { start: number; end: number };
        replacement: string;
      }> = [];

      for (const scene of scenes) {
        if (scene.number === null) {
          const insertPosition = scene.range.start + scene.heading.length;
          modifications.push({
            range: { start: insertPosition, end: insertPosition },
            replacement: ` #${currentNumber}#`,
          });
          currentNumber++;
        }
      }

      // Apply modifications in reverse order
      let result = script.document;
      for (let i = modifications.length - 1; i >= 0; i--) {
        const mod = modifications[i];
        result =
          result.slice(0, mod.range.start) +
          mod.replacement +
          result.slice(mod.range.end);
      }

      expect(result).toBe(
        "INT. HOUSE - DAY #1#\n\nEXT. PARK - NIGHT #2#\n\nINT. CAR - DAY #3#\n\n",
      );
    });

    test("continues numbering from existing numeric scene numbers", () => {
      const input =
        "INT. HOUSE - DAY\n\nEXT. PARK - NIGHT #5#\n\nINT. CAR - DAY\n\n";
      const script = parse(input, {});

      const scenes = script.script.filter(
        (element: FountainElement): element is SceneHeading =>
          element.kind === "scene",
      );

      expect(scenes).toHaveLength(3);
      expect(scenes[0].number).toBe(null);
      expect(scenes[1].number).not.toBe(null);
      expect(scenes[2].number).toBe(null);

      // Simulate adding scene numbers with continuation logic
      let currentNumber = 1;
      const modifications: Array<{
        range: { start: number; end: number };
        replacement: string;
      }> = [];

      for (const scene of scenes) {
        if (scene.number === null) {
          const insertPosition = scene.range.start + scene.heading.length;
          modifications.push({
            range: { start: insertPosition, end: insertPosition },
            replacement: ` #${currentNumber}#`,
          });
          currentNumber++;
        } else {
          // Parse existing number
          const existingNumberText = script.document.substring(
            scene.number.start + 1,
            scene.number.end - 1,
          );
          const parsedNumber = Number.parseInt(existingNumberText, 10);
          if (!isNaN(parsedNumber)) {
            currentNumber = parsedNumber + 1;
          }
        }
      }

      // Apply modifications in reverse order
      let result = script.document;
      for (let i = modifications.length - 1; i >= 0; i--) {
        const mod = modifications[i];
        result =
          result.slice(0, mod.range.start) +
          mod.replacement +
          result.slice(mod.range.end);
      }

      expect(result).toBe(
        "INT. HOUSE - DAY #1#\n\nEXT. PARK - NIGHT #5#\n\nINT. CAR - DAY #6#\n\n",
      );
    });

    test("handles complex example from user request", () => {
      const input =
        ".A SCENE\n\n.B SCENE #5A#\n\n.C SCENE\n\n.D SCENE #6#\n\n.E SCENE\n\n";
      const script = parse(input, {});

      const scenes = script.script.filter(
        (element: FountainElement): element is SceneHeading =>
          element.kind === "scene",
      );

      // Simulate the numbering logic
      let nextSequentialNumber = 1;
      const modifications: Array<{
        range: { start: number; end: number };
        replacement: string;
      }> = [];

      for (const scene of scenes) {
        if (scene.number === null) {
          const insertPosition = scene.range.start + scene.heading.length;
          modifications.push({
            range: { start: insertPosition, end: insertPosition },
            replacement: ` #${nextSequentialNumber}#`,
          });
          nextSequentialNumber++;
        } else {
          // Check if it's purely numeric
          const existingNumberText = script.document.substring(
            scene.number.start + 1,
            scene.number.end - 1,
          );
          const parsedNumber = Number.parseInt(existingNumberText, 10);
          // Only update counter if the number is purely numeric
          if (
            !isNaN(parsedNumber) &&
            parsedNumber.toString() === existingNumberText.trim()
          ) {
            // Continue numbering from this purely numeric scene number
            nextSequentialNumber = parsedNumber + 1;
          }
          // Non-purely-numeric scene numbers (like "5A") don't affect the counter
        }
      }

      // Apply modifications in reverse order
      let result = script.document;
      for (let i = modifications.length - 1; i >= 0; i--) {
        const mod = modifications[i];
        result =
          result.slice(0, mod.range.start) +
          mod.replacement +
          result.slice(mod.range.end);
      }

      // The corrected logic:
      // A SCENE: no number -> gets #1#, nextSequentialNumber becomes 2
      // B SCENE #5A#: has number "5A", but "5A" !== "5" so it's not purely numeric, nextSequentialNumber stays 2
      // C SCENE: no number -> gets #2#, nextSequentialNumber becomes 3
      // D SCENE #6#: has number "6", "6" === "6" so it's purely numeric, nextSequentialNumber becomes 7
      // E SCENE: no number -> gets #7#, nextSequentialNumber becomes 8

      expect(result).toBe(
        ".A SCENE #1#\n\n.B SCENE #5A#\n\n.C SCENE #2#\n\n.D SCENE #6#\n\n.E SCENE #7#\n\n",
      );
    });

    test("ignores non-numeric scene numbers", () => {
      const input =
        "INT. HOUSE - DAY\n\nEXT. PARK - NIGHT #ABC#\n\nINT. CAR - DAY\n\n";
      const script = parse(input, {});

      const scenes = script.script.filter(
        (element: FountainElement): element is SceneHeading =>
          element.kind === "scene",
      );

      let currentNumber = 1;
      const modifications: Array<{
        range: { start: number; end: number };
        replacement: string;
      }> = [];

      for (const scene of scenes) {
        if (scene.number === null) {
          const insertPosition = scene.range.start + scene.heading.length;
          modifications.push({
            range: { start: insertPosition, end: insertPosition },
            replacement: ` #${currentNumber}#`,
          });
          currentNumber++;
        } else {
          const existingNumberText = script.document.substring(
            scene.number.start + 1,
            scene.number.end - 1,
          );
          const parsedNumber = Number.parseInt(existingNumberText, 10);
          // Only update if purely numeric
          if (
            !isNaN(parsedNumber) &&
            parsedNumber.toString() === existingNumberText.trim()
          ) {
            currentNumber = parsedNumber + 1;
          }
          // Non-purely-numeric numbers like "ABC" don't affect the counter
        }
      }

      let result = script.document;
      for (let i = modifications.length - 1; i >= 0; i--) {
        const mod = modifications[i];
        result =
          result.slice(0, mod.range.start) +
          mod.replacement +
          result.slice(mod.range.end);
      }

      expect(result).toBe(
        "INT. HOUSE - DAY #1#\n\nEXT. PARK - NIGHT #ABC#\n\nINT. CAR - DAY #2#\n\n",
      );
    });
  });

  describe("Remove scene numbers", () => {
    test("removes all scene numbers", () => {
      const input =
        "INT. HOUSE - DAY #1#\n\nEXT. PARK - NIGHT #2A#\n\nINT. CAR - DAY #III#\n\n";
      const script = parse(input, {});

      const scenes = script.script.filter(
        (element: FountainElement): element is SceneHeading =>
          element.kind === "scene",
      );

      // Simulate removing scene numbers in reverse order
      let result = script.document;

      for (let i = scenes.length - 1; i >= 0; i--) {
        const scene = scenes[i];
        if (scene.number !== null) {
          // Remove the scene number including any spaces before it
          const beforeNumber = result.substring(
            scene.range.start + scene.heading.length,
            scene.number.start,
          );
          const spacesToRemove = beforeNumber.match(/\s*$/)?.[0] ?? "";
          const startPos = scene.number.start - spacesToRemove.length;

          result = result.slice(0, startPos) + result.slice(scene.number.end);
        }
      }

      expect(result).toBe(
        "INT. HOUSE - DAY\n\nEXT. PARK - NIGHT\n\nINT. CAR - DAY\n\n",
      );
    });

    test("handles scenes with spaces around numbers", () => {
      const input =
        "INT. HOUSE - DAY  #1#  \n\nEXT. PARK - NIGHT   #2A#   \n\n";
      const script = parse(input, {});

      const scenes = script.script.filter(
        (element: FountainElement): element is SceneHeading =>
          element.kind === "scene",
      );

      let result = script.document;

      for (let i = scenes.length - 1; i >= 0; i--) {
        const scene = scenes[i];
        if (scene.number !== null) {
          const beforeNumber = result.substring(
            scene.range.start + scene.heading.length,
            scene.number.start,
          );
          const spacesToRemove = beforeNumber.match(/\s*$/)?.[0] ?? "";
          const startPos = scene.number.start - spacesToRemove.length;

          result = result.slice(0, startPos) + result.slice(scene.number.end);
        }
      }

      // Should remove spaces before the number but keep trailing spaces
      expect(result).toBe("INT. HOUSE - DAY  \n\nEXT. PARK - NIGHT   \n\n");
    });

    test("leaves scenes without numbers unchanged", () => {
      const input =
        "INT. HOUSE - DAY\n\nEXT. PARK - NIGHT #2A#\n\nINT. CAR - DAY\n\n";
      const script = parse(input, {});

      const scenes = script.script.filter(
        (element: FountainElement): element is SceneHeading =>
          element.kind === "scene",
      );

      let result = script.document;

      for (let i = scenes.length - 1; i >= 0; i--) {
        const scene = scenes[i];
        if (scene.number !== null) {
          const beforeNumber = result.substring(
            scene.range.start + scene.heading.length,
            scene.number.start,
          );
          const spacesToRemove = beforeNumber.match(/\s*$/)?.[0] ?? "";
          const startPos = scene.number.start - spacesToRemove.length;

          result = result.slice(0, startPos) + result.slice(scene.number.end);
        }
      }

      expect(result).toBe(
        "INT. HOUSE - DAY\n\nEXT. PARK - NIGHT\n\nINT. CAR - DAY\n\n",
      );
    });
  });
});
