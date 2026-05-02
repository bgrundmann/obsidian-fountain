---
name: fountain
description: >
  Read, write, and edit screenplays in Fountain format (.fountain files).
  TRIGGER when: user opens, creates, or edits .fountain files, asks about screenplay formatting,
  or mentions Fountain syntax, scene headings, dialogue, action lines, transitions, or screenplay structure.
  DO NOT TRIGGER when: working with non-screenplay text files or general markdown.
---

# Fountain Screenplay Format

You are an expert in the Fountain screenplay format. When working with `.fountain` files, follow
the syntax rules below precisely. Fountain is a plain-text markup language for screenwriting.

## Core Principle

**When in doubt, Fountain treats text as Action.** Any line that doesn't match another element's
rules is rendered as action/description.

## Elements

### Scene Headings

A line that begins with `INT`, `EXT`, `EST`, `INT./EXT`, `INT/EXT`, or `I/E` (case-insensitive),
followed by a dot or space. Must have a blank line before them.

```fountain
INT. HOUSE - DAY

EXT. PARK - NIGHT
```

**Forced scene heading**: prefix with a single period (the period is not rendered). The next
character must be alphanumeric (to avoid confusion with `...` ellipsis).

```fountain
.FLASHBACK - INT. CHILDHOOD HOME
```

**Scene numbers**: optional, at the end of the heading line, wrapped in `#`:

```fountain
INT. HOUSE - DAY #1#
EXT. PARK - NIGHT #1A#
INT. OFFICE - MORNING #I-1-A#
```

Scene number content may contain letters, digits, hyphens, and periods.

### Action

Any paragraph that doesn't match another element type. Respects intentional line breaks within the
paragraph. Tabs and spaces are preserved.

**Forced action**: prefix with `!` to prevent a line from being interpreted as another element
(e.g., an all-caps line that should be action, not a character name):

```fountain
!CREDITS ROLL
```

**Centered action**: wrap with `>` and `<`:

```fountain
> THE END <
```

### Character

An all-uppercase line with at least one letter, preceded by a blank line, and NOT followed by a
blank line. The line immediately after a character name is dialogue.

```fountain
STEEL
The man of few words.
```

