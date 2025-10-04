import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { EditorSelection, EditorState, StateField } from "@codemirror/state";
import {
  EditorView,
  type Tooltip,
  type ViewUpdate,
  drawSelection,
  keymap,
  showTooltip,
} from "@codemirror/view";
import {
  Menu,
  type TFile,
  TextFileView,
  type ViewStateResult,
  type WorkspaceLeaf,
  setIcon,
} from "obsidian";
import { createCharacterCompletion } from "./character_completion";
import {
  type FountainScript,
  type Range,
  type ShowHideSettings,
  collapseRangeToStart,
} from "./fountain";
import { createFountainEditorPlugin } from "./fountain_editor";
import { parse } from "./fountain_parser";
import { FuzzySelectString } from "./fuzzy_select_string";
import { type Callbacks, renderIndexCards } from "./index_cards_view";
import { rangeOfFirstVisibleLine, renderFountain } from "./reading_view";

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
  const lastTwo = text.slice(range.end - 2, range.end);
  const extraNewLines =
    lastTwo === "\n\n" ? "" : lastTwo[1] === "\n" ? "\n" : "\n\n";
  return moveText(text, range, newPos, extraNewLines);
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
  const lastTwo = sceneText.slice(-2);
  const extraNewLines =
    lastTwo === "\n\n" ? "" : lastTwo[1] === "\n" ? "\n" : "\n\n";

  return (
    text.slice(0, range.end) + extraNewLines + sceneText + text.slice(range.end)
  );
}

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
    private parentView: FountainView,
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
    return this.parentView.getCachedScript() || parse("", {});
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
      replaceText: (range: Range, replacement: string): void => {
        this.parentView.replaceText(range, replacement);
      },
      moveScene: (range: Range, newPos: number): void => {
        this.parentView.moveScene(range, newPos);
      },
      duplicateScene: (range: Range): void => {
        this.parentView.duplicateScene(range);
      },
      moveSceneCrossFile: (
        srcRange: Range,
        dstPath: string,
        dstNewPos: number,
      ): void => {
        this.parentView.moveSceneCrossFile(srcRange, dstPath, dstNewPos);
      },
      getText: (range: Range): string => {
        return this.parentView.getText(range);
      },
    };
    const fp = this.script();
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
    return this.parentView.getCachedScript()?.document || "";
  }

  setViewData(path: string, text: string, _clear: boolean): void {
    this.path = path;
    // Parsing and updating is handled by parent view's setViewData
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

// Helper function to get the position where snippets section starts
function getSnippetsStartPosition(parentView: FountainView): number | null {
  const script = parentView.getCachedScript();
  if (!script || "error" in script) return null;

  // Find the "# Snippets" header position
  for (const element of script.script) {
    if (element.kind === "section") {
      const sectionText = script.unsafeExtractRaw(element.range);
      if (sectionText.toLowerCase().includes("snippets")) {
        return element.range.start;
      }
    }
  }
  return null;
}

// Helper function to create snip tooltips for text selections
function getSnipTooltips(
  state: EditorState,
  parentView: FountainView,
): readonly Tooltip[] {
  const snippetsStart = getSnippetsStartPosition(parentView);

  return state.selection.ranges
    .filter((range) => !range.empty)
    .filter((range) => {
      // Only show snip button if selection is not after snippets section
      if (snippetsStart === null) return true;
      return range.from < snippetsStart;
    })
    .map((range) => {
      // Position tooltip at the end of the selection
      return {
        pos: range.to,
        above: true,
        strictSide: true,
        arrow: true,
        create: () => {
          const dom = document.createElement("button");
          dom.className = "cm-tooltip-snip";
          dom.textContent = "Snip";
          dom.addEventListener("click", (e) => {
            e.preventDefault();
            parentView.saveSelectionAsSnippet(true);
          });
          return { dom };
        },
      };
    });
}

// Function to create state field with captured parentView
function createSnipTooltipField(parentView: FountainView) {
  return StateField.define<readonly Tooltip[]>({
    create: (state) => getSnipTooltips(state, parentView),

    update(tooltips, tr) {
      if (!tr.selection && !tr.docChanged) return tooltips;
      return getSnipTooltips(tr.state, parentView);
    },

    provide: (f) => showTooltip.computeN([f], (state) => state.field(f)),
  });
}

class EditorViewState {
  private cmEditor: EditorView;
  private path: string;

  constructor(
    contentEl: HTMLElement,
    path: string,
    text: string,
    requestSave: () => void,
    private parentView: FountainView,
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
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.editorAttributes.of({ class: "screenplay" }),
        EditorView.lineWrapping,
        createFountainEditorPlugin(
          () => parentView.getCachedScript() || parse("", {}),
          (script: FountainScript) => parentView.updateScriptDirectly(script),
        ),
        // Add character completion functionality
        createCharacterCompletion(
          () => parentView.getCachedScript() || parse("", {}),
        ),
        // Add snip tooltip functionality
        createSnipTooltipField(parentView),
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
    return this.parentView.getCachedScript() || parse("", {});
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

  firstVisibleLine(): Range {
    const scrollContainer =
      firstScrollableElement(this.cmEditor.scrollDOM) ??
      this.cmEditor.scrollDOM;
    const bounds = scrollContainer.getBoundingClientRect();
    const pos = this.cmEditor.posAtCoords({ x: bounds.x, y: bounds.y + 5 });
    const lp = this.cmEditor.lineBlockAt(pos ?? 0);
    return { start: lp.from, end: lp.to + 1 };
  }

  focus(): void {
    this.cmEditor.focus();
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
  private cachedScript: FountainScript;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.readonlyViewState = {
      mode: ShowMode.Script,
    };
    // Initialize with empty document
    this.cachedScript = parse("", {});
    this.state = new ReadonlyViewState(
      this.contentEl,
      this.readonlyViewState,
      "",
      (r) => this.startEditModeHere(r),
      () => this.requestSave(),
      this,
    );
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
    return this.state instanceof EditorViewState;
  }

  /// Switch to edit mode (no-op if already in edit mode)
  switchToEditMode() {
    if (!(this.state instanceof EditorViewState)) {
      this.toggleEditMode();
    }
  }

  focusEditor() {
    if (this.state instanceof EditorViewState) {
      const editorState = this.state;
      requestAnimationFrame(() => {
        editorState.focus();
      });
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

  getCachedScript(): FountainScript | null {
    return this.cachedScript;
  }

  updateScript(newScript: FountainScript) {
    this.cachedScript = newScript;
    // Trigger re-render if in readonly mode
    if (this.state instanceof ReadonlyViewState) {
      this.state.render();
    }
  }

  updateScriptDirectly(newScript: FountainScript) {
    this.cachedScript = newScript;
    // Update other views without triggering CodeMirror updates
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (
        leaf.view instanceof FountainView &&
        leaf.view !== this &&
        leaf.view.file?.path === this.file?.path
      ) {
        leaf.view.updateScript(newScript);
      }
    });
  }

  private updateAllViewsForFile(path: string, newScript: FountainScript) {
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.view instanceof FountainView && leaf.view.file?.path === path) {
        leaf.view.updateScript(newScript);
      }
    });
  }

  replaceText(range: Range, replacement: string): string {
    const path = this.file?.path;
    if (!path) throw new Error("No file path available");

    // Use utility function instead of global cache
    const currentText = this.cachedScript.document;
    const newText = replaceTextInString(currentText, range, replacement);
    const newScript = parse(newText, {});
    this.updateAllViewsForFile(path, newScript);

    // Trigger file save
    if (this.file) {
      this.app.vault.modify(this.file, newText);
    }

    return newText;
  }

  moveScene(range: Range, newPos: number): string {
    const path = this.file?.path;
    if (!path) throw new Error("No file path available");

    // Use utility function instead of global cache
    const currentText = this.cachedScript.document;
    const newText = moveSceneInString(currentText, range, newPos);
    const newScript = parse(newText, {});
    this.updateAllViewsForFile(path, newScript);

    // Trigger file save
    if (this.file) {
      this.app.vault.modify(this.file, newText);
    }

    return newText;
  }

  duplicateScene(range: Range): string {
    const path = this.file?.path;
    if (!path) throw new Error("No file path available");

    // Use utility function instead of global cache
    const currentText = this.cachedScript.document;
    const newText = duplicateSceneInString(currentText, range);
    const newScript = parse(newText, {});
    this.updateAllViewsForFile(path, newScript);

    // Trigger file save
    if (this.file) {
      this.app.vault.modify(this.file, newText);
    }

    return newText;
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

    // Add scene to destination - need to get destination view
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (
        leaf.view instanceof FountainView &&
        leaf.view.file?.path === dstPath
      ) {
        const dstText = leaf.view.cachedScript.document;
        const sceneLastTwo = sceneText.slice(-2);
        const sceneExtraNewLines =
          sceneLastTwo === "\n\n"
            ? ""
            : sceneLastTwo[1] === "\n"
              ? "\n"
              : "\n\n";
        const newDstText = replaceTextInString(
          dstText,
          { start: dstNewPos, end: dstNewPos },
          sceneText + sceneExtraNewLines,
        );
        const newDstScript = parse(newDstText, {});
        leaf.view.updateAllViewsForFile(dstPath, newDstScript);

        // Trigger file save for destination
        if (leaf.view.file) {
          leaf.view.app.vault.modify(leaf.view.file, newDstText);
        }
      }
    });

    // Trigger file save for source
    if (this.file) {
      this.app.vault.modify(this.file, newSrcText);
    }
  }

  getText(range: Range): string {
    const script = this.getCachedScript();
    if (!script) return "";
    return script.document.slice(range.start, range.end);
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
        this,
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
        this,
      );
      if (r !== null) this.state.scrollToHere(collapseRangeToStart(r));
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
        this,
      );
    }
  }

  hasSelection(): boolean {
    if (this.state instanceof EditorViewState) {
      return this.state.hasSelection();
    }
    return false;
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
    const snippetsStart = getSnippetsStartPosition(this);
    if (snippetsStart !== null && selection.from >= snippetsStart) {
      return false;
    }

    return true;
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
        const snippetsStart = getSnippetsStartPosition(this);
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

    const script = this.getCachedScript();
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
