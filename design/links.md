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

## How links render

A `[[>target]]` is a Fountain note with `noteKind = ">"`, and it
follows the same visibility rule as every other note:

- **PDF export**: with `Hide notes` on, links are omitted entirely.
  With `Hide notes` off, the link's display label (or the target name
  if no `|display` was given) is rendered as plain inline text.
- **Reading view**: under the reading-view note-visibility toggle, the
  same rule applies — links render as clickable styled text when notes
  are visible, and disappear when notes are hidden.

This is the simple consistent rule, and it follows from the grammar
choice: a `>` note is still a note. The corollary is that `[[>...]]`
is a *navigation annotation*, not a way to inject inline prose into
the printed script. Writing `[[>kitchen|kitchen]]` to make the word
"kitchen" clickable inside an action line will leave a gap when the
user generates a clean PDF — the cleaner pattern is plain prose plus
filename-based automatic linking (see Deferred features) so the
visible text is content and the linkage is layered on top by the
plugin.

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

## Embeds (unsettled)

There is no embed feature today; this is sketch-level thinking, not a
spec. A `[[!>target]]` form parallel to Obsidian's `![[...]]` would be
the natural way to splice referenced content into a script — a
fountain file inlined as if written at the embed site, a markdown
note rendered in place, an image scaled to the printable region. The
grammar cost is small (a new `noteKind`).

Beyond that, the design is open. Among the questions a real design
pass would have to answer: what to strip from an embedded fountain
file (title page, boneyard, `# Snippets`); how recursive embeds and
cycles are detected and reported; whether the scene-numbering command
descends into embeds and writes back through `applyEditsToFountainFile`;
whether embeds should track `hideNotes` or have their own visibility
toggle, given that they carry script content rather than authorial
annotation; and whether `[[>...]]` references to an embedded target
should be promoted to clickable intra-PDF GoTo annotations once a
Named Destination exists at the embed site.

Resolving these belongs to its own design document, not this one.
