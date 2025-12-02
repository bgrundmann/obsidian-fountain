import {
  type MarkdownPostProcessorContext,
  Notice,
  Plugin,
  type TFile,
  type WorkspaceLeaf,
} from "obsidian";
import { parse } from "./fountain_parser";
import { generatePDF } from "./pdf_generator";
import { type PDFOptions, PDFOptionsDialog } from "./pdf_options_dialog";
import { renderContent } from "./reading_view";
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
      this.registerTocInSideBar();
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

  private async registerTocInSideBar() {
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
            new Notice("Failed to generate PDF");
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
  }
}
