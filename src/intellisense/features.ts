import * as fs from 'fs'
import * as path from 'path'
import * as prettier from 'prettier'
import * as sm from 'source-map'
import * as ts from 'typescript'
import * as vscode from 'vscode'
import * as cUtils from '../compiler/utils'
import * as libUtils from '../utils'
import * as utils from './utils'

import type * as wgl from './wglscript'

import { compile } from '../compiler/compiler'

export async function getDefinitionInfoAtPosition(
  document: Pick<vscode.TextDocument, 'fileName'>,
  position: Pick<vscode.Position, 'line' | 'character'>,
  projectRoot: string,
  token?: vscode.CancellationToken
): Promise<wgl.SymbolEntry[]> {
  if (token?.isCancellationRequested) return []

  const sn = await compile(document.fileName, { projectRoot, modules: [] })

  if (token?.isCancellationRequested) return []

  const strWSM = sn.toStringWithSourceMap({
    file: cUtils.normalizePath(document.fileName, projectRoot)
  })

  let pos: sm.NullablePosition = { line: null, column: null, lastColumn: null }
  await sm.SourceMapConsumer.with(strWSM.map.toJSON(), null, consumer => {
    pos = consumer.generatedPositionFor({
      source: cUtils.normalizePath(document.fileName, projectRoot),
      line: position.line + 1,
      column: position.character
    })
  })

  if (pos.line == null || pos.column == null || token?.isCancellationRequested) return []
  // ;(await import('fs')).writeFileSync(`${document.fileName}.b.js`, strWSM.code)

  const env = libUtils.logtime(utils.getVTSEnv, projectRoot, strWSM.code)

  if (token?.isCancellationRequested) return []

  const D = libUtils.logtime(
    env.languageService.getDefinitionAtPosition,
    utils.bundle,
    ts.getPositionOfLineAndCharacter(
      env.getSourceFile(utils.bundle) as ts.SourceFileLike,
      pos.line - 1,
      position.character
    )
  )

  if (D === undefined || !D.length || token?.isCancellationRequested) return []

  const sourceD: wgl.SymbolEntry[] = []
  const forConsumer: [ts.DefinitionInfo, ts.LineAndCharacter][] = []
  for (const di of D) {
    const sf = env.getSourceFile(di.fileName) as ts.SourceFileLike
    const lnCh = ts.getLineAndCharacterOfPosition(sf, di.textSpan.start)

    if (di.fileName === utils.bundle) {
      forConsumer.push([di, lnCh])
      continue
    }

    const source = path.join('node_modules', '@types', 'wglscript', 'generated', di.fileName)
    const { line, character: column } = lnCh
    sourceD.push({ source, line, column, length: di.textSpan.length })
  }

  await sm.SourceMapConsumer.with(strWSM.map.toJSON(), null, consumer => {
    forConsumer.map(record => {
      const lnCh = record[1]
      const { line: ln, character: col } = record[1]
      const length = record[0].textSpan.length
      const { source, line: orLn } = consumer.originalPositionFor({ line: ln + 1, column: col + 1 })

      if (source == null || orLn == null) return
      sourceD.push({ source, line: orLn - 1, column: lnCh.character, length })
    })
  })

  if (token?.isCancellationRequested) return []

  return sourceD
}

