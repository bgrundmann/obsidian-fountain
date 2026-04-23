# Scene Operations Refactor

Extract scene-level text manipulation from `view.ts` into a pure, testable
module, and route all document mutations through a single edit-based pipeline.

## Part 1 — Current situation

### Where the logic lives

`view.ts` (775 lines) is the `TextFileView` subclass. In addition to its
proper job (mode switching, mounting a `ViewState`, wiring Obsidian actions),
it contains:

- String primitives at the top of the file (`view.ts:36–121`):
  `trailingNewlinesNeeded`, `moveText`, `replaceTextInString`,
  `moveSceneInString`, `duplicateSceneInString`.
- A private `applyTextTransform(text => text)` (`view.ts:408`) that runs the
  transform against `cachedScript.document`, reparses, propagates to every
  other `FountainView` open on the same path, and calls `vault.modify`.
- Thin wrappers (`replaceText`, `moveScene`, `duplicateScene`) that feed the
  string primitives into `applyTextTransform`.
- `moveSceneCrossFile` (`view.ts:432`), which inlines the two-file version
  (extract from source text, insert into destination text, run the update
  pipeline twice).
- `addSceneNumbers` (`view.ts:632`) and `removeSceneNumbers` (`view.ts:679`),
  which walk `cachedScript.script`, accumulate edits in an array, and then
  apply them in reverse order by calling `this.replaceText` in a loop.

### How edits flow today

There are four entry points and they don't all agree on a pipeline.

1. **User types in editor.** CM dispatches a change. The
   `fountainScriptField` StateField (`fountain_state.ts:19`) reparses on
   `docChanged`. CM's `updateListener` (`editor_view_state.ts:91`) fires
   `onScriptChanged`, which runs `FountainView.updateScriptDirectly`. That
   updates `cachedScript` on the originating view and, for each sibling
   view on the same path, calls `updateScript` — which sets
   `cachedScript`, and if the sibling is an editor whose text disagrees
   with the new script, invokes `state.setViewData(path, newText, false)`.
   `EditorViewState.setViewData` does a full-document CM replace
   (`editor_view_state.ts:111`).

2. **Programmatic edit (moveScene, duplicateScene, scene numbering, etc.).**
   `applyTextTransform` runs a pure string transform, calls `parse`,
   invokes `updateAllViewsForFile` (which calls `updateScript` on each
   view — including the originating one), and writes to disk. The
   originating editor's CM doc is replaced wholesale via
   `state.setViewData`, which blows away cursor position and collapses
   the operation into a single undo step.

3. **External reload by Obsidian.** Obsidian calls
   `FountainView.setViewData(data, clear)` (`view.ts:539`). It
   short-circuits if `data` equals `cachedScript.document`, otherwise
   parses, runs `updateAllViewsForFile`, then delegates to
   `state.setViewData` — same full-doc CM replace for editors.

4. **Removal commands.** `main.ts:359` calls
   `fountainView.setViewData(newText, false)` directly, reusing the
   external-reload entry point as a public "apply new text" API.

### Pain points

- **`view.ts` mixes concerns.** The file is half Obsidian glue and half
  scene-text manipulation. The string functions have no Obsidian
  dependency and no reason to live there. Unit-testing them requires
  reaching past Obsidian APIs.
- **No single pipeline.** `applyTextTransform` (programmatic) and
  `setViewData` (external + removal commands) both end up calling
  `updateAllViewsForFile`, but they arrive there differently and do
  subtly different things (the programmatic path writes to disk itself;
  `setViewData` assumes Obsidian already has).
- **Full-doc CM replacement for every programmatic edit.** Moving a
  single scene replaces the entire CodeMirror document on every editor
  open on the file. Cursor, selection, and undo granularity are lost.
- **Scene-numbering traversal is entangled with application.**
  `addSceneNumbers` interleaves "find the insertion point" with
  "call `this.replaceText` which triggers a full parse + propagate".
  Each of N insertions runs the full pipeline, and the logic can't
  be tested without standing up a `FountainView`.
- **Cross-file move duplicates the pipeline inline.** Rather than
  expressing "two edits across two documents", `moveSceneCrossFile`
  repeats the extract-update-modify sequence twice with ad-hoc glue.
