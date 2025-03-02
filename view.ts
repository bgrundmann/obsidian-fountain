import { EditorState } from "@codemirror/state";
import { EditorView, type ViewUpdate } from "@codemirror/view";
import type { FountainScript, Range } from "fountain.js";
import {
  type TFile,
  TextFileView,
  type ViewStateResult,
  type WorkspaceLeaf,
  setIcon,
} from "obsidian";
import { fountainEditorPlugin } from "./fountain_editor.js";
import { parse } from "./fountain_parser.js";
import {
  getDataRange,
  indexCardsView,
  rangeOfFirstVisibleLine,
  readingView,
} from "./reading_view.js";
export const VIEW_TYPE_FOUNTAIN = "fountain";

enum ShowMode {
  Script = "script",
  IndexCards = "index-cards",
}

class ReadonlyViewState {
  private text: string;
  public showMode: ShowMode;
  private contentEl: HTMLElement;
  private startEditModeHere: (range: Range) => void;

  constructor(
    contentEl: HTMLElement,
    text: string,
    startEditModeHere: (range: Range) => void,
  ) {
    this.showMode = ShowMode.Script;
    this.text = text;
    this.contentEl = contentEl;
    this.startEditModeHere = startEditModeHere;
  }

  render() {
    /// Parent should already be empty.
    this.contentEl.empty();
    const fp: FountainScript = parse(this.text);
    const mainblock = this.contentEl.createDiv(
      this.showMode === ShowMode.IndexCards ? undefined : "screenplay",
    );
    // Assuming nobody does a supply chain attack on the fountain library, the below
    // is fine as there is no way for the user to embed html in the fountain.
    //mainblock.innerHTML = compile(this.showMode, this.tokens);
    mainblock.innerHTML =
      this.showMode === ShowMode.IndexCards
        ? indexCardsView(fp)
        : readingView(fp);

    mainblock.addEventListener("click", (e) => {
      if (this.showMode === ShowMode.IndexCards && e.target != null) {
        const target = e.target as HTMLElement;
        if (target.id !== null && target.matches(".scene-heading")) {
          const id = target.id;
          this.showMode = ShowMode.Script;
          this.render();
          requestAnimationFrame(() => {
            const targetElement = document.getElementById(id);
            if (targetElement) {
              targetElement.scrollIntoView({
                behavior: "smooth",
                block: "start",
              });
            }
          });
        }
      } else if (this.showMode === ShowMode.Script && e.target != null) {
        const target = e.target as HTMLElement;
        const r = getDataRange(target);
        if (r === null) return;
        this.startEditModeHere(r);
      }
    });
  }

  scrollLineIntoView(r: Range) {
    const targetElement = document.querySelector(`[data-range^="${r.start},"]`);
    targetElement?.scrollIntoView();
  }

  toggleIndexCards() {
    this.showMode =
      this.showMode === ShowMode.IndexCards
        ? ShowMode.Script
        : ShowMode.IndexCards;
    this.render();
  }

  getViewData(): string {
    return this.text;
  }

  setViewData(text: string, _clear: boolean): void {
    this.text = text;
    this.render();
  }

  clear(): void {
    this.text = "";
  }

  rangeOfFirstVisibleLine(): Range | null {
    const screenplay = this.contentEl.querySelector(".screenplay");
    if (screenplay === null) return null;
    return rangeOfFirstVisibleLine(screenplay as HTMLElement);
  }
}

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

class EditorViewState {
  private cmEditor: EditorView;

  constructor(contentEl: HTMLElement, text: string, requestSave: () => void) {
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
        EditorView.editorAttributes.of({ class: "screenplay" }),
        EditorView.lineWrapping,
        fountainEditorPlugin,
        EditorView.updateListener.of((update: ViewUpdate) => {
          if (update.docChanged) {
            requestSave();
          }
        }),
      ],
    });
    this.cmEditor = new EditorView({ state: state, parent: editorContainer });
  }

  setViewData(text: string, _clear: boolean) {
    this.cmEditor.dispatch({
      changes: {
        from: 0,
        to: this.cmEditor.state.doc.length,
        insert: text,
      },
    });
  }

  getViewData(): string {
    return this.cmEditor.state.doc.toString();
  }

  clear(): void {}

  destroy(): void {
    this.cmEditor.destroy();
  }

  scrollToHere(r: Range): void {
    this.cmEditor.dispatch({
      effects: EditorView.scrollIntoView(r.start, { y: "start" }),
    });
    this.cmEditor.focus();
  }

  firstVisibleLine(): Range {
    const scrollContainer =
      firstScrollableElement(this.cmEditor.scrollDOM) ??
      this.cmEditor.scrollDOM;
    const bounds = scrollContainer.getBoundingClientRect();
    const pos = this.cmEditor.posAtCoords({ x: bounds.x, y: bounds.y + 5 });
    const lp = this.cmEditor.lineBlockAt(pos ?? 0);
    return { start: lp.from, end: lp.to + 1 };
  }
}