export async function getCompletionsAtPosition(
  document: Pick<vscode.TextDocument, 'fileName'>,
  position: Pick<vscode.Position, 'line' | 'character'>,
  projectRoot: string,
  token?: vscode.CancellationToken
): Promise<vscode.ProviderResult<vscode.CompletionItem[]>> {
  if (token?.isCancellationRequested) return []

  const sourceNode = await compile(document.fileName, { projectRoot, modules: [] })

  if (token?.isCancellationRequested) return []

  const strWSM = sourceNode.toStringWithSourceMap({
    file: cUtils.normalizePath(document.fileName, projectRoot)
  })

  let pos: sm.NullablePosition = { line: null, column: null, lastColumn: null }
  await sm.SourceMapConsumer.with(strWSM.map.toJSON(), null, consumer => {
    pos = consumer.generatedPositionFor({
      source: cUtils.normalizePath(document.fileName, projectRoot),
      line: position.line + 1,
      column: position.character
    })
  })

  if (pos.line == null || pos.column == null || token?.isCancellationRequested) return []

  const env = libUtils.logtime(utils.getVTSEnv, projectRoot, strWSM.code)

  if (token?.isCancellationRequested) return []

  const C = libUtils.logtime(
    env.languageService.getCompletionsAtPosition,
    utils.bundle,
    ts.getPositionOfLineAndCharacter(
      env.getSourceFile(utils.bundle) as ts.SourceFileLike,
      pos.line - 1,
      position.character
    ),
    { triggerKind: ts.CompletionTriggerKind.TriggerCharacter },
    ts.getDefaultFormatCodeSettings()
  )

  if (C === undefined || !C.entries.length || token?.isCancellationRequested) return []

  if (token?.isCancellationRequested) []

  return C.entries.map<vscode.CompletionItem>(({ name: label, sortText, kind }) => ({
    kind: utils.TSElementKindtoVSCodeCompletionItemKind(kind),
    sortText,
    label
  }))
}

export async function getCompletionEntryDetails(
  document: Pick<vscode.TextDocument, 'fileName'>,
  position: Pick<vscode.Position, 'line' | 'character'>,
  completionItemLabel: string,
  projectRoot: string,
  token?: vscode.CancellationToken
): Promise<vscode.ProviderResult<vscode.CompletionItem>> {
  if (token?.isCancellationRequested) return

  const sourceNode = await compile(document.fileName, { projectRoot, modules: [] })
  const strWSM = sourceNode.toStringWithSourceMap({
    file: cUtils.normalizePath(document.fileName, projectRoot)
  })

  if (token?.isCancellationRequested) return

  let pos: sm.NullablePosition = { line: null, column: null, lastColumn: null }
  await sm.SourceMapConsumer.with(strWSM.map.toJSON(), null, consumer => {
    pos = consumer.generatedPositionFor({
      source: cUtils.normalizePath(document.fileName, projectRoot),
      line: position.line + 1,
      column: position.character
    })
  })

  if (pos.line == null || pos.column == null || token?.isCancellationRequested) return

  const env = libUtils.logtime(utils.getVTSEnv, projectRoot, strWSM.code)

  if (token?.isCancellationRequested) return

  const D = libUtils.logtime(
    env.languageService.getCompletionEntryDetails,
    utils.bundle,
    ts.getPositionOfLineAndCharacter(
      env.getSourceFile(utils.bundle) as ts.SourceFileLike,
      pos.line - 1,
      position.character
    ),
    completionItemLabel,
    ts.getDefaultFormatCodeSettings(),
    undefined,
    undefined,
    undefined
  )

  if (D === undefined || token?.isCancellationRequested) return

  return {
    label: D.name,
    kind: utils.TSElementKindtoVSCodeCompletionItemKind(D.kind),
    detail: (D.displayParts || []).map(p => p.text).join(''),
    documentation: new vscode.MarkdownString()
      .appendMarkdown((D.documentation || []).map(p => p.text).join(''))
      .appendMarkdown('\r\n\r\n')
      .appendMarkdown((D.tags || []).map(utils.prettifyJSDoc).join('\r\n\r\n'))
  }
}

