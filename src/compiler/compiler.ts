import * as path from 'path'
import * as sm from 'source-map'
import * as utils from './utils'

export type AST<T extends Node> = T[]
type NodeType =
  | 'region'
  | 'regionLine'
  | 'moduleResolution'
  | 'statement'
  | 'breakLine'
  | 'singleLineComment'

interface Node {
  type: NodeType
  text: string
  location: {
    start: { offset: number; line: number; column: number }
    end: { offset: number; line: number; column: number }
  }
}

export interface ImportNode extends Node {
  type: 'moduleResolution'
  /**
   * ```js
   * import 'foo.js';  // ECMAScript syntax
   * #include <foo.js> // WGLScript syntax
   * ```
   */
  kind: 'ECMAScript' | 'WGLScript'
  /** Raw file path of imported file */
  href: string
}

/**
 * Region node is multiline expression e.g., kinds as:
 * - /*...*\/ MultiLine Comment
 * - \`...\` Backticks String Literal
 * - #text...#endtext String Literal WGLScript syntax
 */
export interface RegionNode extends Node {
  type: 'region'
  kind: 'multiLineComment' | 'backticksStringLit' | 'text' | 'sql'
  /** body contains start and end of region (#text, `, /*, *\/ etc.) */
  body: RegionLineNode[]
}

export interface RegionLineNode extends Node {
  type: 'regionLine'
}

export type TNode = Node | ImportNode | RegionNode

