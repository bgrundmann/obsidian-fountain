import {
  extractLinks,
  isLinkNote,
  parseLinkContent,
  targetRefersTo,
} from "../src/fountain";
import { parse } from "../src/fountain/parser";

describe("Links", () => {
  describe("Parser", () => {
    it("parses a basic link", () => {
      const script = parse("Action with a [[>act-two]] link.");
      const links = extractLinks(script.script);
      expect(links).toHaveLength(1);
      expect(links[0].noteKind).toBe(">");
      expect(script.sliceDocument(links[0].textRange)).toBe("act-two");
    });

    it("parses a link with display text", () => {
      const script = parse("See [[>act-two|the second act]].");
      const links = extractLinks(script.script);
      expect(links).toHaveLength(1);
      expect(script.sliceDocument(links[0].textRange)).toBe(
        "act-two|the second act",
      );
    });

    it("parses a link with file extension", () => {
      const script = parse("See [[>act-two.fountain]].");
      const links = extractLinks(script.script);
      expect(links).toHaveLength(1);
      expect(script.sliceDocument(links[0].textRange)).toBe("act-two.fountain");
    });

    it("does not confuse `[[>...]]` with notes that begin with `>`-text", () => {
      // `[[>foo]]` -> link kind ">"
      // `[[ >foo]]` (with space) -> regular note with kind "" containing " >foo"
      const linkScript = parse("Hello [[>foo]] world");
      const linkNotes = extractLinks(linkScript.script);
      expect(linkNotes).toHaveLength(1);

      const plainScript = parse("Hello [[ >foo]] world");
      const plainLinks = extractLinks(plainScript.script);
      expect(plainLinks).toHaveLength(0);
    });

    it("parses links inside dialogue", () => {
      const script = parse(
        "JANE\nGo see [[>act-two]] for context.\n",
      );
      const links = extractLinks(script.script);
      expect(links).toHaveLength(1);
    });

    it("parses multiple links", () => {
      const script = parse(
        "See [[>a]] and [[>b|the second]] and [[>c.fountain]].",
      );
      const links = extractLinks(script.script);
      expect(links).toHaveLength(3);
    });

    it("parses links inside synopses", () => {
      const script = parse("= See [[>act-two]] for the next act.\n");
      const links = extractLinks(script.script);
      expect(links).toHaveLength(1);
      expect(script.sliceDocument(links[0].textRange)).toBe("act-two");
    });
  });

  describe("isLinkNote", () => {
    it("returns true for `>` notes", () => {
      const script = parse("[[>foo]]");
      const links = extractLinks(script.script);
      expect(isLinkNote(links[0])).toBe(true);
    });

    it("returns false for plain notes", () => {
      const script = parse("[[a regular note]]");
      const all = script.script;
      // Walk once to find a note
      let found = false;
      for (const el of all) {
        if (el.kind === "action") {
          for (const line of el.lines) {
            for (const tel of line.elements) {
              if (tel.kind === "note") {
                expect(isLinkNote(tel)).toBe(false);
                found = true;
              }
            }
          }
        }
      }
      expect(found).toBe(true);
    });
  });

  describe("parseLinkContent", () => {
    it("returns target with no display text when no pipe", () => {
      expect(parseLinkContent("act-two")).toEqual({
        target: "act-two",
        displayText: null,
      });
    });

    it("trims target whitespace", () => {
      expect(parseLinkContent("  act-two  ")).toEqual({
        target: "act-two",
        displayText: null,
      });
    });

    it("splits on pipe", () => {
      expect(parseLinkContent("act-two|second act")).toEqual({
        target: "act-two",
        displayText: "second act",
      });
    });

    it("preserves display text whitespace", () => {
      expect(parseLinkContent("act-two| second act ")).toEqual({
        target: "act-two",
        displayText: " second act ",
      });
    });

    it("handles empty target", () => {
      expect(parseLinkContent("")).toEqual({
        target: "",
        displayText: null,
      });
    });

    it("handles empty display text", () => {
      expect(parseLinkContent("act-two|")).toEqual({
        target: "act-two",
        displayText: "",
      });
    });
  });

  describe("targetRefersTo", () => {
    it("matches full path", () => {
      expect(targetRefersTo("notes/character.md", "notes/character.md")).toBe(
        true,
      );
    });

    it("matches full path without extension", () => {
      expect(targetRefersTo("notes/character", "notes/character.md")).toBe(
        true,
      );
    });

    it("matches basename", () => {
      expect(targetRefersTo("character.md", "notes/character.md")).toBe(true);
    });

    it("matches basename without extension", () => {
      expect(targetRefersTo("character", "notes/character.md")).toBe(true);
    });

    it("is case insensitive", () => {
      expect(targetRefersTo("Character", "notes/character.md")).toBe(true);
      expect(targetRefersTo("character", "notes/CHARACTER.md")).toBe(true);
    });

    it("strips a leading slash from the target", () => {
      expect(targetRefersTo("/notes/character", "notes/character.md")).toBe(
        true,
      );
    });

    it("does not match a different file", () => {
      expect(targetRefersTo("villain", "notes/character.md")).toBe(false);
      expect(
        targetRefersTo("characters/character", "notes/character.md"),
      ).toBe(false);
    });

    it("preserves a non-md extension on the path", () => {
      // For non-md files, the basename match still holds.
      expect(targetRefersTo("act-two.fountain", "act-two.fountain")).toBe(
        true,
      );
      expect(targetRefersTo("act-two", "act-two.fountain")).toBe(true);
    });
  });

  describe("hideNotes interaction", () => {
    it("keeps link notes when hideNotes is on", () => {
      const script = parse(
        "Action with [[a regular note]] and [[>a-link]] inline.",
      );
      const filtered = script.withHiddenElementsRemoved({ hideNotes: true });
      const links = extractLinks(filtered.script);
      expect(links).toHaveLength(1);
      expect(filtered.sliceDocument(links[0].textRange)).toBe("a-link");

      // The plain note should be gone
      let plainNoteFound = false;
      for (const el of filtered.script) {
        if (el.kind === "action") {
          for (const line of el.lines) {
            for (const tel of line.elements) {
              if (tel.kind === "note" && tel.noteKind !== ">") {
                plainNoteFound = true;
              }
            }
          }
        }
      }
      expect(plainNoteFound).toBe(false);
    });
  });
});
