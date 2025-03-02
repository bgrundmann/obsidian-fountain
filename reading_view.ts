import {
  type Action,
  type Dialogue,
  type FountainElement,
  type FountainScript,
  type Line,
  type Range,
  escapeHtml,
} from "./fountain.js";
export { readingView, indexCardsView, getDataRange, rangeOfFirstVisibleLine };

const BLANK_LINE: string = "<div>&nbsp;</div>";

/// Generate the blank line at the end of a range.
function blankLineAtEnd(r: Range): string {
  const end = { start: r.end, end: r.end };
  return `<div ${dataRange(end)}>&nbsp;</div>`;
}

function actionToHtml(action: Action, script: FountainScript): string {
  const html = `${linesToHtml(script, "action", action.lines, true)}${blankLineAtEnd(action.range)}`;
  return html;
}

function dialogueToHtml(dialogue: Dialogue, script: FountainScript): string {
  const characterLine = script.extractAsHtml(dialogue.characterRange);
  // TODO:
  const parenthetical =
    dialogue.parenthetical !== null
      ? `<div ${dataRange(dialogue.parenthetical)}><div class="dialogue-parenthetical">${script.extractAsHtml(dialogue.parenthetical)}</div></div>`
      : "";
  const words = linesToHtml(script, "dialogue-words", dialogue.lines, false);
  return `<div ${dataRange(dialogue.characterRange)}><h4 class="dialogue-character">${characterLine}</h4></div>
${parenthetical}
${words}
${blankLineAtEnd(dialogue.range)}`;
}

function dataRange(r: Range): string {
  return `data-range="${r.start},${r.end}"`;
}

function classes(c: string[]): string {
  if (c.length === 0) return "";
  return `class="${c.join(" ")}"`;
}

function getDataRange(target: HTMLElement): Range | null {
  const rawRange = target.getAttribute("data-range");
  if (rawRange === null) return null;
  const r = rawRange.split(",");
  if (r.length !== 2) return null;
  try {
    const start = Number.parseInt(r[0]);
    const end = Number.parseInt(r[1]);
    return { start: start, end: end };
  } catch (error) {
    return null;
  }
}

function linesToHtml(
  script: FountainScript,
  lineClass: string,
  lines: Line[],
  escapeLeadingSpaces: boolean,
): string {
  return lines
    .map((line) => {
      let innerHtml: string;
      if (line.elements.length === 0) {
        // Need a nbsp so that the div is not empty and gets regular text height
        innerHtml = "&nbsp;";
      } else {
        innerHtml = script.styledTextToHtml(line.elements, escapeLeadingSpaces);
      }
      const centered = line.centered ? "centered" : "";
      return `<div ${dataRange(line.range)}><div ${classes([centered, lineClass])}>${innerHtml}</div></div>`;
    })
    .join("");
}

/**
 Converts the parsed document to a html representation (aka the regular reading view).
 */
