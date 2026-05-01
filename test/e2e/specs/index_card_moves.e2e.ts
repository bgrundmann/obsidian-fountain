import { browser, expect } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";

/** End-to-end tests for index-card scene drag/drop. The drag is simulated
 *  by dispatching DragEvents with a shared DataTransfer — WebDriver can't
 *  drive HTML5 drag/drop via OS-level mouse events, but the synthetic
 *  events still flow through the actual DOM listeners installed by
 *  `index_cards_view.ts`, so the dragstart, dragover and drop handlers
 *  are all exercised end-to-end. */

const SAME_FILE = "moves_same.fountain";
const SRC_FILE = "moves_src.fountain";
const DST_FILE = "moves_dst.fountain";

const THREE_SCENES = [
  "Title: Move Test",
  "",
  "INT. SCENE A - DAY",
  "",
  "Scene A content.",
  "",
  "INT. SCENE B - DAY",
  "",
  "Scene B content.",
  "",
  "INT. SCENE C - DAY",
  "",
  "Scene C content.",
  "",
].join("\n");

const SRC_TWO_SCENES = [
  "Title: Source",
  "",
  "INT. SOURCE ALPHA - DAY",
  "",
  "Alpha content.",
  "",
  "INT. SOURCE BETA - DAY",
  "",
  "Beta content.",
  "",
].join("\n");

const DST_ONE_SCENE = [
  "Title: Destination",
  "",
  "INT. DEST ONE - DAY",
  "",
  "Dest one content.",
  "",
].join("\n");

async function createFile(path: string, contents: string): Promise<void> {
  await browser.executeObsidian(
    async ({ app }, path: string, contents: string) => {
      const existing = app.vault.getAbstractFileByPath(path);
      if (existing) await app.vault.delete(existing);
      await app.vault.create(path, contents);
    },
    path,
    contents,
  );
}

async function deletePath(path: string): Promise<void> {
  await browser.executeObsidian(async ({ app }, path: string) => {
    const existing = app.vault.getAbstractFileByPath(path);
    if (existing) await app.vault.delete(existing);
  }, path);
}

async function readFile(path: string): Promise<string> {
  return browser.executeObsidian(async ({ app }, path: string) => {
    const f = app.vault.getAbstractFileByPath(path) as any;
    return await app.vault.read(f);
  }, path);
}

/** Switch every open fountain view (or just one, by path) into IndexCards
 *  mode and wait for index-card elements to render. */
async function switchToIndexCards(path?: string): Promise<void> {
  await browser.executeObsidian(({ app }, path?: string) => {
    app.workspace.iterateAllLeaves((leaf) => {
      const v: any = leaf.view;
      if (v.getViewType?.() !== "fountain") return;
      if (path && v.file?.path !== path) return;
      const state = v.state;
      if (state?.pstate?.mode !== "index-cards") {
        state.toggleIndexCards();
      }
    });
  }, path);
  await browser.waitUntil(
    async () => (await browser.$$(".screenplay-index-card")).length > 0,
    { timeout: 5_000, timeoutMsg: "expected index cards to render" },
  );
}

/** Locate the scene structure for a heading-substring within an open
 *  fountain view's parsed script. Returns the scene's range. */
async function findSceneRange(
  path: string,
  headingSubstring: string,
): Promise<{ start: number; end: number }> {
  return browser.executeObsidian(
    ({ app }, path: string, sub: string) => {
      let result: any = null;
      app.workspace.iterateAllLeaves((leaf) => {
        const v: any = leaf.view;
        if (v.getViewType?.() !== "fountain" || v.file?.path !== path) return;
        for (const section of v.getScript().structure().sections) {
          for (const item of section.content) {
            if (item.kind === "scene" && item.scene.heading.includes(sub)) {
              result = { start: item.range.start, end: item.range.end };
            }
          }
        }
      });
      if (!result) throw new Error(`scene not found: ${path} ${sub}`);
      return result;
    },
    path,
    headingSubstring,
  );
}

/** Dispatch dragstart on the source card and dragover/drop on the
 *  destination card with a shared DataTransfer. The `position` argument
 *  drops on the left half (insert before) or right half (insert after) of
 *  the destination card. */
