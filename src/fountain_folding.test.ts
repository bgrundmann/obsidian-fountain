import { buildFoldRanges, findFoldAtPosition } from "./fountain_folding";
import { parse } from "./fountain_parser";

describe("Fountain Folding", () => {
  describe("buildFoldRanges", () => {
    it("should create fold ranges for scenes with content", () => {
      const script = parse(`
INT. HOUSE - DAY

JOHN walks in.

JOHN
Hello world.

EXT. PARK - NIGHT

More action.

INT. BEDROOM - LATER

SARAH gets dressed.
`, {});

      const structure = script.structure();
      const ranges = buildFoldRanges(structure);

      // Should have fold ranges for scenes that have content
      expect(ranges.length).toBe(3);

      // Verify fold ranges are properly structured
      for (const range of ranges) {
        expect(range.from).toBeLessThan(range.to);
        expect(range.from).toBeGreaterThanOrEqual(0);
      }
    });

    it("should create fold ranges only for scenes with meaningful content", () => {
      const script = parse(`
INT. KITCHEN - MORNING

SARAH pours coffee into a mug.

SARAH
Good morning, world.

She takes a sip and smiles.

INT. BEDROOM - LATER

SARAH gets dressed.
`, {});

      const structure = script.structure();
      const ranges = buildFoldRanges(structure);

      expect(ranges.length).toBe(2); // Two scenes should create two fold ranges

      // First scene should fold from end of scene heading to before next scene
      const firstRange = ranges[0];
      expect(firstRange).toBeDefined();
      expect(firstRange.from).toBeLessThan(firstRange.to);
    });

    it("should not create fold ranges for empty scenes", () => {
      const script = parse(`
INT. EMPTY SCENE - DAY

INT. ANOTHER EMPTY SCENE - NIGHT

INT. SCENE WITH CONTENT - DAY

Some action happens here.

JOHN
Hello there.
`, {});

      const structure = script.structure();
      const ranges = buildFoldRanges(structure);

      // Should only create fold range for the scene with content
      expect(ranges.length).toBe(1);
    });



    it("should handle scenes within nested sections", () => {
      const script = parse(`
# Act I

## Scene Group A

INT. HOUSE - DAY

Action in scene 1.

JOHN
Hello world.

EXT. PARK - NIGHT

Action in scene 2.

## Scene Group B

INT. OFFICE - DAY

Action in scene 3.
`, {});

      const structure = script.structure();
      const ranges = buildFoldRanges(structure);

      // Should create fold ranges for scenes that have content
      expect(ranges.length).toBe(3);

      // Verify ranges don't overlap
      const sortedRanges = ranges.sort((a, b) => a.from - b.from);
      for (let i = 0; i < sortedRanges.length - 1; i++) {
        const current = sortedRanges[i];
        const next = sortedRanges[i + 1];
        expect(current.to).toBeLessThanOrEqual(next.from);
      }
    });
  });

  describe("findFoldAtPosition", () => {
    it("should find the correct fold range for a given position", () => {
      const ranges = [
        { from: 10, to: 50 },
        { from: 60, to: 100 },
        { from: 110, to: 150 }
      ];

      // Position within first range
      expect(findFoldAtPosition(ranges, 25)).toEqual({ from: 10, to: 50 });

      // Position within second range
      expect(findFoldAtPosition(ranges, 75)).toEqual({ from: 60, to: 100 });

      // Position at start of range
      expect(findFoldAtPosition(ranges, 10)).toEqual({ from: 10, to: 50 });

      // Position at end of range (exclusive)
      expect(findFoldAtPosition(ranges, 50)).toBeNull();

      // Position outside all ranges
      expect(findFoldAtPosition(ranges, 5)).toBeNull();
      expect(findFoldAtPosition(ranges, 55)).toBeNull();
      expect(findFoldAtPosition(ranges, 200)).toBeNull();
    });

    it("should handle empty ranges array", () => {
      expect(findFoldAtPosition([], 10)).toBeNull();
    });

    it("should handle overlapping ranges by returning the first match", () => {
      const ranges = [
        { from: 10, to: 100 },
        { from: 20, to: 80 }
      ];

      // Position 30 is in both ranges, should return the first one
      expect(findFoldAtPosition(ranges, 30)).toEqual({ from: 10, to: 100 });
    });
  });

  describe("integration with real fountain content", () => {
    it("should work with a complete screenplay structure", () => {
      const script = parse(`
Title: Test Screenplay

# ACT I

## SETUP

INT. COFFEE SHOP - MORNING

ALICE sits at a corner table, typing on her laptop.

ALICE
(to herself)
Come on, Alice. You can do this.

The BARISTA approaches.

BARISTA
More coffee?

ALICE
Please.

## INCITING INCIDENT

EXT. COFFEE SHOP - CONTINUOUS

ALICE exits the coffee shop and bumps into BOB.

BOB
Watch it!

ALICE
Sorry! I was just—

BOB
(softening)
No, I'm sorry. Bad morning.

# ACT II

## RISING ACTION

INT. ALICE'S APARTMENT - LATER

ALICE paces around her living room.
`, {});

      const structure = script.structure();
      const ranges = buildFoldRanges(structure);

      // Should have fold ranges for the 3 scenes with content
      expect(ranges.length).toBe(3);

      // Verify we can find folds at various positions
      const docLength = script.document.length;
      let foundRanges = 0;

      // Sample positions throughout the document
      for (let pos = 0; pos < docLength; pos += Math.floor(docLength / 20)) {
        const range = findFoldAtPosition(ranges, pos);
        if (range) {
          foundRanges++;
          expect(range.from).toBeLessThanOrEqual(pos);
          expect(range.to).toBeGreaterThan(pos);
        }
      }

      expect(foundRanges).toBeGreaterThan(0);
    });
  });
});
