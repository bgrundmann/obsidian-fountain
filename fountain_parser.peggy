// Overview
// This is a parser for fountain.
// It largely tries to faithfully implement the spec.
// That said there are a few cases where it is on purpose more permissible
// than the spec.  In particular in some cases we want to recognize partial
// constructs, so that during interactive / incremental use, the right thing
// happens (TM).

{{
import { FountainScript, TitlePage, KeyValue, TextElement } from './fountain.ts';
}}

Script 
 = title:TitlePage? script:Element* { return new FountainScript(input, title, script); }

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
 / Dialogue
 / Section
 / Synopsis
 / Action

TextBlock
 = elements:(!"\n\n" @TextElement)+  BlankLineOrEndOfInput { return elements; }

TextElement
 = Boneyard                 
 / Note                     
 / (!("/*"/"\n"/"[[") .) +  { return new TextElement(range(), 'text'); }
 / "\n"                     { return new TextElement(range(), 'newline'); } 

Action 
 = text:(!"\n" @TextElement)+ { return { kind: 'action', range: range(), text: text }; }
 / "\n"                       { return { kind: 'action', range: range(), text: [new TextElement(range(), 'newline')]}; } 

Note 
 = "[[" (!("]]"/"\n\n") .)* "]]"?
 { return new TextElement(range(), 'note'); }
 
Boneyard 
 = OptionalBlanks "/*" (!"*/" .)* "*/" 
 { return new TextElement(range(), 'boneyard'); }
 
Section
 = OptionalBlanks hashes:Hashes RestOfLine NewLineOrEndOfInput
 { return { range: range(), depth:hashes, kind: 'section'} }

Hashes
 = "#"+ { return text().length }

Synopsis
 = OptionalBlanks "=" synopsis:RestOfLine NewLineOrEndOfInput { return { range:range(), synopsis:synopsis, kind: 'synopsis'} } 
 
NewLineOrEndOfInput
 = "\n"
 / !.
 
Dialogue
 = OptionalBlanks character:Character exts:CharacterExtensions "\n" 
  parenthetical:(Parenthetical)? 
  dialogue:TextBlock 
 { return {
     range: range(),
     kind: 'dialogue',
     characterRange: { start:character.start, end: exts.end },
     parenthetical: parenthetical,
     text: dialogue
   }
 }

Parenthetical
 = OptionalBlanks "(" [^)\n]* ")" "\n" { return range() }

CharacterExtensions
 = ([ \t]* "(" [^)\n]* ")")*  { return range() }
 
Character
 = [A-Z0-9][A-Z0-9 ]* { return range() }
 / "@" [^(\n]+        { return range() }

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
 = OptionalBlanks ('.' 
 / ("INT./EXT"i
 / "INT/EXT"i
 / "EXT"i
 / "EST"i
 / "INT"i
 / "I/E"i ) (" " / "."))
 
