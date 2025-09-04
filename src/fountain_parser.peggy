// Overview
// This is a parser for fountain.
// It largely tries to faithfully implement the spec.
// That said there are a few cases where it is on purpose more permissible
// than the spec.  In particular in some cases we want to recognize partial
// constructs, so that during interactive / incremental use, the right thing
// happens (TM).

{{
const fountain = require("./fountain");
const FountainScript = fountain.FountainScript;
const mergeText = fountain.mergeText;

}}

Script
 = title:TitlePage? script:Element* !. { return new FountainScript(input, title ? title : [], script); }

TitlePage
 = values:KeyValue+ "\n" { return values; }

KeyValue
 = key:Key ":" [ \t]* values:(@InlineValue / @MultiLineValues) { return { range: range(), key: key, values: values }; }

Key
 = [a-zA-Z0-9_][a-zA-Z0-9_ ]* { return text() }

InlineValue = value:Value "\n" { return [value] }

Value
 = value:StyledTextElement+ { return mergeText(value); }

MultiLineValues
 = "\n" values:(@MultiLineValue "\n")+ { return values; }

MultiLineValue
 = (" "|3..| / "\t") value:Value { return value; }

PageBreak
 = OptionalBlanks "="|3..| NewLineOrEndOfInput { return { range: range(), kind: 'page-break' } }

Element
 = Scene
 / PageBreak
 / Transition
 / Section
 / Synopsis
 / Dialogue
 / Action

LineTextElement
 = boneyard:Boneyard      { return boneyard; }
 / note:Note              { return note; }
 / text:StyledTextElement { return text; }

StyledTextElement
 = "**" elts:(!"**" @StyledTextElement)+ "**" { return { range: range(), kind: 'bold', elements:mergeText(elts) };}
 / "*" elts:(!"*" @StyledTextElement)+ "*" { return { range: range(), kind: 'italics', elements: mergeText(elts) };}
 / "_" elts:(!"_" @StyledTextElement)+ "_" { return { range: range(), kind: 'underline', elements: mergeText(elts) };}
 / (!"\n" .)  { return { range: range(), kind: 'text' };}

Line
 = elements:LineTextElement+ newline:("\n" / !.)
 { return { range:range(), centered: false, elements:mergeText(elements) } }

Lines
 = @lines:Line+ NewLineOrEndOfInput

EndOfCenteredLine
 = [ \t]* ("<" !. / "<\n")

ActionLine
 = [ \t]*  ">" [ \t]* elements:(!EndOfCenteredLine @LineTextElement)+ EndOfCenteredLine
   { return { range: range(), centered: true, elements:mergeText(elements) } }
 / ForcedActionLine
 / Line

ForcedActionLine
 = "!" line:Line  { line.range.start = line.range.start - 1; return line; }

ActionLines
 = @lines:ActionLine+ NewLineOrEndOfInput

Transition
 = OptionalBlanks (!("TO:\n"/"TO:" !.) [^\n] )* "TO:" BlankLineOrEndOfInput &{ const t = text(); return t.toUpperCase() === t; }
 { return { kind: 'transition', range: range(), forced: false }; }
 / ">" transition:([^\n]*) !{ return transition.join("").endsWith("<") } BlankLineOrEndOfInput
 { return { kind: 'transition', range: range(), forced: true }; }

Action
 = lines:ActionLines
   { return { kind: 'action', range: range(), lines:lines };
   }
 / newline:NewLine
   { return { kind: 'action', range:newline, lines: [{range:newline, centered: false, elements:[]}] } };

Note "note"
 = "[[" noteKind:NoteKind? noteText:NoteText "]]"?
 { return { range: range(), kind: 'note', noteKind:(noteKind ?? "").toLowerCase(), textRange:noteText  }; }

NoteText
 =  (!("]]"/"\n\n") .)* { return range(); }

NoteKind
 = "+"   { return "+"; }
 / "-"   { return "-"; }
 / kind:NoteKindName ":" " "* { return kind }

NoteKindName = [a-zA-Z0-9]+ { return text() }

Boneyard "boneyard"
 = OptionalBlanks "/*" (!"*/" .)* "*/"
 { return { range: range(), kind: 'boneyard' }; }

Section
 = OptionalBlanks hashes:Hashes RestOfLine NewLineOrEndOfInput
 { return { range: range(), depth:hashes, kind: 'section'} }

Hashes
 = "#"+ { return text().length }

Synopsis
 = lines:SynopsisLine+ NewLine? { return { range:range(), kind: 'synopsis', linesOfText:lines } }

SynopsisLine
 = OptionalBlanks "=" synopsis:RestOfLine NewLineOrEndOfInput { return synopsis; }

NewLine
 = "\n" { return range() }

NewLineOrEndOfInput
 = "\n"
 / !.

Dialogue
 = OptionalBlanks character:Character [ \t]* exts:CharacterExtensions "\n"
  parenthetical:(Parenthetical)?
  dialogue:Lines
 { return {
     range: range(),
     kind: 'dialogue',
     characterRange: character,
     characterExtensionsRange: exts,
     parenthetical: parenthetical,
     lines: dialogue
   }
 }

Parenthetical
 = OptionalBlanks "(" [^)\n]* ")" "\n" { return range() }

CharacterExtensions
 = ([ \t]* "(" [^)\n]* ")")*  { return range() }

Character
 = name:MaybeName &{ return name.toUpperCase() === name } { return range() }
 / "@" [^(\n]+        { return range() }

MaybeName
 = [^ >\t\n][^(\n]* { return text() }

BlankLineOrEndOfInput
 = !.
 / "\n" !.
 / "\n\n"

RestOfLine = [^\n]+ { return range() }

OptionalBlanks
 = [ \t]*

Scene
 = SceneStart RestOfLine BlankLineOrEndOfInput { return { kind: 'scene', range: range() }; }

SceneStart
 = OptionalBlanks ('.' &[a-zA-Z0-9]
 / ("INT./EXT"i
 / "INT/EXT"i
 / "EXT"i
 / "EST"i
 / "INT"i
 / "I/E"i ) (" " / "."))
