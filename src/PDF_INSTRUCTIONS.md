# PDF Generation Strategy

To ease testing and debugging, we will split the PDF generation strategy into two distinct phases:
1. **Instruction Generation**: Convert screenplay elements to rendering instructions
2. **PDF Generation**: Execute instructions to produce the final PDF

This separation enables unit testing of layout logic without generating actual PDFs during development.

## Instruction Types

```typescript
type Instruction =
  | NewPageInstruction
  | TextInstruction

interface NewPageInstruction {
  type: "new-page";
  width: number;   // Page width in points
  height: number;  // Page height in points
}

interface TextInstruction {
  type: "text";
  data: string;
  x: number;       // X coordinate in points from left edge
  y: number;       // Y coordinate in points from bottom edge
  bold: boolean;
  italic: boolean;
  underline: boolean;
}

```

## Coordinate System

- **Origin**: Bottom-left corner of the page (PDF standard)
- **Units**: Points (1 point = 1/72 inch)
- **X-axis**: Increases from left to right
- **Y-axis**: Increases from bottom to top

## Standard Page Dimensions

- **US Letter**: 612 × 792 points (8.5" × 11")
- **A4**: 595 × 842 points (210mm × 297mm)

## Font Specifications

We will continue to use only the standard PDF font: Courier.

## Implementation Plan

### Phase 1: Instruction Generation
Convert existing render functions in `pdf_generator.ts` to append instructions to a passed
in instruction buffer (Instruction[]) instead of directly manipulating PDF:

```typescript
// Before
async function renderScene(doc: PDFDocument, pageState: PageState, scene: Scene, fountain: FountainScript): Promise<PageState>

// After
function generateScene(pageState: PageState, instructions: Instruction[], scene: Scene, fountain: FountainScript): PageState
```

### Phase 2: PDF Renderer
Create new function that executes instructions:

```typescript
function renderInstructionsToPDF(instructions: Instruction[]): PDFDocument
```

### Phase 3: Integration
Update main generation flow:

```typescript
function generatePDF(script: FountainScript): PDFDocument {
  const instructions = generateInstructions(script);
  return renderInstructionsToPDF(instructions);
}
```

## Benefits

1. **Testability**: Unit test layout logic by comparing instruction arrays
2. **Debugging**: Inspect generated instructions before PDF creation
3. **Performance**: Skip PDF generation during layout development
4. **Flexibility**: Easy to add new instruction types for enhanced formatting
5. **Separation of Concerns**: Layout logic separate from PDF library specifics

## Testing Strategy

```typescript
// Example test
test('scene heading generates correct instructions', () => {
  const instructions = generateSceneHeading('INT. OFFICE - DAY', 100);
  expect(instructions).toEqual([
    {
      type: 'text',
      data: 'INT. OFFICE - DAY',
      x: 72,
      y: 100,
      bold: true,
      italic: false,
      underline: false
    }
  ]);
});
```
