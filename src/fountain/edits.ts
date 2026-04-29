import type { FountainScript } from "./script";
import type { Range, SceneHeading } from "./types";
import { sceneHeadingTextEnd } from "./utils";

export interface Edit {
  range: Range;
  replacement: string;
}

/**
 * Apply a batch of edits to `text`. Ranges are interpreted against the
 * pre-edit `text`; edits must be non-overlapping. Edits are applied from
 * right to left so earlier positions stay valid during application.
 */
export function applyEdits(text: string, edits: Edit[]): string {
  const sorted = [...edits].sort((a, b) => b.range.start - a.range.start);
  let result = text;
  for (const e of sorted) {
    result =
      result.slice(0, e.range.start) +
      e.replacement +
      result.slice(e.range.end);
  }
  return result;
}

/** Return the newline characters needed so `text` ends with "\n\n". */
function trailingNewlinesNeeded(text: string): string {
  const lastTwo = text.slice(-2);
  return lastTwo === "\n\n" ? "" : lastTwo[1] === "\n" ? "\n" : "\n\n";
}

/**
 * Edits to move the scene-sized `range` so its content starts at `newPos`.
 * `newPos` must not lie inside `range`.
 */
export function computeMoveSceneEdits(
  script: FountainScript,
  range: Range,
  newPos: number,
): Edit[] {
  const sceneText = script.document.slice(range.start, range.end);
  return [
    { range: { start: range.start, end: range.end }, replacement: "" },
    {
      range: { start: newPos, end: newPos },
      replacement: sceneText + trailingNewlinesNeeded(sceneText),
    },
  ];
}

/** Edit that duplicates the scene-sized `range` immediately after itself. */
export function computeDuplicateSceneEdits(
  script: FountainScript,
  range: Range,
): Edit[] {
  const sceneText = script.document.slice(range.start, range.end);
  return [
    {
      range: { start: range.end, end: range.end },
      replacement: trailingNewlinesNeeded(sceneText) + sceneText,
    },
  ];
}

/**
 * Edits for moving a scene from `src` at `srcRange` into `dst` at `dstPos`.
 * The returned edits are applied against `src.document` and `dst.document`
 * respectively.
 */
export function computeMoveSceneAcrossFilesEdits(
  src: FountainScript,
  srcRange: Range,
  _dst: FountainScript,
  dstPos: number,
): { srcEdits: Edit[]; dstEdits: Edit[] } {
  const sceneText = src.document.slice(srcRange.start, srcRange.end);
  return {
    srcEdits: [
      { range: { start: srcRange.start, end: srcRange.end }, replacement: "" },
    ],
    dstEdits: [
      {
        range: { start: dstPos, end: dstPos },
        replacement: sceneText + trailingNewlinesNeeded(sceneText),
      },
    ],
  };
}

function scenesOf(script: FountainScript): SceneHeading[] {
  return script.script.filter(
    (element): element is SceneHeading => element.kind === "scene",
  );
}

/**
 * Edits that add sequential scene numbers to every scene lacking one.
 * Numbering continues from any purely-numeric existing number; non-numeric
 * numbers (e.g. "5A") leave the counter untouched.
 */
export function computeAddSceneNumberEdits(script: FountainScript): Edit[] {
  const edits: Edit[] = [];
  let next = 1;
  for (const scene of scenesOf(script)) {
    if (scene.number === null) {
      const insertPosition = sceneHeadingTextEnd(scene);
      edits.push({
        range: { start: insertPosition, end: insertPosition },
        replacement: ` #${next}#`,
      });
      next++;
      continue;
    }
    const existing = script.document.substring(
      scene.number.start + 1,
      scene.number.end - 1,
    );
    const parsed = Number.parseInt(existing, 10);
    if (!Number.isNaN(parsed) && parsed.toString() === existing.trim()) {
      next = parsed + 1;
    }
  }
  return edits;
}

/** Edits that strip every existing scene number (plus preceding whitespace). */
export function computeRemoveSceneNumberEdits(script: FountainScript): Edit[] {
  const edits: Edit[] = [];
  for (const scene of scenesOf(script)) {
    if (scene.number === null) continue;
    const beforeNumber = script.document.substring(
      sceneHeadingTextEnd(scene),
      scene.number.start,
    );
    const trailingWs = beforeNumber.match(/\s*$/)?.[0] ?? "";
    edits.push({
      range: {
        start: scene.number.start - trailingWs.length,
        end: scene.number.end,
      },
      replacement: "",
    });
  }
  return edits;
}