export async function getQuickInfoAtPosition(
  document: Pick<vscode.TextDocument, 'fileName'>,
  position: Pick<vscode.Position, 'line' | 'character'>,
  projectRoot: string,
  token?: vscode.CancellationToken
): Promise<vscode.MarkdownString[]> {
  if (token?.isCancellationRequested) return []

  const sourceNode = await compile(document.fileName, { projectRoot, modules: [] })
  const strWSM = sourceNode.toStringWithSourceMap({
    file: cUtils.normalizePath(document.fileName, projectRoot)
  })

  if (token?.isCancellationRequested) return []

  let pos: sm.NullablePosition = { line: null, column: null, lastColumn: null }
  await sm.SourceMapConsumer.with(strWSM.map.toJSON(), null, consumer => {
    pos = consumer.generatedPositionFor({
      source: cUtils.normalizePath(document.fileName, projectRoot),
      line: position.line + 1,
      column: position.character
    })
  })

  if (pos.line == null || pos.column == null || token?.isCancellationRequested) return []

  const env = libUtils.logtime(utils.getVTSEnv, projectRoot, strWSM.code)

  if (token?.isCancellationRequested) return []

  const QI = libUtils.logtime(
    env.languageService.getQuickInfoAtPosition,
    utils.bundle,
    ts.getPositionOfLineAndCharacter(
      env.getSourceFile(utils.bundle) as ts.SourceFileLike,
      pos.line - 1,
      position.character
    )
  )

  if (QI === undefined || token?.isCancellationRequested) return []

  return [
    new vscode.MarkdownString()
      .appendCodeblock((QI.displayParts || []).map(p => p.text).join(''), 'typescript')
      .appendMarkdown((QI.documentation || []).map(p => p.text).join(''))
      .appendMarkdown('\r\n\r\n')
      .appendMarkdown((QI.tags || []).map(utils.prettifyJSDoc).join('\r\n\r\n'))
  ]
}

export async function getSignatureHelpItems(
  document: Pick<vscode.TextDocument, 'fileName'>,
  position: Pick<vscode.Position, 'line' | 'character'>,
  projectRoot: string,
  token?: vscode.CancellationToken
  // TODO: все фичи привести к одному АПИ
): Promise<vscode.ProviderResult<vscode.SignatureHelp>> {
  if (token?.isCancellationRequested) return

  const sourceNode = await compile(document.fileName, { projectRoot, modules: [] })
  const strWSM = sourceNode.toStringWithSourceMap({
    file: cUtils.normalizePath(document.fileName, projectRoot)
  })

  if (token?.isCancellationRequested) return

  let pos: sm.NullablePosition = { line: null, column: null, lastColumn: null }
  await sm.SourceMapConsumer.with(strWSM.map.toJSON(), null, consumer => {
    pos = consumer.generatedPositionFor({
      source: cUtils.normalizePath(document.fileName, projectRoot),
      line: position.line + 1,
      column: position.character
    })
  })

  if (pos.line == null || pos.column == null || token?.isCancellationRequested) return

  const env = libUtils.logtime(utils.getVTSEnv, projectRoot, strWSM.code)

  if (token?.isCancellationRequested) return

  const H = libUtils.logtime(
    env.languageService.getSignatureHelpItems,
    utils.bundle,
    ts.getPositionOfLineAndCharacter(
      env.getSourceFile(utils.bundle) as ts.SourceFileLike,
      pos.line - 1,
      position.character
    ),
    {
      triggerReason: { kind: 'retrigger' }
    }
  )

  if (H === undefined || !H.items.length || token?.isCancellationRequested) return

  const signatures = H.items.map<vscode.SignatureInformation>(i => ({
    label:
      i.prefixDisplayParts.map(p => p.text).join('') +
      i.parameters.map(p => p.displayParts.map(d => d.text).join('')).join(', ') +
      i.suffixDisplayParts.map(p => p.text).join(''),
    parameters: i.parameters.map(p => ({ label: p.displayParts.map(d => d.text).join('') })),
    documentation: new vscode.MarkdownString()
      .appendMarkdown(i.documentation.map(d => d.text).join(''))
      .appendMarkdown('\r\n\r\n')
      .appendMarkdown(i.tags.map(utils.prettifyJSDoc).join('\r\n\r\n'))
  }))

  return {
    signatures,
    activeSignature: 0,
    activeParameter: H.argumentIndex
  }
}

