import { Action, Dialogue, Scene, Section, FountainScript, FountainElement } from './fountain.js';
export { reading_view, index_cards_view };

function action_to_html(action: Action, script: FountainScript): string {
    const elts = action.text.map((el) => script.text_element_to_html(el, true)).join("");
    return `<p class="action">${elts}</p>`;
}

function dialogue_to_html(dialogue: Dialogue, script: FountainScript): string {
  const characterLine = script.extract_as_html(dialogue.characterRange);
  // TODO:
  const parenthetical =
    dialogue.parenthetical !== null ?
      `<p class="dialogue-parenthetical">${script.extract_as_html(dialogue.parenthetical)}</p>`
      : "";
  const words = dialogue.text.map((el) => script.text_element_to_html(el, false)).join("");
  return `<div class="dialogue"><h4 class="dialogue-character">${characterLine}</h4>${parenthetical}<p class="dialogue-words">${words}</p></div>`
}

/**
 Converts the parsed document to a html representation (aka the regular reading view).
 */
function reading_view(script: FountainScript): string {
    let sceneNumber = 1;
    const element_to_html = (el: FountainElement): string => {
      switch (el.kind) {
        case 'action':
          return action_to_html(el, script);
        case 'scene':
          const text = script.extract_as_html(el.range);
          const res = `<h3 class="scene-heading" id="scene${sceneNumber}">${text}</h3>`;
          sceneNumber++;
          return res;
        case 'synopsis':
          return `<p class="synopsis">${script.extract_as_html(el.synopsis)}</p>`;
        case 'section':
          const title = script.extract_as_html(el.range);
          let prefix = "";
          if (title.toLowerCase().replace(/^ *#+ */, '').trimEnd() === "boneyard") {
            prefix = '<hr>';
          }
          const html = (`${prefix}<h${el.depth ?? 1} class="section">${title}</h${el.depth ?? 1}>`);
          return html;
        case 'dialogue':
          return dialogue_to_html(el, script);
        default:
          return `TODO: ${el.kind}`;
      }
    };

    return script.script.map((el) => element_to_html(el)).join("");
}

enum Inside {
  Nothing = 0,
  Section,
  Card,
}

function index_cards_view(script: FountainScript): string {
  let state : Inside = Inside.Nothing;
  let result : string[] = [];
  let sceneNumber: number = 1;
  function emit(s: string) {
    result.push(s)
  }
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
  for (const el of script.script) {
    switch (el.kind) {
      case 'scene':
        closeIfInside(Inside.Card);
        emitOpenTill(Inside.Card);
        emit(`<h3 class="scene-heading" id="scene${sceneNumber}">${script.extract_as_html(el.range)}</h3>`);
        sceneNumber++;
        break;

      case 'section':
        // We ignore sections of depth 4 and deeper in the overview
        console.log(el);
        if (el.depth <= 3) {
          closeIfInside(Inside.Section);
          const title = script.extract_as_html(el.range);
          if (title.toLowerCase().replace(/^ *#+ */, '').trimEnd() === "boneyard") {
            emit('<hr>');
          }
          emit(`<h${el.depth ?? 1} class="section">${title}</h${el.depth ?? 1}>`);
        }
        break;

      case 'synopsis':
        emit(`<p class="synopsis">${script.extract_as_html(el.synopsis)}</p>`);
        break;

      default:
        break;
    }
  }
  closeIfInside(Inside.Section);
  return result.join('');
}

// function compile(showMode: ShowMode, tokens: Token[]) {
//   let result : string[] = [];
//   let sceneNumber: number = 0;
//   function emit(s: string) {
//     result.push(s)
//   }

//   function fountainToIndexCards() {
//     let state : Inside = Inside.Nothing;
//     function closeIfInside(what: Inside.Section|Inside.Card) {
//       while (state >= what) {
//         emit('</div>');
//         state--;
//       }
//     }
//     function emitOpenTill(what: Inside.Section|Inside.Card) {
//       while (state < what) {
//         state++;
//         switch (state) {
//           case Inside.Nothing:
//             break;
//           case Inside.Section:
//             emit('<div class="screenplay-index-cards">');
//             break;
//           case Inside.Card:
//             emit('<div class="screenplay-index-card">')
//             break;
//         }
//       }
//     }
//     function convert(token: Token) {
//       // This is copied from fountain-js toHtml function
//       // Why? Because it mostly does what I want, but
//       // sadly not completely.
//         let lexedText = '';

//         if (token?.text) {
//            // TODO: Handle inline notes 
//             lexedText = InlineLexer
//                             .reconstruct(token.text, token.type === 'action');
//         }

//         console.log(token.type);

//         switch (token.type) {
//             case 'title':
//             case 'author':
//             case 'authors':
//             case 'contact':
//             case 'copyright':
//             case 'credit':
//             case 'date':
//             case 'draft_date':
//             case 'notes':
//             case 'revision':
//             case 'source':
//             case 'transition':
//             case 'dual_dialogue_begin':
//             case 'dialogue_begin':
//             case 'character':
//             case 'parenthetical':
//             case 'dialogue':
//             case 'dialogue_end':
//             case 'dual_dialogue_end':
//             case 'note':
//             case 'action':
//             case 'centered':
//             case 'lyrics':
//             case 'page_break':
//             case 'spaces':
//               break;

//             case 'scene_heading':
//               closeIfInside(Inside.Card);
//               emitOpenTill(Inside.Card);
//               emit(`<h3 class="scene-heading" id="scene${sceneNumber}">${lexedText}</h3>`);
//               sceneNumber++;
//               break;

//             case 'section':
//               // We ignore sections of depth 4 and deeper in the overview
//               if ((token.depth ?? 1) <= 3) {
//                 closeIfInside(Inside.Section);
//                 if (lexedText.toLowerCase().trim() == "boneyard") {
//                   emit('<hr>');
//                 }
//                 emit(`<h${token.depth ?? 1} class="section">${lexedText}</h${token.depth ?? 1}>`);
//               }
//               break;

//             case 'synopsis':
//               emit(`<p class="synopsis">= ${lexedText}</p>`);
//               break;

//             case 'boneyard_begin': emit(`<!-- `);
//             case 'boneyard_end': emit(` -->`);
//         }
//     }
//     for (const t of tokens) {
//       convert(t);
//     }
//     closeIfInside(Inside.Section);
//     return result;
//   }

//   function fountainToHtml(showSynopsisAndNotes: boolean) {
//     function convert(token: Token) {
//       // This is copied from fountain-js toHtml function
//       // Why? Because it mostly does what I want, but
//       // sadly not completely.
//         let lexedText = '';

//         if (token?.text) {
//            // TODO: Handle inline notes 
//             lexedText = InlineLexer
//                             .reconstruct(token.text, token.type === 'action');
//         }

//         switch (token.type) {
//             case 'title': emit(`<h1 class="title">${lexedText}</h1>`); break;
//             case 'author':
//             case 'authors': emit(`<p class="authors">${lexedText}</p>`); break;
//             case 'contact':
//             case 'copyright':
//             case 'credit':
//             case 'date':
//             case 'draft_date':
//             case 'notes':
//             case 'revision':
//             case 'source':
//               emit(`<p class="${token.type.replace(/_/g, '-')}">${lexedText}</p>`);
//               break;

//             case 'scene_heading':
//               emit(`<h3 class="scene-heading" id="scene${sceneNumber}">${lexedText}</h3>`);
//               sceneNumber++;
//               break;

//             case 'transition':
//               emit(`<h2 class="transition">${lexedText}</h2>`);
//               break;

//             case 'dual_dialogue_begin':
//               emit(`div class="dual-dialogue">`);
//               break;
//             case 'dialogue_begin':
//               emit(`<div class="dialogue${token.dual ? ' ' + token.dual : ''}">`);
//               break;
//             case 'character':
//               emit(`<h4 class="character">${lexedText}</h4>`);
//               break;
//             case 'parenthetical':
//               emit(`<p class="parenthetical">${lexedText}</p>`);
//               break;
//             case 'dialogue':
//               emit(`<p class="words">${lexedText}</p>`);
//               break;
//             case 'dialogue_end':
//               emit(`</div>`);
//               break;
//             case 'dual_dialogue_end':
//               emit(`</div>`);
//               break;

//             case 'section':
//               // Reconsider this. Should maybe just use h1,h2,h3,h4 for sections
//               // and scene_heading and the like should get classes
//               if (lexedText.toLowerCase().trim() == "boneyard") {
//                 emit('<hr>');
//               }
//               emit(`<h${token.depth ?? 1} class="section">${lexedText}</h${token.depth ?? 1}>`);
//               break;

//             case 'synopsis':
//               emit(showSynopsisAndNotes ? `<p class="synopsis">= ${lexedText}</p>` : "");
//               break;

//             case 'note':
//               emit(showSynopsisAndNotes ? `<span class="note">[[${lexedText}]]</span>` : "");
//               break;
//             case 'boneyard_begin': return `<!-- `;
//             case 'boneyard_end': return ` -->`;

//             case 'action':
//               emit(`<p class="action">${lexedText}</p>`);
//               break;

//             case 'centered':
//               emit(`<p class="centered">${lexedText}</p>`);
//               break;

//             case 'lyrics':
//               emit(`<p class="lyrics">${lexedText}</p>`);
//               break;

//             case 'page_break':
//               emit(`<hr />`);
//               break;
//             case 'spaces':
//               break;
//         }
//     }
//     for (const t of tokens) {
//       convert(t);
//     }
//     return result;
//   }

//   let fragments: string[];
//   switch (showMode) {
//     case ShowMode.Everything:
//       fragments = fountainToHtml(true);
//       break;
//     case ShowMode.WithoutSynopsisAndNotes:
//       fragments = fountainToHtml(false);
//       break;
//     case ShowMode.IndexCards:
//       fragments = fountainToIndexCards();
//       break;
//   }
//   return fragments.join('');
// }
