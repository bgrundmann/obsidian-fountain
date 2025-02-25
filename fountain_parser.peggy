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
const TitlePage = fountain.TitlePage;
const KeyValue = fountain.KeyValue;
const mergeText = fountain.mergeText;

}}

Script 
 = title:TitlePage? script:Element* !. { return new FountainScript(input, title, script); }

TitlePage 
 = @(KeyValue)+ "\n"
 
KeyValue
 = key:Key ":" " "* value:(@InlineValue / @MultiLineValues) { return new KeyValue(range(),  key, value); }

Key
 = [a-zA-Z0-9_][a-zA-Z0-9_ ]* { return text() }

InlineValue = value:Value "\n" { return [value] }

Value
 = [^\n]+ { return range(); } 

MultiLineValues
 = "\n" (@MultiLineValue "\n")+ 
 
MultiLineValue 
 = (" "|3..| / "\t") value:Value { return value }
 
Element
 = Scene
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
 = ">" [ \t]* elements:(!EndOfCenteredLine @LineTextElement)+ EndOfCenteredLine
   { return { range: range(), centered: true, elements:mergeText(elements) } }
 / Line

ActionLines
 = @lines:ActionLine+ NewLineOrEndOfInput

Transition
 = (!("TO:\n"/"TO:" !.) [^\n] )* "TO:" BlankLineOrEndOfInput &{ const t = text(); return t.toUpperCase() === t; }
 { return { kind: 'transition', range: range() }; }

Action
 = lines:ActionLines
   { return { kind: 'action', range: range(), lines:lines };
   }
 / newline:NewLine
   { return { kind: 'action', range:newline, lines: [{range:newline, centered: false, elements:[]}] } };

Note "note"
 = "[[" (!("]]"/"\n\n") .)* "]]"?
 { return { range: range(), kind: 'note' }; }
 
Boneyard "boneyard"
 = OptionalBlanks "/*" (!"*/" .)* "*/" 
 { return { range: range(), kind: 'boneyard' }; }
 
Section
 = OptionalBlanks hashes:Hashes RestOfLine NewLineOrEndOfInput
 { return { range: range(), depth:hashes, kind: 'section'} }

Hashes
 = "#"+ { return text().length }

Synopsis
 = OptionalBlanks "=" synopsis:RestOfLine NewLineOrEndOfInput { return { range:range(), synopsis:synopsis, kind: 'synopsis'} } 
 
NewLine
 = "\n" { return range() }

NewLineOrEndOfInput
 = "\n"
 / !.

Dialogue
 = OptionalBlanks character:Character exts:CharacterExtensions "\n" 
  parenthetical:(Parenthetical)? 
  dialogue:Lines 
 { return {
     range: range(),
     kind: 'dialogue',
     characterRange: { start:character.start, end: exts.end },
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
 = [^ \t\n][^(\n]* { return text() }

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
 
