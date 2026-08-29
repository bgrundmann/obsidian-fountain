import { browser, expect } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";

// Reproduces issue #36: with the same file open in two panes (one editor,
// one readonly/index-cards), typing in the editor gets clobbered when the
// sibling pane processes the editor's autosave.
//
// Mechanism: TextFileView's debounced save snapshots the doc and writes it
// via vault.modify. The sibling pane (not mid-save, so not skipped by
// Obsidian) reloads and receives setViewData with that snapshot — which is
// stale by whatever was typed during the write window. FountainView's
// setViewData then fans the stale script out to ALL views on the path,
// full-replacing the active editor's CM doc: the newest keystrokes are
// rolled back and the cursor jumps to the top of the file.
//
// This spec runs in its own file on purpose: it must not share an Obsidian
// session with other tests, whose pending 2s debounced autosaves can fire
// mid-test and mask the data loss by rewriting fresher content to disk.
describe("two-pane autosave (issue #36)", function () {
  before(async function () {
    await obsidianPage.openFile("test.fountain");
    await browser.$(".screenplay").waitForExist({ timeout: 10_000 });
  });

  after(async function () {
    await obsidianPage.resetVault();
  });

  it("does not clobber the editor when a sibling pane reloads an autosave", async function () {
    // Second leaf on the same file: the original leaf stays readonly (the
    // sibling — same mechanism as the index-cards pane in the issue), the
    // new active leaf goes into edit mode for typing.
    await browser.executeObsidian(async ({ app }) => {
      const activeLeaf = app.workspace.activeLeaf;
      if (!activeLeaf) throw new Error("no active leaf");
      const file = (activeLeaf.view as any).file;
      if (!file) throw new Error("no file on active leaf");
      const newLeaf = app.workspace.getLeaf("split");
      await newLeaf.openFile(file);
    });
    await browser.waitUntil(
      async () => (await browser.$$(".screenplay")).length === 2,
      { timeout: 5_000, timeoutMsg: "expected two readonly views" },
    );
    await browser.keys(["Meta", "e"]);
    await browser.$(".cm-editor").waitForExist({ timeout: 5_000 });

    // Deterministic version of the race: TextFileView.save() snapshots
    // getViewData() synchronously before its first await, so typing burst
    // two right after calling save() is guaranteed to land inside the
    // write window. The sibling pane's reload then delivers a snapshot
    // that is stale by burst two.
    const typed = await browser.executeObsidian(async ({ app }) => {
      const view = app.workspace.activeLeaf!.view as any;
      const cm = view.state.cmEditor;
      cm.dispatch({
        changes: { from: 0, to: 0, insert: "BURST_ONE\n" },
      });
      const savePromise = view.save();
      const pos = "BURST_ONE\n".length;
      cm.dispatch({
        changes: { from: pos, to: pos, insert: "BURST_TWO\n" },
        selection: { anchor: pos + "BURST_TWO\n".length },
      });
      // Captured synchronously, before the save (and the sibling's reload
      // it triggers) can settle.
      const docAfterTyping = cm.state.doc.toString();
      const cursorAfterTyping = cm.state.selection.main.head;
      await savePromise;
      return { docAfterTyping, cursorAfterTyping };
    });
    const expectedCursor = "BURST_ONE\nBURST_TWO\n".length;
    expect(typed.docAfterTyping).toContain("BURST_TWO");
    expect(typed.cursorAfterTyping).toBe(expectedCursor);

    // Wait until the sibling readonly pane has processed the reload: its
    // TextFileView base `data` mirror picks up the save snapshot.
    await browser.waitUntil(
      async () => {
        return await browser.executeObsidian(({ app }) => {
          let processed = false;
          app.workspace.iterateAllLeaves((leaf) => {
            const v = leaf.view as any;
            if (v.getViewType?.() === "fountain" && !v.isEditMode()) {
              processed =
                typeof v.data === "string" && v.data.includes("BURST_ONE");
            }
          });
          return processed;
        });
      },
      { timeout: 5_000, timeoutMsg: "sibling pane never processed the save" },
    );

    // The editor must still hold everything typed, with the cursor where
    // typing left it. With the fan-out bug, the sibling pushes the stale
    // snapshot back into the editor: BURST_TWO is rolled back and the
    // cursor jumps to 0.
    const after = await browser.executeObsidian(({ app }) => {
      const view = app.workspace.activeLeaf!.view as any;
      const cm = view.state.cmEditor;
      return {
        doc: cm.state.doc.toString(),
        cursor: cm.state.selection.main.head,
      };
    });
    expect(after.doc).toContain("BURST_TWO");
    expect(after.cursor).toBe(expectedCursor);

    // Data integrity: the typed text must eventually reach disk (the
    // pending debounced autosave flushes it). With the bug it never can —
    // the text no longer exists anywhere.
    await browser.waitUntil(
      async () => {
        const onDisk = await browser.executeObsidian(async ({ app }) => {
          const leaf = app.workspace.activeLeaf!;
          const file = (leaf.view as any).file;
          return await app.vault.read(file);
        });
        return onDisk.includes("BURST_TWO");
      },
      { timeout: 5_000, timeoutMsg: "typed text never reached disk" },
    );
  });
});
