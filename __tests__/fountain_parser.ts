import { describe, expect, test } from "@jest/globals";
import type { FountainScript } from "../src/fountain";
import { extractTransitionText } from "../src/fountain";
import { parse } from "../src/fountain_parser";

function test_script(
  label: string,
  input: string,
  expected: Array<Record<string, unknown>>,
): void {
  test(label, () => {
    const script: FountainScript = parse(input, {});
    expect(script.with_source()).toMatchObject(expected);
  });
}

function testTitlePage(
  label: string,
  input: string,
  expected: Array<Record<string, unknown>>,
): void {
  test(label, () => {
    const script: FountainScript = parse(input, {});
    expect(script.titlePage).toMatchObject(expected);
  });
}

describe("title page", () => {
  testTitlePage(
    "Brick and Steel",
    `Title:
	_**BRICK & STEEL**_
	_**FULL RETIRED**_
Credit: Written by
Author: Stu Maschwitz
Source: Story by KTM
Draft date: 1/27/2012
Contact:
	Next Level Productions
	1588 Mission Dr.
	Solvang, CA 93463

`,
    [
      {
        key: "Title",
        values: [
          [
            {
              kind: "underline",
              elements: [
                {
                  kind: "bold",
                  elements: [{ kind: "text", range: { start: 11, end: 24 } }],
                  range: { start: 9, end: 26 },
                },
              ],
              range: { start: 8, end: 27 },
            },
          ],
          [
            {
              kind: "underline",
              elements: [{ kind: "bold", elements: [{ kind: "text" }] }],
            },
          ],
        ],
      },
      {
        key: "Credit",
        values: [[{ kind: "text", range: { start: 56, end: 66 } }]],
      },
      {
        key: "Author",
        values: [[{ kind: "text", range: { start: 75, end: 88 } }]],
      },
      {
        key: "Source",
        values: [[{ kind: "text", range: { start: 97, end: 109 } }]],
      },
      {
        key: "Draft date",
        values: [[{ kind: "text", range: { start: 122, end: 131 } }]],
      },
      {
        key: "Contact",
        values: [
          [{ kind: "text", range: { start: 142, end: 164 } }],
          [{ kind: "text", range: { start: 166, end: 182 } }],
          [{ kind: "text", range: { start: 184, end: 201 } }],
        ],
      },
    ],
  );
  testTitlePage(
    "Big Fish title",
    `Title: Big Fish
Credit: written by
Author: John August
Source: based on the novel by Daniel Wallace
Notes:
	FINAL PRODUCTION DRAFT
	includes post-production dialogue
	and omitted scenes
Copyright: (c) 2003 Columbia Pictures

This is a Southern story, full of lies and fabrications, but truer for their inclusion.`,
    [
      {
        key: "Title",
        values: [[{ kind: "text", range: { start: 7, end: 15 } }]],
      },
      {
        key: "Credit",
        values: [[{ kind: "text", range: { start: 24, end: 34 } }]],
      },
      {
        key: "Author",
        values: [[{ kind: "text", range: { start: 43, end: 54 } }]],
      },
      {
        key: "Source",
        values: [[{ kind: "text", range: { start: 63, end: 99 } }]],
      },
      {
        key: "Notes",
        values: [
          [{ kind: "text", range: { start: 108, end: 130 } }],
          [{ kind: "text", range: { start: 132, end: 165 } }],
          [{ kind: "text", range: { start: 167, end: 185 } }],
        ],
      },
      {
        key: "Copyright",
        values: [[{ kind: "text", range: { start: 197, end: 223 } }]],
      },
    ],
  );
});