- **`setViewData` has two jobs.** It is both the Obsidian external-load
  callback and an internal "apply new text" API used by removal
  commands. That makes it hard to reason about what callers can assume.

## Part 2 — Proposed design

### `src/scene_operations.ts`

A new pure module. No Obsidian or DOM imports. Everything speaks `Edit[]`.

```ts
import type { FountainScript, Range } from "./fountain";

export interface Edit {
  range: Range;        // positions interpreted against pre-edit text
  replacement: string;
}

export function computeMoveSceneEdits(
  script: FountainScript, range: Range, newPos: number,
): Edit[];

export function computeDuplicateSceneEdits(
  script: FountainScript, range: Range,
): Edit[];

export function computeMoveSceneAcrossFilesEdits(
  src: FountainScript, srcRange: Range,
  dst: FountainScript, dstPos: number,
): { srcEdits: Edit[]; dstEdits: Edit[] };

export function computeAddSceneNumberEdits(script: FountainScript): Edit[];
export function computeRemoveSceneNumberEdits(script: FountainScript): Edit[];

/** Applies edits against the pre-edit text, regardless of caller ordering. */
export function applyEdits(text: string, edits: Edit[]): string;
```

`applyEdits` sorts by `range.start` descending and applies in order;
edits must be non-overlapping. `trailingNewlinesNeeded` stays as an
internal helper within the module.

Unit tests live in `__tests__/scene_operations.test.ts` and use
`parse()` directly, per the repo's no-mocking rule.

### Single programmatic pipeline on `FountainView`

```ts
private applyEditsToFile(edits: Edit[]): void {
  const path = this.file?.path;
  if (!path) throw new Error("No file path available");

  const newText = applyEdits(this.cachedScript.document, edits);
  const newScript = parse(newText, {});

  for (const view of this.findViewsForPath(path)) {
    view.cachedScript = newScript;
    view.state.receiveEdits(edits, newScript);
  }

  if (this.file) this.app.vault.modify(this.file, newText);
}
```

Wrappers collapse to one line each:

```ts
moveScene(r, p)      { this.applyEditsToFile(computeMoveSceneEdits(this.cachedScript, r, p)); }
duplicateScene(r)    { this.applyEditsToFile(computeDuplicateSceneEdits(this.cachedScript, r)); }
addSceneNumbers()    { this.applyEditsToFile(computeAddSceneNumberEdits(this.cachedScript)); }
removeSceneNumbers() { this.applyEditsToFile(computeRemoveSceneNumberEdits(this.cachedScript)); }
```

### `receiveEdits` on the `ViewState` variants

The `ViewState` interface gains:

```ts
receiveEdits(edits: Edit[], newScript: FountainScript): void;
```

Two implementations:

- **`EditorViewState.receiveEdits(edits, _)`** — dispatches `edits` as a
  single CM transaction (`this.cmEditor.dispatch({ changes: edits.map(...) })`).
  The `fountainScriptField` reparses via its `docChanged` path, and the
  existing `updateListener` fires — but we need it to *not* re-trigger the
  sibling-propagation loop. See "avoiding feedback" below. Cursor and
  undo survive, and the operation becomes a single undo step with
  meaningful boundaries.
- **`ReadonlyViewState.receiveEdits(_edits, newScript)`** — ignores the
  edits, adopts `newScript`, re-renders. There is no CM instance to
  dispatch into.

### Avoiding feedback from user-typed edits