async function simulateDrop(args: {
  srcPath: string;
  srcRange: { start: number; end: number };
  dstPath: string;
  dstRange: { start: number; end: number };
  position: "left" | "right";
}): Promise<void> {
  await browser.executeObsidian(({ app }, args) => {
    const { srcPath, srcRange, dstPath, dstRange, position } = args;

    const findCard = (
      filePath: string,
      range: { start: number; end: number },
    ): HTMLElement | null => {
      let card: HTMLElement | null = null;
      app.workspace.iterateAllLeaves((leaf) => {
        const v: any = leaf.view;
        if (v.getViewType?.() !== "fountain" || v.file?.path !== filePath) {
          return;
        }
        const container: HTMLElement = v.contentEl;
        const candidate = container.querySelector(
          `.screenplay-index-card[data-range="${range.start},${range.end}"]`,
        ) as HTMLElement | null;
        if (candidate) card = candidate;
      });
      return card;
    };

    const src = findCard(srcPath, srcRange);
    const dst = findCard(dstPath, dstRange);
    if (!src) throw new Error(`source card not found: ${srcPath}`);
    if (!dst) throw new Error(`destination card not found: ${dstPath}`);

    const dt = new DataTransfer();
    // Pre-populate so that even if Chromium quirks block setData inside
    // a synthetic dragstart, the data is still present at drop time.
    dt.setData(
      "application/json",
      JSON.stringify({ path: srcPath, range: srcRange }),
    );

    src.dispatchEvent(
      new DragEvent("dragstart", {
        dataTransfer: dt,
        bubbles: true,
        cancelable: true,
      }),
    );

    const rect = dst.getBoundingClientRect();
    const x =
      position === "left"
        ? rect.left + rect.width * 0.1
        : rect.left + rect.width * 0.9;
    const y = rect.top + rect.height / 2;

    dst.dispatchEvent(
      new DragEvent("dragover", {
        dataTransfer: dt,
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
      }),
    );

    dst.dispatchEvent(
      new DragEvent("drop", {
        dataTransfer: dt,
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
      }),
    );
  }, args);
}

