# Functionality provided by the plugin

- Distinct Fountain readonly & edit view with seamless toggling
- PDF export with configurable options (paper size, bold scene headers)
- Character-based rehearsal mode with blackout functionality
- TOC in sidebar with clickable navigation
	- click to scroll active readonly view / editor
	- inline toggles for:
		- show synopsis
		- show TODO notes
- Index card view (one index card per scene)
  - Each card shows title, synopsis and todos
  - Duplicate / delete scene / reorder scenes with drag & drop
  - Edit synopsis directly on index cards
  - Cross-file scene moving capabilities
- Snippets system for reusable content blocks
  - Store snippets in "# Snippets" section within the document
  - Snip button for moving selected text to snippets
  - Drag and drop snippets from sidebar into script
  - Scaled preview rendering in TOC sidebar
- Boneyard support (everything after "# boneyard" header is hidden when enabled)
- Show/hide settings for synopsis, notes, and boneyard content

# Implementation

Use typescript with functional programming style. Types are used extensively
to improve readability and maintainability.

## Plugin Architecture

The plugin registers two main view types:
- `FountainView` - handles fountain files with readonly/edit modes
- `TocView` - provides table of contents in sidebar

## Custom Parser

Written using peggy.js (see `fountain_parser.peggy`). Produces a parse tree represented by the `FountainScript` class. Text in the parse tree is represented by character ranges in the original source document, enabling efficient highlighting, editing operations, and cross-references.

Key parser outputs:
- `FountainScript` object containing:
  - `document`: original source text
  - `titlePage`: key-value pairs from title page
  - `script`: array of fountain elements (scenes, dialogue, actions, etc.)
  - `allCharacters`: extracted character names

## View State Management

`FountainView` manages two distinct states:
- `ReadonlyViewState` - renders formatted fountain content, handles rehearsal mode
- `EditorViewState` - integrates CodeMirror for editing with syntax highlighting

The view seamlessly switches between states while maintaining scroll position and other UI state.

## Per-View Script Caching

Each view caches its parsed `FountainScript` to avoid re-parsing on every update. The cache is updated:
- On file changes
- On explicit edit operations
- When switching between views

This approach is efficient for typical use (few open views) while keeping the code simple compared to centralized caching.

## Text Range System

All fountain elements track their position in the source document via `Range` objects (`{start, end}`). This enables:
- Efficient text extraction and HTML generation
- Precise scroll-to-position functionality
- Safe editing operations (replace, move, duplicate scenes)
- Syntax highlighting in editor mode

## Snippets Architecture

The snippets feature allows reusable blocks of fountain content to be stored and managed within the same document. To handle the complexity of page breaks that separate snippets, we use an explicit interface design.

### Snippet Interface

Instead of treating snippets as simple arrays of fountain elements, we use an explicit interface that separates content from separators:

```typescript
interface Snippet {
  content: FountainElement[];
  pageBreak?: PageBreak;
}

type Snippets = Snippet[];

interface ScriptStructure {
  sections: StructureSection[];
  snippets: Snippets;
}
```

### Page Break Handling

- Page breaks (`===`) serve as separators between snippets and are NOT part of snippet content
- Each snippet may optionally have an associated page break that followed it in the original document
- The last snippet in a document may not have a page break
- Empty snippets (ending with a page break but no content) are ignored during parsing
- This explicit design prevents subtle bugs where page breaks are accidentally treated as snippet content

### Implementation Notes

- `FountainScript.structure()` parses everything after `# Snippets` as snippet content
- Page breaks are captured and associated with the preceding snippet
- When snippets are inserted via drag-and-drop, appropriate page breaks are automatically added
- Instead of trying to modify a ScriptStructure in place after a modification we re-parse the document.

### Snip Button Implementation

The "snip" functionality is implemented through CodeMirror tooltips and position detection:

- **Position Detection**: `getSnippetsStartPosition()` helper function finds the start of the "# Snippets" section by iterating through parsed fountain elements
- **Tooltip Filtering**: `getSnipTooltips()` only creates snip button tooltips for text selections that occur before the snippets section
- **Command Integration**: The "Save Selection as Snippet" command uses `hasValidSelectionForSnipping()` to determine availability
- **Text Movement**: Selected text is removed from its original location and appended to the snippets section with appropriate page break separators

