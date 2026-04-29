import type { FountainElement } from "./types";

/**
 * Return `originalText` with the byte ranges of `elementsToRemove` cut out.
 * Ranges are interpreted against `originalText` and may be in any order; an
 * empty `elementsToRemove` returns `originalText` unchanged.
 */
export function removeElementsFromText(
  originalText: string,
  elementsToRemove: FountainElement[],
): string {
  if (elementsToRemove.length === 0) {
    return originalText;
  }

  const sortedRanges = elementsToRemove
    .map((el) => el.range)
    .sort((a, b) => a.start - b.start);

  const slices: string[] = [];
  let currentPos = 0;

  for (const range of sortedRanges) {
    if (currentPos < range.start) {
      slices.push(originalText.slice(currentPos, range.start));
    }
    currentPos = range.end;
  }

  if (currentPos < originalText.length) {
    slices.push(originalText.slice(currentPos));
  }

  return slices.join("");
}
