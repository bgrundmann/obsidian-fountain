import { describe, expect, test } from "@jest/globals";
import type { FountainScript } from "../src/fountain";
import { parse } from "../src/fountain_parser";

describe("Snippets position detection", () => {
  test("finds snippets section start position", () => {
    const scriptWithSnippets = `EXT. PARK - DAY

A simple scene.

JOHN
Hello world.

# Snippets

EXT. KITCHEN - DAY

Some reusable kitchen scene.

MARY
Reusable dialogue.`;

    const script: FountainScript = parse(scriptWithSnippets);

    // Find the snippets section
    let snippetsStart: number | null = null;
    for (const element of script.script) {
      if (element.kind === "section") {
        const sectionText = script.sliceDocument(element.range);
        if (sectionText.toLowerCase().includes("snippets")) {
          snippetsStart = element.range.start;
          break;
        }
      }
    }

    expect(snippetsStart).not.toBeNull();

    // Verify the position is correct by checking the text at that position
    const textAtPosition = scriptWithSnippets.substring(
      snippetsStart!,
      snippetsStart! + 10,
    );
    expect(textAtPosition).toBe("# Snippets");
  });

  test("returns null when no snippets section exists", () => {
    const scriptWithoutSnippets = `EXT. PARK - DAY

A simple scene without snippets.

JOHN
Hello world.

# Boneyard

Some boneyard content.`;

    const script: FountainScript = parse(scriptWithoutSnippets);

    // Find the snippets section
    let snippetsStart: number | null = null;
    for (const element of script.script) {
      if (element.kind === "section") {
        const sectionText = script.sliceDocument(element.range);
        if (sectionText.toLowerCase().includes("snippets")) {
          snippetsStart = element.range.start;
          break;
        }
      }
    }

    expect(snippetsStart).toBeNull();
  });

  test("finds snippets section after boneyard", () => {
    const scriptWithBoneyardAndSnippets = `EXT. PARK - DAY

Main scene content.

# Boneyard

This is in the boneyard.

# Snippets

EXT. STORE - DAY

Snippet content here.`;

    const script: FountainScript = parse(scriptWithBoneyardAndSnippets);

    // Find both boneyard and snippets sections
    let boneyardStart: number | null = null;
    let snippetsStart: number | null = null;

    for (const element of script.script) {
      if (element.kind === "section") {
        const sectionText = script.sliceDocument(element.range);
        if (sectionText.toLowerCase().includes("boneyard")) {
          boneyardStart = element.range.start;
        } else if (sectionText.toLowerCase().includes("snippets")) {
          snippetsStart = element.range.start;
        }
      }
    }

    expect(boneyardStart).not.toBeNull();
    expect(snippetsStart).not.toBeNull();
    expect(snippetsStart!).toBeGreaterThan(boneyardStart!);
  });

  test("correctly identifies selection positions relative to snippets section", () => {
    const testScript = `EXT. PARK - DAY

This text is before snippets.

JOHN
This dialogue is also before snippets.

# Snippets

EXT. KITCHEN - DAY

This text is in snippets.`;

    const script: FountainScript = parse(testScript);

    // Find snippets start
    let snippetsStart: number | null = null;
    for (const element of script.script) {
      if (element.kind === "section") {
        const sectionText = script.sliceDocument(element.range);
        if (sectionText.toLowerCase().includes("snippets")) {
          snippetsStart = element.range.start;
          break;
        }
      }
    }

    expect(snippetsStart).not.toBeNull();

    // Test positions
    const beforeSnippetsPosition = testScript.indexOf(
      "This text is before snippets",
    );
    const dialoguePosition = testScript.indexOf(
      "This dialogue is also before snippets",
    );
    const inSnippetsPosition = testScript.indexOf("This text is in snippets");

    expect(beforeSnippetsPosition).toBeLessThan(snippetsStart!);
    expect(dialoguePosition).toBeLessThan(snippetsStart!);
    expect(inSnippetsPosition).toBeGreaterThan(snippetsStart!);
  });

  test("handles case-insensitive snippets section detection", () => {
    const scriptWithUppercaseSnippets = `EXT. PARK - DAY

Main content.

# SNIPPETS

Content in uppercase snippets section.`;

    const script: FountainScript = parse(scriptWithUppercaseSnippets);

    let snippetsStart: number | null = null;
    for (const element of script.script) {
      if (element.kind === "section") {
        const sectionText = script.sliceDocument(element.range);
        if (sectionText.toLowerCase().includes("snippets")) {
          snippetsStart = element.range.start;
          break;
        }
      }
    }

    expect(snippetsStart).not.toBeNull();

    const textAtPosition = scriptWithUppercaseSnippets.substring(
      snippetsStart!,
      snippetsStart! + 11,
    );
    expect(textAtPosition.trim()).toBe("# SNIPPETS");
  });

  test("handles empty snippets section", () => {
    const scriptWithEmptySnippets = `EXT. PARK - DAY

Main content.

# Snippets`;

    const script: FountainScript = parse(scriptWithEmptySnippets);

    let snippetsStart: number | null = null;
    for (const element of script.script) {
      if (element.kind === "section") {
        const sectionText = script.sliceDocument(element.range);
        if (sectionText.toLowerCase().includes("snippets")) {
          snippetsStart = element.range.start;
          break;
        }
      }
    }

    expect(snippetsStart).not.toBeNull();
    expect(snippetsStart).toBe(scriptWithEmptySnippets.indexOf("# Snippets"));
  });
});
