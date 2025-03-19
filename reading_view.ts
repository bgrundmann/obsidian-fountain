import type {
  Action,
  Dialogue,
  FountainElement,
  FountainScript,
  Line,
  Range,
  ShowHideSettings,
  StructureScene,
  StructureSection,
  Synopsis,
} from "./fountain";
import { NBSP } from "./fountain";
export {
  renderFountain,
  renderIndexCards,
  getDataRange,
  rangeOfFirstVisibleLine,
};

function assertNever(x: never): never {
  throw new Error(`Unexpected object: ${x}`);
}

function dataRange(r: Range): { "data-range": string } {
  return { "data-range": `${r.start},${r.end}` };
}

function endOfRange(r: Range): Range {
  return { start: r.end, end: r.end };
}

/// Generate the blank line at the end of a range.
function renderBlankLine(parent: HTMLElement, r?: Range): HTMLElement {
  return parent.createDiv({
    // end,end on purpose
    attr: r ? dataRange(endOfRange(r)) : {},
    text: NBSP,
  });
}

function renderAction(
  parent: HTMLElement,
  action: Action,
  script: FountainScript,
  settings: ShowHideSettings,
): void {
  renderLines(parent, script, ["action"], action.lines, true, settings);
  renderBlankLine(parent, action.range);
}

function renderDialogue(
  parent: HTMLElement,
  dialogue: Dialogue,
  script: FountainScript,
  settings: ShowHideSettings,
  blackoutCharacter?: string,
): void {
  // Character line (including extensions)
  parent.createDiv(
    {
      attr: dataRange(dialogue.characterRange),
    },
    (div) => {
      div.createEl("h4", {
        cls: "dialogue-character",
        text: script.unsafeExtractRaw({
          start: dialogue.characterRange.start,
          end: dialogue.characterExtensionsRange.end,
        }),
      });
    },
  );
  if (dialogue.parenthetical) {
    const p = dialogue.parenthetical;
    parent.createDiv(
      {
        attr: dataRange(p),
      },
      (div) => {
        div.createDiv({
          cls: "dialogue-parenthetical",
          text: script.unsafeExtractRaw(p),
        });
      },
    );
  }
  const classes =
    blackoutCharacter &&
    script.charactersOf(dialogue).includes(blackoutCharacter)
      ? ["blackout", "dialogue-words"]
      : ["dialogue-words"];
  renderLines(parent, script, classes, dialogue.lines, false, settings);
  renderBlankLine(parent, dialogue.range);
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

function renderLines(
  parent: HTMLElement,
  script: FountainScript,
  lineClasses: string[], // Changed from lineClass: string
  lines: Line[],
  escapeLeadingSpaces: boolean,
  settings: ShowHideSettings,
): void {
  for (const line of lines) {
    const centered = line.centered ? "centered" : "";
    // Merge the lineClasses array with centered if present
    const allClasses = centered ? [centered, ...lineClasses] : lineClasses;
    parent.createDiv({ attr: dataRange(line.range) }, (div) => {
      const innerDiv = div.createDiv({ cls: allClasses });
      if (line.elements.length === 0) {
        // Need a nbsp so that the div is not empty and gets regular text height
        innerDiv.appendText(NBSP);
      } else {
        script.styledTextToHtml(
          innerDiv,
          line.elements,
          settings,
          escapeLeadingSpaces,
        );
      }
    });
  }
}

/**
 * Render the content of the script (everything but the title page).
 */
function renderContent(
  parent: HTMLElement,
  script: FountainScript,
  settings: ShowHideSettings,
  blackoutCharacter?: string,
): void {
  let skippingRest = false;
  const convertElement = (el: FountainElement): void => {
    if (skippingRest) {
      return;
    }
    switch (el.kind) {
      case "action":
        renderAction(parent, el, script, settings);
        break;
      case "scene":
        {
          parent.createEl("h3", {
            cls: "scene-heading",
            attr: dataRange(el.range),
            text: script.unsafeExtractRaw(el.range),
          });
          renderBlankLine(parent, el.range);
        }
        break;

      case "synopsis":
        if (settings.hideSynopsis) {
          return;
        }
        for (const l of el.linesOfText) {
          parent.createDiv({
            cls: "synopsis",
            attr: dataRange(l),
            text: script.unsafeExtractRaw(l, true),
          });
        }
        break;

      case "section":
        {
          const title = script.unsafeExtractRaw(el.range);
          if (
            title
              .toLowerCase()
              .replace(/^ *#+ */, "")
              .trimEnd() === "boneyard"
          ) {
            if (settings.hideBoneyard) {
              skippingRest = true;
              return;
            }
            parent.createEl("hr");
          }
          const tag = `h${el.depth ?? 1}` as keyof HTMLElementTagNameMap;
          parent.createEl(tag, {
            cls: "section",
            attr: dataRange(el.range),
            text: title,
          });
        }
        break;
      case "dialogue":
        renderDialogue(parent, el, script, settings, blackoutCharacter);
        break;
      case "transition":
        {
          const transitionText = script.unsafeExtractRaw(el.range);
          parent.createDiv({
            cls: "transition",
            attr: dataRange(el.range),
            text: transitionText,
          });
          renderBlankLine(parent, el.range);
        }
        break;
      case "page-break":
        parent.createEl("hr", {
          attr: dataRange(el.range),
        });
        break;
    }
  };
  for (const el of script.script) {
    convertElement(el);
  }
}

const INDENT = NBSP.repeat(3);

function renderTitlePage(parent: HTMLElement, script: FountainScript): void {
  const titlePage = script.titlePage;

  if (titlePage.length > 0) {
    for (const kv of titlePage) {
      if (kv.values.length === 1) {
        parent.createDiv({}, (div) => {
          div.appendText(`${kv.key}: `);
          script.styledTextToHtml(div, kv.values[0], {}, true);
        });
      } else {
        parent.createDiv({ text: `${kv.key}: ` });
        for (const v of kv.values) {
          parent.createDiv({}, (div) => {
            div.appendText(INDENT);
            script.styledTextToHtml(div, v, {}, true);
          });
        }
      }
      // blank line
      renderBlankLine(parent);
      parent.createEl("hr");
      renderBlankLine(parent);
    }
  }
}

/**
 * Render the readonly view of a fountain document.
 * @param parent this elements content will be replaced
 * @param script the document to render
 * @param settings
 * @param blackoutCharacter if given this characters dialogue is blacked out.
 */
function renderFountain(
  parent: HTMLElement,
  script: FountainScript,
  settings: ShowHideSettings,
  blackoutCharacter?: string,
): void {
  renderTitlePage(parent, script);
  renderContent(parent, script, settings, blackoutCharacter);
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
        div2.createDiv({
          cls: "synopsis",
          attr: dataRange(l),
          text: script.unsafeExtractRaw(l, true),
        });
      }
    },
  );
}

function emitIndexCard(
  div: HTMLElement,
  script: FountainScript,
  scene: StructureScene,
): void {
  if (scene.scene) {
    const heading = scene.scene;
    div.createDiv(
      {
        cls: "screenplay-index-card",
        attr: {
          draggable: true,
          ...dataRange(scene.range),
        },
      },
      (indexCard) => {
        indexCard.createEl("h3", {
          cls: "scene-heading",
          attr: dataRange(heading.range),
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
          emitIndexCard(sectionDiv, script, el);
          break;
        case "section":
          emitIndexCardsSection(sectionDiv, script, el);
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
function renderIndexCards(div: HTMLElement, script: FountainScript): void {
  const structure = script.structure();
  div.empty();
  for (const s of structure) {
    emitIndexCardsSection(div, script, s);
  }
}