### TOC View Integration

The table of contents view (`TocView`, renamed to `FountainSideBarView`) is extended to show snippets in the lower half:

- **Dual Layout**: Upper half shows traditional TOC, lower half shows snippet previews
- **Snippet Rendering**: Reuses existing fountain rendering logic with CSS scaling for compact display
- **Drag & Drop**: Snippets can be dragged into the main document using CodeMirror's built-in drag-and-drop
- **Preview Scaling**: CSS transforms scale snippet previews to fit sidebar width while maintaining formatting fidelity

### Future Development Notes

- **Parser Independence**: The core fountain parser is unchanged - all snippets logic is in `FountainScript.structure()`
- **Re-parsing Strategy**: After any document modification, the entire document is re-parsed rather than attempting in-place modifications to `ScriptStructure`
- **Position Tracking**: All snippet functionality relies on character position ranges (`Range` objects) for precise text operations
- **Extension Points**: The snippet system can be extended by modifying `ScriptStructure` parsing and the TOC view rendering

## PDF Generation

Uses `pdf-lib` to generate formatted PDFs directly in the browser. Supports:
- Multiple paper sizes (Letter, A4)
- Standard screenplay formatting
- Styled text (bold, italic, underline)

Done in two steps:
1. Generate a list of instructions from the parse tree (FountainScript)
	- Each instruction is either new-page or draw text at position
	- Positions are specified in points from lower-left corner of the page (as typical per PDF specification)
2. Render instructions to a PDF

### Note on layout

Standard screenplay layout has a left margin of 1.5 inches for binding purposes. To deal with slightly different paper sizes (A4, letter) but maintain the same number of characters per line, and same number of lines per page (so that page per minute is consistent), we compute the remaining margins.

That means we will sometimes not get the standard margin sizes, but we will always have the lines wrapped at the same place.

## Source File Overview

### Core Files

- **`main.ts`** - Plugin entry point. Registers view types, commands, and handles plugin lifecycle. Manages PDF export workflow and file creation.

- **`view.ts`** - Main FountainView class that handles fountain files. Contains ReadonlyViewState and EditorViewState classes for seamless mode switching, plus all editing operations (scene move/duplicate, text replacement).

- **`fountain.ts`** - Core types and FountainScript class. Defines all fountain element types (Scene, Dialogue, Action, etc.) and provides text processing utilities, HTML escaping, and character extraction.

### Parser

- **`fountain_parser.peggy`** - Peggy.js grammar file defining fountain syntax parsing rules. Generates the actual parser from this declarative grammar.

- **`fountain_parser.js`** - Generated JavaScript parser code from the peggy file. Contains the actual parsing logic.

- **`fountain_parser.d.ts`** - TypeScript type definitions for the generated parser.

### Views and Rendering

- **`reading_view.ts`** - Renders formatted fountain content for readonly mode. Handles title page, scenes, dialogue, actions, and boneyard sections with show/hide settings.

- **`fountain_editor.ts`** - CodeMirror integration providing syntax highlighting and decorations for edit mode. Handles bold, italic, underline, notes, and boneyard styling.

- **`toc_view.ts`** - Table of contents sidebar view. Provides clickable navigation and toggles for synopsis/notes display.

- **`index_cards_view.ts`** - Index card view implementation with drag-and-drop scene reordering, synopsis editing, and cross-file scene moving capabilities.

### PDF Export

- **`pdf_generator.ts`** - PDF generation using pdf-lib. Converts fountain scripts to properly formatted screenplay PDFs with industry-standard layout and typography.

- **`pdf_options_dialog.ts`** - Modal dialog for PDF export options (paper size, scene heading formatting, file overwrite handling).

### Utilities

- **`render_tools.ts`** - Shared HTML rendering utilities, including range-based element creation and blank line handling.

- **`fuzzy_select_string.ts`** - Fuzzy search modal for string selection, used primarily for character selection in rehearsal mode.
