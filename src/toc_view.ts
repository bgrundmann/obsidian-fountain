import { ItemView, type WorkspaceLeaf, debounce } from "obsidian";
import {
  type FountainScript,
  type Range,
  type StructureSection,
  type Synopsis,
  dataRange,
  extractNotes,
} from "./fountain";
import { FountainView } from "./view";

export const VIEW_TYPE_TOC = "obsidian-toc";

// TODO: In an ideal world, instead of registering an additional view, we
// would take over the normal outline view (so that for markdown views the
// regular outline view does its job but for foutainview's our view does
// what it should...)
export class TocView extends ItemView {
  private updateToc: () => void;
  private expanded: boolean;
  private showTodos: boolean;
  private showSynopsis: boolean;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.updateToc = debounce(() => this.render(), 500, true);
    this.expanded = false;
    this.showTodos = true;
    this.showSynopsis = false;
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
    this.theFountainView()?.scrollToHere(range);
  }

  private theFountainView(): FountainView | null {
    const leaf = this.app.workspace.getMostRecentLeaf(
      this.app.workspace.rootSplit,
    );
    if (leaf && leaf.view instanceof FountainView) {
      const ft = leaf.view;
      return ft;
    }
    return null;
  }

  private renderSynopsis(
    s: HTMLElement,
    script: FountainScript,
    synopsis?: Synopsis,
  ) {
    if (synopsis) {
      for (const l of synopsis.linesOfText) {
        const d = s.createDiv({
          cls: "synopsis",
          attr: dataRange(l),
          text: script.unsafeExtractRaw(l, true),
        });
        d.addEventListener("click", (evt: Event) => {
          this.scrollActiveScriptToHere(l);
        });
      }
    }
  }

  private renderTocSection(
    parent: HTMLElement,
    script: FountainScript,
    section: StructureSection,
  ) {
    parent.createEl("section", {}, (s) => {
      if (section.section) {
        const sect = section.section;
        const d = s.createEl("h1", {
          cls: "section",
          text: script.unsafeExtractRaw(sect.range),
        });
        d.addEventListener("click", (evt: Event) => {
          this.scrollActiveScriptToHere(sect.range);
        });
      }
      this.renderSynopsis(s, script, section.synopsis);
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
              this.renderSynopsis(s, script, el.synopsis);
              const todos = extractNotes(el.content).filter(
                (n) => n.noteKind === "todo",
              );
              for (const note of todos) {
                s.createDiv({ cls: "todo" }, (div) => {
                  script.styledTextToHtml(div, [note], {}, false);
                  div.addEventListener("click", () =>
                    this.scrollActiveScriptToHere(note.range),
                  );
                  if (!this.showTodos) {
                    div.hide();
                  }
                });
              }
            }
            break;
        }
      }
    });
  }

  private render() {
    const ft = this.theFountainView();
    const container = this.contentEl;
    container.empty();
    container.createDiv({ cls: "screenplay-toc" }, (div) => {
      if (ft) {
        const script = ft.script();
        if (!("error" in script)) {
          div.createDiv({ cls: "toc-controls" }, (tocControls) => {
            tocControls.createEl(
              "input",
              {
                type: "checkbox",
                attr: {
                  name: "todos",
                  ...(this.showTodos ? { checked: "" } : {}),
                },
              },
              (checkbox) => {
                checkbox.addEventListener("change", (event: Event) => {
                  this.showTodos = checkbox.checked;
                  for (const el of container.querySelectorAll<HTMLElement>(
                    ".todo",
                  )) {
                    el.toggle(this.showTodos);
                  }
                });
              },
            );
            tocControls.createEl("label", {
              attr: { for: "todos" },
              text: "todos?",
            });
            tocControls.createEl(
              "input",
              {
                type: "checkbox",
                attr: {
                  name: "synopsis",
                  ...(this.showSynopsis ? { checked: "" } : {}),
                },
              },
              (checkbox) => {
                checkbox.addEventListener("change", (event: Event) => {
                  this.showSynopsis = checkbox.checked;
                  for (const el of container.querySelectorAll<HTMLElement>(
                    ".synopsis",
                  )) {
                    el.toggle(this.showSynopsis);
                  }
                });
              },
            );
            tocControls.createEl("label", {
              attr: { for: "synopsis" },
              text: "synopsis?",
            });
          });
          for (const section of script.structure().sections) {
            this.renderTocSection(div, script, section);
          }
        }
      }
      if (!this.showSynopsis) {
        for (const el of div.querySelectorAll<HTMLElement>(".synopsis")) {
          el.hide();
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
