/**
 * Generates PDF instructions from a FountainScript AST.
 * This module converts screenplay elements into abstract rendering instructions
 * that can be executed by the PDF renderer.
 */

import {
  type Action,
  type Dialogue,
  type FountainScript,
  type Lyrics,
  type SceneHeading,
  type StyledText,
  type Synopsis,
  type Transition,
  extractTransitionText,
} from "../fountain";
import type { PDFOptions } from "./options_dialog";
import {
  addElementSpacing,
  advanceLine,
  emitNewPage,
  hasSpaceForLines,
  needLines,
} from "./page_state";
import {
  dialogueRequiredLines,
  extractStyledSegments,
  prepareDialogueData,
  splitDialogue,
  wrapPlainText,
  wrapStyledText,
} from "./text_wrapping";
import {
  type Color,
  type Instruction,
  type PageState,
  type PreparedDialogue,
  type WrappedLine,
  ACTION_INDENT,
  CHARACTER_INDENT,
  DEFAULT_CHARACTERS_PER_LINE,
  DIALOGUE_INDENT,
  FONT_SIZE,
  LINE_HEIGHT,
  MARGIN_LEFT,
  PAPER_SIZES,
  PARENTHETICAL_INDENT,
  SCENE_HEADING_INDENT,
  calculateRightMargin,
  calculateVerticalMargins,
  getCharacterWidth,
  getTitlePageCenterStart,
  getTitlePageCenterX,
} from "./types";

/**
 * Emits margin marks in the left margin at the current Y position.
 * Marks are right-aligned to sit near the text area.
 * Multiple margin marks are separated by spaces.
 */
function emitMarginMarks(
  instructions: Instruction[],
  pageState: PageState,
  marginMarks: string[],
): void {
  if (marginMarks.length === 0) return;

  // Combine all margin marks with a space separator, uppercase to match reading view
  const marginText = marginMarks.join(" ").toUpperCase();

  // Calculate text width for right-alignment in left margin
  const charWidth = getCharacterWidth(pageState.fontSize);
  const textWidth = marginText.length * charWidth;

  // Right-align in left margin (end 10pt before text area starts)
  const marginX = pageState.margins.left - textWidth - 10;

  emitText(instructions, pageState, {
    data: marginText,
    x: marginX,
    bold: false,
    italic: false,
    underline: false,
    color: "gray",
    strikethrough: false,
    backgroundColor: undefined,
  });
}

/**
 * Helper function to emit a text instruction and return the new x position
 */
function emitText(
  instructions: Instruction[],
  pageState: PageState,
  options: {
    data: string;
    x: number;
    bold: boolean;
    italic: boolean;
    underline: boolean;
    color?: Color;
    strikethrough?: boolean;
    backgroundColor?: Color;
  },
): number {
  instructions.push({
    type: "text",
    data: options.data,
    x: options.x,
    y: pageState.currentY,
    bold: options.bold,
    italic: options.italic,
    underline: options.underline,
    color: options.color || "black",
    strikethrough: options.strikethrough || false,
    backgroundColor: options.backgroundColor,
  });

  return (
    options.x + options.data.length * getCharacterWidth(pageState.fontSize)
  );
}

/**
 * Generates all instructions for the entire fountain script
 */