User typing still flows through CM's `updateListener` → `onScriptChanged`.
That path must not be routed through `applyEditsToFile` (the text is
already in CM, and we don't have a pre-computed `Edit[]`). It continues
to exist as today, but collapses to:

```ts
// EditorViewState: when CM's doc changes from user input
callbacks.onScriptChanged(update.state.field(fountainScriptField));

// FountainView.onScriptChanged(script):
this.cachedScript = script;
for (const view of this.findViewsForPath(path)) {
  if (view !== this) {
    view.cachedScript = script;
    view.state.receiveScript(script);  // no edits available — full refresh
  }
}
this.requestSave();
```

`receiveScript` is a second, lower-fidelity entry point on `ViewState`:

- `EditorViewState.receiveScript(script)` — full-document CM replace
  (the current `setViewData` behavior). Unavoidable when we have no
  `Edit[]`, but only used for user-typed edits hitting *other* editors
  on the same file.
- `ReadonlyViewState.receiveScript(script)` — same as `receiveEdits`
  without the edit argument.

When `receiveEdits` fires inside an editor and the CM dispatch causes
the `updateListener` to fire `onScriptChanged`, we must suppress the
sibling loop (otherwise we'd propagate twice). A guard flag on
`EditorViewState` set around the dispatch is sufficient; the flag tells
the `updateListener` "this change was programmatic, skip the callback."

### `setViewData` reduced to one job

After this refactor, `FountainView.setViewData` handles only genuine
Obsidian-external reloads. It keeps the short-circuit on unchanged
`data`, parses, and calls `receiveScript` on every view for the path.
The removal-commands call site in `main.ts:359` switches to
`applyEditsToFile(computeRemovalEdits(...))` — which requires the
removal modules to produce `Edit[]` too. That migration can happen in a
follow-up; until then, `main.ts` can compute edits as
`[{ range: {start:0, end: doc.length}, replacement: newText }]` to use
the new pipeline.

`EditorViewState.setViewData` (the full-doc CM replace) is renamed
`receiveScript` and no longer serves as a general "apply new text" API.

### Cross-file moves

`moveSceneCrossFile` becomes:

```ts
moveSceneCrossFile(srcRange: Range, dstPath: string, dstNewPos: number): void {
  const dstView = this.findViewsForPath(dstPath)[0];
  if (!dstView) return;
  const { srcEdits, dstEdits } = computeMoveSceneAcrossFilesEdits(
    this.cachedScript, srcRange,
    dstView.cachedScript, dstNewPos,
  );
  this.applyEditsToFile(srcEdits);
  dstView.applyEditsToFile(dstEdits);
}
```

Two calls into the single pipeline — no inline reimplementation of the
parse/propagate/write sequence.

### Summary of module changes

| File | Change |
|------|--------|
| `src/scene_operations.ts` | New. Pure edit-producing and edit-applying functions. |
| `src/view.ts` | Delete string helpers. `applyTextTransform` replaced by `applyEditsToFile`. Scene wrappers one-liner each. `setViewData` handles only external reloads. |
| `src/view_state.ts` | Add `receiveEdits` and `receiveScript` to interface. |
| `src/editor_view_state.ts` | Implement `receiveEdits` (dispatch CM changes with suppression flag); rename `setViewData` → `receiveScript`. |
| `src/readonly_view_state.ts` | Implement `receiveEdits` / `receiveScript` (adopt script + render). |
| `src/main.ts` | Removal-command call site switches to `applyEditsToFile`. |
| `__tests__/scene_operations.test.ts` | New. Covers each `compute*Edits` plus `applyEdits`. |

### What this buys us

- `view.ts` drops ~140 lines and stops knowing how scenes are represented
  as text.
- Scene operations become trivially unit-testable with `parse()`.
- Cursor, selection, and undo granularity survive programmatic edits in
  the active editor, because edits are dispatched as real CM changes
  rather than full-doc replacements.
- One pipeline (`applyEditsToFile`) for all programmatic mutations; one
  pipeline (`setViewData` → `receiveScript`) for external reloads; one
  pipeline (`onScriptChanged` → `receiveScript`) for user-typed changes
  propagating to siblings. Each has a clear purpose.
- Future features (removal commands, linked edits, find/replace)
  naturally speak the same `Edit[]` vocabulary.

### Out of scope for this refactor

- Migrating `removal_commands.ts` to produce `Edit[]`. The removal
  modals can keep using the compatibility shim in `main.ts` until they
  are refactored separately.
- Splitting `view.ts` further (e.g., extracting a `ViewStateManager`).
  That's a separate concern touched on in the broader code review.

### A note on parsing

An edit triggers two parses: one in `applyEditsToFile` (for `cachedScript`,
the vault write, and readonly siblings) and one in each editor's
`fountainScriptField` on dispatch (for CM's own decorations, folding,
and completion). These are not redundant — they serve different consumers.
A future pass could use the `setFountainScript` effect
(`fountain_state.ts:9`) to hand the pre-parsed script to CM alongside the
dispatch, collapsing the two into one parse per edit per editor. That is
a secondary optimization and not part of this refactor.
