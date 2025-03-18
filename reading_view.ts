import {
  type Action,
  type Dialogue,
  type FountainElement,
  type FountainScript,
  type Line,
  type Range,
  type ShowHideSettings,
  type StructureScene,
  type StructureSection,
  type Synopsis,
  escapeHtml,
} from "./fountain";
export { readonlyView, indexCardsView, getDataRange, rangeOfFirstVisibleLine };

const BLANK_LINE = "<div>&nbsp;</div>";

function assertNever(x: never): never {
  throw new Error(`Unexpected object: ${x}`);
}

/// Generate the blank line at the end of a range.
function blankLineAtEnd(r: Range): string {
  const end = { start: r.end, end: r.end };
  return `<div ${dataRange(end)}>&nbsp;</div>`;
}

function actionToHtml(
  action: Action,
  script: FountainScript,
  settings: ShowHideSettings,
): string {
  const html = `${linesToHtml(script, ["action"], action.lines, true, settings)}${blankLineAtEnd(action.range)}`;
  return html;
}

function dialogueToHtml(
  dialogue: Dialogue,
  script: FountainScript,
  settings: ShowHideSettings,
  blackoutCharacter?: string,
): string {
  const characterLine = script.extractAsHtml({
    start: dialogue.characterRange.start,
    end: dialogue.characterExtensionsRange.end,
  });
  // TODO:
  const parenthetical =
    dialogue.parenthetical !== null
      ? `<div ${dataRange(dialogue.parenthetical)}><div class="dialogue-parenthetical">${script.extractAsHtml(dialogue.parenthetical)}</div></div>`
      : "";
  const classes =
    blackoutCharacter &&
    script.charactersOf(dialogue).includes(blackoutCharacter)
      ? ["blackout", "dialogue-words"]
      : ["dialogue-words"];
  const words = linesToHtml(script, classes, dialogue.lines, false, settings);
  return `<div ${dataRange(dialogue.characterRange)}><h4 class="dialogue-character">${characterLine}</h4></div>
${parenthetical}
${words}
${blankLineAtEnd(dialogue.range)}`;
}

function dataRange(r: Range, name = "range"): string {
  return `data-${name}="${r.start},${r.end}"`;
}

function classes(c: string[]): string {
  if (c.length === 0) return "";
  return `class="${c.join(" ")}"`;
}

function getDataRange(target: HTMLElement, name = "range"): Range | null {
  const rawRange = target.getAttribute(`data-${name}`);
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
  lineClasses: string[], // Changed from lineClass: string
  lines: Line[],
  escapeLeadingSpaces: boolean,
  settings: ShowHideSettings,
): string {
  return lines
    .map((line) => {
      let innerHtml: string;
      if (line.elements.length === 0) {
        // Need a nbsp so that the div is not empty and gets regular text height
        innerHtml = "&nbsp;";
      } else {
        innerHtml = script.styledTextToHtml(
          line.elements,
          settings,
          escapeLeadingSpaces,
        );
      }
      const centered = line.centered ? "centered" : "";
      // Merge the lineClasses array with centered if present
      const allClasses = centered ? [centered, ...lineClasses] : lineClasses;
      return `<div ${dataRange(line.range)}><div ${classes(allClasses)}>${innerHtml}</div></div>`;
    })
    .join("");
}

/**
 * Render the readonly view of a fountain document.
 * @param div this elements content will be replaced
 * @param script the document to render
 * @param settings
 * @param blackoutCharacter if given this characters dialogue is blacked out.
 */
