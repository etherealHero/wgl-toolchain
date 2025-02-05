import * as fs from 'fs'
import * as path from 'path'
import { SourceNode } from 'source-map'
import * as vscode from 'vscode'
import { getConfigurationOption } from '../utils'
import { type AST, type TNode, compile } from './compiler'
import * as parser from './parser.js'

/**
 * Normalized path from {@link normalizePath}
 */
export type TNormalizedPath = string

export interface CompileOptions {
  projectRoot: string
  modules: string[]
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

// TODO: при изменении контента мапа перезапполниться
// TODO: на все вот такие хранилища надо настроить вотчер ФС или ФиФо
const astStorage = new Map<TNormalizedPath, AST<TNode>>()

export async function parseScriptModule(file: string, projectRoot: string): Promise<AST<TNode>> {
  const fileNormalized = normalizePath(file, projectRoot)
  if (astStorage.has(fileNormalized)) return astStorage.get(fileNormalized) as AST<TNode>

  let content = ''
  try {
    const readData = await vscode.workspace.fs.readFile(vscode.Uri.file(file))
    content = Buffer.from(readData).toString('utf8')
  } catch (_) {
    console.log(`WARN: Script module ${fileNormalized} not exists`)
    return []
  }

  const ast: AST<TNode> = parser.parse(content)
  astStorage.set(fileNormalized, ast)
  return ast
}

const globalScriptStorage = new Map<Pick<CompileOptions, 'projectRoot' | 'modules'>, SourceNode>()

export async function parseGlobalScript(
  targetFile: string,
  opt: CompileOptions,
  chunks: Array<string | SourceNode>
) {
  const targetFileNormalized = normalizePath(targetFile, opt.projectRoot)

  if (
    getConfigurationOption<boolean>('enable') &&
    getConfigurationOption<string>('path')?.length !== 0
  ) {
    const globalScript = path.join(opt.projectRoot, getConfigurationOption<string>('path'))
    const globalScriptNormalized = normalizePath(globalScript, opt.projectRoot)
    const compileOptions = { projectRoot: opt.projectRoot, modules: opt.modules }

    if (opt.modules.indexOf(globalScriptNormalized.toLowerCase()) === -1) {
      if (!fs.existsSync(globalScript)) {
        console.log(`WARN: Global script module ${globalScriptNormalized} not exists`)
      } else {
        let globalScriptSourceNode: SourceNode
        if (globalScriptStorage.has(compileOptions)) {
          globalScriptSourceNode = globalScriptStorage.get({
            projectRoot: opt.projectRoot,
            modules: opt.modules
          }) as SourceNode
        } else {
          globalScriptSourceNode = await compile(globalScript, opt)
        }

        chunks.push(
          new SourceNode(null, null, targetFileNormalized, [
            `/* @@resolved ${globalScriptNormalized} from ${targetFileNormalized} */\n`,
            globalScriptSourceNode
          ])
        )

        globalScriptStorage.set(compileOptions, globalScriptSourceNode)
      }
    }
  }
}