/**
 * Find All References to a Symbol in ScriptModule/Bundle context
 * @param document entry TextDocument to compile
 * @param position position of request
 * @param projectRoot root system path of project
 * @param token optional cancellation token
 * @param source optional normalized path of TextDocument ot override source entry for proxies bundle position ({@link document} - default source)
 */
export async function getReferencesAtPosition(
  document: Pick<vscode.TextDocument, 'fileName'>,
  position: Pick<vscode.Position, 'line' | 'character'>,
  projectRoot: string,
  token?: undefined | vscode.CancellationToken | (vscode.CancellationToken | undefined)[],
  source?: cUtils.TNormalizedPath,
  clearVTS?: boolean
): Promise<wgl.SymbolEntry[]> {
  if (utils.isCancelled(token)) return []

  const sourceNode = await compile(document.fileName, { projectRoot, modules: [] })
  const strWSM = sourceNode.toStringWithSourceMap({
    file: cUtils.normalizePath(document.fileName, projectRoot)
  })

  if (utils.isCancelled(token)) return []

  let pos: sm.NullablePosition = { line: null, column: null, lastColumn: null }
  await sm.SourceMapConsumer.with(strWSM.map.toJSON(), null, consumer => {
    pos = consumer.generatedPositionFor({
      source: source ?? cUtils.normalizePath(document.fileName, projectRoot),
      line: position.line + 1,
      column: position.character
    })
  })

  if (pos.line == null || pos.column == null || utils.isCancelled(token)) return []

  const env = libUtils.logtime(
    utils.getVTSEnv,
    projectRoot,
    strWSM.code,
    clearVTS ? false : undefined
  )

  if (utils.isCancelled(token)) return []

  const R = libUtils.logtime(
    env.languageService.getReferencesAtPosition,
    utils.bundle,
    ts.getPositionOfLineAndCharacter(
      env.getSourceFile(utils.bundle) as ts.SourceFileLike,
      pos.line - 1,
      position.character
    )
  )

  if (R === undefined || !R.length || utils.isCancelled(token)) return []

  const sourceR: wgl.SymbolEntry[] = []
  const forConsumer: [ts.ReferenceEntry, ts.LineAndCharacter][] = []
  for (const br of R) {
    const sf = env.getSourceFile(br.fileName) as ts.SourceFileLike
    const lnCh = libUtils.logtime(ts.getLineAndCharacterOfPosition, sf, br.textSpan.start)

    if (br.fileName === utils.bundle) {
      forConsumer.push([br, lnCh])
    } else {
      const { line, character: column } = lnCh
      const source = path.join('node_modules', '@types', 'wglscript', 'generated', br.fileName)
      sourceR.push({ source, line, column, length: br.textSpan.length })
    }
  }

  await sm.SourceMapConsumer.with(strWSM.map.toJSON(), null, consumer => {
    forConsumer.map(record => {
      const length = record[0].textSpan.length
      const { line: ln, character: column } = record[1]
      const { line, source } = consumer.originalPositionFor({ line: ln + 1, column: column + 1 })

      if (source == null || line == null) return
      sourceR.push({ source, column, length, line: line - 1 })
    })
  })

  if (utils.isCancelled(token)) return []

  return sourceR
}