function readonlyView(
  div: HTMLElement,
  script: FountainScript,
  settings: ShowHideSettings,
  blackoutCharacter?: string,
) {
  let sceneNumber = 1;
  let skippingRest = false;
  const element_to_html = (el: FountainElement): string => {
    if (skippingRest) {
      return "";
    }
    switch (el.kind) {
      case "action":
        return actionToHtml(el, script, settings);
      case "scene": {
        const text = script.extractAsHtml(el.range);
        const res = `<h3 ${dataRange(el.range)} class="scene-heading" id="scene${sceneNumber}">${text}</h3>${BLANK_LINE}`;
        sceneNumber++;
        return res;
      }

      case "synopsis":
        if (settings.hideSynopsis) {
          return "";
        }
        return el.linesOfText
          .map(
            (l) =>
              `<div class="synopsis" ${dataRange(l)}>${script.extractAsHtml(l)}</div>`,
          )
          .join("");

      case "section": {
        const title = script.extractAsHtml(el.range);
        let prefix = "";
        if (
          title
            .toLowerCase()
            .replace(/^ *#+ */, "")
            .trimEnd() === "boneyard"
        ) {
          if (settings.hideBoneyard) {
            skippingRest = true;
            return "";
          }
          prefix = "<hr>";
        }
        const html = `${prefix}<h${el.depth ?? 1} class="section" ${dataRange(el.range)}>${title}</h${el.depth ?? 1}>`;
        return html;
      }
      case "dialogue":
        return dialogueToHtml(el, script, settings, blackoutCharacter);
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
    titlePageHtml = `${
      titlePage
        .map((kv) => {
          if (kv.htmlValues.length === 1) {
            return `<div>${escapeHtml(kv.key)}: ${kv.htmlValues[0]}</div>`;
          }
          return `<div>${escapeHtml(kv.key)}:</div>${kv.htmlValues
            .map((h) => {
              return `<div>&nbsp;&nbsp;&nbsp;${h}</div>`;
            })
            .join("")}`;
        })
        .join("") + BLANK_LINE
    }<hr>${BLANK_LINE}`;
  }

  const content = script.script.map((el) => element_to_html(el)).join("");
  const innerHTML = titlePageHtml + content;
  div.innerHTML = innerHTML;
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
      return r;
    }
  }
  return null;
}

function emitIndexCardSynopsis(
  div: HTMLElement,
  script: FountainScript,
  synopsis: Synopsis,
): void {
  div.createDiv(
    {
      attr: {
        "data-synopsis": `${synopsis.range.start},${synopsis.range.end}`,
      },
    },
    (div2) => {
      for (const l of synopsis.linesOfText) {
        const line = div2.createDiv({
          cls: "synopsis",
          attr: { "data-range": `${l.start},${l.end}` },
        });
        line.innerHTML = script.extractAsHtml(l);
      }
    },
  );
  /*
  emit(`<div ${dataRange(el.range, "synopsis")}>`);
  for (const l of el.linesOfText) {
    emit(
      `<div ${dataRange(l)} class="synopsis">${script.extractAsHtml(l)}</div>`,
    );
  }
  emit("</div>");
  */
}

class SceneCounter {
  count: number;

  constructor() {
    this.count = 0;
  }

  next(): number {
    return ++this.count;
  }
}

function emitIndexCard(
  div: HTMLElement,
  script: FountainScript,
  ctr: SceneCounter,
  scene: StructureScene,
): void {
  if (scene.scene) {
    const heading = scene.scene;
    const sceneNumber = ctr.next();
    div.createDiv(
      {
        cls: "screenplay-index-card",
        attr: {
          draggable: true,
          "data-range": `${scene.range.start},${scene.range.end}`,
        },
      },
      (indexCard) => {
        indexCard.createEl("h3", {
          cls: "scene-heading",
          attr: {
            "data-range": `${heading.range.start}${heading.range.end}`,
            id: `scene${sceneNumber}`,
          },
          text: script.unsafeExtractRaw(heading.range),
        });
        indexCard.createDiv({ cls: "index-card-buttons" }, (buttons) => {
          buttons.createEl("button", { cls: "copy" });
        });
        if (scene.synopsis) {
          emitIndexCardSynopsis(indexCard, script, scene.synopsis);
        }
      },
    );
  }
}

