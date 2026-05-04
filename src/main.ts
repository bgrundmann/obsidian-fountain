import {
  type MarkdownPostProcessorContext,
  Notice,
  Plugin,
} from "obsidian";
import {
  executeRemovalCommand,
  generatePDFCommand,
  ifFountainFile,
  ifFountainView,
  newDocumentCommand,
  openSidebar,
  openSidebarCommand,
} from "./commands";
import { applyEditsToFountainFile } from "./edit_pipeline";
import type { Edit } from "./fountain";
import { parse } from "./fountain/parser";
import { LinkIndex } from "./links_index";
import { EditorViewState } from "./views/editor_view_state";
import { FountainView, VIEW_TYPE_FOUNTAIN } from "./views/fountain_view";
import { renderContent } from "./views/reading_view";
import {
  FountainSideBarView,
  VIEW_TYPE_SIDEBAR,
} from "./sidebar/sidebar_view";

export default class FountainPlugin extends Plugin {
  private linkIndex?: LinkIndex;

  async onload() {
    this.registerView(VIEW_TYPE_FOUNTAIN, (leaf) => new FountainView(leaf));
    this.registerExtensions(["fountain"], VIEW_TYPE_FOUNTAIN);
    this.registerView(
      VIEW_TYPE_SIDEBAR,
      (leaf) => new FountainSideBarView(leaf),
    );
    this.registerCommands();
    this.linkIndex = new LinkIndex(this.app);
    this.app.workspace.onLayoutReady(() => {
      openSidebar(this.app);
      this.linkIndex?.initialize();
    });
    this.registerMarkdownPostProcessor(this.markdownPostProcessor);
  }

  async onunload() {
    // Note that there is no unregisterView or unregisterExtensions methods
    // because obsidian already does this automatically when the plugin is unloaded.
    this.linkIndex?.dispose();
    this.linkIndex = undefined;
  }

  applyEditsToFountainFile(path: string, edits: Edit[]): Promise<void> {
    return applyEditsToFountainFile(this.app, path, edits);
  }

  private markdownPostProcessor(
    element: HTMLElement,
    _context: MarkdownPostProcessorContext,
  ) {
    const codeblocks = element.findAll("code");

    for (const codeblock of codeblocks) {
      const parent = codeblock.parentElement;
      if (
        parent?.tagName === "PRE" &&
        codeblock.classList.contains("language-fountain")
      ) {
        const fountainText = codeblock.textContent || "";
        const container = createDiv({ cls: "screenplay" });
        const script = parse(fountainText, {});
        renderContent(container, script, {});
        parent.replaceWith(container);
      }
    }
  }

  private registerCommands() {
    this.addRibbonIcon("square-pen", "New fountain document", () => {
      newDocumentCommand(this.app);
    });
    this.addCommand({
      id: "new-fountain-document",
      name: "New fountain document",
      callback: () => {
        newDocumentCommand(this.app);
      },
    });
    this.addCommand({
      id: "generate-pdf",
      name: "Generate PDF",
      checkCallback: ifFountainFile(this.app, generatePDFCommand),
    });
    this.addCommand({
      id: "add-scene-numbers",
      name: "Add scene numbers",
      checkCallback: ifFountainView(this.app, (fv) => fv.addSceneNumbers()),
    });
    this.addCommand({
      id: "remove-scene-numbers",
      name: "Remove scene numbers",
      checkCallback: ifFountainView(this.app, (fv) => fv.removeSceneNumbers()),
    });
    this.addCommand({
      id: "remove-character-dialogue",
      name: "Remove character dialogue",
      checkCallback: ifFountainView(this.app, (fv) =>
        executeRemovalCommand(this.app, fv, "dialogue"),
      ),
    });
    this.addCommand({
      id: "remove-scenes-sections",
      name: "Remove scenes and sections",
      checkCallback: ifFountainView(this.app, (fv) =>
        executeRemovalCommand(this.app, fv, "structure"),
      ),
    });
    this.addCommand({
      id: "remove-element-types",
      name: "Remove element types",
      checkCallback: ifFountainView(this.app, (fv) =>
        executeRemovalCommand(this.app, fv, "types"),
      ),
    });
    this.addCommand({
      id: "open-sidebar",
      name: "Open sidebar",
      checkCallback: openSidebarCommand(this.app),
    });
    this.addCommand({
      id: "toggle-spell-check",
      name: "Toggle spell check",
      checkCallback: ifFountainView(this.app, (fv) => {
        const enabled = fv.toggleSpellCheck();
        new Notice(enabled ? "Spell check enabled" : "Spell check disabled");
      }),
    });
    this.addCommand({
      id: "toggle-index-cards-view",
      name: "Toggle index card view",
      hotkeys: [{ modifiers: ["Mod", "Shift"], key: "i" }],
      checkCallback: ifFountainView(this.app, (fv) => {
        fv.toggleIndexCardsView();
      }),
    });
    this.addCommand({
      id: "select-current-scene",
      name: "Select current scene",
      hotkeys: [{ modifiers: ["Mod", "Shift"], key: "l" }],
      checkCallback: (checking) => {
        const fv = this.app.workspace.getActiveViewOfType(FountainView);
        if (fv === null || !(fv.state instanceof EditorViewState)) return false;
        if (!checking) fv.state.selectCurrentScene();
        return true;
      },
    });
  }
}