describe("Parser tests", () => {
  // range is always the complete element.
  // That is in particular for elements that include a mandatory
  // blank line after the element that line is included in the range.
  test_script("forced scene heading at end of input", ".A SCENE", [
    { kind: "scene", range: { start: 0, end: 8 } },
  ]);
  test_script("empty script is valid", "", []);
  test_script("a blank line is valid", "\n", [
    { kind: "action", lines: [{ elements: [], range: { start: 0, end: 1 } }] },
  ]);
  test_script("forced scene heading + newline at end of input", ".A SCENE\n", [
    { kind: "scene", range: { start: 0, end: 9 } },
  ]);
  test_script(
    "forced scene heading with blank line at end of input",
    ".A SCENE\n\n",
    [{ kind: "scene", range: { start: 0, end: 10 } }],
  );
  test_script("a page break", "A action line\n\n===\nAnother action line", [
    { kind: "action", source: "A action line\n\n" },
    { kind: "page-break", source: "===\n" },
    { kind: "action", source: "Another action line" },
  ]);
  test_script(
    "a page break without a blank line before it",
    "A action line\n===\nAnother action line",
    [
      { kind: "action", source: "A action line\n" },
      { kind: "page-break", source: "===\n" },
      { kind: "action", source: "Another action line" },
    ],
  );
  test_script(
    "a page break after dialogue without blank line",
    "CHARACTER\nThis is some dialogue\n===\nAnother action line",
    [
      { kind: "dialogue", source: "CHARACTER\nThis is some dialogue\n" },
      { kind: "page-break", source: "===\n" },
      { kind: "action", source: "Another action line" },
    ],
  );
  test_script(
    "a page break after dialogue with blank line",
    "CHARACTER\nThis is some dialogue\n\n===\nAnother action line",
    [
      { kind: "dialogue", source: "CHARACTER\nThis is some dialogue\n\n" },
      { kind: "page-break", source: "===\n" },
      { kind: "action", source: "Another action line" },
    ],
  );
  test_script(
    "only a single dot forces a heading",
    `EXT. OLYMPIA CIRCUS - NIGHT

...where the second-rate carnival is parked for the moment in an Alabama field.`,
    [
      { kind: "scene", source: "EXT. OLYMPIA CIRCUS - NIGHT\n\n" },
      {
        kind: "action",
        source:
          "...where the second-rate carnival is parked for the moment in an Alabama field.",
      },
    ],
  );

  // transitions
  test_script("simple transition at end of input", "TO:", [
    { kind: "transition", source: "TO:" },
  ]);
  test_script("simple transition + newline at end of input", "TO:\n", [
    { kind: "transition", source: "TO:\n" },
  ]);
  test_script("simple transition with blank line at end of input", "TO:\n\n", [
    { kind: "transition", source: "TO:\n\n" },
  ]);
  test_script("not a transition if not followed by a blank line", "TO:\nBar", [
    { kind: "dialogue", source: "TO:\nBar" },
  ]);
  test_script(
    "not a transition if not preceded by a blank line",
    "Bar\nTO:\n\n",
    [{ kind: "action", source: "Bar\nTO:\n\n" }],
  );
  test_script(
    "a forced transition that looks like a transition",
    "> THIS IS A FORCED TRANSITION TO:",
    [
      {
        kind: "transition",
        source: "> THIS IS A FORCED TRANSITION TO:",
        forced: true,
      },
    ],
  );
  test_script("a forced transition", "> this is a transition", [
    { kind: "transition", source: "> this is a transition", forced: true },
  ]);

  // Sections are just the line the section is on.
  test_script("section at end of input", "# A section", [
    { kind: "section", range: { start: 0, end: 11 } },
  ]);
  test_script("section + newline at end of input", "# A section\n", [
    { kind: "section", range: { start: 0, end: 12 } },
  ]);
  test_script("section with blank action line afterwards", "# A section\n\n", [
    { kind: "section", range: { start: 0, end: 12 } },
    {
      kind: "action",
      lines: [{ range: { start: 12, end: 13 }, elements: [] }],
      range: { start: 12, end: 13 },
    },
  ]);
  // The range of the action includes the terminating
  // blank line if any.
  // But the blank line is not included in the text
  // of the action.  So the next three examples all
  // have different .range, but the same text.
  test_script("Basic Action at end of input", "This is some action", [
    {
      kind: "action",
      source: "This is some action",
      range: { start: 0, end: 19 },
      lines: [
        {
          range: { start: 0, end: 19 },
          elements: [{ kind: "text", range: { start: 0, end: 19 } }],
          centered: false,
        },
      ],
    },
  ]);
  test_script("simple note", "[[A simple note]]", [
    {
      kind: "action",
      range: { start: 0, end: 17 },
      lines: [
        {
          range: { start: 0, end: 17 },
          centered: false,
          elements: [
            {
              kind: "note",
              noteKind: "",
              range: { start: 0, end: 17 },
            },
          ],
        },
      ],
    },
  ]);
  test_script(
    "notes no longer contain styles",
    "[[+**PLUS**]][[-Minus]][[Todo:A]]",
    [
      {
        kind: "action",
        range: { start: 0, end: 33 },
        lines: [
          {
            range: { start: 0, end: 33 },
            centered: false,
            elements: [
              {
                kind: "note",
                noteKind: "+",
                range: { start: 0, end: 13 },
              },
              {
                kind: "note",
                noteKind: "-",
                range: { start: 13, end: 23 },
              },
              {
                kind: "note",
                noteKind: "todo",
                range: { start: 23, end: 33 },
              },
            ],
          },
        ],
      },
    ],
  );
  test_script("CenteredAction", ">A centered action<", [
    {
      kind: "action",
      source: ">A centered action<",
      range: { start: 0, end: 19 },
      lines: [
        {
          range: { start: 0, end: 19 },
          elements: [{ kind: "text", range: { start: 1, end: 18 } }],
          centered: true,
        },
      ],
    },
  ]);
  test_script(
    "CenteredAction whitespace excluded and indenting allowed",
    " > CS <",
    [
      {
        kind: "action",
        source: " > CS <",
        range: { start: 0, end: 7 },
        lines: [
          {
            range: { start: 0, end: 7 },
            elements: [{ kind: "text", range: { start: 3, end: 5 } }],
            centered: true,
          },
        ],
      },
    ],
  );
  test_script(
    "CenteredActionAndRegularAction",
    ">A centered action<\nFollowed by a regular action",
    [
      {
        kind: "action",
        source: ">A centered action<\nFollowed by a regular action",
        range: { start: 0, end: 48 },
        lines: [
          {
            range: { start: 0, end: 20 },
            elements: [{ kind: "text", range: { start: 1, end: 18 } }],
            centered: true,
          },
          {
            range: { start: 20, end: 48 },
            elements: [{ kind: "text", range: { start: 20, end: 48 } }],
            centered: false,
          },
        ],
      },
    ],
  );

  test_script(
    "Basic Action + newline at end of input",
    "This is some action\n",
    [
      {
        kind: "action",
        source: "This is some action\n",
        range: { start: 0, end: 20 },
        lines: [
          {
            range: { start: 0, end: 20 },
            elements: [{ kind: "text", range: { start: 0, end: 19 } }],
          },
        ],
      },
    ],
  );
  test_script(
    "ForcedAction + newline at end of input",
    "!This is some action\n",
    [
      {
        kind: "action",
        source: "!This is some action\n",
        range: { start: 0, end: 21 },
        lines: [
          {
            range: { start: 0, end: 21 },
            elements: [{ kind: "text", range: { start: 1, end: 20 } }],
          },
        ],
      },
    ],
  );
  test_script(
    "Basic Action followed by blank line",
    "This is some action\n\n",
    [
      {
        kind: "action",
        source: "This is some action\n\n",
        range: { start: 0, end: 21 },
        lines: [
          {
            range: { start: 0, end: 20 },
            elements: [{ kind: "text", range: { start: 0, end: 19 } }],
          },
        ],
      },
    ],
  );
  // However if that is followed by more actions the blank lines
  // in between are part of the text
  test_script(
    "Two actions with a blank line in between",
    "This is some action\n\nWith a blank line",
    [
      {
        kind: "action",
        source: "This is some action\n\nWith a blank line",
        range: { start: 0, end: 38 },
        lines: [
          { range: { start: 0, end: 20 } },
          { range: { start: 20, end: 21 } },
          { range: { start: 21, end: 38 } },
        ],
        // , { range: { start: 20, end: 21 } }
        // , { range: { start: 21, end: 38 } }
        // ]
      },
    ],
  );
  // However if that is followed by more actions the blank lines
  // in between are part of the text
  test_script(
    "Two actions with two blank lines in between",
    "This is some action\n\n\nWith two blank lines",
    [
      {
        kind: "action",
        source: "This is some action\n\n\nWith two blank lines",
        range: { start: 0, end: 42 },
        lines: [
          { range: { start: 0, end: 20 } },
          { range: { start: 20, end: 21 } },
          { range: { start: 21, end: 22 } },
          { range: { start: 22, end: 42 } },
        ],
      },
    ],
  );

  test_script("Empty lines are passed along as action(1)", "\n", [
    { kind: "action", source: "\n" },
  ]);
  test_script("Empty lines are passed along as action(2)", "\n\n", [
    { kind: "action", source: "\n\n" },
  ]);
  test_script("Empty lines are passed along as action(4)", "\n\n\n\n", [
    { kind: "action", source: "\n\n\n\n" },
  ]);

  test_script(
    "Simple Dialog",
    `BOB
This is some text I'm saying
And this is more text I'm saying.

But this is action.`,
    [
      {
        kind: "dialogue",
        source:
          "BOB\nThis is some text I'm saying\nAnd this is more text I'm saying.\n\n",
      },
      { kind: "action", range: { start: 68, end: 87 } },
    ],
  );

  test_script(
    "A action corner case -- uppercase is a character",
    `INT. CASINO - NIGHT

THE DEALER eyes the new player warily.

SCANNING THE AISLES...
Where is that pit boss?

No luck. He has no choice to deal the cards.`,
    [
      { kind: "scene", source: "INT. CASINO - NIGHT\n\n" },
      { kind: "action", source: "THE DEALER eyes the new player warily.\n\n" },
      {
        kind: "dialogue",
        source: "SCANNING THE AISLES...\nWhere is that pit boss?\n\n",
      },
      {
        kind: "action",
        source: "No luck. He has no choice to deal the cards.",
      },
    ],
  );
});

