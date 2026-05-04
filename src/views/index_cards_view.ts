import { setIcon } from "obsidian";
import type {
  FountainScript,
  Range,
  StructureScene,
  StructureSection,
  Synopsis,
} from "../fountain";
import { dataRange, extractNotes } from "../fountain";
import { endOfRange, getScenePreview } from "./render_tools";
import { styledTextToHtml } from "./styled_text";
import type { ReadonlyViewCallbacks } from "./view_state";

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

function clearDropIndicators(): void {
  for (const el of document.querySelectorAll(
    ".screenplay-index-card.drop-left, .screenplay-index-card.drop-right",
  )) {
    el.classList.remove("drop-left");
    el.classList.remove("drop-right");
  }
}

/** FLIP animation helpers: capture the bounding rects of every index card
 * before a move, then after the re-render slide each card from its old
 * position to its new one so the user sees the rearrangement. */
function cardKey(card: Element): string {
  // textContent of the card is heading + synopsis + todos — usually unique
  // enough across a single document. Truncated so very long synopses don't
  // dominate the map.
  return (card.textContent ?? "").slice(0, 200);
}

function captureCardRects(): Map<string, DOMRect[]> {
  const rects = new Map<string, DOMRect[]>();
  const cards = document.querySelectorAll<HTMLElement>(
    ".screenplay-index-card[data-range]",
  );
  for (const card of cards) {
    const key = cardKey(card);
    if (!key) continue;
    const arr = rects.get(key);
    const r = card.getBoundingClientRect();
    if (arr) arr.push(r);
    else rects.set(key, [r]);
  }
  return rects;
}

function applyFlipAnimations(oldRects: Map<string, DOMRect[]>): void {
  if (oldRects.size === 0) return;
  const seen = new Map<string, number>();
  const cards = document.querySelectorAll<HTMLElement>(
    ".screenplay-index-card[data-range]",
  );
  for (const card of cards) {
    const key = cardKey(card);
    if (!key) continue;
    const arr = oldRects.get(key);
    if (!arr) continue;
    const idx = seen.get(key) ?? 0;
    seen.set(key, idx + 1);
    const oldRect = arr[idx];
    if (!oldRect) continue;
    const newRect = card.getBoundingClientRect();
    const dx = oldRect.left - newRect.left;
    const dy = oldRect.top - newRect.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
    card.style.transform = `translate(${dx}px, ${dy}px)`;
    void card.offsetHeight; // force reflow so the transition picks up
    card.classList.add("flip-animate");
    card.style.transform = "";
    card.addEventListener(
      "transitionend",
      () => {
        card.classList.remove("flip-animate");
      },
      { once: true },
    );
  }
}

function dropHandler(
  dropZone: HTMLElement,
  path: string,
  dropZoneRange: Range,
  callbacks: ReadonlyViewCallbacks,
  evt: DragEvent,
) {
  const before = dropZone.classList.contains("drop-left");
  const after = dropZone.classList.contains("drop-right");
  dropZone.classList.remove("drop-left");
  dropZone.classList.remove("drop-right");
  if (!before && !after) return;
  const dragData = getDragData(evt);
  if (!dragData) return;
  // Same-file no-op: dropping a card on itself.
  if (dragData.path === path && dragData.range.start === dropZoneRange.start) {
    return;
  }
  evt.preventDefault();
  const oldRects = captureCardRects();
  callbacks.moveSceneAcross({
    srcPath: dragData.path,
    srcRange: dragData.range,
    dstPath: path,
    dstPos: before ? dropZoneRange.start : dropZoneRange.end,
  });
  callbacks.requestSave();
  callbacks.reRender();
  applyFlipAnimations(oldRects);
}

/** Adds drop-left/drop-right classes to indicate where a drop would
 land. The classes drive both the visual insertion bar and the drop
 handler's decision (so the position is computed in one place).
 No indicator is shown on the source card itself (the .dragging one). */
