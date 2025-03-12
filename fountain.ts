export { FountainScript, mergeText, escapeHtml, intersect, extractNotes };
export type {
  Range,
  Synopsis,
  Transition,
  KeyValue,
  Line,
  StyledTextElement,
  TextElementWithNotesAndBoneyard,
  Action,
  Dialogue,
  Scene,
  Section,
  FountainElement,
  Note,
};

export type ShowHideSettings = {
  hideSynopsis?: boolean; // undefined also false
  hideNotes?: boolean; // undefined also false
  hideBoneyard?: boolean; // undefined also false
};

interface Range {
  start: number;
  end: number;
}

function intersect(r1: Range, r2: Range): boolean {
  return r1.start < r2.end && r2.start < r1.end;
}

/**
 * Extracts all notes from a list of FountainElements
 * @param element List of FountainElements to extract notes from
 * @returns Array of all Note elements found
 */
function extractNotes(element: FountainElement): Note[] {
  const notes: Note[] = [];

  // Check if element has lines property (action and dialogue elements)
  if ("lines" in element) {
    for (const line of element.lines) {
      for (const textElement of line.elements) {
        if (textElement.kind === "note") {
          notes.push(textElement);
        }
      }
    }
  }

  return notes;
}

// In all the fountain element AST types, range is always
// the range of the complete element (so if you wanted to
// remove the complete element deleting all text of that
// range would work).
type PageBreak = {
  kind: "page-break";
  range: Range;
};

/** A synopsis is some text soley for the writer of the document.
 Often used to summarize the key points of a scene before the scene
 is written.  linesOfText is one element per line of text. Where each
 elements range excludes the '=' as well as the newline character.
*/
type Synopsis = {
  kind: "synopsis";
  range: Range;
  linesOfText: Range[];
};

type Action = {
  kind: "action";
  range: Range;
  lines: Line[];
};

type Scene = {
  kind: "scene";
  range: Range;
};

type Transition = {
  kind: "transition";
  range: Range;
};

type Line = {
  range: Range;
  elements: TextElementWithNotesAndBoneyard[];

  centered: boolean;
};

type Dialogue = {
  kind: "dialogue";
  range: Range; /// range of everything
  characterRange: Range; /// range of the character line excl extensions excl whitespace at the beginning.
  characterExtensionsRange: Range; /// range of all extensions (empty range if no extensions) including all parentheses
  parenthetical: Range | null;
  lines: Line[];
};

type Section = {
  kind: "section";
  range: Range;
  depth: number;
};

type FountainElement =
  | Synopsis
  | Transition
  | Action
  | Scene
  | Dialogue
  | Section
  | PageBreak;

type Note = {
  kind: "note";
  noteKind: string;
  range: Range;
  textRange: Range;
};

type Boneyard = {
  kind: "boneyard";
  range: Range;
};

/// The type of a piece of text. Text never contains any newlines!
type BasicTextElement = {
  range: Range;
  kind: "text";
};

type StyledTextElement = {
  range: Range;
  kind: "bold" | "italics" | "underline";
  elements: StyledText;
};

type TextElement = BasicTextElement | StyledTextElement;

type StyledText = TextElement[];

/** Is this one or more explicit blank lines? That is an Action element only consisting of one or more blank lines? */
export function isBlankLines(f: FountainElement) {
  return (
    f.kind === "action" &&
    f.lines.length >= 1 &&
    f.lines.every((l) => l.elements.length === 0)
  );
}

/// This merges consecutive basic text elements into one
function mergeText(elts: StyledText): StyledText {
  const res: (BasicTextElement | StyledTextElement)[] = [];
  if (elts.length === 0) return [];
  let prev = elts[0];
  for (let i = 1; i < elts.length; i++) {
    const n = elts[i];
    if (n.kind === "text" && prev.kind === "text") {
      prev = {
        kind: "text",
        range: { start: prev.range.start, end: n.range.end },
      };
    } else {
      res.push(prev);
      prev = n;
    }
  }
  res.push(prev);
  return res;
}

type TextElementWithNotesAndBoneyard =
  | BasicTextElement
  | StyledTextElement
  | Note
  | Boneyard;
type StyledTextWithNotesAndBoneyard = TextElementWithNotesAndBoneyard[];

