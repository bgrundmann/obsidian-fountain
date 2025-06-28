import { NBSP, type Range, dataRange } from "./fountain";

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
