import { foldService } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import type { FountainScript, ScriptStructure } from "./fountain";
import { StructureSection } from "./fountain";

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
    return findFoldableSceneAt(structure, from, script.document);
  });
}

/**
 * Finds if the given position is within a scene heading, and if so, returns the fold range for that scene
 */
export function findFoldableSceneAt(structure: ScriptStructure, position: number, document: string): {from: number, to: number} | null {
  // Recursively search all sections for a scene heading that contains the position
  for (const section of structure.sections) {
    const result = findSceneInSection(section, position, document);
    if (result) {
      return result;
    }
  }
  return null;
}

/**
 * Recursively searches a section for a scene heading at the given position
 */
function findSceneInSection(section: StructureSection, position: number, document: string): {from: number, to: number} | null {
  for (const item of section.content) {
    if (item.kind === "scene" && item.scene) {

      // Check if position is within the scene heading (excluding the two newline characters)
      if (position >= item.scene.range.start && position < item.scene.range.end - 1) {
        // Only return fold range if scene has content to fold
        if (item.content.length > 0) {
          const foldStart = item.scene.range.end - 2;

          // Check if the last character is a newline before subtracting 1
          let foldEnd = item.range.end;
          if (foldEnd > 0) {
            const lastChar = document.charAt(foldEnd - 1);
            if (lastChar === '\n') {
              foldEnd = foldEnd - 1;
            }
          }

          if (foldEnd > foldStart) {
            return { from: foldStart, to: foldEnd };
          }
        }
      }
    } else if (item.kind === "section") {
      // Recursively search nested sections
      const result = findSceneInSection(item, position, document);
      if (result) {
        return result;
      }
    }
  }
  return null;
}

/**
 * Builds fold ranges from the script structure - kept for test compatibility
 */
export function buildFoldRanges(structure: ScriptStructure): {from: number, to: number}[] {
  const ranges: {from: number, to: number}[] = [];
  collectFoldRanges(structure.sections, ranges);
  return ranges;
}

/**
 * Recursively collects all fold ranges for testing purposes
 */
function collectFoldRanges(sections: StructureSection[], ranges: {from: number, to: number}[]): void {
  for (const section of sections) {
    for (const item of section.content) {
      if (item.kind === "scene" && item.scene && item.content.length > 0) {
        const foldStart = item.scene.range.end;
        const foldEnd = item.range.end;
        if (foldEnd > foldStart) {
          ranges.push({ from: foldStart, to: foldEnd });
        }
      } else if (item.kind === "section") {
        collectFoldRanges([item], ranges);
      }
    }
  }
}

/**
 * Finds the applicable fold range for a given position - kept for test compatibility
 */
export function findFoldAtPosition(ranges: {from: number, to: number}[], position: number): {from: number, to: number} | null {
  for (const range of ranges) {
    if (position >= range.from && position < range.to) {
      return range;
    }
  }
  return null;
}
