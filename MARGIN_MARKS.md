# Margin Marks Feature Design

## Overview

Margin marks are notes that render as single words in the page margin during reading view, allowing script writers to quickly scan for specific moments (effects, laughs, beats, etc.).

## Use Cases

### Primary Use Case: Magic Show Scripts
A magician writing a performance script wants to mark where magical effects occur:
```fountain
Bene turns over the card. It is the Jack of Spades. [[@effect]]
The audience gasps as the card vanishes. [[@effect]]
```

### Secondary Use Cases
- **Comedy Scripts**: Mark expected laugh points with `[[@laugh]]` or `[[@punchline]]`
- **Drama Scripts**: Mark emotional beats with `[[@tension]]`, `[[@release]]`, `[[@revelation]]`
- **Technical Scripts**: Mark cues with `[[@lights]]`, `[[@sound]]`, `[[@music]]`
- **Educational Scripts**: Mark learning objectives with `[[@concept]]`, `[[@example]]`

## Syntax

Margin marks use the syntax `[[@marker_word]]` where the `@` prefix distinguishes them from other note types we already support:
- `[[regular notes]]`
- `[[+addition notes]]`
- `[[-deletion notes]]`
- `[[noteKind: notes with kinds]]`
- `[[@margin_mark]]` (new)

The marker word after `@` must be alphanumeric with underscores, no spaces.

## Data Model

The existing `Note` type already supports different note kinds. For margin marks, the `noteKind` field will contain `"@effect"` or similar.

```typescript
function isMarginNote(n: Note): boolean {
  return n.noteKind.startsWith("@");
}
```

## Parser Changes

The parser's `NoteKind` rule (around line 122) needs to be extended to recognize the `@` prefix pattern:

```peggy
NoteKind
 = "+"   { return "+"; }
 / "-"   { return "-"; }
 / "@" marker:MarkerWord { return "@" + marker; }  // New pattern
 / kind:NoteKindName ":" " "* { return kind }

MarkerWord = [a-zA-Z0-9_]+ { return text() }
```

This integrates naturally with the existing note parsing structure, where the noteKind is already normalized to lowercase and stored in the Note object.

## Rendering Implementation

### Reading View

Margin marks will be rendered using a CSS class pattern consistent with existing note types:

```css
.screenplay {
  position: relative;  /* Enable absolute positioning for margin marks */
}

.screenplay .note-margin {
  position: absolute;
  left: calc(var(--max-width) + 2ch);
  width: 8ch;
  color: var(--text-muted);
  font-size: 0.9em;
  font-style: normal;  /* Override italic from .note */
  background: none;    /* Override background from .note */
}
```

During HTML generation:
1. Detect margin notes using `isMarginNote()`
2. Apply class `note-margin` instead of the default `note` class
3. Extract the marker word (everything after `@`) for display
4. Position elements absolutely relative to their containing line
5. Handle vertical stacking when multiple marks appear on the same line

### Editor View

Keep margin marks inline as `[[@marker]]` but style them distinctly from other note types in CodeMirror decorations.

### PDF Export

Initially render as inline `[[@marker]]` text. Add option to hide margin marks in PDF export settings.

## Edge Cases

- **Line wrapping**: Align margin mark with the start of the note
- **Overlapping marks**: Stack vertically when multiple marks are on same line
- **Long marker words**: Truncate with ellipsis
- **Copy/paste**: Preserve full `[[@marker]]` syntax
- **Mobile view**: Show inline due to space constraints

## Implementation

1. Modify parser to call `createNote()` function
2. Add `isMarginNote()` helper function
3. Render margin marks in reading view margin
4. Style margin marks distinctly in editor view
6. Handle collision detection and vertical stacking

## Testing

- Verify `@` prefix detection alongside existing `+`, `-`, and `:` patterns
- Test margin positioning and collision handling
- Ensure copy/paste preserves syntax
