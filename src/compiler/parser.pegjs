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

start = items:(ImportStatement / IncludeStatement / SourceCode)+

ImportStatement
  = "import" (!EOL Spaces)* href:ImportFilePathLiteral (!EOL Spaces)* ";"?
    { return passModuleResolutionExpression("ECMAScript", text(), location(), href) }
ImportFilePathLiteral
  = '"' chars:([^"\r\n] / "\\" .)* '"' { return chars.join(''); }
  / "'" chars:([^'\r\n] / "\\" .)* "'" { return chars.join(''); }
IncludeStatement
  = "#include" (!EOL Spaces)* href:IncludeFilePathLiteral (!EOL Spaces)*
    { return passModuleResolutionExpression("WGLScript", text(), location(), href) }
IncludeFilePathLiteral = "<" chars:([^>\r\n] / "\\" .)* ">" { return chars.join(''); }

// Source Code
SourceCode
  = BreakLine / Regions / BackticksStringLiteral / Comment / StatementLine
StatementLine
  = c:(!EOL !SBackticksStringLiteral !SComment !Comment .)+ { return passExpression("statement", text(), location()) }
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

// Backticks: `<content>`
BackticksStringLiteral
  = t:(SBackticksStringLiteral BackticksStringLiteralLines EBackticksStringLiteral)
    { return passRegionExpression("backticksStringLiteral", text(), location(), t) }
BackticksStringLiteralLines
  = head:BackticksStringLiteralLine tail:(EOL BackticksStringLiteralLine)* { return buildList(head, tail, 1); }
BackticksStringLiteralLine
  = (!EBackticksStringLiteral DoubleEscaped / (!EBackticksStringLiteral EscapedBacktick / !EBackticksStringLiteral !EOL .))* 
    { return passRegionLine(text(), location()) }
DoubleEscaped = "\\" "\\"
EscapedBacktick = "\\" !"\\" "`"
SBackticksStringLiteral = !"\\`" "`" { return passRegionLine(text(), location()) }
EBackticksStringLiteral = !"\\`" "`" { return passRegionLine(text(), location()) }

// Regions: #text...#endtext etc.
Regions = RText / RSql

RText
  = t:(SRText RTextLines ERText)
    { return passRegionExpression("text", text(), location(), t) }     
RTextLines = head:RTextLine tail:(EOL RTextLine)* { return buildList(head, tail, 1); }
RTextLine = (!"#endtext" !EOL .)* { return passRegionLine(text(), location()) }
SRText = (Spaces !EOL)* "#text" EOL { return passRegionLine(text(), location()) }
ERText = (Spaces !EOL)* "#endtext" { return passRegionLine(text(), location()) }

RSql
  = t:(SRSql RSqlLines ERSql)
    { return passRegionExpression("sql", text(), location(), t) }     
RSqlLines = head:RSqlLine tail:(EOL RSqlLine)* { return buildList(head, tail, 1); }
RSqlLine = (!"#endsql" !EOL .)* { return passRegionLine(text(), location()) }
SRSql = (Spaces !EOL)* "#sql" EOL { return passRegionLine(text(), location()) }
ERSql = (Spaces !EOL)* "#endsql" { return passRegionLine(text(), location()) }

// Space Symbols
EOL "line break"
  = "\n" / "\r\n" / "\r" / "\u2028" / "\u2029"
Spaces = [ \t\r\n\f]+
