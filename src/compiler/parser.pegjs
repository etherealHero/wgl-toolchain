{
  function passExpression(type, text, location) {
    return { type, text, location };
  }
  // region is multiline expression e.g., kinds as /*...*/ or `...` or #text...#endtext
  function passRegionExpression(kind, text, location, regionList) {
    return { type: 'region', text, location, kind, body: flatRegionList(regionList) };
  }
  function passRegionLine(text, location) {
    return { type: 'regionLine', text, location };
  }
  // is import module expression e.g., kinds as #include <foo.js> or import "bar.js";
  function passModuleResolutionExpression(kind, text, location, href) {
    return { type: 'moduleResolution', text, location, kind, href };
  }

  // List Utils
  function buildList(head, tail, index) {
    return [head].concat(tail.map(function(element) { return element[index] }));
  }
  function flatRegionList(arr) {
    return arr.flat().map(function(l, i, list) {
      if (i == 0 || i == list.length - 1 || i == list.length - 2) return l
      return { ...l, text: l.text + '\n' }
    });
  }
}

start 
  = items:(ImportStatement / IncludeStatement / SourceCode)+ 
  / "" // empty file

ImportStatement
  = (!EOL Spaces)* "import" (!EOL Spaces)* href:ImportFilePathLiteral (!EOL Spaces)* ";"?
    { return passModuleResolutionExpression("ECMAScript", text(), location(), href) }
ImportFilePathLiteral
  = '"' chars:([^"\r\n] / "\\" .)* '"' { return chars.join(''); }
  / "'" chars:([^'\r\n] / "\\" .)* "'" { return chars.join(''); }
IncludeStatement
  = (!EOL Spaces)* "#include" (!EOL Spaces)* href:IncludeFilePathLiteral (!EOL Spaces)*
    { return passModuleResolutionExpression("WGLScript", text(), location(), href) }
IncludeFilePathLiteral = "<" chars:([^>\r\n] / "\\" .)* ">" { return chars.join(''); }

// Source Code
SourceCode
  = BreakLine / Regions / Comment / StringLit / StatementLine
StatementLine
  = c:(!EOL !Comment !SComment !StringLit .)+ { return passExpression("statement", text(), location()) }
BreakLine
  = c:(EOL) { return passExpression("breakLine", text(), location()) }

// Comments: // <content> or /* <content> */
Comment
  = t:("//" (!EOL .)*) { return passExpression("singleLineComment", text(), location()) }
  / t:(SComment CommentLines EComment)
    { return passRegionExpression("multiLineComment", text(), location(), t) }     
CommentLines = head:CommentLine tail:(EOL CommentLine)* { return buildList(head, tail, 1); }
CommentLine = (!"*/" !EOL .)* { return passRegionLine(text(), location()) }
SComment = "/*" { return passRegionLine(text(), location()) }
EComment = "*/" { return passRegionLine(text(), location()) }

StringLit = StringLitSingleQ / StringLitDoubleQ / BackticksStringLit / RegExp

StringLitSingleQ
  = t:(SEStringLitSingleQ StringLitSingleQLine SEStringLitSingleQ)
    { return passRegionExpression("stringLitSingleQ", text(), location(), t) }
StringLitSingleQLine
  = (!SEStringLitSingleQ DoubleEscaped / (!SEStringLitSingleQ EscapedSingleQ / !SEStringLitSingleQ !EOL .))* 
    { return passRegionLine(text(), location()) }
EscapedSingleQ = "\\" !"\\" "'"
SEStringLitSingleQ = !"\\'" "'" { return passRegionLine(text(), location()) } // start-end string literal

StringLitDoubleQ
  = t:(SEStringLitDoubleQ StringLitDoubleQLine SEStringLitDoubleQ)
    { return passRegionExpression("stringLitDoubleQ", text(), location(), t) }
StringLitDoubleQLine
  = (!SEStringLitDoubleQ DoubleEscaped / (!SEStringLitDoubleQ EscapedDoubleQ / !SEStringLitDoubleQ !EOL .))* 
    { return passRegionLine(text(), location()) }
EscapedDoubleQ = "\\" !"\\" "\""
SEStringLitDoubleQ = !"\\\"" "\"" { return passRegionLine(text(), location()) }

RegExp
  = t:(SERegExp RegExpLine SERegExp)
    { return passRegionExpression("regExp", text(), location(), t) }
RegExpLine
  = (!SERegExp DoubleEscaped / (!SERegExp EscapedSlash / !SERegExp !EOL .))* 
    { return passRegionLine(text(), location()) }
EscapedSlash = "\\" !"\\" "/"
SERegExp = !"\\/" !"/*" "/" { return passRegionLine(text(), location()) }

// Backticks: `<content>`
BackticksStringLit
  = t:(SEBackticksStringLit BackticksStringLitLines SEBackticksStringLit)
    { return passRegionExpression("backticksStringLit", text(), location(), t) }
BackticksStringLitLines
  = head:BackticksStringLitLine tail:(EOL BackticksStringLitLine)* { return buildList(head, tail, 1); }
BackticksStringLitLine
  = (!SEBackticksStringLit DoubleEscaped / (!SEBackticksStringLit EscapedBacktick / !SEBackticksStringLit !EOL .))* 
    { return passRegionLine(text(), location()) }
EscapedBacktick = "\\" !"\\" "`"
SEBackticksStringLit = !"\\`" "`" { return passRegionLine(text(), location()) }

// Regions: #text...#endtext etc.
Regions = RText / RSql

RText
  = t:(SRText RTextLines ERText)
    { return passRegionExpression("text", text(), location(), t) }     
RTextLines = head:RTextLine tail:(EOL RTextLine)* { return buildList(head, tail, 1); }
RTextLine = (!ERText !EOL .)* { return passRegionLine(text(), location()) }
SRText = (Spaces !EOL)* "#text" EOL { return passRegionLine(text(), location()) }
ERText = (Spaces !EOL)* "#endtext" { return passRegionLine(text(), location()) }

RSql
  = t:(SRSql RSqlLines ERSql)
    { return passRegionExpression("sql", text(), location(), t) }     
RSqlLines = head:RSqlLine tail:(EOL RSqlLine)* { return buildList(head, tail, 1); }
RSqlLine = (!ERSql !EOL .)* { return passRegionLine(text(), location()) }
SRSql = (Spaces !EOL)* "#sql" EOL { return passRegionLine(text(), location()) }
ERSql = (Spaces !EOL)* "#endsql" { return passRegionLine(text(), location()) }

// Symbols
DoubleEscaped = "\\" "\\"
EOL "line break"
  = "\n" / "\r\n" / "\r" / "\u2028" / "\u2029"
Spaces = [ \t\r\n\f]+
