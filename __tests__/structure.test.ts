import { describe, expect, test } from "@jest/globals";
import type { FountainScript } from "../src/fountain";
import { parse } from "../src/fountain_parser";

// Brick & Steel sample script content
const BRICK_AND_STEEL = `Title:
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

EXT. BRICK'S PATIO - DAY

A gorgeous day.  The sun is shining.  But BRICK BRADDOCK, retired police detective, is sitting quietly, contemplating -- something!

The SCREEN DOOR slides open and DICK STEEL, his former partner and fellow retiree, emerges with two cold beers.

STEEL
Beer's ready!

BRICK
Are they cold?

STEEL
Does a bear crap in the woods?

Steel sits.  They laugh at the dumb joke.

STEEL
(beer raised)
To retirement.

BRICK
To retirement.

They drink long and well from the beers.

And then there's a long beat.
Longer than is funny.
Long enough to be depressing.

The men look at each other.

STEEL
Screw retirement.

BRICK ^
Screw retirement.

STEEL
Screw retirement.

BRICK
(passionate)
Screw retirement!

STEEL
(even more passionate)
Screw retirement!

Suddenly, a roaring sound comes from the sky.  They look up.

EXT. ROOFTOPS - DAY

The camera swooshes past rooftops.

EXT. CONSTRUCTION SITE - DAY

A BULLDOZER is ramming a BRICK HOUSE, ramming it hard.

The FOREMAN wipes his sweaty brow, stands at his CLIPBOARD.

FOREMAN
(shouting over noise)
That's it!  This old-timer has got to go!

The camera smashes through the brick wall and --

INT. BEDROOM - NIGHT

JACK wakes up in bed.  It was all a dream!

He looks around the moonlit room.  Then lays back down.

But the rumbling sound continues...

INT. GARAGE - NIGHT

In the garage, a MUSCLE CAR sits, rumbling loudly.

TOMMY enters and checks the engine.

TOMMY
She's purrfect.

The garage door OPENS.  BRICK and STEEL are standing there, silhouetted by street light.

BRICK
Hey kid.

Tommy spins around.

TOMMY
I thought you guys were retired.

STEEL
Retirement doesn't suit us.

BRICK
We got a job for you.

TOMMY
What kind of job?

BRICK
The kind that pays.

STEEL
The kind that matters.

BRICK
The kind that's going to get us all killed.

CUT TO:

EXT. PIER - NIGHT

The three men stand on the pier, looking out at the dark water.

TOMMY
This is crazy.

STEEL
Crazy like a fox.

BRICK
Crazy like a fox who's seen too much and can't let go.

A SPEEDBOAT approaches in the distance.

TOMMY
Here they come.

The speedboat pulls up to the pier.  THREE THUGS get out.

THUG #1
You got our money?

BRICK
You got our merchandise?

THUG #1
Maybe we do, maybe we don't.

STEEL
Cut the crap.

Suddenly, GUNSHOTS ring out from the darkness!

Everyone dives for cover.

BRICK
(shouting)
It's a setup!

More GUNSHOTS.  The thugs start shooting back.

STEEL
Tommy!  Get to the car!

Tommy runs toward the muscle car.

INT. MUSCLE CAR - NIGHT

Tommy starts the engine.  It ROARS to life.

EXT. PIER - NIGHT

Brick and Steel are pinned down behind some crates.

BRICK
We need to get out of here!

STEEL
On three!

BRICK
One!

STEEL
Two!

BRICK & STEEL
(together)
Three!

They leap up and run toward the car, firing their guns.

The thugs chase after them.

INT. MUSCLE CAR - NIGHT

Brick and Steel dive into the car.

TOMMY
Go, go, go!

The car PEELS OUT, leaving rubber on the pier.

EXT. STREET - NIGHT

The muscle car races down the empty street.

Behind them, a BLACK SUV gives chase.

STEEL
They're gaining on us!

BRICK
Take the bridge!

The car heads toward a DRAWBRIDGE that's starting to open.

TOMMY
The bridge is opening!

BRICK
Gun it!

Tommy floors the accelerator.  The car FLIES over the opening drawbridge...

And lands safely on the other side.

The SUV tries to follow but CRASHES into the water below.

EXT. SAFE HOUSE - DAWN

The muscle car pulls up to a small house.

The three men get out, exhausted but alive.

STEEL
That was close.

BRICK
Too close.

TOMMY
What now?

BRICK
Now we disappear.

STEEL
For good this time.

They walk toward the house as the sun rises.

FADE OUT.

THE END`;

