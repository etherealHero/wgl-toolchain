import * as fs from 'fs'
import * as path from 'path'
import * as tsvfs from '@typescript/vfs'
import * as ignore from 'ignore'
import * as sm from 'source-map'
import * as ts from 'typescript'
import * as vscode from 'vscode'
import * as cUtils from '../compiler/utils'
import * as libUtils from '../utils'

import { compile } from '../compiler/compiler'

/** Bundle file name */
export const bundle = 'bundle.js'

/** WGLScript compiler options */
export const compilerOpts = {
  allowJs: true,
  module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2015,
  esModuleInterop: true,
  forceConsistentCasingInFileNames: true,
  skipDefaultLibCheck: true,
  disableReferencedProjectLoad: true,
  noImplicitAny: true,
  checkJs: true,
  noEmit: true,
  strict: false,
  baseUrl: './',
  typeRoots: ['./node_modules/@types'],
  diagnostics: false
}

/** Map-key: bundle hash */
const VTSEnvStorage: Map<string, tsvfs.VirtualTypeScriptEnvironment> = new Map()

export function getVTSEnv(
  projectRoot: string,
  bundleContent: string,
  cacheEnv?: boolean
): tsvfs.VirtualTypeScriptEnvironment {
  const hash = libUtils.getHash(bundleContent)

  if (VTSEnvStorage.has(hash)) {
    return VTSEnvStorage.get(hash) as tsvfs.VirtualTypeScriptEnvironment
  }

  const fsMap = attachFsMap(projectRoot)
  fsMap.set(bundle, bundleContent)

  const system = tsvfs.createSystem(fsMap)
  // TODO: последний аргумент customTransformer изучить и прокинуть регистронезависимость для встроенных функций
  // TODO: сохранять диагностику на CallExpressionAssignment
  const env = libUtils.logtime(
    tsvfs.createVirtualTypeScriptEnvironment,
    system,
    [bundle],
    ts,
    compilerOpts
  )

  if (!(cacheEnv === false)) VTSEnvStorage.set(hash, env)

  return env
}

let fsMap: Map<string, string> | undefined

function attachFsMap(projectRoot: string) {
  // TODO: здесь разобраться и складывать только нужные либы
  if (fsMap?.size) return fsMap
  fsMap = tsvfs.createDefaultMapFromNodeModules(compilerOpts)

  try {
    const wgldts = fs.readFileSync(
      path.join(projectRoot, 'node_modules', '@types', 'wglscript', 'lib.wglscript.d.ts')
    )

    fsMap.set('/lib.es5.d.ts', `${wgldts}${fsMap.get('/lib.es5.d.ts') as string}`)
  } catch (error) {
    console.log(
      'ERROR: types for WGLScript at node_modules/@types/wglscript/lib.wglscript.d.ts not found'
    )
  }

  for (const lib of fsMap.keys()) {
    const dir = path.join(projectRoot, 'node_modules', '@types', 'wglscript', 'generated')
    const libFile = path.join(dir, lib)
    if (!fs.existsSync(libFile)) {
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(libFile, fsMap.get(lib) as string)
    }
  }

  return fsMap
}

export function TSDiagnosticCategoryToVSCodeDiagnosticSeverity(
  el: ts.DiagnosticCategory
): vscode.DiagnosticSeverity {
  switch (el) {
    case ts.DiagnosticCategory.Error:
      return vscode.DiagnosticSeverity.Error
    case ts.DiagnosticCategory.Warning:
      return vscode.DiagnosticSeverity.Warning
    case ts.DiagnosticCategory.Message:
      return vscode.DiagnosticSeverity.Information
    case ts.DiagnosticCategory.Suggestion:
      return vscode.DiagnosticSeverity.Hint
  }
}

