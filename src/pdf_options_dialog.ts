import { type App, Modal, Setting } from "obsidian";

export interface PDFOptions {
  sceneHeadingBold: boolean;
  paperSize: "letter" | "a4";
  hideNotes: boolean;
  hideBoneyard: boolean;
  hideSynopsis: boolean;
}

export class PDFOptionsDialog extends Modal {
  private options: PDFOptions = {
    sceneHeadingBold: false,
    paperSize: "letter",
    hideNotes: true,
    hideBoneyard: true,
    hideSynopsis: false,
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
      const warningEl = contentEl.createDiv();
      const warningTextEl = warningEl.createEl("p", {
        text: "⚠️ Warning: This will overwrite the existing PDF file:",
      });
      warningTextEl.style.color = "var(--text-warning)";
      warningTextEl.style.fontWeight = "500";
      warningTextEl.style.margin = "0 0 0.25rem 0";

      const pathEl = warningEl.createEl("p", {
        text: this.outputPath,
      });
      pathEl.style.color = "var(--text-muted)";
      pathEl.style.fontFamily = "var(--font-monospace)";
      pathEl.style.fontSize = "0.9em";
      pathEl.style.margin = "0";
      pathEl.style.wordBreak = "break-all";
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

    // Hide synopsis checkbox
    new Setting(contentEl)
      .setName("Hide synopsis")
      .setDesc("Exclude synopsis lines from the generated PDF")
      .addToggle((toggle) => {
        toggle.setValue(this.options.hideSynopsis).onChange((value) => {
          this.options.hideSynopsis = value;
        });
      });

    // Hide notes checkbox (always enabled by default)
    new Setting(contentEl)
      .setName("Hide notes")
      .setDesc("Exclude notes from the generated PDF")
      .addToggle((toggle) => {
        toggle.setValue(this.options.hideNotes).onChange((value) => {
          this.options.hideNotes = value;
        });
      });

    // Hide boneyard checkbox (always enabled by default)
    new Setting(contentEl)
      .setName("Hide boneyard")
      .setDesc("Exclude boneyard content from the generated PDF")
      .addToggle((toggle) => {
        toggle.setValue(this.options.hideBoneyard).onChange((value) => {
          this.options.hideBoneyard = value;
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
