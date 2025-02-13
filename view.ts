import { TextFileView, WorkspaceLeaf } from 'obsidian';
import { Fountain, Token, InlineLexer } from 'fountain-js';
import { EditorState } from '@codemirror/state';
import { EditorView, ViewUpdate } from '@codemirror/view';

export const VIEW_TYPE_FOUNTAIN = 'fountain';

enum ShowMode {
  Everything,
  WithoutSynopsisAndNotes,
  IndexCards
}

enum Inside {
  Nothing = 0,
  Section,
  Card,
}

function compile(showMode: ShowMode, tokens: Token[]) {
  let result : string[] = [];
  let sceneNumber: number = 0;
  function emit(s: string) {
    result.push(s)
  }

  function fountainToIndexCards() {
    let state : Inside = Inside.Nothing;
    function closeIfInside(what: Inside.Section|Inside.Card) {
      while (state >= what) {
        emit('</div>');
        state--;
      }
    }
    function emitOpenTill(what: Inside.Section|Inside.Card) {
      while (state < what) {
        state++;
        switch (state) {
          case Inside.Nothing:
            break;
          case Inside.Section:
            emit('<div class="screenplay-index-cards">');
            break;
          case Inside.Card:
            emit('<div class="screenplay-index-card">')
            break;
        }
      }
    }
    function convert(token: Token) {
      // This is copied from fountain-js toHtml function
      // Why? Because it mostly does what I want, but
      // sadly not completely.
        let lexedText = '';

        if (token?.text) {
           // TODO: Handle inline notes 
            lexedText = InlineLexer
                            .reconstruct(token.text, token.type === 'action');
        }

        console.log(token.type);

        switch (token.type) {
            case 'title':
            case 'author':
            case 'authors':
            case 'contact':
            case 'copyright':
            case 'credit':
            case 'date':
            case 'draft_date':
            case 'notes':
            case 'revision':
            case 'source':
            case 'transition':
            case 'dual_dialogue_begin':
            case 'dialogue_begin':
            case 'character':
            case 'parenthetical':
            case 'dialogue':
            case 'dialogue_end':
            case 'dual_dialogue_end':
            case 'note':
            case 'action':
            case 'centered':
            case 'lyrics':
            case 'page_break':
            case 'spaces':
              break;

            case 'scene_heading':
              closeIfInside(Inside.Card);
              emitOpenTill(Inside.Card);
              emit(`<h3 class="scene-heading" id="scene${sceneNumber}">${lexedText}</h3>`);
              sceneNumber++;
              break;

            case 'section':
              // We ignore sections of depth 4 and deeper in the overview
              if ((token.depth ?? 1) <= 3) {
                closeIfInside(Inside.Section);
                if (lexedText.toLowerCase().trim() == "boneyard") {
                  emit('<hr>');
                }
                emit(`<h${token.depth ?? 1} class="section">${lexedText}</h${token.depth ?? 1}>`);
              }
              break;

            case 'synopsis':
              emit(`<p class="synopsis">= ${lexedText}</p>`);
              break;

            case 'boneyard_begin': emit(`<!-- `);
            case 'boneyard_end': emit(` -->`);
        }
    }
    for (const t of tokens) {
      convert(t);
    }
    closeIfInside(Inside.Section);
    return result;
  }

  function fountainToHtml(showSynopsisAndNotes: boolean) {
    function convert(token: Token) {
      // This is copied from fountain-js toHtml function
      // Why? Because it mostly does what I want, but
      // sadly not completely.
        let lexedText = '';

        if (token?.text) {
           // TODO: Handle inline notes 
            lexedText = InlineLexer
                            .reconstruct(token.text, token.type === 'action');
        }

        switch (token.type) {
            case 'title': emit(`<h1 class="title">${lexedText}</h1>`); break;
            case 'author':
            case 'authors': emit(`<p class="authors">${lexedText}</p>`); break;
            case 'contact':
            case 'copyright':
            case 'credit':
            case 'date':
            case 'draft_date':
            case 'notes':
            case 'revision':
            case 'source':
              emit(`<p class="${token.type.replace(/_/g, '-')}">${lexedText}</p>`);
              break;

            case 'scene_heading':
              emit(`<h3 class="scene-heading" id="scene${sceneNumber}">${lexedText}</h3>`);
              sceneNumber++;
              break;

            case 'transition':
              emit(`<h2 class="transition">${lexedText}</h2>`);
              break;

            case 'dual_dialogue_begin':
              emit(`div class="dual-dialogue">`);
              break;
            case 'dialogue_begin':
              emit(`<div class="dialogue${token.dual ? ' ' + token.dual : ''}">`);
              break;
            case 'character':
              emit(`<h4 class="character">${lexedText}</h4>`);
              break;
            case 'parenthetical':
              emit(`<p class="parenthetical">${lexedText}</p>`);
              break;
            case 'dialogue':
              emit(`<p class="words">${lexedText}</p>`);
              break;
            case 'dialogue_end':
              emit(`</div>`);
              break;
            case 'dual_dialogue_end':
              emit(`</div>`);
              break;

            case 'section':
              // Reconsider this. Should maybe just use h1,h2,h3,h4 for sections
              // and scene_heading and the like should get classes
              if (lexedText.toLowerCase().trim() == "boneyard") {
                emit('<hr>');
              }
              emit(`<h${token.depth ?? 1} class="section">${lexedText}</h${token.depth ?? 1}>`);
              break;

            case 'synopsis':
              emit(showSynopsisAndNotes ? `<p class="synopsis">= ${lexedText}</p>` : "");
              break;

            case 'note':
              emit(showSynopsisAndNotes ? `<span class="note">[[${lexedText}]]</span>` : "");
              break;
            case 'boneyard_begin': return `<!-- `;
            case 'boneyard_end': return ` -->`;

            case 'action':
              emit(`<p class="action">${lexedText}</p>`);
              break;

            case 'centered':
              emit(`<p class="centered">${lexedText}</p>`);
              break;

            case 'lyrics':
              emit(`<p class="lyrics">${lexedText}</p>`);
              break;

            case 'page_break':
              emit(`<hr />`);
              break;
            case 'spaces':
              break;
        }
    }
    for (const t of tokens) {
      convert(t);
    }
    return result;
  }

  let fragments: string[];
  switch (showMode) {
    case ShowMode.Everything:
      fragments = fountainToHtml(true);
      break;
    case ShowMode.WithoutSynopsisAndNotes:
      fragments = fountainToHtml(false);
      break;
    case ShowMode.IndexCards:
      fragments = fountainToIndexCards();
      break;
  }
  return fragments.join('');
}

