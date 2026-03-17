# Obsidian Fountain Plugin

## Features

- **Views**: Readonly/edit modes with seamless toggling, PDF export, rehearsal mode with blackout
- **Sidebar**: TOC with navigation, synopsis/notes toggles, snippets with drag-and-drop
- **Index Cards**: Scene cards with drag-drop reordering, synopsis editing, cross-file moves
- **Snippets**: Store in `# Snippets` section, Mod+Shift+X/C to move/copy selection, drag into script/sidebar
- **Editor**: Scene folding (Ctrl+Shift+[ ]), character name completion
- **Margin Marks**: `[[@marker]]` syntax renders in margin
- **Boneyard**: Content after `# boneyard` hidden when enabled
- **Removal Commands**: Filter by character, scenes, or element types (creates copy by default)

## LLM Guidelines

**Discuss design before coding.** Unless explicitly asked to implement, only discuss design and provide small code snippets when clearer than prose.

**DO NOT READ fonts.css.`** It only contains font-face declarations and wastes precious tokens.

## Implementation

TypeScript with functional style. Jest for unit testing (never mock the parser—use `parse()`).
E2E tests use wdio-obsidian-service (WebdriverIO + real Obsidian instance).

```sh
npm run build    # Build
npm run test     # Unit tests (Jest)
npm run test:e2e # E2E tests (WebdriverIO, launches Obsidian)
```

## Architecture

### Views
- `FountainView` — main view with `ReadonlyViewState` / `EditorViewState`
- `FountainSideBarView` — TOC + snippets sections

### Parser
Peggy.js grammar (`fountain_parser.peggy`) → `FountainScript` with:
- `document`, `titlePage`, `script[]`, `allCharacters`
- All elements have `Range` (`{start, end}`) for position tracking
- Margin marks parsed as notes with `noteKind` starting with "@"

### Snippets
```typescript
interface Snippet { content: FountainElement[]; pageBreak?: PageBreak; }
interface ScriptStructure { sections: StructureSection[]; snippets: Snippet[]; }
```
- Page breaks (`===`) separate snippets, not part of content
- `FountainScript.structure()` parses snippets section
- Re-parse document after modifications rather than in-place edits

### PDF Generation
Uses `pdf-lib`. Two-phase: generate draw instructions → render to PDF.
Left margin fixed at 1.5" for binding; other margins computed to maintain consistent characters/line across paper sizes.

## Source Files

In the `src` folder:

| File | Purpose |
|------|---------|
| `main.ts` | Plugin entry, commands, lifecycle |
| `view.ts` | FountainView, text manipulation, editing ops |
| `view_state.ts` | ViewState interface, shared view types |
| `readonly_view_state.ts` | ReadonlyViewState (reading/index cards) |
| `editor_view_state.ts` | EditorViewState (CodeMirror editor) |
| `fountain.ts` | Core types, FountainScript, text utilities |
| `fountain_parser.peggy` | Peggy grammar |
| `reading_view.ts` | Readonly rendering |
| `fountain_editor.ts` | CodeMirror syntax highlighting |
| `fountain_state.ts` | StateField for parsed FountainScript |
| `fountain_folding.ts` | Scene folding service |
| `character_completion.ts` | Character name autocompletion |
| `sidebar_view.ts` | TOC + snippets sidebar |
| `index_cards_view.ts` | Index card view |
| `pdf_generator.ts` | PDF generation entry point and facade |
| `pdf_types.ts` | PDF shared types, constants, utilities |
| `pdf_instruction_generator.ts` | PDF instruction generation from AST |
| `pdf_renderer.ts` | PDF rendering using pdf-lib |
| `pdf_options_dialog.ts` | PDF export options modal |
| `render_tools.ts` | Shared HTML rendering |
| `fuzzy_select_string.ts` | Fuzzy search modal |
| `removal_commands.ts` | Removal command modals |
| `removal_utilities.ts` | Range extraction for removals |

Unit tests are in the `__tests__` folder. E2E tests are in `test/e2e/` (specs in `test/e2e/specs/`, test vaults in `test/e2e/vaults/`).

Styling is in `core_styles.css`. As part of the build process `esbuild.config.mjs` concatenates 
`fonts.css` and `core_styles.css` into `styles.css`.

`fonts.css` and `styles.css` are very long and should not be read!
