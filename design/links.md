# Links in Fountain Documents

Implemented for v1 as `[[>target]]` and `[[>target|display]]`. This
document covers the permanent design rationale and deferred work —
implementation details live with the code (`src/fountain/parser.peggy`,
`src/links_index.ts`, `src/codemirror/link_completion.ts`,
`src/views/styled_text.ts`, `src/pdf/text_wrapping.ts`).

## Why a custom syntax instead of `[[wiki-links]]`

Obsidian's standard `[[wiki-links]]` can't be reused because Fountain
already uses `[[ ]]` for notes. We extend the existing note syntax with
a new `noteKind` prefix `>`, so any standard Fountain tool that doesn't
know the kind silently treats it as a comment — no graceful-degradation
work needed.

Targets follow Obsidian's wiki-link conventions (with or without
extension, `|` separates display text). External URLs and section
anchors are out of scope for v1.

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

The natural fix for character / location linking is automatic
resolution from filenames (see Deferred features).

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
