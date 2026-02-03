import {
  type MarkdownPostProcessorContext,
  Notice,
  Plugin,
  type TFile,
  type WorkspaceLeaf,
} from "obsidian";
import type { FountainElement } from "./fountain";
import { parse } from "./fountain_parser";
import { generatePDF, UnsupportedCharacterError } from "./pdf_generator";
import { type PDFOptions, PDFOptionsDialog } from "./pdf_options_dialog";
import { renderContent } from "./reading_view";
import {
  RemoveDialogueModal,
  RemoveElementTypesModal,
  RemoveStructureModal,
  removeElementsFromText,
} from "./removal_commands";
import { FountainSideBarView, VIEW_TYPE_SIDEBAR } from "./sidebar_view";
import { FountainView, VIEW_TYPE_FOUNTAIN } from "./view";

export default class FountainPlugin extends Plugin {
  async onload() {
    // Register our custom view and associate it with .fountain files
    this.registerView(VIEW_TYPE_FOUNTAIN, (leaf) => new FountainView(leaf));
    this.registerExtensions(["fountain"], VIEW_TYPE_FOUNTAIN);
    this.registerView(
      VIEW_TYPE_SIDEBAR,
      (leaf) => new FountainSideBarView(leaf),
    );
    this.registerCommands();
    this.app.workspace.onLayoutReady(() => {
      this.openSideBar();
    });
    this.registerMarkdownPostProcessor(this.markdownPostProcessor);
  }

  async onunload() {
    // Note that there is no unregisterView or unregisterExtensions methods
    // because obsidian already does this automatically when the plugin is unloaded.
  }

  private markdownPostProcessor(
    element: HTMLElement,
    context: MarkdownPostProcessorContext,
  ) {
    // Find all code blocks
    const codeblocks = element.findAll("code");

    for (const codeblock of codeblocks) {
      // Check if it's a fountain block
      const parent = codeblock.parentElement;
      if (
        parent?.tagName === "PRE" &&
        codeblock.classList.contains("language-fountain")
      ) {
        const fountainText = codeblock.textContent || "";

        // Create your custom rendering
        const container = createDiv({ cls: "screenplay" });
        const script = parse(fountainText, {});
        renderContent(container, script, {});

        // Replace the code block
        parent.replaceWith(container);
      }
    }
  }