export function TSElementKindtoVSCodeCompletionItemKind(
  el: ts.ScriptElementKind
): vscode.CompletionItemKind {
  switch (el) {
    case ts.ScriptElementKind.moduleElement:
      return vscode.CompletionItemKind.Module
    case ts.ScriptElementKind.classElement:
    case ts.ScriptElementKind.localClassElement:
      return vscode.CompletionItemKind.Class
    case ts.ScriptElementKind.interfaceElement:
      return vscode.CompletionItemKind.Interface
    case ts.ScriptElementKind.typeElement:
      return vscode.CompletionItemKind.Struct
    case ts.ScriptElementKind.enumElement:
      return vscode.CompletionItemKind.Enum
    case ts.ScriptElementKind.enumMemberElement:
      return vscode.CompletionItemKind.EnumMember
    case ts.ScriptElementKind.variableElement:
    case ts.ScriptElementKind.localVariableElement:
    case ts.ScriptElementKind.variableUsingElement:
    case ts.ScriptElementKind.variableAwaitUsingElement:
      return vscode.CompletionItemKind.Variable
    case ts.ScriptElementKind.constElement:
      return vscode.CompletionItemKind.Constant
    case ts.ScriptElementKind.letElement:
      return vscode.CompletionItemKind.Variable
    case ts.ScriptElementKind.functionElement:
    case ts.ScriptElementKind.localFunctionElement:
      return vscode.CompletionItemKind.Function
    case ts.ScriptElementKind.memberFunctionElement:
      return vscode.CompletionItemKind.Method
    case ts.ScriptElementKind.memberVariableElement:
      return vscode.CompletionItemKind.Property
    case ts.ScriptElementKind.memberGetAccessorElement:
    case ts.ScriptElementKind.memberSetAccessorElement:
    case ts.ScriptElementKind.memberAccessorVariableElement:
      return vscode.CompletionItemKind.Property
    case ts.ScriptElementKind.constructorImplementationElement:
      return vscode.CompletionItemKind.Constructor
    case ts.ScriptElementKind.callSignatureElement:
      return vscode.CompletionItemKind.Function
    case ts.ScriptElementKind.indexSignatureElement:
      return vscode.CompletionItemKind.Operator
    case ts.ScriptElementKind.constructSignatureElement:
      return vscode.CompletionItemKind.Constructor
    case ts.ScriptElementKind.parameterElement:
      return vscode.CompletionItemKind.Variable
    case ts.ScriptElementKind.typeParameterElement:
      return vscode.CompletionItemKind.TypeParameter
    case ts.ScriptElementKind.keyword:
      return vscode.CompletionItemKind.Keyword
    case ts.ScriptElementKind.string:
      return vscode.CompletionItemKind.Text
    default:
      return vscode.CompletionItemKind.Text
  }
}

