export { FountainScript, TitlePage, KeyValue, mergeText };
export type { Range, Synopsis, Transition, TextElement, Action,Dialogue, Scene, Section, FountainElement };

interface Range {
  start: number;
  end: number;
}

// In all the fountain element AST types, range is always
// the range of the complete element (so if you wanted to
// remove the complete element deleting all text of that
// range would work).
type PageBreak = {
  kind: 'page-break';
  range: Range;
}

type Synopsis = {
  kind: 'synopsis';
  range: Range;
  synopsis: Range;
}

type Action = {
  kind: 'action';
  range: Range;
  text: TextElement[];
}

type Scene = {
  kind: 'scene';
  range: Range;
}

type Transition = {
  kind: 'transition',
  range: Range;
}

type Dialogue = {
  kind: 'dialogue';
  range: Range;   /// range of everything
  characterRange: Range; /// range of the character line incl extensions excl whitespace at the beginning.
  parenthetical: Range|null;
  text: TextElement[];
}

type Section = {
  kind: 'section';
  range: Range;
  depth: number;
}

type FountainElement = Synopsis | Transition | Action | Scene | Dialogue | Section | PageBreak;


type OtherTextElement = {
  range: Range;
  kind: 'newline' | 'note' | 'boneyard';
}

/// The type of a piece of text. Text never contains any newlines!
type BasicTextElement = {
  range: Range;
  kind: 'text';
}

type StyledTextElement = {
  range: Range;
  kind: 'bold' | 'italics' | 'underline';
  elements: (BasicTextElement | StyledTextElement)[];
}

/// This merges consecutive basic text elements into one
function mergeText(elts: (BasicTextElement | StyledTextElement)[]): (BasicTextElement|StyledTextElement)[] {
  let res: (BasicTextElement|StyledTextElement)[] = [];
  if (elts.length === 0) return [];
 
  let prev = elts[0];
  for (let i=1; i<elts.length;i++) {
    let n = elts[i];
    if (n.kind === 'text' && prev.kind === 'text'){
      prev = { kind: 'text', range: { start: prev.range.start, end: n.range.end } };
    } else {
      res.push(prev);
      prev = n;
    }
  }
  res.push(prev);
  return res;
}

type TextElement = BasicTextElement | StyledTextElement | OtherTextElement;

class TitlePage {
  data: KeyValue[];

  constructor(values: KeyValue[]) {
    this.data = values;
  }
}

class KeyValue {
  key: string;
  values: Range[];
  range: Range;

  constructor(range: Range, key: string, values: Range[]) {
    this.range = range;
    this.key = key;
    this.values = values;
  }
}

class FountainScript {
  title: TitlePage|null;
  script: FountainElement[];
  document: string;

  /// Extract some text from the fountain document safe to be used
  /// as HTML source.
  extract_as_html(r: Range, escapeLeadingSpaces:boolean = false): string {
    let safe = 
      this.document
        .slice(r.start, r.end)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#039;");
    return escapeLeadingSpaces
      ? safe.replace(/^( +)/gm, (_, spaces) => "&nbsp;".repeat(spaces.length))
      : safe;
  }

  
  styled_text_to_html(el: StyledTextElement): string {
    const inner = el.elements.map((e) => this.text_element_to_html(e, false)).join("");
    switch (el.kind) {
      case 'bold':
        return `<b>${inner}</b>`;
      case 'italics':
        return `<i>${inner}</i>`;
      case 'underline':
        return `<u>${inner}</u>`;
    }
  }

  /// Extract a text element from the fountain document safe to be used as
  /// HTML source.
  text_element_to_html(el: TextElement, escapeLeadingSpaces: boolean): string {
    switch (el.kind) {
      case 'text':
        return this.extract_as_html(el.range, escapeLeadingSpaces);
      case 'bold':
      case 'italics':
      case 'underline':
        return this.styled_text_to_html(el);
      case 'note':
        const n = this.extract_as_html(el.range);
        return `<span class="note">${n}</span>`;
      case 'newline':
        return '<br>';
      case 'boneyard':
        return '';
    }    
  }

  constructor(document: string, title: TitlePage|null, script: FountainElement[]) {
    this.document = document;
    this.title = title;
    // The way the parser works, blank lines can cause separate action elements
    // (as opposed to a single action element containing all the newlines).
    //
    // This merges all subsequent action elements into a single one.
    this.script = script;
    const merged = [];
    let prev:FountainElement|null = null;
    for (const el of script) {
      if (prev === null) {
        prev = el;
      } else {
        if (prev.kind === 'action' && el.kind === 'action') {
          let extra_newlines: TextElement[] = []
          if (prev.text.length > 0 && prev.text[prev.text.length - 1].kind != 'newline') {
            // Previous action does not end in a newline
            // So this must be where the parser separated two actions
            // which only happens at blank lines.
            // So insert a blank line (two newlines).
            extra_newlines = [
                { range: { start:prev.range.end-2, end: prev.range.end-1 },
                  kind: 'newline'
                },
                { range: { start:prev.range.end-1, end: prev.range.end },
                  kind:  'newline'
                }
            ]
          }
          prev = {
            kind: 'action',
            text: prev.text.concat(extra_newlines, el.text),
            range: { start: prev.range.start, end: el.range.end }
          };
        } else {
          merged.push(prev);
          prev = el;
        }
      }
    }
    if (prev !== null) merged.push(prev);
    this.script = merged;
  }

  with_source(): (FountainElement & { source: string })[] {
    return this.script.map((elt) => {
      return { ...elt, source : this.document.slice(elt.range.start, elt.range.end) };
    });
  }
}
