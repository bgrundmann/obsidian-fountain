/**
 * Pure text-layout helpers for PDF generation: styled-segment extraction
 * from the AST, word-wrapping (plain and styled), and dialogue preparation.
 *
 * Nothing in this module touches the `PageState` flow or the `Instruction[]`
 * accumulator — every function is a pure transformation over text.
 */

import {
  type Dialogue,
  type FountainScript,
  type Note,
  type TextElementWithNotesAndBoneyard,
  extractMarginMarker,
  isLinkNote,
  parseLinkContent,
} from "../fountain";
import type { PDFOptions } from "./options_dialog";
import type {
  PageState,
  PreparedDialogue,
  PreparedDialogueContentLine,
  StyledTextSegment,
  WrappedLine,
} from "./types";

export function dialogueRequiredLines(dialogue: PreparedDialogue): number {
  return 1 + dialogue.contentLines.length;
}

/**
 * Prepares dialogue data by extracting and wrapping all text.
 */
export function prepareDialogueData(
  pageState: PageState,
  dialogue: Dialogue,
  fountainScript: FountainScript,
  options: PDFOptions,
): PreparedDialogue {
  const characterName = fountainScript.document
    .substring(dialogue.characterRange.start, dialogue.characterRange.end)
    .trim()
    .toUpperCase();

  let characterExtensions = "";
  if (
    dialogue.characterExtensionsRange.start !==
    dialogue.characterExtensionsRange.end
  ) {
    characterExtensions = fountainScript.document
      .substring(
        dialogue.characterExtensionsRange.start,
        dialogue.characterExtensionsRange.end,
      )
      .trim();
  }

  const characterLine = characterName + characterExtensions;

  const contentLines: PreparedDialogueContentLine[] = [];
  for (const item of dialogue.content) {
    if (item.kind === "parenthetical") {
      const parentheticalText = fountainScript.document
        .substring(item.range.start, item.range.end)
        .trim();

      for (const wrappedText of wrapPlainText(
        parentheticalText,
        pageState.charactersPerLine.parenthetical,
      )) {
        contentLines.push({ kind: "parenthetical", text: wrappedText });
      }
    } else {
      const line = item.line;
      if (line.elements.length > 0) {
        const styledSegments = extractStyledSegments(
          line.elements,
          fountainScript.document,
          options,
        );

        const wrappedLines = wrapStyledText(
          styledSegments,
          pageState.charactersPerLine.dialogue,
          false,
        );

        for (const wrappedLine of wrappedLines) {
          contentLines.push({ kind: "dialogue", wrappedLine });
        }
      } else {
        contentLines.push({
          kind: "dialogue",
          wrappedLine: { segments: [], marginMarks: [] },
        });
      }
    }
  }

  return {
    characterLine,
    contentLines,
    contd: false,
  };
}

/**
 * Splits dialogue into two parts for page-break handling.
 * First part includes parentheticals and fits in available space with
 * (MORE). Second part has no parentheticals and is marked as continued.
 */
export function splitDialogue(
  pageState: PageState,
  preparedDialogue: PreparedDialogue,
): [PreparedDialogue, PreparedDialogue] {
  const availableSpace = pageState.currentY - pageState.margins.bottom;
  const availableLines = Math.floor(availableSpace / pageState.lineHeight);

  // Lines available for content: total - 1 (character) - 1 (MORE)
  const linesForFirstPart = availableLines - 1 - 1;

  const contentPartA = preparedDialogue.contentLines.slice(
    0,
    linesForFirstPart,
  );
  const contentPartB =
    preparedDialogue.contentLines.slice(linesForFirstPart);

  const firstPart: PreparedDialogue = {
    characterLine: preparedDialogue.characterLine,
    contentLines: contentPartA,
    contd: preparedDialogue.contd,
  };

  const secondPart: PreparedDialogue = {
    characterLine: preparedDialogue.characterLine,
    contentLines: contentPartB,
    contd: true,
  };

  return [firstPart, secondPart];
}

/**
 * Extracts styled text segments from line elements, preserving formatting
 * and filtering notes / margin marks according to `options`.
 */
