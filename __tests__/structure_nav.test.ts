import { describe, expect, test } from "@jest/globals";
import { findSceneAtOffset, startOfSceneContent } from "../src/fountain";
import { parse } from "../src/fountain/parser";

const THREE_SCENES =
  "INT. HOUSE - DAY\n\nHome dialogue.\n\n" +
  "EXT. PARK - NIGHT\n\n= Park synopsis line.\n\nPark dialogue.\n\n" +
  "INT. CAR - DAY\n\nCar dialogue.\n\n";

describe("findSceneAtOffset", () => {
  test("returns the scene whose range contains the offset (inside body)", () => {
    const script = parse(THREE_SCENES, {});
    const offset = script.document.indexOf("Park dialogue.");
    const scene = findSceneAtOffset(script, offset);
    expect(scene?.scene?.heading).toBe("EXT. PARK - NIGHT");
  });

  test("returns the scene whose range contains the offset (on heading line)", () => {
    const script = parse(THREE_SCENES, {});
    const offset = script.document.indexOf("EXT. PARK - NIGHT");
    const scene = findSceneAtOffset(script, offset);
    expect(scene?.scene?.heading).toBe("EXT. PARK - NIGHT");
  });

  test("offset before the first scene returns the first scene", () => {
    const titlePage =
      "Title: Hello\n\n" +
      "INT. HOUSE - DAY\n\nHome dialogue.\n\n";
    const script = parse(titlePage, {});
    const scene = findSceneAtOffset(script, 0);
    expect(scene?.scene?.heading).toBe("INT. HOUSE - DAY");
  });

  test("offset on a section header before the first scene returns next scene", () => {
    const withSection =
      "# Act 1\n\nINT. HOUSE - DAY\n\nHome dialogue.\n\n";
    const script = parse(withSection, {});
    const scene = findSceneAtOffset(script, 2);
    expect(scene?.scene?.heading).toBe("INT. HOUSE - DAY");
  });

  test("returns null on an empty script with no scenes", () => {
    const script = parse("Just some action.\n\n", {});
    const scene = findSceneAtOffset(script, 0);
    expect(scene).toBeNull();
  });

  test("offset past the last scene returns the last scene", () => {
    const script = parse(THREE_SCENES, {});
    const scene = findSceneAtOffset(script, script.document.length);
    expect(scene?.scene?.heading).toBe("INT. CAR - DAY");
  });
});

describe("startOfSceneContent", () => {
  test("lands on synopsis when one exists", () => {
    const script = parse(THREE_SCENES, {});
    const offset = script.document.indexOf("EXT. PARK - NIGHT");
    const scene = findSceneAtOffset(script, offset);
    if (!scene) throw new Error("expected scene");
    const pos = startOfSceneContent(script, scene);
    // Position should be at "= Park synopsis line." (right after the
    // heading's blank line).
    expect(script.document.slice(pos, pos + 1)).toBe("=");
  });

  test("lands on first body line when no synopsis", () => {
    const script = parse(THREE_SCENES, {});
    const offset = script.document.indexOf("INT. HOUSE - DAY");
    const scene = findSceneAtOffset(script, offset);
    if (!scene) throw new Error("expected scene");
    const pos = startOfSceneContent(script, scene);
    expect(script.document.slice(pos, pos + "Home".length)).toBe("Home");
  });

  test("heading-only scene at end of document lands inside scene range", () => {
    const headingOnly = "INT. HOUSE - DAY";
    const script = parse(headingOnly, {});
    const offset = 0;
    const scene = findSceneAtOffset(script, offset);
    if (!scene) throw new Error("expected scene");
    const pos = startOfSceneContent(script, scene);
    expect(pos).toBeGreaterThanOrEqual(scene.range.start);
    expect(pos).toBeLessThanOrEqual(scene.range.end);
  });

  test("multi-line synopsis: lands on first synopsis line", () => {
    const multiSynopsis =
      "INT. HOUSE - DAY\n\n= First line.\n= Second line.\n\nAction.\n\n";
    const script = parse(multiSynopsis, {});
    const scene = findSceneAtOffset(script, 0);
    if (!scene) throw new Error("expected scene");
    const pos = startOfSceneContent(script, scene);
    expect(script.document.slice(pos, pos + "= First".length)).toBe("= First");
  });
});
