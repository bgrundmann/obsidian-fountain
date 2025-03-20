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
          renderIndexCard(sectionDiv, script, el);
          break;
        case "section":
          renderSection(sectionDiv, script, el);
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
    renderSection(div, script, s);
  }
}
