# Changelog

## [0.34.3] - Two-Pane Typing No Longer Loses Keystrokes

- **Fix**: With the same file open in two panes (e.g. editor beside index cards), typing in the editor no longer gets interrupted by the cursor jumping to the top of the file — which also silently rolled back the most recently typed words. Every autosave delivers a snapshot of the document to the sibling pane, and when typing continued during the write that snapshot was stale; the sibling's reload handler then broadcast the stale text back into the live editor, replacing its document wholesale. Reloads now update only the pane they were delivered to (live cross-pane sync during typing was always handled separately and is unaffected). To avoid re-parsing on every autosave echo, a pane adopts a sibling's already-parsed script when the contents match. Reported in #36.
- **Internal**: New `test/e2e/specs/two_pane_autosave.e2e.ts` reproduces the clobber deterministically by typing into the autosave's write window; it runs in its own Obsidian session because leftover debounced autosaves from sibling specs can mask the data loss.

## [0.34.2] - Forced Character Marker Hidden in Render

- **Fix**: Forced character cues (`@KOOL-AID MAN`, `@McDonald`) no longer render the literal `@` in the preview, PDF, or the rehearsal/completion/removal character lists. The `@` is a parser-only hint per the Fountain spec; it now lives on a separate `Dialogue.forcedMarkerRange` (mirroring `caretRange`) while `characterRange` covers just the name, so every consumer that slices `characterRange` gets the displayable name for free. Reported in #31.

## [0.34.1] - Edit↔Readonly Toggle Drift Fix

- **Fix**: Repeatedly toggling between edit and readonly modes no longer drifts the view upward toward the title page. The editor's `scrollToHere` carries a 50px ergonomic margin so click-to-navigate doesn't land flush at the very top — but the toggle's scroll-restoration path was using the same call, so each readonly→edit leg pushed the anchor line 50px below the top, and the next readonly→edit cycle re-anchored on whatever was now at the top. Restoration now uses a margin-free, selection-preserving variant; click-to-navigate still keeps the margin.

## [0.34.0] - Section Editing in Index Cards

Sections are now first-class citizens in the index card view, same as scenes — you can rename them, change their depth, delete them, and insert new ones at any position without leaving the card view.

- **Section pencil rename**: The same pencil that renames scene headings now also renames section headings. The input shows the full `## Title` form so you can change depth (`# Top` → `### Top`) by editing the leading `#`s, and clearing the input deletes the section heading entirely (children flow up to the parent on reparse). The title portion is pre-selected so typing replaces just the title without disturbing the `#…` prefix.
- **Stacked `+` / `#` gutter buttons**: The hover gutter on each scene card now carries two buttons — `+` for a new scene, `#` for a new section. Both auto-focus the rename input on the freshly inserted card / heading. The `#` always inserts a depth-1 section; promote later via the rename input. A right-edge variant appears on the last scene of each section so you can append a scene or section at the boundary just before the next sibling section.
- **Edge `+ section` bars**: A horizontal `+ section` bar appears above the first section (when the doc starts with one) and at the bottom of the doc, so you can prepend or append a section without finding a specific card to anchor to. Bars between every pair of sections were prototyped and judged redundant — the vertical `#` button on the previous section's last scene already covers that position.
- **Empty-doc dashed `+` card**: A fresh `.fountain` file now opens to a single dashed `+` card flanked by both `+ section` bars, so section-first and scene-first starts both have an obvious aim point.
- **Pre-select on scene rename**: The scene heading input now pre-selects its placeholder text, so typing immediately replaces `.SCENE HEADING` instead of appending to it.
- **Fix**: Inserting a scene from the dashed `+` card on a freshly-renamed section silently bailed because the parser left a synthetic empty section bucket in front of the real one — that bucket surfaced its own dashed `+` card with a NaN range, and the auto-focus query found nothing. The cards renderer now skips sections with no heading and no renderable content.
- **Internal**: New `test/e2e/specs/index_card_section_editing.e2e.ts` covers all the section-editing paths (insert, auto-focus, depth change, delete-via-empty-input) and the synth-section regression. Design rationale lives in `design/section_editing_in_index_cards.md` (slimmed: prototype removed, mechanics moved into code/tests).

