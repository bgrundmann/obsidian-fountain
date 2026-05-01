import { browser, expect } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";

describe("Links", function () {
  before(async function () {
    await obsidianPage.openFile("test.fountain");
    await browser.$(".screenplay").waitForExist({ timeout: 10_000 });
  });

  afterEach(async function () {
    await obsidianPage.resetVault();
  });

  describe("rename rewriting", function () {
    it("rewrites `[[>target]]` notes when the target file is renamed", async function () {
      // 1. Create the link target and a fountain file that references it.
      //    Both files must exist before we rename, so the index resolves
      //    `character` -> `character.md` and records the back-pointer.
      await browser.executeObsidian(async ({ app }) => {
        // Clean up if a previous run left these files behind.
        for (const path of ["character.md", "script.fountain", "hero.md"]) {
          const existing = app.vault.getAbstractFileByPath(path);
          if (existing) await app.vault.delete(existing);
        }
        await app.vault.create("character.md", "# Character");
        await app.vault.create(
          "script.fountain",
          "INT. ROOM - DAY\n\nThe hero enters. [[>character]]\n",
        );
      });

      // 2. Wait for the link index to pick up the new files. The plugin
      //    debounces `create` events with a ~250ms trailing-edge timer,
      //    then reads each fountain file asynchronously to populate the
      //    target -> source map.
      await browser.pause(800);

      // 3. Rename the target file via Obsidian's FileManager (the same
      //    entry point Obsidian uses internally; it also triggers the
      //    `vault.rename` event we listen for).
      await browser.executeObsidian(async ({ app }) => {
        const target = app.vault.getAbstractFileByPath("character.md");
        if (!target) {
          throw new Error("character.md missing before rename");
        }
        await app.fileManager.renameFile(target, "hero.md");
      });

      // 4. Wait for our rename handler to read the source, compute edits,
      //    and write them back through the edit pipeline.
      await browser.waitUntil(
        async () => {
          const text = await browser.executeObsidian(async ({ app }) => {
            const f = app.vault.getAbstractFileByPath("script.fountain");
            if (!f || !("stat" in f)) return null;
            return app.vault.read(f as any);
          });
          return typeof text === "string" && text.includes("[[>hero]]");
        },
        { timeout: 5_000, timeoutMsg: "link was not rewritten after rename" },
      );

      // 5. Verify the rewrite preserved everything else.
      const finalText = await browser.executeObsidian(async ({ app }) => {
        const f = app.vault.getAbstractFileByPath("script.fountain");
        if (!f || !("stat" in f)) return null;
        return app.vault.read(f as any);
      });
      expect(finalText).toBe(
        "INT. ROOM - DAY\n\nThe hero enters. [[>hero]]\n",
      );
    });
  });

  describe("navigation", function () {
    it("clicking back after following a link returns to the source file (single-leaf scenario)", async function () {
      // Reproduces the user-reported scenario: with one fountain file X
      // open, the user clicks file Y in the file explorer, then in Y
      // clicks a `[[>Z]]` link, then hits back. Expected: Y. Buggy
      // behavior: lands on X (Y was never pushed to history).
      await browser.executeObsidian(async ({ app }) => {
        for (const path of [
          "X.fountain",
          "Y.fountain",
          "Z.md",
        ]) {
          const existing = app.vault.getAbstractFileByPath(path);
          if (existing) await app.vault.delete(existing);
        }
        await app.vault.create("X.fountain", "INT. X - DAY\n\nFile X.\n");
        await app.vault.create(
          "Y.fountain",
          "INT. Y - DAY\n\nFile Y. [[>Z]]\n",
        );
        await app.vault.create("Z.md", "# File Z");
      });

      // Step 1: open X in the active leaf.
      await obsidianPage.openFile("X.fountain");
      await browser.$(".screenplay").waitForExist({ timeout: 5_000 });
      const leafId = await browser.executeObsidian(({ app }) => {
        return (app.workspace.activeLeaf as any)?.id ?? null;
      });

      // Step 2: navigate the same leaf to Y (mirrors clicking Y in the
      //          file explorer).
      await browser.executeObsidian(async ({ app }) => {
        const y = app.vault.getAbstractFileByPath("Y.fountain");
        if (y) await app.workspace.activeLeaf!.openFile(y as any);
      });
      await browser.waitUntil(
        async () => {
          const path = await browser.executeObsidian(({ app }) => {
            return (app.workspace.activeLeaf?.view as any)?.file?.path ?? null;
          });
          return path === "Y.fountain";
        },
        { timeout: 5_000, timeoutMsg: "did not navigate to Y.fountain" },
      );

      // Step 3: click the rendered link in Y.
      const link = await browser.$(".fountain-link");
      await link.waitForExist({ timeout: 5_000 });
      await link.click();
      await browser.waitUntil(
        async () => {
          const path = await browser.executeObsidian(({ app }) => {
            return (app.workspace.activeLeaf?.view as any)?.file?.path ?? null;
          });
          return path === "Z.md";
        },
        { timeout: 5_000, timeoutMsg: "click did not navigate to Z.md" },
      );

      // Step 4: hit back — expect Y, not X.
      await browser.executeObsidian(({ app }) => {
        (app as any).commands.executeCommandById("app:go-back");
      });
      await browser.pause(200);
      const after = await browser.executeObsidian(({ app }) => {
        const leaf = app.workspace.activeLeaf;
        return {
          leafId: (leaf as any)?.id ?? null,
          path: (leaf?.view as any)?.file?.path ?? null,
        };
      });
      expect(after.path).toBe("Y.fountain");
      expect(after.leafId).toBe(leafId);
    });

    it("opens the link in the source's own leaf so back goes to the source", async function () {
      // Repro for the user-reported back-button bug: when the link target
      // is *already* open in another leaf, `openLinkText(..., false)`
      // switches to that other leaf and never pushes the source file
      // onto any history — so hitting back returns whatever was last
      // shown in that other leaf, not the fountain file the user clicked
      // from.
      //
      // 1. Create the target plus two fountain files, where the second
      //    one contains the link.
      await browser.executeObsidian(async ({ app }) => {
        for (const path of [
          "target-note.md",
          "decoy.fountain",
          "linker.fountain",
        ]) {
          const existing = app.vault.getAbstractFileByPath(path);
          if (existing) await app.vault.delete(existing);
        }
        await app.vault.create("target-note.md", "# Target");
        await app.vault.create("decoy.fountain", "INT. DECOY - DAY\n\nDecoy.\n");
        await app.vault.create(
          "linker.fountain",
          "INT. ROOM - DAY\n\nThe hero enters. [[>target-note]]\n",
        );
      });

      // 2. Build the layout:
      //      - Leaf B: shows linker.fountain (the source — the user
      //        clicked the link in this leaf's DOM).
      //      - Leaf A (active): shows target-note.md (with decoy.fountain
      //        as its previous history entry).
      //    With Leaf A active at click time and the active-leaf-routed
      //    `openLinkText`, clicking the link replays inside Leaf A, which
      //    then back-navigates to decoy.fountain instead of the fountain
      //    file the user was actually viewing.
      const ids = await browser.executeObsidian(async ({ app }) => {
        const linker = app.vault.getAbstractFileByPath("linker.fountain");
        const decoy = app.vault.getAbstractFileByPath("decoy.fountain");
        const target = app.vault.getAbstractFileByPath("target-note.md");
        // Leaf B — the source leaf — opens linker.fountain.
        const leafB = app.workspace.getLeaf(false);
        if (linker) await leafB.openFile(linker as any);
        // Leaf A — the "decoy" leaf — splits off, gets decoy then target,
        // and is left active.
        const leafA = app.workspace.getLeaf("split");
        if (decoy) await leafA.openFile(decoy as any);
        if (target) await leafA.openFile(target as any);
        app.workspace.setActiveLeaf(leafA, { focus: true });
        return {
          source: (leafB as any).id ?? null,
          decoy: (leafA as any).id ?? null,
        };
      });
      const sourceLeafId = ids.source;
      await browser.$(".screenplay").waitForExist({ timeout: 5_000 });

      // 3. Click the fountain-link. We dispatch the click programmatically
      //    on the rendered `<a>` so the user-facing behavior is exercised
      //    end-to-end (the click handler installed by readonly_view_state).
      const link = await browser.$(".fountain-link");
      await link.waitForExist({ timeout: 5_000 });
      await link.click();

      // 4. Wait until something — either the source leaf or the sibling
      //    leaf — is now showing target-note.md, which is what makes the
      //    bug observable: with `openLinkText`, the sibling steals focus.
      await browser.waitUntil(
        async () => {
          const path = await browser.executeObsidian(({ app }) => {
            const leaf = app.workspace.activeLeaf;
            const file = (leaf?.view as any)?.file;
            return file?.path ?? null;
          });
          return path === "target-note.md";
        },
        {
          timeout: 5_000,
          timeoutMsg: "click did not navigate to target-note.md",
        },
      );

      // 5. Trigger Obsidian's back command. The user's expectation is
      //    that back returns to the fountain file they clicked from.
      //    Before the fix, openLinkText switched to the sibling leaf,
      //    so back fired in the sibling leaf and went to `decoy.fountain`
      //    instead.
      await browser.executeObsidian(({ app }) => {
        (app as any).commands.executeCommandById("app:go-back");
      });
      await browser.pause(200);
      const afterBack = await browser.executeObsidian(({ app }) => {
        const leaf = app.workspace.activeLeaf;
        return {
          leafId: (leaf as any)?.id ?? null,
          path: (leaf?.view as any)?.file?.path ?? null,
        };
      });
      expect(afterBack.path).toBe("linker.fountain");
      expect(afterBack.leafId).toBe(sourceLeafId);
    });
  });
});
