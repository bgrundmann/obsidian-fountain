import { ItemView, type WorkspaceLeaf, debounce } from "obsidian";
import {
  type FountainScript,
  type Range,
  type Snippet,
  type StructureSection,
  type Synopsis,
  dataRange,
  extractNotes,
} from "./fountain";
import { renderElement } from "./reading_view";
import { FountainView } from "./view";

export const VIEW_TYPE_SIDEBAR = "fountain-sidebar";

interface SidebarCallbacks {
  scrollToRange: (range: Range) => void;
}

abstract class SidebarSection {
  protected callbacks: SidebarCallbacks;

  constructor(callbacks: SidebarCallbacks) {
    this.callbacks = callbacks;
  }

  abstract render(container: HTMLElement, script: FountainScript): void;
}

class SnippetsSection extends SidebarSection {
  render(container: HTMLElement, script: FountainScript): void {
    const structure = script.structure();
    if (!structure.snippets || structure.snippets.length === 0) {
      return;
    }

    container.createDiv({ cls: "snippets-section" }, (sectionDiv) => {
      // Add class to section div for styling
      sectionDiv.addClass("screenplay-snippets");

      // Add subtle instruction text
      sectionDiv.createEl("div", {
        text: "Drag and drop text here",
        cls: "snippets-instruction",
      });

      // Add snippets in file order
      for (let i = 0; i < structure.snippets.length; i++) {
        const snippet = structure.snippets[i];
        this.renderSnippet(sectionDiv, script, snippet, i);
      }
    });
  }

  private renderSnippet(
    parent: HTMLElement,
    script: FountainScript,
    snippet: Snippet,
    index: number,
  ): void {
    parent.createDiv({ cls: ["snippet"] }, (snippetDiv) => {
      snippetDiv.createDiv({ cls: ["screenplay"] }, (div) => {
        // Show first 4 elements or all if fewer than 4
        const elementsToShow = snippet.content.slice(0, 4);
        const hasMore = snippet.content.length > 4;

        for (const element of elementsToShow) {
          renderElement(div, element, script, {});
        }

        if (hasMore) {
          div.createDiv({
            cls: "snippet-more",
            text: "...",
          });
        }
      });
    });
  }
}

class TocSection extends SidebarSection {
  private showTodos = true;
  private showSynopsis = false;

  render(container: HTMLElement, script: FountainScript): void {
    container.createDiv({ cls: "toc-section" }, (sectionDiv) => {
      sectionDiv.createDiv({ cls: "screenplay-toc" }, (div) => {
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

        if (!this.showSynopsis) {
          for (const el of div.querySelectorAll<HTMLElement>(".synopsis")) {
            el.hide();
          }
        }
      });
    });
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
          this.callbacks.scrollToRange(l);
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
          this.callbacks.scrollToRange(sect.range);
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
                  this.callbacks.scrollToRange(el_scene.range);
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
                    this.callbacks.scrollToRange(note.range),
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
}

// TODO: In an ideal world, instead of registering an additional view, we
// would take over the normal outline view (so that for markdown views the
// regular outline view does its job but for foutainview's our view does
// what it should...)
export class FountainSideBarView extends ItemView {
  private updateToc: () => void;
  private sections: SidebarSection[];

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.updateToc = debounce(() => this.render(), 500, true);

    const callbacks: SidebarCallbacks = {
      scrollToRange: (range: Range) => this.scrollActiveScriptToHere(range),
    };

    this.sections = [new TocSection(callbacks), new SnippetsSection(callbacks)];
  }

  getViewType(): string {
    return VIEW_TYPE_SIDEBAR;
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

  private render() {
    const ft = this.theFountainView();
    const container = this.contentEl;
    container.empty();

    // Create the main sidebar container
    container.createDiv({ cls: "sidebar-container" }, (sidebarDiv) => {
      if (ft) {
        const script = ft.script();
        if (!("error" in script)) {
          for (const section of this.sections) {
            section.render(sidebarDiv, script);
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
