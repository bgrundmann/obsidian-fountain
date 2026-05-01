/** Unicode non breaking space. Use this instead of &nbsp; so we don't need to set innerHTML */
export const NBSP = "\u00A0";

export type ShowHideSettings = {
  hideSynopsis?: boolean; // undefined also false
  hideNotes?: boolean; // undefined also false
  hideBoneyard?: boolean; // undefined also false
};

// ============================================================================
// Range
// ============================================================================

export interface Range {
  start: number;
  end: number;
}

export function dataRange(r: Range): { "data-range": string } {
  return { "data-range": `${r.start},${r.end}` };
}

export function intersect(r1: Range, r2: Range): boolean {
  return r1.start < r2.end && r2.start < r1.end;
}

export function collapseRangeToStart(r: Range): Range {
  return { start: r.start, end: r.start };
}

export function computeRange(...optionalRanges: (Range | undefined)[]): Range {
  const starts = optionalRanges
    .map((r) => r?.start)
    .filter((s): s is number => s !== undefined);
  const ends = optionalRanges
    .map((r) => r?.end)
    .filter((e): e is number => e !== undefined);
  return { start: Math.min(...starts), end: Math.max(...ends) };
}

// ============================================================================
// Text Element Types
// ============================================================================

/// The type of a piece of text. Text never contains any newlines!
export type BasicTextElement = {
  range: Range;
  kind: "text";
};

export type StyledTextElement = {
  range: Range;
  kind: "bold" | "italics" | "underline";
  elements: StyledText;
};

export type TextElement = BasicTextElement | StyledTextElement;

export type StyledText = TextElement[];

export type Note = {
  kind: "note";
  noteKind: string;
  range: Range;
  textRange: Range;
};

export type Boneyard = {
  kind: "boneyard";
  range: Range;
};

export type TextElementWithNotesAndBoneyard =
  | BasicTextElement
  | StyledTextElement
  | Note
  | Boneyard;

export type StyledTextWithNotesAndBoneyard = TextElementWithNotesAndBoneyard[];

export type Line = {
  range: Range;
  elements: TextElementWithNotesAndBoneyard[];
  centered: boolean;
};

// ============================================================================
// Fountain AST Element Types
// ============================================================================

// In all the fountain element AST types, range is always
// the range of the complete element (so if you wanted to
// remove the complete element deleting all text of that
// range would work).
//
// IMPORTANT: For scene headings, the range includes the trailing
// newline characters required by the Fountain spec (a scene heading
// must be followed by a blank line). This means scene heading ranges
// include: heading text + line ending + blank line (two \n characters).
// This is crucial for operations like folding, syntax highlighting,
// and position-based queries.
//
// SPECIAL CASE: Scene headings at the end of the document may have
// fewer trailing newlines (for interactive editing feedback), but
// these incomplete headings typically have no content to fold anyway.
export type PageBreak = {
  kind: "page-break";
  range: Range;
};

/** A synopsis is some text soley for the writer of the document.
 Often used to summarize the key points of a scene before the scene
 is written. `lines` is one element per source line. Each line's range
 excludes the leading '=' and the trailing newline; line elements may
 include styled text (bold/italic/underline), notes (incl. `[[>...]]`
 links and `[[@marker]]` margin marks), and boneyard.
*/
export type Synopsis = {
  kind: "synopsis";
  range: Range;
  lines: Line[];
};

export type Action = {
  kind: "action";
  range: Range;
  lines: Line[];
};

export type SceneHeading = {
  kind: "scene";
  range: Range;
  heading: string;
  forced: boolean;
  number: Range | null;
};

export type Transition = {
  kind: "transition";
  range: Range;
  forced: boolean;
};

export type DialogueContentParenthetical = {
  kind: "parenthetical";
  range: Range;
};

export type DialogueContentLine = {
  kind: "line";
  line: Line;
};

export type DialogueContent = DialogueContentParenthetical | DialogueContentLine;

export type Dialogue = {
  kind: "dialogue";
  range: Range; /// range of everything
  characterRange: Range; /// range of the character line excl extensions excl whitespace at the beginning.
  characterExtensionsRange: Range; /// range of all extensions (empty range if no extensions) including all parentheses
  content: DialogueContent[];
};

export type Section = {
  kind: "section";
  range: Range;
  depth: number;
};

export type Lyrics = {
  kind: "lyrics";
  range: Range;
  lines: Line[];
};

export type FountainElement =
  | Synopsis
  | Transition
  | Action
  | SceneHeading
  | Dialogue
  | Section
  | Lyrics
  | PageBreak;

export type KeyValue = {
  key: string;
  values: StyledText[];
  range: Range;
};

// ============================================================================
// Snippets and Structure
// ============================================================================

export interface Snippet {
  content: FountainElement[];
  pageBreak?: PageBreak;
}
export type Snippets = Snippet[];

export interface ScriptStructure {
  sections: StructureSection[];
  snippets: Snippets;
}

// ============================================================================
// Structure Classes
// ============================================================================

export class StructureSection {
  readonly content: (StructureSection | StructureScene)[];
  readonly kind: "section";

  constructor(
    public section?: Section,
    public synopsis?: Synopsis,
  ) {
    this.kind = "section";
    this.content = [];
  }

  get range(): Range {
    return computeRange(
      this.section?.range,
      this.synopsis?.range,
      this.content[0]?.range,
      this.content[this.content.length - 1]?.range,
    );
  }
}

export class StructureScene {
  readonly kind: "scene";
  readonly content: Exclude<FountainElement, SceneHeading>[];

  constructor(
    public scene?: SceneHeading,
    public synopsis?: Synopsis,
  ) {
    this.content = [];
    this.kind = "scene";
  }

  get range(): Range {
    return computeRange(
      this.scene?.range,
      this.synopsis?.range,
      this.content[0]?.range,
      this.content[this.content.length - 1]?.range,
    );
  }
}
