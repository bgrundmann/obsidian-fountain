import { TextFileView, WorkspaceLeaf, setIcon } from 'obsidian';
import { EditorState } from '@codemirror/state';
import { EditorView, ViewUpdate } from '@codemirror/view';
import { parse } from './fountain_parser.js';
import { FountainScript, Range } from 'fountain.js';
import { readingView, indexCardsView, getDataRange, rangeOfFirstVisibleLine } from './reading_view.js';
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
  private startEditModeHere: (range:Range) => void;
  
  constructor(contentEl: HTMLElement, text: string, startEditModeHere: (range:Range) => void) {
    this.showMode = ShowMode.Everything;
    this.text = text;
    this.contentEl = contentEl;
    this.startEditModeHere = startEditModeHere;
  }

  render() {
    /// Parent should already be empty.
    this.contentEl.empty();
    const fp: FountainScript = parse(this.text);
    const mainblock = this.contentEl.createDiv(this.showMode == ShowMode.IndexCards ? undefined : 'screenplay');
    // Assuming nobody does a supply chain attack on the fountain library, the below
    // is fine as there is no way for the user to embed html in the fountain.
    //mainblock.innerHTML = compile(this.showMode, this.tokens);
    mainblock.innerHTML = this.showMode == ShowMode.IndexCards ? indexCardsView(fp) : readingView(fp);
    
    mainblock.addEventListener('click', (e) => {
      if (this.showMode === ShowMode.IndexCards && e.target != null) {
        const target = e.target as HTMLElement;
        if (target.id !== null && target.matches('.scene-heading')) {          
          const id = target.id;
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
      } else if (this.showMode === ShowMode.Everything && e.target != null) {
        const target = e.target as HTMLElement;
        const r = getDataRange(target);
        if (r === null) return;
        this.startEditModeHere(r);
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

  rangeOfFirstVisibleLine(): Range|null {
    const screenplay = this.contentEl.querySelector(".screenplay");
    if (screenplay === null) return null;
    return rangeOfFirstVisibleLine(screenplay as HTMLElement);
  }
}


class EditorViewState {
  private cmEditor: EditorView;

  constructor(contentEl: HTMLElement, text: string, requestSave: () => void ) {
    contentEl.empty();
    const editorContainer = contentEl.createDiv('custom-editor-component');
    // our screenplay sets some of the styling information
    // before the code mirror overrides them. And instead of
    // messing with !important in the css, we force the theme
    // to take the values from higher up.
    const theme = EditorView.theme({
      "&": {
        fontSize: "12pt",
      },
      ".cm-content": {
        fontFamily: "inherit",
        lineHeight: "inherit"
      },
      ".cm-scroller": {
        fontFamily: "inherit",
        lineHeight: "inherit"
      }
    });
    const state = EditorState.create({
      doc: text,
      extensions: [
        theme,
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

  scrollToHere(r: Range): void {
    console.log("scrolling to", r.start);
    this.cmEditor.dispatch({ effects: EditorView.scrollIntoView(r.start, { y: "start", }) })
  }
}


export class FountainView extends TextFileView {
  state: ReadonlyViewState | EditorViewState;
  indexCardAction: HTMLElement;
  toggleEditAction: HTMLElement;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.state = new ReadonlyViewState(this.contentEl, '', (r) => this.startEditModeHere(r));
    this.toggleEditAction = this.addAction('edit', "Toggle Edit/Readonly", _evt => {
      this.toggleEditMode();
    });
    this.indexCardAction =  this.addAction("layout-grid", "Toggle Index Card View", _evt => {
      if (this.state instanceof ReadonlyViewState) {
        this.state.toggleIndexCards();
      }
    } );
  }

  startEditModeHere(r: Range): void {
    this.toggleEditMode();
    if (this.state instanceof EditorViewState) {
      this.state.scrollToHere(r);
    }
  }

  isEditMode(): boolean {
    return this.state instanceof EditorViewState
  }

  toggleEditMode() {
    const text = this.state.getViewData();
    if (this.state instanceof EditorViewState) {
      // Switch to readonly mode
      this.state.destroy();
      this.state = new ReadonlyViewState(this.contentEl, text, (r) => this.startEditModeHere(r));
      this.state.render();
      this.indexCardAction.show();
    } else {
      // Switch to editor
      const r = this.state.rangeOfFirstVisibleLine();
      this.indexCardAction.hide();
      this.state = new EditorViewState(this.contentEl, text, this.requestSave);
      if (r !== null)  this.state.scrollToHere(r);
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
      this.state = new ReadonlyViewState(this.contentEl, '', (r) => this.startEditModeHere(r));
      this.indexCardAction.show();
    }
  }
}
