# Improved Index Card View — Implementation Design

Companion to `design/improved_index_card_view.md`. The UX doc fixes
the *what*; this doc fixes the *how*: which files change, which new
helpers we need, the data flow for each interaction, and the risks
worth flagging before code is written.

Everything below is keyed to the UX doc's section numbers (§1, §2,
…). Read them side-by-side.

## Affected files (at a glance)

| File                                  | Nature of change                                                   |
| ------------------------------------- | ------------------------------------------------------------------ |
| `src/fountain/structure_nav.ts` (new) | Pure helpers: scene-at-offset, start-of-scene-content              |
| `src/fountain/index.ts`               | Re-export new helpers                                              |
| `src/views/index_cards_view.ts`       | New click model, gutter, pencil, drop callbacks; remove ellipsis   |
| `src/views/view_state.ts`             | `ReadonlyViewCallbacks`: add `navigateToSceneContent`, `insertSceneAt`; drop `duplicateScene` if unused |
| `src/views/readonly_view_state.ts`    | New `firstVisibleCardRange()` for IndexCards mode                  |
| `src/views/editor_view_state.ts`      | New `cursorOffset()`, `selectCurrentScene()`                       |
| `src/views/fountain_view.ts`          | New `toggleIndexCardsView()`, `navigateToSceneContent` callback    |
| `src/main.ts`                         | Register `toggle-index-cards` (⌘⇧I) and `select-current-scene` (⌘⇧L) commands |
| `src/sidebar/sidebar_view.ts`         | Snippets drop zone: handle `application/json` payload              |
| `core_styles.css`                     | New rules for `.pencil-button`, `.insertion-gutter`; tweaks to existing |
| `test/e2e/specs/index_card_*.e2e.ts`  | Add specs for toggle round-trip, click-to-navigate, gutter insert  |

The fountain parser (`parser.peggy`, `script.ts`, `edits.ts`) does
not need to change. All structural primitives we need
(`script.structure()`, `Edit`, `applyEditsToFountainFile`) are
already in place.

---

## 0. New pure helpers — `src/fountain/structure_nav.ts`

Two helpers used by §1 and §2. Both are pure functions over a
`FountainScript`.

```typescript
/** Walk `script.structure()` and return the scene whose range
 *  contains `offset`. If `offset` precedes the first scene (title
 *  page, section header), return the next scene. Returns null only
 *  when the script has no scenes at all. */
export function findSceneAtOffset(
  script: FountainScript,
  offset: number,
): StructureScene | null;

/** Position rule from §1: first character after the blank line
 *  following the scene heading, clamped to scene.range.end. If the
 *  scene has no body before the next heading, returns the end of
 *  the heading line (still inside scene.range). */
export function startOfSceneContent(
  script: FountainScript,
  scene: StructureScene,
): number;
```

**Implementation notes:**

- `findSceneAtOffset` recurses into nested `StructureSection.content`
  to flatten scenes; the structure tree is shallow (sections only
  go to depth ≤3 before being absorbed into scene content), so a
  simple recursive walk is fine.
- `startOfSceneContent` doesn't sniff element kinds (synopsis,
  notes, action) — it counts newlines in `script.document` from
  `scene.scene.range.end`. The rule is: skip exactly one `\n` if
  present (the one between heading and body), then return that
  position. `scene.scene.range` already includes its trailing
  `\n\n` per `parser.peggy` (see `types.ts:103`), so in practice
  `startOfSceneContent` can be the lesser of `scene.scene.range.end`
  and `scene.range.end`.

These belong in their own file rather than `utils.ts` because they
operate on the structure tree, not on raw elements. Re-export from
`fountain/index.ts`.

**Test surface:** unit tests in `__tests__/structure_nav.test.ts`
covering: cursor in scene body; cursor on heading line; cursor in
title page (returns first scene); empty script (returns null);
heading-only scene (lands on heading end); synopsis-only scene
(lands on synopsis); multi-line synopsis.

---

## 1. ⌘⇧I toggle — implementation