export function generateInstructions(
  fountainScript: FountainScript,
  options: PDFOptions = {
    sceneHeadingBold: false,
    paperSize: "letter",
    hideNotes: true,
    hideSynopsis: false,
    hideMarginMarks: false,
  },
): Instruction[] {
  const instructions: Instruction[] = [];
  const paperSize = PAPER_SIZES[options.paperSize];

  // Calculate dynamic margins based on paper size and industry standards (Phase 2)
  const verticalMargins = calculateVerticalMargins(paperSize.height);
  const rightMargin = calculateRightMargin(
    paperSize.width,
    DEFAULT_CHARACTERS_PER_LINE.action,
    FONT_SIZE,
  );

  // Initialize page state (using PDF coordinates - bottom-left origin)
  let currentState: PageState = {
    currentY: paperSize.height - verticalMargins.top, // Start at calculated top margin
    remainingHeight:
      paperSize.height - verticalMargins.top - verticalMargins.bottom,
    pageNumber: 0,
    pageWidth: paperSize.width,
    pageHeight: paperSize.height,
    isTitlePage: true,
    documentHasTitlePage: fountainScript.titlePage.length > 0,
    margins: {
      top: verticalMargins.top,
      bottom: verticalMargins.bottom,
      left: MARGIN_LEFT, // Fixed 1.5" for binding
      right: rightMargin, // Calculated based on character limits
    },
    fontSize: FONT_SIZE,
    lineHeight: LINE_HEIGHT,
    charactersPerLine: DEFAULT_CHARACTERS_PER_LINE,
    lastElementType: null,
  };

  // Add first page
  currentState = emitNewPage(instructions, currentState);

  // Generate title page instructions if it exists
  if (fountainScript.titlePage.length > 0) {
    currentState = generateTitlePageInstructions(
      instructions,
      currentState,
      fountainScript,
      options,
    );
  } else {
    currentState = {
      ...currentState,
      isTitlePage: false,
      pageNumber: 1,
      documentHasTitlePage: false,
    };
  }

  // Filter out hidden elements for consistent behavior
  // Note: hideNotes is always false here - note visibility (including margin marks)
  // is handled in extractStyledSegments to allow independent control of margin marks
  const filteredScript = fountainScript.withHiddenElementsRemoved({
    hideBoneyard: true,
    hideNotes: false,
    hideSynopsis: options.hideSynopsis,
  });

  // Generate script instructions
  generateScriptInstructions(
    instructions,
    currentState,
    filteredScript,
    options,
  );

  return instructions;
}

/**
 * Generates instructions for the entire script by iterating through all elements
 */
function generateScriptInstructions(
  instructions: Instruction[],
  pageState: PageState,
  fountainScript: FountainScript,
  options: PDFOptions,
): PageState {
  let currentState = pageState;

  for (const element of fountainScript.script) {
    switch (element.kind) {
      case "scene":
        currentState = generateSceneInstructions(
          instructions,
          currentState,
          element,
          fountainScript,
          options,
        );
        break;
      case "action":
        currentState = generateActionInstructions(
          instructions,
          currentState,
          element,
          fountainScript,
          options,
        );
        break;
      case "dialogue":
        currentState = generateDialogueInstructions(
          instructions,
          currentState,
          element,
          fountainScript,
          options,
        );
        break;
      case "transition":
        currentState = generateTransitionInstructions(
          instructions,
          currentState,
          element,
          fountainScript,
        );
        break;
      case "synopsis":
        if (!options.hideSynopsis) {
          currentState = generateSynopsisInstructions(
            instructions,
            currentState,
            element,
            fountainScript,
          );
        }
        break;
      case "page-break":
        currentState = emitNewPage(instructions, currentState);
        break;
      case "section":
        // TODO
        break;
      case "lyrics":
        currentState = generateLyricsInstructions(
          instructions,
          currentState,
          element,
          fountainScript,
          options,
        );
        break;
    }
  }

  return currentState;
}

/**
 * Generates instructions for title page metadata
 */