export async function getNavigationBarItems(
  document: Pick<vscode.TextDocument, 'fileName'>,
  projectRoot: string,
  token?: vscode.CancellationToken,
  includeWorkspaceSymbols?: true
): Promise<vscode.ProviderResult<vscode.SymbolInformation[]>> {
  if (token?.isCancellationRequested) return

  const sourceNode = await compile(document.fileName, { projectRoot, modules: [] })
  const documentN = cUtils.normalizePath(document.fileName, projectRoot)
  const strWSM = sourceNode.toStringWithSourceMap({
    file: cUtils.normalizePath(document.fileName, projectRoot)
  })

  if (token?.isCancellationRequested) return

  const env = libUtils.logtime(utils.getVTSEnv, projectRoot, strWSM.code)
  const NT = [libUtils.logtime(env.languageService.getNavigationTree, utils.bundle)]

  if (NT === undefined || !NT.length || token?.isCancellationRequested) return

  const sourceSymbols: vscode.SymbolInformation[] = []
  const sf = env.getSourceFile(utils.bundle) as ts.SourceFileLike
  const forConsumer: Array<{
    item: ts.NavigationTree
    start: ts.LineAndCharacter
    end: ts.LineAndCharacter
    container?: string
  }> = []

  function collectNavBarItemsWithLineAndCharacter(items: ts.NavigationTree[], container?: string) {
    if (token?.isCancellationRequested) return

    for (const item of items) {
      const pos = item.spans.at(0)

      if (pos) {
        const start = ts.getLineAndCharacterOfPosition(sf, pos.start)
        const end = ts.getLineAndCharacterOfPosition(sf, pos.start + pos.length)
        container && forConsumer.push({ item, start, end, container })
      }

      if (item.childItems) collectNavBarItemsWithLineAndCharacter(item.childItems, item.text)
    }
  }

  collectNavBarItemsWithLineAndCharacter(NT)

  await sm.SourceMapConsumer.with(strWSM.map.toJSON(), null, consumer => {
    forConsumer.map(({ start, end, item, container }) => {
      if (token?.isCancellationRequested) return

      const posS = consumer.originalPositionFor({
        line: start.line + 1,
        column: start.character + 1
      })

      if (posS.source == null || posS.line == null) return
      if (posS.source !== documentN && !includeWorkspaceSymbols) return

      const posE = consumer.originalPositionFor({
        line: end.line + 1,
        column: end.character + 1
      })

      if (posE.source == null || posE.line == null) return
      if (posE.source !== documentN && !includeWorkspaceSymbols) return

      sourceSymbols.push(
        new vscode.SymbolInformation(
          item.text,
          utils.TSElementKindtoVSCodeSymbolKind(item.kind),
          container ?? '',
          new vscode.Location(
            vscode.Uri.file(path.join(projectRoot, posS.source)),
            new vscode.Range(posS.line - 1, start.character, posE.line - 1, end.character)
          )
        )
      )
    })
  })

  if (token?.isCancellationRequested) return

  return sourceSymbols
}

/**
 * Find All References to a Symbol in whole project
 * @param document entry TextDocument to compile
 * @param position position of request
 * @param projectRoot root system path of project
 * @param token optional cancellation token
 */