## [0.33.2] - Structural Marker Spec Compliance

- **Fix**: `# Section` headings, `= synopsis` lines, and `===` page breaks now require their marker at column 0, matching the Fountain spec (and Highland). Previously the parser accepted leading whitespace before all three. An indented `  # heading` / `  = synopsis` is now an action line; an indented `  ===` no longer creates a page break.
- **Fix**: Synopsis ranges no longer absorb the trailing blank-line separator. Highland treats synopses (like sections) as invisible structural markers — they don't carry paragraph spacing. The blank line after a synopsis now belongs to the next paragraph.
- **Fix**: `# Section` and `= Synopsis` markers are now recognized when they appear mid-paragraph (no blank line before them). Previously `Foo\n# Heading\nBar\n` parsed as a single Action with the heading absorbed as text; matching Highland behavior, the heading is now its own Section element.
- **Internal**: Conversely, Lyrics ranges now *do* include their trailing blank-line separator (matching Action, Dialogue, and other paragraph-block elements), so deleting a lyrics block via its range cuts cleanly without orphaning a blank line on the next element.
- **Internal**: New `__tests__/leading_whitespace.test.ts`, `__tests__/trailing_blank_line.test.ts`, and `__tests__/structural_marker_mid_paragraph.test.ts` pin the rule-2 contract (range covers full lines including trailing blank where appropriate, structural markers recognized regardless of surrounding context) for every line-based element so future refactors can't silently drift. AST design rules now live as a comment block in `src/fountain/types.ts` near the AST element types.

## [0.33.1] - Right Sidebar Hijack Fix

- **Fix**: Opening a `.fountain` file no longer force-converts the right sidebar's `outline`, `backlink`, and `outgoing-link` views into fountain script views. The auto-rename handler that catches markdown leaves accidentally pointed at `.fountain` files (introduced in 0.32.0) was iterating *all* leaves and matching any view whose `.file` happened to track the active file — which is exactly what the right-sidebar reference views do. Restricted to `markdown` view types only, matching the original intent.
- **Internal**: `FountainScript.titlePage` is now `TitlePage | null` (previously `KeyValue[]`), with `TitlePage.range` covering the whole title-page block including its trailing blank-line separator. Establishes the convention that line-based AST elements own their trailing blank line so that deleting `range` from `document` cuts cleanly.

## [0.33.0] - Dual Dialogue

- **Dual dialogue (`^` marker)**: Two characters speaking simultaneously now render side-by-side in the readonly view and PDF. Mark the second of two consecutive dialogues with a trailing `^` (e.g. `STEEL ^`) and the pair gets two columns. The first dialogue carries no marker, matching the Fountain spec.
- **Caret feedback in the editor**: Valid `^` markers (the caret formed a pair) render dimmed; orphan or unpaired carets render in the theme's error color, so you can see at a glance when a `^` had no effect (e.g. predecessor isn't a dialogue, or a third caret in a row that can't pair).
- **PDF column wrapping**: Each column wraps at the narrower per-column width (~25 chars), not the full single-column width. v1 doesn't split a dual pair across pages — an over-tall pair ejects to the next page.

## [0.32.1] - Boneyard at start of paragraph

