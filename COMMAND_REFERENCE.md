# Command Reference

This document lists all commands and keyboard shortcuts available in the Fountain plugin for Obsidian.

## Keyboard Shortcuts (scoped to fountain views)

These shortcuts work automatically when a fountain file has focus. No hotkey configuration needed.

| Shortcut | Action |
|----------|--------|
| Cmd/Ctrl+E | Toggle between edit and readonly mode |
| Cmd/Ctrl+F | Open search and replace |
| Cmd/Ctrl+Shift+X | Move selection to snippets |
| Cmd/Ctrl+Shift+C | Copy selection to snippets |

## Default Hotkeys (rebindable in Settings → Hotkeys)

These commands ship with a default binding but can be remapped from Obsidian's hotkey settings.

| Default | Command | Available when |
|---------|---------|----------------|
| Cmd/Ctrl+Shift+I | Toggle index card view | A fountain view is active |
| Cmd/Ctrl+Shift+L | Select current scene | The fountain editor (not cards / readonly) is active |

## Commands (via Command Palette)

Access these through Obsidian's command palette (Cmd/Ctrl+P) when a fountain file is open.

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

### Open sidebar
Opens the fountain sidebar with table of contents and snippets.
- **Command ID**: `open-sidebar`
- **Availability**: Only when the sidebar is not already open
- **Description**: Opens the fountain-specific sidebar that displays the table of contents, synopsis toggles, and snippets section.

### Toggle spell check
Enables or disables spell checking in the editor.
- **Command ID**: `toggle-spell-check`
- **Availability**: Only when a fountain file is active
- **Description**: Toggles the browser's built-in spell checker for the current fountain view. Spell check is off by default to avoid distraction during creative writing. The setting persists while the file is open but resets when the file is closed.

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

### Toggle index card view
Switches between the index card view and the editor (or readonly script), preserving position across the round-trip.
- **Command ID**: `toggle-index-cards-view`
- **Default Hotkey**: Cmd/Ctrl+Shift+I (rebindable)
- **Availability**: Only when a fountain view is active
- **Description**: From the editor, scrolls the card for the scene-under-cursor into view. From the cards, opens the editor at the start-of-scene-content of the topmost visible card. The remembered "where you came from" lets ⌘⇧I serve as a fluent round-trip without losing your place.

### Select current scene
Selects the entire current scene in the editor.
- **Command ID**: `select-current-scene`
- **Default Hotkey**: Cmd/Ctrl+Shift+L (rebindable)
- **Availability**: Only when a fountain editor is active (not the readonly or index card view)
- **Description**: Sets the editor selection to the whole `scene.range` — heading line through the line before the next scene/section heading. Designed as a primitive that composes with the system clipboard: `⌘X` to delete a scene, `⌘C` then `↓` then `⌘V` to duplicate, or cut-and-paste to move scenes across files.

## Content Filtering

These commands create filtered versions of your scripts for specific purposes (actor sides, technical scripts, etc.).

### Safety Features

All content filtering commands include these safety features:
- **Default behavior**: Creates a new filtered copy with "(filtered)" suffix, preserving your original
- **Unique naming**: Automatically handles naming conflicts (filtered, filtered 2, etc.)
- **Optional direct editing**: Can modify the current file if explicitly chosen in the modal
- **Warning**: Direct modification has no undo in readonly mode

### Remove character dialogue
- **Command ID**: `remove-character-dialogue`
- **Description**: Opens a modal with a scrollable list of all characters. Select characters whose dialogue you want to remove.

### Remove scenes and sections
- **Command ID**: `remove-scenes-sections`
- **Description**: Opens a hierarchical tree view of your script structure. Check sections to remove them.

### Remove element types
- **Command ID**: `remove-element-types`
- **Description**: Opens a modal to select which element types to remove (action lines, transitions, synopsis, notes, scene headers, etc.).
