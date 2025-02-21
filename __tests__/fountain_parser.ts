import { parse } from '../fountain_parser';
import { FountainElement, FountainScript } from '../fountain';
import {describe, expect, test} from '@jest/globals';


function test_script(label: string, input: string, expected: Array<Record<string, unknown>>): void {
  test(label, () => {
    const script: FountainScript = parse(input, {});
    expect(script.with_source()).toMatchObject(expected);
  });
}

describe("Parser tests", () => {
  // range is always the complete element.
  // That is in particular for elements that include a mandatory
  // blank line after the element that line is included in the range.
  test_script("forced scene heading at end of input", ".A SCENE", [{ kind: 'scene', range: { start: 0, end: 8 }}]);
  test_script("forced scene heading + newline at end of input", ".A SCENE\n", [{ kind: 'scene', range: { start: 0, end: 9 }}]);
  test_script("forced scene heading with blank line at end of input", ".A SCENE\n\n", [{ kind: 'scene', range: { start: 0, end: 10 }}]);

  test_script("only a single dot forces a heading",
    `EXT. OLYMPIA CIRCUS - NIGHT

...where the second-rate carnival is parked for the moment in an Alabama field.`,
    [ { kind: 'scene' , source: "EXT. OLYMPIA CIRCUS - NIGHT\n\n"},
      { kind: 'action', source: "...where the second-rate carnival is parked for the moment in an Alabama field." }
    ]);

  // Sections are just the line the section is on.
  test_script("section at end of input", "# A section", [{ kind: 'section', range: { start: 0, end: 11 }}]);
  test_script("section + newline at end of input", "# A section\n", [{ kind: 'section', range: { start: 0, end: 12 }}]);
  test_script("section with blank action line afterwards",
    "# A section\n\n",
    [{ kind: 'section',
      range: { start: 0, end: 12 }
     },
     { kind: 'action', text:[{kind: 'newline'}],
       range: { start: 12, end: 13 }
     }
    ]);
  // The range of the action includes the terminating
  // blank line if any.
  // But the blank line is not included in the text
  // of the action.  So the next three examples all 
  // have different .range, but the same text.
  test_script("Basic Action at end of input",
    `This is some action`,
    [ { kind: 'action'
      , source: "This is some action"
      , range: { start: 0, end: 19 }
      , text: [ { kind: 'text', range: { start: 0, end: 19 } } ]
      }
    ]);
  test_script("Basic Action + newline at end of input",
    `This is some action\n`,
    [ { kind: 'action'
      , source: "This is some action\n"
      , range: { start: 0, end: 20 }
      , text: [ { kind: 'text', range: { start: 0, end: 19 } } ]
      }
    ]);
  test_script("Basic Action followed by blank line",
    `This is some action\n\n`,
    [ { kind: 'action'
      , source: "This is some action\n\n"
      , range: { start: 0, end: 21 }
      , text: [ { kind: 'text', range: { start: 0, end: 19 } } ]
      }
    ]);
  // However if that is followed by more actions the blank lines
  // in between are part of the text
  test_script("Two actions with a blank line in between",
    `This is some action\n\nWith a blank line`,
    [ { kind: 'action'
      , source: "This is some action\n\nWith a blank line"
      , range: { start: 0, end: 38 }
      , text: [ { kind: 'text', range: { start: 0, end: 19 } }
              , { kind: 'newline', range: { start: 19, end: 20 } }
              , { kind: 'newline', range: { start: 20, end: 21 } }
              , { kind: 'text', range: { start: 21, end: 38 } }
              ]
      }
    ]);
  // However if that is followed by more actions the blank lines
  // in between are part of the text
  test_script("Two actions with two blank lines in between",
    `This is some action\n\n\nWith two blank lines`,
    [ { kind: 'action'
      , source: "This is some action\n\n\nWith two blank lines"
      , range: { start: 0, end: 42 }
      , text: [ { kind: 'text', range: { start: 0, end: 19 } }
              , { kind: 'newline', range: { start: 19, end: 20 } }
              , { kind: 'newline', range: { start: 20, end: 21 } }
              , { kind: 'newline', range: { start: 21, end: 22 } }
              , { kind: 'text', range: { start: 22, end: 42 } }
              ]
      }
    ]);

  test_script("Empty lines are passed along as action(1)",
    "\n"
    , [ { kind: 'action', source: "\n" } ]
      );
  test_script("Empty lines are passed along as action(2)",
    "\n\n"
    , [ { kind: 'action', source: "\n\n" } ]
      );
  test_script("Empty lines are passed along as action(4)",
    "\n\n\n\n"
    , [ { kind: 'action', source: "\n\n\n\n" } 
      ] );

  test_script("Simple Dialog",
    `BOB
This is some text I'm saying
And this is more text I'm saying.

But this is action.`,
    [ { kind: 'dialogue', source: "BOB\nThis is some text I'm saying\nAnd this is more text I'm saying.\n\n"},
      { kind: 'action', range: { start: 68, end: 87 }}
    ]);
    
  test_script("A action corner case -- uppercase is a character",
    `INT. CASINO - NIGHT

THE DEALER eyes the new player warily.

SCANNING THE AISLES...
Where is that pit boss?

No luck. He has no choice to deal the cards.`,
    [ { kind: 'scene', source: "INT. CASINO - NIGHT\n\n"}
    , { kind: 'action', source: "THE DEALER eyes the new player warily.\n\n" }
    , { kind: 'dialogue', source: "SCANNING THE AISLES...\nWhere is that pit boss?\n\n"}
    , { kind: 'action', source:"No luck. He has no choice to deal the cards."}
    ]
    );
});
