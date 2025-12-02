# Changelog

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
