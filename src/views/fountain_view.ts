import {
  Menu,
  Scope,
  type TFile,
  TextFileView,
  type ViewStateResult,
  type WorkspaceLeaf,
  setIcon,
} from "obsidian";
import {
  applyEditsToFountainFile,
  findFountainViewsForPath,
} from "../edit_pipeline";
import {
  type Edit,
  type FountainScript,
  type Range,
  type ShowHideSettings,
  collapseRangeToStart,
  computeAddSceneNumberEdits,
  computeDuplicateSceneEdits,
  computeMoveSceneAcrossFilesEdits,
  computeMoveSceneEdits,
  computeRemoveSceneNumberEdits,
} from "../fountain";
import { parse } from "../fountain/parser";
import { FuzzySelectString } from "../fuzzy_select_string";
import {
  type EditorCallbacks,
  EditorViewState,
} from "./editor_view_state";
import { ReadonlyViewState } from "./readonly_view_state";
import {
  type FountainViewPersistedState,
  type ReadonlyViewCallbacks,
  type ReadonlyViewPersistedState,
  ShowMode,
  type ViewState,
  getSnippetsStartPosition,
} from "./view_state";

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
    // Hotkeys use View.scope rather than plugin-level commands: a global
    // Mod+F command would conflict with Obsidian's built-in "Search current
    // file" (both show red in hotkey settings). Scope-registered handlers
    // take priority only when this view has focus, which is what we want.
    this.scope = new Scope(this.app.scope);
    this.scope.register(["Mod"], "f", () => {
      if (this.openSearch()) return false;
      return undefined;
    });
    this.scope.register(["Mod"], "e", () => {
      this.toggleEditMode();
      this.app.workspace.requestSaveLayout();
      return false;
    });
    this.scope.register(["Mod", "Shift"], "x", () => {
      this.saveSelectionAsSnippet(true);
      return false;
    });
    this.scope.register(["Mod", "Shift"], "c", () => {
      this.saveSelectionAsSnippet(false);
      return false;
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

  private readonlyCallbacks(): ReadonlyViewCallbacks {
    return {
      getScript: () => this.cachedScript,
      reRender: () => this.state.render(),
      startEditModeHere: (r) => this.startEditModeHere(r),
      startReadingModeHere: (r) => this.state.scrollToHere(r),
      requestSave: () => this.requestSave(),
      replaceText: (r, s) => this.replaceText(r, s),
      moveScene: (r, p) => this.moveScene(r, p),
      duplicateScene: (r) => this.duplicateScene(r),
      moveSceneCrossFile: (r, p, n) => this.moveSceneCrossFile(r, p, n),
      getText: (r) => this.getText(r),
      openLink: (target, event) => this.openLink(target, event),
    };
  }

  /** Navigate to a `[[>target]]` link using Obsidian's standard link resolution. */
  private openLink(target: string, event: MouseEvent): void {
    const sourcePath = this.file?.path ?? "";
    const inNewLeaf = event.metaKey || event.ctrlKey;
    const dest = this.app.metadataCache.getFirstLinkpathDest(
      target,
      sourcePath,
    );
    if (!dest) {
      // Unresolved: defer to Obsidian, which will offer to create the file.
      this.app.workspace.openLinkText(target, sourcePath, inNewLeaf);
      return;
    }
    if (inNewLeaf) {
      this.app.workspace.getLeaf("tab").openFile(dest);
    } else {
      // Open the file in *this view's* leaf so the source file is the
      // entry that lands in the back-history. `openLinkText` may pick a
      // different leaf when the target is already open elsewhere or when
      // the active leaf isn't the leaf the user clicked from.
      this.leaf.openFile(dest);
    }
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
      onScriptChanged: (s) => this.onUserEdit(s),
      requestSave: () => this.requestSave(),
      getLinkCandidates: () => this.getLinkCandidates(),
    };
  }

  private getLinkCandidates() {
    const sourcePath = this.file?.path ?? "";
    const candidates: { linktext: string; label: string }[] = [];
    for (const file of this.app.vault.getFiles()) {
      if (file.path === sourcePath) continue;
      const linktext = this.app.metadataCache.fileToLinktext(file, sourcePath);
      candidates.push({ linktext, label: file.path });
    }
    return candidates;
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
    const script = this.getScript();
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

  openSearch(): boolean {
    if (!this.state.isEditMode) return false;
    (this.state as EditorViewState).openSearch();
    return true;
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

  /** User-typed edit in this view's CM editor — propagate the reparsed
   *  script to every sibling view open on this file. */
  onUserEdit(newScript: FountainScript) {
    this.cachedScript = newScript;
    const path = this.file?.path;
    if (!path) return;
    for (const view of findFountainViewsForPath(this.app, path)) {
      if (view === this) continue;
      view.cachedScript = newScript;
      view.state.receiveScript(newScript);
    }
  }

  /** Called by the path-keyed pipeline to apply a programmatic edit to
   *  this view: update the cached script and dispatch the edits to the
   *  underlying state (editor: CM transaction; readonly: re-render). */
  receiveProgrammaticEdits(edits: Edit[], newScript: FountainScript): void {
    this.cachedScript = newScript;
    this.state.receiveEdits(edits, newScript);
  }

  /**
   * Thin wrapper around the path-keyed pipeline. Use this when you have
   * a `FountainView` in hand; for paths without an open view, call
   * `applyEditsToFountainFile` directly.
   */
  applyEditsToFile(edits: Edit[]): Promise<void> {
    const path = this.file?.path;
    if (!path) throw new Error("No file path available");
    return applyEditsToFountainFile(this.app, path, edits);
  }

  replaceText(range: Range, replacement: string): void {
    this.applyEditsToFile([{ range, replacement }]);
  }

  moveScene(range: Range, newPos: number): void {
    this.applyEditsToFile(computeMoveSceneEdits(this.cachedScript, range, newPos));
  }

  duplicateScene(range: Range): void {
    this.applyEditsToFile(computeDuplicateSceneEdits(this.cachedScript, range));
  }

  moveSceneCrossFile(
    srcRange: Range,
    dstPath: string,
    dstNewPos: number,
  ): void {
    if (!this.file?.path) throw new Error("No source file path available");
    const dstView = findFountainViewsForPath(this.app, dstPath)[0];
    if (!dstView) return;
    const { srcEdits, dstEdits } = computeMoveSceneAcrossFilesEdits(
      this.cachedScript,
      srcRange,
      dstView.cachedScript,
      dstNewPos,
    );
    this.applyEditsToFile(srcEdits);
    dstView.applyEditsToFile(dstEdits);
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

  setViewData(data: string, _clear: boolean): void {
    const path = this.file?.path;
    if (!path) return;
    // Short-circuit if the data hasn't actually changed — Obsidian fires
    // setViewData on all views of the same file when any one of them
    // saves, and re-parsing every time would be wasteful.
    if (this.cachedScript.document === data) {
      // Still keep paths in sync on the first load, where the state was
      // constructed with an empty path.
      for (const view of findFountainViewsForPath(this.app, path)) {
        view.state.setPath(path);
      }
      return;
    }
    const newScript = parse(data, {});
    for (const view of findFountainViewsForPath(this.app, path)) {
      view.cachedScript = newScript;
      view.state.setPath(path);
      view.state.receiveScript(newScript);
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
    await super.setState(f, result);
    // Mark this state change as a navigation event so the leaf records
    // it in its back/forward stack — without this, opening a different
    // fountain file in the same leaf may not be pushed to history, and
    // pressing back from a link target ends up skipping the source file.
    result.history = true;
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
    this.applyEditsToFile(computeAddSceneNumberEdits(this.cachedScript));
  }

  /**
   * Removes all scene numbers from scenes.
   */
  removeSceneNumbers(): void {
    this.applyEditsToFile(computeRemoveSceneNumberEdits(this.cachedScript));
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
