import { Menu, setIcon } from "obsidian";
import type {
  FountainScript,
  Range,
  StructureScene,
  StructureSection,
  Synopsis,
} from "./fountain";
import { dataRange, extractNotes } from "./fountain";

import { endOfRange } from "./render_tools";

export type Callbacks = {
  reRender: () => void;
  requestSave: () => void;
  startEditModeHere: (range: Range) => void;
  startReadingModeHere: (range: Range) => void;
  replaceText: (range: Range, replacement: string) => void;
  moveScene: (range: Range, newPos: number) => void;
  duplicateScene: (range: Range) => void;
  moveSceneCrossFile: (
    srcRange: Range,
    dstPath: string,
    dstNewPos: number,
  ) => void;
  getText: (range: Range) => string;
};

type DragData = {
  path: string;
  range: Range;
};

function getDragData(evt: DragEvent): DragData | null {
  try {
    const json = evt.dataTransfer?.getData("application/json");
    if (!json) return null;
    const d: DragData = JSON.parse(json);
    return d;
  } catch (error) {
    return null;
  }
}

function dropHandler(
  dropZone: Element,
  path: string,
  dropZoneRange: Range,
  callbacks: Callbacks,
  evt: DragEvent,
) {
  const dragData = getDragData(evt);
  if (!dragData) return;
  if (dragData.range.start === dropZoneRange.start) return;
  const before = dropZone.classList.contains("drop-left");
  if (!before && !dropZone.classList.contains("drop-right")) return;
  dropZone.classList.remove("drop-left");
  dropZone.classList.remove("drop-right");
  evt.preventDefault();
  callbacks.moveSceneCrossFile(
    dragData.range,
    path,
    before ? dropZoneRange.start : dropZoneRange.end,
  );
  callbacks.requestSave();
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
function dragstartHandler(path: string, range: Range, evt: DragEvent): void {
  if (!evt.dataTransfer) return;
  evt.dataTransfer.clearData();
  evt.dataTransfer.setData(
    "application/json",
    JSON.stringify({ path: path, range: range }),
  );
}

function installDragAndDropHandlers(
  path: string,
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
    dropHandler(indexCard, path, range, callbacks, e);
  });
  indexCard.addEventListener("dragstart", (evt: DragEvent) => {
    dragstartHandler(path, range, evt);
  });
}

function assertNever(x: never): never {
  throw new Error(`Unexpected object: ${x}`);
}

function editSynopsisHandler(
  el: HTMLElement,
  path: string,
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
  textarea.focus();
  cancelButton.addEventListener("click", () => {
    callbacks.reRender();
  });
  okButton.addEventListener("click", () => {
    const synopsified = textarea.value
      .split("\n")
      .map((l) => `= ${l}`)
      .join("\n");
    callbacks.replaceText(range, `${synopsified}\n`);
    callbacks.requestSave();
    callbacks.reRender();
  });
}

function editSceneHeadingHandler(
  indexCardDiv: HTMLDivElement,
  path: string,
  script: FountainScript,
  headingRange: Range,
  callbacks: Callbacks,
): void {
  const heading = indexCardDiv.querySelector(".scene-heading");
  const headingTextWithNewlines = script.unsafeExtractRaw(headingRange);
  const headingText = headingTextWithNewlines.replace(/\n{1,2}/, "");
  const numNewlines = headingTextWithNewlines.length - headingText.length;

  if (heading) {
    const headingInput = createEl("input", {
      cls: "scene-heading",
      type: "text",
      value: headingText,
    });
    headingInput.addEventListener("keyup", (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        callbacks.reRender();
        event.preventDefault();
      } else if (event.key === "Enter") {
        callbacks.replaceText(
          headingRange,
          headingInput.value + "\n".repeat(numNewlines),
        );
        callbacks.requestSave();
        callbacks.reRender();
        event.preventDefault();
      }
    });
    //headingInput.addEventListener(type, listener)
    heading.replaceWith(headingInput);
    headingInput.focus();
  }
}

function renderSynopsis(
  div: HTMLElement,
  path: string,
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
          path,
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
  path: string,
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
        installDragAndDropHandlers(path, callbacks, indexCard, scene.range);
        indexCard.createEl(
          "h3",
          {
            cls: "scene-heading",
            attr: dataRange(heading.range),
            text: script.unsafeExtractRaw(heading.range),
          },
          (headingEl) => {
            headingEl.addEventListener("click", (_evt) => {
              //callbacks.startReadingModeHere(scene.range);
              editSceneHeadingHandler(
                indexCard,
                path,
                script,
                heading.range,
                callbacks,
              );
            });
          },
        );
        indexCard.createDiv({ cls: ["index-card-buttons"] }, (buttons) => {
          buttons.createEl("button", { cls: "clickable-icon" }, (bt) => {
            setIcon(bt, "ellipsis");
            bt.addEventListener("click", (evt: MouseEvent) => {
              const m = new Menu();
              m.addItem((item) => {
                item
                  .setTitle("Copy")
                  .setIcon("copy")
                  .onClick(() => {
                    callbacks.duplicateScene(scene.range);
                    callbacks.requestSave();
                    callbacks.reRender();
                  });
              });
              m.addItem((item) => {
                item
                  .setTitle("Edit")
                  .setIcon("edit")
                  .onClick(() => {
                    callbacks.startEditModeHere(scene.range);
                  });
              });
              m.addItem((item) => {
                item.setTitle("Delete").onClick(() => {
                  callbacks.replaceText(scene.range, "");
                  callbacks.requestSave();
                  callbacks.reRender();
                });
              });

              m.showAtMouseEvent(evt);
            });
          });
        });
        renderSynopsis(
          indexCard,
          path,
          script,
          scene.synopsis,
          heading.range.end,
          callbacks,
        );
        const todos = extractNotes(content).filter(
          (n) => n.noteKind === "todo",
        );
        for (const note of todos) {
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
  path: string,
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
      path,
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
          renderIndexCard(sectionDiv, path, script, el, callbacks);
          break;
        case "section":
          renderSection(sectionDiv, path, script, el, callbacks);
          break;
        default:
          {
            assertNever(el);
          }
          break;
      }
    }
    sectionDiv.createDiv(
      {
        cls: ["screenplay-index-card", "dashed"],
        attr: {},
      },
      (div) => {
        setIcon(div, "plus");
        div.addEventListener("click", (evt: MouseEvent) => {
          const r = section.range;
          callbacks.replaceText(endOfRange(r), ".SCENE HEADING\n\n");
          callbacks.requestSave();
          callbacks.reRender();
        });
      },
    );
  });
}

/**
 * Render a index card view of a given fountain document.
 * @param div This elements content will be replaced.
 * @param script the fountain document.
 */
export function renderIndexCards(
  div: HTMLElement,
  path: string,
  script: FountainScript,
  callbacks: Callbacks,
): void {
  const structure = script.structure();
  div.empty();
  for (const s of structure.sections) {
    renderSection(div, path, script, s, callbacks);
  }
}
