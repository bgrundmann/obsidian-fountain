import { TextFileView, WorkspaceLeaf } from 'obsidian';
import { Fountain, Token, InlineLexer } from 'fountain-js';

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




export class FountainView extends TextFileView {
  fountain : Fountain;
  showMode: ShowMode;
  tokens: Token[];

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.fountain = new Fountain();
    this.showMode = ShowMode.Everything;
    this.addAction("layout-grid", "Toggle Index Card View", evt => {
      this.toggleIndexCards();
      this.render();
    } );
  }

  toggleIndexCards() {
    this.showMode = this.showMode == ShowMode.IndexCards ? ShowMode.Everything : ShowMode.IndexCards;
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
      //const main_div_class = this.showMode == ShowMode.IndexCards ? 'screenplay-index-cards' : 'screenplay';
      const mainblock = child.createDiv(this.showMode == ShowMode.IndexCards ? undefined : 'screenplay');
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
