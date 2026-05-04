// Barrel re-export: all public API from the three sub-modules.
export {
  NBSP,
  type ShowHideSettings,
  type Range,
  dataRange,
  intersect,
  collapseRangeToStart,
  type BasicTextElement,
  type StyledTextElement,
  type TextElement,
  type StyledText,
  type Note,
  type Boneyard,
  type TextElementWithNotesAndBoneyard,
  type StyledTextWithNotesAndBoneyard,
  type Line,
  type PageBreak,
  type Synopsis,
  type Action,
  type SceneHeading,
  type Transition,
  type DialogueContent,
  type DialogueContentParenthetical,
  type DialogueContentLine,
  type Dialogue,
  type Section,
  type Lyrics,
  type FountainElement,
  type KeyValue,
  type Snippet,
  type Snippets,
  type ScriptStructure,
  StructureSection,
  StructureScene,
} from "./types";

export {
  isBlankLines,
  mergeText,
  extractNotes,
  extractMarginMarker,
  extractTransitionText,
  mergeConsecutiveActions,
  sceneHeadingTextEnd,
  dialogueLines,
  firstParenthetical,
  filterDialogueContent,
  maybeEscapeLeadingSpaces,
} from "./utils";

export { FountainScript } from "./script";

export {
  type Edit,
  applyEdits,
  computeMoveSceneEdits,
  computeMoveSceneAcrossFilesEdits,
  computeAddSceneNumberEdits,
  computeRemoveSceneNumberEdits,
} from "./edits";

export {
  findSceneAtOffset,
  startOfSceneContent,
} from "./structure_nav";

export { removeElementsFromText } from "./removal";

export {
  LINK_NOTE_KIND,
  type ParsedLink,
  isLinkNote,
  parseLinkContent,
  extractLinks,
  targetRefersTo,
} from "./links";
