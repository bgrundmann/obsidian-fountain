import { browser, expect } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";

/** Ensure we're in readonly mode before each test. */
async function ensureReadonlyMode() {
  const isEdit = await browser.executeObsidian(({ app }) => {
    const leaf = app.workspace.activeLeaf;
    if (leaf && "isEditMode" in leaf.view) {
      return (leaf.view as any).isEditMode();
    }
    return false;
  });
  if (isEdit) {
    await browser.keys(["Meta", "e"]);
    await browser.$(".screenplay").waitForExist({ timeout: 5_000 });
  }
}

describe("Fountain plugin", function () {
  before(async function () {
    await obsidianPage.openFile("test.fountain");
    await browser.$(".screenplay").waitForExist({ timeout: 10_000 });
  });

  afterEach(async function () {
    await ensureReadonlyMode();
    await obsidianPage.resetVault();
  });

  describe("toggle edit mode", function () {
    it("should start in readonly mode", async function () {
      const isEdit = await browser.executeObsidian(({ app }) => {
        const leaf = app.workspace.activeLeaf;
        if (leaf && "isEditMode" in leaf.view) {
          return (leaf.view as any).isEditMode();
        }
        return undefined;
      });
      expect(isEdit).toBe(false);
    });

    it("should toggle to edit mode with Mod+E", async function () {
      await browser.keys(["Meta", "e"]);

      const cmEditor = browser.$(".cm-editor");
      await expect(cmEditor).toBeDisplayed();

      const isEdit = await browser.executeObsidian(({ app }) => {
        const leaf = app.workspace.activeLeaf;
        if (leaf && "isEditMode" in leaf.view) {
          return (leaf.view as any).isEditMode();
        }
        return undefined;
      });
      expect(isEdit).toBe(true);
    });

    it("should toggle back to readonly mode with Mod+E", async function () {
      // Enter edit mode
      await browser.keys(["Meta", "e"]);
      await browser.$(".cm-editor").waitForExist({ timeout: 5_000 });

      // Toggle back to readonly
      await browser.keys(["Meta", "e"]);
      await browser.$(".screenplay").waitForExist({ timeout: 5_000 });

      const isEdit = await browser.executeObsidian(({ app }) => {
        const leaf = app.workspace.activeLeaf;
        if (leaf && "isEditMode" in leaf.view) {
          return (leaf.view as any).isEditMode();
        }
        return undefined;
      });
      expect(isEdit).toBe(false);
    });
  });

  describe("snippet insertion syncs to editor", function () {
    it("should update CodeMirror when text is inserted via replaceText", async function () {
      // Enter edit mode
      await browser.keys(["Meta", "e"]);
      await browser.$(".cm-editor").waitForExist({ timeout: 5_000 });

      // Simulate what the sidebar drop handler does: call replaceText
      // to insert text after the snippets header
      await browser.executeObsidian(({ app }) => {
        const leaf = app.workspace.activeLeaf;
        if (!leaf) return;
        const view = leaf.view as any;
        if (!("getScript" in view)) return;

        const script = view.getScript();
        if ("error" in script) return;

        for (const element of script.script) {
          if (element.kind === "section") {
            const text = script.document.slice(
              element.range.start,
              element.range.end,
            );
            if (text.toLowerCase().includes("snippets")) {
              view.replaceText(
                { start: element.range.end, end: element.range.end },
                "\n\nDROPPED SNIPPET\n\n===\n\n",
              );
              return;
            }
          }
        }
      });

      // Read the CodeMirror editor's document text — this is what the
      // user actually sees. If the bug is present, the CM editor won't
      // have the new text even though the vault file was updated.
      const textAfter = await browser.executeObsidian(({ app }) => {
        const leaf = app.workspace.activeLeaf;
        if (leaf && "getViewData" in leaf.view) {
          return (leaf.view as any).getViewData();
        }
        return undefined;
      });

      // This assertion should FAIL due to the known bug: replaceText
      // updates the vault file and cachedScript, but doesn't dispatch
      // changes to the CodeMirror editor.
      expect(textAfter).toContain("DROPPED SNIPPET");
    });
  });
});
