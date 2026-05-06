/**
 * DOM rendering for Fountain styled text (the inline text-level AST
 * used inside action lines, dialogue, title-page values, etc.).
 *
 * These helpers were factored out of `FountainScript` so the core/data
 * layer stays free of DOM dependencies.
 */

import {
  type FountainScript,
  type ShowHideSettings,
  type StyledTextElement,
  type StyledTextWithNotesAndBoneyard,
  type TextElementWithNotesAndBoneyard,
  dataRange,
  extractMarginMarker,
  isLinkNote,
  maybeEscapeLeadingSpaces,
  parseLinkContent,
} from "../fountain";

/**
 * Render styled text into `parent`.
 * @returns false if every element was hidden by `settings`; true if
 *          anything was rendered (or if the input list was empty but
 *          non-null, matching the previous behaviour).
 */
export function styledTextToHtml(
  script: FountainScript,
  parent: HTMLElement,
  st: StyledTextWithNotesAndBoneyard,
  settings: ShowHideSettings,
  escapeLeadingSpaces: boolean,
): boolean {
  let someVisible = false;
  for (const el of st) {
    if (renderTextElement(script, parent, el, settings, escapeLeadingSpaces)) {
      someVisible = true;
    }
  }
  return someVisible || st.length > 0;
}

function renderStyledTextElement(
  script: FountainScript,
  parent: HTMLElement,
  el: StyledTextElement,
  settings: ShowHideSettings,
): void {
  parent.createEl("span", { cls: el.kind }, (span) => {
    for (const e of el.elements) {
      renderTextElement(script, span, e, settings, false);
    }
  });
}

function renderTextElement(
  script: FountainScript,
  parent: HTMLElement,
  el: TextElementWithNotesAndBoneyard,
  settings: ShowHideSettings,
  escapeLeadingSpaces: boolean,
): boolean {
  switch (el.kind) {
    case "text":
      parent.appendText(
        maybeEscapeLeadingSpaces(escapeLeadingSpaces, script.sliceDocument(el.range)),
      );
      return true;
    case "bold":
    case "italics":
    case "underline":
      renderStyledTextElement(script, parent, el, settings);
      return true;

    case "note": {
      if (settings.hideNotes) return false;

      if (isLinkNote(el)) {
        const { target, displayText } = parseLinkContent(
          script.sliceDocument(el.textRange),
        );
        const label = displayText !== null ? displayText : target;
        parent.createEl(
          "a",
          {
            cls: "fountain-link",
            attr: { ...dataRange(el.range), "data-link-target": target },
            href: "#",
            text: label,
          },
        );
        return true;
      }

      const markerWord = extractMarginMarker(el);
      if (markerWord !== null) {
        parent.createEl(
          "span",
          { cls: "note-margin", attr: dataRange(el.range) },
          (span) => {
            span.appendText(markerWord);
          },
        );
        return true;
      }

      const noteKindClasses: Record<string, string> = {
        "+": "note-symbol-plus",
        "-": "note-symbol-minus",
        todo: "note-todo",
      };
      const noteKindClass = noteKindClasses[el.noteKind] ?? "note";
      parent.createEl(
        "span",
        { cls: noteKindClass, attr: dataRange(el.range) },
        (span) => {
          if (el.noteKind === "todo") {
            span.createEl("b", { text: "TODO: " });
          }
          span.appendText(
            maybeEscapeLeadingSpaces(true, script.sliceDocument(el.textRange)),
          );
        },
      );
      return true;
    }

    case "boneyard":
      // TODO: support
      return false;
  }
}
