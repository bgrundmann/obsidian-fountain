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
    , { kind: 'action', source: "THE DEALER eyes the new player warily." }
    , { kind: 'dialogue', source: "SCANNING THE AISLES...\nWhere is that pit boss?\n"}
    , { kind: 'action'}
    ]
    );
});
