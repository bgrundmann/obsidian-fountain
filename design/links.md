# Links in Fountain Documents

This is a plan for a basic support for links. Currently on the maybe list.

## Motivation

Screenplay writers using Obsidian often want to link from Fountain documents
to other files — other `.fountain` scripts, `.md` character notes, research
documents, etc. Obsidian's standard `[[wiki-links]]` can't be used because
Fountain already uses `[[ ]]` for notes (comments).

## Syntax

We extend the existing Fountain note syntax with a new `noteKind` prefix:

```
[[>target]]
[[>target|display text]]
```

The target follows Obsidian's wiki-link conventions:
- Can include or omit file extensions (`act-two` or `act-two.fountain`)
- Can include section anchors: `[[> act-two#Scene 5]]`
- `|` separates optional display text

### Graceful degradation

Since these are syntactically Fountain notes, any standard Fountain tool will
silently ignore them — they degrade to invisible comments.

## Resolution

Links resolve the same way Obsidian resolves wiki-links in Markdown files
(shortest unique path, searching the vault). We use
`app.metadataCache.getFirstLinkpathDest()` for resolution.

## Rendering

### Reading view

Links render as clickable, styled links. (Precedent: margin marks `[[@marker]]`
already render as visible notes.) Clicking a link navigates to the target file.

### Editor view

Links are syntax-highlighted to distinguish them from plain notes.

Typing `[[>` triggers autocomplete with vault file names (similar to how
Obsidian's own `[[` completer works in Markdown). Uses a CodeMirror
`CompletionSource`, following the same pattern as the existing character name
completion. On selection, the target filename and closing `]]` are inserted.
Display text (`|...`) is not part of completion — the user adds it manually
if needed.

### PDF export

- If display text is present, render the display text inline.
- If no display text, render the filename.
- Links only appear if their containing element would be rendered
  (e.g. a link inside a synopsis is omitted when synopses are hidden).

## Backlinks and Graph View

### The problem

Obsidian's `metadataCache` is built for `.md` files. There is no public API
for plugins to register links from non-Markdown files into `resolvedLinks` /
`unresolvedLinks`. This means links in `.fountain` files will **not**
automatically appear in:

- The backlinks pane
- The graph view
- `getBacklinksForFile()` results

This is a known gap in the Obsidian plugin API:
- https://forum.obsidian.md/t/api-method-to-add-link-and-have-it-parsed-into-metadatacache/72046
- https://forum.obsidian.md/t/store-backlinks-in-metadatacache/67000

### Prior art

The [obsidian-advanced-canvas](https://github.com/Developer-Mike/obsidian-advanced-canvas)
plugin achieves full graph view and backlinks integration for `.canvas` files
by monkey-patching several undocumented internal APIs (`metadataCache.saveFileCache`,
`saveMetaCache`, `computeFileMetadataAsync`, `getCache`, direct mutation of
`resolvedLinks`/`unresolvedLinks`, and patching `vault.getMarkdownFiles()` during
backlink recomputation). This works but is fragile — it relies entirely on
internal APIs that can break with Obsidian updates.

### Current plan

We choose not to pursue the monkey-patching approach. Start without backlinks
integration. The core value — clickable navigation between fountain and other
files — works without it. Backlinks can be revisited if Obsidian adds a public
API for non-Markdown file types.

## Unresolved questions

1. **Where can links appear?** With the current design, links can only appear
   where notes can appear — inline within action, dialogue, etc. But two
   obviously useful places for links don't support notes in standard Fountain:
   - **Character names** — linking a character name to a character notes file
     would be very natural, but character lines are parsed as a single uppercase
     token, not as rich text that can contain notes.
   - **Scene headings** — linking a scene heading to a location research file
     would be useful, but scene headings also have limited inline formatting.

   Options: (a) allow links only where notes already work and accept the
   limitation, (b) extend the grammar to allow notes/links in character names
   and scene headings, (c) provide a different mechanism for these cases
   (e.g. a convention where a link note on the line immediately following a
   character or scene heading is treated as associated with it).

## Parser changes

One new `NoteKind` variant in the Peggy grammar:

- `">"` — matches `[[>...]]`

The parser does not split target from display text — that happens at the
semantic layer when rendering or resolving.
