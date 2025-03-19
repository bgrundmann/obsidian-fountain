import type { Range } from "./fountain";

/** Unicode non breaking space. Use this instead of &nbsp; so we don't need to set innerHTML */
export const NBSP = "\u00A0";

export function dataRange(r: Range): { "data-range": string } {
  return { "data-range": `${r.start},${r.end}` };
}

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