describe("FountainScript structure", () => {
  test("returns correct structure shape with empty snippets for current feature set", () => {
    const script: FountainScript = parse(BRICK_AND_STEEL, {});
    const structure = script.structure();

    // Test basic structure shape
    expect(structure).toHaveProperty("sections");
    expect(structure).toHaveProperty("snippets");

    // Snippets should be empty array for current feature set
    expect(structure.snippets).toEqual([]);

    // Sections should be an array with content
    expect(Array.isArray(structure.sections)).toBe(true);
    expect(structure.sections.length).toBeGreaterThan(0);
  });

  test("parses Brick & Steel script with expected scene count", () => {
    const script: FountainScript = parse(BRICK_AND_STEEL, {});
    const structure = script.structure();

    // Count scenes across all sections
    let sceneCount = 0;
    expect(structure.sections.length).toBe(1);
    for (const content of structure.sections[0].content) {
      if (content.kind === "scene" && content.scene) {
        sceneCount++;
      }
    }

    // Brick & Steel has multiple scene headings
    expect(sceneCount).toBe(11);
  });

  test("structure sections contain expected properties", () => {
    const script: FountainScript = parse(BRICK_AND_STEEL, {});
    const structure = script.structure();

    // Each section should have the expected shape
    for (const section of structure.sections) {
      expect(section).toHaveProperty("kind", "section");
      expect(section).toHaveProperty("content");
      expect(Array.isArray(section.content)).toBe(true);

      // Each content item should be a scene or section structure
      for (const content of section.content) {
        expect(content).toHaveProperty("content");
        expect(Array.isArray(content.content)).toBe(true);
        expect(content).toHaveProperty("kind");
        // May or may not have scene and synopsis properties
      }
    }
  });

  test("contains dialogue and action elements in scenes", () => {
    const script: FountainScript = parse(BRICK_AND_STEEL, {});
    const structure = script.structure();

    let hasDialogue = false;
    let hasAction = false;

    // Look through all content to find dialogue and action
    for (const section of structure.sections) {
      for (const content of section.content) {
        for (const element of content.content) {
          if (element.kind === "dialogue") {
            hasDialogue = true;
          }
          if (element.kind === "action") {
            hasAction = true;
          }
        }
      }
    }

    expect(hasDialogue).toBe(true);
    expect(hasAction).toBe(true);
  });

  test("exact structure output for simple script", () => {
    const simpleScript = `EXT. PARK - DAY

A simple scene.

JOHN
Hello world.

JANE
Hi there!

More action here.`;

    const script: FountainScript = parse(simpleScript, {});
    const structure = script.structure();

    // This is an expect test - exact structure verification
    const expected = {
      sections: [
        {
          kind: "section",
          content: [
            {
              scene: {
                kind: "scene",
                range: {
                  start: 0,
                  end: 17,
                },
              },
              content: [
                {
                  kind: "action",
                  range: {
                    start: 17,
                    end: 34,
                  },
                  lines: [
                    {
                      range: {
                        start: 17,
                        end: 33,
                      },
                      centered: false,
                      elements: [
                        {
                          kind: "text",
                          range: {
                            start: 17,
                            end: 32,
                          },
                        },
                      ],
                    },
                  ],
                },
                {
                  range: {
                    start: 34,
                    end: 53,
                  },
                  kind: "dialogue",
                  characterRange: {
                    start: 34,
                    end: 38,
                  },
                  characterExtensionsRange: {
                    start: 38,
                    end: 38,
                  },
                  parenthetical: null,
                  lines: [
                    {
                      range: {
                        start: 39,
                        end: 52,
                      },
                      centered: false,
                      elements: [
                        {
                          kind: "text",
                          range: {
                            start: 39,
                            end: 51,
                          },
                        },
                      ],
                    },
                  ],
                },
                {
                  range: {
                    start: 53,
                    end: 69,
                  },
                  kind: "dialogue",
                  characterRange: {
                    start: 53,
                    end: 57,
                  },
                  characterExtensionsRange: {
                    start: 57,
                    end: 57,
                  },
                  parenthetical: null,
                  lines: [
                    {
                      range: {
                        start: 58,
                        end: 68,
                      },
                      centered: false,
                      elements: [
                        {
                          kind: "text",
                          range: {
                            start: 58,
                            end: 67,
                          },
                        },
                      ],
                    },
                  ],
                },
                {
                  kind: "action",
                  range: {
                    start: 69,
                    end: 86,
                  },
                  lines: [
                    {
                      range: {
                        start: 69,
                        end: 86,
                      },
                      centered: false,
                      elements: [
                        {
                          kind: "text",
                          range: {
                            start: 69,
                            end: 86,
                          },
                        },
                      ],
                    },
                  ],
                },
              ],
              kind: "scene",
            },
          ],
        },
      ],
      snippets: [],
    };

    expect(structure).toEqual(expected);
  });
});