  private async openSideBar() {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(VIEW_TYPE_SIDEBAR);
    if (leaves.length > 0) {
      leaf = leaves[0];
    } else {
      leaf = workspace.getRightLeaf(false);
      await leaf?.setViewState({ type: VIEW_TYPE_SIDEBAR, active: true });
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
          leaf.view.focusEditor();
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

  private copySelectionAsSnippetCommand(checking: boolean): boolean {
    const fv = this.app.workspace.getActiveViewOfType(FountainView);
    if (checking) return fv?.hasValidSelectionForSnipping() ?? false;
    if (fv) {
      fv.saveSelectionAsSnippet(false);
    }
    return true;
  }

  private cutSelectionAsSnippetCommand(checking: boolean): boolean {
    const fv = this.app.workspace.getActiveViewOfType(FountainView);
    if (checking) return fv?.hasValidSelectionForSnipping() ?? false;
    if (fv) {
      fv.saveSelectionAsSnippet(true);
    }
    return true;
  }

  private generatePDFCommand(checking: boolean): boolean {
    const activeFile = this.app.workspace.getActiveFile();
    const isFountainFile =
      activeFile !== null && activeFile.extension === "fountain";

    if (checking) return isFountainFile;

    if (!isFountainFile) {
      new Notice("Please open a fountain file to generate a PDF");
      return true;
    }

    // Call async function without await to avoid blocking
    this.executeGeneratePDF(activeFile);
    return true;
  }

  private addSceneNumbersCommand(checking: boolean): boolean {
    const fv = this.app.workspace.getActiveViewOfType(FountainView);
    if (checking) return fv !== null;
    if (fv) {
      fv.addSceneNumbers();
    }
    return true;
  }

  private removeSceneNumbersCommand(checking: boolean): boolean {
    const fv = this.app.workspace.getActiveViewOfType(FountainView);
    if (checking) return fv !== null;
    if (fv) {
      fv.removeSceneNumbers();
    }
    return true;
  }

  private async executeGeneratePDF(activeFile: TFile): Promise<void> {
    try {
      // Read the fountain file content
      const content = await this.app.vault.read(activeFile);

      // Parse the fountain content
      const fountainScript = parse(content, {});

      // Check if parsing was successful
      if ("error" in fountainScript) {
        new Notice("Failed to parse fountain file");
        console.error("Error parsing fountain script:", fountainScript);
        return;
      }

      // Create output file path (same directory, .pdf extension)
      const outputPath = activeFile.path.replace(/\.fountain$/, ".pdf");

      // Check if target file already exists
      const existingFile = this.app.vault.getAbstractFileByPath(outputPath);
      const fileExists = existingFile !== null;

      // Show PDF options dialog
      const dialog = new PDFOptionsDialog(
        this.app,
        fileExists,
        outputPath,
        async (options: PDFOptions) => {
          try {
            // Generate the PDF with options
            new Notice("Generating PDF...");
            const pdfDoc = await generatePDF(fountainScript, options);

            // Get PDF bytes
            const pdfBytes = await pdfDoc.save();

            // Delete existing file if it exists
            if (existingFile) {
              await this.app.vault.delete(existingFile);
            }

            // Save the PDF to the vault
            await this.app.vault.createBinary(outputPath, pdfBytes);

            new Notice(`PDF generated: ${outputPath}`);
          } catch (error) {
            if (error instanceof UnsupportedCharacterError) {
              new Notice(error.message);
            } else {
              new Notice("Failed to generate PDF");
            }
            console.error("Error generating PDF:", error);
          }
        },
      );
      dialog.open();
    } catch (error) {
      new Notice("Failed to parse fountain file");
      console.error("Error in PDF generation:", error);
    }
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
    this.addCommand({
      id: "generate-pdf",
      name: "Generate PDF",
      checkCallback: (checking: boolean) => {
        return this.generatePDFCommand(checking);
      },
    });
    this.addCommand({
      id: "copy-selection-as-snippet",
      name: "Copy selection to a new snippet",
      checkCallback: (checking: boolean) => {
        return this.copySelectionAsSnippetCommand(checking);
      },
    });
    this.addCommand({
      id: "cut-selection-as-snippet",
      name: "Move selection to a new snippet.",
      checkCallback: (checking: boolean) => {
        return this.cutSelectionAsSnippetCommand(checking);
      },
    });
    this.addCommand({
      id: "add-scene-numbers",
      name: "Add scene numbers",
      checkCallback: (checking: boolean) => {
        return this.addSceneNumbersCommand(checking);
      },
    });
    this.addCommand({
      id: "remove-scene-numbers",
      name: "Remove scene numbers",
      checkCallback: (checking: boolean) => {
        return this.removeSceneNumbersCommand(checking);
      },
    });
    this.addCommand({
      id: "remove-character-dialogue",
      name: "Remove character dialogue",
      checkCallback: (checking: boolean) => {
        return this.removeCharacterDialogueCommand(checking);
      },
    });
    this.addCommand({
      id: "remove-scenes-sections",
      name: "Remove scenes and sections",
      checkCallback: (checking: boolean) => {
        return this.removeScenesSectionsCommand(checking);
      },
    });
    this.addCommand({
      id: "remove-element-types",
      name: "Remove element types",
      checkCallback: (checking: boolean) => {
        return this.removeElementTypesCommand(checking);
      },
    });
    this.addCommand({
      id: "open-sidebar",
      name: "Open sidebar",
      checkCallback: (checking: boolean) => {
        return this.openSidebarCommand(checking);
      },
    });
    this.addCommand({
      id: "toggle-spell-check",
      name: "Toggle spell check",
      checkCallback: (checking: boolean) => {
        return this.toggleSpellCheckCommand(checking);
      },
    });
  }

  private openSidebarCommand(checking: boolean): boolean {
    if (checking) {
	return this.app.workspace.getLeavesOfType(VIEW_TYPE_SIDEBAR).length === 0;
    }
    this.openSideBar();
    return true;
  }

  private toggleSpellCheckCommand(checking: boolean): boolean {
    const fv = this.app.workspace.getActiveViewOfType(FountainView);
    if (checking) return fv !== null;
    if (fv) {
      const enabled = fv.toggleSpellCheck();
      new Notice(enabled ? "Spell check enabled" : "Spell check disabled");
    }
    return true;
  }

  private removeCharacterDialogueCommand(checking: boolean): boolean {
    const fv = this.app.workspace.getActiveViewOfType(FountainView);
    if (checking) return fv !== null;
    if (fv) {
      this.executeRemovalCommand(fv, "dialogue");
    }
    return true;
  }

  private removeScenesSectionsCommand(checking: boolean): boolean {
    const fv = this.app.workspace.getActiveViewOfType(FountainView);
    if (checking) return fv !== null;
    if (fv) {
      this.executeRemovalCommand(fv, "structure");
    }
    return true;
  }

  private removeElementTypesCommand(checking: boolean): boolean {
    const fv = this.app.workspace.getActiveViewOfType(FountainView);
    if (checking) return fv !== null;
    if (fv) {
      this.executeRemovalCommand(fv, "types");
    }
    return true;
  }

  private executeRemovalCommand(
    fountainView: FountainView,
    modalType: "dialogue" | "structure" | "types",
  ) {
    const script = fountainView.getScript();
    if (!script || "error" in script) {
      new Notice("Unable to parse fountain script");
      return;
    }

    const onConfirm = async (
      elementsToRemove: FountainElement[],
      duplicateFile: boolean,
    ) => {
      if (elementsToRemove.length === 0) {
        new Notice("No elements selected for removal");
        return;
      }

      try {
        const currentText = fountainView.getViewData();
        const newText = removeElementsFromText(currentText, elementsToRemove);

        if (duplicateFile) {
          // Create a duplicate file with the filtered content
          const currentFile = fountainView.file;
          if (!currentFile) {
            new Notice("No file is currently open");
            return;
          }
          await this.createFilteredDuplicate(
            currentFile,
            newText,
            elementsToRemove.length,
          );
        } else {
          // Apply directly to current file
          fountainView.setViewData(newText, false);
        }
        new Notice(
          `Removed ${elementsToRemove.length} element${elementsToRemove.length === 1 ? "" : "s"}`,
        );
      } catch (error) {
        new Notice("Failed to remove elements");
        console.error("Error removing elements:", error);
      }
    };

    switch (modalType) {
      case "dialogue":
        new RemoveDialogueModal(this.app, script, onConfirm).open();
        break;
      case "structure":
        new RemoveStructureModal(this.app, script, onConfirm).open();
        break;
      case "types":
        new RemoveElementTypesModal(this.app, script, onConfirm).open();
        break;
    }
  }

  private async createFilteredDuplicate(
    originalFile: TFile,
    filteredContent: string,
    removedCount: number,
  ): Promise<void> {
    try {
      // Generate a unique filename for the duplicate
      const baseName = originalFile.basename;
      const extension = originalFile.extension;
      const folder = originalFile.parent?.path || "";

      let duplicateName = `${baseName} (filtered)`;
      let counter = 1;
      let duplicatePath = folder
        ? `${folder}/${duplicateName}.${extension}`
        : `${duplicateName}.${extension}`;

      // Ensure the filename is unique
      while (this.app.vault.getAbstractFileByPath(duplicatePath)) {
        duplicateName = `${baseName} (filtered ${counter})`;
        duplicatePath = folder
          ? `${folder}/${duplicateName}.${extension}`
          : `${duplicateName}.${extension}`;
        counter++;
      }

      // Create the new file with filtered content
      const newFile = await this.app.vault.create(
        duplicatePath,
        filteredContent,
      );

      // Open the new file
      const leaf = this.app.workspace.getLeaf(false);
      await leaf.openFile(newFile);
      this.app.workspace.setActiveLeaf(leaf, { focus: true });

      new Notice(
        `Created filtered copy: ${duplicateName}.${extension} (removed ${removedCount} element${removedCount === 1 ? "" : "s"})`,
      );
    } catch (error) {
      new Notice("Failed to create duplicate file");
      console.error("Error creating duplicate:", error);
    }
  }
}
