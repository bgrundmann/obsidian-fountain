# Search and Replace Functionality Design

## Problem Statement

The Fountain plugin uses a custom CodeMirror 6 editor instance instead of Obsidian's built-in editor component to avoid interference with Obsidian's parsing and completion systems. This approach provides better control over Fountain-specific syntax highlighting and editing behaviors, but it means we lose access to Obsidian's built-in search and replace functionality.

Users expect standard text editor search capabilities:
- Find text within the current document
- Case-sensitive and case-insensitive search
- Regular expression support
- Replace single occurrences
- Replace all occurrences
- Navigation between search results
- Highlight all matches visually

## Available Solutions

### Option 1: CodeMirror 6 Search Extension

CodeMirror 6 provides a comprehensive search package (`@codemirror/search`) that includes:

**Built-in Features:**
- Search and replace functionality
- Regular expression support
- Case sensitivity toggles
- Highlight all matches
- Navigate between matches (next/previous)
- Search panel UI (customizable)
- Keyboard shortcuts (Ctrl/Cmd+F, F3, etc.)
- Integration with editor state and selections

**Customization Options:**
- Custom search panel UI via `createPanel` callback
- Custom keybindings
- Integration with existing editor extensions

**Implementation Approach:**
```typescript
import { search, searchKeymap, highlightSelectionMatches } from "@codemirror/search";

// In EditorViewState, add to extensions:
search({
  createPanel: createCustomSearchPanel, // Optional: custom UI
}),
highlightSelectionMatches(),
keymap.of([...searchKeymap])
```

### Option 2: Obsidian Global Search Integration

Leverage Obsidian's existing search functionality where possible:

**Available APIs:**
- `app.workspace.getLeavesOfType('search')` - Access search views
- `app.internalPlugins.getPluginById('global-search')` - Global search plugin
- Search modal functionality

**Limitations:**
- Designed for vault-wide search, not single-document
- May not integrate well with custom CodeMirror instance
- Limited control over search behavior within our editor

### Option 3: Custom Implementation

Build search functionality from scratch using:
- CodeMirror's `SearchCursor` and `RegExpCursor` classes
- Custom UI components
- Manual state management

**Benefits:**
- Complete control over behavior and appearance
- Tight integration with Fountain-specific features

**Drawbacks:**
- Significant development effort
- Need to implement standard features (regex, case sensitivity, etc.)
- Maintenance overhead

## Recommended Approach: CodeMirror 6 Search Extension

**Rationale:**
1. **Mature and Well-Tested:** CodeMirror's search extension is battle-tested and feature-complete
2. **Minimal Integration Effort:** Plugs directly into our existing CodeMirror setup
3. **Customizable:** Can be styled and extended to match Obsidian's look and feel
4. **Standard Behavior:** Users expect familiar search interactions
5. **Future-Proof:** Maintained by the CodeMirror team

## Implementation Plan

### Phase 1: Basic Integration

1. **Add Dependencies:**
   - Install `@codemirror/search` (likely already available)
   - Import required functions and extensions

2. **Integrate with EditorViewState:**
   ```typescript
   // In fountain_editor.ts or new search_extension.ts
   import { search, searchKeymap, highlightSelectionMatches } from "@codemirror/search";
   
   const searchExtensions = [
     search(), // Use default search panel initially
     highlightSelectionMatches(),
     keymap.of([...searchKeymap])
   ];
   ```

3. **Add to Editor Extensions:**
   ```typescript
   // In view.ts, EditorViewState.getExtensions()
   extensions.push(...searchExtensions);
   ```

### Phase 2: UI Customization

1. **Custom Search Panel:**
   - Create search panel component matching Obsidian's design language
   - Position appropriately within the editor view
   - Handle keyboard shortcuts and focus management

2. **Styling Integration:**
   - Add CSS classes for search highlighting
   - Match Obsidian's color scheme and typography
   - Ensure accessibility (contrast, focus indicators)

3. **Keyboard Shortcuts:**
   - Integrate with Obsidian's hotkey system if needed
   - Ensure shortcuts don't conflict with other plugin features

### Phase 3: Fountain-Specific Enhancements

1. **Fountain-Aware Search:**
   - Option to search within specific element types (dialogue, action, etc.)
   - Character name search with auto-completion
   - Scene header search

2. **Integration with Existing Features:**
   - Search results should respect boneyard visibility settings
   - Coordinate with rehearsal mode if active
   - Consider TOC integration for navigation

## Technical Details

### File Structure
```
src/
├── search/
│   ├── search_extension.ts      # Main search extension setup
│   ├── search_panel.ts          # Custom search UI component
│   └── fountain_search_utils.ts # Fountain-specific search helpers
├── fountain_editor.ts           # Updated to include search extensions
└── view.ts                      # Integration point
```

### Key Components

**SearchExtension:**
- Wraps CodeMirror's search functionality
- Provides Fountain-specific search options
- Manages search state and UI

**SearchPanel:**
- Custom UI component for search interface
- Handles user input and display of search options
- Coordinates with CodeMirror's search state

**Integration Points:**
- `EditorViewState.getExtensions()` - Add search extensions
- CSS styling - Match Obsidian's design system
- Keyboard shortcuts - Coordinate with existing bindings

### Search State Management

The search functionality will integrate with our existing architecture:

1. **Script Updates:** Search state should update when the fountain script changes
2. **View Switching:** Maintain search state when switching between readonly/editor modes
3. **Range Coordination:** Ensure search results align with our text range system

### UI/UX Considerations

1. **Panel Positioning:** 
   - Top of editor (CodeMirror default) vs. floating overlay
   - Consider limited screen real estate

2. **Keyboard Navigation:**
   - Standard shortcuts: Ctrl/Cmd+F (open), F3/Shift+F3 (next/previous), Escape (close)
   - Fountain-specific shortcuts for element type filtering

3. **Visual Feedback:**
   - Highlight all matches in editor
   - Show match count and current position
   - Clear visual distinction between current match and other matches

4. **Accessibility:**
   - Screen reader support
   - Keyboard-only navigation
   - High contrast support

## Future Enhancements

1. **Cross-File Search:** Integration with index cards view for scene-level search across multiple fountain files
2. **Advanced Replace:** Template-based replacements for common screenplay formatting changes
3. **Search History:** Remember recent searches within the session
4. **Export Search Results:** Generate reports of search results for script analysis

## Risk Mitigation

1. **Performance:** Large fountain files might impact search performance
   - Solution: Leverage CodeMirror's viewport-based optimization
   
2. **State Synchronization:** Search state might get out of sync with script updates
   - Solution: Integrate search updates with our existing script change detection

3. **UI Conflicts:** Custom search panel might interfere with other UI elements
   - Solution: Careful CSS scoping and z-index management

## Success Criteria

1. **Functional Parity:** Match standard text editor search capabilities
2. **Performance:** Search operations complete within 100ms for typical fountain files
3. **User Experience:** Intuitive interface matching Obsidian's design language
4. **Integration:** Seamless operation with existing plugin features
5. **Accessibility:** Full keyboard navigation and screen reader support