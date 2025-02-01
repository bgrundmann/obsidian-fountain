import { TextFileView, WorkspaceLeaf } from 'obsidian';
import { Fountain, Token, InlineLexer } from 'fountain-js';

export const VIEW_TYPE_FOUNTAIN = 'fountain';

enum ShowMode {
  Everything,
  WithoutSynopsisAndNotes,
  IndexCards
}

function fountainToHtml(tokens: Token[], mode: ShowMode) {
  // This variable is only set when we are in IndexCards mode
  let isSceneOpened : boolean = false;
  let result : string[] = [];
  function emit(s: string) {
    result.push(s)
  }
  function emitUnlessIndexCardMode(s: string) {
    if (mode == ShowMode.IndexCards) return;
    emit(s);
  }
  // Only when we are doing index cards do we need
  // divs for each scene
  function emitCloseSceneIfNecessary() {
    if (mode != ShowMode.IndexCards) return;
    if (isSceneOpened) {
      emit('</div>');
      isSceneOpened = false;
    }
  }
  function emitOpenScene() {
    if (mode != ShowMode.IndexCards) return;
    emitCloseSceneIfNecessary();
    isSceneOpened = true;
    emit('<div class="screenplay-index-card">')
  }
  function convert(token: Token) {
    // This is copied from fountain-js toHtml function
    // Why? Because it mostly does what I want, but
    // sadly not completely.
      let lexedText = '';
      const showSynopsis = (mode != ShowMode.WithoutSynopsisAndNotes);
      const showScript = (mode != ShowMode.IndexCards);
      function script(s: string) {
        return showScript ? s : "";
      }

      if (token?.text) {
         // TODO: Handle inline notes 
          lexedText = InlineLexer
                          .reconstruct(token.text, token.type === 'action');
      }

      switch (token.type) {
          case 'title': emitUnlessIndexCardMode(`<h1 class="title">${lexedText}</h1>`); break;
          case 'author':
          case 'authors': emitUnlessIndexCardMode(`<p class="authors">${lexedText}</p>`); break;
          case 'contact':
          case 'copyright':
          case 'credit':
          case 'date':
          case 'draft_date':
          case 'notes':
          case 'revision':
          case 'source':
            emitUnlessIndexCardMode(`<p class="${token.type.replace(/_/g, '-')}">${lexedText}</p>`);
            break;

          case 'scene_heading':
            emitOpenScene();
            emit(`<h3 class="scene-heading">${lexedText}</h3>`);
            break;

          case 'transition':
            emitUnlessIndexCardMode(`<h2 class="transition">${lexedText}</h2>`);
            break;

          case 'dual_dialogue_begin':
            emitUnlessIndexCardMode(`div class="dual-dialogue">`);
            break;
          case 'dialogue_begin':
            emitUnlessIndexCardMode(`<div class="dialogue${token.dual ? ' ' + token.dual : ''}">`);
            break;
          case 'character':
            emitUnlessIndexCardMode(`<h4 class="character">${lexedText}</h4>`);
            break;
          case 'parenthetical':
            emitUnlessIndexCardMode(`<p class="parenthetical">${lexedText}</p>`);
            break;
          case 'dialogue':
            emitUnlessIndexCardMode(`<p class="words">${lexedText}</p>`);
            break;
          case 'dialogue_end':
            emitUnlessIndexCardMode(`</div>`);
            break;
          case 'dual_dialogue_end':
            emitUnlessIndexCardMode(`</div>`);
            break;

          case 'section':
            // Reconsider this. Should maybe just use h1,h2,h3,h4 for sections
            // and scene_heading and the like should get classes
            emitCloseSceneIfNecessary();
            if (lexedText.toLowerCase().trim() == "boneyard") {
              emit('<hr>');
            }
            emit(`<h${token.depth ?? 1} class="section">${lexedText}</h${token.depth ?? 1}>`);
            emitOpenScene();
            break;

          case 'synopsis':
            emit(showSynopsis ? `<p class="synopsis">= ${lexedText}</p>` : "");
            break;

          case 'note':
            emitUnlessIndexCardMode(`<span class="note">[[${lexedText}]]</span>`);
            break;
          case 'boneyard_begin': return `<!-- `;
          case 'boneyard_end': return ` -->`;

          case 'action':
            emitUnlessIndexCardMode(`<p class="action">${lexedText}</p>`);
            break;

          case 'centered':
            emitUnlessIndexCardMode(`<p class="centered">${lexedText}</p>`);
            break;

          case 'lyrics':
            emitUnlessIndexCardMode(`<p class="lyrics">${lexedText}</p>`);
            break;

          case 'page_break':
            emitUnlessIndexCardMode(`<hr />`);
            break;
          case 'spaces':
            break;
      }
  }

  for (const t of tokens) {
    convert(t);
  }
  emitCloseSceneIfNecessary();

  return result.join('');
}


export class FountainView extends TextFileView {
  fountain : Fountain;
  showMode: ShowMode;
  tokens: Token[];

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.fountain = new Fountain();
    this.showMode = ShowMode.Everything;
    console.log('view created %p', this);
    this.addAction("notebook", "Cycle through Show Modes", evt => {
      this.toggleShowNotes();
      this.render();
    } );
  }

  toggleShowNotes() {
    switch (this.showMode) {
      case ShowMode.Everything:
        this.showMode = ShowMode.WithoutSynopsisAndNotes;
        break;
      case ShowMode.WithoutSynopsisAndNotes:
        this.showMode = ShowMode.IndexCards;
        break;
      case ShowMode.IndexCards:
        this.showMode = ShowMode.Everything;
        break;
    }
  }

  render() {
      const child = this.containerEl.children[1];
      child.empty();
      const main_div_class = this.showMode == ShowMode.IndexCards ? 'screenplay-index-cards' : 'screenplay';
      const mainblock = child.createDiv(main_div_class);
      // Assuming nobody does a supply chain attack on the fountain library, the below
      // is fine as there is no way for the user to embed html in the fountain.
      mainblock.innerHTML = fountainToHtml(this.tokens, this.showMode);
  }

  getViewType() {
    return VIEW_TYPE_FOUNTAIN;
  }

  getDisplayText() {
    return this.file?.basename ?? "Fountain";
  }

  getViewData(): string {
      console.log('getViewData');
      return this.data;
  }

  setViewData(data: string, clear: boolean): void {
      console.log('setViewData');

      this.data = data;
      const script = this.fountain.parse(data, true);
      this.tokens = script.tokens;
      this.render();
  }

  clear(): void {
      console.log('clear');
      const viewDomContent = this.containerEl.children[1];
      viewDomContent.empty();
      this.data = '';
  }
}