The toggle is a three-state machine over the existing pieces:
`FountainView.state` (instance-of `EditorViewState` |
`ReadonlyViewState`) and `ReadonlyViewState.pstate.mode`
(`Script` | `IndexCards`).

| From                            | Action                                  |
| ------------------------------- | --------------------------------------- |
| Edit mode                       | Switch to readonly + IndexCards         |
| Readonly + Script               | Switch to readonly + IndexCards         |
| Readonly + IndexCards           | Switch back to "non-cards" mode         |

"Non-cards mode" is whichever the user came from. Since
`FountainViewPersistedState` already separates `editing` from
`mode`, the existing persistence carries enough. The transition
itself reads `pstate.editing` (or, equivalently, the "saved before
toggle" memory below) to decide whether to land in edit or
readonly+Script.

### Position preservation

Two new methods carry positional context across the transition:

- `EditorViewState.cursorOffset(): number` — `selection.main.head`.
- `ReadonlyViewState.firstVisibleCardRange(): Range | null` —
  query `.screenplay-index-cards .screenplay-index-card[data-range]`,
  return the first whose `getBoundingClientRect().top` ≥
  `contentEl`'s top. Parse the `data-range` start back into a
  number. Used only in IndexCards mode; returns `null` otherwise.

### Toggle algorithm — `FountainView.toggleIndexCardsView()`

```text
fv = active FountainView
if state is ReadonlyViewState && pstate.mode === IndexCards:
    # Going back to non-cards
    target = firstVisibleCardRange()  # may be null
    if target:
        scene = findSceneAtOffset(script, target.start)
    else:
        scene = null

    if pstate.editing:                # user came from editor
        switchToEditMode()
        if scene:
            pos = startOfSceneContent(script, scene)
            scrollToHere({start: pos, end: pos})  # caret + scroll
    else:                              # user came from Script readonly
        pstate.mode = Script
        render()
        if scene:
            scrollToHere(scene.scene.range)  # heading at top
    return

else:
    # Going to cards
    if state is EditorViewState:
        offset = cursorOffset()
    else:
        firstLine = state.rangeOfFirstVisibleLine()
        offset = firstLine?.start ?? 0
    scene = findSceneAtOffset(script, offset)

    # Remember "where we came from" so the return trip is symmetric
    pstate.editing = state.isEditMode
    if state.isEditMode:
        switchToReadonlyMode()         # forces ReadonlyViewState
    pstate.mode = IndexCards
    state.render()
    if scene:
        # readonly's scrollToHere already handles IndexCards mode
        state.scrollToHere(scene.scene.range)
```

A subtle point: switching out of edit mode in the existing
`toggleEditMode()` already passes through `firstVisibleLine`. The
new `toggleIndexCardsView()` should *not* go through
`toggleEditMode()` — it picks its own scroll target (the
scene-under-cursor card, not the first visible line). It either
calls the lower-level transitions directly or factors the existing
`toggleEditMode()` so the "scroll target" can be supplied.

### Wiring

- Plugin command, not view scope: `Mod+E` and `Mod+Shift+X/C` use
  `this.scope.register` because they conflict with Obsidian
  built-ins. `Mod+Shift+I` does not conflict, so register it via
  `addCommand` so users can rebind it. Same pattern as the existing
  `add-scene-numbers` command:

  ```typescript
  this.addCommand({
    id: "toggle-index-cards-view",
    name: "Toggle index card view",
    hotkeys: [{ modifiers: ["Mod", "Shift"], key: "i" }],
    checkCallback: ifFountainView(this.app, (fv) => {
      fv.toggleIndexCardsView();
    }),
  });
  ```

- The view-options menu's "Index cards" / "Script" toggle (today in
  `showViewMenu`) keeps working — it calls
  `state.toggleIndexCards()` which only touches `pstate.mode`. The
  new ⌘⇧I command is a superset that also handles edit-mode
  transitions.

---

## 2. Click model on a card

### DOM changes inside `renderIndexCard`

Today's card is roughly:

