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
import { fountainFiles } from "fountain_files";
import { type Line, type StyledTextElement, intersect } from "./fountain";
export { createFountainEditorPlugin };

/// This extends CodeMirror 6 to syntax highlight fountain.
/// Note that we are using a custom Code Mirror instance,
/// so we do not have any of the obsidian customizations.
/// That is both bad and good.
class FountainEditorPlugin implements PluginValue {
  public decorations: DecorationSet;
  private bold: Decoration;
  private italics: Decoration;
  private underline: Decoration;
  private boneyard: Decoration;
  private noteSymbolPlus: Decoration;
  private noteSymbolMinus: Decoration;
  private noteTodo: Decoration;
  private note: Decoration;

  constructor(
    view: EditorView,
    readonly getPath: () => string,
  ) {
    this.bold = Decoration.mark({ class: "bold" });
    this.italics = Decoration.mark({ class: "italics" });
    this.underline = Decoration.mark({ class: "underline" });
    this.boneyard = Decoration.mark({ class: "boneyard" });
    this.noteSymbolPlus = Decoration.mark({ class: "note-symbol-plus" });
    this.noteSymbolMinus = Decoration.mark({ class: "note-symbol-minus" });
    this.noteTodo = Decoration.mark({ class: "note-todo" });
    this.note = Decoration.mark({ class: "note" });
    this.decorations = this.buildDecorations(view);
  }

  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged) {
      fountainFiles.set(this.getPath(), update.view.state.doc.toString());
      this.decorations = this.buildDecorations(update.view);
    }
  }

  destroy() {}

  private applyTextDecoration(
    builder: RangeSetBuilder<Decoration>,
    st: StyledTextElement,
  ) {
    const deco = {
      bold: this.bold,
      italics: this.italics,
      underline: this.underline,
    };

    builder.add(st.range.start, st.range.end, deco[st.kind]);
    for (const cel of st.elements) {
      if (cel.kind !== "text") {
        this.applyTextDecoration(builder, cel);
      }
    }
  }

  private decorateLines(builder: RangeSetBuilder<Decoration>, lines: Line[]) {
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
            builder.add(tel.range.start, tel.range.end, this.boneyard);
            break;
          case "note": {
            let noteDeco: Decoration = this.note;
            if (tel.noteKind === "+") {
              noteDeco = this.noteSymbolPlus;
            } else if (tel.noteKind === "-") {
              noteDeco = this.noteSymbolMinus;
            } else if (tel.noteKind === "todo") {
              noteDeco = this.noteTodo;
            }
            builder.add(tel.range.start, tel.range.end, noteDeco);
            break;
          }
        }
      }
    }
  }

  buildDecorations(view: EditorView): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    const fscript = fountainFiles.get(this.getPath());
    const scene = Decoration.mark({ class: "scene-heading" });
    const section = Decoration.mark({ class: "section" });
    const synopsis = Decoration.mark({ class: "synopsis" });
    const parenthetical = Decoration.mark({ class: "dialogue-parenthetical" });
    const character = Decoration.mark({ class: "dialogue-character" });
    const words = Decoration.mark({ class: "dialogue-words" });
    const action = Decoration.mark({ class: "action" });
    const pageBreak = Decoration.mark({ class: "page-break" });
    const transition = Decoration.mark({ class: "transition" });

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

    try {
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
              el.characterExtensionsRange.end,
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
              this.decorateLines(builder, el.lines);
            }
            break;

          case "action":
            builder.add(el.range.start, el.range.end, action);
            this.decorateLines(builder, el.lines);
            break;

          case "transition":
            builder.add(el.range.start, el.range.end, transition);
            break;

          default:
            break;
        }
      }
    } catch (error) {
      console.log("decoration failed", error);
    }
    return builder.finish();
  }
}

const pluginSpec: PluginSpec<FountainEditorPlugin> = {
  decorations: (value: FountainEditorPlugin) => value.decorations,
};

function createFountainEditorPlugin(
  getPath: () => string,
): ViewPlugin<FountainEditorPlugin> {
  return ViewPlugin.define((view) => {
    return new FountainEditorPlugin(view, getPath);
  }, pluginSpec);
}