type FountainViewPersistedState = {
  fountain: ReadonlyViewPersistedState | EditorPersistedState;
};

type ReadonlyViewPersistedState = {
  mode: ShowMode;
};

type EditorPersistedState = {
  mode: "editing";
};

export class FountainView extends TextFileView {
  state: ReadonlyViewState | EditorViewState;
  indexCardAction: HTMLElement;
  toggleEditAction: HTMLElement;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.state = new ReadonlyViewState(this.contentEl, "", (r) =>
      this.startEditModeHere(r),
    );
    this.toggleEditAction = this.addAction(
      "edit",
      "Toggle Edit/Readonly",
      (_evt) => {
        this.toggleEditMode();
        this.app.workspace.requestSaveLayout();
      },
    );
    this.indexCardAction = this.addAction(
      "layout-grid",
      "Toggle Index Card View",
      (_evt) => {
        if (this.state instanceof ReadonlyViewState) {
          this.state.toggleIndexCards();
          this.app.workspace.requestSaveLayout();
        }
      },
    );
  }

  startEditModeHere(r: Range): void {
    this.toggleEditMode();
    if (this.state instanceof EditorViewState) {
      this.state.scrollToHere(r);
    }
  }

  isEditMode(): boolean {
    return this.state instanceof EditorViewState;
  }

  toggleEditMode() {
    const text = this.state.getViewData();
    if (this.state instanceof EditorViewState) {
      // Switch to readonly mode
      const firstLine = this.state.firstVisibleLine();
      this.state.destroy();
      this.state = new ReadonlyViewState(this.contentEl, text, (r) =>
        this.startEditModeHere(r),
      );
      this.state.render();
      this.indexCardAction.show();
      const es = this.state;
      requestAnimationFrame(() => {
        es.scrollLineIntoView(firstLine);
      });
    } else {
      // Switch to editor
      const r = this.state.rangeOfFirstVisibleLine();
      this.indexCardAction.hide();
      this.state = new EditorViewState(this.contentEl, text, this.requestSave);
      if (r !== null) this.state.scrollToHere(r);
    }
    this.toggleEditAction.empty();
    setIcon(this.toggleEditAction, this.isEditMode() ? "book-open" : "edit");
  }

  onLoadFile(file: TFile): Promise<void> {
    return super.onLoadFile(file);
  }

  getViewType() {
    return VIEW_TYPE_FOUNTAIN;
  }

  getDisplayText(): string {
    return this.file?.basename ?? "Fountain";
  }

  getViewData(): string {
    return this.state.getViewData();
  }

  setViewData(data: string, clear: boolean): void {
    this.state.setViewData(data, clear);
  }

  getState(): Record<string, unknown> {
    const textFileState = super.getState();
    if (this.state instanceof EditorViewState) {
      textFileState.fountain = { mode: "editing" };
    } else {
      textFileState.fountain = { mode: this.state.showMode };
    }
    return textFileState;
  }

  async setState(f: Record<string, unknown>, result: ViewStateResult) {
    super.setState(f, result);
    if ("fountain" in f) {
      // TODO: Should probably run proper deserialise code here
      // and deal with invalid state.
      const state = f.fountain as
        | ReadonlyViewPersistedState
        | EditorPersistedState;
      if (state.mode === "editing") {
        if (!(this.state instanceof EditorView)) {
          this.toggleEditMode();
        }
      } else {
        if (!(this.state instanceof ReadonlyViewState)) {
          this.toggleEditMode();
        }
        if (this.state instanceof ReadonlyViewState) {
          if (this.state.showMode !== state.mode) {
            this.state.toggleIndexCards();
          }
        }
      }
    } else {
      // TODO: What should we do here?
    }
  }

  clear(): void {
    this.state.clear();
    if (this.state instanceof EditorViewState) {
      this.state.destroy();
      this.state = new ReadonlyViewState(this.contentEl, "", (r) =>
        this.startEditModeHere(r),
      );
      this.indexCardAction.show();
    }
  }
}
