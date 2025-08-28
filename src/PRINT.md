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
- [ ] Set up pdf-lib integration
- [ ] Implement basic page layout with correct margins
- [ ] Embed Courier font
- [ ] Create simple text rendering

#### Phase 2: Core Elements
- [ ] Implement scene headings
- [ ] Implement action blocks with proper wrapping
- [ ] Implement dialogue (character, parentheticals, speech)
- [ ] Implement transitions

#### Phase 3: Advanced Features
- [ ] Handle page breaks intelligently
- [ ] Implement proper spacing rules
- [ ] Add title page generation
- [ ] Handle notes/synopsis (if visible in settings)

#### Phase 4: Polish
- [ ] Optimize page break logic (avoid orphans/widows)
- [ ] Add page numbering
- [ ] Handle edge cases (very long dialogue, etc.)
- [ ] Performance optimization

## Technical Decisions & Rationales

### Font Handling
**Decision**: Embed Courier font directly in fontManager module
**Rationale**: Ensures consistent rendering across all platforms. Courier is essential for proper character counting.

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

## Key Constants
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
  isFirstPage: boolean;    // Whether this is the title page
  
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

## Open Questions & Decisions Needed

### Text Rendering Strategy
- **Option A**: Use pdf-lib's built-in text methods with custom positioning functions
- **Option B**: Draw each line individually with low-level drawing functions
- **Recommendation**: Option A for simplicity, fall back to B if needed

### State Management
- **Option A**: Pass page state as parameters between functions
- **Option B**: Use a shared state object/context
- **Recommendation**: Option A for better testability and functional purity

### Page Break Algorithm
- How aggressive should we be about keeping elements together?
- Should we allow single lines of action at bottom of pages?
- How do we handle very long dialogue blocks?

### Performance Considerations
- For large scripts (120+ pages), should we implement streaming/chunked processing?
- Memory usage with embedded fonts and large documents?

### Error Handling
- How do we handle malformed fountain elements?
- What if text doesn't fit even with maximum wrapping?
- Fallback strategies for edge cases?

## Testing Strategy

### Unit Tests
- Text formatting and wrapping functions in isolation
- Position calculation functions with various inputs
- Element rendering functions with mock PDF documents
- Page break logic functions

### Integration Tests  
- Full document generation from sample scripts
- Page break behavior across different element types
- Font embedding and text measurement accuracy

### Visual Regression Tests
- Compare generated PDFs against reference implementations
- Verify formatting matches industry standards
- Test with various script lengths and element combinations

## Success Metrics

1. **Formatting Accuracy**: Generated PDFs match industry standard formatting
2. **Performance**: Can generate 120-page script in <5 seconds
3. **Reliability**: Handles all fountain element types without errors
4. **Compatibility**: PDFs render consistently across viewers/platforms