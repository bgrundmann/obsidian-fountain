import { browser, expect } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";

/** Ensure we're in readonly mode. */
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

describe("Dialogue rendering", function () {
  before(async function () {
    await obsidianPage.openFile("dialogue.fountain");
    await browser.$(".screenplay").waitForExist({ timeout: 10_000 });
  });

  afterEach(async function () {
    await ensureReadonlyMode();
    await obsidianPage.resetVault();
  });

  describe("reading view", function () {
    it("should render dialogue with character, parenthetical, and lines", async function () {
      // Check that the scene heading is rendered
      const sceneHeading = browser.$(".screenplay .scene-heading");
      await expect(sceneHeading).toBeDisplayed();

      // Check that character names are rendered
      const characters = await browser.$$(".screenplay .dialogue-character");
      expect(characters.length).toBe(2);

      // First character: STEEL with parenthetical
      const steelText = await characters[0].getText();
      expect(steelText).toBe("STEEL");

      // Parenthetical should be rendered
      const parenthetical = browser.$(".screenplay .dialogue-parenthetical");
      await expect(parenthetical).toBeDisplayed();
      const parenText = await parenthetical.getText();
      expect(parenText).toBe("(beer raised)");

      // Dialogue words should be rendered
      const dialogueWords = await browser.$$(".screenplay .dialogue-words");
      expect(dialogueWords.length).toBeGreaterThanOrEqual(2);

      // Second character: BOB without parenthetical
      const bobText = await characters[1].getText();
      expect(bobText).toBe("BOB");
    });
  });

  describe("editor view", function () {
    it("should apply correct syntax highlighting for dialogue", async function () {
      await browser.keys(["Meta", "e"]);
      await browser.$(".cm-editor").waitForExist({ timeout: 5_000 });

      // Check that character names get dialogue-character decoration
      const charDecorations = await browser.$$(
        ".cm-editor .dialogue-character",
      );
      expect(charDecorations.length).toBe(2);

      // Check that parenthetical gets dialogue-parenthetical decoration
      const parenDecorations = await browser.$$(
        ".cm-editor .dialogue-parenthetical",
      );
      expect(parenDecorations.length).toBe(1);

      // Check that dialogue text gets dialogue-words decoration
      const wordsDecorations = await browser.$$(
        ".cm-editor .dialogue-words",
      );
      expect(wordsDecorations.length).toBeGreaterThanOrEqual(1);
    });
  });
});
