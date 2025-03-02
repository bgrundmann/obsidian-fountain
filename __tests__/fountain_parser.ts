import { describe, expect, test } from "@jest/globals";
import type { FountainScript } from "../fountain";
import { parse } from "../fountain_parser";

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
    expect(script.titlePageWithHtmlValues()).toMatchObject(expected);
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
        htmlValues: [
          `<span class="underline"><span class="bold">BRICK &amp; STEEL</span></span>`,
          `<span class="underline"><span class="bold">FULL RETIRED</span></span>`,
        ],
      },
      { key: "Credit", htmlValues: ["Written by"] },
      { key: "Author", htmlValues: ["Stu Maschwitz"] },
      { key: "Source", htmlValues: ["Story by KTM"] },
      { key: "Draft date", htmlValues: ["1/27/2012"] },
      {
        key: "Contact",
        htmlValues: [
          "Next Level Productions",
          "1588 Mission Dr.",
          "Solvang, CA 93463",
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
      { key: "Title", htmlValues: ["Big Fish"] },
      { key: "Credit", htmlValues: ["written by"] },
      { key: "Author", htmlValues: ["John August"] },
      { key: "Source", htmlValues: ["based on the novel by Daniel Wallace"] },
      {
        key: "Notes",
        htmlValues: [
          "FINAL PRODUCTION DRAFT",
          "includes post-production dialogue ",
          "and omitted scenes",
        ],
      },
      { key: "Copyright", htmlValues: ["(c) 2003 Columbia Pictures"] },
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
  test_script("forced scene heading + newline at end of input", ".A SCENE\n", [
    { kind: "scene", range: { start: 0, end: 9 } },
  ]);
  test_script(
    "forced scene heading with blank line at end of input",
    ".A SCENE\n\n",
    [{ kind: "scene", range: { start: 0, end: 10 } }],
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
  test_script("Basic Action at end of input", `This is some action`, [
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
              elements: [{ kind: "text", range: { start: 2, end: 15 } }],
            },
          ],
        },
      ],
    },
  ]);
  test_script("notes contain styles", "[[+**PLUS**]][[-Minus]]", [
    {
      kind: "action",
      range: { start: 0, end: 23 },
      lines: [
        {
          range: { start: 0, end: 23 },
          centered: false,
          elements: [
            {
              kind: "note",
              noteKind: "+",
              range: { start: 0, end: 13 },
              elements: [
                {
                  kind: "bold",
                  range: { start: 3, end: 11 },
                  elements: [{ kind: "text", range: { start: 5, end: 9 } }],
                },
              ],
            },
            {
              kind: "note",
              noteKind: "-",
              range: { start: 13, end: 23 },
              elements: [{ kind: "text", range: { start: 16, end: 21 } }],
            },
          ],
        },
      ],
    },
  ]);
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
    `This is some action\n`,
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
    `!This is some action\n`,
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
    `This is some action\n\n`,
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
    `This is some action\n\nWith a blank line`,
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
    `This is some action\n\n\nWith two blank lines`,
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
