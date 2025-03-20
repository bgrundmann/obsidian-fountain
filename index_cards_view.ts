import { dataRange } from "render_tools";
import type {
  FountainScript,
  Range,
  StructureScene,
  StructureSection,
  Synopsis,
} from "./fountain";

type Callbacks = {
  moveScene: (rangeOfScene: Range, newStart: number) => void;
  copyScene: (rangeOfScene: Range) => void;
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

// function installIndexCardEventHandlers(mainblock: HTMLDivElement) {
//   const indexCards = mainblock.querySelectorAll<HTMLElement>(
//     ".screenplay-index-card",
//   );
//   for (const indexCard of indexCards) {
//     const indexCardRange = getDataRange(indexCard);
//     if (!indexCardRange) continue;
//     indexCard.addEventListener("dragstart", (evt: DragEvent) => {
//       this.dragstartHandler(mainblock, indexCardRange, evt);
//     });
//     this.addDragOverLeaveDropHandlers(indexCard, indexCardRange);
//     const bt = indexCard.querySelector("button.copy") as HTMLElement;
//     setIcon(bt, "more-vertical");
//     bt.addEventListener("click", (_ev) => {
//       this.copyScene(indexCardRange);
//     });
//   }
//   /*
//   const sections = mainblock.querySelectorAll<HTMLElement>(".section");
//   for (const section of sections) {
//     const start = Number.parseInt(section.getAttribute("data-start") || "-1");
//     // TODO think about if that is always the right thing for sections
//     const range = rangeFromStart(start);
//     this.addDragOverLeaveDropHandlers(section, range);
//   }
//   */

//   const editableSynopsis = mainblock.querySelectorAll("[data-synopsis]");
//   for (const es_ of editableSynopsis) {
//     const es = es_ as HTMLElement;
//     // TODO: figure out better ways to handle that range.
//     const lineRanges: Range[] = Array.from(
//       es.querySelectorAll("[data-range]"),
//     ).map((e) => getDataRange(e as HTMLElement) || { start: 0, end: 0 });

//     es.addEventListener("click", (ev) => {
//       const range = getDataRange(es, "synopsis");
//       if (range === null) return;

//       this.onEditSynopsisInIndexCardHandler(es, range, lineRanges);
//     });
//   }
// }

function assertNever(x: never): never {
  throw new Error(`Unexpected object: ${x}`);
}

function renderSynopsis(
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
        indexCard.createEl("h3", {
          cls: "scene-heading",
          attr: dataRange(heading.range),
          text: script.unsafeExtractRaw(heading.range),
        });
        indexCard.createDiv({ cls: "index-card-buttons" }, (buttons) => {
          buttons.createEl("button", { cls: "copy" });
        });
        if (scene.synopsis) {
          renderSynopsis(indexCard, script, scene.synopsis);
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
    renderSynopsis(parent, script, section.synopsis);
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
