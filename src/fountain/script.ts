import type {
  Dialogue,
  FountainElement,
  KeyValue,
  Line,
  Note,
  PageBreak,
  Range,
  ScriptStructure,
  Snippets,
  TextElementWithNotesAndBoneyard,
} from "./types";
import { StructureScene, StructureSection } from "./types";
import {
  filterDialogueContent,
  maybeEscapeLeadingSpaces,
  mergeConsecutiveActions,
} from "./utils";

export class FountainScript {
  readonly titlePage: KeyValue[];
  readonly script: FountainElement[];
  readonly document: string;
  readonly allCharacters: Set<string>;

  constructor(
    document: string,
    titlePage: KeyValue[],
    script: FountainElement[],
  ) {
    this.document = document;
    this.titlePage = titlePage;
    this.script = mergeConsecutiveActions(script);
    const characters = new Set<string>();
    for (const el of this.script) {
      switch (el.kind) {
        case "dialogue":
          for (const c of this.charactersOf(el)) {
            characters.add(c);
          }
          break;
        default:
          break;
      }
    }
    this.allCharacters = characters;
  }

  /** Extract text from the fountain document. */
  sliceDocument(r: Range): string {
    return this.document.slice(r.start, r.end);
  }

  /** Extract text from the fountain document for display.
      Leading spaces are replaced with non-breaking spaces. */
  sliceDocumentForDisplay(r: Range): string {
    return maybeEscapeLeadingSpaces(true, this.document.slice(r.start, r.end));
  }

  /**
   * Return list of characters that are saying this dialogue.
   * Normally this will be an array of one element. But in an
   * extension to standard fountain we also allow multiple characters
   * separated by & characters.
   * NOTE: the character names are NOT html escaped!
   * @param d Dialogue
   */
  charactersOf(d: Dialogue): string[] {
    const text = this.document.slice(
      d.characterRange.start,
      d.characterRange.end,
    );
    return text.split("&").map((s) => s.trim());
  }

  with_source(): (FountainElement & { source: string })[] {
    return this.script.map((elt) => {
      return {
        ...elt,
        source: this.document.slice(elt.range.start, elt.range.end),
      };
    });
  }

  /** Return a structured representation of the script.
      Note that in this representation the first synopsis of a section
      or scene will not appear inside content, but inside the synopsis
      field. Even when empty action lines (which will appear inside content)
      are between the scene or section header and the synopsis.
      So if an exact reproduction of the document or the order
      in which the elements appear in the script is important, use this.script()
      instead.
  */
  structure(): ScriptStructure {
    const res: StructureSection[] = [];
    let currentSection: StructureSection = new StructureSection();
    let currentScene: StructureScene = new StructureScene();
    let snippetsStartIndex: number | null = null;

    const isCurrentSceneEmpty = () =>
      !currentScene.content.length &&
      !currentScene.scene &&
      !currentScene.synopsis;
    const isCurrentSectionEmpty = () =>
      isCurrentSceneEmpty() &&
      !currentSection.content &&
      !currentSection.section &&
      !currentSection.synopsis;
    const currentSceneHasOnlyBlankLines = () =>
      currentScene.content.every(
        (fe) =>
          fe.kind === "action" && fe.lines.every((l) => !l.elements.length),
      );

    // First pass: find the index where snippets start
    for (let i = 0; i < this.script.length; i++) {
      const fe = this.script[i];
      if (fe.kind === "section" && fe.depth <= 3) {
        // Check if this is a "Snippets" section
        const sectionText = this.sliceDocument(fe.range).trim();
        if (sectionText.toLowerCase().includes("snippets")) {
          snippetsStartIndex = i;
          break;
        }
      }
    }

    // Process main script elements up to snippets
    const mainScriptElements =
      snippetsStartIndex !== null
        ? this.script.slice(0, snippetsStartIndex)
        : this.script;

    for (const fe of mainScriptElements) {
      switch (fe.kind) {
        case "section":
          {
            if (fe.depth <= 3) {
              if (isCurrentSectionEmpty()) {
                // If the current section does not contain anything yet than this is its title
                // this only happens at the beginning of a document
                currentSection.section = fe;
              } else {
                // otherwise finish the current scene and start a new section
                if (!isCurrentSceneEmpty()) {
                  currentSection.content.push(currentScene);
                  currentScene = new StructureScene();
                }
                res.push(currentSection);
                currentSection = new StructureSection(fe);
              }
            } else {
              // Sections of depth 4 and greater are used to structure scenes...
              currentScene.content.push(fe);
            }
          }
          break;
        case "scene":
          {
            if (!isCurrentSceneEmpty()) {
              // This is the start of a new scene.
              currentSection.content.push(currentScene);
            }
            currentScene = new StructureScene(fe);
          }
          break;
        case "synopsis":
          {
            if (
              !currentScene.synopsis &&
              !currentScene.scene &&
              currentSceneHasOnlyBlankLines() &&
              !currentSection.content.length &&
              currentSection.section
            ) {
              // There was a section line and nothing other than blank
              // lines followed it
              // TODO: Deal with boneyards
              currentSection.synopsis = fe;
            } else if (
              !currentScene.synopsis &&
              currentScene.scene &&
              currentSceneHasOnlyBlankLines()
            ) {
              currentScene.synopsis = fe;
            } else {
              currentScene.content.push(fe);
            }
          }
          break;

        default:
          currentScene.content.push(fe);
          break;
      }
    }
    if (!isCurrentSceneEmpty()) {
      currentSection.content.push(currentScene);
    }
    if (!isCurrentSectionEmpty()) {
      res.push(currentSection);
    }

    const snippets =
      snippetsStartIndex !== null &&
      snippetsStartIndex < this.script.length - 1
        ? this.parseSnippets(this.script.slice(snippetsStartIndex + 1))
        : [];

    return {
      sections: res,
      snippets: snippets,
    };
  }

