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
import type { FountainScript, Range } from "./fountain";
import { createCharacterCompletion } from "./character_completion";
import { createFountainEditorPlugin } from "./fountain_editor";
import { createFountainFoldService } from "./fountain_folding";
import type { ViewState } from "./view_state";

export type EditorCallbacks = {
  getScript: () => FountainScript;
  onScriptChanged: (script: FountainScript) => void;
  requestSave: () => void;
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
    const getScript = () => callbacks.getScript();
    const state = EditorState.create({
      doc: text,
      extensions: [
        theme,
        history(),
        drawSelection(),
        keymap.of([...defaultKeymap, ...historyKeymap, ...foldKeymap, ...searchKeymap]),
        search(),
        highlightSelectionMatches(),
        EditorView.editorAttributes.of({ class: "screenplay" }),
        EditorView.lineWrapping,
        foldGutter(),
        createFountainFoldService(getScript),
        createFountainEditorPlugin(
          getScript,
          (script: FountainScript) => callbacks.onScriptChanged(script),
        ),
        createCharacterCompletion(getScript),
        EditorView.updateListener.of((update: ViewUpdate) => {
          if (update.docChanged) {
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

  setViewData(path: string, text: string, _clear: boolean) {
    this.path = path;
    this.cmEditor.dispatch({
      changes: {
        from: 0,
        to: this.cmEditor.state.doc.length,
        insert: text,
      },
    });
    // Parsing and updating is handled by parent view's setViewData
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
}
