import type { FountainElement, Line, Note } from "./types";
import { dialogueLines } from "./utils";

export const LINK_NOTE_KIND = ">";

export function isLinkNote(note: Note): boolean {
  return note.noteKind === LINK_NOTE_KIND;
}

export interface ParsedLink {
  /** The target path/linktext as written by the user. */
  target: string;
  /** The display text following `|`, or null if absent. */
  displayText: string | null;
}

/** Parse the text content of a `[[>...]]` note into target + optional display. */
export function parseLinkContent(text: string): ParsedLink {
  const pipeIndex = text.indexOf("|");
  if (pipeIndex === -1) {
    return { target: text.trim(), displayText: null };
  }
  return {
    target: text.slice(0, pipeIndex).trim(),
    displayText: text.slice(pipeIndex + 1),
  };
}

function extractFromLines(lines: Line[], out: Note[]): void {
  for (const line of lines) {
    for (const el of line.elements) {
      if (el.kind === "note" && isLinkNote(el)) out.push(el);
    }
  }
}

/** Walk the script and return every link note (`[[>...]]`). */
export function extractLinks(elements: FountainElement[]): Note[] {
  const out: Note[] = [];
  for (const el of elements) {
    if (
      el.kind === "action" ||
      el.kind === "lyrics" ||
      el.kind === "synopsis"
    ) {
      extractFromLines(el.lines, out);
    } else if (el.kind === "dialogue") {
      extractFromLines(dialogueLines(el), out);
    }
  }
  return out;
}

function stripExt(p: string): string {
  const slash = p.lastIndexOf("/");
  const dot = p.lastIndexOf(".");
  return dot > slash ? p.slice(0, dot) : p;
}

function basename(p: string): string {
  return p.slice(p.lastIndexOf("/") + 1);
}

/**
 * Decide whether a literal `[[>target]]` text would resolve to `path` under
 * Obsidian's wiki-link conventions. Covers the four common forms — full
 * path, full path no-ext, basename, basename no-ext — case-insensitively.
 * Used to detect which links to rewrite when a target file is renamed
 * (after `metadataCache` has already moved on from the old path).
 */
export function targetRefersTo(target: string, path: string): boolean {
  const t = target.replace(/^\/+/, "").toLowerCase();
  const p = path.toLowerCase();
  if (t === p) return true;
  if (t === stripExt(p)) return true;
  const base = basename(p);
  if (t === base) return true;
  if (t === stripExt(base)) return true;
  return false;
}
