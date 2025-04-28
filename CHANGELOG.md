# Change Log

## 0.3.0

- format without edit syntax
- code refactor feature WGL to ES syntax
- set project scope in request strategy for global symbols by default 
- fix infinity loop reload intellisence on exception (new ext option exception behaviour)
- fix duplicate definitions (source path case sensitive)
- fix parse module resolution statement with space indent of start of line
- fix transpile endregion tag with space indent of start of line

## 0.2.3

- fix double eof after format raw script file with existing eof

## 0.2.2

- edit README, add previews

## 0.2.1

- fix: avoid first line of document intellisense features
- fix: sync TypeScript Environment after workspace edits
- fix: sync TypeScript Environment on document changes
- add builtIn extensions short link in WGL tooltip

## 0.2.0

- feat: inspect tools (bundle, local bundle, module info)
- feat: status bar item for quick restart of service
- fix: auto restart service by error handling
- disable diagnostics by default
- option enable/disable formatting
- tests fixes

## 0.1.5

- fix: update diagnostics on change dependencies
- add extension options "intellisense features"

## 0.1.4

- fix: disable update diagnostics on non JS files
- add extension option "ignore ts codes"

## 0.1.3

- README edits

## 0.1.2

- diagnostics extension settings
- dettach virtual TypeScript environment on change text document
- provide folding ranges
- go to import, include module definition
- e2e definition tests
- e2e formatting test

## 0.1.1

- diagnostics fixes

## 0.1.0

- formatter
- fixes

## 0.0.8

- provide diagnostics

## 0.0.7

- extension settings & performance
- vsce package
- extension icon

## 0.0.6

- find references & rename Symbol in whole project if Symbol declare in local Bundle context - not in globalScript or lib.d.ts
- extend parser 
  - add single, double quote string literal
  - add regexp

## 0.0.5

- document & workspace symbols (in ScriptModule/Bundle context)
- extend intellisense utils

## 0.0.4

- rename symbol (in ScriptModule/Bundle context)
- find references & goto definition preformance fix (source-map consumer)

## 0.0.3

- cache tsvfs
- completions
- hover & signature help
- find references (in ScriptModule/Bundle context)

## 0.0.2

- go to definition feature

## 0.0.1

- initial commit