describe("Emphasis in actions", () => {
  test_script(
    "From the spec",
    "From what seems like only INCHES AWAY. _Steel’s face FILLS the *Leupold Mark 4* scope_.",
    [
      {
        kind: "action",
        lines: [
          {
            elements: [
              { kind: "text" },
              {
                kind: "underline",
                elements: [
                  { kind: "text" },
                  { kind: "italics", elements: [{ kind: "text" }] },
                  { kind: "text" },
                ],
              },
              { kind: "text" },
            ],
          },
        ],
      },
    ],
  );
  test_script(
    "Unclosed emphasis is passed along as is",
    "This **is not _closed_, but",
    [
      {
        kind: "action",
        lines: [
          {
            elements: [
              { kind: "text" },
              { kind: "underline", elements: [{ kind: "text" }] },
              { kind: "text" },
            ],
          },
        ],
      },
    ],
  );
});

describe("Synopsis handling", () => {
  test_script("A single line of synopsis", " = A synopsis\n", [
    {
      kind: "synopsis",
      range: { start: 0, end: 14 },
      linesOfText: [{ start: 2, end: 13 }],
    },
  ]);
  test_script(
    "Multiple lines",
    ` = A synopsis
 = Consisting of several lines
= With and without leading spaces`,
    [
      {
        kind: "synopsis",
        range: { start: 0, end: 78 },
        linesOfText: [
          { start: 2, end: 13 },
          { start: 16, end: 44 },
          { start: 46, end: 78 },
        ],
      },
    ],
  );
});

