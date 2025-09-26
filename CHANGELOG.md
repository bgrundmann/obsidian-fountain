# Changelog

## [0.12.1] - Cosmetics

- **Selection background color**: Fixed to use the right obsidian variable
- **don't select text** when switching into edit mode -- it's distracting.

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
