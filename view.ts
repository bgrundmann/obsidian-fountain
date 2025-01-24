import { TextFileView, WorkspaceLeaf } from 'obsidian';
import { Fountain, Token, InlineLexer } from 'fountain-js';
import { formatWithOptions } from 'util';

export const VIEW_TYPE_FOUNTAIN = 'fountain';

enum ShowMode {
  Everything,
  WithoutSynopsisAndNotes,
  IndexCards
}

function fountainToHtml(tokens: Token[], mode: ShowMode) {
  return tokens.map(t => fountainTokenToHtml(t, mode)).join('');
}

function fountainTokenToHtml(token: Token, mode: ShowMode ) {
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
        case 'title': return script(`<h1 class="title">${lexedText}</h1>`);
        case 'author':
        case 'authors': return script(`<p class="authors">${lexedText}</p>`);
        case 'contact':
        case 'copyright':
        case 'credit':
        case 'date':
        case 'draft_date':
        case 'notes':
        case 'revision':
        case 'source': return script(`<p class="${token.type.replace(/_/g, '-')}">${lexedText}</p>`);

        case 'scene_heading': return `<h3 class="scene-heading"${(token.scene_number ? ` id="${token.scene_number}">` : `>`) + lexedText}</h3>`;
        case 'transition': return script(`<h2 class="transition">${lexedText}</h2>`);

        case 'dual_dialogue_begin': return script(`div class="dual-dialogue">`);
        case 'dialogue_begin': return script(`<div class="dialogue${token.dual ? ' ' + token.dual : ''}">`);
        case 'character': return script(`<h4 class="character">${lexedText}</h4>`);
        case 'parenthetical': return script(`<p class="parenthetical">${lexedText}</p>`);
        case 'dialogue': return script(`<p class="words">${lexedText}</p>`);
        case 'dialogue_end': return script(`</div>`);
        case 'dual_dialogue_end': return script(`</div>`);

        case 'section':
          // Reconsider this. Should maybe just use h1,h2,h3,h4 for sections
          // and scene_heading and the like should get classes
          const section_marker = "#".repeat(token.depth ?? 1); // The ?? 1 is just to make typescript happy
          return `<p class="section">${section_marker} ${lexedText}</p>`;
        case 'synopsis':
          return showSynopsis ? `<p class="synopsis">= ${lexedText}</p>` : "";

        case 'note':
          return script(`<span class="note">[[${lexedText}]]</span>`);
        case 'boneyard_begin': return `<!-- `;
        case 'boneyard_end': return ` -->`;

        case 'action': return script(`<p class="action">${lexedText}</p>`);
        case 'centered': return script(`<p class="centered">${lexedText}</p>`);

        case 'lyrics': return script(`<p class="lyrics">${lexedText}</p>`);

        case 'page_break': return script(`<hr />`);
        case 'spaces': return;
    }
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
      const mainblock = child.createDiv('screenplay');
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