  private parseSnippets(elements: FountainElement[]): Snippets {
    const snippets: Snippets = [];
    let currentContent: FountainElement[] = [];

    for (const fe of elements) {
      if (fe.kind === "page-break") {
        if (currentContent.length > 0) {
          snippets.push({ content: currentContent, pageBreak: fe });
          currentContent = [];
        }
      } else {
        currentContent.push(fe);
      }
    }

    if (currentContent.length > 0) {
      snippets.push({ content: currentContent });
    }

    return snippets;
  }

  /**
   * Returns a copy of this FountainScript with hidden elements removed.
   * Lines that become empty after removing hidden elements are also removed.
   * Action blocks that contained only lines that are now completely removed are fully removed.
   */
  withHiddenElementsRemoved(settings: {
    hideBoneyard?: boolean;
    hideNotes?: boolean;
    hideSynopsis?: boolean;
  }): FountainScript {
    const filteredScript: FountainElement[] = [];

    for (const element of this.script) {
      // Check for boneyard section - if found and hideBoneyard is true, stop processing
      if (element.kind === "section" && settings.hideBoneyard) {
        const title = this.sliceDocument(element.range);
        if (
          title
            .toLowerCase()
            .replace(/^ *#+ */, "")
            .trimEnd() === "boneyard"
        ) {
          // Stop processing here - everything after boneyard is hidden
          break;
        }
      }

      const filteredElement = this.filterFountainElement(element, settings);
      if (filteredElement !== null) {
        filteredScript.push(filteredElement);
      }
    }

    return new FountainScript(this.document, this.titlePage, filteredScript);
  }

  private filterLines(
    lines: Line[],
    settings: { hideBoneyard?: boolean; hideNotes?: boolean },
  ): Line[] {
    return lines
      .map((line) => this.filterLine(line, settings))
      .filter((line): line is Line => line !== null);
  }

  private filterFountainElement(
    element: FountainElement,
    settings: {
      hideBoneyard?: boolean;
      hideNotes?: boolean;
      hideSynopsis?: boolean;
    },
  ): FountainElement | null {
    switch (element.kind) {
      case "synopsis":
        return settings.hideSynopsis ? null : element;

      case "action": {
        const filteredLines = this.filterLines(element.lines, settings);
        if (filteredLines.length === 0) {
          return null;
        }
        return { ...element, lines: filteredLines };
      }

      case "dialogue": {
        const filteredContent = filterDialogueContent(
          element.content,
          (line) => this.filterLine(line, settings),
        );
        return { ...element, content: filteredContent };
      }

      default:
        return element;
    }
  }

  private filterLine(
    line: Line,
    settings: { hideBoneyard?: boolean; hideNotes?: boolean },
  ): Line | null {
    const filteredElements = line.elements.filter((element) =>
      this.shouldKeepElement(element, settings),
    );

    // If line was originally empty, preserve it
    if (line.elements.length === 0) {
      return line;
    }

    // If line became empty after filtering, remove it
    if (filteredElements.length === 0) {
      return null;
    }

    return {
      ...line,
      elements: filteredElements,
    };
  }

  private shouldKeepElement(
    element: TextElementWithNotesAndBoneyard,
    settings: { hideBoneyard?: boolean; hideNotes?: boolean },
  ): boolean {
    switch (element.kind) {
      case "note":
        // Link notes (`[[>...]]`) are content, not authorial notes; keep them
        // even when hideNotes is on.
        if (element.noteKind === ">") return true;
        return !settings.hideNotes;
      case "boneyard":
        return !settings.hideBoneyard;
      case "text":
      case "bold":
      case "italics":
      case "underline":
        return true;
      default:
        return true;
    }
  }
}
