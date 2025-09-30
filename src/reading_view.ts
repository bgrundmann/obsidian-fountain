import type {
  Action,
  Dialogue,
  FountainElement,
  FountainScript,
  Line,
  Lyrics,
  Range,
  ShowHideSettings,
  Synopsis,
} from "./fountain";
import { NBSP, dataRange, extractTransitionText } from "./fountain";
import { renderBlankLine } from "./render_tools";
export { renderFountain, getDataRange, rangeOfFirstVisibleLine, renderElement };

function renderAction(
  parent: HTMLElement,
  action: Action,
  script: FountainScript,
  settings: ShowHideSettings,
): void {
  if (renderLines(parent, script, ["action"], action.lines, true, settings)) {
    renderBlankLine(parent, action.range);
  }
}

function renderLyrics(
  parent: HTMLElement,
  lyrics: Lyrics,
  script: FountainScript,
  settings: ShowHideSettings,
): void {
  if (renderLines(parent, script, ["lyrics"], lyrics.lines, true, settings)) {
    renderBlankLine(parent, lyrics.range);
  }
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

/** @returns false if lines contained ONLY elements that were hidden because of settings. */
function renderLines(
  parent: HTMLElement,
  script: FountainScript,
  lineClasses: string[], // Changed from lineClass: string
  lines: Line[],
  escapeLeadingSpaces: boolean,
  settings: ShowHideSettings,
): boolean {
  let everythingHidden = true;
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
        const thisLineWasCompletelyHidden = !script.styledTextToHtml(
          innerDiv,
          line.elements,
          settings,
          escapeLeadingSpaces,
        );
        everythingHidden = everythingHidden && thisLineWasCompletelyHidden;
      }
    });
  }
  return !everythingHidden || lines.length > 0;
}

function renderSynopsis(
  parent: HTMLElement,
  script: FountainScript,
  synopsis: Synopsis,
  settings: ShowHideSettings,
): void {
  for (const l of synopsis.linesOfText) {
    parent.createDiv({
      cls: "synopsis",
      attr: dataRange(l),
      text: script.unsafeExtractRaw(l, true),
    });
  }
  renderBlankLine(parent, synopsis.range);
}

/**
 * Renders a single fountain element to HTML.
 */
function renderElement(
  parent: HTMLElement,
  el: FountainElement,
  script: FountainScript,
  settings: ShowHideSettings,
  blackoutCharacter?: string,
): void {
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
      renderSynopsis(parent, script, el, settings);
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
        const transitionText = extractTransitionText(el, script);
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
    case "lyrics":
      renderLyrics(parent, el, script, settings);
      break;
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
  for (const el of script.script) {
    renderElement(parent, el, script, settings, blackoutCharacter);
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
    }
    renderBlankLine(parent);
    parent.createEl("hr");
    renderBlankLine(parent);
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
  // Use filtered script to ensure consistent behavior and eliminate unwanted newlines
  const filteredScript = script.withHiddenElementsRemoved({
    hideBoneyard: settings.hideBoneyard,
    hideNotes: settings.hideNotes,
    hideSynopsis: settings.hideSynopsis,
  });

  renderTitlePage(parent, script); // Title page uses original script
  renderContent(parent, filteredScript, settings, blackoutCharacter);
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
