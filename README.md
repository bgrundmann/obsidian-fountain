# Fountain support for obsidian.

This is the result of me realising that https://github.com/Darakah/obsidian-fountain isn't a thing
anymore  when I setup a new vault.

And [obsidian-fountain-editor](https://github.com/chuangcaleb/obsidian-fountain-editor) only solves
the editing of markdown files marked as fountain in the header. But doesn't give you a readonly view,
and treats fountain notes as links.  Which for most people is probably a feature, but for me is
primarily annoying, as I do have lots of scripts with fountain notes in them. And while I do want
and use synopsis they for me do not do the same thing.

So at first I quickly threw together fountain-js and the css written by Bluemoondragon07
[at the obsidian forum](https://forum.obsidian.md/t/pro-screenwriting-snippet-write-screenplays-in-markdown-fountain-plugin-styling-canvas-index-cards-and-well-formatted-export/62477).

Than I started adding more features (such as a index card view and treating "Boneyard" sections specially),
and eventually got fully nerdsniped into writing my own parser (because fountain-js does not give
you offsets in the source and it's not a trivial fix because of the way it handles boneyards
by pre-processing the source).

Once I got that far I realised that I wanted the ability to integrate the editor and the readonly
view (such as toggling edit view should not scroll to the top).

