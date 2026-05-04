# Improved Index Card View

Design doc for UX improvements to the index card view rendered by
`src/views/index_cards_view.ts`. Implementation details live with
the code; this doc captures the rationale and the open decisions.

## Goals

- Reduce friction during structural work — reorder, insert,
  rename — the primary purpose of the view.
- Give the view a single coherent identity instead of a partial
  duplicate of editor functionality.
- Keep mouse-driven flows fast and leave room for keyboard /
  accessibility paths to be added later.

## Non-goals

- Restructuring the Section / Scene model.
- Per-card metadata (page count, character chips, color tags).
- Multi-select / bulk operations.
- A keyboard-only reorder gesture. Worth doing; tracked in
  Deferred.

## Philosophy: cards are a view, the editor is for editing

The index card view exists to give the author a *structural* read
on the script — a map you can rearrange. It is not a second
editor.

This drives every decision below:

- **Cards** handle operations that change the *shape* of the
  outline: navigation, reordering, renaming scene headings,
  inserting new scenes.
- **Editor** handles everything that changes scene *contents*:
  synopsis, dialogue, action, links inside a synopsis, character
  names.
- **The toggle between them is the most important affordance on
  either view**, because round-trips become routine. Bind it to a
  hotkey; preserve scroll/cursor across the trip.

Anything that today exists in both views (synopsis edit, scene
delete, scene duplicate) is a candidate for removal from cards.

---

## 1. Frictionless toggle (⌘⇧I)

A single command — default `⌘⇧I`, user-rebindable from Obsidian's
Settings → Hotkeys — toggles the active fountain view between its
current edit/readonly mode and the index card view.

**Round-trip preserves position both ways:**

- Editor → cards: scroll the card view so the card for the
  scene-under-cursor (or scene-under-first-visible-line in
  readonly mode) is in view.
- Cards → editor: scroll the editor so the heading of the
  *first scene visible on screen* in the card view sits near
  the top of the viewport. Cursor lands at the **start of
  scene content** — defined as the first line after the blank
  line that follows the heading, clamped to the scene's
  `scene.range`.

"Scene under cursor" is the scene whose `scene.range` contains
the cursor offset. If the cursor is above the first scene (title
page, section header), use the next scene.

**Why "start of scene content."** Synopses are polarising —
some writers swear by them, others never use them. A single
rule serves both:

- If a synopsis exists, the cursor lands on it (the dominant
  reason to round-trip from cards to editor).
- If not, the cursor lands on the first action / dialogue
  line, a sensible neutral landing.

This also keeps round-trips stable: editor → cards → editor
with no intervening edits returns to (approximately) where the
user started, since "scene under cursor" maps to that scene's
card and back to a position inside the same scene.

**Edge cases.**

- Heading is the last thing in the doc, or there is no body
  before the next scene/section heading: cursor lands at the
  end of the heading line. Never cross out of `scene.range`.
- Heading with no blank line before its content: first line
  after the heading, still clamped to `scene.range`.
- Notes / boneyard / margin marks between heading and synopsis:
  take the first line after the blank regardless of element
  kind. Uniform rule, no element-type sniffing.
- Multi-line synopsis (stacked `= ...` lines): land on the
  first synopsis line.

---

## 2. Click model on a card

| Click target            | Action                                       |
| ----------------------- | -------------------------------------------- |
| Anywhere on the card    | Navigate to the scene in the underlying view |
| Pencil icon (top-right) | Inline-rename the heading                    |
| Drag handle (grip)      | Drag (unchanged)                             |

Click-anywhere-navigates is the conventional file-tree / card-UI
pattern; users don't have to learn a per-region click model.
Rename is the only editing action that survives on cards (§6),
so it gets its own dedicated affordance rather than competing
with navigation.

