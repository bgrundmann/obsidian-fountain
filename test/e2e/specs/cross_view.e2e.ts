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

  describe("unsaved typing", function () {
    // Pins the safety property the rename handler will rely on: a
    // programmatic edit on a file that has an open editor must compose on
    // top of the editor's live CM state, not on a (possibly stale) read
    // from disk. If the helper ever read from disk while typed-but-not-
    // yet-saved text only existed in CM, that text would be clobbered.
    it("preserves typed-but-unsaved text when a programmatic edit follows", async function () {
      await browser.keys(["Meta", "e"]);
      await browser.$(".cm-editor").waitForExist({ timeout: 5_000 });

      // Dispatch a CM change directly (simulates the user typing) and then,
      // synchronously in the same Obsidian frame so the debounced save has
      // no chance to flush, run a programmatic edit elsewhere in the file.
      await browser.executeObsidian(({ app }) => {
        const leaf = app.workspace.activeLeaf!;
        const view = leaf.view as any;
        const cm = view.state.cmEditor;
        cm.dispatch({
          changes: { from: 0, to: 0, insert: "TYPED_BEFORE_SAVE\n" },
        });

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

      // The open editor's view of the document carries both edits.
      const cmText = await browser.executeObsidian(({ app }) => {
        const leaf = app.workspace.activeLeaf!;
        return (leaf.view as any).getViewData();
      });
      expect(cmText).toContain("TYPED_BEFORE_SAVE");
      expect(cmText).toContain("PROGRAMMATIC_INSERT");

      // And once the modify call settles, disk matches. If the helper had
      // read from disk for its source of truth, disk would only have
      // PROGRAMMATIC_INSERT (the typed text would have been overwritten).
      await browser.waitUntil(
        async () => {
          const onDisk = await browser.executeObsidian(async ({ app }) => {
            const leaf = app.workspace.activeLeaf!;
            const file = (leaf.view as any).file;
            return await app.vault.read(file);
          });
          return (
            onDisk.includes("TYPED_BEFORE_SAVE") &&
            onDisk.includes("PROGRAMMATIC_INSERT")
          );
        },
        { timeout: 5_000, timeoutMsg: "disk did not pick up both edits" },
      );
    });
  });

  describe("closed-file edits", function () {
    it("edits a fountain file that has no view open", async function () {
      const initial = await browser.executeObsidian(async ({ app }) => {
        const f = app.vault.getAbstractFileByPath("dialogue.fountain");
        return f && "extension" in f
          ? await app.vault.read(f as any)
          : null;
      });
      expect(initial).not.toBeNull();
      expect(initial).not.toContain("CLOSED_FILE_INSERT");

      const initialLeafCount = await browser.executeObsidian(({ app }) => {
        let count = 0;
        app.workspace.iterateAllLeaves((leaf) => {
          const v = leaf.view as any;
          if (
            v.getViewType?.() === "fountain" &&
            v.file?.path === "dialogue.fountain"
          ) {
            count++;
          }
        });
        return count;
      });
      expect(initialLeafCount).toBe(0);

      // Programmatic edit on the closed file via the path-keyed helper.
      await browser.executeObsidian(async ({ app }) => {
        const file = app.vault.getAbstractFileByPath(
          "dialogue.fountain",
        ) as any;
        const text = await app.vault.read(file);
        const insertAt = text.length;
        // biome-ignore lint/suspicious/noExplicitAny: cross-process plugin handle
        const plugin: any = (app as any).plugins.getPlugin("fountain");
        await plugin.applyEditsToFountainFile("dialogue.fountain", [
          {
            range: { start: insertAt, end: insertAt },
            replacement: "\n\nCLOSED_FILE_INSERT\n",
          },
        ]);
      });

      const after = await browser.executeObsidian(async ({ app }) => {
        const f = app.vault.getAbstractFileByPath("dialogue.fountain") as any;
        return await app.vault.read(f);
      });
      expect(after).toContain("CLOSED_FILE_INSERT");

      // The helper must not have opened a view as a side effect.
      const finalLeafCount = await browser.executeObsidian(({ app }) => {
        let count = 0;
        app.workspace.iterateAllLeaves((leaf) => {
          const v = leaf.view as any;
          if (
            v.getViewType?.() === "fountain" &&
            v.file?.path === "dialogue.fountain"
          ) {
            count++;
          }
        });
        return count;
      });
      expect(finalLeafCount).toBe(0);
    });
  });
});
