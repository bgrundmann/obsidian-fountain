import type { FountainScript } from "./script";
import type { StructureScene, StructureSection } from "./types";

function flattenScenes(
  sections: StructureSection[],
): StructureScene[] {
  const result: StructureScene[] = [];
  const visit = (section: StructureSection): void => {
    for (const child of section.content) {
      if (child.kind === "scene") {
        // Only keep "real" scenes — ones with an actual heading. The
        // structure builder also produces synthetic scene buckets for
        // pre-heading action lines; those carry no heading and aren't
        // navigation targets.
        if (child.scene) result.push(child);
      } else visit(child);
    }
  };
  for (const s of sections) visit(s);
  return result;
}

/**
 * Walk the script's structure and return the scene whose range contains
 * `offset`. If `offset` precedes the first scene (e.g. cursor on the title
 * page or a section header), return the next scene. Returns null only when
 * the script has no scenes at all.
 */
export function findSceneAtOffset(
  script: FountainScript,
  offset: number,
): StructureScene | null {
  const scenes = flattenScenes(script.structure().sections);
  if (scenes.length === 0) return null;
  for (let i = 0; i < scenes.length; i++) {
    const r = scenes[i].range;
    if (offset < r.start) return scenes[i];
    if (offset < r.end) return scenes[i];
  }
  return scenes[scenes.length - 1];
}

/**
 * Position rule: first character after the blank line following the scene
 * heading, clamped to the scene's range end. The scene heading's range
 * already includes its trailing "\n\n" (per parser.peggy), so in practice
 * this is the lesser of `scene.scene.range.end` and `scene.range.end`.
 */
export function startOfSceneContent(
  _script: FountainScript,
  scene: StructureScene,
): number {
  const sceneRangeEnd = scene.range.end;
  const headingEnd = scene.scene?.range.end ?? sceneRangeEnd;
  return Math.min(headingEnd, sceneRangeEnd);
}
