import * as fs from 'fs'
import * as path from 'path'
import * as tsvfs from '@typescript/vfs'
import * as ignore from 'ignore'
import * as sm from 'source-map'
import * as ts from 'typescript'
import * as vscode from 'vscode'
import * as cUtils from '../compiler/utils'
import * as libUtils from '../utils'

import { type AST, type TNode, compile } from '../compiler/compiler'
import { intellisense } from './features'

/** Bundle file name */
export const bundle = 'bundle.js'

/** WGLScript compiler options */
export const compilerOpts = {
  allowJs: true,
  module: ts.ModuleKind.CommonJS,
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

let fsMap: Map<string, string> | undefined

function attachFsMap(projectRoot: string) {
  if (fsMap?.size) return fsMap
  fsMap = new Map<string, string>()

  try {
    const wgldts = fs.readFileSync(
      path.join(projectRoot, 'node_modules', '@types', 'wglscript', 'lib.wglscript.d.ts')
    )
    const ES5Compatibility = fs.readFileSync(
      path.join(projectRoot, 'node_modules', '@types', 'wglscript', 'lib.es5.d.ts')
    )

    fsMap.set('/lib.d.ts', `${wgldts}\r\n${ES5Compatibility}`)
  } catch (error) {
    console.log(
      'ERROR: types for WGLScript at node_modules/@types/wglscript/lib.wglscript.d.ts not found'
    )
  }

  // TODO: добавить опцию расширения по укаащнию d.ts проекта, выкидывать предупреждение для подтягивания пакетов `npm i`
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

export function VSCodeSymbolKindToTSElementKind(
  symbolKind: vscode.SymbolKind
): ts.ScriptElementKind {
  switch (symbolKind) {
    case vscode.SymbolKind.Module:
      return ts.ScriptElementKind.moduleElement
    case vscode.SymbolKind.Class:
      return ts.ScriptElementKind.classElement
    case vscode.SymbolKind.Interface:
      return ts.ScriptElementKind.interfaceElement
    case vscode.SymbolKind.Struct:
      return ts.ScriptElementKind.typeElement
    case vscode.SymbolKind.Enum:
      return ts.ScriptElementKind.enumElement
    case vscode.SymbolKind.EnumMember:
      return ts.ScriptElementKind.enumMemberElement
    case vscode.SymbolKind.Variable:
      return ts.ScriptElementKind.variableElement
    case vscode.SymbolKind.Constant:
      return ts.ScriptElementKind.constElement
    case vscode.SymbolKind.Function:
      return ts.ScriptElementKind.functionElement
    case vscode.SymbolKind.Method:
      return ts.ScriptElementKind.memberFunctionElement
    case vscode.SymbolKind.Property:
      return ts.ScriptElementKind.memberVariableElement
    case vscode.SymbolKind.Constructor:
      return ts.ScriptElementKind.constructorImplementationElement
    case vscode.SymbolKind.Key:
      return ts.ScriptElementKind.indexSignatureElement
    case vscode.SymbolKind.TypeParameter:
      return ts.ScriptElementKind.typeParameterElement
    case vscode.SymbolKind.String:
      return ts.ScriptElementKind.string
    case vscode.SymbolKind.Object:
      return ts.ScriptElementKind.label
    case vscode.SymbolKind.Namespace:
      return ts.ScriptElementKind.alias
    case vscode.SymbolKind.Package:
      return ts.ScriptElementKind.directory
    default:
      return ts.ScriptElementKind.unknown
  }
}

export function TSOutliningSpanKindToVSCodeSymbolKind(
  el: ts.OutliningSpanKind
): vscode.FoldingRangeKind | undefined {
  switch (el) {
    case ts.OutliningSpanKind.Comment:
      return vscode.FoldingRangeKind.Comment
    case ts.OutliningSpanKind.Imports:
      return vscode.FoldingRangeKind.Imports
    case ts.OutliningSpanKind.Region:
      return vscode.FoldingRangeKind.Region
    default:
      return
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

export interface IBundleInfo {
  sourceMapGenerator: sm.SourceMapGenerator
  bundlePosition: sm.NullablePosition
  bundleContent: string
  entryContent: string
  entryAst: AST<TNode>
  map: sm.BasicSourceMapConsumer | sm.IndexedSourceMapConsumer
  env?: tsvfs.VirtualTypeScriptEnvironment
}

export const bundleInfoRepository = new Map<cUtils.TNormalizedPath, IBundleInfo>()

type TConsumer<T> = (props: IBundleInfo) => Promise<T> | T

interface IConsumeScriptModuleProps<T> {
  document: Pick<vscode.TextDocument, 'fileName'>

  projectRoot: string

  consumer: TConsumer<T>

  position?: Pick<vscode.Position, 'line' | 'character'>

  token?: undefined | vscode.CancellationToken | (vscode.CancellationToken | undefined)[]

  /**
   * get TypeScript {@link tsvfs.VirtualTypeScriptEnvironment virtual environment}
   * @default true
   */
  getTypeScriptEnvironment?: boolean

  /**
   * cache TypeScript {@link tsvfs.VirtualTypeScriptEnvironment virtual environment}
   * @default true
   */
  cacheTypeScriptEnvironment?: boolean

  /**
   * optional normalized path of TextDocument ot override source entry for proxies bundle position ({@link document} - default source)
   */
  source?: cUtils.TNormalizedPath

  /**
   * optional inject content before bundle
   */
  predefinedContent?: string

  compileOptions?: Partial<
    Pick<
      cUtils.CompileOptions,
      | 'treeShaking'
      | 'skipAttachDependencies'
      | 'skipAttachGlobalScript'
      | 'skipAttachNonImportStatements'
    >
  >
}

export async function consumeScriptModule<T>(
  props: IConsumeScriptModuleProps<T>
): Promise<T | undefined> {
  if (isCancelled(props.token)) return
  if (props.getTypeScriptEnvironment === undefined) props.getTypeScriptEnvironment = true
  if (props.cacheTypeScriptEnvironment === undefined) props.cacheTypeScriptEnvironment = true

  const entry = cUtils.normalizePath(props.document.fileName, props.projectRoot)
  let bundleContent = ''
  let sourceMapGenerator: sm.SourceMapGenerator
  let entryContent = ''
  let entryAst: AST<TNode> = []
  let map: sm.BasicSourceMapConsumer | sm.IndexedSourceMapConsumer | undefined
  let env: tsvfs.VirtualTypeScriptEnvironment | undefined = undefined

  const accessCacheBundleInfo = !(
    props.compileOptions?.treeShaking?.searchPattern ||
    props.compileOptions?.skipAttachDependencies ||
    props.compileOptions?.skipAttachGlobalScript ||
    props.predefinedContent
  )

  if (bundleInfoRepository.has(entry) && accessCacheBundleInfo) {
    const bundleInfo = bundleInfoRepository.get(entry) as IBundleInfo

    sourceMapGenerator = bundleInfo.sourceMapGenerator
    bundleContent = bundleInfo.bundleContent
    map = bundleInfo.map
    entryContent = bundleInfo.entryContent
    entryAst = bundleInfo.entryAst
    env = bundleInfo.env
  } else {
    const compilerOpts: cUtils.CompileOptions = Object.assign(
      { projectRoot: props.projectRoot, modules: [] },
      props.compileOptions
    )

    let sn = await compile(props.document.fileName, compilerOpts)

    sn = new sm.SourceNode(null, null, null, [
      `/**
 * Generated WGLScript bundle
 * Do not edit file
 */\n${props.predefinedContent || ''}\n`,
      sn
    ])

    if (isCancelled(props.token)) return

    const codeWithSourceMap = sn.toStringWithSourceMap({ file: entry })
    const snEntry = await compile(props.document.fileName, {
      projectRoot: props.projectRoot,
      modules: [],
      skipAttachDependencies: true,
      skipAttachGlobalScript: true
    })

    if (isCancelled(props.token)) return

    sourceMapGenerator = codeWithSourceMap.map
    bundleContent = codeWithSourceMap.code
    entryContent = snEntry.toStringWithSourceMap({ file: entry }).code
    map = await sm.SourceMapConsumer.fromSourceMap(codeWithSourceMap.map)
    entryAst = await cUtils.parseScriptModule(props.document.fileName, props.projectRoot)
  }

  if (isCancelled(props.token)) return

  let bundlePosition: sm.NullablePosition | undefined

  if (props.source === '/lib.d.ts') {
    bundlePosition = props.position
      ? { line: props.position.line + 1, column: props.position.character, lastColumn: null }
      : { line: -1, column: -1, lastColumn: -1 }
  } else {
    bundlePosition = props.position
      ? map.generatedPositionFor({
          source: props.source ?? entry.toLowerCase(),
          line: props.position.line + 1,
          column: props.position.character
        })
      : { line: -1, column: -1, lastColumn: -1 }

    if (
      !bundlePosition ||
      bundlePosition.line == null ||
      bundlePosition.column == null ||
      isCancelled(props.token)
    )
      return
  }

  const isNeedCacheBundleInfo = props.cacheTypeScriptEnvironment && accessCacheBundleInfo

  if (!env && props.getTypeScriptEnvironment) {
    const fsMap = attachFsMap(props.projectRoot)
    fsMap.set(bundle, bundleContent)

    const system = tsvfs.createSystem(fsMap)
    // TODO: последний аргумент customTransformer изучить и прокинуть регистронезависимость для встроенных функций
    // TODO: сохранять диагностику на CallExpressionAssignment
    env = libUtils.logtime(
      tsvfs.createVirtualTypeScriptEnvironment,
      system,
      [bundle],
      ts,
      compilerOpts
    )

    if (isNeedCacheBundleInfo) {
      bundleInfoRepository.set(entry, {
        sourceMapGenerator,
        bundlePosition,
        bundleContent,
        entryContent,
        entryAst,
        map,
        env
      })
    }
  }

  const p = { bundlePosition, bundleContent, sourceMapGenerator, entryContent, entryAst, map, env }
  const resolve = await props.consumer(p)

  if (!isNeedCacheBundleInfo) env = undefined
  if (isCancelled(props.token)) return

  return resolve
}

export const moduleSymbolsRepository = new Map<
  cUtils.TNormalizedPath,
  (Pick<vscode.SymbolInformation, 'name' | 'kind' | 'containerName'> & {
    fileName: string
    line: number
    character: number
  })[]
>()

export function track<T extends object>(obj: T) {
  const methodHandler = {
    // biome-ignore lint/complexity/noBannedTypes: <explanation>
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    apply(target: Function, thisArg: any, argumentsList: any[]) {
      // const methodName = target.name || 'anonymous function'
      // const start = performance.now()

      const result = Reflect.apply(target, thisArg, argumentsList)

      if (result instanceof Promise) {
        return result.then(res => {
          // console.log(
          //   `DEBUG execution time ${methodName} ${Math.round((performance.now() - start) * 100) / 100}ms`
          // )
          return res
        })
      }

      // console.log(
      //   `DEBUG execution time ${methodName} ${Math.round((performance.now() - start) * 100) / 100}ms`
      // )
      return result
    }
  }

  return new Proxy(obj, {
    get(target, prop: string | symbol, receiver) {
      const originalProperty = Reflect.get(target, prop, receiver)

      if (typeof originalProperty === 'function') {
        return new Proxy(originalProperty, methodHandler)
      }

      // console.log(`Property "${String(prop)}" was read with value: ${originalProperty}`)

      return originalProperty
    }
  })
}

export async function getGlobalDeps(projectRoot: string) {
  const globalScript = path.join(projectRoot, libUtils.getExtOption<string>('globalScript.path'))

  const globalDeps =
    (await consumeScriptModule({
      document: { fileName: globalScript },
      projectRoot,
      consumer: c => c.map.sources
    })) || []

  return globalDeps
}

export class WGLBuildTaskTerminal implements vscode.Pseudoterminal {
  private writeEmitter = new vscode.EventEmitter<string>()
  onDidWrite: vscode.Event<string> = this.writeEmitter.event
  private closeEmitter = new vscode.EventEmitter<number>()
  onDidClose?: vscode.Event<number> = this.closeEmitter.event
  async open(): Promise<void> {
    const activeTE = vscode.window.activeTextEditor

    if (!activeTE || activeTE.document.languageId !== 'javascript') {
      this.writeEmitter.fire('Failed: you should open WGLScript document\r\n')
      this.closeEmitter.fire(1)
      return
    }

    const wsPath = vscode.workspace.getWorkspaceFolder(activeTE.document.uri)?.uri.fsPath

    if (!wsPath) {
      this.writeEmitter.fire(
        'Failed: you should open WGLScript project in VS Code explorer via Workspace Folder\r\n'
      )
      this.closeEmitter.fire(1)
      return
    }

    const [bundle, _, smGen] = await intellisense.getBundle(
      activeTE.document,
      wsPath,
      activeTE.selection.active
    )

    if (!smGen) {
      this.writeEmitter.fire('Failed generate source map. Exit 1\r\n')
      this.closeEmitter.fire(1)
      return
    }

    const sourceMap = smGen?.toJSON()
    sourceMap.sourceRoot = '../../../' // root access

    const debugDir = path.join(wsPath, '.vscode', 'wgl-toolchain', 'debug')
    if (!fs.existsSync(debugDir)) {
      fs.mkdirSync(debugDir, { recursive: true })
    }

    const bundleContent = `${bundle}\n//# sourceMappingURL=bundle.js.map`

    fs.writeFileSync(path.join(debugDir, 'bundle.js'), bundleContent, { flag: 'w' })
    fs.writeFileSync(path.join(debugDir, 'bundle.js.map'), JSON.stringify(sourceMap), { flag: 'w' })

    this.writeEmitter.fire('Success\r\n')
    this.closeEmitter.fire(0)

    vscode.commands.executeCommand('workbench.debug.action.toggleRepl')
  }
  close(): void {}
}

export function injectNativeAddonPolyfill(projectRoot: string) {
  const addon = libUtils.getExtOption<string>('nativeAddon.path')
  if (addon && fs.existsSync(path.join(projectRoot, addon))) {
    return `const ___$NativeAddon = require('${path.join(projectRoot, addon).replace(/\\/g, '/').slice(0, -5)}')
Object.assign(global, ___$NativeAddon)
Object.assign(global, ___$NativeAddon.Consts)`
  }
}