function generateTitlePageInstructions(
  instructions: Instruction[],
  pageState: PageState,
  fountainScript: FountainScript,
  options: PDFOptions,
): PageState {
  let currentState = { ...pageState };

  // Separate title page elements by positioning
  const centeredKeys = new Set([
    "title",
    "credit",
    "author",
    "authors",
    "source",
  ]);
  const lowerLeftKeys = new Set(["contact"]);
  const lowerRightKeys = new Set(["draft date"]);

  const centeredElements: { key: string; values: StyledText[] }[] = [];
  const lowerLeftElements: { key: string; values: StyledText[] }[] = [];
  const lowerRightElements: { key: string; values: StyledText[] }[] = [];

  // Categorize title page elements
  for (const element of fountainScript.titlePage) {
    const keyLower = element.key.toLowerCase();
    if (centeredKeys.has(keyLower)) {
      centeredElements.push(element);
    } else if (lowerLeftKeys.has(keyLower)) {
      lowerLeftElements.push(element);
    } else if (lowerRightKeys.has(keyLower)) {
      lowerRightElements.push(element);
    }
  }

  // Generate centered elements
  if (centeredElements.length > 0) {
    currentState = generateCenteredTitleElementInstructions(
      instructions,
      currentState,
      centeredElements,
      fountainScript,
      options,
    );
  }

  // Generate lower-left elements
  if (lowerLeftElements.length > 0) {
    currentState = generateLowerLeftTitleElementInstructions(
      instructions,
      currentState,
      lowerLeftElements,
      fountainScript,
      options,
    );
  }

  // Generate lower-right elements
  if (lowerRightElements.length > 0) {
    currentState = generateLowerRightTitleElementInstructions(
      instructions,
      currentState,
      lowerRightElements,
      fountainScript,
      options,
    );
  }

  // Mark that we're no longer on title page and create new page for script
  currentState.isTitlePage = false;

  // Add new page for the actual script content
  currentState = emitNewPage(instructions, currentState);
  currentState.remainingHeight =
    pageState.pageHeight - pageState.margins.top - pageState.margins.bottom;

  return currentState;
}

/**
 * Generates instructions for centered title page elements
 */
function generateCenteredTitleElementInstructions(
  instructions: Instruction[],
  pageState: PageState,
  elements: { key: string; values: StyledText[] }[],
  fountainScript: FountainScript,
  options: PDFOptions,
): PageState {
  let currentY = getTitlePageCenterStart(pageState.pageHeight);

  for (const element of elements) {
    // Generate instructions for the values (no keys on title page)
    for (const styledText of element.values) {
      const segments = extractStyledSegments(
        styledText,
        fountainScript.document,
        options,
      );
      const wrappedLines = wrapStyledText(
        segments,
        pageState.charactersPerLine.titlePageCenter,
        false,
      );

      for (const line of wrappedLines) {
        // Calculate line width for centering
        let lineWidth = 0;
        for (const segment of line.segments) {
          // Estimate width using average character width for Courier
          lineWidth +=
            segment.text.length * getCharacterWidth(pageState.fontSize);
        }

        let x = getTitlePageCenterX(pageState.pageWidth) - lineWidth / 2;

        // Generate instruction for each segment with appropriate styling
        for (const segment of line.segments) {
          if (segment.text.length > 0) {
            x = emitText(
              instructions,
              { ...pageState, currentY },
              {
                data: segment.text,
                x,
                bold: segment.bold || false,
                italic: segment.italic || false,
                underline: segment.underline || false,
                color: segment.color || "black",
                strikethrough: segment.strikethrough || false,
                backgroundColor: segment.backgroundColor,
              },
            );
          }
        }

        currentY -= pageState.lineHeight; // Move down for next line
      }
    }

    // Add spacing between different keys
    currentY -= pageState.lineHeight; // Move down for spacing
  }

  return { ...pageState, currentY };
}

/**
 * Generates instructions for lower-left title page elements
 */
function generateLowerLeftTitleElementInstructions(
  instructions: Instruction[],
  pageState: PageState,
  elements: { key: string; values: StyledText[] }[],
  fountainScript: FountainScript,
  options: PDFOptions,
): PageState {
  // Start from bottom left area
  let currentY = pageState.margins.bottom;

  for (const element of elements) {
    for (const styledText of element.values) {
      const segments = extractStyledSegments(
        styledText,
        fountainScript.document,
        options,
      );
      const wrappedLines = wrapStyledText(
        segments,
        pageState.charactersPerLine.titlePageSides,
        false,
      );

      for (const line of wrappedLines) {
        let x = pageState.margins.left;

        for (const segment of line.segments) {
          if (segment.text.length > 0) {
            x = emitText(
              instructions,
              { ...pageState, currentY },
              {
                data: segment.text,
                x,
                bold: segment.bold || false,
                italic: segment.italic || false,
                underline: segment.underline || false,
                color: segment.color || "black",
                strikethrough: segment.strikethrough || false,
                backgroundColor: segment.backgroundColor,
              },
            );
          }
        }

        currentY += pageState.lineHeight; // Move up from bottom
      }
    }

    currentY += pageState.lineHeight; // Add spacing between elements
  }

  return { ...pageState, currentY };
}

