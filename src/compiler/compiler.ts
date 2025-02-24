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
  kind: 'multiLineComment' | 'backticksStringLiteral' | 'text' | 'sql'
  /** body contains start and end of region (#text, `, /*, *\/ etc.) */
  body: RegionLineNode[]
}

export interface RegionLineNode extends Node {
  type: 'regionLine'
}

export type TNode = Node | ImportNode | RegionNode

function transpileRegionBrackets(code: string) {
  if (code.replace(/#text/g, '').trim() === '') return code.replace(/#text(\n|\r\n)/g, '`')
  if (code.replace(/#endtext/g, '').trim() === '') return code.replace(/#endtext/g, '`;')
  if (code.replace(/#sql/g, '').trim() === '') return code.replace(/#sql(\n|\r\n)/g, '`')
  if (code.replace(/#endsql/g, '').trim() === '') return code.replace(/#endsql/g, '`;')
  return code
}

/**
 * @param file file system path
 * @param opt compiler options
 */
export async function compile(file: string, opt: utils.CompileOptions): Promise<sm.SourceNode> {
  const fileN = utils.normalizePath(file, opt.projectRoot)
  const ast: AST<TNode> = await utils.parseScriptModule(file, opt.projectRoot)
  opt.modules.push(fileN.toLowerCase())

  const chunks: Array<string | sm.SourceNode> = []
  if (!opt.skipAttachGlobalScript) await utils.attachGlobalScript(file, opt, chunks)
  if (ast.at(-1)?.type === 'breakLine') ast.pop() // remove EOF

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
        chunks.push(new sm.SourceNode(ln, col, fileN, `import "${(n as ImportNode).href}";`))
        continue
      }

      const resolve = opt.modules.includes(moduleN.toLowerCase())
        ? `/* @@unresolved ${moduleN} from ${fileN} */\n`
        : [`/* @@resolved ${moduleN} from ${fileN} */\n`, await compile(module, opt)]

      chunks.push(new sm.SourceNode(ln, col, fileN, resolve))
      continue
    }

    chunks.push(
      new sm.SourceNode(
        ln,
        col,
        fileN,
        type === 'region'
          ? (n as RegionNode).body.flatMap(rn => {
              const { line: ln, column: col } = rn.location.start
              return new sm.SourceNode(ln, col - 1, fileN, transpileRegionBrackets(rn.text))
            })
          : text
      )
    )
  }

  return new sm.SourceNode(null, null, null, chunks)
}
