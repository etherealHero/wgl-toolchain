import * as fs from 'fs'
import * as path from 'path'
import * as sm from 'source-map'
import * as vscode from 'vscode'
import * as libUtils from '../utils'
import * as parser from './parser.js'

import { type AST, type TNode, compile } from './compiler'

/** Normalized path from {@link normalizePath} */
export type TNormalizedPath = string

export const parse: (content: string) => AST<TNode> = parser.parse

export interface CompileOptions {
  projectRoot: string
  /** All modules which parsed & compiled (local and global modules) */
  modules: string[]
  /** @default false */
  skipAttachGlobalScript?: boolean
  /** @default false */
  skipAttachDependencies?: boolean
  /** @default false */
  skipAttachNonImportStatements?: boolean
  /** works correctly when all options like 'skip<Any>' disabled */
  treeShaking?: {
    searchPattern: RegExp | string
    dependencyHasPatternMatch?: true
  }
}

/**
 * Get absolute path from project root
 * @param file full system path
 * @param projectRoot dir of wglscript project
 */
export const normalizePath = (file: string, projectRoot: string): TNormalizedPath =>
  path.join(file.replace(projectRoot, '').replace(/^[\/\\]*/, ''))

export async function getDocumentContent(
  fsPath: string,
  projectRoot: string
): Promise<string | null> {
  let content = ''
  try {
    const document = vscode.workspace.textDocuments.find(
      d => d.uri.fsPath === vscode.Uri.file(fsPath).fsPath
    )
    if (document) {
      content = document.getText()
    } else {
      const readData = await vscode.workspace.fs.readFile(vscode.Uri.file(fsPath))
      content = Buffer.from(readData).toString('utf8')
    }
    return content
  } catch (_) {
    console.log(`ERROR: Document ${normalizePath(fsPath, projectRoot)} not exists`)
    return null
  }
}

// TODO: переделать в класс
export const astStorage = new Map<TNormalizedPath, { order: number; n: TNode }[]>()

export async function parseScriptModule(file: string, projectRoot: string): Promise<AST<TNode>> {
  const nFileLC = normalizePath(file, projectRoot).toLowerCase()
  if (astStorage.has(nFileLC)) {
    const astStack = astStorage.get(nFileLC) as { order: number; n: TNode }[]
    return astStack.sort((a, b) => a.order - b.order).map(r => r.n)
  }

  const content = await getDocumentContent(file, projectRoot)
  if (!content) return []

  try {
    const ast: AST<TNode> = libUtils.logtime(parser.parse, content)
    const astStack: { order: number; n: TNode }[] = []
    for (const i in ast) astStack.push({ order: Number(i), n: ast[Number(i)] })
    astStorage.set(nFileLC, astStack)
    return ast
  } catch (error) {
    console.log(`ERROR: ${error} at ${nFileLC}`)
    return []
  }
}

interface GlobalScriptRaw {
  code: string
  sourcemap: string
  modules: Map<number, string>
}

// TODO: перевести на bundleInfoRepository
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
    // console.log(`ERROR: Global script module ${globalScriptN} not exists`)
    return
  }

  // когда будет собирать самого себя, чтобы не ушел в рекурсию
  if (opt.modules.includes(globalScriptN.toLowerCase())) return

  let globalScriptSN: sm.SourceNode

  if (gls.code === '' || gls.sourcemap === '' || opt.treeShaking?.searchPattern) {
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

  if (opt.treeShaking?.searchPattern !== undefined) {
    gls.code = ''
    gls.sourcemap = ''
    gls.modules = new Map()
  }

  chunks.push(
    new sm.SourceNode(null, null, fileN.toLowerCase(), [
      `/* @@resolved ${globalScriptN} from ${fileN} */\n`,
      globalScriptSN,
      '\n'
    ])
  )
}