type KeyValue = {
  key: string;
  values: StyledText[];
  range: Range;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/** The way the parser works, blank lines can cause separate action elements
 * (as opposed to a single action element containing all the newlines).
 * This merges all subsequent action elements into a single one.
 */
function mergeConsecutiveActions(script: FountainElement[]): FountainElement[] {
  const merged = [];
  let prev: FountainElement | null = null;
  for (const el of script) {
    if (prev === null) {
      prev = el;
    } else {
      let extra_newline: Line[] = [];
      if (prev.kind === "action" && el.kind === "action") {
        if (
          prev.lines.length > 0 &&
          prev.range.end > prev.lines[prev.lines.length - 1].range.end
        ) {
          // Previous action ended in a blank line, but because the next thing
          // after the blank line is a action again, let's insert that blank line
          // as an action and go on.
          extra_newline = [
            {
              range: { start: prev.range.end - 1, end: prev.range.end },
              elements: [],
              centered: false,
            },
          ];
        }
        prev = {
          kind: "action",
          lines: prev.lines.concat(extra_newline, el.lines),
          range: { start: prev.range.start, end: el.range.end },
        };
      } else {
        merged.push(prev);
        prev = el;
      }
    }
  }
  if (prev !== null) merged.push(prev);
  return merged;
}

class FountainScript {
  readonly titlePage: KeyValue[];
  readonly script: FountainElement[];
  readonly document: string;
  readonly allCharacters: Set<string>;

  /**  Extract some text from the fountain document safe to be used
   as HTML source.
   */
  extractAsHtml(r: Range, escapeLeadingSpaces = false): string {
    const safe = escapeHtml(this.unsafeExtractRaw(r));
    return escapeLeadingSpaces
      ? safe.replace(/^( +)/gm, (_, spaces) => "&nbsp;".repeat(spaces.length))
      : safe;
  }

  /** Extract some text from the fountain document. CAREFUL this
    text is NOT html escaped! */
  unsafeExtractRaw(r: Range): string {
    return this.document.slice(r.start, r.end);
  }

  private styledTextElementToHtml(
    el: StyledTextElement,
    settings: ShowHideSettings,
  ): string {
    const inner = el.elements
      .map((e) => this.textElementToHtml(e, settings, false))
      .join("");
    return `<span class="${el.kind}">${inner}</span>`;
  }

  /**
   * Return list of characters that are saying this dialogue.
   * Normally this will be an array of one element. But in an
   * extension to standard fountain we also allow multiple characters
   * separated by & characters.
   * NOTE: the character names are NOT html escaped!
   * @param d Dialogue
   */
  charactersOf(d: Dialogue): string[] {
    const text = this.document.slice(
      d.characterRange.start,
      d.characterRange.end,
    );
    return text.split("&").map((s) => s.trim());
  }

  styledTextToHtml(
    st: StyledTextWithNotesAndBoneyard,
    settings: ShowHideSettings,
    escapeLeadingSpaces: boolean,
  ): string {
    return st
      .map((el) => this.textElementToHtml(el, settings, escapeLeadingSpaces))
      .join("");
  }

  /// Extract a text element from the fountain document safe to be used as
  /// HTML source.
  private textElementToHtml(
    el: TextElementWithNotesAndBoneyard,
    settings: ShowHideSettings,
    escapeLeadingSpaces: boolean,
  ): string {
    switch (el.kind) {
      case "text":
        return this.extractAsHtml(el.range, escapeLeadingSpaces);
      case "bold":
      case "italics":
      case "underline":
        return this.styledTextElementToHtml(el, settings);
      case "note": {
        if (settings.hideNotes) {
          return "";
        }
        let noteKindClass = "";
        let prefix = "";
        switch (el.noteKind) {
          case "+":
            noteKindClass = "note-symbol-plus";
            break;
          case "-":
            noteKindClass = "note-symbol-minus";
            break;
          case "todo":
            prefix = "<b>TODO: </b>";
            noteKindClass = "note-todo";
            break;
          default:
            noteKindClass = "note";
            break;
        }
        return `<span class="${noteKindClass}">${prefix}${this.extractAsHtml(el.textRange, true)}</span>`;
      }
      case "boneyard":
        return "";
    }
  }

  constructor(
    document: string,
    titlePage: KeyValue[],
    script: FountainElement[],
  ) {
    this.document = document;
    this.titlePage = titlePage;
    this.script = mergeConsecutiveActions(script);
    const characters = new Set<string>();
    for (const el of this.script) {
      switch (el.kind) {
        case "dialogue":
          for (const c of this.charactersOf(el)) {
            characters.add(c);
          }
          break;
        default:
          break;
      }
    }
    this.allCharacters = characters;
  }

  with_source(): (FountainElement & { source: string })[] {
    return this.script.map((elt) => {
      return {
        ...elt,
        source: this.document.slice(elt.range.start, elt.range.end),
      };
    });
  }

  titlePageWithHtmlValues(): (KeyValue & { htmlValues: string[] })[] {
    return this.titlePage.map((kv) => {
      return {
        ...kv,
        htmlValues: kv.values.map((v) => {
          return v.map((st) => this.textElementToHtml(st, {}, false)).join("");
        }),
      };
    });
  }
}
