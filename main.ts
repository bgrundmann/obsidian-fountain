import type { FountainScript } from "fountain";
import { type App, FuzzySuggestModal, type Menu, Plugin } from "obsidian";
import { FountainView, VIEW_TYPE_FOUNTAIN } from "./view";

class FuzzySelectString extends FuzzySuggestModal<string> {
  constructor(
    app: App,
    title: string,
    private items: string[],
    private callback: (item: string) => void,
  ) {
    super(app);
    this.setTitle(title);
  }

  getItems(): string[] {
    return this.items;
  }

  getItemText(item: string): string {
    return item;
  }

  onChooseItem(item: string, evt: MouseEvent | KeyboardEvent): void {
    this.callback(item);
  }
}

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

    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, editor, _source, leaf) => {
        if (leaf?.view && leaf?.view instanceof FountainView) {
          const fv = leaf?.view;
          const script = fv.script();
          if (!("error" in script)) {
            this.installFileMenuItems(menu, script, fv);
          }
        }
      }),
    );
  }

  private installFileMenuItems(
    menu: Menu,
    script: FountainScript,
    view: FountainView,
  ) {
    menu.addItem((item) => {
      item
        .setTitle("Rehearsal")
        .setIcon("brain")
        .onClick(async () => {
          new FuzzySelectString(
            this.app,
            "Whose lines?",
            Array.from(script.allCharacters.values()),
            (character) => {
              view.startRehearsalMode(character);
            },
          ).open();
        });
    });
    const bl = view.blackoutCharacter();
    if (bl !== null) {
      menu.addItem((item) => {
        item.setTitle("Stop Rehearsal").onClick(async () => {
          view.stopRehearsalMode();
        });
      });
    }
  }
}