```text
.screenplay-index-card[data-range]
├── .drag-handle  (top-left, grip)
├── h3.scene-heading[data-range]    ← click → editSceneHeadingHandler
├── .index-card-buttons              ← ellipsis menu (Copy/Edit/Delete)
├── (synopsis div — click → editSynopsisHandler)
└── .note-todo*                     ← click → startEditModeHere(note.range)
```

After:

```text
.screenplay-index-card[data-range]   ← click → navigateToSceneContent(scene.range)
├── .drag-handle                     (unchanged; pointer-events stop bubbling)
├── h3.scene-heading[data-range]    (no own click; pencil owns rename)
├── .pencil-button                   ← click → editSceneHeadingHandler (top-right)
├── (synopsis div)                   (no click handler at all)
└── .note-todo*                     ← click → startEditModeHere(note.range)
                                       (stopPropagation so card click doesn't fire)
```

### Click-anywhere-navigates

A single listener on `indexCard` whose handler calls
`callbacks.navigateToSceneContent(scene.range)`. To prevent
bubbling from interactive children:

- Drag handle: already has its own role; add `evt.stopPropagation()`
  on a `click` listener that does nothing (so a click on the grip
  doesn't navigate). Mousedown still initiates drag normally.
- Pencil: its `click` handler stops propagation after invoking
  `editSceneHeadingHandler`.
- Todo divs: their `click` handler stops propagation after
  navigating to the todo.

Avoid `evt.target` sniffing in the card-level handler — easier to
get wrong.

### `navigateToSceneContent` callback

New entry on `ReadonlyViewCallbacks`:

```typescript
navigateToSceneContent: (sceneRange: Range) => void;
```

`FountainView` implements it as:

```typescript
navigateToSceneContent: (r) => {
  const scene = findSceneAtOffset(this.cachedScript, r.start);
  if (!scene) return;
  const pos = startOfSceneContent(this.cachedScript, scene);
  this.startEditModeHere({ start: pos, end: pos });
}
```

`startEditModeHere` already switches to edit mode and calls
`scrollToHere(collapseRangeToStart(r))` (`fountain_view.ts:255`),
which is exactly what we want — caret at `pos`, scrolled into
view.

### Pencil button

A small `<div class="pencil-button">` styled like
`.index-card-buttons` (top-right, 44pt tap target, low-opacity at
rest). Implementation reuses `setIcon(div, "pencil")`. The
`editSceneHeadingHandler` it triggers is the *existing* function
in `index_cards_view.ts:257`, with one tweak: add a `blur`
listener that commits the change (today only Enter/Esc work).
Pseudo-diff:

```typescript
const commit = () => {
  callbacks.replaceText(headingRange, headingInput.value + "\n".repeat(numNewlines));
  callbacks.requestSave();
  callbacks.reRender();
};
headingInput.addEventListener("keyup", (event) => {
  if (event.key === "Escape") { callbacks.reRender(); event.preventDefault(); }
  else if (event.key === "Enter") { commit(); event.preventDefault(); }
});
headingInput.addEventListener("blur", commit);
```

Watch for: `commit` re-renders, which destroys the input element
and triggers `blur` again on a detached node — guard with a
`committed` flag, or use `{ once: true }` plus careful ordering.
Esc must *not* commit on the way out (`reRender` will fire blur);
set the flag before re-render.

### Removed code paths

- `editSynopsisHandler` (lines 215–255) — delete entirely.
- `renderSynopsis`'s click listener and "Click to edit" ghost text
  (lines 313–321, 337–340) — remove. Synopsis becomes a static
  display.
- `index-card-buttons` block with the ellipsis Menu (lines
  396–430) — delete.
- `duplicateScene` callback on `ReadonlyViewCallbacks` and its
  `FountainView.duplicateScene` implementation — delete (no other
  callers; verify with a grep before removal).
- `computeDuplicateSceneEdits` in `fountain/edits.ts` loses its
  only caller. Delete it (and any tests in `__tests__/`).

### CSS

Add to `core_styles.css`:

```css
.screenplay-index-card { cursor: pointer; }   /* card clicks navigate */
.screenplay-index-card .drag-handle,
.screenplay-index-card .pencil-button { cursor: grab; }
.screenplay-index-card .pencil-button { cursor: pointer; }

.screenplay-index-card .pencil-button {
  position: absolute;
  top: 4px;            /* 44pt tap area (~44px); icon sits 10/10 from corner */
  right: 4px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.35;
  transition: opacity 0.15s ease;
}
.screenplay-index-card:hover .pencil-button { opacity: 1; }
.screenplay-index-card .pencil-button .svg-icon {
  width: 14px; height: 14px;
}
```

Drop the existing `.index-card-buttons` rule (lines 555–560).

---

## 3. Insertion gutter

The card grid uses
`grid-template-columns: repeat(auto-fill, minmax(240px, 1fr))`
(`core_styles.css:524`) — visually-adjacent cards may not be
DOM-adjacent, so any "gutter between siblings" approach has to
reckon with row wrapping. And the gutter has to coexist with the
existing drag/drop indicator system in the same visual region (the
10px `gap`).

### DOM: per-card "before" gutter, in a slot wrapper

Treat each card as owning the gap to its **left** (in DOM order).
For visual row 0 the leftmost card's gutter is a "before-first"
insertion point. For wrapped rows the leftmost card's gutter still
represents a valid insertion point — between "last card of
previous row" and "first card of this row" in screenplay order,
which is exactly the linear insertion position the user wants.

Wrap each card in a `.card-slot` so the gutter can sit in the gap
without being clipped by the card's existing `overflow: hidden`
(needed for synopsis truncation). The slot occupies one grid cell;
the card and its gutter are siblings inside it:

```text
.screenplay-index-cards (grid; gap stays 10px)
├── .card-slot (position: relative; one grid cell)
│   ├── .insertion-gutter[data-insert-pos]   ← absolute, bleeds left
│   └── .screenplay-index-card …             ← drag handlers stay here
├── .card-slot
│   ├── .insertion-gutter[data-insert-pos]
│   └── .screenplay-index-card …
├── …
└── .screenplay-index-card.dashed            ← unchanged "+" tail
```

The drag/drop handlers stay attached to `.screenplay-index-card`,
so move semantics and the drop-left/drop-right indicator
(`box-shadow: inset ±3px 0 0 0 var(--interactive-accent)`) are
unchanged.

**No separate head-of-section gutter.** The first card's gutter
already encodes "insert before scene 1 = head of section." When
the section is empty (no cards), the existing dashed `+` card is
the only affordance. Adds no DOM weight to the empty case.

### CSS

```css
.card-slot { position: relative; }

.insertion-gutter {
  position: absolute;
  inset-block: 0;
  width: 10px;
  left: -5px;            /* 5px into gap, 5px into card's left padding zone */
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s ease;
}
.insertion-gutter::before {     /* the 3px accent stripe — same vocabulary as drop-left */
  content: "";
  position: absolute;
  inset-block: 8px;
  inset-inline: 3.5px;          /* yields a 3px-wide bar centered in the 10px gutter */
  background: var(--interactive-accent);
  border-radius: 2px;
}
.insertion-gutter:hover { opacity: 1; }
```

The `.insertion-gutter::before` bar is the same 3px-wide accent
stripe the drop-indicator draws on the card edge. Hover the
gutter (no drag) → bar fades in. Drag a card over an adjacent
card's left half → bar appears as that card's `inset` shadow. Both
states, same visual.

### Coexistence with drag/drop

The gutter overlays the card's leftmost ~5px (where the card's
`padding: 10px` lives — no content there). During a drag, two
problems would arise without intervention:

