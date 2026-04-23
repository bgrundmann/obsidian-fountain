import type { FountainScript, Range, ShowHideSettings } from "../fountain";
import type { Edit } from "../scene_operations";
import { type Callbacks, renderIndexCards } from "./index_cards_view";
import { rangeOfFirstVisibleLine, renderFountain } from "./reading_view";
import {
  type ReadonlyViewPersistedState,
  ShowMode,
  type ViewState,
} from "./view_state";

export type ReadonlyViewCallbacks = {
  getScript: () => FountainScript;
  startEditModeHere: (range: Range) => void;
  requestSave: () => void;
  replaceText: (range: Range, replacement: string) => void;
  moveScene: (range: Range, newPos: number) => void;
  duplicateScene: (range: Range) => void;
  moveSceneCrossFile: (
    srcRange: Range,
    dstPath: string,
    dstNewPos: number,
  ) => void;
  getText: (range: Range) => string;
};

/** Renders the fountain script as HTML for reading, index cards, and rehearsal mode. */
export class ReadonlyViewState implements ViewState {
  readonly isEditMode = false;
  public pstate: ReadonlyViewPersistedState;
  private contentEl: HTMLElement;
  private path: string;

  constructor(
    contentEl: HTMLElement,
    pstate: ReadonlyViewPersistedState,
    path: string,
    private callbacks: ReadonlyViewCallbacks,
  ) {
    this.contentEl = contentEl;
    this.path = path;
    this.pstate = pstate;
  }

  public get showMode(): ShowMode {
    return this.pstate.mode;
  }

  private get blackout(): string | null {
    return this.pstate.rehearsal?.character ?? null;
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
      requestSave: () => this.callbacks.requestSave(),
      reRender: () => this.render(),
      startEditModeHere: (r: Range) => this.callbacks.startEditModeHere(r),
      startReadingModeHere: (r: Range) => this.scrollToHere(r),
      replaceText: (range: Range, replacement: string) =>
        this.callbacks.replaceText(range, replacement),
      moveScene: (range: Range, newPos: number) =>
        this.callbacks.moveScene(range, newPos),
      duplicateScene: (range: Range) => this.callbacks.duplicateScene(range),
      moveSceneCrossFile: (
        srcRange: Range,
        dstPath: string,
        dstNewPos: number,
      ) => this.callbacks.moveSceneCrossFile(srcRange, dstPath, dstNewPos),
      getText: (range: Range) => this.callbacks.getText(range),
    };
    const fp = this.callbacks.getScript();
    if ("error" in fp) {
      // The parser should not fail but handle bad inputs as action lines
      // if you managed to construct a script for which that is not true
      // please report this as a bug.
      console.error("error parsing script", fp);
      return;
    }
    const mainblock = this.contentEl.createDiv(
      this.showMode === ShowMode.IndexCards ? undefined : "screenplay",
    );
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
    return this.callbacks.getScript().document;
  }

  receiveEdits(_edits: Edit[], _newScript: FountainScript): void {
    // Readonly has no CM to dispatch into; just re-render from the script
    // already stored on the parent FountainView.
    this.render();
  }

  receiveScript(_newScript: FountainScript): void {
    this.render();
  }

  setPath(path: string): void {
    this.path = path;
  }

  clear(): void {
    //TODO: When do I need this?
  }

  destroy(): void {}
  focus(): void {}
  setSpellCheck(_enabled: boolean): void {}
  hasSelection(): boolean {
    return false;
  }

  rangeOfFirstVisibleLine(): Range | null {
    const screenplay = this.contentEl.querySelector(".screenplay");
    if (screenplay === null) return null;
    return rangeOfFirstVisibleLine(screenplay as HTMLElement);
  }
}