export async function getReferencesAtPositionInProject(
  document: Pick<vscode.TextDocument, 'fileName'>,
  position: Pick<vscode.Position, 'line' | 'character'>,
  projectRoot: string,
  token?: vscode.CancellationToken,
  searchPattern?: RegExp
): Promise<wgl.SymbolEntry[]> {
  const definitions = await getDefinitionInfoAtPosition(document, position, projectRoot, token)

  if (!definitions.length || utils.isCancelled(token)) return []

  // 1 глобальный скрипт определен
  const globalScript = path.join(projectRoot, libUtils.getExtOption<string>('globalScript.path'))
  const globalScriptN = cUtils.normalizePath(globalScript, projectRoot)

  if (!fs.existsSync(globalScript)) {
    console.log(
      `INFO: Global script module ${globalScriptN} not exists. Get references at position in project not available.`
    )
    return definitions
  }

  const sourceNode = await compile(globalScript, { projectRoot, modules: [] })
  const strWSM = sourceNode.toStringWithSourceMap({
    file: libUtils.getExtOption<string>('globalScript.path')
  })
  const globalDeps = (await new sm.SourceMapConsumer(strWSM.map.toString())).sources
  const D = definitions[0]

  // 1.1 дефинишн находится в либе .d.ts
  if (D.source.match('node_modules\\\\@types')) {
    // TODO: обратно запроксировать позицию в tsvfs (=> /lib.d.ts), поднять референсы также как в других флоу ниже
    return await getReferencesAtPosition(document, position, projectRoot, token)
  }

  let modules: cUtils.TNormalizedPath[]
  if (globalDeps.includes(D.source)) {
    // 1.2 дефинишн находится в глобалскрипте
    // TODO: исключить зависимости глобалскрипта, нужен хойстинг по полученным файлам
    modules = await utils.getJsFiles(projectRoot, searchPattern)
    modules
  } else {
    // 1.3 дефинишн находится в локальном скрипте
    modules = await getModuleReferences(
      D.source,
      projectRoot,
      token,
      false /** init */,
      searchPattern
    )
  }

  const modulesLen = modules.length
  const extModulesLenOption = libUtils.getExtOption<number>(
    'intellisense.requestDepthStrategy.sliceModuleReferencesLength'
  )

  let postfix = ''
  if (modulesLen > extModulesLenOption) {
    modules = utils.chunkedArray(modules, extModulesLenOption)[0]
    postfix = ` (${modulesLen - modules.length} skipped)`
  }

  const projectRefs = new Set<string>()
  let state = 0
  let lastReportedTime = Date.now()

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Window,
      cancellable: true,
      title: 'WGLToolchain'
    },
    async (p, t) => {
      if (utils.isCancelled([token, t])) return

      p.report({ message: `Processing script modules ${state}/${modules.length}${postfix}` })
      const threads = libUtils.getExtOption<number>('intellisense.typescriptThreads')

      for (const chunk of utils.chunkedArray(modules, threads)) {
        if (utils.isCancelled([token, t])) break
        await Promise.all(
          chunk.map(async module => {
            if (utils.isCancelled([token, t])) return

            for (const { source, line, column, length } of await getReferencesAtPosition(
              { fileName: path.join(projectRoot, module) },
              { line: D.line, character: D.column },
              projectRoot,
              [token, t],
              D.source,
              true /** clear VTS after request */
            )) {
              if (utils.isCancelled([token, t])) break
              projectRefs.add(JSON.stringify({ source, line, column, length }))
            }

            state++
            const now = Date.now()
            if (!(now - lastReportedTime > 200)) return
            p.report({ message: `Processing script modules ${state}/${modules.length}${postfix}` })
            lastReportedTime = now
          })
        )
      }
    }
  )

  if (utils.isCancelled(token)) return []
  return Array.from(projectRefs.values()).map<wgl.SymbolEntry>(r => JSON.parse(r))
}

export const moduleReferencesStorage = new Map<cUtils.TNormalizedPath, cUtils.TNormalizedPath[]>()
export const modulesWithError = new Set<string>()

/**
 * Get module references
 * @param module module to search for links
 * @param projectRoot root system path of project
 * @param token optional cancellation token
 * @returns
 */
