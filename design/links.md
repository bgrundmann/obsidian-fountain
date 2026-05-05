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
  scene-heading segment counts as the location) are TBD. This is a
  separate feature from `[[>...]]` and doesn't change the grammar or
  the rename index.

  **Resolution scope: same folder + descendants of the current
  fountain file**, not vault-wide. Vault-wide matching breaks down as
  soon as a vault contains more than one project — `JANE` in *Script
  A* should not light up because `JANE.md` exists for *Script B*. The
  folder rule gives a natural project boundary without a config
  concept. Explicit `[[>...]]` keeps using Obsidian's vault-wide
  shortest-unique-path resolution; the user wrote that target
  deliberately. A `extraLinkRoots` setting (e.g. for a shared
  `Characters/` library) can be added later if real layouts demand
  it — don't pre-build it.
- **Outgoing-links panel** — a plugin-owned sidebar panel listing the
  link targets in the current script, as an in-plugin substitute for
  Obsidian's backlinks pane (which won't see fountain links).
- **Section anchors** in link targets (e.g. `[[>act-two#Scene 5]]`) —
  requires resolving the anchor and scrolling/locating it on click.
- **External URLs / `mailto:` targets** — possible to add via the same
  `>` form by detecting `://`-style targets, but no compelling use
  case yet.

### Embedded links — `[[!>target]]`

Parallel to Obsidian's `![[...]]`. New `noteKind` prefix `!>`
alongside `>`; one-line grammar change plus an `extractEmbeds` helper.

**Per target type:**
- **Fountain** — splice the referenced script's content inline, as if
  it had been written at the embed site. Strip the title page, strip
  the boneyard, drop the `# Snippets` section (an authoring artifact,
  not script content). Recursively resolve the embed's own links and
  embeds, with a cycle guard (visited set keyed by resolved path);
  render an inline error if a cycle is detected.
- **Markdown** — render via `MarkdownRenderer.render` inside the
  embed frame.
- **Images** — render at the page content width (page width minus
  margins). Reading view: `width: 100%` of the embed container. PDF:
  printable region width, aspect-ratio preserved, capped at the
  printable page height so a tall image doesn't force a multi-page
  split.
- **Anything else** (PDFs, audio, etc.) — fall back to rendering as a
  plain `[[>...]]` link.

**Reading view chrome:** fold/collapse toggle, no max-height. Each
embed is its own foldable block.

**Editor view:** show the literal `[[!>...]]` text, consistent with
how `[[>...]]` is shown today. No inline preview in the editor — the
reading-view fold is enough.

**Scene numbers:** stage 1 does nothing special. Embedded fountain
scenes carry whatever number text they already have (or none); the
scene-numbering command treats embeds as opaque. A future change can
make the numbering command descend into embeds and write back to the
referenced files via `applyEditsToFountainFile`, which is the
"what-you'd-expect" behaviour but mutates other files and so wants
its own design pass.

**Clickable PDF annotations** become useful once embeds exist: the
embed site emits a Named Destination, and any `[[>...]]` reference to
the same target is rendered as an intra-PDF GoTo annotation
(`pdf-lib` supports both). Plain `[[>...]]` without a corresponding
embed continues to render as display text only — a clickable link to
a `.md` file the reader doesn't have is dead weight.
