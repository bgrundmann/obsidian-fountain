// Overview
// This is a parser for fountain.
// It largely tries to faithfully implement the spec.
// That said there are a few cases where it is on purpose more permissible
// than the spec.  In particular in some cases we want to recognize partial
// constructs, so that during interactive / incremental use, the right thing
// happens (TM).

{{
const { FountainScript } = require("./script");
const { mergeText } = require("./utils");
const {
  mkAction, mkBoneyard, mkBold, mkCenteredLine, mkDialogue, mkDialogueLine,
  mkItalics, mkKeyValue, mkLine, mkLyrics, mkNote, mkPageBreak, mkParenthetical,
  mkRange, mkScene, mkSection, mkSynopsis, mkText, mkTransition, mkUnderline,
  shiftLineStart,
} = require("./ast");

}}

Script
 = title:TitlePage? script:Element* !. { return new FountainScript(input, title ? title : [], script); }

TitlePage
 = values:KeyValue+ "\n" { return values; }

KeyValue
 = key:Key ":" [ \t]* values:(@InlineValue / @MultiLineValues) { return mkKeyValue(range(), key, values); }

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
 = OptionalBlanks "="|3..| NewLineOrEndOfInput { return mkPageBreak(range()); }

Element
 = Scene
 / PageBreak
 / Transition
 / Section
 / Synopsis
 / Lyrics
 / Dialogue
 / Action

LineTextElement
 = boneyard:Boneyard      { return boneyard; }
 / note:Note              { return note; }
 / text:StyledTextElement { return text; }

StyledTextElement
 = "**" elts:(!"**" @StyledTextElement)+ "**" { return mkBold(range(), mergeText(elts)); }
 / "*" elts:(!"*" @StyledTextElement)+ "*" { return mkItalics(range(), mergeText(elts)); }
 / "_" elts:(!"_" @StyledTextElement)+ "_" { return mkUnderline(range(), mergeText(elts)); }
 / (!"\n" .)  { return mkText(range()); }

Line
 = elements:LineTextElement+ newline:("\n" / !.)
 { return mkLine(range(), mergeText(elements)); }



DialogueLine
 = !PageBreakPattern @Line

DialogueContentItem
 = p:Parenthetical { return mkParenthetical(p); }
 / l:DialogueLine { return mkDialogueLine(l); }

DialogueContent
 = @items:DialogueContentItem+ DialogueTerminator

DialogueTerminator
 = &PageBreakPattern
 / NewLineOrEndOfInput

EndOfCenteredLine
 = [ \t]* ("<" !. / "<\n")

ActionLine
 = [ \t]*  ">" [ \t]* elements:(!EndOfCenteredLine @LineTextElement)+ EndOfCenteredLine
   { return mkCenteredLine(range(), mergeText(elements)); }
 / ForcedActionLine
 / !PageBreakPattern @Line

PageBreakPattern
 = OptionalBlanks "="|3..|

ForcedActionLine
 = "!" line:Line  { return shiftLineStart(line, -1); }

ActionLines
 = @lines:ActionLine+ ActionTerminator

ActionTerminator
 = &PageBreakPattern
 / NewLineOrEndOfInput

Transition
 = ">" transition:([^\n]*) !{ return transition.join("").endsWith("<") } BlankLineOrEndOfInput
 { return mkTransition(range(), true); }
 / OptionalBlanks (!("TO:\n"/"TO:" !.) [^\n] )* "TO:" BlankLineOrEndOfInput &{ const t = text(); return t.toUpperCase() === t; }
 { return mkTransition(range(), false); }

Action
 = lines:ActionLines
   { return mkAction(range(), lines); }
 / newline:NewLine
   { return mkAction(newline, [mkLine(newline, [])]); }

Note "note"
 = "[[" noteKind:NoteKind? noteText:NoteText "]]"?
 { return mkNote(range(), noteKind, noteText); }

NoteText
 =  (!("]]"/"\n\n") .)* { return range(); }

NoteKind
 = "+"   { return "+"; }
 / "-"   { return "-"; }
 / "@" marker:MarkerWord { return "@" + marker; }
 / kind:NoteKindName ":" " "* { return kind }

NoteKindName = [a-zA-Z0-9]+ { return text() }

MarkerWord = [a-zA-Z0-9_]* { return text() }

Boneyard "boneyard"
 = OptionalBlanks "/*" (!"*/" .)* "*/"
 { return mkBoneyard(range()); }

Section
 = OptionalBlanks hashes:Hashes RestOfLine NewLineOrEndOfInput
 { return mkSection(range(), hashes); }

Hashes
 = "#"+ { return text().length }

Synopsis
 = lines:SynopsisLine+ NewLine? { return mkSynopsis(range(), lines); }

SynopsisLine
 = OptionalBlanks "=" synopsis:RestOfLine NewLineOrEndOfInput { return synopsis; }

NewLine
 = "\n" { return range() }

NewLineOrEndOfInput
 = "\n"
 / !.

Dialogue
 = OptionalBlanks character:Character [ \t]* exts:CharacterExtensions "\n"
  content:DialogueContent
 { return mkDialogue(range(), character, exts, content); }

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

Lyrics
 = lines:LyricsLine+
 { return mkLyrics(range(), lines); }

LyricsLine
 = "~" elements:LineTextElement* newline:("\n" / !.)
 { return mkLine(range(), mergeText(elements)); }


Scene
 = OptionalBlanks headingStart:SceneStart result:SceneHeadingAndNumber BlankLineOrEndOfInput {
   return mkScene(range(), headingStart.text + result.heading, headingStart.forced, result.number);
 }

SceneHeadingAndNumber
 = heading:SceneHeadingWithoutNumber sceneNumber:SceneNumber {
   return {
     heading: heading.trimEnd(),
     number: sceneNumber
   };
 }
 / heading:SceneHeadingPlain {
   return {
     heading: heading,
     number: null
   };
 }

SceneHeadingWithoutNumber
 = chars:(!SceneNumber [^\n])+ {
   return chars.map(c => c[1]).join('');
 }

SceneHeadingPlain
 = chars:[^\n]* {
   return chars.join('');
 }

SceneNumber
 = [ \t]* number:SceneNumberPrime [ \t]* &("\n" / !.) {
   return number;
 }

SceneNumberPrime
 = "#" [a-zA-Z0-9\-\.]+ "#" {
   return mkRange(location());
 }

SceneStart
 = ('.' &[a-zA-Z0-9] { return { text: '', forced: true }; }
 / prefix:("INT./EXT"i / "INT/EXT"i / "EXT"i / "EST"i / "INT"i / "I/E"i) separator:(" " / ".") { return { text: prefix + separator, forced: false }; })
