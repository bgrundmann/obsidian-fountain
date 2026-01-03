# Folding Implementation Plan

This document outlines the implementation plan for adding folding support to the Fountain editor view.

## Overview

Folding will be implemented using CodeMirror 6's folding service, leveraging the existing `FountainScript.structure()` method to identify foldable ranges for scenes.

## Dependencies

Add to `package.json`:
- `@codemirror/language`: Provides folding service and gutter support

## Implementation Files

### 1. `src/fountain_folding.ts`

Create folding service that integrates with existing parser:

- `createFountainFoldService(getScript: () => FountainScript)`: Main folding service factory
- `buildFoldRanges(structure: ScriptStructure)`: Recurse over script.structure() and create folds as appropriate
- `findFoldAtPosition(ranges: FoldRange[], position: number)`: Find applicable fold range for cursor position

### 2. Update `src/view.ts`

Modify `EditorViewState` constructor:

- Import folding extensions from `@codemirror/language`
- Add `foldGutter()` to editor extensions
- Add `createFountainFoldService()` to editor extensions
- Add fold/unfold keyboard shortcuts to keymap

### 3. Update `styles.css`

Add CSS for folding UI:

- `.cm-foldGutter`: Style the fold gutter column
- `.cm-foldPlaceholder`: Style folded content placeholder

## Folding Logic

### Scenes

- Fold from end of scene heading to end of scene content
- Only create fold if scene contains meaningful content (action, dialogue, or transitions)
- Handle nested sections by recursively processing their content for scenes
- Preserve scene boundary detection from existing structure

### Implementation Notes

- Use existing `Range` objects from parsed elements
- Integrate with current script caching mechanism in `FountainView`
- Update fold ranges when document changes (via existing update pipeline)
- Focus on scenes only for initial implementation - section folding can be added later
- Only scenes with meaningful content (action, dialogue, transitions) are foldable