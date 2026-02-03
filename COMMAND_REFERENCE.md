# Command Reference

This document lists all commands available in the Fountain plugin for Obsidian. Commands can be accessed through the Command Palette (Cmd/Ctrl+P) or assigned custom hotkeys in Obsidian's settings.

## File Management

### New fountain document
Creates a new `.fountain` file in your vault.
- **Command ID**: `new-fountain-document`
- **Ribbon Icon**: Available (square pen icon)
- **Description**: Creates an untitled fountain file in the same directory as your currently active file, or in the root if no file is active. Automatically opens the new file in edit mode with focus.

### Generate PDF
Exports the current fountain script to a formatted PDF.
- **Command ID**: `generate-pdf`
- **Availability**: Only when a `.fountain` file is active
- **Description**: Opens a dialog with export options including paper size (Letter/A4), scene heading formatting, and file overwrite handling. Generates a PDF in the same directory as your fountain file.

## View and Navigation

### Toggle edit mode
Switches between readonly and edit modes for fountain files.
- **Command ID**: `toggle-fountain-edit-mode`
- **Availability**: Only when a fountain file is active
- **Description**: Seamlessly toggles between the formatted readonly view and the editable text view while maintaining scroll position.

### Open sidebar
Opens the fountain sidebar with table of contents and snippets.
- **Command ID**: `open-sidebar`
- **Availability**: Only when the sidebar is not already open
- **Description**: Opens the fountain-specific sidebar that displays the table of contents, synopsis toggles, and snippets section.

## Editor

### Toggle spell check
Enables or disables spell checking in the editor.
- **Command ID**: `toggle-spell-check`
- **Availability**: Only when a fountain file is active
- **Description**: Toggles the browser's built-in spell checker for the current fountain view. Spell check is off by default to avoid distraction during creative writing. The setting persists while the file is open but resets when the file is closed.

## Scene Management

### Add scene numbers
Automatically adds sequential scene numbers to scenes that don't already have them.
- **Command ID**: `add-scene-numbers`
- **Availability**: Only when a fountain file is active
- **Description**: Adds scene numbers in the format `#1#`, `#2#`, etc. to scenes. Preserves existing non-numeric scene numbers (like `#5A#`) and continues sequential numbering from existing numeric scene numbers.

### Remove scene numbers
Removes all scene numbers from all scenes in the document.
- **Command ID**: `remove-scene-numbers`
- **Availability**: Only when a fountain file is active
- **Description**: Strips all scene numbers from scene headings.

## Snippets

### Copy selection to a new snippet
Copies selected text to the snippets section without removing it from the original location.
- **Command ID**: `copy-selection-as-snippet`
- **Availability**: Only when text is selected outside the snippets section
- **Suggested Hotkey**: `Cmd/Ctrl+Shift+C`
- **Description**: Copies the selected text to the snippets section at the end of your document, making it available for reuse via drag-and-drop.

### Move selection to a new snippet
Moves selected text to the snippets section, removing it from the original location.
- **Command ID**: `cut-selection-as-snippet`
- **Availability**: Only when text is selected outside the snippets section
- **Suggested Hotkey**: `Cmd/Ctrl+Shift+X`
- **Description**: Cuts the selected text from its current location and moves it to the snippets section, perfect for temporarily stashing uncertain content.

## Content Filtering

These commands help create filtered versions of your scripts for specific purposes (actor sides, technical scripts, etc.).

### Safety Features for Content Filtering

All content filtering commands include these safety features:
- **Default behavior**: Creates a new filtered copy with "(filtered)" suffix, preserving your original
- **Unique naming**: Automatically handles naming conflicts (filtered, filtered 2, etc.)
- **Optional direct editing**: Can modify the current file if explicitly chosen in the modal
- **Warning**: Direct modification has no undo in readonly mode

### Remove character dialogue
Creates a filtered version with specific characters' dialogue removed.
- **Command ID**: `remove-character-dialogue`
- **Availability**: Only when a fountain file is active
- **Description**: Opens a modal with a scrollable list of all characters in your script. Select characters whose dialogue you want to remove. Includes "Select All" toggle for bulk operations.

### Remove scenes and sections
Selectively removes structural elements (scenes, acts, sequences) from your script.
- **Command ID**: `remove-scenes-sections`
- **Availability**: Only when a fountain file is active
- **Description**: Opens a hierarchical tree view of your script structure. Check sections to remove them. Checking a section automatically selects all nested content; unchecking any item automatically unchecks parent sections.

### Remove element types
Filters out specific fountain element types from your script.
- **Command ID**: `remove-element-types`
- **Availability**: Only when a fountain file is active
- **Description**: Opens a modal to select which element types to remove (action lines, transitions, synopsis, notes, scene headers, etc.). Keep only the elements you need for your specific use case.

## Hotkey Recommendations

The plugin doesn't set default hotkeys. The author uses these (on the Mac where Ctrl is largely unused):

- **Toggle edit mode**: `Ctrl+E`
- **Copy selection as snippet**: `Ctrl+C`
- **Move selection as snippet**: `Ctrl+X`
- **Generate PDF**: `Ctrl+P`