/**
 * Generates instructions for lower-right title page elements
 */
function generateLowerRightTitleElementInstructions(
  instructions: Instruction[],
  pageState: PageState,
  elements: { key: string; values: StyledText[] }[],
  fountainScript: FountainScript,
  options: PDFOptions,
): PageState {
  // Start from bottom right area
  let currentY = pageState.margins.bottom;

  for (const element of elements) {
    for (const styledText of element.values) {
      const segments = extractStyledSegments(
        styledText,
        fountainScript.document,
        options,
      );
      const wrappedLines = wrapStyledText(
        segments,
        pageState.charactersPerLine.titlePageSides,
        false,
      );

      for (const line of wrappedLines) {
        // Calculate line width for right alignment
        let lineWidth = 0;
        for (const segment of line.segments) {
          lineWidth +=
            segment.text.length * getCharacterWidth(pageState.fontSize);
        }

        let x =
          pageState.pageWidth - pageState.margins.right - lineWidth;

        for (const segment of line.segments) {
          if (segment.text.length > 0) {
            x = emitText(
              instructions,
              { ...pageState, currentY },
              {
                data: segment.text,
                x,
                bold: segment.bold || false,
                italic: segment.italic || false,
                underline: segment.underline || false,
                color: segment.color || "black",
                strikethrough: segment.strikethrough || false,
                backgroundColor: segment.backgroundColor,
              },
            );
          }
        }

        currentY += pageState.lineHeight; // Move up from bottom
      }
    }

    currentY += pageState.lineHeight; // Add spacing between elements
  }

  return { ...pageState, currentY };
}

/**
 * Generates instructions for a scene heading
 */
function generateSceneInstructions(
  instructions: Instruction[],
  pageState: PageState,
  scene: SceneHeading,
  fountainScript: FountainScript,
  options: PDFOptions,
): PageState {
  // Use the heading property directly
  const sceneText = scene.heading.toUpperCase(); // Scene headings are typically uppercase

  // Add spacing before scene heading and ensure we have space
  let currentState = addElementSpacing(pageState);
  currentState = needLines(instructions, currentState, 1);

  if (scene.number) {
    // Extract scene number text (remove the # characters)
    const numberText = fountainScript.document.substring(
      scene.number.start + 1,
      scene.number.end - 1,
    );

    // Calculate positions to avoid overlap
    const leftNumberWidth =
      `${numberText}.`.length * getCharacterWidth(pageState.fontSize);
    const headingStartX =
      pageState.margins.left +
      leftNumberWidth +
      getCharacterWidth(pageState.fontSize); // Add one space

    // Adjust scene heading indent to avoid overlap with left number
    const adjustedHeadingX = Math.max(SCENE_HEADING_INDENT, headingStartX);

    // Left scene number
    emitText(instructions, currentState, {
      data: `${numberText}.`,
      x: pageState.margins.left,
      bold: true,
      italic: false,
      underline: false,
      color: "black",
      strikethrough: false,
      backgroundColor: undefined,
    });

    // Scene heading (adjusted position to avoid overlap)
    emitText(instructions, currentState, {
      data: sceneText,
      x: adjustedHeadingX,
      bold: options.sceneHeadingBold,
      italic: false,
      underline: false,
      color: "black",
      strikethrough: false,
      backgroundColor: undefined,
    });

    // Right scene number
    const rightNumberX =
      pageState.pageWidth -
      pageState.margins.right -
      numberText.length * getCharacterWidth(pageState.fontSize);
    emitText(instructions, currentState, {
      data: numberText,
      x: rightNumberX,
      bold: true,
      italic: false,
      underline: false,
      color: "black",
      strikethrough: false,
      backgroundColor: undefined,
    });
  } else {
    // No scene number, just the heading
    emitText(instructions, currentState, {
      data: sceneText,
      x: SCENE_HEADING_INDENT,
      bold: options.sceneHeadingBold,
      italic: false,
      underline: false,
      color: "black",
      strikethrough: false,
      backgroundColor: undefined,
    });
  }

  // Update page state
  return {
    ...advanceLine(currentState),
    lastElementType: "scene",
  };
}

