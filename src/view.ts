import {
  Menu,
  type TFile,
  TextFileView,
  type ViewStateResult,
  type WorkspaceLeaf,
  setIcon,
} from "obsidian";
import {
  type FountainScript,
  type Range,
  type SceneHeading,
  type ShowHideSettings,
  collapseRangeToStart,
} from "./fountain";
import { parse } from "./fountain_parser";
import { FuzzySelectString } from "./fuzzy_select_string";
import {
  type EditorCallbacks,
  EditorViewState,
} from "./editor_view_state";
import {
  type ReadonlyViewCallbacks,
  ReadonlyViewState,
} from "./readonly_view_state";
import {
  type FountainViewPersistedState,
  type ReadonlyViewPersistedState,
  ShowMode,
  type ViewState,
  getSnippetsStartPosition,
} from "./view_state";

/** Return the newline characters needed to ensure text ends with a double newline. */
function trailingNewlinesNeeded(text: string): string {
  const lastTwo = text.slice(-2);
  return lastTwo === "\n\n" ? "" : lastTwo[1] === "\n" ? "\n" : "\n\n";
}

/** Move the range of text to a new position. The newStart position is required
to not be within range.
*/
function moveText(
  text: string,
  range: Range,
  newStart: number,
  newTrailer = "",
): string {
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
      newTrailer +
      afterRange.slice(newStart - range.end)
    );
  }
  // If moving backward
  return (
    text.slice(0, newStart) +
    movedPortion +
    newTrailer +
    text.slice(newStart, range.start) +
    afterRange
  );
}

/**
 * Replace a range of text.
 *
 * @param text the overall text
 * @param range range of text to replace
 * @param replacement text that replaces the text in range
 * @returns the modified text
 */
function replaceTextInString(
  text: string,
  range: Range,
  replacement: string,
): string {
  const beforeRange = text.slice(0, range.start);
  const afterRange = text.slice(range.end);
  return beforeRange + replacement + afterRange;
}

/**
 * Move the scene to a new position in the document.
 * @param text the document text
 * @param range complete scene heading + content
 * @param newPos new position
 * @returns the modified text
 */
function moveSceneInString(text: string, range: Range, newPos: number): string {
  const sceneText = text.slice(range.start, range.end);
  return moveText(text, range, newPos, trailingNewlinesNeeded(sceneText));
}

/**
 * Duplicate a scene in the document.
 * @param text the document text
 * @param range the range of the complete scene heading + content
 * @returns the modified text
 */
function duplicateSceneInString(text: string, range: Range): string {
  const sceneText = text.slice(range.start, range.end);
  // If the scene was the last scene of the document
  // it might not have been properly terminated by an empty
  // line, in that case we must add the empty line between
  // the two scenes.
  return (
    text.slice(0, range.end) + trailingNewlinesNeeded(sceneText) + sceneText + text.slice(range.end)
  );
}

export const VIEW_TYPE_FOUNTAIN = "fountain";

