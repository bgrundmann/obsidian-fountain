import { type App, Notice, type TFile } from "obsidian";
import type { FountainElement } from "./fountain";
import { parse } from "./fountain/parser";
import { UnsupportedCharacterError, generatePDF } from "./pdf/generator";
import { type PDFOptions, PDFOptionsDialog } from "./pdf/options_dialog";
import {
  RemoveDialogueModal,
  RemoveElementTypesModal,
  RemoveStructureModal,
  removeElementsFromText,
} from "./removal_commands";
import { FountainView } from "./views/fountain_view";
import { VIEW_TYPE_SIDEBAR } from "./sidebar/sidebar_view";

export function hasActiveFountainFile(app: App): boolean {
  const f = app.workspace.getActiveFile();
  return f !== null && f.extension === "fountain";
}

/** checkCallback wrapper: `exec` runs only when a fountain file is active. */
export function ifFountainFile(
  app: App,
  exec: (app: App) => void,
): (checking: boolean) => boolean {
  return (checking) => {
    if (!hasActiveFountainFile(app)) return false;
    if (!checking) exec(app);
    return true;
  };
}

/** checkCallback wrapper: `exec` runs only when a FountainView is active. */
export function ifFountainView(
  app: App,
  exec: (fv: FountainView) => void,
): (checking: boolean) => boolean {
  return (checking) => {
    const fv = app.workspace.getActiveViewOfType(FountainView);
    if (fv === null) return false;
    if (!checking) exec(fv);
    return true;
  };
}

export async function openSidebar(app: App): Promise<void> {
  const { workspace } = app;
  const leaves = workspace.getLeavesOfType(VIEW_TYPE_SIDEBAR);
  if (leaves.length > 0) return;
  const leaf = workspace.getRightLeaf(false);
  await leaf?.setViewState({ type: VIEW_TYPE_SIDEBAR, active: true });
}

export function openSidebarCommand(
  app: App,
): (checking: boolean) => boolean {
  return (checking) => {
    if (checking) {
      return app.workspace.getLeavesOfType(VIEW_TYPE_SIDEBAR).length === 0;
    }
    openSidebar(app);
    return true;
  };
}

export async function newDocumentCommand(app: App): Promise<void> {
  let destination = "Untitled";
  const activeFile = app.workspace.getActiveFile();
  if (activeFile?.parent) {
    destination = `${activeFile.parent.path}/Untitled`;
  }
  const createFile = async (suffix: number | null) => {
    const fileName = suffix
      ? `${destination}-${suffix}.fountain`
      : `${destination}.fountain`;
    try {
      const newFile = await app.vault.create(fileName, "");
      const leaf = app.workspace.getLeaf(false);
      await leaf.openFile(newFile);
      if (leaf.view instanceof FountainView) {
        leaf.view.switchToEditMode();
        leaf.view.focusEditor();
      }
      app.workspace.setActiveLeaf(leaf, { focus: true });
    } catch (_error) {
      createFile(suffix ? suffix + 1 : 1);
    }
  };
  await createFile(null);
}

export async function generatePDFCommand(app: App): Promise<void> {
  const activeFile = app.workspace.getActiveFile();
  if (activeFile === null) {
    new Notice("Please open a fountain file to generate a PDF");
    return;
  }

  try {
    const content = await app.vault.read(activeFile);
    const fountainScript = parse(content, {});

    if ("error" in fountainScript) {
      new Notice("Failed to parse fountain file");
      console.error("Error parsing fountain script:", fountainScript);
      return;
    }

    const outputPath = activeFile.path.replace(/\.fountain$/, ".pdf");
    const existingFile = app.vault.getAbstractFileByPath(outputPath);
    const fileExists = existingFile !== null;

    const dialog = new PDFOptionsDialog(
      app,
      fileExists,
      outputPath,
      async (options: PDFOptions) => {
        try {
          new Notice("Generating PDF...");
          const pdfDoc = await generatePDF(fountainScript, options);
          const pdfBytes = await pdfDoc.save();

          if (existingFile) {
            await app.vault.delete(existingFile);
          }

          await app.vault.createBinary(
            outputPath,
            pdfBytes.buffer.slice(
              pdfBytes.byteOffset,
              pdfBytes.byteOffset + pdfBytes.byteLength,
            ) as ArrayBuffer,
          );

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

export function executeRemovalCommand(
  app: App,
  fountainView: FountainView,
  modalType: "dialogue" | "structure" | "types",
): void {
  const script = fountainView.getScript();
  if ("error" in script) {
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
      if (duplicateFile) {
        const currentText = fountainView.getViewData();
        const newText = removeElementsFromText(currentText, elementsToRemove);
        const currentFile = fountainView.file;
        if (!currentFile) {
          new Notice("No file is currently open");
          return;
        }
        await createFilteredDuplicate(
          app,
          currentFile,
          newText,
          elementsToRemove.length,
        );
      } else {
        const edits = elementsToRemove.map((el) => ({
          range: el.range,
          replacement: "",
        }));
        fountainView.applyEditsToFile(edits);
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
      new RemoveDialogueModal(app, script, onConfirm).open();
      break;
    case "structure":
      new RemoveStructureModal(app, script, onConfirm).open();
      break;
    case "types":
      new RemoveElementTypesModal(app, script, onConfirm).open();
      break;
  }
}

async function createFilteredDuplicate(
  app: App,
  originalFile: TFile,
  filteredContent: string,
  removedCount: number,
): Promise<void> {
  try {
    const baseName = originalFile.basename;
    const extension = originalFile.extension;
    const folder = originalFile.parent?.path || "";

    let duplicateName = `${baseName} (filtered)`;
    let counter = 1;
    let duplicatePath = folder
      ? `${folder}/${duplicateName}.${extension}`
      : `${duplicateName}.${extension}`;

    while (app.vault.getAbstractFileByPath(duplicatePath)) {
      duplicateName = `${baseName} (filtered ${counter})`;
      duplicatePath = folder
        ? `${folder}/${duplicateName}.${extension}`
        : `${duplicateName}.${extension}`;
      counter++;
    }

    const newFile = await app.vault.create(duplicatePath, filteredContent);
    const leaf = app.workspace.getLeaf(false);
    await leaf.openFile(newFile);
    app.workspace.setActiveLeaf(leaf, { focus: true });

    new Notice(
      `Created filtered copy: ${duplicateName}.${extension} (removed ${removedCount} element${removedCount === 1 ? "" : "s"})`,
    );
  } catch (error) {
    new Notice("Failed to create duplicate file");
    console.error("Error creating duplicate:", error);
  }
}
