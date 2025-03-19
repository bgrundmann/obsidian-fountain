import { dataRange } from "render_tools";
import type {
  FountainScript,
  StructureScene,
  StructureSection,
  Synopsis,
} from "./fountain";

function assertNever(x: never): never {
  throw new Error(`Unexpected object: ${x}`);
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
export function renderIndexCards(
  div: HTMLElement,
  script: FountainScript,
): void {
  const structure = script.structure();
  div.empty();
  for (const s of structure) {
    emitIndexCardsSection(div, script, s);
  }
}
