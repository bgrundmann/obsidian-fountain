import {
  type CompletionContext,
  type CompletionResult,
  type CompletionSource,
} from "@codemirror/autocomplete";
import type { EditorView } from "@codemirror/view";

/**
 * Pattern matched at the cursor for link autocomplete:
 *   `[[>` followed by zero or more chars that aren't `]`, `[`, `|`, or
 * newline. Excluding `[` keeps the match anchored at the most recent
 * `[[>` (so `[[>foo [[>bar` only matches `[[>bar` at the cursor).
 * Excluding `|` means completion does not fire when the cursor is in
 * an existing alias segment.
 */
const LINK_PREFIX_PATTERN = /\[\[>[^\][|\n]*$/;

export interface LinkCompletionCandidate {
  /** Text inserted into the source (the linktext form). */
  linktext: string;
  /** Text shown in the completion popup, often equal to `linktext`. */
  label?: string;
}

/**
 * Returns a CompletionSource that fires when the user has typed `[[>...`
 * (with no closing `]]` yet) and offers vault file linktexts.
 */
export function createLinkCompletionSource(
  getCandidates: () => LinkCompletionCandidate[],
): CompletionSource {
  return (context: CompletionContext): CompletionResult | null => {
    const match = context.matchBefore(LINK_PREFIX_PATTERN);
    if (!match) return null;

    const candidates = getCandidates();
    if (candidates.length === 0) return null;

    // Position to replace: just after `[[>` (3 characters in).
    const from = match.from + 3;
    const typed = match.text.slice(3).toLowerCase();

    const filtered = candidates
      .filter((c) => c.linktext.toLowerCase().includes(typed))
      .sort((a, b) => a.linktext.localeCompare(b.linktext));

    if (filtered.length === 0) return null;

    // We deliberately leave `to` defaulted to the cursor so CodeMirror's
    // fuzzy-match pattern (`sliceDoc(from, to)`) is just what the user
    // has typed — extending `to` past the cursor would poison the
    // pattern with `]]` or stale linktext and suppress the popup. The
    // wider replacement (consume any `|alias` and trailing `]]`) is done
    // in the per-option `apply` function instead, which detects the
    // closing brackets at apply-time from the live editor state.
    return {
      from,
      options: filtered.map((c) => ({
        label: c.label ?? c.linktext,
        type: "file",
        apply: applyLink(c.linktext),
      })),
    };
  };
}

/**
 * Builds an apply-function that replaces `from..to` with `linktext]]`,
 * extending `to` to consume any `|alias` and trailing `]]` that already
 * follow the cursor on the same line.
 */
function applyLink(linktext: string) {
  return (
    view: EditorView,
    _completion: unknown,
    from: number,
    to: number,
  ): void => {
    const lineEnd = view.state.doc.lineAt(to).to;
    const after = view.state.sliceDoc(to, lineEnd);
    // Forward scan stops at `[` so we don't gobble an unrelated
    // `[[Another]]` later on the line. Any `|alias` is dropped — the
    // user is picking a different target.
    const tail = after.match(/^[^\][\n]*\]\]/);
    const replaceTo = tail ? to + tail[0].length : to;
    const insert = `${linktext}]]`;
    view.dispatch({
      changes: { from, to: replaceTo, insert },
      selection: { anchor: from + insert.length },
      userEvent: "input.complete",
    });
  };
}
