import type {
  Action,
  BasicTextElement,
  Boneyard,
  Dialogue,
  DialogueContent,
  DialogueContentLine,
  DialogueContentParenthetical,
  KeyValue,
  Line,
  Lyrics,
  Note,
  PageBreak,
  Range,
  SceneHeading,
  Section,
  StyledText,
  StyledTextElement,
  Synopsis,
  TextElementWithNotesAndBoneyard,
  Transition,
} from "./types";

export function mkRange(loc: {
  start: { offset: number };
  end: { offset: number };
}): Range {
  return { start: loc.start.offset, end: loc.end.offset };
}

export function mkText(range: Range): BasicTextElement {
  return { kind: "text", range };
}

export function mkBold(
  range: Range,
  elements: StyledText,
): StyledTextElement {
  return { kind: "bold", range, elements };
}

export function mkItalics(
  range: Range,
  elements: StyledText,
): StyledTextElement {
  return { kind: "italics", range, elements };
}

export function mkUnderline(
  range: Range,
  elements: StyledText,
): StyledTextElement {
  return { kind: "underline", range, elements };
}

export function mkLine(
  range: Range,
  elements: TextElementWithNotesAndBoneyard[],
): Line {
  return { range, centered: false, elements };
}

export function mkCenteredLine(
  range: Range,
  elements: TextElementWithNotesAndBoneyard[],
): Line {
  return { range, centered: true, elements };
}

export function shiftLineStart(line: Line, delta: number): Line {
  return {
    ...line,
    range: { start: line.range.start + delta, end: line.range.end },
  };
}

export function mkParenthetical(range: Range): DialogueContentParenthetical {
  return { kind: "parenthetical", range };
}

export function mkDialogueLine(line: Line): DialogueContentLine {
  return { kind: "line", line };
}

export function mkNote(
  range: Range,
  noteKind: string | null | undefined,
  textRange: Range,
): Note {
  return {
    kind: "note",
    range,
    noteKind: (noteKind ?? "").toLowerCase(),
    textRange,
  };
}

export function mkBoneyard(range: Range): Boneyard {
  return { kind: "boneyard", range };
}

export function mkPageBreak(range: Range): PageBreak {
  return { kind: "page-break", range };
}

export function mkSynopsis(range: Range, linesOfText: Range[]): Synopsis {
  return { kind: "synopsis", range, linesOfText };
}

export function mkAction(range: Range, lines: Line[]): Action {
  return { kind: "action", range, lines };
}

export function mkScene(
  range: Range,
  heading: string,
  forced: boolean,
  number: Range | null,
): SceneHeading {
  return { kind: "scene", range, heading, forced, number };
}

export function mkTransition(range: Range, forced: boolean): Transition {
  return { kind: "transition", range, forced };
}

export function mkDialogue(
  range: Range,
  characterRange: Range,
  characterExtensionsRange: Range,
  content: DialogueContent[],
): Dialogue {
  return {
    kind: "dialogue",
    range,
    characterRange,
    characterExtensionsRange,
    content,
  };
}

export function mkSection(range: Range, depth: number): Section {
  return { kind: "section", range, depth };
}

export function mkLyrics(range: Range, lines: Line[]): Lyrics {
  return { kind: "lyrics", range, lines };
}

export function mkKeyValue(
  range: Range,
  key: string,
  values: StyledText[],
): KeyValue {
  return { range, key, values };
}
