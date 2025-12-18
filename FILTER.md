# Removal Commands

A set of commands to create filtered versions of fountain scripts by removing unwanted content. These commands follow a Unix-like toolbox approach where each command does one thing well and can be composed together.

## Available Commands

### Remove Character Dialogue
**Command ID**: `remove-character-dialogue`
**Command Name**: "Remove character dialogue"

Opens a modal showing all characters found in the script. Select characters whose dialogue should be removed from the document.

### Remove Scenes and Sections  
**Command ID**: `remove-scenes-sections`
**Command Name**: "Remove scenes and sections"

Opens a modal showing all structural elements (scenes and sections) in the script. Select which scenes and sections to remove from the document.

### Remove Element Types
**Command ID**: `remove-element-types` 
**Command Name**: "Remove element types"

Opens a modal showing different fountain element types with counts. Select which types of elements to remove from the document (action lines, transitions, synopsis, etc.).

## Design Philosophy

**Remove vs Keep**: Commands use explicit "remove" semantics instead of "filter" or "keep". When you check a box, that item gets deleted from the document.

**Safe Defaults**: All checkboxes start unselected. This makes the commands idempotent - running them without selecting anything changes nothing.

**Sequential Refinement**: Commands can be run multiple times in any order to progressively refine the content. Each command operates on the current state of the document.

**Built-in Safety**: Each modal includes a "Duplicate file first" checkbox (checked by default) that creates a filtered copy instead of modifying the original file. This protects against data loss since undo is not available in readonly mode.

## Typical Workflow

1. **Run removal commands** with the default "Duplicate file first" option checked:
   - Remove unwanted characters' dialogue 
   - Remove unnecessary scenes or sections
   - Remove element types you don't need (action lines, transitions, etc.)
2. **Each command creates a new filtered file** (e.g., "Script (filtered).fountain") and opens it
3. **Apply additional removal commands** to the filtered copy for further refinement
4. **Use the filtered script** for your specific purpose (rehearsal, read-through, etc.)
5. **Original file remains untouched** as a backup

## Example Use Cases

**Actor Preparation**: 
- Remove other characters' dialogue → Remove action lines → Practice lines in rehearsal mode (creates "Script (filtered).fountain")

**Director's Scene List**:
- Remove dialogue → Remove action lines → Keep only scene headings and synopsis (creates "Script (filtered).fountain")

**Reading Script**:
- Remove technical notes → Remove margin marks → Clean version for table reads (creates "Script (filtered).fountain")

## Command Details

### Remove Character Dialogue

Modal shows:
- **"Duplicate file first"** checkbox (checked by default for safety)
- List of all characters found in the script (sorted alphabetically)
- Checkbox for each character (initially unchecked)
- Character count information

When characters are selected and removed:
- All dialogue blocks where the selected character(s) speak are removed
- Character names, parentheticals, and dialogue lines are all removed
- Other elements (scenes, action lines, etc.) remain untouched
- Multi-character dialogue (using &) is removed if ANY speaking character is selected

### Remove Scenes and Sections

Modal shows:
- **"Create filtered copy"** checkbox (checked by default for safety)
- **Selection counter** showing "X of Y items selected"
- **Scrollable tree view** (independently scrollable, max height 400px) containing:
  - Hierarchical display with visual indentation (24px per level)
  - Sections shown with bold text and depth indicators (# symbols)
  - Scenes shown with 🎬 icon in italic, muted text
  - Tree connector lines showing parent-child relationships
  - Selected items highlighted with background color
- **Parent-child selection**: When a section is selected, all its nested scenes and subsections are automatically selected

When scenes/sections are selected and removed:
- Sections: The entire section including all nested content (subsections, scenes, action, dialogue) is removed
- Scenes: The complete scene from heading through all content until the next scene/section is removed
- The structure's calculated ranges ensure complete removal, not just headers

### Remove Element Types

Modal shows:
- **"Duplicate file first"** checkbox (checked by default for safety)
- Different fountain element types with counts in parentheses
- Available types: Action Lines, Dialogue, Scene Headings, Sections, Transitions, Synopsis, Lyrics, Page Breaks
- Checkbox for each type (initially unchecked)

When element types are selected and removed:
- All elements of the selected types are removed from the document
- Element positions and formatting of remaining elements are preserved
- Mixed removal is supported (e.g., remove both action lines and transitions)

## Technical Implementation

**Text Processing**: Uses the existing `FountainScript` parser and `Range` system for precise element identification and removal.

**Removal Strategy**: Elements are removed in reverse order (highest position first) to avoid position shifts affecting subsequent removals.

**Modal Interface**: Uses native Obsidian `Setting` components within `Modal` for consistency with the rest of the application.

**File Safety**: Default behavior creates filtered copies with names like "Script (filtered).fountain" or "Script (filtered 2).fountain" to avoid overwriting existing files.

**Error Handling**: Commands show notices for common issues (no elements found, nothing selected) and handle file creation errors gracefully.

**Integration**: Commands are registered in the main plugin and available through the command palette when a fountain file is active.