describe("Index card scene moves", function () {
  before(async function () {
    await obsidianPage.openFile("test.fountain");
    await browser.$(".screenplay").waitForExist({ timeout: 10_000 });
  });

  afterEach(async function () {
    for (const path of [SAME_FILE, SRC_FILE, DST_FILE]) {
      await deletePath(path);
    }
    await obsidianPage.resetVault();
    // Close every leaf except the first fountain leaf so the next test
    // starts from a known layout.
    await browser.executeObsidian(({ app }) => {
      const leaves: any[] = [];
      app.workspace.iterateAllLeaves((leaf) => {
        if ((leaf.view as any).getViewType?.() === "fountain") {
          leaves.push(leaf);
        }
      });
      for (let i = 1; i < leaves.length; i++) leaves[i].detach();
    });
  });

  it("drag-drops a scene forward within the same file", async function () {
    await createFile(SAME_FILE, THREE_SCENES);
    await obsidianPage.openFile(SAME_FILE);
    await browser.$(".screenplay").waitForExist({ timeout: 5_000 });
    await switchToIndexCards(SAME_FILE);

    const sceneA = await findSceneRange(SAME_FILE, "SCENE A");
    const sceneC = await findSceneRange(SAME_FILE, "SCENE C");

    // Drag SCENE A onto the left half of SCENE C — final order: B, A, C.
    // The bug being guarded against: forward moves applied as two
    // separate vault.modify writes shifted the destination position so
    // SCENE A landed past SCENE C instead of between B and C.
    await simulateDrop({
      srcPath: SAME_FILE,
      srcRange: sceneA,
      dstPath: SAME_FILE,
      dstRange: sceneC,
      position: "left",
    });

    await browser.waitUntil(
      async () => {
        const text = await readFile(SAME_FILE);
        const aIdx = text.indexOf("SCENE A");
        const bIdx = text.indexOf("SCENE B");
        const cIdx = text.indexOf("SCENE C");
        return (
          aIdx !== -1 && bIdx !== -1 && cIdx !== -1 && bIdx < aIdx && aIdx < cIdx
        );
      },
      { timeout: 5_000, timeoutMsg: "scene order on disk did not become B, A, C" },
    );

    const onDisk = await readFile(SAME_FILE);
    expect(onDisk.match(/INT\. SCENE A - DAY/g)?.length).toBe(1);
    expect(onDisk.match(/INT\. SCENE B - DAY/g)?.length).toBe(1);
    expect(onDisk.match(/INT\. SCENE C - DAY/g)?.length).toBe(1);

    const inMemory = await browser.executeObsidian(({ app }) => {
      return (app.workspace.activeLeaf!.view as any).getViewData();
    });
    expect(inMemory).toBe(onDisk);
  });

  it("drag-drops a scene from one open file's index cards into another's", async function () {
    await createFile(SRC_FILE, SRC_TWO_SCENES);
    await createFile(DST_FILE, DST_ONE_SCENE);

    // Put src in the active pane and dst in a split pane so both views
    // render side-by-side (a tab inside the same pane would leave the
    // backgrounded leaf zero-sized and the synthetic drop on it a no-op).
    await browser.executeObsidian(
      async ({ app }, srcPath: string, dstPath: string) => {
        const src = app.vault.getAbstractFileByPath(srcPath) as any;
        const dst = app.vault.getAbstractFileByPath(dstPath) as any;
        await app.workspace.getLeaf(false).openFile(src);
        const dstLeaf = app.workspace.getLeaf("split");
        await dstLeaf.openFile(dst);
      },
      SRC_FILE,
      DST_FILE,
    );

    await browser.waitUntil(
      async () => {
        const opened = await browser.executeObsidian(
          ({ app }, src: string, dst: string) => {
            let count = 0;
            app.workspace.iterateAllLeaves((leaf) => {
              const v = leaf.view as any;
              if (
                v.getViewType?.() === "fountain" &&
                (v.file?.path === src || v.file?.path === dst)
              ) {
                count++;
              }
            });
            return count;
          },
          SRC_FILE,
          DST_FILE,
        );
        return opened === 2;
      },
      { timeout: 5_000, timeoutMsg: "expected both fountain views mounted" },
    );

    await switchToIndexCards();
    await browser.waitUntil(
      async () =>
        (await browser.$$(".screenplay-index-card")).length >=
        // src has 2 scenes, dst has 1 — plus a "+" placeholder per section,
        // but only the data-range cards count here.
        3,
      { timeout: 5_000, timeoutMsg: "expected cards from both views" },
    );

    const alphaRange = await findSceneRange(SRC_FILE, "ALPHA");
    const destOneRange = await findSceneRange(DST_FILE, "DEST ONE");

    // Drag ALPHA from src view onto the left half of DEST ONE in dst view.
    // Final state: src has only BETA; dst has ALPHA, DEST ONE.
    await simulateDrop({
      srcPath: SRC_FILE,
      srcRange: alphaRange,
      dstPath: DST_FILE,
      dstRange: destOneRange,
      position: "left",
    });

    await browser.waitUntil(
      async () => {
        const src = await readFile(SRC_FILE);
        const dst = await readFile(DST_FILE);
        return (
          !src.includes("SOURCE ALPHA") &&
          src.includes("SOURCE BETA") &&
          dst.includes("SOURCE ALPHA") &&
          dst.includes("DEST ONE") &&
          dst.indexOf("SOURCE ALPHA") < dst.indexOf("DEST ONE")
        );
      },
      { timeout: 5_000, timeoutMsg: "cross-file move did not settle on disk" },
    );

    const srcAfter = await readFile(SRC_FILE);
    const dstAfter = await readFile(DST_FILE);
    expect(srcAfter.match(/INT\. SOURCE ALPHA - DAY/g)).toBeNull();
    expect(srcAfter.match(/INT\. SOURCE BETA - DAY/g)?.length).toBe(1);
    expect(dstAfter.match(/INT\. SOURCE ALPHA - DAY/g)?.length).toBe(1);
    expect(dstAfter.match(/INT\. DEST ONE - DAY/g)?.length).toBe(1);

    const memBoth = await browser.executeObsidian(({ app }) => {
      const out: Record<string, string> = {};
      app.workspace.iterateAllLeaves((leaf) => {
        const v = leaf.view as any;
        if (v.getViewType?.() === "fountain" && v.file?.path) {
          out[v.file.path] = v.getViewData();
        }
      });
      return out;
    });
    expect(memBoth[SRC_FILE]).toBe(srcAfter);
    expect(memBoth[DST_FILE]).toBe(dstAfter);
  });
});
