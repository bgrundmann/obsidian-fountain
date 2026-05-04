# Index Card View — Design Rationale

The index card view is the structural read on a script — a map you can
rearrange. It is **not** a second editor. Implementation lives in
`src/views/index_cards_view.ts` (rendering, gutter, pencil, drag/drop)
and `src/views/fountain_view.ts` (the ⌘⇧I toggle and `insertSceneAt`
auto-focus). Pure helpers in `src/fountain/structure_nav.ts`.

## Why cards are not a second editor

Operations that change the *shape* of the outline live on cards:
navigation, reorder, rename heading, insert, drag-to-snippets.
Operations that change scene *contents* (synopsis, dialogue, action,
links) belong in the editor. Anything that existed in both views is a
candidate for removal from cards.

This is why the click-anywhere-navigates model works: the card has one
job, jump to the editor.

## Why "start of scene content" is the cursor target

When clicking a card or returning from cards via ⌘⇧I, the cursor lands
at the first character after the heading's blank line — which is the
synopsis when one exists, or the first action/dialogue line otherwise.
Single rule, no element-type sniffing.

A round-trip with no edits returns to (approximately) where the user
started: scene-under-cursor maps to that scene's card and back to a
position inside the same scene. Synopsis-using and synopsis-skipping
writers both get a sensible landing without a per-user setting.

## Why no scene-delete / scene-copy on cards

Removed in favour of the editor primitive **Select current scene**
(⌘⇧L), which selects `scene.range` so the system clipboard handles the
rest:

- `⌘⇧L, ⌘X` — delete a scene.
- `⌘⇧L, ⌘C, ↓, ⌘V` — duplicate a scene.

This is a primitive, not a menu item. It composes with cut-and-paste
across files and into snippets sections — operations the old ellipsis
menu did not support. There is no cross-tool convention for "select
scene as text" in screenplay editors; `⌘⇧L` reads as "select line, but
at scene granularity," and pairs naturally with `⌘⇧I`.

## Why synopsis editing was removed from cards

Synopses now contain styled text (links via `[[>...]]`, formatting,
notes). An inline `<textarea>` cannot edit any of that without
embedding a CodeMirror instance per card, which is heavy for a
card-level affordance. The fast path is now: click the card → land on
the synopsis in the editor → edit → ⌘⇧I back. The toggle and the
click-anywhere-navigates model together are what make this acceptable.

## Why pencil-icon rename instead of `⋯` menu

The pencil represents one specific action, not a menu. A `⋯` would
invite future drift toward becoming a menu again. Auto-focus on
freshly-inserted cards (gutter / dashed `+`) means the most common
rename case never requires finding the pencil at all, so the pencil
can afford to be small and quiet.

## Why a click gutter instead of a click-to-add affordance per card

The gutter encodes a *position between* cards (and the first card's
gutter encodes "head of section"). It uses the same visual vocabulary
as the drag/drop indicator (`drop-left`/`drop-right` insertion bars):
both states mean "scene goes here." During an active drag, gutters go
inert via `pointer-events: none` so the card behind them keeps
receiving `dragover` events and the existing left/right-half drop math
runs unchanged.

## Deferred

- **Keyboard reordering** — `Alt+↑` / `Alt+↓` (or "Move up" / "Move
  down" menu items). Real accessibility gap; separable.
- **Whole-card drag** — currently only the grip handle initiates. With
  the new click model the card surface has no inline-editable regions,
  so the entire card could become the drag source. Grip stays as a
  visual hint.
- **Per-card metadata** — page count, character chips, color tags. The
  top-right corner is reserved for card-level actions (today: pencil),
  so any per-card badges need their own home.
- **Cross-file drop cue** — the destination indicator is identical for
  same-file and cross-file drops. Worth distinguishing; not blocking.
