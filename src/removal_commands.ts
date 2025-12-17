import { type App, Modal, Setting } from "obsidian";
import type { FountainElement, FountainScript, Range } from "./fountain";

// Base class for all removal modals
export abstract class RemovalModal extends Modal {
  protected onConfirm: (
    elementsToRemove: FountainElement[],
    duplicateFile: boolean,
  ) => void;
  protected script: FountainScript;
  protected availableElements: FountainElement[];
  protected duplicateFile = true;

  constructor(
    app: App,
    script: FountainScript,
    onConfirm: (
      elementsToRemove: FountainElement[],
      duplicateFile: boolean,
    ) => void,
  ) {
    super(app);
    this.script = script;
    this.onConfirm = onConfirm;
    this.availableElements = this.getAvailableElements();
  }

  protected abstract getAvailableElements(): FountainElement[];
  protected abstract renderSelectionUI(contentEl: HTMLElement): void;
  protected abstract getSelectedElements(): FountainElement[];

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    // Add duplicate file checkbox at the top
    new Setting(contentEl)
      .setName("Create filtered copy (recommended)")
      .setDesc(
        "Creates a new file with filtered content, leaving the original untouched. Uncheck to modify current file directly (no undo in readonly mode).",
      )
      .addToggle((toggle) => {
        toggle.setValue(this.duplicateFile).onChange((value) => {
          this.duplicateFile = value;
        });
      });

    // Add a separator
    contentEl.createEl("hr");

    this.renderSelectionUI(contentEl);

    // Buttons
    new Setting(contentEl)
      .addButton((btn) => {
        btn.setButtonText("Cancel").onClick(() => {
          this.close();
        });
      })
      .addButton((btn) => {
        btn
          .setButtonText("Remove Selected")
          .setCta()
          .onClick(() => {
            const elementsToRemove = this.getSelectedElements();
            this.close();
            this.onConfirm(elementsToRemove, this.duplicateFile);
          });
      });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

// Modal for removing character dialogue
export class RemoveDialogueModal extends RemovalModal {
  private characterCheckboxes: Map<string, boolean> = new Map();

  constructor(
    app: App,
    script: FountainScript,
    onConfirm: (
      elementsToRemove: FountainElement[],
      duplicateFile: boolean,
    ) => void,
  ) {
    super(app, script, onConfirm);
    this.setTitle("Remove Character Dialogue");

    // Initialize all characters as unselected (safe default)
    for (const character of this.script.allCharacters) {
      this.characterCheckboxes.set(character, false);
    }
  }

  protected getAvailableElements(): FountainElement[] {
    return this.script.script.filter((el) => el.kind === "dialogue");
  }

  protected renderSelectionUI(contentEl: HTMLElement): void {
    // Add description
    const descEl = contentEl.createEl("p", {
      text: "Select characters whose dialogue should be removed from the script:",
    });
    descEl.style.marginBottom = "1rem";
    descEl.style.color = "var(--text-muted)";

    // Show warning if no characters found
    if (this.script.allCharacters.size === 0) {
      const warningEl = contentEl.createEl("p", {
        text: "No characters found in this script.",
      });
      warningEl.style.color = "var(--text-warning)";
      warningEl.style.fontStyle = "italic";
      return;
    }

    // Create checkbox for each character
    const sortedCharacters = Array.from(this.script.allCharacters).sort();
    for (const character of sortedCharacters) {
      new Setting(contentEl).setName(character).addToggle((toggle) => {
        toggle
          .setValue(this.characterCheckboxes.get(character) ?? false)
          .onChange((value) => {
            this.characterCheckboxes.set(character, value);
          });
      });
    }
  }

  protected getSelectedElements(): FountainElement[] {
    const selectedCharacters = Array.from(this.characterCheckboxes.entries())
      .filter(([_, selected]) => selected)
      .map(([character, _]) => character);

    if (selectedCharacters.length === 0) {
      return [];
    }

    return this.availableElements.filter((el) => {
      if (el.kind !== "dialogue") return false;
      const characters = this.script.charactersOf(el);
      // Remove dialogue if ANY of the speaking characters are selected
      return characters.some((char) => selectedCharacters.includes(char));
    });
  }
}

// Modal for removing scenes and sections
export class RemoveStructureModal extends RemovalModal {
  private elementCheckboxes: Map<FountainElement, boolean> = new Map();

  constructor(
    app: App,
    script: FountainScript,
    onConfirm: (
      elementsToRemove: FountainElement[],
      duplicateFile: boolean,
    ) => void,
  ) {
    super(app, script, onConfirm);
    this.setTitle("Remove Scenes and Sections");

    // Initialize all structural elements as unselected
    for (const element of this.availableElements) {
      this.elementCheckboxes.set(element, false);
    }
  }

  protected getAvailableElements(): FountainElement[] {
    return this.script.script.filter(
      (el) => el.kind === "scene" || el.kind === "section",
    );
  }

