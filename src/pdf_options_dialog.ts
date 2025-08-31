import { type App, Modal, Setting, type TFile } from "obsidian";

export interface PDFOptions {
  sceneHeadingBold: boolean;
  paperSize: "letter" | "a4";
}

export class PDFOptionsDialog extends Modal {
  private options: PDFOptions = {
    sceneHeadingBold: false,
    paperSize: "letter",
  };

  constructor(
    app: App,
    private fileExists: boolean,
    private outputPath: string,
    private onSubmit: (options: PDFOptions) => void,
  ) {
    super(app);
    this.setTitle("PDF Generation Options");
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    // Show warning if target file exists
    if (this.fileExists) {
      const warningEl = contentEl.createDiv("pdf-warning");
      warningEl.createEl("p", {
        text: "⚠️ Warning: This will overwrite the existing PDF file:",
        cls: "pdf-warning-text",
      });
      warningEl.createEl("p", {
        text: this.outputPath,
        cls: "pdf-warning-path",
      });
      warningEl.style.marginBottom = "1rem";
      warningEl.style.padding = "0.5rem";
      warningEl.style.backgroundColor = "var(--background-modifier-error)";
      warningEl.style.borderRadius = "4px";
    }

    // Scene heading bold checkbox
    new Setting(contentEl)
      .setName("Scene heading bold")
      .setDesc("Make scene headings bold in the generated PDF")
      .addToggle((toggle) => {
        toggle.setValue(this.options.sceneHeadingBold).onChange((value) => {
          this.options.sceneHeadingBold = value;
        });
      });

    // Paper size dropdown
    new Setting(contentEl)
      .setName("Paper size")
      .setDesc("Choose the paper size for the PDF")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("letter", 'Letter (8.5" × 11")')
          .addOption("a4", "A4 (210 × 297 mm)")
          .setValue(this.options.paperSize)
          .onChange((value) => {
            this.options.paperSize = value as "letter" | "a4";
          });
      });

    // Buttons
    new Setting(contentEl)
      .addButton((btn) => {
        btn.setButtonText("Cancel").onClick(() => {
          this.close();
        });
      })
      .addButton((btn) => {
        btn
          .setButtonText("Generate PDF")
          .setCta()
          .onClick(() => {
            this.close();
            this.onSubmit(this.options);
          });
      });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