function transpileRegionBrackets(code: string) {
  if (code.replace(/#text/g, '').trim() === '') return code.replace(/#text(\n|\r\n)/g, '`')
  if (code.replace(/#endtext/g, '').trim() === '') return code.replace(/\s*#endtext/g, '`;')
  if (code.replace(/#sql/g, '').trim() === '') return code.replace(/#sql(\n|\r\n)/g, '`')
  if (code.replace(/#endsql/g, '').trim() === '') return code.replace(/\s*#endsql/g, '`;')
  return code
}

/**
 * @param file file system path
 * @param opt compiler options
 */
export async function compile(file: string, opt: utils.CompileOptions): Promise<sm.SourceNode> {
  const fileN = utils.normalizePath(file, opt.projectRoot)
  const fileNlc = fileN.toLowerCase()
  const ast: AST<TNode> = await utils.parseScriptModule(file, opt.projectRoot)
  opt.modules.push(fileNlc)

  const modulesRecoveryOnSkippedDependency = [...opt.modules]
  let hoistingOnPatternMatch = false

  const chunks: Array<string | sm.SourceNode> = []
  if (!opt.skipAttachGlobalScript) await utils.attachGlobalScript(file, opt, chunks)

  // TODO: конкатенированный файл прицепляется в продолжение последней строки и character offset некоректный
  // но теперь quickInfo - Hover ломается, скорее всего вовремя не обновляется контекст
  // if (ast.at(-1)?.type === 'breakLine') ast.pop() // remove EOF

  for (const n of ast) {
    const { type, text } = n
    let { line: ln, column: col } = n.location.start
    col -= 1

    if (type === 'moduleResolution') {
      const module = (n as ImportNode).href.startsWith('.')
        ? path.join(`${path.dirname(file)}/${(n as ImportNode).href}`)
        : path.join(`${opt.projectRoot}/${(n as ImportNode).href}`)
      const moduleN = utils.normalizePath(module, opt.projectRoot)

      if (opt.skipAttachDependencies) {
        chunks.push(new sm.SourceNode(ln, col, fileNlc, `import "${(n as ImportNode).href}";`))
        continue
      }

      let resolve: Array<string | sm.SourceNode> | sm.SourceNode | string = ''

      if (opt.modules.includes(moduleN.toLowerCase())) {
        resolve = `/* @@unresolved ${moduleN} from ${fileN} */\n`
      } else {
        const dependency = await compile(module, opt)

        if (opt.treeShaking?.searchPattern === undefined)
          resolve = [`/* @@resolved ${moduleN} from ${fileN} */\n`, dependency]
        else if (!opt.treeShaking?.dependencyHasPatternMatch) {
          resolve = `/* @@skippedByTreeShaking ${moduleN} from ${fileN} */\n`
          opt.modules = modulesRecoveryOnSkippedDependency
        } else {
          hoistingOnPatternMatch = true
          opt.treeShaking.dependencyHasPatternMatch = undefined
          resolve = [`/* @@resolved ${moduleN} from ${fileN} */\n`, dependency]
        }
      }

      chunks.push(new sm.SourceNode(ln, col, fileNlc, resolve))
      continue
    }

    // TODO: это вроде надо только для хоистинга модулей, переделать без сурсмапов
    if (opt.skipAttachNonImportStatements) {
      chunks.push(new sm.SourceNode(ln, col, fileNlc, ';'))
      continue
    }

    chunks.push(
      new sm.SourceNode(
        ln,
        col,
        fileNlc,
        type === 'region'
          ? (n as RegionNode).body.flatMap((rn, i, l) => {
              const { line: ln, column: col } = rn.location.start
              return new sm.SourceNode(
                ln,
                col - 1,
                fileNlc,
                i === 0 || i === l.length - 1 ? transpileRegionBrackets(rn.text) : rn.text
              )
            })
          : text
      )
    )
  }

  if (opt.treeShaking?.searchPattern) {
    const searchPattern = opt.treeShaking?.searchPattern
    const content = (await utils.getDocumentContent(file, opt.projectRoot)) || ''
    let isMatch: boolean

    if (typeof searchPattern !== 'string') isMatch = searchPattern.test(content)
    else isMatch = RegExp(searchPattern).test(content)

    if (isMatch || hoistingOnPatternMatch) opt.treeShaking.dependencyHasPatternMatch = true
  }

  return new sm.SourceNode(null, null, null, chunks)
}

/**
 * Merge WGL into ES ast for formatting features
 * - semi included
 * - `\r\n` breakline mode
 * @param WGLCompatibilityAst legacy syntax
 * @param ESCompatibilityAST es syntax
 * @returns
 */
export async function saveLegacyAstNodes(
  WGLCompatibilityAst: AST<TNode>,
  ESCompatibilityAST: AST<TNode>
): Promise<sm.SourceNode> {
  const chunks: Array<string | sm.SourceNode> = []
  let wglIndex = 0
  let esIndex = 0

  while (esIndex < ESCompatibilityAST.length) {
    const esNode = ESCompatibilityAST[esIndex]

    if (!(esNode.type === 'moduleResolution' || esNode.type === 'region')) {
      const { line, column } = esNode.location.start
      chunks.push(new sm.SourceNode(line, column - 1, null, esNode.text))
      esIndex++
      continue
    }

    while (wglIndex < WGLCompatibilityAst.length) {
      const wglNode = WGLCompatibilityAst[wglIndex]

      if (wglNode.type !== esNode.type) {
        wglIndex++
        continue
      }

      if (wglNode.type === 'moduleResolution') {
        const wglImport = wglNode as ImportNode
        const { line, column } = wglImport.location.start

        chunks.push(
          new sm.SourceNode(
            line,
            column - 1,
            null,
            wglImport.kind === 'WGLScript' ? `#include <${wglImport.href}>` : esNode.text
          )
        )
      }

      if (wglNode.type === 'region') {
        const wglRegion = wglNode as RegionNode
        const esRegion = esNode as RegionNode

        const startRegion = wglRegion.body[0]
        chunks.push(
          new sm.SourceNode(
            startRegion.location.start.line,
            startRegion.location.start.column - 1,
            null,
            wglRegion.kind === 'sql' || wglRegion.kind === 'text'
              ? `\r\n${startRegion.text}`
              : startRegion.text
          )
        )

        const contentLines = esRegion.body.slice(1, -1)
        for (const line of contentLines) {
          chunks.push(
            new sm.SourceNode(
              line.location.start.line,
              line.location.start.column - 1,
              null,
              line.text
            )
          )
        }

        const endRegion = wglRegion.body[wglRegion.body.length - 1]
        chunks.push(
          new sm.SourceNode(
            endRegion.location.start.line,
            endRegion.location.start.column - 1,
            null,
            endRegion.text
          )
        )

        if (
          ESCompatibilityAST[esIndex + 1].text === ';' &&
          (wglRegion.kind === 'sql' || wglRegion.kind === 'text')
        ) {
          esIndex++
        }
      }

      wglIndex++
      esIndex++
      break
    }
  }

  return new sm.SourceNode(null, null, null, chunks)
}

/**
 * Merge WGL into ES ast for formatting features
 * - semi included
 * - `\r\n` breakline mode
 * @param WGLCompatibilityAst legacy syntax
 * @param ESCompatibilityAST es syntax
 * @returns
 */
export async function fixLegacyAstNodes(
  WGLCompatibilityAst: AST<TNode>,
  ESCompatibilityAST: AST<TNode>
): Promise<sm.SourceNode> {
  const chunks: Array<string | sm.SourceNode> = []
  let wglIndex = 0
  let esIndex = 0

  while (wglIndex < WGLCompatibilityAst.length) {
    const wglNode = WGLCompatibilityAst[wglIndex]

    if (!(wglNode.type === 'moduleResolution' || wglNode.type === 'region')) {
      const { line, column } = wglNode.location.start
      chunks.push(new sm.SourceNode(line, column - 1, null, wglNode.text))
      wglIndex++
      continue
    }

    while (esIndex < ESCompatibilityAST.length) {
      const esNode = ESCompatibilityAST[esIndex]

      if (esNode.type !== wglNode.type) {
        esIndex++
        continue
      }

      if (esNode.type === 'moduleResolution') {
        chunks.push(
          new sm.SourceNode(
            esNode.location.start.line,
            esNode.location.start.column - 1,
            null,
            esNode.text
          )
        )
      }

      if (esNode.type === 'region') {
        for (const regionNodes of (esNode as RegionNode).body) {
          chunks.push(
            new sm.SourceNode(
              regionNodes.location.start.line,
              regionNodes.location.start.column - 1,
              null,
              regionNodes.text
            )
          )
        }
      }

      wglIndex++
      esIndex++
      break
    }
  }

  return new sm.SourceNode(null, null, null, chunks)
}
