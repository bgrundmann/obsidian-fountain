# Views as cache

## Introduction

At the moment we use a global hashtable path -> parsed fountain document (Fountain_files).  This approach has several problems:
- We don't prune elements from the cache when they are no longer needed.
- And indeed it is tricky to figure out exactly when the element is no longer needed.
- There are some bugs related to when we add elements to the cache, in particular when a file is duplicated or newly created.

## Current Architecture Analysis

### Global Cache Structure
The `FountainFiles` class maintains:
```
private documents: Map<string, FountainScript | string>
```

### Current Usage Patterns
1. **Text Storage**: `fountainFiles.set(path, text)` stores raw text
2. **Lazy Parsing**: `fountainFiles.get(path)` parses on demand and caches the result
3. **Editing Operations**: Methods like `replaceText()`, `moveScene()`, `duplicateScene()` modify the cache directly

### Components Using the Cache
1. **ReadonlyViewState**: Uses `fountainFiles.get()` for rendering and `fountainFiles.set()` when loading
2. **EditorViewState**: Uses `fountainFiles.get()` for script access and `fountainFiles.set()` when text changes
3. **FountainEditorPlugin**: Uses `fountainFiles.get()` for syntax highlighting decorations
4. **Index Cards Rendering**: Uses all editing methods for scene manipulation

### Current Synchronization
- No explicit synchronization between multiple views of the same file
- Changes propagate through the shared global cache
- Editor updates cache on document changes via CodeMirror listeners

## New Approach

We store the parsed fountain documents directly in the view's state. This approach has several advantages:
- It eliminates the need for a global cache.
- It simplifies the code by removing the need for a separate cache management system.
- Automatic cleanup when views are destroyed.

### Implementation Strategy

#### 1. Cache Location
Store the parsed `FountainScript` in the `FountainView` class itself, not in the individual view states (`ReadonlyViewState` or `EditorViewState`). This allows sharing between the two states while maintaining a single source of truth per view.

```typescript
class FountainView extends TextFileView {
  private script: FountainScript;
  // ... existing fields
}
```

#### 2. Multi-View Synchronization
When a document is modified, we need to parse it once and then update all views that are using it:

```typescript

// In FountainView setViewData
private setViewData(data: string, _clear: boolean) {
	/// We need to short circuit the update if the data is unchanged
	/// as obsidian will call setViewData for all views on this file
	/// and we don't want to parse the same text multiple times
	if (this.script.document === data) return;
	const newScript = parse(newText, {});
	this.updateFountainScript(path, newScript)
}

private updateFountainScript(path: string, newScript: FountainScript) {
  // Find all FountainView instances for this path
  this.app.workspace.iterateAllLeaves(leaf => {
    if (leaf.view instanceof FountainView && leaf.view.file?.path === path) {
      leaf.view.setScript(newScript);
    }
  });
}
```

#### 3. Editing Operations Migration
Current editing methods in `FountainFiles` need to be moved:
- Move `replaceText()`, `moveScene()`, `duplicateScene()` methods to a utility module
- These methods should work with the view's cached script and trigger synchronization
- The methods should return the modified text, which the caller uses to update the file

#### 4. Editor Plugin Integration
The `FountainEditorPlugin` needs to access the view's cached script instead of the global cache:
- For that we will pass two closures to the plugin: one for getting the script and another for updating it.

### Migration Steps

#### Phase 1: Dual Storage
1. Keep the existing global cache
2. Add script caching to `FountainView`
3. Modify components to prefer view cache over global cache
4. Add synchronization mechanism

#### Phase 2: Remove Dependencies
1. Migrate editing operations from `FountainFiles` to utility functions
2. Update `index_cards_view.ts` to use view-based operations
3. Remove global cache usage from `fountain_editor.ts`

#### Phase 3: Cleanup
1. Remove `FountainFiles` class and global `fountainFiles` instance
2. Clean up imports and references

### Edge cases

1. **External File Changes**: How to handle when file is modified outside of any open view? I believe obsidian will handle this automatically and eventually call setViewData.
2. **View Creation**: When opening a file, should we parse immediately or wait for first access? The plan is to parse immediately.
3. **Initialization**: How to handle the initial empty state before any file is loaded? Initialize with an empty document (and corresponding parsed representation).

### Benefits of New Approach

1. **Automatic Cleanup**: Scripts are cleaned up when views close
2. **Simpler State Management**: No global state to manage
3. **Better Encapsulation**: Each view manages its own parsed representation
4. **Reduced Coupling**: Components are less dependent on global singleton
5. **Easier Testing**: Can test view behavior without global state setup

The one twist is that the same parsed fountain document can be used by multiple views. This means that when the document is modified we need to parse it once and then update all views that are using it, to reflect the changes. To do that we can iterate over all (fountain) views and filter them by the document's path.
