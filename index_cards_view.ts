import { dataRange } from "render_tools";
import type {
  FountainScript,
  Range,
  StructureScene,
  StructureSection,
  Synopsis,
} from "./fountain";
import { extractNotes } from "./fountain";

type Callbacks = {
  moveScene: (rangeOfScene: Range, newStart: number) => void;
  copyScene: (rangeOfScene: Range) => void;
  replaceText: (range: Range, s: string) => void;
  getText: (range: Range) => string;
  reRender: () => void;
  startEditModeHere: (range: Range) => void;
  startReadingModeHere: (range: Range) => void;
};

function getDragData(evt: DragEvent): Range | null {
  try {
    const json = evt.dataTransfer?.getData("application/json");
    if (!json) return null;
    const r: Range = JSON.parse(json);
    return r;
  } catch (error) {
    return null;
  }
}

function dropHandler(
  dropZone: Element,
  dropZoneRange: Range,
  callbacks: Callbacks,
  evt: DragEvent,
) {
  const draggedRange = getDragData(evt);
  if (!draggedRange) return;
  if (draggedRange.start === dropZoneRange.start) return;
  const before = dropZone.classList.contains("drop-left");
  if (!before && !dropZone.classList.contains("drop-right")) return;
  dropZone.classList.remove("drop-left");
  dropZone.classList.remove("drop-right");
  evt.preventDefault();
  callbacks.moveScene(
    draggedRange,
    before ? dropZoneRange.start : dropZoneRange.end,
  );
  callbacks.reRender();
}

/** This handler just adds classes to visually indicate if dropping
 the scene here would drag it infront or behind the element.
 NOTE: The classes are not only used for the visual indicators
 but also in the drop handler so the decision where to drop is done
 only once.
 */
function dragoverHandler(
  dropZone: Element,
  dropZoneRange: Range,
  evt: DragEvent,
) {
  evt.preventDefault();
  const rect = dropZone.getBoundingClientRect();
  const mouseX = evt.clientX;

  // Clamp mouseX to element boundaries
  const clampedX = Math.min(Math.max(mouseX, rect.left), rect.right);
  //
  // Calculate percentage within bounds
  const percentage = ((clampedX - rect.left) / rect.width) * 100;

  if (percentage > 70) {
    dropZone.classList.add("drop-right");
    dropZone.classList.remove("drop-left");
  } else if (percentage < 30) {
    dropZone.classList.add("drop-left");
    dropZone.classList.remove("drop-right");
  } else {
    dropZone.classList.remove("drop-left");
    dropZone.classList.remove("drop-right");
  }
}

/** When we start dragging we store the range of the scene. */
function dragstartHandler(range: Range, evt: DragEvent): void {
  if (!evt.dataTransfer) return;
  evt.dataTransfer.clearData();
  evt.dataTransfer.setData("application/json", JSON.stringify(range));
}

function installDragAndDropHandlers(
  callbacks: Callbacks,
  indexCard: HTMLElement,
  range: Range,
) {
  indexCard.addEventListener("dragover", (evt: DragEvent) => {
    dragoverHandler(indexCard, range, evt);
  });
  indexCard.addEventListener("dragleave", (e: DragEvent) => {
    indexCard.classList.remove("drop-left");
    indexCard.classList.remove("drop-right");
  });
  indexCard.addEventListener("drop", (e: DragEvent) => {
    dropHandler(indexCard, range, callbacks, e);
  });
  indexCard.addEventListener("dragstart", (evt: DragEvent) => {
    dragstartHandler(range, evt);
  });
}

function assertNever(x: never): never {
  throw new Error(`Unexpected object: ${x}`);
}