1. CSS `:hover` would still fire as the dragged card passes near
   another card, lighting up gutters that compete with the drop
   indicator.
2. Pointer events on the gutter would prevent `dragover` from
   reaching the card behind it, breaking the existing left/right-
   half drop math.

Both are solved by making gutters fully inert for the duration of
a drag:

```css
.screenplay-index-cards.dragging-active .insertion-gutter {
  pointer-events: none;
  opacity: 0;
  transition: none;     /* don't animate during drag */
}
```

Toggled in JS at the existing `dragstart` / `dragend` boundaries
(`index_cards_view.ts:159` and `:205`):

```typescript
// inside dragstartHandler:
card.closest(".screenplay-index-cards")?.classList.add("dragging-active");

// inside dragend listener:
card.closest(".screenplay-index-cards")?.classList.remove("dragging-active");
```

`pointer-events: none` automatically suppresses both `:hover` and
click; `dragover` events at the gutter's 5px-into-card region pass
through to the card and the existing drop math kicks in unchanged.

A subtle point: the dragstart handler currently sets the drag
image via `setDragImage(card, 12, 12)` synchronously, then defers
adding the `.dragging` class via `setTimeout` so the browser
snapshots the card at full opacity. The `dragging-active` toggle
above goes on the *parent* container, not the card, and applies
to gutters elsewhere — it can run synchronously in dragstart
without affecting the dragged card's own snapshot.