function dragoverHandler(
  dropZone: HTMLElement,
  dropZoneRange: Range,
  evt: DragEvent,
) {
  evt.preventDefault();
  if (dropZone.classList.contains("dragging")) {
    dropZone.classList.remove("drop-left");
    dropZone.classList.remove("drop-right");
    return;
  }
  const rect = dropZone.getBoundingClientRect();
  const clampedX = Math.min(Math.max(evt.clientX, rect.left), rect.right);
  const percentage = ((clampedX - rect.left) / rect.width) * 100;

  if (percentage >= 50) {
    dropZone.classList.add("drop-right");
    dropZone.classList.remove("drop-left");
  } else {
    dropZone.classList.add("drop-left");
    dropZone.classList.remove("drop-right");
  }
}

/** When we start dragging we store the range of the scene and use the
 whole card as the drag image (not the small handle that initiated it). */
function dragstartHandler(
  card: HTMLElement,
  path: string,
  range: Range,
  evt: DragEvent,
): void {
  if (!evt.dataTransfer) return;
  evt.dataTransfer.clearData();
  evt.dataTransfer.setData(
    "application/json",
    JSON.stringify({ path: path, range: range }),
  );
  evt.dataTransfer.effectAllowed = "move";
  try {
    evt.dataTransfer.setDragImage(card, 12, 12);
  } catch {
    // setDragImage can throw on synthetic events in some browsers; ignore.
  }
  // Mark the surrounding cards container so insertion gutters can opt
  // out of pointer events for the duration of the drag (see CSS).
  card.closest(".screenplay-index-cards")?.classList.add("dragging-active");
  // Defer so the browser snapshots the card for its drag image at full
  // opacity, then fades the original on the page.
  setTimeout(() => card.classList.add("dragging"), 0);
}

function installDragAndDropHandlers(
  path: string,
  callbacks: ReadonlyViewCallbacks,
  indexCard: HTMLElement,
  range: Range,
) {
  indexCard.addEventListener("dragover", (evt: DragEvent) => {
    dragoverHandler(indexCard, range, evt);
  });
  indexCard.addEventListener("dragleave", (e: DragEvent) => {
    // dragleave fires when the cursor enters a child element too. Only
    // treat it as a real leave when we're moving outside the card.
    const related = e.relatedTarget as Node | null;
    if (related && indexCard.contains(related)) return;
    indexCard.classList.remove("drop-left");
    indexCard.classList.remove("drop-right");
  });
  indexCard.addEventListener("drop", (e: DragEvent) => {
    dropHandler(indexCard, path, range, callbacks, e);
  });
  indexCard.addEventListener("dragstart", (evt: DragEvent) => {
    dragstartHandler(indexCard, path, range, evt);
  });
  indexCard.addEventListener("dragend", () => {
    indexCard.classList.remove("dragging");
    indexCard
      .closest(".screenplay-index-cards")
      ?.classList.remove("dragging-active");
    clearDropIndicators();
  });
}

function assertNever(x: never): never {
  throw new Error(`Unexpected object: ${x}`);
}

/** Replace the heading <h3> with an <input>; commit on Enter or blur,
 *  cancel on Esc. The committed flag avoids the re-entry that would
 *  otherwise occur when commit's `reRender` detaches the input and fires
 *  a synthetic blur on a stale node. */
function editSceneHeadingHandler(
  indexCardDiv: HTMLDivElement,
  script: FountainScript,
  headingRange: Range,
  callbacks: ReadonlyViewCallbacks,
): void {
  const heading = indexCardDiv.querySelector(".scene-heading");
  if (!heading) return;
  const headingTextWithNewlines = script.sliceDocument(headingRange);
  const headingText = headingTextWithNewlines.replace(/\n{1,2}/, "");
  const numNewlines = headingTextWithNewlines.length - headingText.length;

  const headingInput = createEl("input", {
    cls: "scene-heading",
    type: "text",
    value: headingText,
  });
  let committed = false;
  const commit = () => {
    if (committed) return;
    committed = true;
    callbacks.replaceText(
      headingRange,
      headingInput.value + "\n".repeat(numNewlines),
    );
    callbacks.requestSave();
    callbacks.reRender();
  };
  const cancel = () => {
    if (committed) return;
    committed = true;
    callbacks.reRender();
  };
  headingInput.addEventListener("keyup", (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      cancel();
    } else if (event.key === "Enter") {
      event.preventDefault();
      commit();
    }
  });
  headingInput.addEventListener("blur", () => commit());
  heading.replaceWith(headingInput);
  headingInput.focus();
}