export function TSElementKindtoVSCodeSymbolKind(el: ts.ScriptElementKind): vscode.SymbolKind {
  switch (el) {
    case ts.ScriptElementKind.moduleElement:
      return vscode.SymbolKind.Module
    case ts.ScriptElementKind.classElement:
    case ts.ScriptElementKind.localClassElement:
      return vscode.SymbolKind.Class
    case ts.ScriptElementKind.interfaceElement:
      return vscode.SymbolKind.Interface
    case ts.ScriptElementKind.typeElement:
      return vscode.SymbolKind.Struct
    case ts.ScriptElementKind.enumElement:
      return vscode.SymbolKind.Enum
    case ts.ScriptElementKind.enumMemberElement:
      return vscode.SymbolKind.EnumMember
    case ts.ScriptElementKind.variableElement:
    case ts.ScriptElementKind.localVariableElement:
    case ts.ScriptElementKind.variableUsingElement:
    case ts.ScriptElementKind.variableAwaitUsingElement:
      return vscode.SymbolKind.Variable
    case ts.ScriptElementKind.constElement:
      return vscode.SymbolKind.Constant
    case ts.ScriptElementKind.letElement:
      return vscode.SymbolKind.Variable
    case ts.ScriptElementKind.functionElement:
    case ts.ScriptElementKind.localFunctionElement:
      return vscode.SymbolKind.Function
    case ts.ScriptElementKind.memberFunctionElement:
      return vscode.SymbolKind.Method
    case ts.ScriptElementKind.memberVariableElement:
      return vscode.SymbolKind.Property
    case ts.ScriptElementKind.memberGetAccessorElement:
    case ts.ScriptElementKind.memberSetAccessorElement:
    case ts.ScriptElementKind.memberAccessorVariableElement:
      return vscode.SymbolKind.Property
    case ts.ScriptElementKind.constructorImplementationElement:
      return vscode.SymbolKind.Constructor
    case ts.ScriptElementKind.callSignatureElement:
      return vscode.SymbolKind.Function
    case ts.ScriptElementKind.indexSignatureElement:
      return vscode.SymbolKind.Key
    case ts.ScriptElementKind.constructSignatureElement:
      return vscode.SymbolKind.Constructor
    case ts.ScriptElementKind.parameterElement:
      return vscode.SymbolKind.Variable
    case ts.ScriptElementKind.typeParameterElement:
      return vscode.SymbolKind.TypeParameter
    case ts.ScriptElementKind.string:
      return vscode.SymbolKind.String
    case ts.ScriptElementKind.primitiveType:
      return vscode.SymbolKind.TypeParameter
    case ts.ScriptElementKind.label:
      return vscode.SymbolKind.Object
    case ts.ScriptElementKind.alias:
      return vscode.SymbolKind.Namespace
    case ts.ScriptElementKind.directory:
      return vscode.SymbolKind.Package
    case ts.ScriptElementKind.externalModuleName:
      return vscode.SymbolKind.Module
    default:
      return vscode.SymbolKind.Null
  }
}

export function prettifyJSDoc(t: ts.JSDocTagInfo): string {
  return `_@${t.name}_ ${(t.text || []).map((p, i) => (i ? p.text.replace(/([<>])/g, '\\$1') : `**${p.text.replace(/([<>])/g, '\\$1')}**`)).join('')}`
}

export function isCancelled(
  token: undefined | vscode.CancellationToken | (vscode.CancellationToken | undefined)[]
): boolean {
  let isCancelled = false
  if (Array.isArray(token)) {
    if (token.find(t => t?.isCancellationRequested)) isCancelled = true
  } else {
    if (token?.isCancellationRequested) isCancelled = true
  }
  return isCancelled
}

export async function getJsFiles(projectRoot: string, pattern?: RegExp) {
  const gitignorePath = path.join(projectRoot, '.gitignore')
  let ignoreRules: string[] = []

  if (fs.existsSync(gitignorePath)) {
    ignoreRules = fs.readFileSync(gitignorePath, 'utf8').split('\n')
  }

  const ig = ignore().add(ignoreRules)

  async function readDirRecursive(dir: string) {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true })
    let jsFiles: cUtils.TNormalizedPath[] = []

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      const relativePath = path.relative(projectRoot, fullPath)

      if (ig.ignores(relativePath)) continue

      if (entry.isDirectory()) {
        jsFiles = jsFiles.concat(await readDirRecursive(fullPath))
      } else if (entry.isFile() && path.extname(entry.name) === '.js') {
        if (pattern) {
          if (Buffer.from(fs.readFileSync(fullPath)).toString('utf-8').match(pattern))
            jsFiles.push(relativePath)
        } else {
          jsFiles.push(relativePath)
        }
      }
    }

    return jsFiles
  }

  return await readDirRecursive(projectRoot)
}

export function chunkedArray<T>(arr: Array<T>, chunkSize: number) {
  const result = []
  for (let i = 0; i < arr.length; i += chunkSize) {
    result.push(arr.slice(i, i + chunkSize))
  }

  return result
}