  protected renderSelectionUI(contentEl: HTMLElement): void {
    // Add description
    const descEl = contentEl.createEl("p", {
      text: "Select scenes and sections to remove from the script:",
    });
    descEl.style.marginBottom = "1rem";
    descEl.style.color = "var(--text-muted)";

    if (this.availableElements.length === 0) {
      const warningEl = contentEl.createEl("p", {
        text: "No scenes or sections found in this script.",
      });
      warningEl.style.color = "var(--text-warning)";
      warningEl.style.fontStyle = "italic";
      return;
    }

    for (const element of this.availableElements) {
      let displayName = "";

      if (element.kind === "scene") {
        displayName = `🎬 ${element.heading}`;
      } else if (element.kind === "section") {
        const sectionText = this.script.unsafeExtractRaw(element.range);
        const title = sectionText.split("\n")[0].replace(/^#+\s*/, "");
        displayName = `${"#".repeat(element.depth)} ${title}`;
      }

      new Setting(contentEl).setName(displayName).addToggle((toggle) => {
        toggle
          .setValue(this.elementCheckboxes.get(element) ?? false)
          .onChange((value) => {
            this.elementCheckboxes.set(element, value);
          });
      });
    }
  }

  protected getSelectedElements(): FountainElement[] {
    return Array.from(this.elementCheckboxes.entries())
      .filter(([_, selected]) => selected)
      .map(([element, _]) => element);
  }
}

// Modal for removing element types
export class RemoveElementTypesModal extends RemovalModal {
  private typeCheckboxes: Map<string, boolean> = new Map();
  private typeElementsMap: Map<string, FountainElement[]> = new Map();

  constructor(
    app: App,
    script: FountainScript,
    onConfirm: (
      elementsToRemove: FountainElement[],
      duplicateFile: boolean,
    ) => void,
  ) {
    super(app, script, onConfirm);
    this.setTitle("Remove Element Types");
    this.buildTypeElementsMap();

    // Initialize all types as unselected
    for (const type of this.typeElementsMap.keys()) {
      this.typeCheckboxes.set(type, false);
    }
  }

  private buildTypeElementsMap(): void {
    for (const element of this.script.script) {
      const typeName = this.getElementTypeName(element);
      if (!this.typeElementsMap.has(typeName)) {
        this.typeElementsMap.set(typeName, []);
      }
      const elements = this.typeElementsMap.get(typeName);
      if (elements) {
        elements.push(element);
      }
    }
  }

  private getElementTypeName(element: FountainElement): string {
    switch (element.kind) {
      case "action":
        return "Action Lines";
      case "dialogue":
        return "Dialogue";
      case "scene":
        return "Scene Headings";
      case "section":
        return "Sections";
      case "transition":
        return "Transitions";
      case "synopsis":
        return "Synopsis";
      case "lyrics":
        return "Lyrics";
      case "page-break":
        return "Page Breaks";
      default:
        return "Unknown";
    }
  }

  protected getAvailableElements(): FountainElement[] {
    return this.script.script;
  }

  protected renderSelectionUI(contentEl: HTMLElement): void {
    // Add description
    const descEl = contentEl.createEl("p", {
      text: "Select element types to remove from the script:",
    });
    descEl.style.marginBottom = "1rem";
    descEl.style.color = "var(--text-muted)";

    if (this.typeElementsMap.size === 0) {
      const warningEl = contentEl.createEl("p", {
        text: "No elements found in this script.",
      });
      warningEl.style.color = "var(--text-warning)";
      warningEl.style.fontStyle = "italic";
      return;
    }

    // Sort types for consistent display
    const sortedTypes = Array.from(this.typeElementsMap.keys()).sort();

    for (const typeName of sortedTypes) {
      const elements = this.typeElementsMap.get(typeName);
      if (!elements) continue;
      const count = elements.length;

      new Setting(contentEl)
        .setName(`${typeName} (${count})`)
        .addToggle((toggle) => {
          toggle
            .setValue(this.typeCheckboxes.get(typeName) ?? false)
            .onChange((value) => {
              this.typeCheckboxes.set(typeName, value);
            });
        });
    }
  }

  protected getSelectedElements(): FountainElement[] {
    const result: FountainElement[] = [];

    for (const [typeName, selected] of this.typeCheckboxes.entries()) {
      if (selected) {
        const elements = this.typeElementsMap.get(typeName);
        if (elements) {
          result.push(...elements);
        }
      }
    }

    return result;
  }
}

// Utility function to remove elements from document text
export function removeElementsFromText(
  originalText: string,
  elementsToRemove: FountainElement[],
): string {
  if (elementsToRemove.length === 0) {
    return originalText;
  }

  // Sort ranges by start position (lowest first) for forward iteration
  const sortedRanges = elementsToRemove
    .map((el) => el.range)
    .sort((a, b) => a.start - b.start);

  const slices: string[] = [];
  let currentPos = 0;

  for (const range of sortedRanges) {
    // Add text before this range (if any)
    if (currentPos < range.start) {
      slices.push(originalText.slice(currentPos, range.start));
    }
    // Skip the range to remove it, update position
    currentPos = range.end;
  }

  // Add any remaining text after the last removed range
  if (currentPos < originalText.length) {
    slices.push(originalText.slice(currentPos));
  }

  return slices.join("");
}

// Utility function to get elements within a selection range
export function getElementsInRange(
  script: FountainScript,
  selectionRange: Range,
): FountainElement[] {
  return script.script.filter(
    (element) =>
      element.range.start >= selectionRange.start &&
      element.range.end <= selectionRange.end,
  );
}