**Affordance rule.** Card-level action affordances (pencil,
grip) are always visible; insertion affordances *between* cards
(§3's gutter) are hover-revealed. Future additions should
follow the same split.

**Pencil details.** Small icon in the top-right corner of the
card, low contrast (~30–40% opacity) at rest so a screen full
of cards stays calm; full opacity on card-hover for desktop
discoverability; resting weight on touch (no hover state to
rely on). Generous (~44pt) tap target around the small visual
so iPad use stays comfortable. Pencil, not `⋯` — it represents
one specific action, not a menu, and shouldn't drift to `⋯`
later. The top-right corner is reserved for card-level action
affordances; per-card metadata badges (out of scope today, see
Non-goals) would need to find their own home.

**Heading inline-rename.** Single-line input replacing the
heading in place. `Enter` saves; `Esc` cancels and returns
focus to the card; blur commits (so renaming several headings
in a row is a fluent click → type → click → type sequence).
No buttons, no hint text.

**Auto-focus on creation.** Inserting a new scene via the
gutter (§3) or the dashed "+" card auto-focuses the new
heading input. The most common rename case — naming a scene
you just made — never requires finding the pencil at all,
which is why the pencil-as-existing-heading-rename affordance
can afford to be small and quiet.

**Todo lines.** Clicking a todo navigates to *that todo's*
range in the editor (today's behaviour), not the scene
heading. More useful than collapsing it to scene-level
navigation.

---

## 3. Insertion gutter

A hover-revealed gutter between every adjacent pair of cards (and
before the first / after the last). On hover it animates to a
thin pill with a "+" icon. Click → insert `.SCENE HEADING\n\n`
at the gap and auto-focus the new card's heading input so the
user can immediately type the title.

**Visual vocabulary.** Match the existing drop indicator. The
hover gutter and the `drop-left` / `drop-right` insertion bar
mean the same thing — "scene goes here" — so they should look
the same. Reuse colour and thickness.

**Keep the dashed "+" card** at section end. It still matters
when a section is empty (no gutter to hover) and gives an obvious
affordance for first-time readers. Auto-focus the new heading
input there too — today the "+" path inserts and leaves the user
to click the heading separately.

The gutter is a *click* target only. Drops already work through
the `drop-left` / `drop-right` halves of the surrounding cards,
so every gap is already a valid drop position.

---

## 4. Select-current-scene command (in the editor)

A new command, **Select current scene**, sets the editor
selection to the scene's `scene.range` — the same range used for
drag-and-drop, covering the heading line through the line before
the next scene/section header.

Default keybinding: **⌘⇧L**, user-rebindable from Settings →
Hotkeys (same pattern as ⌘⇧I).

There is no cross-tool convention for "select scene as text" in
screenplay editors — Final Draft, Fade In, Highland all expose
scene navigation but not a scene-as-text-selection primitive with
a famous shortcut. The closest analogue is a text editor's
select-line (`⌘L` in VS Code / Sublime, with repeat extending
the selection). ⌘⇧L reads as "select line, but at scene
granularity," and pairs naturally with ⌘⇧I for the two scene-
level commands.

It is a *primitive*. The user composes it with the system
clipboard for the operations that used to live in the card view's
ellipsis menu:

- `⌘⇧L, ⌘X` — delete a scene.
- `⌘⇧L, ⌘C, ↓, ⌘V` — duplicate a scene.

It also opens the door to ad-hoc operations (cross-file moves by
cut-and-paste, hand-pasting into a snippets section) that the old
menu items did not support.

---

## 5. Drag scene → Snippets section

Dragging a scene card onto the snippets section of the sidebar
turns the scene into a snippet.

- **Copy semantics.** The scene stays in the script. Snippets are
  a library, not a destination.
- **Position.** Append to the snippets section, separated by
  `===` from any existing snippets.
- **Cross-file.** Dragging from script A's card view onto script
  B's snippets section lands in script B's `# Snippets` section
  (B's file is modified; A's is not).

Reuses the existing drag handler — the same `application/json`
payload that already carries `{path, range}`. The snippets-section
drop zone reads it and appends a copy of the source range.

---

## 6. What's removed (and why)

**Synopsis editing on cards** — gone.

Synopses now contain styled text — links via `[[>...]]`,
formatting, notes. An inline `<textarea>` cannot edit any of that
without embedding CodeMirror (heavy for a card-level affordance)
or accepting a meaningfully degraded editing experience compared
to the main editor. The fast path is now: click the card to land
in the editor at the start of that scene's content (§1's cursor
rule lands you on the synopsis when one exists), edit, ⌘⇧I back.
The toggle and the click-anywhere-navigates model together are
what make this acceptable; without them the loss would be real.

**Ellipsis menu (Copy / Edit / Delete)** — gone.

- *Copy* and *Delete* are covered by §4's scene-select command.
- *Edit* is covered by clicking the card (§2) — the card body
  has one job now, navigate.

One fewer affordance to design and explain.

---

## Deferred

- **Keyboard reordering** (`Alt+↑` / `Alt+↓`, or menu items
  "Move up" / "Move down"). Real accessibility gap; separable.
- **Whole-card drag.** Currently only the grip handle initiates
  a drag. The new click model has no inline-editable regions on
  the card surface (rename lives behind the pencil), so the
  entire card can become a drag source without conflicting with
  anything. The grip stays as a visual hint.
- **Per-card metadata** — page count, character chips, color
  tags.
- **Cross-file drop cue.** The destination indicator looks
  identical for same-file and cross-file drops. Worth
  distinguishing; not blocking.

