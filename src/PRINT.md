# PDF Creation Implementation Plan

## Overview

Create PDFs from Fountain scripts using pdf-lib (https://pdf-lib.js.org/). The implementation will walk the AST (as defined in fountain.ts) and generate properly formatted screenplay PDFs.

## Screenplay Formatting Standards

Screenplay formatting follows established industry standards dating back to typewriter era. Based on the Movie Making Manual (https://en.wikibooks.org/wiki/Movie_Making_Manual/Writing/Screenplay_Format):

### Page Layout
- **Page size**: 8.5" x 11" (US Letter)
- **Font**: Courier 12pt (monospace required for proper character counting)
- **Line spacing**: Single-spaced with double spacing between elements
- **Page margins**: 1" top/bottom, 1.25" left, 1" right
- **Characters per line**: ~60 (with proper margins)
- **Lines per page**: ~55-57 (accounting for headers/footers)

### Element Positioning (from left margin)
- **Scene Number**: 1.25" (13 spaces)
- **Scene Heading**: 1.75" (19 spaces)
- **Action**: 1.75" (19 spaces), max 55 chars per line
- **Character Name**: Centered (~4.25", 43 spaces)
- **Dialogue**: 2.75" (29 spaces), max 35 chars per line
- **Parenthetical**: 3.5" (36 spaces), max 16 chars per line
- **Transition**: Right-aligned to 7.25" margin

### Page Headers/Footers
- **Header**: Title (left), page number (right) - skip on first page
- **Footer**: Optional contact info on title page only

## Title Page Generation

The title page is the first page of a screenplay and contains metadata about the script. It follows a specific layout format that differs from the main script pages.

### Title Page Format Standards

Based on fountain.io specifications, the title page uses a key-value format where:
- Keys can contain spaces but must end with a colon
- Values can be inline or indented on newlines below the key
- Indentation is 3+ spaces or a tab for multi-line values
- An implicit page break follows the title page

### Key Positioning Rules

**Centered Elements** (horizontally centered on page):
- `Title:` - Main title of the screenplay
- `Credit:` - Credit line (e.g., "Written by")
- `Author:` or `Authors:` - Writer name(s)
- `Source:` - Source attribution (e.g., "Story by...")

**Lower Left Elements** (positioned at bottom left):
- `Contact:` - Contact information (address, phone, email)
- `Draft date:` - Date of the current draft

**Ignored Keys**:
- Any key not listed above should be completely ignored

### Title Page Layout Specifications

**Page Layout**:
- Same page size and margins as script pages
- Font: Courier 12pt
- Line spacing: Single-spaced within blocks, double between blocks

**Vertical Positioning**:
- Centered elements: Start at ~40% down from top of page
- Lower left elements: Start at ~80% down from top of page
- Adequate spacing between different key groups

**Text Formatting**:
- Key names: Regular font weight
- Values: Support styled text (bold, italic, underline)

### Implementation Strategy

**Metadata Extraction**:
1. The existing parser handles the metadata extraction including multi-line values. We only need to identify which keys belong to centered vs. lower-left positioning. And which keys we should completely ignore.

**Rendering Process**:
1. Check if title page data exists in fountain script
2. Create dedicated title page as first page
3. Render centered elements first (title, credit, author, source)
4. Render lower-left elements (contact, draft date, custom keys)
5. Apply proper vertical spacing between element groups

**Positioning Algorithm**:
- Calculate total height needed for centered elements
- Start centered elements at (PAGE_HEIGHT * 0.4) - (totalHeight / 2)
- Position lower-left elements starting at PAGE_HEIGHT * 0.8
- Use proper line spacing between different key groups

## Technical Implementation Plan

### Core Architecture
```
FountainToPDF
├── generatePDF() (main orchestrator function)
├── pageLayout module (positioning/spacing utilities)
├── elementRenderers module (functions for each fountain element type)
├── textFormatter module (line breaks, character limits utilities)
└── fontManager module (font embedding utilities)
```

### Key Components

#### 1. generatePDF() Function
- Main entry point: `generatePDF(fountainScript: FountainScript): PDFDocument`
- Manages page creation and overall document structure
- Handles title page generation from fountain metadata
- Coordinates between other modules

#### 2. pageLayout Module
- `calculatePosition(elementType, pageState): Point` - calculates element positions in PDF coordinates
- `checkPageBreak(elementHeight, pageState): boolean` - determines if page break needed
- `createNewPage(doc, pageState): PageState` - creates new page and returns updated state
- `updateVerticalPosition(pageState, elementHeight): PageState` - tracks position

#### 3. elementRenderers Module
- `renderScene(doc, pageState, scene): PageState` - renders scene headings
- `renderAction(doc, pageState, action): PageState` - renders action blocks
- `renderDialogue(doc, pageState, dialogue): PageState` - renders dialogue elements
- `renderTransition(doc, pageState, transition): PageState` - renders transitions
- Each function handles element-specific formatting and returns updated state

#### 4. textFormatter Module
- `wrapText(text, maxChars): string[]` - handles text wrapping within character limits
- `formatStyledText(styledText): FormattedText` - manages bold/italic/underline formatting
- `escapeSpecialChars(text): string` - handles special characters
- `calculateTextHeight(lines): number` - calculates rendered text height

### Implementation Phases

#### Phase 1: Basic Structure
- [X] Set up pdf-lib integration
- [X] Implement basic page layout with correct margins
- [X] Embed Courier font
- [X] Create simple text rendering (e.g. just a hello world pdf).

#### Phase 1.5: Integration with obsidian
- [X] Add a command to generate a PDF from the current document. Generated pdf should be saved to the vault, next to the original file.

#### Phase 2: Core Elements
- [X] Implement scene headings
- [X] Implement action blocks with proper wrapping
- [X] Visual formatting for action blocks (bold, italic, underline)
- [X] Implement dialogue (character, parentheticals, speech)
- [X] Implement transitions

#### Phase 3: Advanced Features
- [ ] Add title page generation (see Title Page Generation section above)
- [ ] Handle page breaks intelligently
- [ ] Implement proper spacing rules
- [ ] Handle notes/synopsis (if visible in settings)

#### Phase 4: Polish
- [ ] Optimize page break logic (avoid orphans/widows)
- [ ] Add page numbering
- [ ] Handle edge cases (very long dialogue, etc.)
- [ ] Performance optimization

## Technical Decisions & Rationales

### Font Handling
**Decision**: Embed Courier font family (regular, bold, oblique, bold-oblique) directly
**Rationale**: Ensures consistent rendering across all platforms. Courier is essential for proper character counting. Font variants enable proper visual formatting for styled text.

### Visual Formatting Implementation
**Decision**: Use PDF font variants for bold/italic, drawn lines for underlines
**Rationale**:
- PDF-lib's StandardFonts provides CourierBold and CourierOblique variants
- Underlines drawn as lines positioned below text baseline
- Font selection function chooses appropriate variant based on styling flags
- Maintains proper character spacing and line positioning

### Text Layout Strategy
**Decision**: Implement custom text wrapping functions in textFormatter module
**Rationale**: PDF-lib's built-in text layout doesn't handle screenplay-specific rules (character limits, element spacing). Custom functions give us precise control.

### Coordinate System
**Decision**: Work in PDF points (1/72 inch) throughout all functions
**Rationale**: Avoids conversion errors. All measurements converted once at the constants level.

### Page Break Logic
**Decision**: Implement look-ahead functions for intelligent page breaks
**Rationale**: Prevents orphaned dialogue, keeps character names with their dialogue, maintains proper element grouping.

### Function vs Class Design
**Decision**: Use functions and modules instead of classes
**Rationale**: Most operations are stateless transformations. Page state can be passed as parameters. Simpler testing and composition.

### Key Constants
```typescript
const FONT_SIZE = 12;
const LINE_HEIGHT = 12; // Single spacing
const CHARS_PER_INCH = 10; // Courier 12pt
const PAGE_WIDTH = 612; // 8.5" in points
const PAGE_HEIGHT = 792; // 11" in points

// Margins in points
const MARGIN_TOP = 72;    // 1"
const MARGIN_BOTTOM = 72; // 1"
const MARGIN_LEFT = 90;   // 1.25"
const MARGIN_RIGHT = 72;  // 1"

// Element positions (from left edge)
const SCENE_NUMBER_INDENT = 90;   // 1.25"
const SCENE_HEADING_INDENT = 126; // 1.75"
const ACTION_INDENT = 126;        // 1.75"
const CHARACTER_INDENT = 306;     // ~4.25" (centered)
const DIALOGUE_INDENT = 198;      // 2.75"
const PARENTHETICAL_INDENT = 252; // 3.5"
const TRANSITION_RIGHT_MARGIN = 522; // 7.25" (right-aligned)

// Title page positioning
const TITLE_PAGE_CENTER_START = 316.8; // ~40% down from top (PAGE_HEIGHT * 0.4)
const TITLE_PAGE_LOWER_LEFT_START = 633.6; // ~80% down from top (PAGE_HEIGHT * 0.8)
const TITLE_PAGE_CENTER_X = 306; // Page center (PAGE_WIDTH / 2)
```

## Core Types

### PageState Type
```typescript
type PageState = {
  // Vertical position tracking
  currentY: number;        // Current vertical position (points from top)
  remainingHeight: number; // Remaining usable height on current page

  // Page information
  pageNumber: number;      // Current page number (1-based)
  isTitlePage: boolean;    // Whether this is the title page

  // Layout constraints
  margins: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };

  // Text formatting state
  fontSize: number;        // Current font size
  lineHeight: number;      // Current line height
  font: PDFFont;          // Embedded Courier font

  // Element spacing
  lastElementType: string | null; // Type of previous element for spacing rules
  pendingSpacing: number;         // Additional spacing needed before next element
};
```

**Note**: PDFDocument is passed separately to render functions. Functions get the current page via `doc.getPages()[doc.getPageCount() - 1]` or create new pages as needed.

### Text Rendering Strategy
- Use pdf-lib's built-in text methods with custom positioning functions

### State Management
- Pass page state as parameters between functions

### Page Break Algorithm
- How aggressive should we be about keeping elements together?
  Let's start with the simplest possible algorithm.
- Should we allow single lines of action at bottom of pages?
  Yes (again simplest possible algorithm -- user can always add explicit page breaks).
- How do we handle very long dialogue blocks?
  In the first pass, let's just fail and log an error.

### Performance Considerations
- For large scripts (120+ pages), should we implement streaming/chunked processing?
  No.
- Memory usage with embedded fonts and large documents?
  Not a problem, courier is a default font.

### Error Handling
- What if text doesn't fit even with maximum wrapping?
  Let's just break the line at the maximum width, when that happens, if necessary, repeat the process until the text fits.

## Testing Strategy

### Unit Tests
- Text formatting and wrapping functions in isolation
- Position calculation functions with various inputs
- Element rendering functions with mock PDF documents
- Page break logic functions

### Integration Tests (by user)
- Full document generation from sample scripts
- Page break behavior across different element types
- Font embedding and text measurement accuracy

### Visual Regression Tests (by user)
- Compare generated PDFs against reference implementations
- Verify formatting matches industry standards
- Test with various script lengths and element combinations

### What NOT to DO
 - Do NOT generate test scripts to verify that PDF generation works programmatically.
 - The user will verify after a local deploy that pdf generation can be triggered
   in the test-vault and that the generated pdfs are correct. The user will tell
   you if they are not.
 - Do NOT run npm run dev. Use npm run build to build the project.

## Success Metrics

1. **Formatting Accuracy**: Generated PDFs match industry standard formatting
2. **Performance**: Can generate 120-page script in <5 seconds
3. **Reliability**: Handles all fountain element types without errors
4. **Compatibility**: PDFs render consistently across viewers/platforms