export async function getModuleReferences(
  module: cUtils.TNormalizedPath,
  projectRoot: string,
  token?: vscode.CancellationToken,
  init?: boolean,
  searchPattern?: RegExp
): Promise<cUtils.TNormalizedPath[]> {
  if (token?.isCancellationRequested) return []

  // TODO: здесь теряется хоистинг
  let scripts: Array<cUtils.TNormalizedPath> = await utils.getJsFiles(projectRoot, searchPattern)

  scripts

  if (moduleReferencesStorage.size) {
    const traversedScripts: Array<cUtils.TNormalizedPath> = []
    for (const [_, deps] of moduleReferencesStorage) for (const d of deps) traversedScripts.push(d)
    scripts = scripts.filter(s => !traversedScripts.includes(s) && !modulesWithError.has(s))
  }

  let lastReportedTime = Date.now()
  let state = 0

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Window,
      cancellable: true,
      title: 'WGLToolchain'
    },
    async (p, t) => {
      await Promise.all(
        scripts.map(s =>
          utils.isCancelled([token, t])
            ? null
            : cUtils
                .parseScriptModule(path.join(projectRoot, s), projectRoot)
                .then(() => {
                  state++
                  const now = Date.now()
                  if (!(now - lastReportedTime > 200)) return
                  p.report({
                    message: `${init ? 'Initialize features. ' : ''}Parsing ${state}/${scripts.length}`
                  })
                  lastReportedTime = now
                })
                .catch(error => {
                  modulesWithError.add(s)
                  console.log(`ERROR: ${error}`)
                })
        )
      )
    }
  )

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Window,
      cancellable: true,
      title: 'WGLToolchain'
    },
    async (p, t) => {
      state = 0
      p.report({
        message: `${init ? 'Initialize features. ' : ''}Building ${state}/${scripts.length}`
      })

      const globalScript = path.join(
        projectRoot,
        libUtils.getExtOption<string>('globalScript.path')
      )
      const sourceNode = await compile(globalScript, { projectRoot, modules: [] })
      const strWSM = sourceNode.toStringWithSourceMap({
        file: libUtils.getExtOption<string>('globalScript.path')
      })
      const globalDeps = (await new sm.SourceMapConsumer(strWSM.map.toString())).sources
      const threads = libUtils.getExtOption<number>('intellisense.buildThreads')

      for (const chunk of utils.chunkedArray(scripts, threads)) {
        if (utils.isCancelled([token, t])) break
        await Promise.all(
          chunk.map(script =>
            utils.isCancelled([token, t])
              ? null
              : compile(path.join(projectRoot, script), {
                  projectRoot,
                  modules: [...globalDeps],
                  skipAttachGlobalScript: true
                })
                  .then(sn => sn.toStringWithSourceMap({ file: script }))
                  .then(strWSM => new sm.SourceMapConsumer(strWSM.map.toString()))
                  .then(map => {
                    state++
                    const now = Date.now()
                    if (now - lastReportedTime > 200) {
                      p.report({
                        message: `${init ? 'Initialize features. ' : ''}Building ${state}/${scripts.length}`
                      })
                      lastReportedTime = now
                    }
                    const deps = [...map.sources]
                    map.destroy()
                    moduleReferencesStorage.set(script, deps)
                  })
                  .catch(error => {
                    modulesWithError.add(script)
                    console.log(`ERROR: ${error}`)
                  })
          )
        )
      }
    }
  )

  if (token?.isCancellationRequested) return []

  const moduleReferences: cUtils.TNormalizedPath[] = []

  for (const [entry, deps] of moduleReferencesStorage)
    for (const d of deps)
      if (entry !== d && moduleReferencesStorage.has(d)) moduleReferencesStorage.delete(d)

  for (const [entry, deps] of moduleReferencesStorage)
    if (deps.find(d => d === module)) moduleReferences.push(entry)

  return moduleReferences
}

