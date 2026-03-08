# Search and Replace

## Problem

Our custom CodeMirror 6 editor doesn't get Obsidian's built-in search. Users need Cmd/Ctrl+F to work.

## Solution

Use `@codemirror/search` for the search functionality. Use Obsidian's `View.scope` API
to override Cmd/Ctrl+F when the Fountain view has focus (registering a global command
causes hotkey conflicts).

## Key implementation detail: View.scope

Obsidian intercepts Cmd/Ctrl+F globally before CodeMirror sees it. Registering an Obsidian
command with `Mod+F` conflicts with the built-in "Search current file" command (both show
red in hotkey settings).

The fix is `View.scope`: setting `this.scope = new Scope(this.app.scope)` on the view and
registering Mod+F on that scope. When the view has focus, its scope handlers take priority.
When another view has focus, Obsidian's normal Cmd+F works. No global command needed.