describe("Lyrics handling", () => {
  test("parses single lyrics line", () => {
    const script: FountainScript = parse("~ This is a lyrics line", {});
    expect(script.script).toHaveLength(1);
    expect(script.script[0]).toMatchObject({
      kind: "lyrics",
      lines: [
        {
          centered: false,
          elements: [{ kind: "text" }],
        },
      ],
    });
  });

  test("parses multiple consecutive lyrics lines", () => {
    const script: FountainScript = parse(
      "~ First lyrics line\n~ Second lyrics line\n~ Third lyrics line",
      {},
    );
    expect(script.script).toHaveLength(1);
    expect(script.script[0]).toMatchObject({
      kind: "lyrics",
      lines: [
        {
          centered: false,
          elements: [{ kind: "text" }],
        },
        {
          centered: false,
          elements: [{ kind: "text" }],
        },
        {
          centered: false,
          elements: [{ kind: "text" }],
        },
      ],
    });
  });

  test("parses lyrics with styled text", () => {
    const script: FountainScript = parse(
      "~ This is **bold** and *italic* lyrics",
      {},
    );
    expect(script.script).toHaveLength(1);
    expect(script.script[0]).toMatchObject({
      kind: "lyrics",
      lines: [
        {
          centered: false,
          elements: [
            { kind: "text" },
            { kind: "bold" },
            { kind: "text" },
            { kind: "italics" },
            { kind: "text" },
          ],
        },
      ],
    });
  });

  test("lyrics terminated by blank line", () => {
    const script: FountainScript = parse(
      "~ First lyrics line\n~ Second lyrics line\n\nThis is action",
      {},
    );
    expect(script.script).toHaveLength(2);
    expect(script.script[0]).toMatchObject({
      kind: "lyrics",
      lines: [
        {
          centered: false,
          elements: [{ kind: "text" }],
        },
        {
          centered: false,
          elements: [{ kind: "text" }],
        },
      ],
    });
    expect(script.script[1]).toMatchObject({
      kind: "action",
    });
  });

  test("lyrics with indentation is not a lyrics line", () => {
    const script: FountainScript = parse(
      "  ~   Indented lyrics with spaces  ",
      {},
    );
    expect(script.script).toHaveLength(1);
    expect(script.script[0]).toMatchObject({
      kind: "action",
      lines: [
        {
          centered: false,
          elements: [{ kind: "text" }],
        },
      ],
    });
  });
});

