import {
  type CompletionContext,
  type CompletionResult,
  type CompletionSource,
} from "@codemirror/autocomplete";

/**
 * Pattern matched at the cursor for link autocomplete:
 *   `[[>` followed by zero or more chars that aren't `]`, `|`, or newline.
 */
const LINK_PREFIX_PATTERN = /\[\[>[^\]|\n]*$/;

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

    return {
      from,
      options: filtered.map((c) => ({
        label: c.label ?? c.linktext,
        type: "file",
        apply: `${c.linktext}]]`,
      })),
    };
  };
}
