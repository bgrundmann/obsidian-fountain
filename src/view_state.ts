import type { FountainScript, Range, ShowHideSettings } from "./fountain";

export enum ShowMode {
  Script = "script",
  IndexCards = "index-cards",
}

export type Rehearsal = {
  character: string;
  previousShowHideSettings: ShowHideSettings;
};

export type ReadonlyViewPersistedState = {
  mode: ShowMode;
  rehearsal?: Rehearsal; // This misses which dialogue(s) have been revealed, but is cheap and good enough
} & ShowHideSettings;

/** Stored in persistent state (workspace.json under the fountain key) */
export type FountainViewPersistedState = ReadonlyViewPersistedState & {
  editing?: boolean; // undefined => false
};

/** Common interface for the readonly and editor view states of a fountain document. */
export interface ViewState {
  readonly isEditMode: boolean;
  getViewData(): string;
  setViewData(path: string, text: string, clear: boolean): void;
  clear(): void;
  destroy(): void;
  scrollToHere(r: Range): void;
  script(): FountainScript;
  render(): void;
  focus(): void;
  setSpellCheck(enabled: boolean): void;
  hasSelection(): boolean;
  blackoutCharacter(): string | null;
  rangeOfFirstVisibleLine(): Range | null;
}

export function getSnippetsStartPosition(
  script: FountainScript,
): number | null {
  if ("error" in script) return null;

  for (const element of script.script) {
    if (element.kind === "section") {
      const sectionText = script.sliceDocument(element.range);
      if (sectionText.toLowerCase().includes("snippets")) {
        return element.range.start;
      }
    }
  }
  return null;
}