/**
 * Generates instructions for a synopsis
 */
function generateSynopsisInstructions(
  instructions: Instruction[],
  pageState: PageState,
  synopsis: Synopsis,
  fountainScript: FountainScript,
): PageState {
  // Add spacing before synopsis and ensure we have space
  let currentState = addElementSpacing(pageState);

  // Extract and render each line of the synopsis
  for (const lineRange of synopsis.linesOfText) {
    const synopsisText = fountainScript.document
      .substring(lineRange.start, lineRange.end)
      .trim();

    if (synopsisText.length > 0) {
      // Wrap synopsis text to fit within action line width
      const wrappedLines = wrapPlainText(
        synopsisText,
        pageState.charactersPerLine.action,
      );

      for (const line of wrappedLines) {
        currentState = needLines(instructions, currentState, 1);

        emitText(instructions, currentState, {
          data: line,
          x: ACTION_INDENT,
          bold: false,
          italic: true, // Synopsis in CourierOblique
          underline: false,
          color: "gray", // Synopsis in gray
          strikethrough: false,
          backgroundColor: undefined,
        });

        currentState = advanceLine(currentState);
      }
    } else {
      // Empty synopsis line
      currentState = needLines(instructions, currentState, 1);
      currentState = advanceLine(currentState);
    }
  }

  return {
    ...currentState,
    lastElementType: "synopsis",
  };
}

/**
 * Generates instructions for an action block
 */
function generateActionInstructions(
  instructions: Instruction[],
  pageState: PageState,
  action: Action,
  fountainScript: FountainScript,
  options: PDFOptions,
): PageState {
  // Extract styled text from all lines in the action block, preserving centering info
  type ActionLineInfo = WrappedLine & { centered: boolean };

  const actionLines: ActionLineInfo[] = [];

  for (const line of action.lines) {
    if (line.elements.length > 0) {
      const styledSegments = extractStyledSegments(
        line.elements,
        fountainScript.document,
        options,
      );

      const wrappedLines = wrapStyledText(
        styledSegments,
        pageState.charactersPerLine.action,
        false,
      );

      // Add each wrapped line with the original centering information
      for (const wrappedLine of wrappedLines) {
        actionLines.push({
          ...wrappedLine,
          centered: line.centered,
        });
      }
    } else {
      actionLines.push({
        segments: [],
        marginMarks: [],
        centered: line.centered,
      });
    }
  }

  // Add spacing before action block and ensure we have space for all lines
  let currentState = addElementSpacing(pageState);
  currentState = needLines(instructions, currentState, actionLines.length);

  // Generate instructions for each line of the action block
  for (const lineInfo of actionLines) {
    // Ensure we have space for this line
    currentState = needLines(instructions, currentState, 1);

    // Generate instructions for the line with styled segments
    if (lineInfo.segments.length > 0) {
      let currentX: number;

      if (lineInfo.centered) {
        // Calculate line width for centering
        let lineWidth = 0;
        for (const segment of lineInfo.segments) {
          lineWidth +=
            segment.text.length * getCharacterWidth(pageState.fontSize);
        }

        // Center the line
        currentX = (pageState.pageWidth - lineWidth) / 2;
      } else {
        // Use standard action indent
        currentX = ACTION_INDENT;
      }

      for (const segment of lineInfo.segments) {
        if (segment.text.length > 0) {
          currentX = emitText(instructions, currentState, {
            data: segment.text,
            x: currentX,
            bold: segment.bold || false,
            italic: segment.italic || false,
            underline: segment.underline || false,
            color: segment.color || "black",
            strikethrough: segment.strikethrough || false,
            backgroundColor: segment.backgroundColor,
          });
        }
      }

      // Render margin marks in the left margin
      if (lineInfo.marginMarks.length > 0) {
        emitMarginMarks(instructions, currentState, lineInfo.marginMarks);
      }
    }

    currentState = advanceLine(currentState);
  }

  return {
    ...currentState,
    lastElementType: "action",
  };
}

