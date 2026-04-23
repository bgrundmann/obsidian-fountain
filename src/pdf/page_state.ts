/**
 * Page-state primitives for PDF generation.
 *
 * State-threading convention (applies across the whole PDF pipeline):
 *   - `PageState` is passed as a parameter and returned updated.
 *     Functions never mutate it in place; they always return a new
 *     object when state changes. This keeps the flow of state
 *     traceable by the caller (typically with `state = f(state, ...)`).
 *   - `instructions: Instruction[]` is a shared accumulator passed by
 *     reference. Every function that emits instructions pushes into this
 *     array rather than returning `Instruction[]`.
 *
 * Together these conventions let element emitters look like:
 *     state = addElementSpacing(state);
 *     state = needLines(instructions, state, 3);
 *     emitText(instructions, state, {...});
 *     return advanceLine(state);
 */

import { type Instruction, type PageState, getCharacterWidth } from "./types";

/**
 * Emit a new-page instruction, reset the Y cursor, and — subject to
 * screenplay numbering rules — emit the page-number text.
 */
export function emitNewPage(
  instructions: Instruction[],
  pageState: PageState,
): PageState {
  instructions.push({
    type: "new-page",
    width: pageState.pageWidth,
    height: pageState.pageHeight,
  });

  const newPageState = {
    ...pageState,
    currentY: pageState.pageHeight - pageState.margins.top,
    pageNumber: pageState.pageNumber + 1,
    lastElementType: null, // Reset spacing for new page
  };

  // Rule: Title page has no number, first script page has no number,
  // second script page and beyond start with "2."
  const shouldShowPageNumber =
    (pageState.documentHasTitlePage && newPageState.pageNumber > 2) ||
    (!pageState.documentHasTitlePage && newPageState.pageNumber > 1);

  if (shouldShowPageNumber) {
    // Script pages start at 2 when a title page is present.
    const displayNumber = pageState.documentHasTitlePage
      ? newPageState.pageNumber - 1
      : newPageState.pageNumber;

    // Upper right, vertically aligned at half the top margin.
    const pageNumberY = pageState.pageHeight - pageState.margins.top / 2;
    const pageNumberText = `${displayNumber}.`;

    const charWidth = getCharacterWidth(pageState.fontSize);
    const textWidth = pageNumberText.length * charWidth;
    const pageNumberX =
      pageState.pageWidth - pageState.margins.right - textWidth - 12;

    instructions.push({
      type: "text",
      data: pageNumberText,
      x: pageNumberX,
      y: pageNumberY,
      bold: false,
      italic: false,
      underline: false,
      color: "black",
      strikethrough: false,
      backgroundColor: undefined,
    });
  }

  return newPageState;
}

export function hasSpaceForLines(
  pageState: PageState,
  numLines: number,
): boolean {
  const requiredSpace = numLines * pageState.lineHeight;
  return pageState.currentY - requiredSpace >= pageState.margins.bottom;
}

/** Ensure `numLines` fit on the current page; otherwise break to a new page. */
export function needLines(
  instructions: Instruction[],
  pageState: PageState,
  numLines: number,
): PageState {
  if (!hasSpaceForLines(pageState, numLines)) {
    return emitNewPage(instructions, pageState);
  }
  return pageState;
}

export function advanceLine(pageState: PageState): PageState {
  return {
    ...pageState,
    currentY: pageState.currentY - pageState.lineHeight,
  };
}

/** Add a blank line of spacing before an element if something preceded it. */
export function addElementSpacing(pageState: PageState): PageState {
  if (pageState.lastElementType !== null) {
    return advanceLine(pageState);
  }
  return pageState;
}