describe("Corner cases from big fish", () => {
  // These are corner cases from big fish we got wrong at some point or the other.
  // josephine was an example of us mistaking ALL UPPERCASE followed by blank line
  // to be dialog instead of action.
  test_script(
    "josephine",
    `CROSSFADE TO:

BRIGHT SUNLIGHT

filters through soft sheets.  We're under the covers, where a man's hand traces the curves of a woman's bare back.   A beat, then she turns over in bed, revealing her to be

JOSEPHINE.

She blinks slowly, just waking up.  Will is watching her.  He's been up for a while.  We are actually...

INT.  WILL AND JOSEPHINE'S ROOM - DAY

...where the couple stays cocooned under the sheets, a kind of limbo.  A kiss good morning.  Legs entangling.  Neither wants to get up.

JOSEPHINE
I talked with your father last night.

WILL
Did you?
`,
    [
      { kind: "transition", source: "CROSSFADE TO:\n\n" },
      {
        kind: "action",
        source: `BRIGHT SUNLIGHT

filters through soft sheets.  We're under the covers, where a man's hand traces the curves of a woman's bare back.   A beat, then she turns over in bed, revealing her to be

JOSEPHINE.

She blinks slowly, just waking up.  Will is watching her.  He's been up for a while.  We are actually...

`,
      },
      { kind: "scene", source: "INT.  WILL AND JOSEPHINE'S ROOM - DAY\n\n" },
      {
        kind: "action",
        source:
          "...where the couple stays cocooned under the sheets, a kind of limbo.  A kiss good morning.  Legs entangling.  Neither wants to get up.\n\n",
      },
      {
        kind: "dialogue",
        source: "JOSEPHINE\nI talked with your father last night.\n\n",
      },
      { kind: "dialogue", source: "WILL\nDid you?\n" },
    ],
  );
});

describe("extractTransitionText utility function", () => {
  test("removes > character for forced transitions", () => {
    const script: FountainScript = parse("> FADE TO BLACK:\n\n", {});
    const transition = script.script[0];

    expect(transition.kind).toBe("transition");
    if (transition.kind === "transition") {
      const result = extractTransitionText(transition, script);
      expect(result).toBe("FADE TO BLACK:");
    }
  });

  test("preserves text for normal transitions", () => {
    const script: FountainScript = parse("FADE TO:\n\n", {});
    const transition = script.script[0];

    expect(transition.kind).toBe("transition");
    if (transition.kind === "transition") {
      const result = extractTransitionText(transition, script);
      expect(result).toBe("FADE TO:");
    }
  });

  test("handles forced transition with extra spaces", () => {
    const script: FountainScript = parse(">   CUT TO:\n\n", {});
    const transition = script.script[0];

    expect(transition.kind).toBe("transition");
    if (transition.kind === "transition") {
      const result = extractTransitionText(transition, script);
      expect(result).toBe("CUT TO:");
    }
  });
});
