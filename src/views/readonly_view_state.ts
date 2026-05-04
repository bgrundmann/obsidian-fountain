import type {
  Edit,
  FountainScript,
  Range,
  ShowHideSettings,
} from "../fountain";
import { renderIndexCards } from "./index_cards_view";
import { rangeOfFirstVisibleLine, renderFountain } from "./reading_view";
import {
  type ReadonlyViewCallbacks,
  type ReadonlyViewPersistedState,
  ShowMode,
  type ViewState,
} from "./view_state";

/** Renders the fountain script as HTML for reading, index cards, and rehearsal mode. */
export class ReadonlyViewState implements ViewState {
  readonly isEditMode = false;
  public pstate: ReadonlyViewPersistedState;
  private contentEl: HTMLElement;
  private path: string;
  private pendingPostRender: (() => void) | null = null;

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

  /** Run `fn` after the next `render()` completes. Cleared on use. Used to
   *  focus a freshly created card's heading input after the async edit
   *  pipeline writes the new scene and re-renders the index card view. */
  schedulePostRender(fn: () => void): void {
    this.pendingPostRender = fn;
  }

  public get showMode(): ShowMode {
    return this.pstate.mode;
  }

  private get blackout(): string | null {
    return this.pstate.rehearsal?.character ?? null;
  }

  public stopRehearsalMode() {
    if (!this.pstate.rehearsal) return;
    this.pstate = { ...this.pstate, rehearsal: undefined };
    this.render();
  }

  startRehearsalMode(character: string) {
    // Rehearsal is a view-time override — it forces hide-all during
    // render without touching the stored show/hide settings.
    this.pstate = { ...this.pstate, rehearsal: { character } };
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
        renderIndexCards(mainblock, this.path, fp, this.callbacks);
        break;

      case ShowMode.Script: {
        const settings: ShowHideSettings = this.blackout
          ? { hideBoneyard: true, hideNotes: true, hideSynopsis: true }
          : this.pstate;
        renderFountain(mainblock, fp, settings, this.blackout ?? undefined);
        break;
      }
    }

    if (this.blackout) {
      this.installToggleBlackoutHandlers();
    }
    this.installLinkHandlers();

    const fn = this.pendingPostRender;
    this.pendingPostRender = null;
    fn?.();
  }

  private installLinkHandlers() {
    const links = this.contentEl.querySelectorAll(".fountain-link");
    for (const link of links) {
      link.addEventListener("click", (evt: Event) => {
        const me = evt as MouseEvent;
        me.preventDefault();
        const target = (link as HTMLElement).getAttribute("data-link-target");
        if (target) this.callbacks.openLink(target, me);
      });
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

  /** First index card whose top edge is at or below the content area's
   *  top, with its `data-range` parsed back to a {start, end}. Used by
   *  the ⌘⇧I toggle to anchor the editor's cursor when leaving cards. */
  firstVisibleCardRange(): Range | null {
    if (this.pstate.mode !== ShowMode.IndexCards) return null;
    const cards = this.contentEl.querySelectorAll<HTMLElement>(
      ".screenplay-index-card[data-range]",
    );
    const containerTop = this.contentEl.getBoundingClientRect().top;
    for (const card of Array.from(cards)) {
      if (card.getBoundingClientRect().top >= containerTop) {
        const dr = card.getAttribute("data-range");
        if (!dr) continue;
        const [s, e] = dr.split(",").map((n) => Number.parseInt(n, 10));
        if (Number.isFinite(s) && Number.isFinite(e)) {
          return { start: s, end: e };
        }
      }
    }
    return null;
  }
}
