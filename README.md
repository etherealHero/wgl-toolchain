# 🛠 WGLScript toolchain

This extension provides support for the WGLScript programming language.

## 📌 Features

- [x] formatter
	- [x] #regions
	- [x] callExpressionAssignment
	- [ ] octal literals
- [x] inspect tools
	- [x] debug via NodeJS
	- [x] show bundle
	- [x] show local bundle
	- [x] show module info
- [x] intellisense
	- [x] go to definition
	- [x] completions
	- [x] hover & signature help
	- [x] rename symbol (in ScriptModule or Project)
	- [x] find references (in ScriptModule or Project)
	- [x] diagnostics
	- [x] workspace & document symbols
	- [x] breadcrumbs
	- [x] code refactor

## 🚀 Examples

- Inspect tools

	![TypeScript builtin extension](https://raw.githubusercontent.com/etherealHero/wgl-toolchain/refs/heads/main/public/inspecttools.gif)

- Intellisense

	![TypeScript builtin extension](https://raw.githubusercontent.com/etherealHero/wgl-toolchain/refs/heads/main/public/intellisense.gif)

## ⚙ Configuration

**Intellisense**. All functions can be turned on/off separately. To reduce the load on the processor, turn off unnecessary features.

**Debugging**. [Node.js](https://nodejs.org/en) installation is a prerequisite for debugging WGLScript programs. Configuration _launch.json_ found [here](https://github.com/etherealHero/wgl-toolchain/blob/main/src/test/.vscode/launch.json)

**Recommendation**. Disable builtin TypeScript extension for WGLScript workspace. Both services TypeScript & WGLScript can work improperly


![TypeScript builtin extension](https://raw.githubusercontent.com/etherealHero/wgl-toolchain/refs/heads/main/public/builtin.jpg)