/** Obsidian TextFileView for .fountain files, managing mode switching and document operations. */
export class FountainView extends TextFileView {
  state: ViewState;
  private readonlyViewState: ReadonlyViewPersistedState;
  private toggleEditAction: HTMLElement;
  private showViewMenuAction: HTMLElement;
  private stopRehearsalModeAction: HTMLElement;
  private cachedScript: FountainScript;
  private spellCheckEnabled = false;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.readonlyViewState = {
      mode: ShowMode.Script,
    };
    // Initialize with empty document
    this.cachedScript = parse("", {});
    this.state = this.createReadonlyState(this.readonlyViewState, "");
    this.toggleEditAction = this.addAction(
      "edit",
      "Toggle readonly",
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

  private readonlyCallbacks(): ReadonlyViewCallbacks {
    return {
      getScript: () => this.cachedScript,
      startEditModeHere: (r) => this.startEditModeHere(r),
      requestSave: () => this.requestSave(),
      replaceText: (r, s) => this.replaceText(r, s),
      moveScene: (r, p) => this.moveScene(r, p),
      duplicateScene: (r) => this.duplicateScene(r),
      moveSceneCrossFile: (r, p, n) => this.moveSceneCrossFile(r, p, n),
      getText: (r) => this.getText(r),
    };
  }

  private createReadonlyState(
    pstate: ReadonlyViewPersistedState,
    path: string,
  ): ReadonlyViewState {
    return new ReadonlyViewState(
      this.contentEl,
      pstate,
      path,
      this.readonlyCallbacks(),
    );
  }

  private editorCallbacks(): EditorCallbacks {
    return {
      getScript: () => this.cachedScript,
      onScriptChanged: (s) => this.updateScriptDirectly(s),
      saveSelectionAsSnippet: (cut) => this.saveSelectionAsSnippet(cut),
      requestSave: () => this.requestSave(),
    };
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
            item.setTitle("Stop rehearsal").onClick(() => {
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
    // scrollToHere selects the range. We don't want this to happen
    // when we just switched into edit mode.
    this.scrollToHere(collapseRangeToStart(r));
  }

  startReadingModeHere(r: Range): void {
    this.switchToReadonlyMode();
    this.scrollToHere(r);
  }

  scrollToHere(r: Range): void {
    this.state.scrollToHere(r);
  }

  isEditMode(): boolean {
    return this.state.isEditMode;
  }

  /// Switch to edit mode (no-op if already in edit mode)
  switchToEditMode() {
    if (!this.state.isEditMode) {
      this.toggleEditMode();
    }
  }

  focusEditor() {
    const state = this.state;
    requestAnimationFrame(() => {
      state.focus();
    });
  }

  toggleSpellCheck(): boolean {
    this.spellCheckEnabled = !this.spellCheckEnabled;
    this.state.setSpellCheck(this.spellCheckEnabled);
    return this.spellCheckEnabled;
  }

  /// Switch to readonly mode (no-op if already in readonly mode)
  switchToReadonlyMode() {
    if (this.state.isEditMode) {
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
    return this.state.blackoutCharacter();
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

  updateScript(newScript: FountainScript) {
    this.cachedScript = newScript;
    this.state.render();
  }

  updateScriptDirectly(newScript: FountainScript) {
    this.cachedScript = newScript;
    // Update other views without triggering CodeMirror updates
    for (const view of this.findViewsForPath(this.file?.path)) {
      if (view !== this) {
        view.updateScript(newScript);
      }
    }
  }

  private findViewsForPath(path: string | undefined): FountainView[] {
    if (!path) return [];
    const views: FountainView[] = [];
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.view instanceof FountainView && leaf.view.file?.path === path) {
        views.push(leaf.view);
      }
    });
    return views;
  }

  private updateAllViewsForFile(path: string, newScript: FountainScript) {
    for (const view of this.findViewsForPath(path)) {
      view.updateScript(newScript);
    }
  }

  private applyTextTransform(transform: (text: string) => string): string {
    const path = this.file?.path;
    if (!path) throw new Error("No file path available");
    const newText = transform(this.cachedScript.document);
    const newScript = parse(newText, {});
    this.updateAllViewsForFile(path, newScript);
    if (this.file) {
      this.app.vault.modify(this.file, newText);
    }
    return newText;
  }

  replaceText(range: Range, replacement: string): string {
    return this.applyTextTransform((t) => replaceTextInString(t, range, replacement));
  }

  moveScene(range: Range, newPos: number): string {
    return this.applyTextTransform((t) => moveSceneInString(t, range, newPos));
  }

  duplicateScene(range: Range): string {
    return this.applyTextTransform((t) => duplicateSceneInString(t, range));
  }

  moveSceneCrossFile(
    srcRange: Range,
    dstPath: string,
    dstNewPos: number,
  ): void {
    const srcPath = this.file?.path;
    if (!srcPath) throw new Error("No source file path available");

    // Extract scene text from source
    const srcText = this.cachedScript.document;
    const sceneText = srcText.slice(srcRange.start, srcRange.end);

    // Remove scene from source
    const newSrcText = replaceTextInString(srcText, srcRange, "");
    const newSrcScript = parse(newSrcText, {});
    this.updateAllViewsForFile(srcPath, newSrcScript);

    // Add scene to destination
    const dstViews = this.findViewsForPath(dstPath);
    if (dstViews.length > 0) {
      const dstView = dstViews[0];
      const dstText = dstView.cachedScript.document;
      const newDstText = replaceTextInString(
        dstText,
        { start: dstNewPos, end: dstNewPos },
        sceneText + trailingNewlinesNeeded(sceneText),
      );
      const newDstScript = parse(newDstText, {});
      this.updateAllViewsForFile(dstPath, newDstScript);

      // Trigger file save for destination
      if (dstView.file) {
        dstView.app.vault.modify(dstView.file, newDstText);
      }
    }

    // Trigger file save for source
    if (this.file) {
      this.app.vault.modify(this.file, newSrcText);
    }
  }

  getText(range: Range): string {
    return this.cachedScript.document.slice(range.start, range.end);
  }

  getScript(): FountainScript {
    return this.cachedScript;
  }

  toggleEditMode() {
    const text = this.state.getViewData();
    const firstVisibleLine = this.state.rangeOfFirstVisibleLine();
    if (this.state.isEditMode) {
      // Switch to readonly mode
      this.showViewMenuAction.show();
      this.state.destroy();
      this.state = this.createReadonlyState(
        this.readonlyViewState,
        this.file?.path ?? "",
      );
      this.state.render();
      if (firstVisibleLine) {
        const es = this.state;
        requestAnimationFrame(() => {
          es.scrollToHere(firstVisibleLine);
        });
      }
    } else {
      // Switch to editor
      this.showViewMenuAction.hide();
      if (this.state instanceof ReadonlyViewState) {
        this.readonlyViewState = this.state.pstate;
      }
      this.state = new EditorViewState(
        this.contentEl,
        this.file?.path ?? "",
        text,
        this.editorCallbacks(),
        this.spellCheckEnabled,
      );
      if (firstVisibleLine) this.state.scrollToHere(collapseRangeToStart(firstVisibleLine));
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
      // Short circuit if data unchanged to avoid redundant parsing
      // when Obsidian calls setViewData on all views for the same file
      if (this.cachedScript.document === data) return;

      const newScript = parse(data, {});
      this.updateAllViewsForFile(path, newScript);

      // Delegate to current state for any state-specific handling
      this.state.setViewData(path, data, clear);
    }
  }

  getState(): Record<string, unknown> {
    const textFileState = super.getState();
    if (this.state instanceof ReadonlyViewState) {
      // If readonly view is active make sure our copy matches
      this.readonlyViewState = this.state.pstate;
    }
    textFileState.fountain = {
      editing: this.state.isEditMode,
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
    if (this.state.isEditMode) {
      this.state.destroy();
      this.state = this.createReadonlyState(this.readonlyViewState, "");
    }
  }

  hasSelection(): boolean {
    return this.state.hasSelection();
  }

  hasValidSelectionForSnipping(): boolean {
    if (!(this.state instanceof EditorViewState)) {
      return false;
    }

    if (!this.state.hasSelection()) {
      return false;
    }

    const selection = this.state.getSelection();
    if (!selection) {
      return false;
    }

    // Check if selection is in snippets section
    const snippetsStart = getSnippetsStartPosition(this.cachedScript);
    if (snippetsStart !== null && selection.from >= snippetsStart) {
      return false;
    }

    return true;
  }

  /**
   * Adds scene numbers to all scenes that don't already have them.
   * Numbers start at 1 and increment sequentially, but when encountering
   * an existing purely numeric scene number, continues from that number + 1.
   */
  addSceneNumbers(): void {
    const scenes = this.cachedScript.script.filter(
      (element): element is SceneHeading => element.kind === "scene",
    );

    let nextSequentialNumber = 1;
    const modifications: Array<{ range: Range; replacement: string }> = [];

    // Process scenes in forward order to track numbering
    for (const scene of scenes) {
      if (scene.number === null) {
        // No existing number, add the next sequential number
        const insertPosition = scene.range.start + scene.heading.length;
        modifications.push({
          range: { start: insertPosition, end: insertPosition },
          replacement: ` #${nextSequentialNumber}#`,
        });
        nextSequentialNumber++;
      } else {
        // Scene has a number, check if it's purely numeric
        const existingNumberText = this.cachedScript.document.substring(
          scene.number.start + 1,
          scene.number.end - 1,
        );
        const parsedNumber = Number.parseInt(existingNumberText, 10);
        // Only update counter if the number is purely numeric (parseInt matches the full string)
        if (
          !Number.isNaN(parsedNumber) &&
          parsedNumber.toString() === existingNumberText.trim()
        ) {
          // Continue numbering from this purely numeric scene number
          nextSequentialNumber = parsedNumber + 1;
        }
        // Non-purely-numeric scene numbers (like "5A") don't affect the counter
      }
    }

    // Apply modifications in reverse order to maintain correct positions
    for (let i = modifications.length - 1; i >= 0; i--) {
      const mod = modifications[i];
      this.replaceText(mod.range, mod.replacement);
    }
  }

  /**
   * Removes all scene numbers from scenes.
   */
  removeSceneNumbers(): void {
    const scenes = this.cachedScript.script.filter(
      (element): element is SceneHeading => element.kind === "scene",
    );

    // Process scenes in reverse order to maintain correct positions when removing
    for (let i = scenes.length - 1; i >= 0; i--) {
      const scene = scenes[i];
      if (scene.number !== null) {
        // Remove the scene number including any spaces before it
        const beforeNumber = this.cachedScript.document.substring(
          scene.range.start + scene.heading.length,
          scene.number.start,
        );
        const spacesToRemove = beforeNumber.match(/\s*$/)?.[0] ?? "";
        const startPos = scene.number.start - spacesToRemove.length;

        this.replaceText({ start: startPos, end: scene.number.end }, "");
      }
    }
  }

  /**
   * Moves or copies a selection to a new snippet. If necessary creates the snippets
   * section.
   * @param cut Remove the original? (that is move the selection to snippets)
   */
  saveSelectionAsSnippet(cut: boolean): void {
    if (this.state instanceof EditorViewState) {
      const selection = this.state.getSelection();
      if (selection) {
        // Check if selection is in snippets section - if so, don't allow snipping
        const snippetsStart = getSnippetsStartPosition(this.cachedScript);
        if (snippetsStart !== null && selection.from >= snippetsStart) {
          return;
        }

        if (cut) {
          // Remove the selected text from the document
          this.state.dispatchChanges({
            from: selection.from,
            to: selection.to,
            insert: "",
          });
        }

        // Add to snippets section
        this.insertAfterSnippetsHeader(`${selection.text}\n\n===\n`);
        this.requestSave();
      }
    }
  }

  private insertAfterSnippetsHeader(text: string): void {
    if (!(this.state instanceof EditorViewState)) return;

    const script = this.getScript();
    if (!script || "error" in script) return;

    const docText = this.state.getDocText();

    // Find the "# Snippets" header position
    let snippetsHeaderEnd: number | null = null;
    for (const element of script.script) {
      if (element.kind === "section") {
        const sectionText = docText.slice(
          element.range.start,
          element.range.end,
        );
        if (
          sectionText.toLowerCase().replace(/^#+/, "").trim() === "snippets"
        ) {
          snippetsHeaderEnd = element.range.end;
          break;
        }
      }
    }

    if (snippetsHeaderEnd !== null) {
      // Insert text right after the snippets header
      this.state.dispatchChanges({
        from: snippetsHeaderEnd,
        to: snippetsHeaderEnd,
        insert: `\n${text}`,
      });
    } else {
      // If no snippets section exists, add it at the end
      const docLength = docText.length;
      const snippetsSection = `\n\n# Snippets\n${text}`;
      this.state.dispatchChanges({
        from: docLength,
        to: docLength,
        insert: snippetsSection,
      });
    }
  }
}
