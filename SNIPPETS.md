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

- Users can drag snippets from SNIPPETS into the document. If they do drop them, they are inserted at the cursor position. Even if that position is after the "# Boneyard" or "# Snippets". That way one can easily duplicate snippets.
- The original snippet remains in the `# Snippets` section (copy, not move operation)
- To edit a snippet, users just edit the relevant snippet in the document. Clicking on the snippet in the list scrolls to the snippet's location in the document.
- To create a snippet, users either directly edit the "# Snippets" section or drag and drop selected text into SNIPPETS.

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

### Parser Integration

- The existing fountain parser needs to recognize the `# Snippets` section
- Page break parsing within the snippets section needs special handling
- Snippets need to be parsed as individual units separated by page breaks
