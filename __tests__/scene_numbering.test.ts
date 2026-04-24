import {
  applyEdits,
  computeAddSceneNumberEdits,
  computeRemoveSceneNumberEdits,
} from "../src/fountain";
import { parse } from "../src/fountain/parser";

describe("Scene numbering", () => {
  describe("computeAddSceneNumberEdits", () => {
    test("adds numbers to scenes without existing numbers", () => {
      const input =
        "INT. HOUSE - DAY\n\nEXT. PARK - NIGHT\n\nINT. CAR - DAY\n\n";
      const script = parse(input, {});
      const edits = computeAddSceneNumberEdits(script);
      expect(applyEdits(script.document, edits)).toBe(
        "INT. HOUSE - DAY #1#\n\nEXT. PARK - NIGHT #2#\n\nINT. CAR - DAY #3#\n\n",
      );
    });

    test("continues numbering from existing numeric scene numbers", () => {
      const input =
        "INT. HOUSE - DAY\n\nEXT. PARK - NIGHT #5#\n\nINT. CAR - DAY\n\n";
      const script = parse(input, {});
      const edits = computeAddSceneNumberEdits(script);
      expect(applyEdits(script.document, edits)).toBe(
        "INT. HOUSE - DAY #1#\n\nEXT. PARK - NIGHT #5#\n\nINT. CAR - DAY #6#\n\n",
      );
    });

    test("non-purely-numeric numbers don't advance the counter", () => {
      const input =
        ".A SCENE\n\n.B SCENE #5A#\n\n.C SCENE\n\n.D SCENE #6#\n\n.E SCENE\n\n";
      const script = parse(input, {});
      const edits = computeAddSceneNumberEdits(script);
      expect(applyEdits(script.document, edits)).toBe(
        ".A SCENE #1#\n\n.B SCENE #5A#\n\n.C SCENE #2#\n\n.D SCENE #6#\n\n.E SCENE #7#\n\n",
      );
    });

    test("ignores non-numeric scene numbers when continuing the count", () => {
      const input =
        "INT. HOUSE - DAY\n\nEXT. PARK - NIGHT #ABC#\n\nINT. CAR - DAY\n\n";
      const script = parse(input, {});
      const edits = computeAddSceneNumberEdits(script);
      expect(applyEdits(script.document, edits)).toBe(
        "INT. HOUSE - DAY #1#\n\nEXT. PARK - NIGHT #ABC#\n\nINT. CAR - DAY #2#\n\n",
      );
    });
  });

  describe("computeRemoveSceneNumberEdits", () => {
    test("removes all scene numbers", () => {
      const input =
        "INT. HOUSE - DAY #1#\n\nEXT. PARK - NIGHT #2A#\n\nINT. CAR - DAY #III#\n\n";
      const script = parse(input, {});
      const edits = computeRemoveSceneNumberEdits(script);
      expect(applyEdits(script.document, edits)).toBe(
        "INT. HOUSE - DAY\n\nEXT. PARK - NIGHT\n\nINT. CAR - DAY\n\n",
      );
    });

    test("removes numbers but keeps trailing whitespace on the line", () => {
      const input =
        "INT. HOUSE - DAY  #1#  \n\nEXT. PARK - NIGHT   #2A#   \n\n";
      const script = parse(input, {});
      const edits = computeRemoveSceneNumberEdits(script);
      expect(applyEdits(script.document, edits)).toBe(
        "INT. HOUSE - DAY  \n\nEXT. PARK - NIGHT   \n\n",
      );
    });

    test("leaves scenes without numbers unchanged", () => {
      const input =
        "INT. HOUSE - DAY\n\nEXT. PARK - NIGHT #2A#\n\nINT. CAR - DAY\n\n";
      const script = parse(input, {});
      const edits = computeRemoveSceneNumberEdits(script);
      expect(applyEdits(script.document, edits)).toBe(
        "INT. HOUSE - DAY\n\nEXT. PARK - NIGHT\n\nINT. CAR - DAY\n\n",
      );
    });
  });
});