interface IBundleInfo {
  bundleContent: string
  entryContent: string
  consumer: sm.BasicSourceMapConsumer | sm.IndexedSourceMapConsumer
  dependencies: cUtils.TNormalizedPath[]
}

export const bundleInfoRepository = new Map<cUtils.TNormalizedPath, IBundleInfo>()

// TODO: переделать параметры в объект
export async function consumeScriptModule<T>(
  document: Pick<vscode.TextDocument, 'fileName'>,
  position: Pick<vscode.Position, 'line' | 'character'> | null,
  projectRoot: string,
  consumer: (
    consumer: sm.BasicSourceMapConsumer | sm.IndexedSourceMapConsumer,
    bundle: string,
    bundlePosition: sm.NullablePosition,
    entryContent: string
  ) => Promise<T> | T,
  token?: undefined | vscode.CancellationToken | (vscode.CancellationToken | undefined)[],
  source?: cUtils.TNormalizedPath
): Promise<T | undefined> {
  if (isCancelled(token)) return

  const entry = cUtils.normalizePath(document.fileName, projectRoot)
  let bundleContent = ''
  let entryContent = ''
  let sourceMapConsumer: sm.BasicSourceMapConsumer | sm.IndexedSourceMapConsumer | undefined

  if (bundleInfoRepository.has(entry)) {
    const bundleInfo = bundleInfoRepository.get(entry) as IBundleInfo

    bundleContent = bundleInfo.bundleContent
    sourceMapConsumer = bundleInfo.consumer
    entryContent = bundleInfo.entryContent
  } else {
    const sn = await compile(document.fileName, { projectRoot, modules: [] })
    const codeWithSourceMap = sn.toStringWithSourceMap({ file: entry })
    const rawSourceMap = codeWithSourceMap.map.toString()
    const snEntry = await compile(document.fileName, {
      projectRoot,
      modules: [],
      skipAttachDependencies: true,
      skipAttachGlobalScript: true
    })

    bundleContent = codeWithSourceMap.code
    entryContent = snEntry.toStringWithSourceMap({ file: entry }).code
    sourceMapConsumer = await new sm.SourceMapConsumer(rawSourceMap)

    bundleInfoRepository.set(entry, {
      consumer: sourceMapConsumer,
      dependencies: sourceMapConsumer.sources,
      bundleContent,
      entryContent
    })
  }

  const bundlePosition = position
    ? sourceMapConsumer.generatedPositionFor({
        source: source ?? entry,
        line: position.line + 1,
        column: position.character
      })
    : { line: -1, column: -1, lastColumn: -1 }

  if (
    !bundlePosition ||
    bundlePosition.line == null ||
    bundlePosition.column == null ||
    isCancelled(token)
  )
    return

  const resolve = await consumer(sourceMapConsumer, bundleContent, bundlePosition, entryContent)

  if (isCancelled(token)) return

  return resolve
}

export function track<T extends object>(obj: T) {
  const methodHandler = {
    // biome-ignore lint/complexity/noBannedTypes: <explanation>
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    apply(target: Function, thisArg: any, argumentsList: any[]) {
      const methodName = target.name || 'anonymous function'
      const start = performance.now()

      const result = Reflect.apply(target, thisArg, argumentsList)

      if (result instanceof Promise) {
        return result.then(res => {
          console.log(
            `DEBUG execution time ${methodName} ${Math.round((performance.now() - start) * 100) / 100}ms`
          )
          return res
        })
      }

      console.log(
        `DEBUG execution time ${methodName} ${Math.round((performance.now() - start) * 100) / 100}ms`
      )
      return result
    }
  }

  return new Proxy(obj, {
    get(target, prop: string | symbol, receiver) {
      const originalProperty = Reflect.get(target, prop, receiver)

      if (typeof originalProperty === 'function') {
        return new Proxy(originalProperty, methodHandler)
      }

      console.log(`Property "${String(prop)}" was read with value: ${originalProperty}`)

      return originalProperty
    }
  })
}
