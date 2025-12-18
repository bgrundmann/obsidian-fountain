import { type App, Modal, Setting } from "obsidian";
import type {
  FountainElement,
  FountainScript,
  Range,
  StructureScene,
  StructureSection,
} from "./fountain";

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
    descEl.style.marginBottom = "var(--size-4-4)";
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
  private structureCheckboxes: Map<StructureSection | StructureScene, boolean> =
    new Map();
  private structureWithDepth: Array<{
    item: StructureSection | StructureScene;
    depth: number;
    parent?: StructureSection;
  }> = [];

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

    // Get the structured representation
    const scriptStructure = this.script.structure();
    this.buildStructureWithDepth(scriptStructure.sections, 0);

    // Initialize all structural elements as unselected
    for (const { item } of this.structureWithDepth) {
      this.structureCheckboxes.set(item, false);
    }
  }

  private buildStructureWithDepth(
    sections: StructureSection[],
    baseDepth: number,
  ): void {
    const processSection = (
      section: StructureSection,
      depth: number,
      parent?: StructureSection,
    ) => {
      // Add the section itself if it has a header
      if (section.section) {
        this.structureWithDepth.push({ item: section, depth, parent });
      }

      // Process nested content with increased depth
      for (const item of section.content) {
        if (item.kind === "section") {
          processSection(item, depth + 1, section);
        } else if (item.kind === "scene") {
          this.structureWithDepth.push({
            item,
            depth: section.section ? depth + 1 : depth,
            parent: section.section ? section : parent,
          });
        }
      }
    };

    for (const section of sections) {
      processSection(section, baseDepth);
    }
  }

  private getChildrenOf(
    parent: StructureSection,
  ): Array<StructureSection | StructureScene> {
    return this.structureWithDepth
      .filter(({ parent: p }) => p === parent)
      .map(({ item }) => item);
  }

  private updateChildrenSelection(
    parent: StructureSection,
    selected: boolean,
  ): void {
    const children = this.getChildrenOf(parent);
    for (const child of children) {
      this.structureCheckboxes.set(child, selected);
      // Recursively update children if this is also a section
      if (child.kind === "section") {
        this.updateChildrenSelection(child, selected);
      }
    }
  }

  protected getAvailableElements(): FountainElement[] {
    // This is not used directly, but needed for base class
    return [];
  }

  protected renderSelectionUI(contentEl: HTMLElement): void {
    // Find or create the content container (everything after the hr separator)
    let contentContainer = contentEl.querySelector(".structure-content");
    if (!contentContainer) {
      contentContainer = contentEl.createDiv({ cls: "structure-content" });
    } else {
      // Clear only the content container, not the whole modal
      contentContainer.empty();
    }

    // Add description with selection count
    const selectedCount = Array.from(this.structureCheckboxes.values()).filter(
      (checked) => checked,
    ).length;
    const totalCount = this.structureWithDepth.length;

    const descEl = contentContainer.createEl("p");
    descEl.innerHTML = `Select scenes and sections to remove from the script:<br><strong>${selectedCount} of ${totalCount} items selected</strong>`;
    descEl.style.marginBottom = "var(--size-4-4)";
    descEl.style.color = "var(--text-muted)";

    if (this.structureWithDepth.length === 0) {
      const warningEl = contentContainer.createEl("p", {
        text: "No scenes or sections found in this script.",
      });
      warningEl.style.color = "var(--text-warning)";
      warningEl.style.fontStyle = "italic";
      return;
    }

    // Create a scrollable container for the tree
    const treeContainer = contentContainer.createDiv({
      cls: "structure-tree-container",
    });
    treeContainer.style.maxHeight = "400px";
    treeContainer.style.overflowY = "auto";
    treeContainer.style.border =
      "var(--border-width) solid var(--background-modifier-border)";
    treeContainer.style.borderRadius = "var(--radius-s)";
    treeContainer.style.padding = "var(--size-4-3)";
    treeContainer.style.marginBottom = "var(--size-4-4)";
    treeContainer.style.backgroundColor = "var(--background-secondary)";
    treeContainer.style.position = "relative";

    for (const { item, depth } of this.structureWithDepth) {
      let displayName = "";
      let isScene = false;

      if (item.kind === "scene" && item.scene) {
        displayName = `🎬 ${item.scene.heading}`;
        isScene = true;
      } else if (item.kind === "section" && item.section) {
        const sectionText = this.script.unsafeExtractRaw(item.section.range);
        const title = sectionText.split("\n")[0].replace(/^#+\s*/, "");
        displayName = `${"#".repeat(item.section.depth)} ${title}`;
      }

      if (displayName) {
        const setting = new Setting(treeContainer);

        // Apply indentation based on depth using calc() with CSS variables
        setting.settingEl.style.marginLeft =
          depth > 0 ? `calc(${depth} * var(--size-4-6))` : "0";
        setting.settingEl.style.borderLeft =
          depth > 0
            ? "var(--border-width) solid var(--background-modifier-border-hover)"
            : "none";
        setting.settingEl.style.paddingLeft =
          depth > 0 ? "var(--size-4-2)" : "0";
        setting.settingEl.style.transition = "background-color 0.15s ease";

        // Highlight selected items
        const isSelected = this.structureCheckboxes.get(item) ?? false;
        if (isSelected) {
          setting.settingEl.style.backgroundColor =
            "var(--background-modifier-hover)";
        }

        // Add tree connector line
        if (depth > 0) {
          setting.settingEl.style.position = "relative";
          const connector = setting.settingEl.createDiv();
          connector.style.position = "absolute";
          connector.style.left = "calc(-1 * var(--border-width))";
          connector.style.top = "50%";
          connector.style.width = "var(--size-4-3)";
          connector.style.height = "var(--border-width)";
          connector.style.backgroundColor =
            "var(--background-modifier-border-hover)";
        }

        // Style scenes differently from sections
        if (isScene) {
          setting.nameEl.style.fontStyle = "italic";
          setting.nameEl.style.color = "var(--text-muted)";
          setting.nameEl.style.fontSize = "0.95em";
        } else {
          // Sections get bolder styling
          setting.nameEl.style.fontWeight = "500";
        }

        setting.setName(displayName).addToggle((toggle) => {
          toggle
            .setValue(this.structureCheckboxes.get(item) ?? false)
            .onChange((value) => {
              this.structureCheckboxes.set(item, value);

              // If this is a section, also update all its children
              if (item.kind === "section") {
                this.updateChildrenSelection(item, value);
              }
              // Re-render to update child checkboxes and selection count
              this.renderSelectionUI(contentEl);
            });
        });
      }
    }
  }

  protected getSelectedElements(): FountainElement[] {
    // Convert selected structure items to pseudo-elements with their full ranges
    const selectedStructureItems = this.structureWithDepth
      .filter(({ item }) => this.structureCheckboxes.get(item))
      .map(({ item }) => item);

    // Create pseudo-elements with the complete ranges from structure
    return selectedStructureItems.map((item) => ({
      kind: item.kind as "scene" | "section",
      range: item.range,
      // Add minimal fields to satisfy type checking
      ...(item.kind === "scene" && item.scene
        ? { heading: item.scene.heading, number: item.scene.number }
        : {}),
      ...(item.kind === "section" && item.section
        ? { depth: item.section.depth }
        : {}),
    })) as FountainElement[];
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
    descEl.style.marginBottom = "var(--size-4-4)";
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
