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

/** Unicode non breaking space. Use this instead of &nbsp; so we don't need to set innerHTML */
export const NBSP = "\u00A0";

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

/** Escape leading spaces (that is spaces at beginning of the string or after newlines) if cond is true. */
function maybeEscapeLeadingSpaces(cond: boolean, s: string): string {
  return cond
    ? s.replace(/^( +)/gm, (_, spaces) => NBSP.repeat(spaces.length))
    : s;
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

export type StructureSection = {
  kind: "section";
  section?: Section;
  synopsis?: Synopsis;
  content: (StructureSection | StructureScene)[];
};

export class StructureScene {
  constructor(
    readonly kind: "scene",
    readonly content: Exclude<FountainElement, Scene>[],
    public scene?: Scene,
    public synopsis?: Synopsis,
  ) {}

  get range(): Range {
    const starts: number[] = [
      this.scene?.range.start,
      this.synopsis?.range.start,
      this.content[0]?.range.start,
    ].filter((r): r is number => r !== undefined);
    const ends: number[] = [
      this.scene?.range.end,
      this.synopsis?.range.end,
      this.content[this.content.length - 1]?.range.end,
    ].filter((r): r is number => r !== undefined);

    return { start: Math.min(...starts), end: Math.max(...ends) };
  }
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
    return maybeEscapeLeadingSpaces(escapeLeadingSpaces, safe);
  }

  /** Extract some text from the fountain document. CAREFUL this
    text is NOT html escaped!
    @param escapeLeadingSpaces if true leading spaces are replaced by non breaking space */
  unsafeExtractRaw(r: Range, escapeLeadingSpaces = false): string {
    return maybeEscapeLeadingSpaces(
      escapeLeadingSpaces,
      this.document.slice(r.start, r.end),
    );
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
    parent: HTMLElement,
    st: StyledTextWithNotesAndBoneyard,
    settings: ShowHideSettings,
    escapeLeadingSpaces: boolean,
  ): void {
    st.map((el) =>
      this.renderTextElement(parent, el, settings, escapeLeadingSpaces),
    );
  }

  private renderStyledTextElement(
    parent: HTMLElement,
    el: StyledTextElement,
    settings: ShowHideSettings,
  ): void {
    parent.createEl("span", { cls: el.kind }, (span) => {
      for (const e of el.elements) {
        this.renderTextElement(parent, e, settings, false);
      }
    });
  }

  /// Extract a text element from the fountain document safe to be used as
  /// HTML source.
  private renderTextElement(
    parent: HTMLElement,
    el: TextElementWithNotesAndBoneyard,
    settings: ShowHideSettings,
    escapeLeadingSpaces: boolean,
  ): void {
    switch (el.kind) {
      case "text":
        parent.appendText(
          maybeEscapeLeadingSpaces(
            escapeLeadingSpaces,
            this.unsafeExtractRaw(el.range),
          ),
        );
        break;
      case "bold":
      case "italics":
      case "underline":
        this.renderStyledTextElement(parent, el, settings);
        break;
      case "note":
        {
          if (settings.hideNotes) {
            return;
          }
          let noteKindClass = "";
          switch (el.noteKind) {
            case "+":
              noteKindClass = "note-symbol-plus";
              break;
            case "-":
              noteKindClass = "note-symbol-minus";
              break;
            case "todo":
              noteKindClass = "note-todo";
              break;
            default:
              noteKindClass = "note";
              break;
          }
          parent.createEl("span", { cls: noteKindClass }, (span) => {
            if (el.noteKind === "todo") {
              span.createEl("b", { text: "TODO: " });
            }
            span.appendText(
              maybeEscapeLeadingSpaces(
                true,
                this.unsafeExtractRaw(el.textRange),
              ),
            );
          });
        }
        break;
      case "boneyard":
      /// TODO: support
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

  /** Return a structured representation of the script.
      Note that in this representation the first synopsis of a section
      or scene will not appear inside content, but inside the synopsis
      field. Even if empty action lines (which will appear inside content)
      where between the scene or section header and the synopsis.
      So if exact reproduction of the document or iteration in the order
      in which the elements appear in the script is important, use this.script()
  */
  structure(): StructureSection[] {
    const res: StructureSection[] = [];
    let currentSection: StructureSection = { kind: "section", content: [] };
    let currentScene: StructureScene = new StructureScene("scene", []);

    const isCurrentSceneEmpty = () =>
      !currentScene.content.length &&
      !currentScene.scene &&
      !currentScene.synopsis;
    const isCurrentSectionEmpty = () =>
      isCurrentSceneEmpty() &&
      !currentSection.content &&
      !currentSection.section &&
      !currentSection.synopsis;
    const currentSceneHasOnlyBlankLines = () =>
      currentScene.content.every(
        (fe) =>
          fe.kind === "action" && fe.lines.every((l) => !l.elements.length),
      );
    for (const fe of this.script) {
      switch (fe.kind) {
        case "section":
          {
            if (fe.depth <= 3) {
              if (isCurrentSectionEmpty()) {
                // If the current section does not contain anything yet than this is its title
                // this only happens at the beginning of a document
                currentSection.section = fe;
              } else {
                // otherwise finish the current scene and start a new section
                if (!isCurrentSceneEmpty()) {
                  currentSection.content.push(currentScene);
                  currentScene = new StructureScene("scene", []);
                }
                res.push(currentSection);
                currentSection = { kind: "section", section: fe, content: [] };
              }
            } else {
              // Sections of depth 4 and greater are used to structure scenes...
              currentScene.content.push(fe);
            }
          }
          break;
        case "scene":
          {
            if (!isCurrentSceneEmpty()) {
              // This is the start of a new scene.
              currentSection.content.push(currentScene);
            }
            currentScene = new StructureScene("scene", [], fe);
          }
          break;
        case "synopsis":
          {
            if (
              !currentScene.synopsis &&
              !currentScene.scene &&
              currentSceneHasOnlyBlankLines() &&
              !currentSection.content.length &&
              currentSection.section
            ) {
              // There was a section line and nothing other than blank
              // lines followed it
              // TODO: Deal with boneyards
              currentSection.synopsis = fe;
            } else if (
              !currentScene.synopsis &&
              currentScene.scene &&
              currentSceneHasOnlyBlankLines()
            ) {
              currentScene.synopsis = fe;
            } else {
              currentScene.content.push(fe);
            }
          }
          break;

        default:
          currentScene.content.push(fe);
          break;
      }
    }
    if (!isCurrentSceneEmpty()) {
      currentSection.content.push(currentScene);
    }
    if (!isCurrentSectionEmpty()) {
      res.push(currentSection);
    }
    return res;
  }
}