export async function getSemanticDiagnostics(
  document: Pick<vscode.TextDocument, 'fileName'>,
  projectRoot: string,
  version: number
): Promise<Map<cUtils.TNormalizedPath, vscode.Diagnostic[]> | undefined> {
  if (vscode.window.activeTextEditor?.document.version !== version) return

  const sourceNode = await compile(document.fileName, { projectRoot, modules: [] })
  const documentN = cUtils.normalizePath(document.fileName, projectRoot)

  if (vscode.window.activeTextEditor?.document.version !== version) return

  const strWSM = sourceNode.toStringWithSourceMap({ file: documentN })
  const env = libUtils.logtime(utils.getVTSEnv, projectRoot, strWSM.code)

  if (vscode.window.activeTextEditor?.document.version !== version) return

  const semanticD = libUtils.logtime(env.languageService.getSemanticDiagnostics, utils.bundle)
  const syntacticD = libUtils.logtime(env.languageService.getSyntacticDiagnostics, utils.bundle)
  const sourceD = new Map<cUtils.TNormalizedPath, vscode.Diagnostic[]>()
  const allowedErrorCodes = libUtils.getExtOption<number[]>(
    'intellisense.diagnostics.allowedErrorCodes'
  )
  const forConsumer: {
    code: number
    message: string
    category: vscode.DiagnosticSeverity
    start: ts.LineAndCharacter
    end: ts.LineAndCharacter
  }[] = []

  for (const d of syntacticD) {
    if (
      !d.file ||
      !d.start ||
      d.file.fileName !== utils.bundle ||
      !d.length ||
      d.start < cUtils.gls.code.length /** location at global script */
    )
      continue

    if (vscode.window.activeTextEditor?.document.version !== version) break

    const start = libUtils.logtime(ts.getLineAndCharacterOfPosition, d.file, d.start)
    const end = libUtils.logtime(ts.getLineAndCharacterOfPosition, d.file, d.start + d.length)
    forConsumer.push({
      message: typeof d.messageText === 'string' ? d.messageText : d.messageText.messageText,
      category: allowedErrorCodes.includes(d.code)
        ? vscode.DiagnosticSeverity.Warning
        : utils.TSDiagnosticCategoryToVSCodeDiagnosticSeverity(d.category),
      code: d.code,
      start,
      end
    })
  }

  for (const d of semanticD) {
    if (
      !d.file ||
      !d.start ||
      d.file.fileName !== utils.bundle ||
      !d.length ||
      d.start < cUtils.gls.code.length /** location at global script */
    )
      continue

    if (vscode.window.activeTextEditor?.document.version !== version) break

    const start = libUtils.logtime(ts.getLineAndCharacterOfPosition, d.file, d.start)
    const end = libUtils.logtime(ts.getLineAndCharacterOfPosition, d.file, d.start + d.length)
    forConsumer.push({
      message: typeof d.messageText === 'string' ? d.messageText : d.messageText.messageText,
      category: allowedErrorCodes.includes(d.code)
        ? vscode.DiagnosticSeverity.Warning
        : utils.TSDiagnosticCategoryToVSCodeDiagnosticSeverity(d.category),
      code: d.code,
      start,
      end
    })
  }

  if (vscode.window.activeTextEditor?.document.version !== version) return

  await sm.SourceMapConsumer.with(strWSM.map.toJSON(), null, consumer => {
    for (const { start, end, category, code, message } of forConsumer) {
      if (vscode.window.activeTextEditor?.document.version !== version) break

      const posS = consumer.originalPositionFor({
        line: start.line + 1,
        column: start.character + 1
      })

      const posE = consumer.originalPositionFor({
        line: end.line + 1,
        column: end.character + 1
      })

      if (posS.source == null || posS.line == null) continue
      if (posE.source == null || posE.line == null) continue

      // TODO: сделать опцию в настройках расширения "стратегия запроса диагностик"
      if (posS.source !== documentN) continue

      if (!sourceD.has(posS.source)) sourceD.set(posS.source, [])

      const entry = sourceD.get(posS.source) as vscode.Diagnostic[]

      entry.push({
        code,
        message,
        severity: category,
        source: 'WGLScript',
        range: new vscode.Range(posS.line - 1, start.character, posE.line - 1, end.character)
      })
    }
  })

  if (vscode.window.activeTextEditor?.document.version !== version) return

  return sourceD
}

export async function getFormattingEditsForDocument(
  document: Pick<vscode.TextDocument, 'fileName'>,
  projectRoot: string,
  endPos: vscode.Position,
  token?: vscode.CancellationToken
): Promise<vscode.ProviderResult<vscode.TextEdit[]>> {
  if (token?.isCancellationRequested) return

  const sourceNode = await compile(document.fileName, {
    projectRoot,
    modules: [],
    skipAttachDependencies: true,
    skipAttachGlobalScript: true
  })
  const strWSM = sourceNode.toStringWithSourceMap({
    file: cUtils.normalizePath(document.fileName, projectRoot)
  })

  if (token?.isCancellationRequested) return

  let config = await prettier.resolveConfig(path.join(projectRoot, '.prettierrc'))

  if (config) config = { ...config, parser: 'typescript' }
  else config = { parser: 'typescript' }

  return [
    {
      newText: await prettier.format(strWSM.code, config),
      range: new vscode.Range(0, 0, endPos.line, endPos.character + 1)
    }
  ]
}
