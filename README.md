# Fountain support for obsidian.

## Features

- obsidian syntax highlighting when editing
- close to print readonly view / preview (with ability to hide notes, synopsis)
- editable index card view to plan your script
- Rehearsal mode (blackout of a characters dialogue)
- mark notes as todo
- table of contents in right hand pane (with todos and synopsis included)
- button in ribbon to create a new script (as scripts have .fountain extension)

## Notably missing

On the todo list with low priority:

- support for lyrics
- support for dual dialogue

On the maybe one day list:

- a way to actually create a print/pdf version of the script

## Screenshots

![reading view](https://github.com/user-attachments/assets/56ddc475-4417-4b7b-b916-669cd3e29dce)

![editing](https://github.com/user-attachments/assets/eae1ec17-5fd6-458e-a936-5182c8e4f0da)

![index cards](https://github.com/user-attachments/assets/0f0a7c3b-f7a6-4ad7-a809-75da6991d103)


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
