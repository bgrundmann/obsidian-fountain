import { Plugin } from "obsidian";
import { FountainView, VIEW_TYPE_FOUNTAIN } from "./view";

export default class FountainPlugin extends Plugin {
  async onload() {
    // Register our custom view and associate it with .fountain files
    this.registerView(VIEW_TYPE_FOUNTAIN, (leaf) => new FountainView(leaf));
    this.registerExtensions(["fountain"], VIEW_TYPE_FOUNTAIN);
    this.registerCommands();
  }
  async onunload() {
    // Is there a way to "unregister" the View and extensions?
  }

  /** Install ribbon icons and commands. */
  private registerCommands() {
    this.addRibbonIcon("square-pen", "New fountain document", (evt) => {
      let destination = "Untitled.fountain";
      const activeFile = this.app.workspace.getActiveFile();
      if (activeFile !== null) {
        if (activeFile?.parent) {
          destination = `${activeFile.parent.path}/Untitled.fountain`;
        }
      }
      this.app.vault.create(destination, "").then((newFile) => {
        const leaf = this.app.workspace.getLeaf(false);
        leaf.openFile(newFile);
      });
    });
  }
}