Character extensions (V.O., O.S., CONT'D, etc.) go in parentheses on the same line:

```fountain
STEEL (V.O.)
Thirty years ago...
```

**Forced character**: prefix with `@` to allow mixed-case names:

```fountain
@McCLANE
Yippee ki-yay.
```

### Dialogue

Any text following a Character or Parenthetical element. Respects line breaks.

To include a blank line within dialogue (without ending the dialogue block), use two spaces on
the otherwise empty line.

### Parenthetical

A line wrapped in parentheses, following a Character or Dialogue element:

```fountain
STEEL
(quietly)
I know.
```

### Dual Dialogue

Add `^` after the second character name to place two dialogue blocks side by side:

```fountain
BRICK
Screw you, Willy.

STEEL ^
Screw you right back.
```

### Transition

An all-uppercase line ending in `TO:`, preceded and followed by blank lines:

```fountain
CUT TO:

FADE TO:
```

**Forced transition**: prefix with `>` (without a closing `<`, which would make it centered text):

```fountain
> Burn to White.
```

### Lyrics

Lines prefixed with `~`:

```fountain
~Wanna know, wanna know
~Have you ever been mellow?
```

### Page Breaks

Three or more consecutive equals signs on their own line:

```fountain
===
```

### Sections

Markdown-style headers for document structure. **Not rendered in output** -- used for
organizational purposes only.

```fountain
# Act One

## Sequence A

### Scene 1
```

### Synopsis

Lines prefixed with `=` (note: three or more `=` is a page break, not a synopsis).
**Not rendered in output** -- used for outlining.

```fountain
= The hero arrives at the castle and meets the gatekeeper.
```

## Emphasis (Inline Formatting)

Follows Markdown conventions, with underscore reserved for underline:

| Syntax | Result |
|--------|--------|
| `*italics*` | *italics* |
| `**bold**` | **bold** |
| `***bold italics***` | ***bold italics*** |
| `_underline_` | underline |

Combine freely: `_**bold underline**_`. Escape with backslash: `\*not italic\*`.

## Notes

Enclosed in double brackets. Can appear inline or on their own line. Can span multiple lines
(use two spaces on blank lines within a note to maintain continuity).

```fountain
INT. HOUSE - DAY

The door opens. [[We need a better transition here.]]

[[
This is a multi-line note
that spans several lines.
]]
```

## Boneyard

Text wrapped in `/* */` is completely ignored. Can span multiple lines.

```fountain
/* This scene was cut in revision 3.
INT. OLD OFFICE - NIGHT
JOHN enters cautiously.
*/
```

## Title Page

Optional. Must be the very first thing in the file. Key-value pairs where multi-line values
are indented with 3+ spaces or a tab:

```fountain
Title: Big Fish
Credit: written by
Author: John August
Source: based on the novel by Daniel Wallace
Draft date: 1/18/2003
Contact:
   John August
   555-0100
```

Common keys: `Title`, `Credit`, `Author`, `Source`, `Draft date`, `Contact`, `Copyright`,
`Revision`, `Notes`.

---

# Obsidian Fountain Plugin Extensions

When working with fountain files in the context of the Obsidian Fountain plugin, these
additional features apply.

## Margin Marks

Special notes with `@` prefix that render as labels in the page margin:

```fountain
The magician waves the wand. [[@effect]]
The audience gasps. [[@laugh]]
```

The marker word is alphanumeric with underscores, no spaces. Common uses:
- Performance cues: `[[@lights]]`, `[[@sound]]`, `[[@music]]`, `[[@effect]]`
- Comedy beats: `[[@setup]]`, `[[@punchline]]`, `[[@laugh]]`

## Todo Notes

Notes prefixed with `todo:` are rendered as todo items in the sidebar:

```fountain
[[todo: Rewrite this scene to add more tension]]
```

## Note Kinds

Notes can have a kind prefix before the colon:

```fountain
[[todo: Fix this scene]]
[[research: Check historical accuracy]]
[[+Added in revision 3]]
[[-Removed for pacing]]
```

## Cross-File Links

Notes prefixed with `>` are clickable links to other vault files:

```fountain
See [[>act-two]] for the next sequence.
[[>characters/jane.md|Jane's bio]]
```

- Targets follow Obsidian's wiki-link conventions: with or without extension,
  basename or path. Resolution uses `metadataCache.getFirstLinkpathDest`.
- Optional display text follows a `|`. Without it, the target text is shown.
- Links work anywhere a note can appear — action, dialogue, parentheticals,
  synopsis, lyrics. They are tracked by an in-memory rename index, so
  renaming a target file rewrites references in every fountain file.
- In PDF export, the display text (or target) is rendered inline as plain
  text — there's no clickable PDF annotation.
- Because `[[>...]]` is syntactically a Fountain note, any standard Fountain
  tool that doesn't recognize the `>` kind will silently treat it as a
  comment.

External URLs and section anchors (e.g. `[[>act-two#Scene 5]]`) are not
supported.

## Snippets Section

A `# Snippets` heading at the end of the document marks the beginning of reusable content blocks.
Individual snippets are separated by page breaks (`===`):

```fountain
# Snippets

EXT. COFFEE SHOP - DAY

The usual busy morning crowd.

===

WAITRESS
What can I get you today?

===

FADE TO BLACK:
```

Everything after `# Snippets` is treated as snippet content (even other section headers).
Snippets appear in the sidebar and can be dragged into the script.

## Boneyard Section

A `# boneyard` section header can be used to hide content at the end of
the document. Content after this header can be toggled visible/hidden in the plugin.
This is different from /* boneyard */ above, which is used to comment out parts
of the screenplay. This here is meant as a place to move e.g. alternative parts of the script, if we are not ready to permanently delete them.

---

# Common Pitfalls

### Accidental Character Names
An all-caps line after a blank line is a character name, not action:
```fountain
The alarm goes off.

BANG
```
`BANG` here is treated as a character name. Use `!BANG` to force it to action.
Note: only `!` at the *start* of a line forces action — `BOOM!` is still a character name.

### Forced Scene Heading vs Ellipsis
A line starting with `.` followed by a letter is a forced scene heading; `...` is not:
```fountain
.OPENING CREDITS    <- forced scene heading
...                 <- just action (ellipsis)
```

### Centered Text vs Forced Transition
Both use `>`, but centered text has a closing `<`:
```fountain
> FADE OUT.         <- forced transition (no closing <)
> THE END <         <- centered text (has closing <)
```

### Empty Lines in Dialogue
A truly empty line ends a dialogue block. To keep dialogue going across a visual break,
put two spaces on the otherwise-empty line.

---

# Writing Guidelines

When creating or editing fountain files:

1. **Blank lines matter.** They delimit elements. A missing blank line before a character name
   turns it into action.
2. **Uppercase for characters.** Character names in dialogue blocks must be ALL CAPS
   (or use `@` for forced mixed-case).
3. **Don't over-force.** Only use forced elements (`!`, `.`, `@`, `>`) when the automatic
   rules don't produce the desired result.
4. **Parentheticals are brief.** Keep them to short acting directions, not full sentences.
5. **Transitions are rare.** Modern screenwriting uses very few explicit transitions.
   `CUT TO:` between every scene is outdated.
6. **Use sections for structure.** `# Act One`, `## Sequence A` help organize without
   appearing in output.
7. **Use synopsis for outlines.** `= Brief description` lines are great for planning.