function readingView(script: FountainScript): string {
  let sceneNumber = 1;
  const element_to_html = (el: FountainElement): string => {
    switch (el.kind) {
      case "action":
        return actionToHtml(el, script);
      case "scene": {
        const text = script.extractAsHtml(el.range);
        const res = `<h3 ${dataRange(el.range)} class="scene-heading" id="scene${sceneNumber}">${text}</h3>${BLANK_LINE}`;
        sceneNumber++;
        return res;
      }
      case "synopsis":
        return `<div class="synopsis" ${dataRange(el.range)}>${script.extractAsHtml(el.synopsis)}</div>`;
      case "section": {
        const title = script.extractAsHtml(el.range);
        let prefix = "";
        if (
          title
            .toLowerCase()
            .replace(/^ *#+ */, "")
            .trimEnd() === "boneyard"
        ) {
          prefix = "<hr>";
        }
        const html = `${prefix}<h${el.depth ?? 1} class="section" ${dataRange(el.range)}>${title}</h${el.depth ?? 1}>`;
        return html;
      }
      case "dialogue":
        return dialogueToHtml(el, script);
      case "transition": {
        const transitionText = script.extractAsHtml(el.range);
        return `<div class="transition" ${dataRange(el.range)}>${transitionText}</div>${BLANK_LINE}`;
      }
      case "page-break":
        return `<hr ${dataRange(el.range)}>`;
    }
  };

  const titlePage = script.titlePageWithHtmlValues();
  let titlePageHtml: string;

  if (titlePage.length === 0) {
    titlePageHtml = "";
  } else {
    titlePageHtml =
      `${titlePage
        .map((kv) => {
          if (kv.htmlValues.length === 1) {
            return `<div>${escapeHtml(kv.key)}: ${kv.htmlValues[0]}</div>`;
          }
            return (
              `<div>${escapeHtml(kv.key)}:</div>${kv.htmlValues
                .map((h) => {
                  return `<div>&nbsp;&nbsp;&nbsp;${h}</div>`;
                })
                .join("")}`
            );
        })
        .join("") +
      BLANK_LINE}<hr>${BLANK_LINE}`;
  }

  const content = script.script.map((el) => element_to_html(el)).join("");
  return titlePageHtml + content;
}

/// Return the range of the first visible line on the screen. Or something close.
function rangeOfFirstVisibleLine(screenplayElement: HTMLElement): Range | null {
  // screenplay is the element that is the complete document
  // it's parent is the one that scrolls the screenplay.
  // getBoundingClientRect gives us the coordinates of the elements on the viewport (aka screen)
  // so the first child whose top >= parent of screenplay top, is the one actually scrolled into view
  // Well actually that would be the first one fully in view. But as we sometimes have longer paragraphs
  // we want to get those too. So we find the first whose bottom is visible
  const top = (
    screenplayElement.parentNode as HTMLElement
  ).getBoundingClientRect().top;
  for (const c of screenplayElement.children) {
    const child = c as HTMLElement;
    if (child.getBoundingClientRect().bottom >= top) {
      const r = getDataRange(child);
      if (r === null) continue;
      console.log(child, r);
      return r;
    }
  }
  return null;
}

enum Inside {
  Nothing = 0,
  Section = 1,
  Card = 2,
}

function indexCardsView(script: FountainScript): string {
  let state: Inside = Inside.Nothing;
  const result: string[] = [];
  let sceneNumber = 1;
  function emit(s: string) {
    result.push(s);
  }
  function closeIfInside(what: Inside.Section | Inside.Card) {
    while (state >= what) {
      emit("</div>");
      state--;
    }
  }
  function emitOpenTill(what: Inside.Section | Inside.Card) {
    while (state < what) {
      state++;
      switch (state) {
        case Inside.Nothing:
          break;
        case Inside.Section:
          emit('<div class="screenplay-index-cards">');
          break;
        case Inside.Card:
          emit('<div class="screenplay-index-card">');
          break;
      }
    }
  }
  for (const el of script.script) {
    switch (el.kind) {
      case "scene":
        closeIfInside(Inside.Card);
        emitOpenTill(Inside.Card);
        emit(
          `<h3 class="scene-heading" id="scene${sceneNumber}">${script.extractAsHtml(el.range)}</h3>`,
        );
        sceneNumber++;
        break;

      case "section":
        // We ignore sections of depth 4 and deeper in the overview
        if (el.depth <= 3) {
          closeIfInside(Inside.Section);
          const title = script.extractAsHtml(el.range);
          if (
            title
              .toLowerCase()
              .replace(/^ *#+ */, "")
              .trimEnd() === "boneyard"
          ) {
            emit("<hr>");
          }
          emit(
            `<h${el.depth ?? 1} class="section">${title}</h${el.depth ?? 1}>`,
          );
        }
        break;

      case "synopsis":
        emit(
          `<div class="synopsis">${script.extractAsHtml(el.synopsis)}</div>`,
        );
        break;

      default:
        break;
    }
  }
  closeIfInside(Inside.Section);
  return result.join("");
}