The dashed `+` card has no drag handlers today and gets no gutter.
Its existing click behavior (insert at end of section) is
preserved.

### Insertion math

Each `.insertion-gutter` carries `data-insert-pos` (a numeric
offset). Click handler:

```typescript
gutter.addEventListener("click", () => {
  callbacks.insertSceneAt(insertPos);
});
```

The pos values:

- Per-card "before" gutter: the card's `scene.range.start`.
- Dashed `+` card (unchanged): `endOfRange(section.range).start`.

If the section starts with a section heading, the first card's
`scene.range.start` is *after* the heading line — so insertion
there falls between the heading and scene 1, which is the right
place.

### `insertSceneAt(pos): void` callback

```typescript
insertSceneAt: (pos: number) => void;
```

`FountainView` implementation:

```typescript
insertSceneAt: (pos) => {
  this.applyEditsToFile([
    { range: { start: pos, end: pos }, replacement: ".SCENE HEADING\n\n" },
  ]).then(() => this.requestPendingFocusOnNewHeading(pos));
}
```

### Auto-focus on creation

`requestPendingFocusOnNewHeading` is a new mechanism for solving
the "after re-render, focus the new card's heading input" problem.
The render is async (it goes through `applyEditsToFountainFile` →
view re-render). After the re-render, find the card whose
`data-range` starts at `pos` and synthesise the
`editSceneHeadingHandler` flow (replace the h3 with the input,
focus it).

Two approaches:

- **Polling/queue**: store a `pendingFocusPos: number | null` on
  `FountainView`. After every re-render in `ReadonlyViewState`
  (post-IndexCards-render), check the queue; if a card matches,
  enter edit mode on it; clear the queue.
- **One-shot promise**: have `applyEditsToFile` already returns a
  promise, but the re-render happens through `receiveEdits` →
  `ReadonlyViewState.render()`, and there's no post-render hook
  today. Adding a post-render callback on `ReadonlyViewState` is
  small and serves both gutter-insert and dashed-+ insert
  cleanly.

Recommended: post-render hook on `ReadonlyViewState`. Pseudo:

```typescript
class ReadonlyViewState {
  private pendingPostRender: (() => void) | null = null;
  schedulePostRender(fn: () => void) { this.pendingPostRender = fn; }
  render() { /* … */; const fn = this.pendingPostRender; this.pendingPostRender = null; fn?.(); }
}
```