function editSynopsisHandler(
  el: HTMLElement,
  range: Range,
  linesOfText: Range[],
  callbacks: Callbacks,
) {
  const lines = linesOfText.map((r) => callbacks.getText(r));
  const textarea = createEl("textarea", {
    text: lines.join("\n"),
  });
  const buttonContainer = el.createDiv({
    cls: "edit-buttons",
  });
  const cancelButton = buttonContainer.createEl("button", {
    text: "Cancel",
  });
  const okButton = buttonContainer.createEl("button", {
    text: "OK",
  });
  el.replaceWith(textarea, buttonContainer);
  cancelButton.addEventListener("click", () => {
    callbacks.reRender();
  });
  okButton.addEventListener("click", () => {
    const synopsified = textarea.value
      .split("\n")
      .map((l) => `= ${l}`)
      .join("\n");
    callbacks.replaceText(range, `${synopsified}\n`);
    callbacks.reRender();
  });
}

function renderSynopsis(
  div: HTMLElement,
  script: FountainScript,
  synopsis: Synopsis | undefined,
  startPosIfEmpty: number,
  callbacks: Callbacks,
): void {
  const synopsisRange = synopsis?.range || {
    start: startPosIfEmpty,
    end: startPosIfEmpty,
  };
  div.createDiv(
    {
      attr: dataRange(synopsisRange),
    },
    (div2) => {
      div2.addEventListener("click", (_evt: Event) => {
        editSynopsisHandler(
          div2,
          synopsisRange,
          synopsis?.linesOfText || [],
          callbacks,
        );
      });
      for (const l of synopsis?.linesOfText || []) {
        div2.createDiv({
          cls: "synopsis",
          attr: dataRange(l),
          text: script.unsafeExtractRaw(l, true),
        });
      }
      if (!synopsis) {
        div2.createDiv({
          cls: ["synopsis", "show-on-hover"],
          text: "Click to edit",
        });
      }
    },
  );
}

/** Render a index card. As of right now that includes only the scene heading
and if the scene heading was followed by a synopsis, that synopsis. */
function renderIndexCard(
  div: HTMLElement,
  script: FountainScript,
  scene: StructureScene,
  callbacks: Callbacks,
): void {
  if (scene.scene) {
    const heading = scene.scene;
    const content = scene.content;
    div.createDiv(
      {
        cls: "screenplay-index-card",
        attr: {
          draggable: true,
          ...dataRange(scene.range),
        },
      },
      (indexCard) => {
        installDragAndDropHandlers(callbacks, indexCard, scene.range);
        indexCard.createEl(
          "h3",
          {
            cls: "scene-heading",
            attr: dataRange(heading.range),
            text: script.unsafeExtractRaw(heading.range),
          },
          (heading) => {
            heading.addEventListener("click", (_evt) => {
              callbacks.startReadingModeHere(scene.range);
            });
          },
        );
        indexCard.createDiv(
          { cls: ["index-card-buttons", "show-on-hover"] },
          (buttons) => {
            buttons.createEl("button", { cls: "copy" });
          },
        );
        renderSynopsis(
          indexCard,
          script,
          scene.synopsis,
          heading.range.end,
          callbacks,
        );
        const notes = extractNotes(content).filter(
          (n) => n.noteKind === "todo",
        );
        for (const note of notes) {
          indexCard.createDiv({}, (div) => {
            script.styledTextToHtml(div, [note], {}, false);
            div.addEventListener("click", () =>
              callbacks.startEditModeHere(note.range),
            );
          });
        }
      },
    );
  }
}

/** Render a section, that is a combination of a heading followed by all the
scenes that section contains. If the document started immediately with a a scene
the section might be an unnamed section and not have a section header. */
function renderSection(
  parent: HTMLElement,
  script: FountainScript,
  section: StructureSection,
  callbacks: Callbacks,
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
    renderSynopsis(
      parent,
      script,
      section.synopsis,
      section.synopsis.range.start,
      callbacks,
    );
  }
  parent.createDiv({ cls: "screenplay-index-cards" }, (sectionDiv) => {
    for (const el of section.content) {
      switch (el.kind) {
        case "scene":
          renderIndexCard(sectionDiv, script, el, callbacks);
          break;
        case "section":
          renderSection(sectionDiv, script, el, callbacks);
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
export function renderIndexCards(
  div: HTMLElement,
  script: FountainScript,
  callbacks: Callbacks,
): void {
  const structure = script.structure();
  div.empty();
  for (const s of structure) {
    renderSection(div, script, s, callbacks);
  }
}
