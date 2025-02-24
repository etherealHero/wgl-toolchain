import * as fs from 'fs'
import * as path from 'path'
import * as sm from 'source-map'
import * as vscode from 'vscode'
import * as libUtils from '../utils'
import * as parser from './parser.js'

import { type AST, type TNode, compile } from './compiler'

/** Normalized path from {@link normalizePath} */
export type TNormalizedPath = string

export interface CompileOptions {
  projectRoot: string
  /** All modules which parsed & compiled (local and global modules) */
  modules: string[]
  skipAttachGlobalScript?: boolean
  skipAttachDependencies?: boolean
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
    console.log(`ERROR: Script module ${fileNormalized} not exists`)
    return []
  }

  try {
    const ast: AST<TNode> = libUtils.logtime(parser.parse, content)
    const astStack: { order: number; n: TNode }[] = []
    for (const i in ast) astStack.push({ order: Number(i), n: ast[Number(i)] })
    astStorage.set(fileNormalized, astStack)
    return ast
  } catch (error) {
    console.log(`ERROR: ${error} at ${fileNormalized}`)
    return []
  }
}

interface GlobalScriptRaw {
  code: string
  sourcemap: string
  modules: Map<number, string>
}

/** Global script storage */
export const gls: GlobalScriptRaw = { code: '', sourcemap: '', modules: new Map() }

/**
 * Attach global script
 * @param file file system path
 * @param opt compiler options
 * @param chunks source node chunks
 * @returns attach global script into {@link chunks}
 */
export async function attachGlobalScript(
  file: string,
  opt: CompileOptions,
  chunks: Array<string | sm.SourceNode>
) {
  if (
    !libUtils.getExtOption<boolean>('globalScript.enable') ||
    libUtils.getExtOption<string>('globalScript.path') == null ||
    libUtils.getExtOption<string>('globalScript.path')?.length === 0
  )
    return

  const globalScript = path.join(
    opt.projectRoot,
    libUtils.getExtOption<string>('globalScript.path')
  )
  const globalScriptN = normalizePath(globalScript, opt.projectRoot)
  const fileN = normalizePath(file, opt.projectRoot)

  if (!fs.existsSync(globalScript)) {
    console.log(`ERROR: Global script module ${globalScriptN} not exists`)
    return
  }

  // когда будет собирать самого себя, чтобы не ушел в рекурсию
  if (opt.modules.includes(globalScriptN.toLowerCase())) return

  let globalScriptSN: sm.SourceNode

  if (gls.code === '') {
    globalScriptSN = await compile(globalScript, opt)
    const strWSM = globalScriptSN.toStringWithSourceMap()

    gls.modules = libUtils.arrayToMap([...opt.modules].filter(m => m !== fileN.toLowerCase()))
    gls.code = strWSM.code
    gls.sourcemap = strWSM.map.toString()
  } else {
    for (const m of libUtils.mapToArray(gls.modules)) opt.modules.push(m) // simulate compile proccess
  }

  const consumer = await new sm.SourceMapConsumer(gls.sourcemap)
  globalScriptSN = sm.SourceNode.fromStringWithSourceMap(gls.code, consumer)
  consumer.destroy()

  chunks.push(
    new sm.SourceNode(null, null, fileN, [
      `/* @@resolved ${globalScriptN} from ${fileN} */\n`,
      globalScriptSN
    ])
  )
}
