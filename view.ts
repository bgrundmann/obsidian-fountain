import { TextFileView, WorkspaceLeaf } from 'obsidian';
import { Fountain, Token, InlineLexer } from 'fountain-js';

export const VIEW_TYPE_FOUNTAIN = 'fountain';

function fountainToHtml(tokens: Token[]) {
  return tokens.map(fountainTokenToHtml).join('');
}

function fountainTokenToHtml(token: Token) {
  // This is copied from fountain-js toHtml function
  // Why? Because it mostly does what I want, but
  // sadly not completely.
    let lexedText = '';

    if (token?.text) {
        lexedText = InlineLexer
                        .reconstruct(token.text, token.type === 'action');
    }

    switch (token.type) {
        case 'title': return `<h1 class="title">${lexedText}</h1>`;
        case 'author':
        case 'authors': return `<p class="authors">${lexedText}</p>`;
        case 'contact':
        case 'copyright':
        case 'credit':
        case 'date':
        case 'draft_date':
        case 'notes':
        case 'revision':
        case 'source': return `<p class="${token.type.replace(/_/g, '-')}">${lexedText}</p>`;

        case 'scene_heading': return `<h3 class="scene-heading"${(token.scene_number ? ` id="${token.scene_number}">` : `>`) + lexedText}</h3>`;
        case 'transition': return `<h2 class="transition">${lexedText}</h2>`;

        case 'dual_dialogue_begin': return `<div class="dual-dialogue">`;
        case 'dialogue_begin': return `<div class="dialogue${token.dual ? ' ' + token.dual : ''}">`;
        case 'character': return `<h4 class="character">${lexedText}</h4>`;
        case 'parenthetical': return `<p class="parenthetical">${lexedText}</p>`;
        case 'dialogue': return `<p class="words">${lexedText}</p>`;
        case 'dialogue_end': return `</div>`;
        case 'dual_dialogue_end': return `</div>`;

        case 'section':
          // Reconsider this. Should maybe just use h1,h2,h3,h4 for sections
          // and scene_heading and the like should get classes
          const section_marker = "#".repeat(token.depth ?? 1); // The ?? 1 is just to make typescript happy
          return `<p class="section">${section_marker} ${lexedText}</p>`;
        case 'synopsis':
          return `<p class="synopsis">= ${lexedText}</p>`;

        case 'note':
          return `<span class="note">[[${lexedText}]]</span>`;
          //return `<p class="synopsis">${lexedText}</p>`;
        case 'boneyard_begin': return `<!-- `;
        case 'boneyard_end': return ` -->`;

        case 'action': return `<p class="action">${lexedText}</p>`;
        case 'centered': return `<p class="centered">${lexedText}</p>`;

        case 'lyrics': return `<p class="lyrics">${lexedText}</p>`;

        case 'page_break': return `<hr />`;
        case 'spaces': return;
    }
}

export class FountainView extends TextFileView {
  fountain : Fountain;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.fountain = new Fountain();
    console.log('view created %p', this)
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
      const child = this.containerEl.children[1];
      child.empty();
      const mainblock = child.createDiv('screenplay');
      // Assuming nobody does a supply chain attack on the fountain library, the below
      // is fine as there is no way for the user to embed html in the fountain.
      mainblock.innerHTML = fountainToHtml(script.tokens);
  }

  clear(): void {
      console.log('clear');
      const viewDomContent = this.containerEl.children[1];
      viewDomContent.empty();
      this.data = '';
  }
}
