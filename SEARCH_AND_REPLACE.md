# Search and Replace

## Problem

Our custom CodeMirror 6 editor doesn't get Obsidian's built-in search. Users need Ctrl/Cmd+F to work.

## Solution

Use `@codemirror/search`. It's already installed transitively and integrates directly with our CodeMirror setup. No new files needed.

## Implementation

1. Add `@codemirror/search` as an explicit dependency in `package.json`.

2. In `editor_view_state.ts`, add to the extensions array:

```typescript
import { search, searchKeymap, highlightSelectionMatches } from "@codemirror/search";

// In the extensions list:
search(),
highlightSelectionMatches(),
keymap.of(searchKeymap),
```

3. Add CSS in `core_styles.css` to style match highlights to fit Obsidian's theme. The default CodeMirror search panel should work without customization — only restyle if it looks wrong.
