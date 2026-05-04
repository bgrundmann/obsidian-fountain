import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { foldGutter, foldKeymap } from "@codemirror/language";
import {
  highlightSelectionMatches,
  openSearchPanel,
  search,
  searchKeymap,
} from "@codemirror/search";
import { EditorSelection, EditorState } from "@codemirror/state";
import {
  EditorView,
  type ViewUpdate,
  drawSelection,
  keymap,
} from "@codemirror/view";
import { createCharacterCompletion } from "../codemirror/character_completion";
import { createFountainEditorPlugin } from "../codemirror/editor";
import { createFountainFoldService } from "../codemirror/folding";
import type { LinkCompletionCandidate } from "../codemirror/link_completion";
import { fountainScriptField } from "../codemirror/state";
import type { Edit, FountainScript, Range } from "../fountain";
import { findSceneAtOffset } from "../fountain";
import type { ViewState } from "./view_state";

export type EditorCallbacks = {
  onScriptChanged: (script: FountainScript) => void;
  requestSave: () => void;
  /** Optional source of link completion candidates triggered on `[[>`. */
  getLinkCandidates?: () => LinkCompletionCandidate[];
};

/// Returns the first scrollable element starting at the current element up to the DOM tree.
function firstScrollableElement(node: HTMLElement): HTMLElement | null {
  let current: HTMLElement | null = node;
  while (current !== null) {
    if (current.scrollHeight > current.clientHeight) {
      return current;
    }
    current = current.parentNode as HTMLElement;
  }
  return (document.scrollingElement as HTMLElement) || document.documentElement;
}

/** Wraps a CodeMirror editor for editing fountain script source text. */
export class EditorViewState implements ViewState {
  readonly isEditMode = true;
  private cmEditor: EditorView;
  private path: string;
  /** True while a sync-driven dispatch is in flight, so the update listener
   *  knows to skip `onScriptChanged` / `requestSave` and avoid re-propagating
   *  an edit that has already been distributed by the parent FountainView. */
  private syncing = false;

  constructor(
    contentEl: HTMLElement,
    path: string,
    text: string,
    private callbacks: EditorCallbacks,
    spellCheckEnabled: boolean,
  ) {
    contentEl.empty();
    const editorContainer = contentEl.createDiv("custom-editor-component");

    // our screenplay sets some of the styling information
    // before the code mirror overrides them. And instead of
    // messing with !important in the css, we force the theme
    // to take the values from higher up.
    const theme = EditorView.theme({
      "&": {
        fontSize: "12pt",
      },
      ".cm-content": {
        fontFamily: "inherit",
        lineHeight: "inherit",
      },
      ".cm-scroller": {
        fontFamily: "inherit",
        lineHeight: "inherit",
      },
    });
    const state = EditorState.create({
      doc: text,
      extensions: [
        theme,
        fountainScriptField,
        history(),
        drawSelection(),
        keymap.of([...defaultKeymap, ...historyKeymap, ...foldKeymap, ...searchKeymap]),
        search(),
        highlightSelectionMatches(),
        EditorView.editorAttributes.of({ class: "screenplay" }),
        EditorView.lineWrapping,
        foldGutter(),
        createFountainFoldService(),
        createFountainEditorPlugin(),
        createCharacterCompletion(
          () => this.cmEditor.state.field(fountainScriptField),
          callbacks.getLinkCandidates,
        ),
        EditorView.updateListener.of((update: ViewUpdate) => {
          if (update.docChanged && !this.syncing) {
            callbacks.onScriptChanged(
              update.state.field(fountainScriptField),
            );
            callbacks.requestSave();
          }
        }),
      ],
    });
    this.path = path;
    this.cmEditor = new EditorView({
      state: state,
      parent: editorContainer,
    });
    this.cmEditor.contentDOM.spellcheck = spellCheckEnabled;
  }

  receiveEdits(edits: Edit[], _newScript: FountainScript): void {
    if (edits.length === 0) return;
    // CM treats every `from`/`to` in a batch as a pre-transaction position
    // and expects them sorted ascending and non-overlapping.
    const changes = [...edits]
      .sort((a, b) => a.range.start - b.range.start)
      .map((e) => ({
        from: e.range.start,
        to: e.range.end,
        insert: e.replacement,
      }));
    this.syncing = true;
    try {
      this.cmEditor.dispatch({ changes });
    } finally {
      this.syncing = false;
    }
  }

  receiveScript(newScript: FountainScript): void {
    // No precise edits available — full-doc replace. Cursor/undo are lost
    // on this path by necessity (used for external reloads and for
    // propagating user-typed edits to non-originating editors).
    this.syncing = true;
    try {
      this.cmEditor.dispatch({
        changes: {
          from: 0,
          to: this.cmEditor.state.doc.length,
          insert: newScript.document,
        },
      });
    } finally {
      this.syncing = false;
    }
  }

  setPath(path: string): void {
    this.path = path;
  }

  getViewData(): string {
    return this.cmEditor.state.doc.toString();
  }

  clear(): void {}

  destroy(): void {
    this.cmEditor.destroy();
  }

  hasSelection(): boolean {
    const selection = this.cmEditor.state.selection.main;
    return !selection.empty;
  }

  getSelection(): { from: number; to: number; text: string } | null {
    const selection = this.cmEditor.state.selection.main;
    if (selection.empty) return null;
    return {
      from: selection.from,
      to: selection.to,
      text: this.cmEditor.state.doc.sliceString(selection.from, selection.to),
    };
  }

  dispatchChanges(changes: { from: number; to: number; insert: string }): void {
    this.cmEditor.dispatch({ changes });
  }

  getDocText(): string {
    return this.cmEditor.state.doc.toString();
  }

  scrollToHere(r: Range): void {
    this.cmEditor.dispatch({
      // scroll the view
      effects: EditorView.scrollIntoView(r.start, {
        y: "start",
        yMargin: 50,
      }),
      // select the text range
      selection: EditorSelection.range(r.start, r.end),
    });
    this.cmEditor.focus();
  }

  focus(): void {
    this.cmEditor.focus();
  }

  setSpellCheck(enabled: boolean): void {
    this.cmEditor.contentDOM.spellcheck = enabled;
  }

  openSearch(): void {
    openSearchPanel(this.cmEditor);
  }

  blackoutCharacter(): string | null {
    return null;
  }
  render(): void {}

  rangeOfFirstVisibleLine(): Range | null {
    const scrollContainer =
      firstScrollableElement(this.cmEditor.scrollDOM) ??
      this.cmEditor.scrollDOM;
    const bounds = scrollContainer.getBoundingClientRect();
    const pos = this.cmEditor.posAtCoords({ x: bounds.x, y: bounds.y + 5 });
    const lp = this.cmEditor.lineBlockAt(pos ?? 0);
    return { start: lp.from, end: lp.to + 1 };
  }

  cursorOffset(): number {
    return this.cmEditor.state.selection.main.head;
  }

  selectCurrentScene(): void {
    const offset = this.cmEditor.state.selection.main.head;
    const script = this.cmEditor.state.field(fountainScriptField);
    const scene = findSceneAtOffset(script, offset);
    if (!scene) return;
    this.cmEditor.dispatch({
      selection: EditorSelection.range(scene.range.start, scene.range.end),
      effects: EditorView.scrollIntoView(scene.range.start, {
        y: "start",
        yMargin: 50,
      }),
    });
    this.cmEditor.focus();
  }
}
