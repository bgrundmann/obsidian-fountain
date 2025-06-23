import { history } from "@codemirror/commands";
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView, type ViewUpdate, drawSelection } from "@codemirror/view";
import { fountainFiles } from "fountain_files";
import { FuzzySelectString } from "fuzzy_select_string";
import {
  Menu,
  type TFile,
  TextFileView,
  type ViewStateResult,
  type WorkspaceLeaf,
  setIcon,
} from "obsidian";
import type { FountainScript, Range, ShowHideSettings } from "./fountain";
import { createFountainEditorPlugin } from "./fountain_editor";
import { type Callbacks, renderIndexCards } from "./index_cards_view";
import { rangeOfFirstVisibleLine, renderFountain } from "./reading_view";

export const VIEW_TYPE_FOUNTAIN = "fountain";

enum ShowMode {
  Script = "script",
  IndexCards = "index-cards",
}

type Rehearsal = {
  character: string;
  previousShowHideSettings: ShowHideSettings;
};

type ReadonlyViewPersistedState = {
  mode: ShowMode;
  rehearsal?: Rehearsal; // This misses which dialogue(s) have been revealed, but is cheap and good enough
} & ShowHideSettings;

class ReadonlyViewState {
  public pstate: ReadonlyViewPersistedState;
  private contentEl: HTMLElement;
  private startEditModeHere: (range: Range) => void;
  private path: string;

  constructor(
    contentEl: HTMLElement,
    pstate: ReadonlyViewPersistedState,
    path: string,
    startEditModeHere: (range: Range) => void,
    readonly requestSave: () => void,
  ) {
    this.contentEl = contentEl;
    this.startEditModeHere = startEditModeHere;
    this.path = path;
    this.pstate = pstate;
  }

  public get showMode(): ShowMode {
    return this.pstate.mode;
  }

  private get blackout(): string | null {
    return this.pstate.rehearsal?.character ?? null;
  }

  script(): FountainScript {
    return fountainFiles.get(this.path);
  }

  public stopRehearsalMode() {
    if (this.pstate.rehearsal) {
      this.pstate = {
        ...this.pstate,
        ...this.pstate.rehearsal.previousShowHideSettings,
      };
      this.pstate.rehearsal = undefined;
      this.render();
    }
  }

  startRehearsalMode(character: string) {
    this.pstate.rehearsal = {
      character,
      // We have to explicitely save all 3 settings otherwise
      // they might be undefined instead of false and then not
      // be set by the spread operator
      previousShowHideSettings: {
        hideBoneyard: this.pstate.hideBoneyard || false,
        hideSynopsis: this.pstate.hideSynopsis || false,
        hideNotes: this.pstate.hideNotes || false,
      },
    };
    this.pstate.hideBoneyard = true;
    this.pstate.hideNotes = true;
    this.pstate.hideSynopsis = true;
    this.render();
  }

  /** Is blackout mode active and for which character? */
  public blackoutCharacter(): string | null {
    return this.blackout;
  }

  private toggleBlackoutHandler(evt: Event) {
    const target = evt.target as HTMLElement;
    target.classList.toggle("blackout");
  }

  private installToggleBlackoutHandlers() {
    const blackouts = this.contentEl.querySelectorAll(".blackout");
    for (const bl of blackouts) {
      bl.addEventListener("click", (evt: Event) => {
        this.toggleBlackoutHandler(evt);
      });
    }
  }

  render() {
    this.contentEl.empty();
    const callbacks: Callbacks = {
      requestSave: (): void => {
        this.requestSave();
      },
      reRender: (): void => {
        this.render();
      },
      startEditModeHere: (r: Range): void => {
        this.startEditModeHere(r);
      },
      startReadingModeHere: (r: Range): void => {
        this.scrollToHere(r);
      },
    };
    const fp = this.script();
    if ("error" in fp) {
      console.log("error parsing script", fp);
      return;
    }
    const mainblock = this.contentEl.createDiv(
      this.showMode === ShowMode.IndexCards ? undefined : "screenplay",
    );
    // We are using innerHTML here. Which is not ideal and states back
    // from when we were using the fountain library.  Now that we are
    // using our own parser we could in theory rewrite this to use
    // the recommended obsidian create... calls.
    switch (this.showMode) {
      case ShowMode.IndexCards:
        renderIndexCards(mainblock, this.path, fp, callbacks);
        break;

      case ShowMode.Script:
        renderFountain(mainblock, fp, this.pstate, this.blackout ?? undefined);
        break;
    }

    if (this.blackout) {
      this.installToggleBlackoutHandlers();
    }
  }

  scrollToHere(r: Range) {
    const scroll = () => {
      const targetElement = document.querySelector(
        `[data-range^="${r.start},"]`,
      );
      targetElement?.scrollIntoView();
    };
    if (this.pstate.mode !== ShowMode.Script) {
      this.toggleIndexCards();
      requestAnimationFrame(() => {
        scroll();
      });
    } else {
      scroll();
    }
  }