- **Fix**: A multi-line boneyard (`/* … */`) that opens its own paragraph is now correctly treated as boneyard. Previously the parser accepted `/*` as a character name (the uppercase predicate didn't require any letters), so `/*\n…\n*/` followed by content was swallowed as Dialogue and never reached the boneyard rule. The `Character` predicate now requires at least one alphabetical character, matching the Fountain spec ("R2D2 works, but 23 does not").

## [0.32.0] - Fountain Links Create `.fountain` Files

- **Following an unresolved `foo.fountain` link now creates `foo.fountain`**, not `foo.fountain.md`. Applies both to `[[>foo.fountain]]` from a fountain file (handled directly in the plugin's link click handler) and to `[[foo.fountain]]` / `[foo.fountain](foo.fountain)` from a markdown file (Obsidian's core handler still creates `foo.fountain.md`, but a vault listener immediately renames the empty file and a workspace listener swaps any leaf still showing it as markdown onto the registered fountain view).
- **Internal**: There is no public API to override the extension Obsidian picks for files created from unresolved wiki-links — the workaround is documented in `src/main.ts` with a pointer to the open Obsidian forum thread, to be removed once an official hook lands.

## [0.31.0] - Links Follow "Hide Notes"

- **`[[>...]]` links now obey the note-visibility toggle**: Both the PDF dialog's **Hide notes** option and the reading view's note toggle treat link display text the same as any other note. With notes visible the link label still renders inline as plain text (exactly as before); with notes hidden the whole link disappears. A clean shooting-script export shouldn't carry authorial cross-references, and a `>` note is still a note — making links a carve-out was the inconsistency. Design rationale in `design/links.md`.
- **Migration note**: `[[>kitchen|kitchen]]`-style inline content links will now leave a gap in hide-notes PDFs. Use plain prose for words you want in the printed script and reserve `[[>...]]` for navigation annotation.

## [0.30.1] - Link Completion While Editing

- **Edit-aware `[[>...]]` completion**: Completing inside an existing `[[>oldname]]` (or `[[>oldname|My Display]]`) now replaces the whole linktext cleanly. Picking a candidate consumes the trailing `]]` (and any `|alias`), so you no longer end up with `[[>NewName]]]]` or stray alias text. The completion popup also appears while the cursor sits inside a closed link — previously typing inside `[[>partial]]` to point it elsewhere produced no suggestions.
- **Anchors at the most recent `[[>`**: When two `[[>` openings sit on the same line, completion now fires for the one nearest the cursor instead of treating everything back to the first opener as one prefix.
- **Internal**: The wider replacement (eating `|alias` and `]]`) moved into a per-option `apply` function so CodeMirror's filter pattern stays bounded to what the user has typed; widening `result.to` past the cursor poisoned the fuzzy match and was the root cause of the "popup never appears" symptom. New unit tests in `__tests__/link_completion.test.ts` cover the editing scenarios and lock in `result.to <= cursor` as a regression guard.

## [0.30.0] - Index Card UX Overhaul

The index card view is now a *structural* read on your script — a map you can rearrange. Operations that change the *shape* of the outline (navigation, reorder, rename, insert) live on the cards; operations that change scene *contents* (synopsis text, dialogue, action) live in the editor. The toggle between them is the most important affordance.

- **Toggle (⌘⇧I)**: New rebindable shortcut that round-trips between the editor (or readonly script) and the index card view. From the editor, the card for the scene-under-cursor scrolls into view. From the cards, the editor opens at the *start of scene content* of the topmost visible card — the synopsis when one exists, otherwise the first action/dialogue line. A round-trip with no edits leaves you (approximately) where you started.
- **Click anywhere on a card to navigate**: Clicking the body of a card now jumps to that scene in the editor. No more per-region click model — the card has one job.
- **Pencil renames headings inline**: The pencil button in the top-right corner of each card opens an inline rename. `Enter` saves, `Esc` cancels, click outside also saves — so renaming a string of headings is a fluent click → type → click → type sequence. The input is fully chrome-less (no border, no shadow, just a tinted background) so the heading doesn't jump when you start editing.
- **Insertion gutter**: Hover between any two cards (or before the first / after the last) to reveal a thin accent bar with a "+" icon. Click to insert a new `.SCENE HEADING` placeholder at that position; the new card auto-focuses its rename input. The dashed `+` card at the end of each section uses the same path and now also auto-focuses (previously it inserted but left you to find the new heading).
- **Select current scene (⌘⇧L)**: New rebindable command in the editor that selects the entire `scene.range` — heading line through the line before the next scene/section heading. Designed as a primitive that composes with the system clipboard: `⌘X` to delete a scene, `⌘C` then `↓` then `⌘V` to duplicate, or cut-and-paste to move a scene across files.
- **Drag a card into Snippets**: Dragging a scene card onto the snippets section in the sidebar copies it as a new snippet. The original scene stays in the script (snippets are a library, not a destination). Cross-file drags are supported — the scene lands in the *destination* script's `# Snippets` section.
- **Removed from the cards view**: synopsis editing (synopses now contain styled text — `[[>links]]`, formatting, notes — that an inline `<textarea>` can't edit; the fast path is now click → edit → ⌘⇧I back) and the ellipsis menu's Copy/Edit/Delete (covered by ⌘⇧L plus the system clipboard, with the upside that the same primitive works across files and into snippets sections).

## [0.29.0] - Index Card Drag & Drop Overhaul

- **Drag handle**: Cards now show a grip icon at the top-left and drags only originate from there. The rest of the card is no longer a drag source, so clicking on the synopsis or scene heading to edit it can't be misread by the browser as the start of a drag.
- **Reliable drops**: Fixed a long-standing bug where releasing the mouse over a child element of the target card (the heading, synopsis, ellipsis menu) silently did nothing. The drop indicator was being stripped by `dragleave` events fired when the cursor crossed into a nested element; the leave check now uses `relatedTarget` containment so child traversal no longer cancels the drop.
- **Clearer drop indicator**: The "drop here" cue is now a colored insertion bar on the left or right edge of the target card. Previously the target card translated 5px sideways, which was easy to miss and read as "this card is moving" rather than "your card lands here." Splits cleanly at 50% so every position on a target produces an action — there's no longer a dead zone in the middle of each card.
- **Source card fades while dragging**: The card you picked up dims to 40% opacity for the duration of the drag, and the drag preview is the whole card (via `setDragImage`) rather than a tiny grip-icon image.
- **Cards animate into place after a drop**: A 200ms FLIP transition slides every card whose position changed from its old spot to its new one. Makes adjacent swaps unambiguous instead of looking like nothing happened. Respects the OS `prefers-reduced-motion` setting.

## [0.28.0] - Styled Synopses

- **Synopsis content is now full-featured**: Synopsis lines (`= ...`) parse the same inline syntax as action and dialogue, so you can use `**bold**`, `*italics*`, `_underline_`, boneyard, todo/note kinds, margin marks, and `[[>links]]` inside a synopsis. Synopses render with the styling in reading view, the TOC sidebar, the index cards, and the editor; PDF export keeps the existing italic+gray base style and layers `**bold**` on top as bold-italic-gray.
- **Links in synopses are real links**: `[[>...]]` inside a synopsis is clickable in reading view and tracked by the rename index, so renaming a target file rewrites references in synopses just like references in action/dialogue.
- **TOC sidebar styling fix**: Bold/italic/underline and the plugin's link styling were scoped to `.screenplay` and didn't apply under `.screenplay-toc`. Synopsis content in the TOC sidebar now picks up the same styling as the reading view.

## [0.27.1] - Index Card Drag/Drop Fixes

- **Same-file scene moves**: Dragging a scene to a new position within the same file no longer trips Obsidian's "modified externally" detection and no longer lands in the wrong position on forward moves. The previous code issued the source-delete and destination-insert as two separate `vault.modify` writes against an inconsistent base text; both edits now flow through a single batched edit.
- **Cross-file scene moves**: Dragging a card from one fountain file's index card view onto another file's index cards now correctly moves the scene. Previously the drop handler ignored the source path captured at drag-start and treated the destination view as the source, so the move corrupted the destination file rather than transferring the scene.
- **Internal**: Replaced `moveSceneCrossFile` with `moveSceneAcross({srcPath, srcRange, dstPath, dstPos})`. Added e2e tests that drive real DragEvents through the index-cards DOM listeners.

## [0.27.0] - Links!

- **Links between fountain files** (`[[>target]]`): New note kind for clickable inter-file links. Use `[[>filename]]` or `[[>filename|display text]]` to link to other `.fountain` scripts, `.md` notes, or any vault file. Targets resolve via Obsidian's standard wiki-link rules (basename or path, with or without extension).
  - **Reading view**: Links render as styled, clickable text. Mod/Ctrl-click opens in a new tab.
  - **Editor**: Links are syntax-highlighted; typing `[[>` triggers autocomplete with vault file names.
  - **PDF export**: Links render inline as plain text (display text if present, otherwise the target).
  - **Rename rewriting**: When a link target is renamed, references in `.fountain` files are rewritten automatically. Works whether the file is open or not, and preserves typed-but-unsaved editor state.
  - Because `[[>...]]` is syntactically a Fountain note, any other Fountain tool that doesn't recognize the `>` kind will silently treat it as a comment.
- **Cursor and undo survive programmatic edits**: Operations that modify the document from outside the editor — scene moves, scene duplication, cross-file scene moves, add/remove scene numbers, and removal commands applied to the current file — now preserve the cursor position and leave a single undoable step in the editor. Previously these replaced the entire CodeMirror document, which reset the cursor and collapsed the change into one opaque undo.
- **Back navigation** from a fountain file now reliably returns to the file you came from (`setState` records each fountain-file transition in the leaf's history).
- **Internal**: Scene-level text manipulation moved out of `view.ts` into a pure `scene_operations.ts` module, and all programmatic document mutations now flow through a single `applyEditsToFile` pipeline. Added e2e tests for cross-view sync and cursor preservation.

## [0.26.2] - Bugfix

- **Fold Chevrons**: Fixed a visual glitch where fold indicators (chevrons) next to scene headings in edit mode would sometimes disappear or double when editing near a scene heading. The root cause was a timing issue: the fold gutter queried the parsed script before it had been updated to reflect the latest document changes. Parsing is now done in a CodeMirror StateField, ensuring it is always in sync when the fold gutter reads it.

## [0.26.1] - Bugfix

- **Forced Scene Headings**: The leading period (`.`) used to force a scene heading is now correctly stripped from the displayed heading text in the reading view, sidebar, and PDF output, as required by the Fountain spec.
- **Interleaved Parentheticals**: Parentheticals are now correctly recognized after dialogue lines, not only after the character name. This matches the Fountain spec which allows parentheticals anywhere within a dialogue block (e.g. `(beat)` between lines of dialogue).

## [0.26.0] - Find and Replace, UI Polish

- **Search and Replace**: Full search and replace support in the editor via Cmd/Ctrl+F
  - Find text, replace single or all occurrences
  - Case sensitivity, regular expression, and whole word toggles
  - Match highlighting with navigation between results
  - Styled to match Obsidian's native UI
- **Edit Mode Toggle**: Cmd/Ctrl+E now toggles edit mode when a fountain view has focus
  - Works like Obsidian's native edit toggle but scoped to fountain files
  - No custom hotkey binding needed
- **Snippets UX Improvements**:
  - Cmd/Ctrl+Shift+X moves selection to snippets, Cmd/Ctrl+Shift+C copies it
  - Drag and drop text into the snippets area in the sidebar
  - Snippets drop zone always visible in sidebar for discoverability
  - Removed distracting "Snip" tooltip button that appeared on every selection
  - Note: the global "Copy/Move selection to snippet" commands have been removed in favor of the scoped shortcuts above
- **E2E Testing**: Added end-to-end tests using wdio-obsidian-service
  - Tests run against real Obsidian instance
  - Covers edit mode toggling and snippet insertion
- **Dependencies**: Upgraded peggy 5, TypeScript 5.9, esbuild, Jest 30; removed unused biome and eslint

## [0.25.0] - Spelling Woes

- **Toggle Spell Check**: New command to enable/disable spell checking in the editor
  - Spell check is off by default to avoid distraction during creative writing
  - Toggles the browser's built-in spell checker
  - Shows a notification when toggled ("Spell check enabled" / "Spell check disabled")
  - Setting persists while the file is open but resets when closed

## [0.24.0] - Index Card Previews

### Added
- **Index Card Previews**: Scenes without a synopsis now show a content preview in the index card view
  - Uses the same preview logic as the sidebar TOC
  - Previews show up to 220 characters of action/dialogue content (more than in the sidebar TOC)
  - Clicking on a preview still opens the synopsis editor

### Fixed
- **Empty Synopsis Handling**: Clearing a synopsis in the index card editor now removes it entirely instead of leaving an empty `= ` line

### Improved
- **Code Cleanup**: Refactored text extraction methods for clarity
  - Renamed `unsafeExtractRaw` to `sliceDocument` and `sliceDocumentForDisplay`
  - Removed unused HTML escaping code

## [0.23.0] - Scene Preview in TOC

### Added
- **Scene Preview**: When a scene has no synopsis, the sidebar TOC now shows the first lines of content (action or dialogue) as a preview
  - Makes it easier to navigate screenplays with many similar scene headings
  - Previews are truncated to ~100 characters
  - Dialogue shown as "CHARACTER: first line..."
  - Controlled by the "preview?" toggle (renamed from "synopsis?")

### Improved
- **TOC Styling**: Refreshed sidebar TOC appearance
  - Uses UI font for better readability (previews still use Courier Prime)
  - Added hover highlighting for clickable items
  - Better spacing between scenes
  - Content indented under section headings (only when sections are present)

## [0.22.1] - Margin Marks on the left

- **Margin Marks on the left**: Margin marks (`[[@word]]`) now render on the left margin (as that tends to be larger than the right margin)

## [0.22.0] - Margin Marks in PDF

### Added
- **Margin Marks in PDF Export**: Margin marks (`[[@word]]`) now render in the right margin of generated PDFs, matching their appearance in reading view
  - Displayed in uppercase, gray text in the right margin
  - Positioned on the same line where they appear in the source text
- **Hide Margin Marks Toggle**: New option in PDF export dialog to show/hide margin marks independently of regular notes
  - Defaults to showing margin marks (unchecked)
  - Margin marks are controlled separately from the existing "Hide notes" option

## [0.21.0] - Scene Folding

### Added
- **Scene Folding**: Code folding support for scenes in edit mode
  - Fold/unfold scenes using the fold gutter or keyboard shortcuts
  - Visual fold indicators in the editor gutter

## [0.20.0] - Content Filtering Commands

### Added
- **Content Filtering/Removal Commands**: Three new commands for creating filtered versions of scripts
  - **Remove Character Dialogue**: Select specific characters whose dialogue to remove
    - "Select All" toggle for bulk selection
    - Scrollable character list for scripts with many characters
  - **Remove Scenes and Sections**: Hierarchical tree view for selecting structural elements
  - **Remove Element Types**: Filter by fountain element types (action lines, transitions, synopsis, etc.)
  - **Safety Features**: 
    - Default creates a filtered copy with unique naming (e.g., "Script (filtered).fountain")
    - Original file remains untouched
    - Option to modify file directly (with warning about no undo in readonly mode)

## [0.19.0] - Scene Numbers

### Added
- **Scene Numbers**: Full Fountain standard conforming support for scene numbers
  - Parse scene numbers in the format `#alphanumeric#` at the end of scene headings (e.g., `INT. HOUSE - DAY #2A#`)
  - Display scene numbers in bold on both left and right margins in reading view
  - Include scene numbers in PDF exports.
  - Scene numbers are optional - scenes without numbers continue to work exactly as before
- **Scene Numbering Commands**: Two new commands for managing scene numbers
  - **Add scene numbers**: Automatically adds sequential scene numbers to scenes that don't already have them. Starts at #1# and increments, but continues from existing numeric scene numbers (e.g., if a scene has #6#, the next unnumbered scene gets #7#). Non-numeric scene numbers like #5A# are preserved but don't affect the sequential counter.
  - **Remove scene numbers**: Removes all scene numbers from all scenes in the document.

## [0.18.0] - Page numbers

- Page numbers in PDF exports.  Following standard screenplay convention neither title page nor the first page numbered.

## [0.17.0] - Basic Fountain Code Blocks Support

### Added
- **Fountain Code Blocks**: Basic support for rendering fountain code blocks in reading mode
  - Use triple backticks with `fountain` language identifier to create fountain code blocks
  - Example: ````fountain BENE\nThis is a small script````
  - Rendered with proper fountain formatting in reading mode only
  - Not supported in live preview mode

## [0.16.0] - Margin Marks

### Added
- **Margin Marks**: New annotation syntax `[[@marker]]` for adding visual markers in the script margin during reading view. Perfect for marking effects, laughs, cues, beats, and other important moments in your script. Margin marks appear as small labels in the right margin and are vertically aligned across different line types (action, dialogue, etc.). Common uses include `[[@effect]]` for magic shows, `[[@laugh]]` and `[[@punchline]]` for comedy, `[[@lights]]` and `[[@sound]]` for technical cues.

## [0.15.0] - Multi-Page Dialogue Support

### Improved
- **PDF Export - Long Dialogue**: New dialogue splitting logic to properly handle dialogue that spans multiple pages and dialogue at the end of a page. This makes the PDF export a lot closer to what you would expect.

## [0.14.1] - Bugfix

- **whitespace in PDFs**: A bug fix where word wrapping of action and dialogue lines could introduce whitespace at the beginning of the line.

## [0.14.0] - Snippets and style

### Changed:

- **Snippets**: Instead of one command save-selection-as-snippet, now there are two commands: copy-selection-as-snippet and cut-selection-as-snippet.

- **Style**: The editor component no longer has a focus outline, matching obsidians editor.

### Bug fixes:

- **Page Breaks After Dialogue**: Fixed bug where page-break sequences ("===") directly following dialogue without a blank line were not recognized as page breaks and were instead treated as part of the dialogue text.

## [0.13.1] - Page Break Recognition Fix

### Bug fixes:

- **Page Breaks After Dialogue**: Fixed bug where page-break sequences ("===") directly following dialogue without a blank line were not recognized as page breaks and were instead treated as part of the dialogue text.

## [0.13.0] - Sing me a song

### New feature:

- **Lyrics**: Support lyrics.

### Bug fixes:

- **Actions**: Leading spaces should be preserved.

## [0.12.1] - Cosmetics

- **Selection background color**: Fixed to use the right obsidian variable
- **don't select text** when switching into edit mode -- it's distracting.
- **a slightly thicker cursor** to make it more visible.

## [0.12.0] - Character Name Autocompletion

### Added
- **Character Completion**: Intelligent autocompletion for character names in the editor
  - Triggered when typing at least 2 uppercase characters/numbers with at least one uppercase letter (e.g., `JO`, `FBI`, `3CPO`, `R2D2`, `JOSÉ`)
  - Triggered when typing @ symbol followed by any characters for special character names (e.g., `@McAlister`)
  - Uses prefix matching against all character names found in the script

## [0.11.0] - Standard Keybindings in the editor

- Standard keybindings for common actions in the editor. Most importantly undo/redo.

## [0.10.1] - Auto-Focus on New Documents

### Improved
- **New Document Creation**: Editor now automatically receives focus when creating a new fountain document, allowing immediate typing without additional clicks

## [0.10.0] - Snippets System

### Added
- **Snippets Feature**: Complete snippets system for reusable content blocks
  - Store reusable fountain content in a `# Snippets` section at the end of your document
  - Snip button appears when selecting text outside the snippets section
  - Drag and drop snippets from the sidebar into your script
  - Snippets are separated by page breaks (`===`) and can contain any fountain elements
  - Extended table of contents view to show snippet previews in the lower half
  - "Save Selection as Snippet" command available via command palette

## [0.9.2] - No unnecessary scrollbars when editing

- Exactly what it says on the tin, thanks to https://github.com/chuangcaleb

## [0.9.1] - Consistent Hidden Element Handling

### Fixed
- **Hidden Element Filtering**: Fixed inconsistent behavior between reading view and PDF export when hiding notes, boneyard content, or synopsis
  - Eliminated unwanted newlines left by hidden elements (notes and boneyard comments)
  - Preserved legitimate empty lines as per Fountain specification
  - Both reading view and PDF export now use the same filtering logic for consistent results

## Added & Improved
- **PDF Export Options**: Added show/hide toggles for notes and synopsis in PDF export dialog
- **PDF Export optionally includes synopsis & notes**: Optionally include synopsis and notes in PDF export

## [0.9.0] - PDFs!!!!

### Added
- **PDF Export Support**: Complete PDF generation functionality with proper formatting
  - Title page support with standard formatting
  - Proper scene headings, action blocks, dialogue, and transitions rendering
  - PDF options dialog for export customization
  - Standard screenplay formatting with correct line spacing and character positioning
- **Forced Transitions**: Support for forced transitions using `>` syntax
- **Centered Action Lines**: Support for centered action blocks in scripts

### Fixed
- Fixed edge case in forced transition parsing
- Proper display of forced transitions in PDFs and reading view (without leading ">")
- Centered action lines now properly centered in the editor

## [0.8.2] - Previous Release
- Base functionality with syntax highlighting, reading view, index cards, and rehearsal mode