The dashed `+` card uses the same path so its heading also auto-
focuses after creation (today's bug per UX doc).

---

## 4. Select-current-scene command (⌘⇧L)

Pure editor concern. Add `EditorViewState.selectCurrentScene()`:

```typescript
selectCurrentScene(): void {
  const offset = this.cmEditor.state.selection.main.head;
  const script = this.cmEditor.state.field(fountainScriptField);
  const scene = findSceneAtOffset(script, offset);
  if (!scene) return;
  this.cmEditor.dispatch({
    selection: EditorSelection.range(scene.range.start, scene.range.end),
    effects: EditorView.scrollIntoView(scene.range.start, { y: "start", yMargin: 50 }),
  });
}
```

Reads the parsed script directly from the CM `StateField` rather
than `FountainView.cachedScript` to avoid a stale-cache window
mid-edit (also keeps this state fully self-contained).

Plugin command:

```typescript
this.addCommand({
  id: "select-current-scene",
  name: "Select current scene",
  hotkeys: [{ modifiers: ["Mod", "Shift"], key: "l" }],
  checkCallback: ifFountainView(this.app, (fv) => {
    if (fv.state instanceof EditorViewState) {
      fv.state.selectCurrentScene();
    }
  }),
});
```

`ifFountainView` already returns false when no FountainView is
active. We additionally no-op when the active state isn't an
editor (in IndexCards mode the command is harmless — the user
gets ⌘⇧L and nothing happens; or we could refine the
checkCallback to also require edit mode). Recommend the latter:
add an `ifFountainEditor` helper alongside `ifFountainView`.

---

## 5. Drag scene → Snippets section

Today's snippets drop zone (`sidebar/sidebar_view.ts:63-73`) reads
`text/plain` only. Index card drags supply
`application/json` with `{path, range}` (see
`index_cards_view.ts:167-170`). Extend the drop handler:

```typescript
sectionDiv.addEventListener("drop", async (event) => {
  event.preventDefault();
  sectionDiv.removeClass("drag-over");

  const json = event.dataTransfer?.getData("application/json");
  if (json) {
    const { path, range } = JSON.parse(json);
    const text = await this.callbacks.readFromFile(path, range);
    if (text) this.callbacks.insertAfterSnippetsHeader(`${text}\n\n===\n\n`);
    return;
  }

  const droppedText = event.dataTransfer?.getData("text/plain");
  if (droppedText) {
    this.callbacks.insertAfterSnippetsHeader(`${droppedText}\n\n===\n\n`);
  }
});
```

The new `readFromFile(path, range)` callback on
`SidebarCallbacks` resolves text from any path (open or not):

```typescript
readFromFile: async (path, range) => {
  const views = findFountainViewsForPath(this.app, path);
  if (views.length > 0) return views[0].getText(range);
  const file = this.app.vault.getAbstractFileByPath(path);
  if (file instanceof TFile) {
    const txt = await this.app.vault.read(file);
    return txt.slice(range.start, range.end);
  }
  return null;
}
```

Cross-file semantics: `insertAfterSnippetsHeader` already operates
on `theFountainView()`, which is the destination (script B). The
source script A is read but not modified — copy semantics, as
required by the design doc.

A nuance: today's drop handler synchronously calls
`insertAfterSnippetsHeader`. With the new path it becomes
`async`. Make sure `event.preventDefault()` runs synchronously
*before* the await (it does, in the snippet above) so the browser
doesn't fall back to default drop handling.

---

## 6. Removals

| Removed                                | File                          | Notes                                |
| -------------------------------------- | ----------------------------- | ------------------------------------ |
| `editSynopsisHandler`                  | `index_cards_view.ts:215`     | Delete                                |
| Synopsis click handler & "Click to edit" ghost | `index_cards_view.ts:313-340` | Replace with static render |
| Ellipsis menu (Copy / Edit / Delete)   | `index_cards_view.ts:396-430` | Delete                                |
| `duplicateScene` on `ReadonlyViewCallbacks` | `view_state.ts`         | Delete callback + `FountainView.duplicateScene` |
| `.index-card-buttons` CSS              | `core_styles.css:555-560`     | Delete                                |
| `.edit-buttons`, `textarea` rules      | `core_styles.css:639-651`     | Delete (only synopsis edit used them) |
| `computeDuplicateSceneEdits`           | `fountain/edits.ts`           | Delete — only caller was the ellipsis menu |

Verify with `grep` before deleting any of the above.

---

## 7. Persistence implications

`FountainViewPersistedState.editing` already separates from
`mode`; nothing new is persisted. The toggle algorithm in §1
relies on `pstate.editing` being kept up to date. Audit:

- `getState()` (`fountain_view.ts:493`) writes
  `editing: this.state.isEditMode` — correct.
- `setState()` (`fountain_view.ts:508`) reads `state.editing` and
  switches accordingly — correct.
- The new `toggleIndexCardsView()` must call
  `app.workspace.requestSaveLayout()` after the transition, so
  reload restores the new mode. Same pattern as today's `Mod+E`.

No migration is needed for existing `workspace.json` data: the
fields are already there.

---

## 8. Tests

### Unit (`__tests__/`)

- `structure_nav.test.ts` (new): the cases enumerated in §0.

### E2E (`test/e2e/specs/`)

Add a new spec `index_card_ux.e2e.ts`:

- ⌘⇧I from edit mode lands in IndexCards with the
  scene-under-cursor card scrolled into view.
- ⌘⇧I from IndexCards returns to edit mode with the cursor at
  start-of-scene-content of the first visible card.
- Card click navigates to start-of-scene-content (lands on
  synopsis when one exists; on first action line otherwise).
- Pencil click opens an inline input; Enter commits; Esc cancels;
  blur commits.
- Insertion gutter click inserts `.SCENE HEADING\n\n` at the
  expected offset and auto-focuses the new heading input.
- Dashed-`+` card insert also auto-focuses (regression on UX
  doc's "today the `+` path inserts and leaves the user to click
  the heading separately").
- ⌘⇧L in editor selects the surrounding scene.
- Drag from card → sidebar snippets appends to snippets section
  with `===` separator; same-file copy; cross-file copy.

`index_card_moves.e2e.ts` already establishes the synthetic
DragEvent harness — reuse it for the new drag-to-snippets cases.

---

## 9. Open questions / risks

1. **Gutter rendering with auto-fill grid.** §3's "slot wrapper +
   per-card before-gutter" approach handles row wrapping cleanly
   (leftmost-of-row gutter = end-of-previous-row insertion =
   correct linear position). The drag/drop coexistence rests on
   `pointer-events: none` during drag, which is the part most
   worth prototyping early — get the dragstart/dragend class
   toggle working before investing in the rest of the gutter
   visuals.

2. **Pencil blur-commit ordering.** The `commit` re-renders, which
   destroys the input and fires `blur` on the detached node. A
   `committed` flag avoids the re-entry, but it's the kind of
   thing that bites in tests. Cover with a unit DOM test.

3. **Scene-under-cursor when cursor is in title page.** §1 says
   "use the next scene." That mirrors the cards-to-editor case
   (where IndexCards has no card for the title page anyway). The
   helper `findSceneAtOffset` should encode this.

4. **`firstVisibleCardRange()` precision during transitions.**
   `toggleIndexCardsView` from edit mode → cards switches the
   state synchronously; the IndexCards DOM is rendered before
   `firstVisibleCardRange()` is called *next* time round, so this
   is fine on the cards-to-editor leg. The edit-to-cards leg
   doesn't call `firstVisibleCardRange()` (it uses cursor offset),
   so the timing risk only exists if a user mashes ⌘⇧I twice
   quickly. Test it.

5. **Cross-file drag → snippets when the source file isn't open.**
   The drag *originates* from a card view, so the source file is
   always open by construction. The async `readFromFile` is
   over-cautious; we can simplify to the open-view-only path.
   Keep the fallback anyway — costs nothing and future-proofs
   against a possible "drag from outline" entry point.

6. **Should ⌘⇧I be a per-view scope hotkey or a plugin command?**
   Plugin command is the right call (user-rebindable, documented
   in §1) — but it means it's available even without focus on a
   fountain view. `ifFountainView` keeps it inert in that case.

7. **`selectCurrentScene` inside IndexCards mode.** Today's
   reading is "do nothing." Alternative: switch to edit mode then
   select. Current proposal (do nothing) is the safer one — no
   surprise mode switch on a hotkey.