function generateLyricsInstructions(
  instructions: Instruction[],
  pageState: PageState,
  lyrics: Lyrics,
  fountainScript: FountainScript,
  options: PDFOptions,
): PageState {
  // Extract styled text from all lines in the lyrics block, preserving centering info
  // Lyrics are rendered like action lines but with italic styling
  type LyricsLineInfo = WrappedLine & { centered: boolean };

  const lyricsLines: LyricsLineInfo[] = [];

  for (const line of lyrics.lines) {
    if (line.elements.length > 0) {
      const styledSegments = extractStyledSegments(
        line.elements,
        fountainScript.document,
        options,
      );

      const wrappedLines = wrapStyledText(
        styledSegments,
        pageState.charactersPerLine.action,
        true, // preserveWhitespace for lyrics
      );

      // Add each wrapped line with the original centering information
      // Force italic styling for all segments in lyrics
      for (const wrappedLine of wrappedLines) {
        const italicSegments = wrappedLine.segments.map((segment) => ({
          ...segment,
          italic: true, // Force italics for lyrics
        }));
        lyricsLines.push({
          segments: italicSegments,
          marginMarks: wrappedLine.marginMarks,
          centered: line.centered,
        });
      }
    } else {
      lyricsLines.push({
        segments: [],
        marginMarks: [],
        centered: line.centered,
      });
    }
  }

  // Add spacing before lyrics block and ensure we have space for all lines
  let currentState = addElementSpacing(pageState);
  currentState = needLines(instructions, currentState, lyricsLines.length);

  // Generate instructions for each line of the lyrics block
  for (const lineInfo of lyricsLines) {
    // Ensure we have space for this line
    currentState = needLines(instructions, currentState, 1);

    // Generate instructions for the line with styled segments
    if (lineInfo.segments.length > 0) {
      let currentX: number;

      if (lineInfo.centered) {
        // Calculate line width for centering
        let lineWidth = 0;
        for (const segment of lineInfo.segments) {
          lineWidth +=
            segment.text.length * getCharacterWidth(pageState.fontSize);
        }

        // Center the line
        currentX = (pageState.pageWidth - lineWidth) / 2;
      } else {
        // Use standard action indent for lyrics
        currentX = ACTION_INDENT;
      }

      for (const segment of lineInfo.segments) {
        if (segment.text.length > 0) {
          currentX = emitText(instructions, currentState, {
            data: segment.text,
            x: currentX,
            bold: segment.bold || false,
            italic: segment.italic || false,
            underline: segment.underline || false,
            color: segment.color || "black",
            strikethrough: segment.strikethrough || false,
            backgroundColor: segment.backgroundColor,
          });
        }
      }

      // Render margin marks in the left margin
      if (lineInfo.marginMarks.length > 0) {
        emitMarginMarks(instructions, currentState, lineInfo.marginMarks);
      }
    }

    currentState = advanceLine(currentState);
  }

  return {
    ...currentState,
    lastElementType: "action", // Treat lyrics similar to action for spacing purposes
  };
}

/**
 * Emits instructions for prepared dialogue data
 */
function emitDialogueInstructions(
  instructions: Instruction[],
  pageState: PageState,
  preparedDialogue: PreparedDialogue,
): PageState {
  // Add spacing before dialogue block
  let currentState = addElementSpacing(pageState);

  const requiredLines = dialogueRequiredLines(preparedDialogue);

  if (requiredLines <= 5) {
    // If it is less than 5 lines, we will never break it across pages.
    currentState = needLines(instructions, currentState, requiredLines);
    return emitDialogueOnCurrentPage(
      instructions,
      currentState,
      preparedDialogue,
    );
  }

  // Complex case: We might be willing to split it across pages.
  currentState = needLines(instructions, currentState, 5);

  // But first see if asking for 5 lines moved us to a new page, and
  // the dialogue fits on that page.
  if (hasSpaceForLines(currentState, requiredLines)) {
    // We have space for everything after ensuring minimum 5 lines
    // because we might have moved to a new page AND the dialogue might fit on one page.
    return emitDialogueOnCurrentPage(
      instructions,
      currentState,
      preparedDialogue,
    );
  }

  // Okay we have no choice we have to split the dialogue across pages
  const [firstPart, secondPart] = splitDialogue(currentState, preparedDialogue);

  currentState = emitDialogueOnCurrentPage(
    instructions,
    currentState,
    firstPart,
  );

  // Emit (MORE)
  emitText(instructions, currentState, {
    data: "(MORE)",
    x: PARENTHETICAL_INDENT,
    bold: false,
    italic: false,
    underline: false,
    color: "black",
    strikethrough: false,
    backgroundColor: undefined,
  });
  currentState = advanceLine(currentState);

  // Recurse with second part
  return emitDialogueInstructions(instructions, currentState, secondPart);
}

