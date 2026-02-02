import {
  NBSP,
  type Range,
  type FountainScript,
  type StructureScene,
  dataRange,
} from "./fountain";

export function endOfRange(r: Range): Range {
  return { start: r.end, end: r.end };
}

/// Generate the blank line at the end of a range.
export function renderBlankLine(parent: HTMLElement, r?: Range): HTMLElement {
  return parent.createDiv({
    // end,end on purpose
    attr: r ? dataRange(endOfRange(r)) : {},
    text: NBSP,
  });
}

/**
 * Generate a preview string for a scene from its action and dialogue content.
 * Used when a scene has no synopsis.
 */
export function getScenePreview(
  script: FountainScript,
  scene: StructureScene,
  maxLength = 100,
): string | null {
  const parts: string[] = [];
  let totalLength = 0;

  for (const el of scene.content) {
    if (totalLength >= maxLength) break;

    if (el.kind === "action") {
      // Skip blank lines (actions where all lines have no elements)
      if (el.lines.every((l) => l.elements.length === 0)) continue;
      const text = script.sliceDocumentForDisplay(el.range).trim();
      if (text) {
        parts.push(text);
        totalLength += text.length;
      }
    } else if (el.kind === "dialogue") {
      // Format as "CHARACTER: dialogue"
      const charName = script.sliceDocumentForDisplay(el.characterRange).trim();
      if (el.lines.length > 0) {
        const firstLine = el.lines[0];
        const dialogueText = script
          .sliceDocumentForDisplay(firstLine.range)
          .trim();
        const formatted = `${charName}: ${dialogueText}`;
        parts.push(formatted);
        totalLength += formatted.length;
      }
    }
  }

  if (parts.length === 0) return null;

  let preview = parts.join(" ");
  if (preview.length > maxLength) {
    preview = preview.substring(0, maxLength).trim() + "...";
  }
  return preview;
}
