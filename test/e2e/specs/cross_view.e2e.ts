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

describe("Programmatic edits", function () {
  before(async function () {
    await obsidianPage.openFile("test.fountain");
    await browser.$(".screenplay").waitForExist({ timeout: 10_000 });
  });

  afterEach(async function () {
    await ensureReadonlyMode();
    await obsidianPage.resetVault();
    // Close extra leaves created by split tests so the next test starts clean.
    await browser.executeObsidian(({ app }) => {
      const leaves: any[] = [];
      app.workspace.iterateAllLeaves((leaf) => {
        if ((leaf.view as any).getViewType?.() === "fountain") {
          leaves.push(leaf);
        }
      });
      // Keep the first fountain leaf, detach the rest.
      for (let i = 1; i < leaves.length; i++) leaves[i].detach();
    });
  });

  describe("cross-view sync", function () {
    it("propagates programmatic edits to every view on the same file", async function () {
      // Open a second leaf with the same file via split.
      await browser.executeObsidian(async ({ app }) => {
        const activeLeaf = app.workspace.activeLeaf;
        if (!activeLeaf) throw new Error("no active leaf");
        const file = (activeLeaf.view as any).file;
        if (!file) throw new Error("no file on active leaf");
        const newLeaf = app.workspace.getLeaf("split");
        await newLeaf.openFile(file);
      });

      // Wait for two screenplay elements (both readonly views of the same file).
      await browser.waitUntil(
        async () => (await browser.$$(".screenplay")).length === 2,
        { timeout: 5_000, timeoutMsg: "expected two readonly views" },
      );

      // Put the active (second) view into edit mode so we exercise both
      // readonly sibling sync and editor originator sync.
      await browser.keys(["Meta", "e"]);
      await browser.$(".cm-editor").waitForExist({ timeout: 5_000 });

      // Programmatic edit from the active (editor) view: insert text after
      // the snippets header.
      await browser.executeObsidian(({ app }) => {
        const leaf = app.workspace.activeLeaf;
        if (!leaf) return;
        const view = leaf.view as any;
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
                "\n\nDROPPED_MARKER\n\n===\n\n",
              );
              return;
            }
          }
        }
      });

      // The originating editor's CM should show the new text.
      const originatorCMText = await browser.executeObsidian(({ app }) => {
        const leaf = app.workspace.activeLeaf;
        return (leaf!.view as any).getViewData();
      });
      expect(originatorCMText).toContain("DROPPED_MARKER");

      // The sibling readonly view must have re-rendered with the new content.
      const readonlyText = await browser.executeObsidian(({ app }) => {
        let result = "";
        app.workspace.iterateAllLeaves((leaf) => {
          const v = leaf.view as any;
          if (v.getViewType?.() === "fountain" && !v.isEditMode()) {
            result = v.getViewData();
          }
        });
        return result;
      });
      expect(readonlyText).toContain("DROPPED_MARKER");

      // Both views must be in sync with each other.
      expect(readonlyText).toBe(originatorCMText);
    });
  });

  describe("cursor preservation", function () {
    it("keeps the cursor put when a programmatic edit happens elsewhere", async function () {
      // Enter edit mode on the single leaf.
      await browser.keys(["Meta", "e"]);
      await browser.$(".cm-editor").waitForExist({ timeout: 5_000 });

      // Place the cursor at a known position near the top (inside "Title:").
      const cursorAnchor = 5;
      await browser.executeObsidian(({ app }) => {
        const leaf = app.workspace.activeLeaf;
        const state = (leaf!.view as any).state;
        state.scrollToHere({ start: 5, end: 5 });
      });

      // Fire a programmatic edit that inserts text AFTER the snippets header
      // — i.e., strictly after the cursor. The cursor position should not
      // shift, because the edit range lies beyond it.
      await browser.executeObsidian(({ app }) => {
        const leaf = app.workspace.activeLeaf;
        const view = leaf!.view as any;
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
                "\n\nPROGRAMMATIC_INSERT\n\n===\n\n",
              );
              return;
            }
          }
        }
      });

      // Read the cursor position straight from CodeMirror.
      const cursorAfter = await browser.executeObsidian(({ app }) => {
        const leaf = app.workspace.activeLeaf;
        const cm = (leaf!.view as any).state.cmEditor;
        return cm.state.selection.main.head;
      });

      // Before the refactor: full-doc CM replace resets the selection to
      // position 0. After the refactor: the edit is dispatched as a precise
      // CM change at a later position, so CM's change-mapping leaves the
      // cursor intact.
      expect(cursorAfter).toBe(cursorAnchor);

      // Undo should remove the programmatic insert in a single step.
      await browser.keys(["Meta", "z"]);
      const textAfterUndo = await browser.executeObsidian(({ app }) => {
        const leaf = app.workspace.activeLeaf;
        return (leaf!.view as any).getViewData();
      });
      expect(textAfterUndo).not.toContain("PROGRAMMATIC_INSERT");
    });
  });
});
