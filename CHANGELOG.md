# Change Log

## 0.4.1 (2025-05-30)

- fix ininity loop on missing dependency
- add extension logger

## 0.4.0 (2025-05-26)

- add debugger via NodeJS with sourceMaps & pre-launch build task
- fix EOF of globalScirpt
- fix update dependencies with case sensetive import path

## 0.3.3 (2025-05-13)

- fix completion entry details on dirty document
- fix restart service with code action exception on diagnostics hover
- completion full context in object literal too
- signature help tree-shaking
- cache workspace symbols

## 0.3.2 (2025-05-05)

- performance improvements by modules tree shaking
- performance improvements by skip serialize source-maps
- performance improvements on search module references by stripped-down compile mode
- ordering completions by selection scope
- fix formatting import statements
- fix missing references when different module path writing by case sensitive
- fix fold regions of source code

## 0.3.1 (2025-04-29)

- fix transpile regions in other regions
- fix missing entry file on language feature request when overhead slice of modules
- find references of library symbols (d.ts) in whole project feature
- use only real Symbols from d.ts library
- performance improvements & optimize service features (setup typescript environment as needed)

## 0.3.0 (2025-04-28)

- format without edit syntax
- code refactor feature WGL to ES syntax
- set project scope in request strategy for global symbols by default 
- fix infinity loop reload intellisence on exception (new ext option exception behaviour)
- fix duplicate definitions (source path case sensitive)
- fix parse module resolution statement with space indent of start of line
- fix transpile endregion tag with space indent of start of line

## 0.2.3 (2025-04-09)

- fix double eof after format raw script file with existing eof

## 0.2.2 (2025-04-02)

- edit README, add previews

## 0.2.1 (2025-04-02)

- fix: avoid first line of document intellisense features
- fix: sync TypeScript Environment after workspace edits
- fix: sync TypeScript Environment on document changes
- add builtIn extensions short link in WGL tooltip

## 0.2.0 (2025-04-01)

- feat: inspect tools (bundle, local bundle, module info)
- feat: status bar item for quick restart of service
- fix: auto restart service by error handling
- disable diagnostics by default
- option enable/disable formatting
- tests fixes

## 0.1.5 (2025-03-11)

- fix: update diagnostics on change dependencies
- add extension options "intellisense features"

## 0.1.4 (2025-03-05)

- fix: disable update diagnostics on non JS files
- add extension option "ignore ts codes"

## 0.1.3 (2025-03-05)

- README edits

## 0.1.2 (2025-03-03)

- diagnostics extension settings
- dettach virtual TypeScript environment on change text document
- provide folding ranges
- go to import, include module definition
- e2e definition tests
- e2e formatting test

## 0.1.1 (2025-03-03)

- diagnostics fixes

## 0.1.0 (2025-02-24)

- formatter
- fixes

## 0.0.8 (2025-02-19)

- provide diagnostics

## 0.0.7 (2025-02-18)

- extension settings & performance
- vsce package
- extension icon

## 0.0.6 (2025-02-18)

- find references & rename Symbol in whole project if Symbol declare in local Bundle context - not in globalScript or lib.d.ts
- extend parser 
  - add single, double quote string literal
  - add regexp

## 0.0.5 (2025-02-12)

- document & workspace symbols (in ScriptModule/Bundle context)
- extend intellisense utils

## 0.0.4 (2025-02-09)

- rename symbol (in ScriptModule/Bundle context)
- find references & goto definition preformance fix (source-map consumer)

## 0.0.3 (2025-02-08)

- cache tsvfs
- completions
- hover & signature help
- find references (in ScriptModule/Bundle context)

## 0.0.2 (2025-02-06)

- go to definition feature

## 0.0.1 (2025-02-06)

- initial commit
