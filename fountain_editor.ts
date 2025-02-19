import {
  RangeSetBuilder,
} from '@codemirror/state';
import {
  Decoration,
  EditorView,
  DecorationSet,
  PluginValue,
  ViewUpdate,
  ViewPlugin,
  PluginSpec,
} from '@codemirror/view';
import { parse } from './fountain_parser.js';
import { FountainScript } from './fountain.js';
export { fountainEditorPlugin };

class FountainEditorPlugin implements PluginValue {
  decorations: DecorationSet;

  constructor(view: EditorView) {
    this.decorations = this.buildDecorations(view);
  }

  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged) {
      // TODO: Probably don't need viewportChanged if I always syntax
      // hightlight the whole document
      this.decorations = this.buildDecorations(update.view);
    }
  }

  destroy() {
    
  }

  buildDecorations(view: EditorView): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    // TODO: Figure out if there is a good way to parse only part of the document.
    // Basically search for blank lines before and after the viewport would do it
    // if it weren't for boneyards. But one could also search for unclosed
    // boneyards...
    // But before I do that let's profile how bad this is.  At least for the
    // kinds of scripts I normally write this should be totally fine.
    const fscript : FountainScript = parse(view.state.doc.toString());
    const scene = Decoration.mark({class: "scene-heading"});
    const section =  Decoration.mark({class: "section"});
    const synopsis = Decoration.mark({class:"synopsis"});
    const parenthetical = Decoration.mark({class:"dialogue-parenthetical"});
    const character = Decoration.mark({class:"dialogue-character"});
    const words = Decoration.mark({class:"dialogue-words"});

    
    for (const el of fscript.script) {
      switch (el.kind) {
        case 'scene':
          builder.add(el.range.start, el.range.end, scene);
          break;

        case 'section':
          builder.add(el.range.start, el.range.end, section);
          break;

        case 'synopsis':
          builder.add(el.range.start, el.range.end, synopsis);
          break;

        case 'dialogue':
          builder.add(el.characterRange.start, el.characterRange.end, character);
          if (el.parenthetical !== null) {
            builder.add(el.parenthetical.start, el.parenthetical.end, parenthetical);
          }
          if (el.text.length > 0) {
            builder.add(el.text[0].range.start, el.text[el.text.length-1].range.end, words);
          }
          break;

        default:
          break;
      }
    }
    return builder.finish();
  }
}

const pluginSpec: PluginSpec<FountainEditorPlugin> = {
	decorations: (value: FountainEditorPlugin) => value.decorations,
};

const fountainEditorPlugin = ViewPlugin.fromClass(FountainEditorPlugin, pluginSpec);
