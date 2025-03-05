# WGLScript toolchain

This extension provides support for the WGLScript programming language.

## Features

- [x] formatter
- [x] intellisense
	- [x] go to definition
	- [x] completions
	- [x] hover & signature help
	- [x] rename symbol (in ScriptModule or Project)
	- [x] find references (in ScriptModule or Project)
	- [x] diagnostics

### Recommendation

- disable builtin TypeScript extension for WGLScript workspace. Both services TypeScript & WGLScript can work improperly

	![TypeScript builtin extension](https://raw.githubusercontent.com/etherealHero/wgl-toolchain/refs/heads/main/public/ts.jpg)