  public setPersistentState(pstate: ReadonlyViewPersistedState) {
    this.pstate = pstate;
    this.render();
  }

  public setShowHideSettings(sh: ShowHideSettings) {
    this.pstate = { ...this.pstate, ...sh };
    this.render();
  }

  toggleIndexCards() {
    this.pstate.mode =
      this.pstate.mode === ShowMode.IndexCards
        ? ShowMode.Script
        : ShowMode.IndexCards;
    this.render();
  }

  getViewData(): string {
    return fountainFiles.get(this.path).document;
  }

  setViewData(path: string, text: string, _clear: boolean): void {
    this.path = path;
    fountainFiles.set(path, text);
    this.render();
  }

  clear(): void {
    //TODO: When do I need this?
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
  private path: string;

  constructor(
    contentEl: HTMLElement,
    path: string,
    text: string,
    requestSave: () => void,
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
        history(),
        drawSelection(),
        EditorView.editorAttributes.of({ class: "screenplay" }),
        EditorView.lineWrapping,
        createFountainEditorPlugin(() => path),
        EditorView.updateListener.of((update: ViewUpdate) => {
          if (update.docChanged) {
            requestSave();
          }
        }),
      ],
    });
    this.path = path;
    this.cmEditor = new EditorView({
      state: state,
      parent: editorContainer,
    });
  }

  script(): FountainScript {
    return fountainFiles.get(this.path);
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
    fountainFiles.set(path, text);
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
      // scroll the view
      effects: EditorView.scrollIntoView(r.start, { y: "start" }),
      // move the cursor as well
      selection: EditorSelection.single(r.start),
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

/** Stored in persistent state (workspace.json under the fountain key) */
type FountainViewPersistedState = ReadonlyViewPersistedState & {
  editing?: boolean; // undefined => false
};

export class FountainView extends TextFileView {
  state: ReadonlyViewState | EditorViewState;
  private readonlyViewState: ReadonlyViewPersistedState;
  private toggleEditAction: HTMLElement;
  private showViewMenuAction: HTMLElement;
  private stopRehearsalModeAction: HTMLElement;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.readonlyViewState = {
      mode: ShowMode.Script,
    };
    this.state = new ReadonlyViewState(
      this.contentEl,
      this.readonlyViewState,
      "",
      (r) => this.startEditModeHere(r),
      () => this.requestSave(),
    );
    this.toggleEditAction = this.addAction(
      "edit",
      "Toggle Edit/Readonly",
      (_evt) => {
        this.toggleEditMode();
        this.app.workspace.requestSaveLayout();
      },
    );
    this.showViewMenuAction = this.addAction("eye", "View options", (evt) =>
      this.showViewMenu(evt),
    );
    this.stopRehearsalModeAction = this.addAction(
      "brain",
      "Stop rehearsal",
      (_evt) => {
        this.stopRehearsalMode();
      },
    );
    this.stopRehearsalModeAction.hide();
  }

  private showViewMenu(evt: MouseEvent) {
    if (this.state instanceof ReadonlyViewState) {
      const updateSettings = (s: ShowHideSettings) => {
        if (this.state instanceof ReadonlyViewState) {
          const newSettings = this.state.pstate;
          this.state.setShowHideSettings({ ...newSettings, ...s });
          this.app.workspace.requestSaveLayout();
        }
      };
      const menu = new Menu();
      const state = this.state.pstate;
      if (!this.blackoutCharacter()) {
        menu.addItem((item) =>
          item
            .setTitle(state.mode === ShowMode.Script ? "Index cards" : "Script")
            .onClick(() => {
              if (this.state instanceof ReadonlyViewState) {
                this.state.toggleIndexCards();
                this.app.workspace.requestSaveLayout();
              }
            }),
        );
        menu.addSeparator();
      }
      if (state.mode !== ShowMode.IndexCards) {
        menu.addItem((item) =>
          item
            .setTitle("Synopsis")
            .setChecked(!(state.hideSynopsis || false))
            .onClick(() =>
              updateSettings({ hideSynopsis: !(state.hideSynopsis || false) }),
            ),
        );
        menu.addItem((item) =>
          item
            .setTitle("Notes")
            .setChecked(!(state.hideNotes || false))
            .onClick(() =>
              updateSettings({ hideNotes: !(state.hideNotes || false) }),
            ),
        );
        menu.addItem((item) =>
          item
            .setTitle("Boneyard")
            .setChecked(!(state.hideBoneyard || false))
            .onClick(() =>
              updateSettings({ hideBoneyard: !(state.hideBoneyard || false) }),
            ),
        );
        menu.addSeparator();
        if (this.blackoutCharacter()) {
          menu.addItem((item) => {
            item.setTitle("Stop Rehearsal").onClick(() => {
              this.stopRehearsalMode();
            });
          });
        } else {
          menu.addItem((item) =>
            item
              .setTitle("Rehearsal")
              .onClick(() => this.rehearsalModeClicked()),
          );
        }
      }
      menu.showAtMouseEvent(evt);
    }
  }

  private rehearsalModeClicked(): void {
    const script = this.script();
    if (!("error" in script)) {
      new FuzzySelectString(
        this.app,
        "Whose lines?",
        Array.from(script.allCharacters.values()),
        (character) => this.startRehearsalMode(character),
      ).open();
    }
  }

  startEditModeHere(r: Range): void {
    this.switchToEditMode();
    this.scrollToHere(r);
  }

  startReadingModeHere(r: Range): void {
    this.switchToReadonlyMode();
    this.scrollToHere(r);
  }

  scrollToHere(r: Range): void {
    this.state.scrollToHere(r);
  }

  isEditMode(): boolean {
    return this.state instanceof EditorViewState;
  }

  /// Switch to edit mode (no-op if already in edit mode)
  switchToEditMode() {
    if (!(this.state instanceof EditorViewState)) {
      this.toggleEditMode();
    }
  }

  /// Switch to readonly mode (no-op if already in readonly mode)
  switchToReadonlyMode() {
    if (!(this.state instanceof ReadonlyViewState)) {
      this.toggleEditMode();
    }
  }

  startRehearsalMode(blackout: string) {
    this.switchToReadonlyMode();
    if (this.state instanceof ReadonlyViewState) {
      this.showViewMenuAction.hide();
      this.stopRehearsalModeAction.show();
      this.state.startRehearsalMode(blackout);
      this.app.workspace.requestSaveLayout();
    }
  }

  public blackoutCharacter(): string | null {
    if (this.state instanceof ReadonlyViewState) {
      return this.state.blackoutCharacter();
    }
    return null;
  }

  public stopRehearsalMode() {
    if (this.state instanceof ReadonlyViewState) {
      this.state.stopRehearsalMode();
      this.showViewMenuAction.show();
      this.stopRehearsalModeAction.hide();
      this.app.workspace.requestSaveLayout();
    }
  }

  script(): FountainScript {
    return this.state.script();
  }

  toggleEditMode() {
    const text = this.state.getViewData();
    if (this.state instanceof EditorViewState) {
      // Switch to readonly mode
      this.showViewMenuAction.show();
      const firstLine = this.state.firstVisibleLine();
      this.state.destroy();
      this.state = new ReadonlyViewState(
        this.contentEl,
        this.readonlyViewState,
        this.file?.path ?? "",
        (r) => this.startEditModeHere(r),
        () => this.requestSave(),
      );
      this.state.render();
      const es = this.state;
      requestAnimationFrame(() => {
        es.scrollToHere(firstLine);
      });
    } else {
      // Switch to editor
      this.showViewMenuAction.hide();
      this.readonlyViewState = this.state.pstate;
      const r = this.state.rangeOfFirstVisibleLine();
      this.state = new EditorViewState(
        this.contentEl,
        this.file?.path ?? "",
        text,
        this.requestSave,
      );
      if (r !== null) this.state.scrollToHere(r);
    }
    this.toggleEditAction.empty();
    setIcon(this.toggleEditAction, this.isEditMode() ? "book-open" : "edit");
  }

  onLoadFile(file: TFile): Promise<void> {
    return super.onLoadFile(file);
  }

  onUnloadFile(file: TFile): Promise<void> {
    return super.onUnloadFile(file);
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
    const path = this.file?.path;
    if (path) {
      this.state.setViewData(path, data, clear);
    }
  }

  getState(): Record<string, unknown> {
    const textFileState = super.getState();
    let editing: boolean;

    if (this.state instanceof ReadonlyViewState) {
      // If readonly view is active make sure our
      // copy matches
      this.readonlyViewState = this.state.pstate;
      editing = false;
    } else {
      editing = true;
    }
    textFileState.fountain = {
      editing: editing,
      ...this.readonlyViewState,
    };

    return textFileState;
  }

  /// setState is called when the workspace.json deserialisation ran into
  /// a view of type fountain, it should restore the workspace.
  async setState(f: Record<string, unknown>, result: ViewStateResult) {
    super.setState(f, result);
    if ("fountain" in f) {
      // TODO: Should probably run proper deserialise code here
      // and deal with invalid state.
      const state = f.fountain as FountainViewPersistedState;
      this.readonlyViewState = state;
      if (state.editing) {
        this.switchToEditMode();
      } else {
        this.switchToReadonlyMode();
        if (this.state instanceof ReadonlyViewState) {
          this.state.setPersistentState(state);
          if (state.rehearsal) {
            this.startRehearsalMode(state.rehearsal.character);
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
      this.state = new ReadonlyViewState(
        this.contentEl,
        this.readonlyViewState,
        "",
        (r) => this.startEditModeHere(r),
        () => this.requestSave(),
      );
    }
  }
}
