import * as fs from 'fs'
import * as path from 'path'
import { SourceMapConsumer, SourceNode } from 'source-map'
import * as vscode from 'vscode'
import { arrayToMap, getConfigurationOption, mapToArray } from '../utils'
import { type AST, type TNode, compile } from './compiler'
import * as parser from './parser.js'

/**
 * Normalized path from {@link normalizePath}
 */
export type TNormalizedPath = string

export interface CompileOptions {
  projectRoot: string
  /**
   * All modules which parsed & compiled (local and global modules)
   */
  modules: string[]
  skipAttachGlobalScript?: boolean
  log?: CompilerLog
}

export interface CompilerLog {
  parseTime?: number
  readFileTime?: number
  compileGlobalScriptTime?: number
}

/**
 * Get absolute path from project root
 * @param file full system path
 * @param projectRoot dir of wglscript project
 */
export const normalizePath = (file: string, projectRoot: string): TNormalizedPath =>
  path.join(file.replace(projectRoot, '').replace(/^[\/\\]*/, ''))

// TODO: переделать в класс
export const astStorage = new Map<TNormalizedPath, { order: number; n: TNode }[]>()

export async function parseScriptModule(file: string, projectRoot: string): Promise<AST<TNode>> {
  const fileNormalized = normalizePath(file, projectRoot)
  if (astStorage.has(fileNormalized)) {
    const astStack = astStorage.get(fileNormalized) as { order: number; n: TNode }[]
    return astStack.sort((a, b) => a.order - b.order).map(r => r.n)
  }

  let content = ''
  try {
    const document = vscode.workspace.textDocuments.find(
      d => d.uri.fsPath === vscode.Uri.file(file).fsPath
    )
    if (document) {
      content = document.getText()
    } else {
      const readData = await vscode.workspace.fs.readFile(vscode.Uri.file(file))
      content = Buffer.from(readData).toString('utf8')
    }
  } catch (_) {
    console.log(`WARN: Script module ${fileNormalized} not exists`)
    return []
  }

  console.log(`INFO: parse ${fileNormalized}`)
  const ast: AST<TNode> = parser.parse(content)
  const astStack: { order: number; n: TNode }[] = []
  for (const i in ast) astStack.push({ order: Number(i), n: ast[Number(i)] })
  astStorage.set(fileNormalized, astStack)
  return ast
}

interface GlobalScriptRaw {
  code: string
  sourcemap: string
  modules: Map<number, string>
}

export const gls: GlobalScriptRaw = { code: '', sourcemap: '', modules: new Map() }

export async function attachGlobalScript(
  targetFile: string,
  opt: CompileOptions,
  chunks: Array<string | SourceNode>
) {
  // if (opt.skipAttachGlobalScript) return

  const targetFileNormalized = normalizePath(targetFile, opt.projectRoot)

  if (
    !getConfigurationOption<boolean>('enable') ||
    getConfigurationOption<string>('path') == null ||
    getConfigurationOption<string>('path')?.length === 0
  ) {
    return
  }

  const globalScript = path.join(opt.projectRoot, getConfigurationOption<string>('path'))
  const globalScriptNormalized = normalizePath(globalScript, opt.projectRoot)

  if (!fs.existsSync(globalScript)) {
    console.log(`WARN: Global script module ${globalScriptNormalized} not exists`)
    return
  }

  // когда будет собирать самого себя, чтобы не ушел в рекурсию
  if (opt.modules.indexOf(globalScriptNormalized.toLowerCase()) !== -1) {
    return
  }

  let globalScriptSourceNode: SourceNode

  if (gls.code === '') {
    console.log('INFO: compile global script')
    globalScriptSourceNode = await compile(globalScript, opt)
    const strWSM = globalScriptSourceNode.toStringWithSourceMap()

    gls.modules = arrayToMap([...opt.modules].filter(m => m !== targetFileNormalized.toLowerCase()))
    // gls.modules = arrayToMap([...opt.modules])
    gls.code = strWSM.code
    gls.sourcemap = strWSM.map.toString()
  } else {
    for (const m of mapToArray(gls.modules)) opt.modules.push(m) // simulate compile proccess
  }

  const consumer = await new SourceMapConsumer(gls.sourcemap)
  globalScriptSourceNode = SourceNode.fromStringWithSourceMap(gls.code, consumer)
  consumer.destroy()

  chunks.push(
    new SourceNode(null, null, targetFileNormalized, [
      `/* @@resolved ${globalScriptNormalized} from ${targetFileNormalized} */\n`,
      globalScriptSourceNode
    ])
  )

  // opt.skipAttachGlobalScript = true
}
