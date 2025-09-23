# Fountain support for obsidian.

## Features

- obsidian syntax highlighting when editing
- close to print readonly view / preview (with ability to hide notes, synopsis, boneyard)
- PDF export with configurable options (paper size, scene heading formatting, optionally include synopsis & notes)
- mark notes as todo
- editable index card view to plan your script with drag & drop scene reordering and todo rendering
- Rehearsal mode (blackout of a characters dialogue)
- table of contents in right hand pane (with todos and synopsis included)
- snippets system for reusable content blocks (stored within the document)
- button in ribbon to create a new script (as scripts have .fountain extension)
- boneyard support (content after "# boneyard" header can be hidden)

## Known Issues

### Compatibility with Custom File Extensions Plugin

⚠️ **Important**: This plugin is incompatible with the [Custom File Extensions](https://obsidian.md/plugins?search=Custom%20File%20Extensions) plugin when configured to handle `.fountain` files.

If you have Custom File Extensions plugin installed and configured to open `.fountain` files, the plugin may crash without obvious error messages. To fix this:

1. Open Custom File Extensions plugin settings
2. Remove `.fountain` from the list of custom file extensions
3. Restart Obsidian

This plugin handles `.fountain` files natively and doesn't require Custom File Extensions to work properly.

## Notably missing

On the todo list with low priority:

- support for lyrics
- support for dual dialogue

## Screenshots

![reading view](https://github.com/user-attachments/assets/56ddc475-4417-4b7b-b916-669cd3e29dce)

![editing](https://github.com/user-attachments/assets/eae1ec17-5fd6-458e-a936-5182c8e4f0da)

![index cards](https://github.com/user-attachments/assets/0f0a7c3b-f7a6-4ad7-a809-75da6991d103)

## Using Snippets

The snippets feature allows you to store blocks of content within your fountain document for two main purposes:

**Reusable Content**: Store frequently used elements like:
- Standard character introductions or descriptions
- Common scene transitions (FADE IN, FADE OUT, CUT TO:)
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