class ReadonlyViewState {
  private text: string;
  private fountain : Fountain;
  private showMode: ShowMode;
  private tokens: Token[];
  private contentEl: HTMLElement;
  
  constructor(contentEl: HTMLElement, text: string) {
    this.fountain = new Fountain();
    this.showMode = ShowMode.Everything;
    this.tokens = [];
    const script = this.fountain.parse(text, true);
    this.tokens = script.tokens;
    this.text = text;
    this.contentEl = contentEl;
  }

  render() {
    /// Parent should already be empty.
    this.contentEl.empty();
    const mainblock = this.contentEl.createDiv(this.showMode == ShowMode.IndexCards ? undefined : 'screenplay');
    // Assuming nobody does a supply chain attack on the fountain library, the below
    // is fine as there is no way for the user to embed html in the fountain.
    mainblock.innerHTML = compile(this.showMode, this.tokens);
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
    const script = this.fountain.parse(text, true);
    this.tokens = script.tokens;
    this.render();
  }

  clear(): void {
    this.text = '';
    this.tokens = [];
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
        EditorView.updateListener.of((update: ViewUpdate) => {
          if (update.docChanged) {
            // TODO Think about reparsing the fountain
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

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.state = new ReadonlyViewState(this.contentEl, '');
    this.addAction('edit', "Toggle Edit", evt => {
      this.toggleEditMode();
      
    });
    this.indexCardAction =  this.addAction("layout-grid", "Toggle Index Card View", evt => {
      if (this.state instanceof ReadonlyViewState) {
        this.state.toggleIndexCards();
      }
    } );
  }


  toggleEditMode() {
    const text = this.state.getViewData();
    if (this.state instanceof EditorViewState) {
      this.state.destroy();
      this.state = new ReadonlyViewState(this.contentEl, text);
      this.state.render();
      this.indexCardAction.show();
    } else {
      this.indexCardAction.hide();
      this.state = new EditorViewState(this.contentEl, text, this.requestSave);
    }
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
