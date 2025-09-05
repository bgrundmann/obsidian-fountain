# Changelog

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
