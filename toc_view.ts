import {
  type FountainScript,
  type Range,
  type StructureSection,
  extractNotes,
} from "fountain";
import { ItemView, type WorkspaceLeaf, debounce } from "obsidian";
import { FountainView } from "view";

export const VIEW_TYPE_TOC = "obsidian-toc";

// TODO: In an ideal world, instead of registering an additional view, we
// would take over the normal outline view (so that for markdown views the
// regular outline view does its job but for foutainview's our view does
// what it should...)
export class TocView extends ItemView {
  private updateToc: () => void;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.updateToc = debounce(() => this.render(), 500, true);
  }

  getViewType(): string {
    return VIEW_TYPE_TOC;
  }

  getDisplayText(): string {
    return "Table of contents of fountain script";
  }

  getIcon(): string {
    return "list-tree";
  }

  async onload(): Promise<void> {
    this.registerEvent(
      this.app.workspace.on(
        "active-leaf-change",
        (leaf: WorkspaceLeaf | null) => {
          if (leaf?.view !== this) this.updateToc();
        },
      ),
    );
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (file.name.endsWith(".fountain")) {
          this.updateToc();
        }
      }),
    );
  }

  private scrollActiveScriptToHere(range: Range) {
    // In the moment of clicking on a toc element, the toc is active
    // so let's see if before that a fountainview was active.
    const leaf = this.app.workspace.getMostRecentLeaf(
      this.app.workspace.rootSplit,
    );
    if (leaf && leaf.view instanceof FountainView) {
      const ft = leaf.view;
      ft.scrollToHere(range);
    }
  }

  private renderTocSection(
    parent: HTMLElement,
    script: FountainScript,
    section: StructureSection,
  ) {
    const tag = section.section ? "details" : "section";
    const attr = section.section ? { open: "" } : undefined;
    parent.createEl(tag, { attr: attr }, (s) => {
      if (section.section) {
        const sect = section.section;
        const d = s.createEl("summary", {
          cls: "section",
          text: script.unsafeExtractRaw(sect.range),
        });
        d.addEventListener("click", (evt: Event) => {
          this.scrollActiveScriptToHere(sect.range);
        });
      }
      for (const el of section.content) {
        switch (el.kind) {
          case "section":
            this.renderTocSection(s, script, el);
            break;
          case "scene":
            {
              if (el.scene) {
                const el_scene = el.scene;
                const d = s.createDiv({
                  cls: "scene-heading",
                  text: script.unsafeExtractRaw(el_scene.range),
                });
                d.addEventListener("click", (evt: Event) => {
                  this.scrollActiveScriptToHere(el_scene.range);
                });
              }
              const todos = extractNotes(el.content).filter(
                (n) => n.noteKind === "todo",
              );
              for (const note of todos) {
                s.createDiv({}, (div) => {
                  script.styledTextToHtml(div, [note], {}, false);
                  div.addEventListener("click", () =>
                    this.scrollActiveScriptToHere(note.range),
                  );
                });
              }
            }
            break;
        }
      }
    });
  }

  private render() {
    const ft = this.app.workspace.getActiveViewOfType(FountainView);
    const container = this.containerEl.children[1];
    container.empty();
    container.createDiv({ cls: "screenplay-toc" }, (div) => {
      if (ft) {
        const script = ft.script();
        if (!("error" in script)) {
          for (const section of script.structure()) {
            this.renderTocSection(div, script, section);
          }
        }
      }
    });
  }

  protected async onOpen(): Promise<void> {
    this.updateToc();
  }

  protected async onClose(): Promise<void> {
    // nothing to clean up
  }
}
