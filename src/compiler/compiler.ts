import * as path from 'path'
import { SourceNode } from 'source-map'
import * as vscode from 'vscode'
import * as parser from './parser.js'
import { normilizePath } from './utils.js'

type AST<T extends Node> = T[]
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
    start: {
      offset: number
      line: number
      column: number
    }
    end: {
      offset: number
      line: number
      column: number
    }
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
  /**
   * Raw file path of imported file
   */
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
  kind: 'multiLineComment' | 'backticksStringLiteral' | 'text' | 'sql'
  /**
   * body contains start and end of region (#text, `, /*, *\/ etc.)
   */
  body: RegionLineNode[]
}

export interface RegionLineNode extends Node {
  type: 'regionLine'
}

export type TNode = Node | ImportNode | RegionNode

interface CompileOptions {
  projectRoot: string
  modules: string[]
}

function transpileRegionBrackets(code: string) {
  if (code.replace(/#text/g, '').trim() === '') return code.replace(/#text(\n|\r\n)/g, '`')
  if (code.replace(/#endtext/g, '').trim() === '') return code.replace(/#endtext/g, '`;')
  if (code.replace(/#sql/g, '').trim() === '') return code.replace(/#sql(\n|\r\n)/g, '`')
  if (code.replace(/#endsql/g, '').trim() === '') return code.replace(/#endsql/g, '`;')
  return code
}

export function transpileCallExpressionAssignment(code: string) {
  // TODO: 1) not check string literal 2) not check multiline righthand expresion (need move to parser?)
  if (!code.match('.Param')) return code
  const matches = code.match(/(.+?)\.Param\((.+?)\)\s*[^=]=[^=]\s*([^;]+?)\s*;+(\s*\/\/.*|\s*)/)
  if (!matches) return code
  if (!matches.at(1) || !matches.at(2) || !matches.at(3)) return code
  if (matches.at(4)) return `${matches[1]}.AddParam(${matches[2]}, ${matches[3]});${matches[4]}`
  return `${matches[1]}.AddParam(${matches[2]}, ${matches[3]});`
}

/**
 * @param targetFile absolute file path of target file
 * @param opt compiler options
 */
export async function compile(targetFile: string, opt: CompileOptions): Promise<SourceNode> {
  const targetFileNormilized = normilizePath(targetFile, opt.projectRoot)
  const readData = await vscode.workspace.fs.readFile(vscode.Uri.file(targetFile))
  const targetFileContent = Buffer.from(readData).toString('utf8')
  const ast: AST<TNode> = parser.parse(targetFileContent)
  opt.modules.push(targetFileNormilized.toLowerCase())

  if (ast.at(-1)?.type === 'breakLine') ast.pop() // remove EOF

  const chunks: Array<string | SourceNode> = []

  for (const n of ast) {
    if (n.type === 'moduleResolution') {
      const href = (n as ImportNode).href
      let moduleFile: string

      // relative
      if (href.startsWith('.')) moduleFile = path.join(`${path.dirname(targetFile)}/${href}`)
      // absolute
      else moduleFile = path.join(`${opt.projectRoot}/${href}`)

      const moduleFileNormilized = normilizePath(moduleFile, opt.projectRoot)
      if (opt.modules.indexOf(moduleFileNormilized.toLowerCase()) !== -1) {
        chunks.push(
          new SourceNode(
            n.location.start.line,
            n.location.start.column - 1,
            targetFileNormilized,
            `/* @@unresolved ${moduleFileNormilized} from ${targetFileNormilized} */\n`
          )
        )
        continue
      }

      chunks.push(
        new SourceNode(n.location.start.line, n.location.start.column - 1, targetFileNormilized, [
          `/* @@resolved ${moduleFileNormilized} from ${targetFileNormilized} */\n`,
          await compile(moduleFile, opt)
        ])
      )
      continue
    }
    if (n.type === 'region') {
      chunks.push(
        new SourceNode(
          n.location.start.line,
          n.location.start.column - 1,
          targetFileNormilized,
          (n as RegionNode).body.flatMap(sn => {
            return new SourceNode(
              sn.location.start.line,
              sn.location.start.column - 1,
              targetFileNormilized,
              transpileRegionBrackets(sn.text)
            )
          })
        )
      )
      continue
    }
    if (n.type === 'statement') {
      chunks.push(
        new SourceNode(
          n.location.start.line,
          n.location.start.column - 1,
          targetFileNormilized,
          transpileCallExpressionAssignment(n.text)
        )
      )
      continue
    }
    chunks.push(
      new SourceNode(
        n.location.start.line,
        n.location.start.column - 1,
        targetFileNormilized,
        n.text
      )
    )
  }

  return new SourceNode(null, null, null, chunks)
}

export const parse = (source: string): AST<TNode> => parser.parse(source)