/**
 * Emits a complete dialogue block without splitting
 */
function emitDialogueOnCurrentPage(
  instructions: Instruction[],
  pageState: PageState,
  preparedDialogue: PreparedDialogue,
): PageState {
  let currentState = pageState;

  // Emit character name
  const characterName = preparedDialogue.contd
    ? `${preparedDialogue.characterLine} (CONT'D)`
    : preparedDialogue.characterLine;
  emitText(instructions, currentState, {
    data: characterName,
    x: CHARACTER_INDENT,
    bold: false,
    italic: false,
    underline: false,
    color: "black",
    strikethrough: false,
    backgroundColor: undefined,
  });
  currentState = advanceLine(currentState);

  // Emit content lines (interleaved parentheticals and dialogue)
  for (const contentLine of preparedDialogue.contentLines) {
    if (contentLine.kind === "parenthetical") {
      emitText(instructions, currentState, {
        data: contentLine.text,
        x: PARENTHETICAL_INDENT,
        bold: false,
        italic: false,
        underline: false,
        color: "black",
        strikethrough: false,
        backgroundColor: undefined,
      });
    } else {
      const dialogueLine = contentLine.wrappedLine;
      if (dialogueLine.segments.length > 0) {
        let currentX = DIALOGUE_INDENT;
        for (const segment of dialogueLine.segments) {
          if (segment.text.length > 0) {
            currentX = emitText(instructions, currentState, {
              data: segment.text,
              x: currentX,
              bold: segment.bold || false,
              italic: segment.italic || false,
              underline: segment.underline || false,
              color: segment.color || "black",
              strikethrough: segment.strikethrough || false,
              backgroundColor: segment.backgroundColor,
            });
          }
        }
      }

      // Render margin marks in the left margin
      if (dialogueLine.marginMarks.length > 0) {
        emitMarginMarks(instructions, currentState, dialogueLine.marginMarks);
      }
    }
    currentState = advanceLine(currentState);
  }

  return {
    ...currentState,
    lastElementType: "dialogue",
  };
}

/**
 * Generates instructions for a dialogue block
 */
function generateDialogueInstructions(
  instructions: Instruction[],
  pageState: PageState,
  dialogue: Dialogue,
  fountainScript: FountainScript,
  options: PDFOptions,
): PageState {
  const preparedDialogue = prepareDialogueData(
    pageState,
    dialogue,
    fountainScript,
    options,
  );
  return emitDialogueInstructions(instructions, pageState, preparedDialogue);
}

/**
 * Generates instructions for a transition
 */
function generateTransitionInstructions(
  instructions: Instruction[],
  pageState: PageState,
  transition: Transition,
  fountainScript: FountainScript,
): PageState {
  // Extract the transition text from the document
  const transitionText = extractTransitionText(
    transition,
    fountainScript,
  ).toUpperCase();

  // Add spacing before transition and ensure we have space
  let currentState = addElementSpacing(pageState);
  currentState = needLines(instructions, currentState, 1);

  // Calculate right-aligned position
  const textWidth =
    transitionText.length * getCharacterWidth(pageState.fontSize);
  const rightAlignedX =
    pageState.pageWidth - pageState.margins.right - textWidth;

  // Generate instruction for transition
  emitText(instructions, currentState, {
    data: transitionText,
    x: rightAlignedX,
    bold: false,
    italic: false,
    underline: false,
    color: "black",
    strikethrough: false,
    backgroundColor: undefined,
  });

  return {
    ...advanceLine(currentState),
    lastElementType: "transition",
  };
}
