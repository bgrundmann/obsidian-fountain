import { Plugin, type WorkspaceLeaf } from "obsidian";
import { TocView, VIEW_TYPE_TOC } from "toc_view";
import { FountainView, VIEW_TYPE_FOUNTAIN } from "./view";

export default class FountainPlugin extends Plugin {
  async onload() {
    // Register our custom view and associate it with .fountain files
    this.registerView(VIEW_TYPE_FOUNTAIN, (leaf) => new FountainView(leaf));
    this.registerExtensions(["fountain"], VIEW_TYPE_FOUNTAIN);
    this.registerView(VIEW_TYPE_TOC, (leaf) => new TocView(leaf));
    this.registerCommands();
    this.app.workspace.onLayoutReady(() => {
      this.registerTocInSideBar();
    });
  }

  async onunload() {
    // Is there a way to "unregister" the View and extensions?
  }

  private async registerTocInSideBar() {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(VIEW_TYPE_TOC);
    if (leaves.length > 0) {
      leaf = leaves[0];
    } else {
      leaf = workspace.getRightLeaf(false);
      await leaf?.setViewState({ type: VIEW_TYPE_TOC, active: true });
    }
  }

  private async newFountainDocumentCommand() {
    let destination = "Untitled";
    const activeFile = this.app.workspace.getActiveFile();
    if (activeFile !== null) {
      if (activeFile?.parent) {
        destination = `${activeFile.parent.path}/Untitled`;
      }
    }
    const createFile = async (suffix: number | null) => {
      const fileName = suffix
        ? `${destination}-${suffix}.fountain`
        : `${destination}.fountain`;
      try {
        const newFile = await this.app.vault.create(fileName, "");
        const leaf = this.app.workspace.getLeaf(false);
        await leaf.openFile(newFile);
        if (leaf.view instanceof FountainView) {
          leaf.view.switchToEditMode();
        }
        this.app.workspace.setActiveLeaf(leaf, { focus: true });
      } catch (_error) {
        createFile(suffix ? suffix + 1 : 1);
      }
    };
    await createFile(null);
  }

  private toggleFountainEditModeCommand(checking: boolean): boolean {
    const fv = this.app.workspace.getActiveViewOfType(FountainView);
    if (checking) return fv !== null;
    if (fv) {
      fv.toggleEditMode();
    }
    return true;
  }

  /** Install ribbon icons and commands. */
  private registerCommands() {
    this.addRibbonIcon("square-pen", "New fountain document", (evt) => {
      this.newFountainDocumentCommand();
    });
    this.addCommand({
      id: "new-fountain-document",
      name: "New fountain document",
      callback: () => {
        this.newFountainDocumentCommand();
      },
    });
    this.addCommand({
      id: "toggle-fountain-edit-mode",
      name: "Toggle edit mode",
      checkCallback: (checking: boolean) => {
        this.toggleFountainEditModeCommand(checking);
      },
    });
  }
}
