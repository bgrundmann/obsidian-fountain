import { StateEffect, StateField } from "@codemirror/state";
import type { FountainScript } from "../fountain";
import { parse } from "../fountain/parser";

/**
 * State effect to set the fountain script externally (e.g., when the document
 * is loaded or replaced from outside CodeMirror).
 */
export const setFountainScript = StateEffect.define<FountainScript>();

/**
 * StateField that holds the parsed FountainScript.
 *
 * By storing the parse result in a StateField rather than a ViewPlugin,
 * the parsed script is always up-to-date when other extensions (like
 * foldGutter) query it during the same update cycle. StateField updates
 * run during state creation, before any ViewPlugin.update() calls.
 */
export const fountainScriptField = StateField.define<FountainScript>({
  create(state) {
    return parse(state.doc.toString(), {});
  },

  update(script, tr) {
    // Check for explicit set effect first (used for external updates)
    for (const effect of tr.effects) {
      if (effect.is(setFountainScript)) {
        return effect.value;
      }
    }

    // Re-parse on document changes
    if (tr.docChanged) {
      return parse(tr.newDoc.toString(), {});
    }

    return script;
  },
});