function emitIndexCardsSection(
  parent: HTMLElement,
  script: FountainScript,
  ctr: SceneCounter,
  section: StructureSection,
): void {
  if (section.section) {
    const title = script.unsafeExtractRaw(section.section.range);
    const hTag =
      `h${section.section.depth ?? 1}` as keyof HTMLElementTagNameMap;
    if (
      title
        .toLowerCase()
        .replace(/^ *#+ */, "")
        .trimEnd() === "boneyard"
    ) {
      parent.createEl("hr");
    }
    parent.createEl(hTag, {
      cls: "section",
      attr: { "data-start": section.section.range.start },
      text: title,
    });
  }
  if (section.synopsis) {
    emitIndexCardSynopsis(parent, script, section.synopsis);
  }
  parent.createDiv({ cls: "screenplay-index-cards" }, (sectionDiv) => {
    for (const el of section.content) {
      switch (el.kind) {
        case "scene":
          emitIndexCard(sectionDiv, script, ctr, el);
          break;
        case "section":
          emitIndexCardsSection(sectionDiv, script, ctr, el);
          break;
        default:
          {
            assertNever(el);
          }
          break;
      }
    }
  });
}

/**
 * Render a index card view of a given fountain document.
 * @param div This elements content will be replaced.
 * @param script the fountain document.
 */
function indexCardsView(div: HTMLElement, script: FountainScript): void {
  const structure = script.structure();
  div.empty();
  const ctr = new SceneCounter();
  for (const s of structure) {
    emitIndexCardsSection(div, script, ctr, s);
  }

  // let state: Inside = Inside.Nothing;
  // // Are we at the very start of either a section or a scene?
  // // Rationale: We only want the initial synopsis of a section
  // // or scene in the index card view
  // let atStart = true;
  // const result: string[] = [];
  // let sceneNumber = 1;
  // function emit(s: string) {
  //   result.push(s);
  // }
  // function emitClose(what: Inside.Section | Inside.Card) {
  //   while (state >= what) {
  //     emit("</div>");
  //     state--;
  //   }
  // }
  // function emitOpenTill(what: Inside.Section | Inside.Card) {
  //   while (state < what) {
  //     state++;
  //     switch (state) {
  //       case Inside.Nothing:
  //         break;
  //       case Inside.Section:
  //         emit('<div class="screenplay-index-cards">');
  //         break;
  //       case Inside.Card:
  //         emit('<div class="screenplay-index-card" draggable="true">');
  //         emit(
  //           '<div class="index-card-buttons"><button class="copy"></button></div>',
  //         );
  //         break;
  //     }
  //   }
  // }
  // for (const el of script.script) {
  //   switch (el.kind) {
  //     case "scene":
  //       // make sure the previous card is closed and open a new one.
  //       emitClose(Inside.Card);
  //       emitOpenTill(Inside.Card);
  //       emit(
  //         `<h3 class="scene-heading" id="scene${sceneNumber}" data-start="${el.range.start}">${script.extractAsHtml(el.range)}</h3>`,
  //       );
  //       atStart = true;
  //       sceneNumber++;
  //       break;

  //     case "section":
  //       // We ignore sections of depth 4 and deeper in the overview
  //       if (el.depth <= 3) {
  //         // make sure the previous card is closed and also the prev section
  //         emitClose(Inside.Section);
  //         const title = script.extractAsHtml(el.range);
  //         if (
  //           title
  //             .toLowerCase()
  //             .replace(/^ *#+ */, "")
  //             .trimEnd() === "boneyard"
  //         ) {
  //           emit("<hr>");
  //         }
  //         emit(
  //           `<h${el.depth ?? 1} class="section" data-start="${el.range.start}">${title}</h${el.depth ?? 1}>`,
  //         );
  //         atStart = true;
  //       }
  //       break;

  //     case "synopsis":
  //       if (atStart) {
  //         emit(`<div ${dataRange(el.range, "synopsis")}>`);
  //         for (const l of el.linesOfText) {
  //           emit(
  //             `<div ${dataRange(l)} class="synopsis">${script.extractAsHtml(l)}</div>`,
  //           );
  //         }
  //         emit("</div>");
  //         atStart = false;
  //       }
  //       break;

  //     default: {
  //       if (!isBlankLines(el)) {
  //         // we allow for blank lines between the section or scene
  //         // and the synopsis
  //         // but anything else indicates the end of what we will
  //         // display in the index card.
  //         atStart = false;
  //       }
  //       // With the exception of todo notes which we do display
  //       const notes = extractNotes(el);
  //       if (notes) {
  //         for (const note of notes) {
  //           if (note.noteKind === "todo") {
  //             emit(
  //               `<p class="todo"><span>${script.extractAsHtml(note.textRange)}</span></p>`,
  //             );
  //           }
  //         }
  //       }

  //       break;
  //     }
  //   }
  // }
  // emitClose(Inside.Section);
  // // emit one data-start containing the end of the document.
  // emit(`<div data-start="${script.document.length}"></div>`);
  // div.innerHTML = result.join("");
}
