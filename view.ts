import { EditorState } from "@codemirror/state";
import { EditorView, type ViewUpdate } from "@codemirror/view";
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
import { type ParseError, parse } from "./parser_cache";
import {
  indexCardsView,
  rangeOfFirstVisibleLine,
  readonlyView,
} from "./reading_view";
export const VIEW_TYPE_FOUNTAIN = "fountain";

enum ShowMode {
  Script = "script",
  IndexCards = "index-cards",
}

/// Move the range of text to a new position. The newStart position is required
/// to not be within range.
function moveText(text: string, range: Range, newStart: number): string {
  // Extract the text to be moved
  const movedPortion = text.slice(range.start, range.end);
  const beforeRange = text.slice(0, range.start);
  const afterRange = text.slice(range.end);

  // If moving forward
  if (newStart >= range.end) {
    return (
      beforeRange +
      afterRange.slice(0, newStart - range.end) +
      movedPortion +
      afterRange.slice(newStart - range.end)
    );
  }
  // If moving backward
  return (
    text.slice(0, newStart) +
    movedPortion +
    text.slice(newStart, range.start) +
    afterRange
  );
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
  private text: string;
  public pstate: ReadonlyViewPersistedState;
  private contentEl: HTMLElement;
  private startEditModeHere: (range: Range) => void;
  private path: string;

  constructor(
    contentEl: HTMLElement,
    pstate: ReadonlyViewPersistedState,
    path: string,
    text: string,
    startEditModeHere: (range: Range) => void,
  ) {
    this.text = text;
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

  private getDragData(evt: DragEvent): Range | null {
    try {
      const json = evt.dataTransfer?.getData("application/json");
      if (!json) return null;
      const r: Range = JSON.parse(json);
      return r;
    } catch (error) {
      return null;
    }
  }

  script(): FountainScript | ParseError {
    return parse(this.path, this.text);
  }

  private installIndexCardEventHandlers(mainblock: HTMLDivElement) {
    const indexCards = mainblock.querySelectorAll(".screenplay-index-card");
    const starts = Array.from(mainblock.querySelectorAll("[data-start]"))
      .map((e: Element) => {
        return Number.parseInt(e.getAttribute("data-start") || "-1");
      })
      .filter((v) => v !== -1);
    function rangeFromStart(start: number): Range {
      const ndx = starts.findIndex((r) => r === start);
      return { start: start, end: starts[ndx + 1] };
    }
    for (const indexCard of indexCards) {
      const d = indexCard.querySelector("[data-start]");
      if (d === null) continue;
      const start = Number.parseInt(d.getAttribute("data-start") || "-1");
      const indexCardRange = rangeFromStart(start);
      indexCard.addEventListener("dragstart", (evt: DragEvent) => {
        this.dragstartHandler(mainblock, indexCardRange, evt);
      });
      this.addDragOverLeaveDropHandlers(indexCard, indexCardRange);
      const bt = indexCard.querySelector("button.copy") as HTMLElement;
      setIcon(bt, "copy-plus");
      bt.addEventListener("click", (_ev) => {
        this.copyScene(indexCardRange);
      });
    }
    const sections = mainblock.querySelectorAll(".section");
    for (const section of sections) {
      const start = Number.parseInt(section.getAttribute("data-start") || "-1");
      // TODO think about if that is always the right thing for sections
      const range = rangeFromStart(start);
      this.addDragOverLeaveDropHandlers(section, range);
    }
  }

  private addDragOverLeaveDropHandlers(el: Element, range: Range) {
    el.addEventListener("dragover", (evt: DragEvent) => {
      this.dragoverHandler(el, range, evt);
    });
    el.addEventListener("dragleave", (e: DragEvent) => {
      el.classList.remove("drop-left");
      el.classList.remove("drop-right");
    });
    el.addEventListener("drop", (e: DragEvent) => {
      this.dropHandler(el, range, e);
    });
  }

  private copyScene(range: Range): void {
    this.text =
      this.text.slice(0, range.end) +
      this.text.slice(range.start, range.end) +
      this.text.slice(range.end);
    this.render();
  }

  private dropHandler(dropZone: Element, dropZoneRange: Range, evt: DragEvent) {
    const draggedRange = this.getDragData(evt);
    if (!draggedRange) return;
    if (draggedRange.start === dropZoneRange.start) return;
    const before = dropZone.classList.contains("drop-left");
    if (!before && !dropZone.classList.contains("drop-right")) return;
    dropZone.classList.remove("drop-left");
    dropZone.classList.remove("drop-right");
    evt.preventDefault();
    this.text = moveText(
      this.text,
      draggedRange,
      before ? dropZoneRange.start : dropZoneRange.end,
    );
    this.render();
  }

  private dragoverHandler(
    dropZone: Element,
    dropZoneRange: Range,
    evt: DragEvent,
  ) {
    evt.preventDefault();
    const rect = dropZone.getBoundingClientRect();
    const mouseX = evt.clientX;

    // Clamp mouseX to element boundaries
    const clampedX = Math.min(Math.max(mouseX, rect.left), rect.right);
    //
    // Calculate percentage within bounds
    const percentage = ((clampedX - rect.left) / rect.width) * 100;

    if (percentage > 70) {
      dropZone.classList.add("drop-right");
      dropZone.classList.remove("drop-left");
    } else if (percentage < 30) {
      dropZone.classList.add("drop-left");
      dropZone.classList.remove("drop-right");
    } else {
      dropZone.classList.remove("drop-left");
      dropZone.classList.remove("drop-right");
    }
  }

  private dragstartHandler(
    mainblock: HTMLDivElement,
    range: Range,
    evt: DragEvent,
  ): void {
    if (!evt.dataTransfer) return;
    evt.dataTransfer.clearData();
    evt.dataTransfer.setData("application/json", JSON.stringify(range));
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
    console.log(this.pstate.rehearsal);
    this.pstate.hideBoneyard = true;
    this.pstate.hideNotes = true;
    this.pstate.hideSynopsis = true;
    console.log(this.pstate.rehearsal);
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
    /// Parent should already be empty.
    this.contentEl.empty();
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
    mainblock.innerHTML =
      this.showMode === ShowMode.IndexCards
        ? indexCardsView(fp)
        : readonlyView(fp, this.pstate, this.blackout ?? undefined);

    if (this.blackout) {
      this.installToggleBlackoutHandlers();
    }

    if (this.showMode === ShowMode.IndexCards) {
      this.installIndexCardEventHandlers(mainblock);
    }

    mainblock.addEventListener("click", (e) => {
      if (this.showMode === ShowMode.IndexCards && e.target != null) {
        const target = e.target as HTMLElement;
        if (target.id !== null && target.matches(".scene-heading")) {
          const id = target.id;
          this.pstate.mode = ShowMode.Script;
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
      }
    });
  }

  scrollLineIntoView(r: Range) {
    const targetElement = document.querySelector(`[data-range^="${r.start},"]`);
    targetElement?.scrollIntoView();
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
    return this.text;
  }

  setViewData(path: string, text: string, _clear: boolean): void {
    this.path = path;
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

  script(): FountainScript | ParseError {
    return parse(this.path, this.cmEditor.state.doc.toString());
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

/** Stored in persistent state (workspace.json under the fountain key) */
type FountainViewPersistedState = ReadonlyViewPersistedState & {
  editing?: boolean; // undefined => false
};

export class FountainView extends TextFileView {
  state: ReadonlyViewState | EditorViewState;
  private readonlyViewState: ReadonlyViewPersistedState;
  private indexCardAction: HTMLElement;
  private toggleEditAction: HTMLElement;
  private filterAction: HTMLElement;
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
      "",
      (r) => this.startEditModeHere(r),
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
    this.filterAction = this.addAction("filter", "Show/Hide", (evt) => {
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
        menu.addItem((item) =>
          item
            .setTitle(state.hideSynopsis ? "Synopsis" : "Synopsis")
            .setChecked(!(state.hideSynopsis || false))
            .onClick(() =>
              updateSettings({ hideSynopsis: !(state.hideSynopsis || false) }),
            ),
        );
        menu.addItem((item) =>
          item
            .setTitle(state.hideNotes ? "Notes" : "Notes")
            .setChecked(!(state.hideNotes || false))
            .onClick(() =>
              updateSettings({ hideNotes: !(state.hideNotes || false) }),
            ),
        );
        menu.addItem((item) =>
          item
            .setTitle(state.hideBoneyard ? "Boneyard" : "Boneyard")
            .setChecked(!(state.hideBoneyard || false))
            .onClick(() =>
              updateSettings({ hideBoneyard: !(state.hideBoneyard || false) }),
            ),
        );
        menu.showAtMouseEvent(evt);
      }
    });
    this.stopRehearsalModeAction = this.addAction(
      "brain",
      "Stop rehearsal",
      (_evt) => {
        this.stopRehearsalMode();
      },
    );
    this.stopRehearsalModeAction.hide();
  }

  startEditModeHere(r: Range): void {
    this.switchToEditMode();
    if (this.state instanceof EditorViewState) {
      this.state.scrollToHere(r);
    }
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
      this.indexCardAction.hide();
      this.filterAction.hide();
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
      this.indexCardAction.show();
      this.filterAction.show();
      this.stopRehearsalModeAction.hide();
      this.app.workspace.requestSaveLayout();
    }
  }

  script(): FountainScript | ParseError {
    return this.state.script();
  }

  toggleEditMode() {
    const text = this.state.getViewData();
    if (this.state instanceof EditorViewState) {
      // Switch to readonly mode
      const firstLine = this.state.firstVisibleLine();
      this.state.destroy();
      this.state = new ReadonlyViewState(
        this.contentEl,
        this.readonlyViewState,
        this.file?.path ?? "",
        text,
        (r) => this.startEditModeHere(r),
      );
      this.state.render();
      this.indexCardAction.show();
      const es = this.state;
      requestAnimationFrame(() => {
        es.scrollLineIntoView(firstLine);
      });
    } else {
      // Switch to editor
      this.readonlyViewState = this.state.pstate;
      const r = this.state.rangeOfFirstVisibleLine();
      this.indexCardAction.hide();
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
    console.log("onloadfile", file);
    return super.onLoadFile(file);
  }

  onUnloadFile(file: TFile): Promise<void> {
    console.log("onunloadfile", file);
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
    console.log("setViewData", data, clear, this.file?.path);
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
        "",
        (r) => this.startEditModeHere(r),
      );
      this.indexCardAction.show();
    }
  }
}
