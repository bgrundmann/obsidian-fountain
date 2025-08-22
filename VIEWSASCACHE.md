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

**Required changes in view.ts:**

1. **Add script field to FountainView:**
   - Add `private script: FountainScript` field
   - Initialize in constructor with empty document: `this.script = parse("", {})`

2. **Update FountainView.script() method:**
   - Change from `return this.state.script()` to `return this.script`

3. **Update view state script() methods:**
   - In `ReadonlyViewState.script()`: change from `fountainFiles.get(this.path)` to access parent view's script
   - In `EditorViewState.script()`: change from `fountainFiles.get(this.path)` to access parent view's script
   - Both need reference to parent FountainView to access the cached script

4. **Modify view state constructors:**
   - Pass FountainView reference to both ReadonlyViewState and EditorViewState constructors
   - Remove dependency on global fountainFiles in script() methods

#### 2. Multi-View Synchronization
When a document is modified, we need to parse it once and then update all views that are using it:

**Required changes in view.ts:**

1. **Update FountainView.setViewData():**
```typescript
setViewData(data: string, clear: boolean) {
  // Short circuit if data unchanged to avoid redundant parsing
  // when Obsidian calls setViewData on all views for the same file
  if (this.script.document === data) return;
  
  const newScript = parse(data, {});
  this.updateAllViewsForFile(this.file?.path || "", newScript);
  
  // Delegate to current state for any state-specific handling
  this.state.setViewData(data, clear);
}
```

2. **Add synchronization method to FountainView:**
```typescript
private updateAllViewsForFile(path: string, newScript: FountainScript) {
  this.app.workspace.iterateAllLeaves(leaf => {
    if (leaf.view instanceof FountainView && leaf.view.file?.path === path) {
      leaf.view.updateScript(newScript);
    }
  });
}

private updateScript(newScript: FountainScript) {
  this.script = newScript;
  // Trigger any necessary re-renders in current state
  if (this.state instanceof ReadonlyViewState) {
    this.state.render();
  }
}
```

3. **Update view state setViewData() methods:**
   - Remove `fountainFiles.set(path, data)` calls
   - Keep only state-specific logic (if any)
   - The parsing and caching is now handled by parent FountainView

#### 3. Editing Operations Migration
Current editing methods in `FountainFiles` need to be moved:
- Move `replaceText()`, `moveScene()`, `duplicateScene()` methods to a utility module
- These methods should work with the view's cached script and trigger synchronization
- The methods should return the modified text, which the caller uses to update the file

**Required changes in view.ts:**

1. **Add editing methods to FountainView:**
```typescript
replaceText(range: Range, replacement: string): string {
  const newText = replaceTextInString(this.script.document, range, replacement);
  this.setViewData(newText, false);
  return newText;
}

moveScene(range: Range, newPos: number): string {
  const newText = moveSceneInString(this.script.document, range, newPos);
  this.setViewData(newText, false);
  return newText;
}

duplicateScene(range: Range): string {
  const newText = duplicateSceneInString(this.script.document, range);
  this.setViewData(newText, false);
  return newText;
}
```

2. **Update components using these methods:**
   - Change from `fountainFiles.replaceText(path, ...)` to `view.replaceText(...)`
   - Change from `fountainFiles.moveScene(path, ...)` to `view.moveScene(...)`
   - Change from `fountainFiles.duplicateScene(path, ...)` to `view.duplicateScene(...)`

#### 4. Editor Plugin Integration
The `FountainEditorPlugin` needs to access the view's cached script instead of the global cache:

**Required changes in view.ts:**

1. **Update EditorViewState constructor:**
```typescript
constructor(contentEl: HTMLElement, path: string, parentView: FountainView) {
  // ... existing setup ...
  
  this.cmEditor.setState(
    EditorState.create({
      // ... existing config ...
      extensions: [
        // ... existing extensions ...
        fountainEditorPlugin(
          () => parentView.script(), // getter closure
          (script: FountainScript) => parentView.updateScript(script) // setter closure
        ),
      ],
    })
  );
}
```

2. **Remove global cache dependency from editor plugin initialization**

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

**Additional view.ts considerations:**

4. **Clear method updates:**
   - Remove `fountainFiles.clear()` calls from view state clear() methods
   - Reset view's script to empty: `this.script = parse("", {})`

5. **Path handling:**
   - ReadonlyViewState and EditorViewState still need path for other operations
   - But script access no longer uses path to look up in global cache

6. **Constructor initialization:**
   - FountainView constructor should initialize `this.script = parse("", {})` 
   - This provides the empty state before any file is loaded

7. **Memory management:**
   - Scripts are automatically cleaned up when views are destroyed
   - No explicit cleanup needed as script is a private field of the view

### Benefits of New Approach

1. **Automatic Cleanup**: Scripts are cleaned up when views close
2. **Simpler State Management**: No global state to manage
3. **Better Encapsulation**: Each view manages its own parsed representation
4. **Reduced Coupling**: Components are less dependent on global singleton
5. **Easier Testing**: Can test view behavior without global state setup

The one twist is that the same parsed fountain document can be used by multiple views. This means that when the document is modified we need to parse it once and then update all views that are using it, to reflect the changes. To do that we can iterate over all (fountain) views and filter them by the document's path.
