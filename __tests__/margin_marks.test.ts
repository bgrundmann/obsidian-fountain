import { extractMarginMarker, extractNotes } from "../src/fountain";
import { parse } from "../src/fountain_parser";

describe("Margin Marks", () => {
  describe("Parser", () => {
    it("should parse basic margin mark", () => {
      const script = parse("Bene turns over the card. [[@effect]]");
      const notes = extractNotes(script.script);

      expect(notes.length).toBe(1);
      expect(notes[0].noteKind).toBe("@effect");
    });

    it("should parse margin mark with underscore", () => {
      const script = parse("The audience gasps. [[@big_reveal]]");
      const notes = extractNotes(script.script);

      expect(notes.length).toBe(1);
      expect(notes[0].noteKind).toBe("@big_reveal");
    });

    it("should parse margin mark with alphanumeric characters", () => {
      const script = parse("The magician smiles. [[@trick1]]");
      const notes = extractNotes(script.script);

      expect(notes.length).toBe(1);
      expect(notes[0].noteKind).toBe("@trick1");
    });

    it("should parse multiple margin marks in same action", () => {
      const script = parse(
        "The card vanishes [[@effect]] and reappears [[@effect]].",
      );
      const notes = extractNotes(script.script);

      expect(notes.length).toBe(2);
      expect(notes[0].noteKind).toBe("@effect");
      expect(notes[1].noteKind).toBe("@effect");
    });

    it("should parse margin marks alongside regular notes", () => {
      const script = parse(
        "The magician [[this is important]] waves [[@effect]] the wand.",
      );
      const notes = extractNotes(script.script);

      expect(notes.length).toBe(2);
      expect(notes[0].noteKind).toBe("");
      expect(notes[1].noteKind).toBe("@effect");
    });

    it("should parse margin marks alongside other note types", () => {
      const script = parse(
        "The show [[+add this]] has [[@laugh]] moments [[-remove this]].",
      );
      const notes = extractNotes(script.script);

      expect(notes.length).toBe(3);
      expect(notes[0].noteKind).toBe("+");
      expect(notes[1].noteKind).toBe("@laugh");
      expect(notes[2].noteKind).toBe("-");
    });
  });

  describe("extractMarginMarker", () => {
    it("should extract marker word from margin notes", () => {
      const script = parse("Test [[@effect]]");
      const notes = extractNotes(script.script);

      expect(extractMarginMarker(notes[0])).toBe("effect");
    });

    it("should return null for regular notes", () => {
      const script = parse("Test [[regular note]]");
      const notes = extractNotes(script.script);

      expect(extractMarginMarker(notes[0])).toBe(null);
    });

    it("should return null for plus notes", () => {
      const script = parse("Test [[+addition]]");
      const notes = extractNotes(script.script);

      expect(extractMarginMarker(notes[0])).toBe(null);
    });

    it("should return null for minus notes", () => {
      const script = parse("Test [[-deletion]]");
      const notes = extractNotes(script.script);

      expect(extractMarginMarker(notes[0])).toBe(null);
    });

    it("should return null for kind notes", () => {
      const script = parse("Test [[todo: fix this]]");
      const notes = extractNotes(script.script);

      expect(extractMarginMarker(notes[0])).toBe(null);
    });

    it("should return empty string for empty margin marker", () => {
      const script = parse("Test [[@]]");
      const notes = extractNotes(script.script);

      expect(extractMarginMarker(notes[0])).toBe("");
    });
  });

  describe("Margin mark content", () => {
    it("should preserve text after @ symbol", () => {
      const script = parse("Magic happens [[@effect with some text]]");
      const notes = extractNotes(script.script);

      expect(notes[0].noteKind).toBe("@effect");
      // The text after the marker word is part of textRange
      const noteText = script.unsafeExtractRaw(notes[0].textRange);
      expect(noteText).toBe(" with some text");
    });

    it("should handle empty margin mark", () => {
      const script = parse("Test [[@]]");
      const notes = extractNotes(script.script);

      expect(notes.length).toBe(1);
      expect(notes[0].noteKind).toBe("@");
    });
  });

  describe("Use cases", () => {
    it("should handle magic show script example", () => {
      const magicScript = `
FADE IN:

INT. THEATER - NIGHT

The magician approaches the table. [[@effect]]

MAGICIAN
Pick a card, any card.

The spectator selects a card. [[@effect]]

MAGICIAN (CONT'D)
Now watch closely...

The card vanishes! [[@effect]]

The audience gasps. [[@laugh]]
`;
      const script = parse(magicScript);
      const notes = extractNotes(script.script);
      const marginNotes = notes.filter((n) => extractMarginMarker(n) !== null);

      expect(marginNotes.length).toBe(4);
      expect(marginNotes.filter((n) => n.noteKind === "@effect").length).toBe(
        3,
      );
      expect(marginNotes.filter((n) => n.noteKind === "@laugh").length).toBe(1);
    });

    it("should handle comedy script example", () => {
      const comedyScript = `
INT. COMEDY CLUB - NIGHT

The comedian walks on stage. [[@entrance]]

COMEDIAN
So I went to the doctor... [[@setup]]

(beat)

He said I need glasses. [[@punchline]]

The audience laughs. [[@laugh]]
`;
      const script = parse(comedyScript);
      const notes = extractNotes(script.script);
      const marginNotes = notes.filter((n) => extractMarginMarker(n) !== null);

      expect(marginNotes.length).toBe(4);
      expect(new Set(marginNotes.map((n) => n.noteKind))).toEqual(
        new Set(["@entrance", "@setup", "@punchline", "@laugh"]),
      );
    });

    it("should handle technical cues example", () => {
      const techScript = `
The stage goes dark. [[@lights]]

SOUND: Thunder rumbles. [[@sound]]

A spotlight appears. [[@lights]]

Music swells. [[@music]]
`;
      const script = parse(techScript);
      const notes = extractNotes(script.script);
      const marginNotes = notes.filter((n) => extractMarginMarker(n) !== null);

      expect(marginNotes.length).toBe(4);
      expect(marginNotes.filter((n) => n.noteKind === "@lights").length).toBe(
        2,
      );
      expect(marginNotes.filter((n) => n.noteKind === "@sound").length).toBe(1);
      expect(marginNotes.filter((n) => n.noteKind === "@music").length).toBe(1);
    });
  });
});
