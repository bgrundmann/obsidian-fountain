import type {
  BasicTextElement,
  Dialogue,
  DialogueContent,
  FountainElement,
  Line,
  Note,
  Range,
  SceneHeading,
  StyledText,
  StyledTextElement,
  Transition,
} from "./types";
import { NBSP } from "./types";

// Use import type to avoid runtime circular dependency
import type { FountainScript } from "./script";

/** Is this one or more explicit blank lines? That is an Action element only consisting of one or more blank lines? */
export function isBlankLines(f: FountainElement) {
  return (
    f.kind === "action" &&
    f.lines.length >= 1 &&
    f.lines.every((l) => l.elements.length === 0)
  );
}

/// This merges consecutive basic text elements into one
export function mergeText(elts: StyledText): StyledText {
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

/**
 * Extracts all notes from a list of FountainElements
 * @param elements List of FountainElements to extract notes from
 * @returns Array of all Note elements found
 */
function extractNotesFromLines(lines: Line[], notes: Note[]): void {
  for (const line of lines) {
    for (const textElement of line.elements) {
      if (textElement.kind === "note") {
        notes.push(textElement);
      }
    }
  }
}

export function extractNotes(elements: FountainElement[]): Note[] {
  const notes: Note[] = [];

  for (const element of elements) {
    if (element.kind === "action" || element.kind === "lyrics") {
      extractNotesFromLines(element.lines, notes);
    } else if (element.kind === "dialogue") {
      extractNotesFromLines(dialogueLines(element), notes);
    }
  }
  return notes;
}

export function extractMarginMarker(note: Note): string | null {
  return note.noteKind.startsWith("@") ? note.noteKind.substring(1) : null;
}

/** Escape leading spaces (that is spaces at beginning of the string or after newlines) if cond is true. */
export function maybeEscapeLeadingSpaces(cond: boolean, s: string): string {
  return cond
    ? s.replace(/^( +)/gm, (_, spaces) => NBSP.repeat(spaces.length))
    : s;
}

/**
 * Extracts the display text for a transition, removing the ">" character for forced transitions.
 */
export function extractTransitionText(
  transition: Transition,
  script: FountainScript,
): string {
  const rawText = script.sliceDocument(transition.range).trim();

  if (transition.forced && rawText.startsWith(">")) {
    return rawText.substring(1).trim();
  }

  return rawText;
}

/** The way the parser works, blank lines can cause separate action elements
 * (as opposed to a single action element containing all the newlines).
 * This merges all subsequent action elements into a single one.
 */
export function mergeConsecutiveActions(
  script: FountainElement[],
): FountainElement[] {
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

/** Position in the source text just after the heading text (before any scene number or trailing whitespace). */
export function sceneHeadingTextEnd(scene: SceneHeading): number {
  return scene.range.start + scene.heading.length + (scene.forced ? 1 : 0);
}

/** Extract just the dialogue lines from a Dialogue element's content, ignoring parentheticals. */
export function dialogueLines(dialogue: Dialogue): Line[] {
  return dialogue.content
    .filter((c): c is { kind: "line"; line: Line } => c.kind === "line")
    .map((c) => c.line);
}

/** Extract the first parenthetical range from a Dialogue element's content, or null. */
export function firstParenthetical(dialogue: Dialogue): Range | null {
  for (const c of dialogue.content) {
    if (c.kind === "parenthetical") return c.range;
  }
  return null;
}

/** Filter the content of a dialogue element, keeping only lines that pass the filter. Parentheticals are kept as-is. */
export function filterDialogueContent(
  content: DialogueContent[],
  filterLine: (line: Line) => Line | null,
): DialogueContent[] {
  const result: DialogueContent[] = [];
  for (const c of content) {
    if (c.kind === "parenthetical") {
      result.push(c);
    } else {
      const filtered = filterLine(c.line);
      if (filtered !== null) {
        result.push({ kind: "line", line: filtered });
      }
    }
  }
  return result;
}
