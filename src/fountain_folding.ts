import { foldService } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import type { FountainScript, ScriptStructure } from "./fountain";
import { StructureSection, StructureScene } from "./fountain";

/**
 * Creates a folding service for Fountain scripts that provides folding ranges
 * for sections and scenes based on the parsed script structure.
 */
export function createFountainFoldService(getScript: () => FountainScript) {
  return foldService.of((state: EditorState, from: number, to: number) => {
    const script = getScript();
    if (!script) {
      return null;
    }

    const structure = script.structure();
    const ranges = buildFoldRanges(structure);
    return findFoldAtPosition(ranges, from);
  });
}

/**
 * Builds fold ranges from the script structure, creating folds for scenes only
 */
export function buildFoldRanges(structure: ScriptStructure): {from: number, to: number}[] {
  const ranges: {from: number, to: number}[] = [];

  // Process all sections to find scenes
  for (const section of structure.sections) {
    processStructureSectionForScenes(section, ranges);
  }

  return ranges;
}

/**
 * Recursively processes sections to find and create fold ranges for scenes only
 */
function processStructureSectionForScenes(
  section: StructureSection,
  ranges: {from: number, to: number}[]
): void {
  // Process all content in this section
  for (const item of section.content) {
    if (item.kind === "scene") {
      // Add fold range for the scene if it has meaningful content
      const sceneFold = createSceneFoldRange(item);
      if (sceneFold) {
        ranges.push(sceneFold);
      }
    } else if (item.kind === "section") {
      // Recursively process nested sections
      processStructureSectionForScenes(item, ranges);
    }
  }
}



/**
 * Creates a fold range for a scene
 */
function createSceneFoldRange(scene: StructureScene): {from: number, to: number} | null {
  if (!scene.scene || scene.content.length === 0) {
    return null;
  }

  // Fold from end of scene heading to end of scene content
  const foldStart = scene.scene.range.end;
  const foldEnd = scene.range.end;

  // Only create fold if there's content to fold
  if (foldEnd > foldStart) {
    return { from: foldStart, to: foldEnd };
  }

  return null;
}

/**
 * Finds the applicable fold range for a given position
 */
export function findFoldAtPosition(ranges: {from: number, to: number}[], position: number): {from: number, to: number} | null {
  // Find the fold range that starts at or before the position
  // and contains the position within its range
  for (const range of ranges) {
    if (position >= range.from && position < range.to) {
      return range;
    }
  }

  return null;
}
