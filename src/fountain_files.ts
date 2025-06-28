import type { FountainScript, Range } from "./fountain";
import { parse } from "./fountain_parser";

export type ParseError = {
  error: unknown;
};

/** Move the range of text to a new position. The newStart position is required
to not be within range.
*/
function moveText(
  text: string,
  range: Range,
  newStart: number,
  newTrailer = "",
): string {
  // Extract the text to be moved
  const movedPortion = text.slice(range.start, range.end);
  const beforeRange = text.slice(0, range.start);
  const afterRange = text.slice(range.end);

  // If moving forward
  if (newStart >= range.end) {
    return (
      beforeRange +
      afterRange.slice(0, newStart - range.end) +
      movedPortion +
      newTrailer +
      afterRange.slice(newStart - range.end)
    );
  }
  // If moving backward
  return (
    text.slice(0, newStart) +
    movedPortion +
    newTrailer +
    text.slice(newStart, range.start) +
    afterRange
  );
}

/**
 * Replace a range of text.
 *
 * @param text the overall text
 * @param range range of text to replace
 * @param replacement text that replaces the text in range
 * @returns the modified text
 */
function replaceText(text: string, range: Range, replacement: string): string {
  const beforeRange = text.slice(0, range.start);
  const afterRange = text.slice(range.end);
  return beforeRange + replacement + afterRange;
}

/** There is exactly one instance of this class called fountainFiles */
export class FountainFiles {
  /// path => parser result or unparsed document
  /// This means we store in memory all the fountain documents
  /// now they aren't actually that big normally so this should
  /// be fine (and indeed even on my phone I've never run into
  /// issues), but one could replace this by some bounded cache
  private documents: Map<string, FountainScript | string> = new Map();

  constructor() {
    // We store an empty document at the empty path.
    // This is so we have a state representing the
    // freshly created empty buffer.
    this.documents.set("", parse("", {}));
  }

  /**
   * The result of parsing the document at the given path.
   * @param path path in the vault
   * @returns the parsed script
   */
  get(path: string): FountainScript {
    const doc = this.documents.get(path);
    if (doc === undefined) {
      throw new Error(`No fountain file stored at "${path}"`);
    }
    if (typeof doc === "string") {
      const script: FountainScript | ParseError = parse(doc, {});
      if ("error" in script) {
        /// TODO: I have in practice not hit this, but I should
        /// proof or at least fuzzy that it can't.
        throw new Error("unparsable script found");
      }
      this.documents.set(path, script);
      return script;
    }
    return doc;
  }

  /**
   * Update the document at the given path. This does not
   * store the document on disk! But subsequent calls to
   * get will return the result of parsing the given document.
   * @param path in the vault
   * @param newDocument the text of the document
   */
  set(path: string, newDocument: string): void {
    const old = this.documents.get(path);
    // just make sure that if we had already parsed the same string we don't
    // throw that work away
    if (
      old === undefined ||
      typeof old === "string" ||
      old.document !== newDocument
    ) {
      this.documents.set(path, newDocument);
    }
  }

  /**
   * Replace some text in the document.
   * @param path in the vault
   * @param range of text to replace
   * @param replacement the replacement text
   */
  replaceText(path: string, range: Range, replacement: string) {
    const doc = this.get(path);
    const text = doc.document;
    const newText = replaceText(text, range, replacement);
    this.set(path, newText);
  }

  /**
   * Move the scene to a new position in the document.
   * @param path in the vault
   * @param range complete scene heading + content
   * @param newPos
   */
  moveSceneInScript(path: string, range: Range, newPos: number) {
    const doc = this.get(path);
    const text = doc.document;
    const lastTwo = text.slice(
      range.end - range.start - 2,
      range.end - range.start,
    );
    const extraNewLines =
      lastTwo === "\n\n" ? "" : lastTwo[1] === "\n" ? "\n" : "\n\n";
    const newText = moveText(text, range, newPos, extraNewLines);
    this.set(path, newText);
  }

  moveScene(
    srcPath: string,
    srcRange: Range,
    dstPath: string,
    dstNewPos: number,
  ) {
    if (srcPath === dstPath) {
      this.moveSceneInScript(srcPath, srcRange, dstNewPos);
    } else {
      const sceneText = this.getText(srcPath, srcRange);
      this.replaceText(srcPath, srcRange, "");
      const sceneLastTwo = sceneText.slice(
        sceneText.length - 2,
        sceneText.length,
      );
      const sceneExtraNewLines =
        sceneLastTwo === "\n\n" ? "" : sceneLastTwo[1] === "\n" ? "\n" : "\n\n";
      this.replaceText(
        dstPath,
        { start: dstNewPos, end: dstNewPos },
        sceneText + sceneExtraNewLines,
      );
    }
  }

  /** Get a subset of the text of a document */
  getText(path: string, range: Range): string {
    const doc = this.get(path);
    const text = doc.document;
    return text.slice(range.start, range.end);
  }

  /**
   * Duplicate a scene in the document.
   * @param path in the vault
   * @param range the range of the complete scene heading + content
   */
  duplicateScene(path: string, range: Range) {
    const doc = this.get(path);
    const text = doc.document;
    const sceneText = text.slice(range.start, range.end);
    // If the scene was the last scene of the document
    // it might not have been properly terminated by an empty
    // line, in that case we must add the empty line between
    // the two scenes.
    const lastTwo = sceneText.slice(-2);
    const extraNewLines =
      lastTwo === "\n\n" ? "" : lastTwo[1] === "\n" ? "\n" : "\n\n";

    const newText =
      text.slice(0, range.end) +
      extraNewLines +
      sceneText +
      text.slice(range.end);
    this.set(path, newText);
  }
}

export const fountainFiles = new FountainFiles();
