export { FountainScript, TitlePage, KeyValue, TextElement};
export type { Range, Synopsis, Transition, Action,Dialogue, Scene, Section, FountainElement };

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


type TextKind = 'text' | 'newline' | 'note' | 'boneyard' ;

class TextElement {
  range: Range;
  kind: TextKind;

  constructor(range: Range, kind: TextKind) {
    this.range = range;
    this.kind = kind;
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

  /// Extract a text element from the fountain document safe to be used as
  /// HTML source.
  text_element_to_html(el: TextElement, escapeLeadingSpaces: boolean): string {
    switch (el.kind) {
      case 'text':
        return this.extract_as_html(el.range, escapeLeadingSpaces);
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
              new TextElement(
                { start:prev.range.end-2, end: prev.range.end-1 },
              'newline')
            ,  new TextElement(
                { start:prev.range.end-1, end: prev.range.end },
              'newline')
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
