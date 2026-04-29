import {
  type Edit,
  type FountainElement,
  type FountainScript,
  type SceneHeading,
  applyEdits,
  computeDuplicateSceneEdits,
  computeMoveSceneAcrossFilesEdits,
  computeMoveSceneEdits,
} from "../src/fountain";
import { parse } from "../src/fountain/parser";

function isScene(e: FountainElement): e is SceneHeading {
  return e.kind === "scene";
}

function sceneHeadings(script: FountainScript): string[] {
  return script.script
    .filter(isScene)
    .map((s) => script.document.slice(s.range.start, s.range.end).split("\n")[0]);
}

describe("applyEdits", () => {
  test("applies a single replacement", () => {
    expect(
      applyEdits("hello world", [
        { range: { start: 6, end: 11 }, replacement: "there" },
      ]),
    ).toBe("hello there");
  });

  test("applies multiple non-overlapping edits regardless of input order", () => {
    const edits: Edit[] = [
      { range: { start: 0, end: 5 }, replacement: "HELLO" },
      { range: { start: 6, end: 11 }, replacement: "WORLD" },
    ];
    expect(applyEdits("hello world", edits)).toBe("HELLO WORLD");
    expect(applyEdits("hello world", [edits[1], edits[0]])).toBe("HELLO WORLD");
  });

  test("handles pure insertions (empty ranges)", () => {
    expect(
      applyEdits("ac", [{ range: { start: 1, end: 1 }, replacement: "b" }]),
    ).toBe("abc");
  });

  test("handles pure deletions", () => {
    expect(
      applyEdits("aXXXb", [
        { range: { start: 1, end: 4 }, replacement: "" },
      ]),
    ).toBe("ab");
  });
});

// Three scenes; positions are derived from parsing so the tests stay robust
// against any future whitespace tweaks in the fixtures.
const THREE_SCENES =
  "INT. HOUSE - DAY\n\nHome dialogue.\n\n" +
  "EXT. PARK - NIGHT\n\nPark dialogue.\n\n" +
  "INT. CAR - DAY\n\nCar dialogue.\n\n";

function sceneRange(script: FountainScript, sceneIndex: number) {
  const scenes = script.script.filter(isScene);
  const start = scenes[sceneIndex].range.start;
  const end =
    sceneIndex + 1 < scenes.length
      ? scenes[sceneIndex + 1].range.start
      : script.document.length;
  return { start, end };
}

describe("computeMoveSceneEdits", () => {
  test("moves a scene forward", () => {
    const script = parse(THREE_SCENES, {});
    const first = sceneRange(script, 0);
    const thirdStart = sceneRange(script, 2).start;
    const edits = computeMoveSceneEdits(script, first, thirdStart);
    const reparsed = parse(applyEdits(script.document, edits), {});
    expect(sceneHeadings(reparsed)).toEqual([
      "EXT. PARK - NIGHT",
      "INT. HOUSE - DAY",
      "INT. CAR - DAY",
    ]);
  });

  test("moves a scene backward", () => {
    const script = parse(THREE_SCENES, {});
    const third = sceneRange(script, 2);
    const firstStart = sceneRange(script, 0).start;
    const edits = computeMoveSceneEdits(script, third, firstStart);
    const reparsed = parse(applyEdits(script.document, edits), {});
    expect(sceneHeadings(reparsed)).toEqual([
      "INT. CAR - DAY",
      "INT. HOUSE - DAY",
      "EXT. PARK - NIGHT",
    ]);
  });
});

describe("computeDuplicateSceneEdits", () => {
  test("duplicates a scene immediately after itself", () => {
    const script = parse(THREE_SCENES, {});
    const second = sceneRange(script, 1);
    const edits = computeDuplicateSceneEdits(script, second);
    const reparsed = parse(applyEdits(script.document, edits), {});
    expect(sceneHeadings(reparsed)).toEqual([
      "INT. HOUSE - DAY",
      "EXT. PARK - NIGHT",
      "EXT. PARK - NIGHT",
      "INT. CAR - DAY",
    ]);
  });

  test("adds a blank line before the duplicate when the source lacks one", () => {
    const withoutTrailer =
      "INT. HOUSE - DAY\n\nAction.\n\nEXT. PARK - NIGHT\n\nMore action.";
    const script = parse(withoutTrailer, {});
    const second = sceneRange(script, 1);
    const edits = computeDuplicateSceneEdits(script, second);
    const reparsed = parse(applyEdits(script.document, edits), {});
    expect(reparsed.script.filter(isScene)).toHaveLength(3);
  });
});

describe("computeMoveSceneAcrossFilesEdits", () => {
  test("removes from src and inserts at dst position", () => {
    const src = parse(THREE_SCENES, {});
    const dst = parse("EXT. BEACH - DAY\n\nSurf.\n\n", {});
    const second = sceneRange(src, 1);
    const { srcEdits, dstEdits } = computeMoveSceneAcrossFilesEdits(
      src,
      second,
      dst,
      dst.document.length,
    );
    const newSrc = parse(applyEdits(src.document, srcEdits), {});
    const newDst = parse(applyEdits(dst.document, dstEdits), {});

    expect(sceneHeadings(newSrc)).toEqual([
      "INT. HOUSE - DAY",
      "INT. CAR - DAY",
    ]);
    expect(sceneHeadings(newDst)).toEqual([
      "EXT. BEACH - DAY",
      "EXT. PARK - NIGHT",
    ]);
  });
});