function renderSynopsis(
  div: HTMLElement,
  script: FountainScript,
  synopsis: Synopsis | undefined,
  startPosIfEmpty: number,
  scene?: StructureScene,
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
      for (const line of synopsis?.lines ?? []) {
        const lineDiv = div2.createDiv({
          cls: "synopsis",
          attr: dataRange(line.range),
        });
        styledTextToHtml(script, lineDiv, line.elements, {}, true);
      }
      if (!synopsis) {
        const preview = scene ? getScenePreview(script, scene, 220) : null;
        if (preview) {
          div2.createDiv({
            cls: "preview",
            text: preview,
          });
        }
      }
    },
  );
}

/** Render an index card. The whole card click navigates to the scene; the
 *  pencil button opens an inline rename for the heading. */
function renderIndexCard(
  div: HTMLElement,
  path: string,
  script: FountainScript,
  scene: StructureScene,
  callbacks: ReadonlyViewCallbacks,
): void {
  if (!scene.scene) return;
  const heading = scene.scene;
  const content = scene.content;

  div.createDiv({ cls: "card-slot" }, (slot) => {
    // Insertion gutter — click to insert a new scene before this card.
    slot.createDiv(
      {
        cls: "insertion-gutter",
        attr: { "data-insert-pos": String(scene.range.start) },
      },
      (gutter) => {
        gutter.addEventListener("click", (evt: MouseEvent) => {
          evt.stopPropagation();
          callbacks.insertSceneAt(scene.range.start);
        });
      },
    );

    slot.createDiv(
      {
        cls: "screenplay-index-card",
        attr: {
          ...dataRange(scene.range),
        },
      },
      (indexCard) => {
        installDragAndDropHandlers(path, callbacks, indexCard, scene.range);
        // Click anywhere on the card → navigate to scene content in editor.
        indexCard.addEventListener("click", () => {
          callbacks.navigateToSceneContent(scene.range);
        });

        indexCard.createDiv(
          {
            cls: "drag-handle",
            attr: { draggable: true, "aria-label": "Drag to reorder" },
          },
          (handle) => {
            setIcon(handle, "grip-vertical");
            // Clicks on the grip shouldn't navigate; mousedown still
            // initiates drag normally.
            handle.addEventListener("click", (evt: MouseEvent) => {
              evt.stopPropagation();
            });
          },
        );
        indexCard.createEl("h3", {
          cls: "scene-heading",
          attr: dataRange(heading.range),
          text: heading.heading,
        });
        indexCard.createDiv(
          {
            cls: "pencil-button",
            attr: { "aria-label": "Rename scene heading" },
          },
          (pencil) => {
            setIcon(pencil, "pencil");
            pencil.addEventListener("click", (evt: MouseEvent) => {
              evt.stopPropagation();
              editSceneHeadingHandler(
                indexCard,
                script,
                heading.range,
                callbacks,
              );
            });
          },
        );
        renderSynopsis(
          indexCard,
          script,
          scene.synopsis,
          heading.range.end,
          scene,
        );
        const todos = extractNotes(content).filter(
          (n) => n.noteKind === "todo",
        );
        for (const note of todos) {
          indexCard.createDiv({}, (div) => {
            styledTextToHtml(script, div, [note], {}, false);
            div.addEventListener("click", (evt: MouseEvent) => {
              evt.stopPropagation();
              callbacks.startEditModeHere(note.range);
            });
          });
        }
      },
    );
  });
}

/** Render a section, that is a combination of a heading followed by all the
scenes that section contains. If the document started immediately with a a scene
the section might be an unnamed section and not have a section header. */
function renderSection(
  parent: HTMLElement,
  path: string,
  script: FountainScript,
  section: StructureSection,
  callbacks: ReadonlyViewCallbacks,
): void {
  if (section.section) {
    const title = script.sliceDocument(section.section.range);
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
    renderSynopsis(parent, script, section.synopsis, section.synopsis.range.start);
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
        div.addEventListener("click", (_evt: MouseEvent) => {
          callbacks.insertSceneAt(endOfRange(section.range).start);
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
  callbacks: ReadonlyViewCallbacks,
): void {
  const structure = script.structure();
  div.empty();
  for (const s of structure.sections) {
    renderSection(div, path, script, s, callbacks);
  }
}
