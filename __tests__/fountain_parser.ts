import { parse } from '../fountain_parser';
import { FountainScript } from '../fountain';
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

  // transitions
  test_script("simple transition at end of input", "TO:", [{kind: 'transition', source:"TO:"}]);
  test_script("simple transition + newline at end of input", "TO:\n", [{kind: 'transition', source:"TO:\n"}]);
  test_script("simple transition with blank line at end of input", "TO:\n\n", [{kind: 'transition', source:"TO:\n\n"}]);
  test_script("not a transition if not followed by a blank line", "TO:\nBar", [{kind: 'dialogue', source:"TO:\nBar"}]);
  test_script("not a transition if not preceded by a blank line", "Bar\nTO:\n\n", [{kind: 'action', source:"Bar\nTO:\n\n"}]);

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

describe("Emphasis in actions", () => {
  test_script('From the spec', "From what seems like only INCHES AWAY. _Steel’s face FILLS the *Leupold Mark 4* scope_.",
    [ { kind: 'action', text: [
        {kind:'text'},
        {kind:'underline', elements:[
          {kind:'text'},
          {kind:'italics', elements:[{kind:'text'}
          ]},
          {kind:'text'}
        ]},
        {kind:'text'}]
      }]
  );
  test_script("Unclosed emphasis is passed along as is", "This **is not _closed_, but",
      [ { kind: 'action', text: [
            {kind:'text'},
            {kind:'underline', elements:[{kind:'text'}]},
            {kind:'text'}
        ] }
      ]
  )
})

describe("Corner cases from big fish", () => {
  // These are corner cases from big fish we got wrong at some point or the other.
  // josephine was an example of us mistaking ALL UPPERCASE followed by blank line
  // to be dialog instead of action.
  test_script('josephine', 
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
`, [ { kind: 'transition', source: 'CROSSFADE TO:\n\n' }
   , { kind: 'action', source: `BRIGHT SUNLIGHT

filters through soft sheets.  We're under the covers, where a man's hand traces the curves of a woman's bare back.   A beat, then she turns over in bed, revealing her to be 

JOSEPHINE.

She blinks slowly, just waking up.  Will is watching her.  He's been up for a while.  We are actually...

` }
  , { kind: 'scene', source: "INT.  WILL AND JOSEPHINE'S ROOM - DAY\n\n" }
  , { kind: 'action', source: "...where the couple stays cocooned under the sheets, a kind of limbo.  A kiss good morning.  Legs entangling.  Neither wants to get up.\n\n" }
  , { kind: 'dialogue', source: "JOSEPHINE\nI talked with your father last night.\n\n" }
  , { kind: 'dialogue', source: "WILL\nDid you?\n" }
   ]
  );
  
})