export function extractStyledSegments(
  elements: TextElementWithNotesAndBoneyard[],
  document: string,
  options: PDFOptions,
): StyledTextSegment[] {
  const segments: StyledTextSegment[] = [];

  for (const element of elements) {
    switch (element.kind) {
      case "text":
        segments.push({
          text: document.substring(element.range.start, element.range.end),
        });
        break;
      case "bold": {
        const boldSegments = extractStyledSegments(
          element.elements,
          document,
          options,
        );
        segments.push(...boldSegments.map((seg) => ({ ...seg, bold: true })));
        break;
      }
      case "italics": {
        const italicSegments = extractStyledSegments(
          element.elements,
          document,
          options,
        );
        segments.push(
          ...italicSegments.map((seg) => ({ ...seg, italic: true })),
        );
        break;
      }
      case "underline": {
        const underlineSegments = extractStyledSegments(
          element.elements,
          document,
          options,
        );
        segments.push(
          ...underlineSegments.map((seg) => ({ ...seg, underline: true })),
        );
        break;
      }
      case "note": {
        // Links render as plain inline text regardless of hideNotes, since
        // they are content rather than authorial notes.
        if (isLinkNote(element as Note)) {
          const { target, displayText } = parseLinkContent(
            document.substring(element.textRange.start, element.textRange.end),
          );
          const label = displayText !== null ? displayText : target;
          if (label.length > 0) {
            segments.push({ text: label });
          }
          break;
        }

        // Margin marks are handled independently of hideNotes.
        const markerWord = extractMarginMarker(element as Note);
        if (markerWord !== null) {
          if (!options.hideMarginMarks) {
            segments.push({
              text: markerWord,
              marginMark: true,
            });
          }
          break;
        }

        if (
          !options.hideNotes &&
          !element.noteKind.startsWith("[[") &&
          !element.noteKind.startsWith("/*")
        ) {
          segments.push({
            text: " ",
          });

          const noteText = document.substring(
            element.textRange.start,
            element.textRange.end,
          );

          switch (element.noteKind) {
            case "+":
              segments.push({
                text: noteText,
                italic: false,
                color: "green",
              });
              break;
            case "-":
              segments.push({
                text: noteText,
                italic: false,
                color: "red",
                strikethrough: true,
              });
              break;
            case "todo":
              segments.push({
                text: `TODO: ${noteText}`,
                italic: true,
                color: "gray",
                backgroundColor: "yellow",
              });
              break;
            case "":
              segments.push({
                text: noteText,
                italic: true,
                color: "gray",
              });
              break;
            default:
              segments.push({
                text: `${element.noteKind}: ${noteText}`,
                italic: true,
                color: "gray",
              });
              break;
          }

          segments.push({
            text: " ",
          });
        }
        break;
      }
      case "boneyard":
        // Skip boneyard content for PDF output
        break;
    }
  }

  return segments;
}

/**
 * Wraps styled text segments to `maxChars` while preserving per-segment
 * styling. Margin marks are not laid out inline; they are associated with
 * the line on which they appear in the source.
 */
export function wrapStyledText(
  segments: StyledTextSegment[],
  maxChars: number,
  preserveWhitespace: boolean,
): WrappedLine[] {
  if (segments.length === 0) {
    return [{ segments: [], marginMarks: [] }];
  }

  const lines: WrappedLine[] = [];
  let currentLineSegments: StyledTextSegment[] = [];
  let currentLineMarginMarks: string[] = [];
  let currentLineLength = 0;

  const finishCurrentLine = () => {
    lines.push({
      segments: currentLineSegments,
      marginMarks: currentLineMarginMarks,
    });
    currentLineSegments = [];
    currentLineMarginMarks = [];
    currentLineLength = 0;
  };

  for (const segment of segments) {
    if (segment.marginMark) {
      currentLineMarginMarks.push(segment.text);
      continue;
    }

    const words = segment.text.split(/(\s+)/); // Split on whitespace but keep separators

    for (const word of words) {
      if (word.length === 0) continue;

      // Long word — force-break across multiple lines.
      if (word.length > maxChars) {
        if (currentLineSegments.length > 0) {
          finishCurrentLine();
        }
        for (let i = 0; i < word.length; i += maxChars) {
          const chunk = word.substring(i, i + maxChars);
          lines.push({
            segments: [{ ...segment, text: chunk }],
            marginMarks: [],
          });
        }
        continue;
      }

      if (
        currentLineLength + word.length > maxChars &&
        currentLineSegments.length > 0
      ) {
        finishCurrentLine();
      }

      if (
        preserveWhitespace ||
        word.trim().length > 0 ||
        currentLineSegments.length > 0
      ) {
        // Don't start lines with whitespace unless preserveWhitespace is true.
        currentLineSegments.push({ ...segment, text: word });
        currentLineLength += word.length;
      }
    }
  }

  if (currentLineSegments.length > 0 || currentLineMarginMarks.length > 0) {
    finishCurrentLine();
  }

  return lines.length > 0 ? lines : [{ segments: [], marginMarks: [] }];
}

/** Word-wraps plain text (used for parentheticals). */
export function wrapPlainText(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) {
    return [text];
  }

  const lines: string[] = [];
  const words = text.split(/(\s+)/);
  let currentLine = "";

  for (const word of words) {
    if (word.length === 0) continue;

    if (word.length > maxChars) {
      if (currentLine.length > 0) {
        lines.push(currentLine.trim());
        currentLine = "";
      }
      for (let i = 0; i < word.length; i += maxChars) {
        const chunk = word.substring(i, i + maxChars);
        lines.push(chunk);
      }
      continue;
    }

    if (currentLine.length + word.length > maxChars && currentLine.length > 0) {
      lines.push(currentLine.trim());
      currentLine = "";
    }

    if (word.trim().length > 0 || currentLine.length > 0) {
      currentLine += word;
    }
  }

  if (currentLine.length > 0) {
    lines.push(currentLine.trim());
  }

  return lines.length > 0 ? lines : [""];
}
