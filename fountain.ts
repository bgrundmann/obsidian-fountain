export { FountainScript, TitlePage, KeyValue, TextElement, extract_as_html };
export type { Range, Synopsis, Action,Dialogue, Scene, Section, FountainElement };

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

type FountainElement = Synopsis | Action | Scene | Dialogue | Section | PageBreak;

function extract_as_html(document: string, r: Range, escapeSpace: boolean = false): string {
  let safe = 
    document
      .slice(r.start, r.end)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
  return escapeSpace
    ? safe.replace(/^( +)/gm, (_, spaces) => "&nbsp;".repeat(spaces.length))
    : safe;
}


type TextKind = 'text' | 'newline' | 'note' | 'boneyard' ;

class TextElement {
  range: Range;
  kind: TextKind;

  constructor(range: Range, kind: TextKind) {
    this.range = range;
    this.kind = kind;
  }

  to_html(document: string, escapeSpaces: boolean): string {
    switch (this.kind) {
      case 'text':
        return extract_as_html(document, this.range, true);
      case 'note':
        const n = extract_as_html(document, this.range);
        return `<span class="note">${n}</span>`;
      case 'newline':
        return '<br>';
      case 'boneyard':
        return '';
    }    
  }
}

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

  constructor(document: string, title: TitlePage|null, script: FountainElement[]) {
    this.document = document;
    this.title = title;
    // The way the parser works, text like this:
    // A action line
    // another action line
    // { a blank line }
    // { another blank line }
    //
    // Will produce 3 action elements, one containing the first text (with newline elements)
    // and another two containing just a single newline element each.
    // This merges all subsequent action elements into a single one.
    const merged = [];
    let prev:FountainElement|null = null;
    for (const el of script) {
      if (prev === null) {
        prev = el;
      } else {
        if (prev.kind === 'action' && el.kind === 'action') {
          prev = {
            kind: 'action',
            text: prev.text.concat(el.text),
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
}
