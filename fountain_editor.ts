import { RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  type EditorView,
  type PluginSpec,
  type PluginValue,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import {
  type FountainScript,
  type StyledTextElement,
  type Line,
  intersect,
} from "./fountain.js";
import { parse } from "./fountain_parser.js";
export { fountainEditorPlugin };

/// This extends CodeMirror 6 to syntax highlight fountain.
/// Note that we are using a custom Code Mirror instance,
/// so we do not have any of the obsidian customizations.
/// That is both bad and good.
class FountainEditorPlugin implements PluginValue {
  decorations: DecorationSet;

  constructor(view: EditorView) {
    this.decorations = this.buildDecorations(view);
  }

  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged) {
      this.decorations = this.buildDecorations(update.view);
    }
  }

  destroy() {}

  private applyTextDecoration(
    builder: RangeSetBuilder<Decoration>,
    st: StyledTextElement,
  ) {
    const bold = Decoration.mark({ class: "bold" });
    const italics = Decoration.mark({ class: "italics" });
    const underline = Decoration.mark({ class: "underline" });
    const deco = {
      bold: bold,
      italics: italics,
      underline: underline,
    };

    builder.add(st.range.start, st.range.end, deco[st.kind]);
    for (const cel of st.elements) {
      if (cel.kind !== "text") {
        this.applyTextDecoration(builder, cel);
      }
    }
  }

  buildDecorations(view: EditorView): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    // TODO: Figure out if there is a good way to parse only part of the document.
    // Basically search for blank lines before and after the viewport (and then only
    // parse that range) would do it if it weren't for boneyards. But one could also
    // search for unclosed boneyards...
    //     // But before I do that let's profile how bad this is.  At least for the
    // kinds of scripts I normally write this should be totally fine.
    //
    // Another optimization would be to just skip the building of the
    // decorations for everything outside the relevant range.
    const fscript: FountainScript = parse(view.state.doc.toString());
    const scene = Decoration.mark({ class: "scene-heading" });
    const section = Decoration.mark({ class: "section" });
    const synopsis = Decoration.mark({ class: "synopsis" });
    const parenthetical = Decoration.mark({ class: "dialogue-parenthetical" });
    const character = Decoration.mark({ class: "dialogue-character" });
    const words = Decoration.mark({ class: "dialogue-words" });
    const action = Decoration.mark({ class: "action" });
    const boneyard = Decoration.mark({ class: "boneyard" });
    const note = Decoration.mark({ class: "note" });
    const pageBreak = Decoration.mark({ class: "page-break" });
    const noteSymbolPlus = Decoration.mark({ class: "note-symbol-plus" });
    const noteSymbolMinus = Decoration.mark({ class: "note-symbol-minus" });
    const noteTodo = Decoration.mark({ class: "note-todo" });

    function decorateLines(lines: Line[]) {
      for (const line of lines) {
        for (const tel of line.elements) {
          switch (tel.kind) {
            case "text":
              break;
            case "bold":
            case "italics":
            case "underline":
              this.applyTextDecoration(builder, tel);
              break;

            case "boneyard":
              builder.add(tel.range.start, tel.range.end, boneyard);
              break;
            case "note": {
              let noteDeco: Decoration = note;
              if (tel.noteKind === "+") {
                noteDeco = noteSymbolPlus;
              } else if (tel.noteKind === "-") {
                noteDeco = noteSymbolMinus;
              } else if (tel.noteKind.toLowerCase() === "todo") {
                noteDeco = noteTodo;
              }
              builder.add(tel.range.start, tel.range.end, noteDeco);
              break;
            }
          }
        }
      }
    }

    if (fscript.titlePage !== null) {
      for (const kv of fscript.titlePage) {
        for (const styledText of kv.values) {
          for (const st of styledText) {
            if (st.kind !== "text") {
              this.applyTextDecoration(builder, st);
            }
          }
        }
      }
    }

    const viewPortRange = { start: view.viewport.from, end: view.viewport.to };

    for (const el of fscript.script) {
      if (!intersect(el.range, viewPortRange)) {
        // Don't decorate things that are not in the viewport at all
        continue;
      }
      switch (el.kind) {
        case "scene":
          builder.add(el.range.start, el.range.end, scene);
          break;

        case "section":
          builder.add(el.range.start, el.range.end, section);
          break;

        case "synopsis":
          builder.add(el.range.start, el.range.end, synopsis);
          break;

        case "page-break":
          builder.add(el.range.start, el.range.end, pageBreak);
          break;

        case "dialogue":
          builder.add(
            el.characterRange.start,
            el.characterRange.end,
            character,
          );
          if (el.parenthetical !== null) {
            builder.add(
              el.parenthetical.start,
              el.parenthetical.end,
              parenthetical,
            );
          }
          if (el.lines.length > 0) {
            builder.add(
              el.lines[0].range.start,
              el.lines[el.lines.length - 1].range.end,
              words,
            );
            decorateLines(el.lines);
          }
          break;

        case "action":
          builder.add(el.range.start, el.range.end, action);
          decorateLines(el.lines);
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

const fountainEditorPlugin = ViewPlugin.fromClass(
  FountainEditorPlugin,
  pluginSpec,
);
