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
} from "./fountain_types";

export {
  isBlankLines,
  mergeText,
  extractNotes,
  extractMarginMarker,
  extractTransitionText,
  mergeConsecutiveActions,
} from "./fountain_utils";

export { FountainScript } from "./fountain_script";
