# Fountain support for obsidian.

## Features

- Automatic screenplay formatting. As long as you follow the fountain syntax, the editor will in real-time format what you type.
- close to print readonly view / preview (with ability to hide notes, synopsis, boneyard)
- PDF export with configurable options (paper size, scene heading formatting, optionally include synopsis & notes)
- **scene numbers** (`#1#`, `#1A#`, `#I-1-A#`, etc.) displayed in bold on left and right margins, with commands to automatically add or remove scene numbers
- **content filtering/removal commands** to create filtered script versions (remove character dialogue, scenes/sections, or element types)
- mark notes as todo `[[todo: This is a todo]]`
- editable index card view to plan your script with drag & drop scene reordering and todo rendering
- Rehearsal mode (blackout of a characters dialogue)
- table of contents in right hand pane (with todos and synopsis included)
- snippets system for reusable content blocks (stored within the document)
- margin marks for script annotations (`[[@marker]]` syntax) that appear in the margin during reading view
- fountain code blocks support for embedding fountain scripts in regular markdown notes (reading mode only -- *NOT* in live preview)
- button in ribbon to create a new script (as scripts have .fountain extension)
- boneyard support (content after "# boneyard" header can be hidden)
- folding of scenes

## Command reference

See here [Command Reference](https://github.com/bgrundmann/obsidian-fountain/blob/main/COMMAND_REFERENCE.md).

## Known Issues

### Margin marks

- Multiple margin marks on the same line will overlap in the reading view.

### The PDF export is probably not following industry standards

- That is I don't need it to follow industry standards. I just needed something that gave me a decent PDF.
- If you have stricter requirements, chances are you should use something like Highland Pro
- But if you can let me know *exactly* what you need, I promise to at least contemplate implementing it.

### Compatibility with Custom File Extensions Plugin

⚠️ **Important**: This plugin is incompatible with the [Custom File Extensions](https://obsidian.md/plugins?search=Custom%20File%20Extensions) plugin when configured to handle `.fountain` files.

If you have Custom File Extensions plugin installed and configured to open `.fountain` files, the plugin may crash without obvious error messages. To fix this:

1. Open Custom File Extensions plugin settings
2. Remove `.fountain` from the list of custom file extensions
3. Restart Obsidian

This plugin handles `.fountain` files natively and doesn't require Custom File Extensions to work properly.

## Notably missing

On the todo list with low priority:

- support for dual dialogue

## Screenshots

![reading view](https://github.com/user-attachments/assets/56ddc475-4417-4b7b-b916-669cd3e29dce)

![editing](https://github.com/user-attachments/assets/eae1ec17-5fd6-458e-a936-5182c8e4f0da)

![index cards](https://github.com/user-attachments/assets/0f0a7c3b-f7a6-4ad7-a809-75da6991d103)

## Quick overview over most features

https://github.com/user-attachments/assets/310fd6db-1b51-4cd4-9006-8758addc3807

## Using Margin Marks

Margin marks are special annotations that render as single words in the page margin during reading view, allowing you to quickly scan for specific moments in your script.

### Syntax

Use `[[@marker_word]]` where the marker word is alphanumeric with underscores (no spaces):

```fountain
The magician waves the wand, the ball disappears. [[@effect]]
The audience gasps. [[@laugh]]
The lights dim. [[@lights]]
```

### Common Use Cases

**Magic/Performance Scripts**: Mark effects with `[[@effect]]`
**Comedy Scripts**: Mark jokes with `[[@setup]]`, `[[@punchline]]`, `[[@laugh]]`
**Drama Scripts**: Mark emotional beats with `[[@tension]]`, `[[@release]]`, `[[@revelation]]`
**Technical Scripts**: Mark cues with `[[@lights]]`, `[[@sound]]`, `[[@music]]`

### How It Works

- In reading view: Margin marks appear as small labels in the right margin
- In editor view: Margin marks are displayed inline with distinct styling

## Using Scene Numbers

Scene numbers follow the Fountain specification and allow you to number your scenes for production purposes. They appear in bold on both the left and right margins of your script.

### Syntax

Add scene numbers at the end of any scene heading using the format `#content#`:

```fountain
INT. HOUSE - DAY #1#

EXT. PARK - NIGHT #2A#

INT. OFFICE - MORNING #I-1-A#

FLASHBACK - INT. CHILDHOOD HOME #110A#
```

### Supported Formats

The plugin supports all Fountain specification scene number formats:

- **Numeric**: `#1#`, `#42#`, `#999#`
- **Alphanumeric**: `#1A#`, `#1a#`, `#2B#`, `#A1#`
- **Complex**: `#I-1-A#`, `#1.5#`, `#1-2-3#`
- **With periods**: `#1.#`, `#2.1#`

### How It Renders

**In Reading View**: Scene numbers appear in bold on both margins
```
2A.    INT. HOUSE - DAY    2A
```

**In PDF Export**: Scene numbers are positioned in the left and right margins with proper spacing to avoid text overlap

### Scene Numbering Commands

The plugin provides two commands to help manage scene numbers automatically:

**Add Scene Numbers**
- Adds sequential scene numbers starting from #1# to scenes that don't already have them
- When encountering existing numeric scene numbers (like #6#), continues numbering from that number + 1
- Preserves non-numeric scene numbers (like #5A#) but doesn't let them affect the sequential counter
- Example: If you have scenes A, B #5A#, C, D #6#, E → becomes A #1#, B #5A#, C #2#, D #6#, E #7#

**Remove Scene Numbers**
- Removes all scene numbers from all scenes in the document
- Processes scenes safely to maintain proper text formatting

Access these commands through Obsidian's command palette (Cmd/Ctrl+P) when a fountain file is open.

### Notes

- Scene numbers are completely optional - scenes without numbers work exactly as before
- Scene numbers must appear at the very end of the scene heading line
- Only alphanumeric characters, dashes, and periods are allowed inside the `#` markers
- Whitespace around scene numbers is automatically handled

## Content Filtering Commands

The plugin provides three commands to create filtered versions of your scripts, perfect for creating actor sides, technical scripts, or focused drafts.

### Remove Character Dialogue
Create a version of your script with specific characters' dialogue removed:
- Interactive modal with scrollable character list
- "Select All" toggle for bulk operations
- Creates a filtered copy by default (e.g., "Script (filtered).fountain")

### Remove Scenes and Sections
Selectively remove structural elements from your script:
- Hierarchical tree view with visual indentation
- Checking a section auto-selects all nested content
- Unchecking any item automatically unchecks parent sections
- Shows anonymous scenes (scenes without headings) as "(anonymous scene)"

### Remove Element Types
Filter out specific fountain element types:
- Remove action lines, transitions, synopsis, notes, scene headers, etc.
- Keep only the elements you need for your specific use case

### Safety Features
- **Default behavior**: Creates a new filtered copy, preserving your original
- **Unique naming**: Automatically handles file naming (filtered, filtered 2, etc.)
- **Optional direct editing**: Can modify the current file if explicitly chosen
- **Warning**: Direct modification has no undo in readonly mode

Access these commands through Obsidian's command palette (Cmd/Ctrl+P) when a fountain file is open.

## Using Snippets

The snippets feature allows you to store blocks of content within your fountain document for two main purposes:

**Reusable Content**: Store frequently used elements like:
- Recurring dialogue patterns or catchphrases
- Action descriptions for similar locations or situations

**Temporary Stash**: Use snippets as a holding area for uncertain content:
- Scenes you're not sure belong in the current draft
- Alternative dialogue or action that you want to compare
- Cut scenes that might be useful later
- Experimental content you're workshopping

Unlike the boneyard (which hides content completely), snippets remain visible in the sidebar, making them perfect for content you're actively reconsidering or might want to quickly reintegrate.

### Setting up Snippets

Snippets are stored at the end of your fountain document in a special section:

```fountain
# Snippets

EXT. COFFEE SHOP - DAY

The usual busy morning crowd fills the cozy coffee shop.

===

WAITRESS
(approaching)
What can I get you today?

===

FADE TO BLACK:
```

### Creating Snippets

**Method 1: Direct editing**
- Scroll to the end of your document and add a `# Snippets` section
- Add your reusable content blocks, separating each with `===` (page breaks)

**Method 2: Using the Snip button**
- Select any text in your script (outside the snippets section)
- Click the "Snip" button that appears, or use the command palette: "Save Selection as Snippet"
- For quick access, consider binding this command to `CMD+SHIFT+X` in Obsidian's hotkey settings
- The selected text will be moved to the snippets section automatically

### Using Snippets

- Open the Table of Contents panel in the right sidebar
- The bottom half shows your available snippets as scaled-down previews
- Click on any snippet to jump to its location in the document for editing
- Drag and drop snippets from the sidebar into your script to insert them
- Snippets are copied (not moved) when dragged, so they remain available for reuse

### Important Notes

- Everything after `# Snippets` is considered snippet content, even other section headers
- Snippets are hidden from the main script when boneyard hiding is enabled
- The snip button only appears for text selections outside the snippets section
- You can duplicate snippets by dragging them into the snippets section itself

## Why did I do this?

This is the result of me realising that https://github.com/Darakah/obsidian-fountain isn't a thing
anymore  when I setup a new vault.

And [obsidian-fountain-editor](https://github.com/chuangcaleb/obsidian-fountain-editor) only solves
the editing of markdown files marked as fountain in the header. But doesn't give you a readonly view,
and treats fountain notes as links.  Which for most people is probably a feature, but for me is
primarily annoying, as I do have lots of scripts with fountain notes in them. And while I do want
and use synopsis they for me do not do the same thing.

So at first I quickly threw together fountain-js and the css written by Bluemoondragon07
[at the obsidian forum](https://forum.obsidian.md/t/pro-screenwriting-snippet-write-screenplays-in-markdown-fountain-plugin-styling-canvas-index-cards-and-well-formatted-export/62477).

Than I started adding more features  and eventually got fully nerdsniped into writing my
own parser (because fountain-js does not give you offsets in the source and it's not
a trivial fix because of the way it handles boneyards by pre-processing the source).

Once I got that far I realised that I wanted the ability to integrate the editor and the
readonly view, so I ended up taking over the functionality of obsidian-fountain-editor
as well.

So here we are. Hopefully this is useful to more people than just me ;-) If it is let me know.
