import { TextFileView, WorkspaceLeaf, setIcon } from 'obsidian';
import { EditorState } from '@codemirror/state';
import { EditorView, ViewUpdate } from '@codemirror/view';
import { parse } from './fountain_parser.js';
import { FountainScript } from 'fountain.js';
import { reading_view, index_cards_view } from './reading_view.js';
import { fountainEditorPlugin } from './fountain_editor.js';
export const VIEW_TYPE_FOUNTAIN = 'fountain';

enum ShowMode {
  Everything,
  WithoutSynopsisAndNotes,
  IndexCards
}


class ReadonlyViewState {
  private text: string;
  private showMode: ShowMode;
  private contentEl: HTMLElement;
  
  constructor(contentEl: HTMLElement, text: string) {
    this.showMode = ShowMode.Everything;
    this.text = text;
    this.contentEl = contentEl;
  }

  render() {
    /// Parent should already be empty.
    this.contentEl.empty();
    const fp: FountainScript = parse(this.text);
    const mainblock = this.contentEl.createDiv(this.showMode == ShowMode.IndexCards ? undefined : 'screenplay');
    // Assuming nobody does a supply chain attack on the fountain library, the below
    // is fine as there is no way for the user to embed html in the fountain.
    //mainblock.innerHTML = compile(this.showMode, this.tokens);
    mainblock.innerHTML = this.showMode == ShowMode.IndexCards ? index_cards_view(fp) : reading_view(fp);
    
    mainblock.addEventListener('click', (e) => {
      if (this.showMode == ShowMode.IndexCards && e.target != null && e.target.id != null && e.target.matches('.scene-heading')) {          
        const id = e.target.id;
        this.showMode = ShowMode.Everything;
        this.render();
        requestAnimationFrame(() => {
          const targetElement = document.getElementById(id);
          if (targetElement) {
            targetElement.scrollIntoView(({
              behavior: 'smooth',
              block: 'start'
            }))
          }
        });
      }
    })
  }

  toggleIndexCards() {
    this.showMode = this.showMode == ShowMode.IndexCards ? ShowMode.Everything : ShowMode.IndexCards;
    this.render();
  }

  getViewData(): string {
    return this.text;
  } 

  setViewData(text: string, clear: boolean): void {
    if (clear) {
      this.showMode = ShowMode.Everything;
    }
    this.text = text;
    this.render();
  }

  clear(): void {
    this.text = '';
  }
}


class EditorViewState {
  private cmEditor: EditorView;

  constructor(contentEl: HTMLElement, text: string, requestSave: () => void ) {
    contentEl.empty();
    const editorContainer = contentEl.createDiv('custom-editor-component');
    const state = EditorState.create({
      doc: text,
      extensions: [
        EditorView.editorAttributes.of({class: "screenplay"}),
        EditorView.lineWrapping,
        fountainEditorPlugin,
        EditorView.updateListener.of((update: ViewUpdate) => {
          if (update.docChanged) {
            requestSave();
          }
        })
      ]
    } );
    this.cmEditor = new EditorView({ state: state, parent: editorContainer})
  }

  setViewData(text: string, clear: boolean) {
      this.cmEditor.dispatch({
        changes: {
          from: 0,
          to: this.cmEditor.state.doc.length,
          insert: text
        }
      });
  }

  getViewData(): string {
    return this.cmEditor.state.doc.toString();
  } 

  clear(): void {
  }

  destroy(): void {
    this.cmEditor.destroy();
  }
}


export class FountainView extends TextFileView {
  state: ReadonlyViewState | EditorViewState;
  indexCardAction: HTMLElement;
  toggleEditAction: HTMLElement;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.state = new ReadonlyViewState(this.contentEl, '');
    this.toggleEditAction = this.addAction('edit', "Toggle Edit/Readonly", _evt => {
      this.toggleEditMode();
    });
    this.indexCardAction =  this.addAction("layout-grid", "Toggle Index Card View", _evt => {
      if (this.state instanceof ReadonlyViewState) {
        this.state.toggleIndexCards();
      }
    } );
  }

  isEditMode(): boolean {
    return this.state instanceof EditorViewState
  }

  toggleEditMode() {
    const text = this.state.getViewData();
    if (this.state instanceof EditorViewState) {
      // Switch to readonly mode
      this.state.destroy();
      this.state = new ReadonlyViewState(this.contentEl, text);
      this.state.render();
      this.indexCardAction.show();
    } else {
      // Switch to editor
      this.indexCardAction.hide();
      this.state = new EditorViewState(this.contentEl, text, this.requestSave);
    }
    this.toggleEditAction.empty();
    setIcon(this.toggleEditAction, this.isEditMode() ? 'book-open' : 'edit');
  }

  getViewType() {
    return VIEW_TYPE_FOUNTAIN;
  }

  getDisplayText(): string {
    return this.file?.basename ?? "Fountain";
  }

  getViewData(): string {
    return this.state.getViewData();
  }

  setViewData(data: string, clear: boolean): void {
    this.state.setViewData(data, clear);
  }

  clear(): void {
    this.state.clear();
    if (this.state instanceof EditorViewState) {
      this.state.destroy();
      this.state = new ReadonlyViewState(this.contentEl, '');
      this.indexCardAction.show();
    }
  }
}
