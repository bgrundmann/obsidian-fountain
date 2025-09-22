# Snippets Feature Design

## Overview

The snippets feature extends the existing table of contents (TOC) view in the right sidebar to include a dedicated snippets section in the lower half. This feature allows writers to store reusable blocks of text within their fountain document and easily drag and drop them back into earlier parts of the script.

## Requirements

### Document Structure

- Snippets are stored within the same fountain document as the main script
- Snippets are saved in a section called `# Snippets`, after the `# Boneyard` section.
- The document structure becomes: Main Script → `# Boneyard` → `# Snippets`
- After "# Snippets" everything until the end of document is considered to be snippets, even if it includes other "# Sections".

### Snippet Definition

- A snippet is a block of text that can contain any fountain elements (dialogue, action, scene headings, etc.)
- Each snippet is separated from other snippets by explicit page breaks (`===`)
- Page breaks cannot be part of a snippet's content - they serve only as separators
- Snippets can be of any length and contain multiple fountain elements

### User Interface

- The TOC view in the right sidebar is extended to show two sections:
  - Upper half: existing table of contents functionality
  - Lower half: new snippets section (SNIPPETS in the bellow)
- Snippets are displayed as a list in SNIPPETS
- Each snippet shows a (possibly shortened) preview of the snippet's content, in a smaller font, but otherwise rendered as usual.

### Interaction Model

- Users can drag snippets from SNIPPETS into the document. If they do drop them, they are inserted using the same logic as any text dragged into the document (it reuses the codemirror's drag and drop functionality). Even if that position is after the "# Boneyard" or "# Snippets". That way one can easily duplicate snippets.
- The original snippet remains in the `# Snippets` section (copy, not move operation)
- To edit a snippet, users just edit the relevant snippet in the document. Clicking on the snippet in the list scrolls to the snippet's location in the document.
- To create a snippet, users either directly edits the "# Snippets" section or press the snip button that appears when text is selected in the document. When they do that the text is moved into the snippets section.

## Extension of Existing Features

### Boneyard Integration

- The existing boneyard functionality (`# Boneyard`) continues to work as before
- The new `# Snippets` section makes use of that.
- Both boneyard and snippets content is hidden from the main script when boneyard hiding is enabled

### TOC View Enhancement

- The existing `TocView` class needs to be extended to handle the dual-pane layout
- Navigation functionality for the main TOC remains largely unchanged. Only difference is that everything starting with "# Snippets" is NOT included in the TOC.
- New navigation and management functionality needed for the snippets section

## Technical Considerations

FountainScript.structure has been changed to return a `ScriptStructure` object containing both the main script structure and the parsed snippets.

#### Type System Changes

To cleanly integrate snippets into the existing type system, we should introduce type aliases for clarity:

```typescript
interface Snippet {
  content: FountainElement[];
  pageBreak?: PageBreak;
}

type Snippets = Snippet[];

interface ScriptStructure {
    sections: StructureSection[];
    snippets: Snippets;
}
```

Happily the core parser remains unchanged. Only FountainScript.structure needs to
operate as is for everything up to "# Snippets" and then store everything afterwards
as separate snippets. To handle page breaks that separate snippets, each Snippet object
has an optional pageBreak field that contains the PageBreak element that followed the
snippet content (if any). The last snippet may not have a pageBreak. Empty snippets
(those ending with a page break but containing no content) are ignored and not added
to ScriptStructure.snippets.

Conversely when snippets are added by drag and drop from the main script into the
snippets section, the code automatically creates appropriate page breaks to separate
them from existing snippets.

Note that there is no need to every directly modify the FountainScript.structure class.
Instead after modifications the parser is called and then FountainScript.structure will
create a new instance of ScriptStructure.

### Snippet Display Design

#### Visual Layout

Each snippet in the SNIPPETS section should be displayed as a scaled-down preview:

- **Line limit**: Show a maximum of 4 lines per snippet to keep the list manageable
- **Scaling**: Use CSS transforms to scale down the entire snippet preview so full lines can be visible even in the narrow sidebar
- **Truncation**: If a snippet has more than 4 lines, show the first 4 lines with a visual indicator (e.g., "...") that more content exists
- **Formatting preservation**: Maintain fountain formatting (character names, dialogue indentation, etc.) in the scaled preview

#### Code Reuse Strategy

To maintain consistency and reduce code duplication, we should reuse the existing rendering logic from `reading_view.ts`:

2. **Scaling Implementation**:
   - Wrap the rendered snippet content in a container div with CSS scaling
   - Use CSS `zoom()` to shrink the content to fit the sidebar width
   - Set appropriate container dimensions to prevent overflow

3. **Preview Generation**:
   - Take the first 4 fountain elements from each snippet (note: this is ok for the initial Implementation, but a fountainelement can actually render as multiple lines)
   - Use the `renderElement` function to convert each element to HTML
   - Apply consistent styling and scaling across all snippet previews

#### CSS Scaling Approach

The scaling can be achieved with CSS transforms:

```css
.snippet-preview {
    transform: scale(0.6); /* Adjust scale factor as needed */
    transform-origin: top left;
    width: 166.67%; /* Compensate for scaling: 100% / 0.6 */
    margin-bottom: -40%; /* Adjust vertical spacing */
}
```

This approach allows us to:
- Reuse all existing fountain rendering logic
- Maintain perfect formatting fidelity in previews
- Easily adjust scale factor for different sidebar widths
- Keep snippet previews visually consistent with the main document
