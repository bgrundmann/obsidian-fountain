# Links in Fountain Documents

This is a plan for basic support for links. Currently on the maybe list.

Screenplay writers using Obsidian often want to link from Fountain
documents to other files — other `.fountain` scripts, `.md` character
notes, research documents, etc. Obsidian's standard `[[wiki-links]]`
can't be used because Fountain already uses `[[ ]]` for notes (comments).

---

# Part 1: Implementation

The implementer can stop reading after this part. Part 2 covers
rationale and deferred work.

## Syntax

We extend the existing Fountain note syntax with a new `noteKind` prefix:

```
[[>target]]
[[>target|display text]]
```

The target is a vault-relative path following Obsidian's wiki-link
conventions:
- Can include or omit file extensions (`act-two` or `act-two.fountain`)
- `|` separates optional display text

External URLs and section anchors are **out of scope for v1**.

Because `[[>...]]` is syntactically a Fountain note, any standard
Fountain tool that doesn't know the `>` kind silently treats it as a
comment — no action needed for graceful degradation.

## Parser changes

One new `NoteKind` variant in the Peggy grammar:

- `">"` — matches `[[>...]]`

The parser does not split target from display text — that happens at
the semantic layer when rendering or resolving.

## Resolution

Links resolve via `app.metadataCache.getFirstLinkpathDest()`, the same
way Obsidian resolves wiki-links in Markdown files (shortest unique
path, searching the vault).

## Rendering

### Reading view

Links render as clickable, styled links. Clicking navigates to the
target. (Precedent: margin marks `[[@marker]]` already render as
visible notes.)

### Editor view

Links are syntax-highlighted to distinguish them from plain notes.

Typing `[[>` triggers autocomplete with vault file names. Uses a
CodeMirror `CompletionSource`, following the same pattern as the
existing character name completion. On selection, the target filename
and closing `]]` are inserted. Display text (`|...`) is not part of
completion — the user adds it manually if needed.

### PDF export

- If display text is present, render the display text inline.
- If no display text, render the filename.
- Links only appear if their containing element would be rendered
  (e.g. a link inside a synopsis is omitted when synopses are hidden).
- Links render as plain text, not as clickable PDF annotations.

## Rename handling

Obsidian automatically rewrites `[[wiki-links]]` in `.md` files when
their target is renamed, but only for markdown. For `.fountain` files
we do the equivalent ourselves. All necessary APIs are public.

### Index

In-memory `targetPath → Set<fountainFile>` — a coarse filter answering
"which fountain files might reference this target?" The parser provides
precise ranges on demand, so the index does not store ranges.

- Populated on plugin load by scanning all `.fountain` files (parse,
  walk for `>` notes, resolve each target via
  `app.metadataCache.getFirstLinkpathDest`).
- Updated on `vault.on('modify' | 'create' | 'delete')` for the changed
  file by re-parsing just that file.

### On rename of a link target

Listen to `vault.on('rename', file, oldPath)`:

1. Look up `oldPath` in the index to get the set of referencing
   fountain files.
2. For each referencing file, parse it, walk for `>` notes whose target
   resolves to `oldPath`, and compute the new linktext via
   `app.metadataCache.fileToLinktext(file, sourcePath)` — preserves the
   "with/without extension, basename vs path" form the user originally
   used.
3. Build an `Edit` per occurrence and push them through
   `applyEditsToFountainFile(app, path, edits)` (in `src/edit_pipeline.ts`).
   The pipeline auto-selects between the open editor's CM state (when
   a view is open — preserves cursor/undo) and a disk read (when the
   file is closed), reparses once, distributes the edits, and writes
   to disk.
4. Update the index: move the file set from `oldPath` to the new path.

### On rename of a `.fountain` file

Nothing fountain-specific is required for *incoming* `.md` → fountain
links — Obsidian core handles those. We only need to:

- Re-key the index entries owned by the renamed file.
- Rewrite any *outgoing* `>` notes whose targets are expressed as
  relative paths that the rename invalidated. (For basename-only
  targets that resolve via `getFirstLinkpathDest`, the resolution is
  unaffected — no rewrite needed.)

### Edge cases

- **Folder renames**: Obsidian fires per-file rename events for every
  contained file, so the per-file logic handles them transparently.
- **Unresolved targets**: link text that doesn't currently resolve
  should still be tracked (keyed by literal target string) so that
  creating a file with that name later lights it up — but rewriting on
  rename only applies to *resolved* links.
- **Conflicts with the user editing**: rewrites must go through
  `applyEditsToFountainFile`, never direct `vault.modify`, otherwise
  an open editor's typed-but-unsaved state would be clobbered.

---

# Part 2: Rationale and deferred work

## Why no backlinks / graph-view integration

Obsidian's `metadataCache` is built for `.md` files. There is no public
API for plugins to register links from non-Markdown files into
`resolvedLinks` / `unresolvedLinks`. Links in `.fountain` files
therefore won't appear in:

- The backlinks pane
- The graph view
- `getBacklinksForFile()` results

Known gap in the Obsidian plugin API:
- https://forum.obsidian.md/t/api-method-to-add-link-and-have-it-parsed-into-metadatacache/72046
- https://forum.obsidian.md/t/store-backlinks-in-metadatacache/67000

### Prior art

The [obsidian-advanced-canvas](https://github.com/Developer-Mike/obsidian-advanced-canvas)
plugin achieves full graph-view and backlinks integration for `.canvas`
files by monkey-patching several undocumented internal APIs
(`metadataCache.saveFileCache`, `saveMetaCache`,
`computeFileMetadataAsync`, `getCache`, direct mutation of
`resolvedLinks` / `unresolvedLinks`, and patching
`vault.getMarkdownFiles()` during backlink recomputation). It works
but is fragile — it broke in Obsidian 1.8.3.

We choose not to pursue this. The core value — clickable navigation
between fountain and other files — works without it. Revisit if
Obsidian adds a public API for non-Markdown file types.

## Why no character / scene-heading link convention

Character lines and scene headings are parsed as single tokens, so a
`>` link note can't appear inline inside them. We deliberately do
**not** introduce a convention like "a link note on the line after a
heading attaches to the heading" — that pushes the user to litter the
source with extra link notes that exist purely to create a link, which
is ugly and clutters the script.

For v1, explicit links live only where notes already work (inside
action, dialogue, synopses, etc.). The natural fix for character /
location linking is automatic resolution from filenames (see Deferred
features).

## Deferred features

- **Automatic links from filenames** — derive character/location links
  from the vault with **no** syntax in the fountain source: if
  `JANE.md` exists, render every `JANE` character line as a link; if
  `KITCHEN.md` exists, render that location segment of the scene
  heading as a link. Matching rules (case sensitivity, which
  scene-heading segment counts as the location, configurable folder
  layout) are TBD. This is a separate feature from `[[>...]]` and
  doesn't change the grammar or the rename index.
- **Outgoing-links panel** — a plugin-owned sidebar panel listing the
  link targets in the current script, as an in-plugin substitute for
  Obsidian's backlinks pane (which won't see fountain links).
- **Clickable PDF annotations** — `pdf-lib` supports them, but they're
  only really useful when paired with embedding the linked documents
  into the exported PDF, which is a larger "embed linked documents"
  feature.
- **Section anchors** in link targets (e.g. `[[>act-two#Scene 5]]`) —
  requires resolving the anchor and scrolling/locating it on click.
- **External URLs / `mailto:` targets** — possible to add via the same
  `>` form by detecting `://`-style targets, but no compelling use
  case yet.
