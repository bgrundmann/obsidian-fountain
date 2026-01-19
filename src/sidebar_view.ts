import { ItemView, type WorkspaceLeaf, debounce } from "obsidian";
import {
  type FountainScript,
  type Range,
  type Snippet,
  type StructureScene,
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
  getText: (range: Range) => string;
  insertAfterSnippetsHeader: (text: string) => void;
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

      // Add drop handling
      sectionDiv.addEventListener("dragover", (event) => {
        event.preventDefault(); // Allow drop
        sectionDiv.addClass("drag-over");
      });

      sectionDiv.addEventListener("dragleave", (event) => {
        sectionDiv.removeClass("drag-over");
      });

      sectionDiv.addEventListener("drop", (event) => {
        event.preventDefault();
        sectionDiv.removeClass("drag-over");

        const droppedText = event.dataTransfer?.getData("text/plain");
        if (droppedText) {
          this.callbacks.insertAfterSnippetsHeader(`${droppedText}\n\n===\n\n`);
        }
      });

      // Add subtle instruction text
      sectionDiv.createEl("div", {
        text: "Maybe later...",
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
    const snippetRange =
      snippet.content.length > 0
        ? {
            start: snippet.content[0].range.start,
            end: snippet.content[snippet.content.length - 1].range.end,
          }
        : { start: 0, end: 0 };

    parent.createDiv(
      {
        cls: ["snippet"],
        attr: {
          draggable: "true",
          ...dataRange(snippetRange),
        },
      },
      (snippetDiv) => {
        // Add click handler to scroll to snippet location
        if (snippet.content.length > 0) {
          snippetDiv.addEventListener("click", (evt) => {
            // Don't scroll if we started a drag
            if (evt.defaultPrevented) return;
            this.callbacks.scrollToRange(snippetRange);
          });
          snippetDiv.style.cursor = "pointer";
        }

        // Add drag handlers
        snippetDiv.addEventListener("dragstart", (evt: DragEvent) => {
          if (!evt.dataTransfer) return;

          // Get the actual snippet text content
          const snippetText = this.callbacks.getText(snippetRange);
          if (!snippetText) return;

          evt.dataTransfer.clearData();
          evt.dataTransfer.setData("text/plain", snippetText);
        });

        snippetDiv.createDiv({ cls: ["screenplay"] }, (div) => {
          // Render all snippet content - CSS max-height will handle truncation
          for (const element of snippet.content) {
            renderElement(div, element, script, {});
          }
        });
      },
    );
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
                  ".synopsis, .preview",
                )) {
                  el.toggle(this.showSynopsis);
                }
              });
            },
          );
          tocControls.createEl("label", {
            attr: { for: "synopsis" },
            text: "preview?",
          });
        });

        for (const section of script.structure().sections) {
          this.renderTocSection(div, script, section);
        }

        if (!this.showSynopsis) {
          for (const el of div.querySelectorAll<HTMLElement>(
            ".synopsis, .preview",
          )) {
            el.hide();
          }
        }
      });
    });
  }

  private getScenePreview(
    script: FountainScript,
    scene: StructureScene,
  ): string | null {
    const parts: string[] = [];
    let totalLength = 0;
    const maxLength = 100;

    for (const el of scene.content) {
      if (totalLength >= maxLength) break;

      if (el.kind === "action") {
        // Skip blank lines (actions where all lines have no elements)
        if (el.lines.every((l) => l.elements.length === 0)) continue;
        const text = script.unsafeExtractRaw(el.range, true).trim();
        if (text) {
          parts.push(text);
          totalLength += text.length;
        }
      } else if (el.kind === "dialogue") {
        // Format as "CHARACTER: dialogue"
        const charName = script.unsafeExtractRaw(el.characterRange, true).trim();
        if (el.lines.length > 0) {
          const firstLine = el.lines[0];
          const dialogueText = script
            .unsafeExtractRaw(firstLine.range, true)
            .trim();
          const formatted = `${charName}: ${dialogueText}`;
          parts.push(formatted);
          totalLength += formatted.length;
        }
      }
    }

    if (parts.length === 0) return null;

    let preview = parts.join(" ");
    if (preview.length > maxLength) {
      preview = preview.substring(0, maxLength).trim() + "...";
    }
    return preview;
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
                  text: el_scene.heading,
                });
                d.addEventListener("click", (evt: Event) => {
                  this.callbacks.scrollToRange(el_scene.range);
                });
              }
              if (el.synopsis) {
                this.renderSynopsis(s, script, el.synopsis);
              } else {
                const preview = this.getScenePreview(script, el);
                if (preview) {
                  const d = s.createDiv({
                    cls: "preview",
                    text: preview,
                  });
                  if (!this.showSynopsis) {
                    d.hide();
                  }
                }
              }
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
      getText: (range: Range) => this.getText(range),
      insertAfterSnippetsHeader: (text: string) =>
        this.insertAfterSnippetsHeader(text),
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

  private getText(range: Range): string {
    const ft = this.theFountainView();
    return ft?.getText(range) ?? "";
  }

  private insertAfterSnippetsHeader(text: string) {
    const ft = this.theFountainView();
    if (!ft) return;

    const script = ft.script();
    if ("error" in script) return;

    // Find the "# Snippets" header position
    let snippetsHeaderEnd: number | null = null;
    for (const element of script.script) {
      if (element.kind === "section") {
        const sectionText = script.document.slice(
          element.range.start,
          element.range.end,
        );
        if (sectionText.toLowerCase().includes("snippets")) {
          snippetsHeaderEnd = element.range.end;
          break;
        }
      }
    }

    if (snippetsHeaderEnd !== null) {
      // Insert text right after the snippets header
      ft.replaceText(
        { start: snippetsHeaderEnd, end: snippetsHeaderEnd },
        `\n\n${text}`,
      );
    } else {
      // If no snippets section exists, add it at the end
      const docLength = script.document.length;
      const snippetsSection = `\n\n# Boneyard\n# Snippets\n${text}`;
      ft.replaceText({ start: docLength, end: docLength }, snippetsSection);
    }
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
