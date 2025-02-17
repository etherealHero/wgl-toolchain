import * as fs from 'fs'
import * as path from 'path'
import * as sm from 'source-map'
import * as ts from 'typescript'
import * as vscode from 'vscode'
import type * as wgl from './wglscript'

import * as ignore from 'ignore'
import { compile } from '../compiler/compiler'
import { type TNormalizedPath, normalizePath, parseScriptModule } from '../compiler/utils'
import { getConfigurationOption, logtime } from '../utils'
import {
  TSElementKindtoVSCodeCompletionItemKind,
  TSElementKindtoVSCodeSymbolKind,
  bundle,
  getVTSEnv,
  prettifyJSDoc
} from './utils'

export async function getDefinitionInfoAtPosition(
  document: Pick<vscode.TextDocument, 'fileName'>,
  position: Pick<vscode.Position, 'line' | 'character'>,
  projectRoot: string,
  token?: vscode.CancellationToken
): Promise<wgl.SymbolEntry[]> {
  if (token?.isCancellationRequested) return []

  const sourceNode = await compile(document.fileName, { projectRoot, modules: [] })

  if (token?.isCancellationRequested) return []

  const strWSM = sourceNode.toStringWithSourceMap({
    file: normalizePath(document.fileName, projectRoot)
  })

  let bundlePosition: sm.NullablePosition = { line: null, column: null, lastColumn: null }
  await sm.SourceMapConsumer.with(strWSM.map.toJSON(), null, consumer => {
    bundlePosition = consumer.generatedPositionFor({
      source: normalizePath(document.fileName, projectRoot),
      line: position.line + 1, // vs-code 0-based
      column: position.character
    })
  })

  if (
    bundlePosition.line == null ||
    bundlePosition.column == null ||
    token?.isCancellationRequested
  )
    return []
  // ;(await import('fs')).writeFileSync(`${document.fileName}.b.js`, strWSM.code)

  const env = logtime(getVTSEnv, projectRoot, strWSM.code)

  if (token?.isCancellationRequested) return []

  const bundleDefinitionInfo = logtime(
    env.languageService.getDefinitionAtPosition,
    bundle,
    ts.getPositionOfLineAndCharacter(
      env.getSourceFile(bundle) as ts.SourceFileLike,
      bundlePosition.line - 1, // ts 0-based
      position.character
    )
  )

  if (
    bundleDefinitionInfo === undefined ||
    !bundleDefinitionInfo.length ||
    token?.isCancellationRequested
  )
    return []

  const sourceDefinitionInfo: wgl.SymbolEntry[] = []
  const refsAndPosForConsumer: [ts.DefinitionInfo, ts.LineAndCharacter][] = []
  for (const di of bundleDefinitionInfo) {
    const lineAndCharacter = ts.getLineAndCharacterOfPosition(
      env.getSourceFile(di.fileName) as ts.SourceFileLike,
      di.textSpan.start
    )

    if (di.fileName !== bundle /** lib.d.ts files */) {
      sourceDefinitionInfo.push({
        source: path.join('node_modules', '@types', 'wglscript', 'generated', di.fileName),
        line: lineAndCharacter.line, // vscode 0-based
        column: lineAndCharacter.character,
        length: di.textSpan.length
      })
    } else {
      refsAndPosForConsumer.push([di, lineAndCharacter])
    }
  }

  await sm.SourceMapConsumer.with(strWSM.map.toJSON(), null, consumer => {
    refsAndPosForConsumer.map(record => {
      const lineAndCharacter = record[1]
      const di = record[0]

      const sourcePosition = consumer.originalPositionFor({
        line: lineAndCharacter.line + 1,
        column: lineAndCharacter.character + 1
      })

      if (sourcePosition.source == null || sourcePosition.line == null) return

      sourceDefinitionInfo.push({
        source: sourcePosition.source,
        line: sourcePosition.line - 1, // vscode 0-based
        column: lineAndCharacter.character,
        length: di.textSpan.length
      })
    })
  })

  if (token?.isCancellationRequested) return []

  return sourceDefinitionInfo
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
    file: normalizePath(document.fileName, projectRoot)
  })

  let bundlePosition: sm.NullablePosition = { line: null, column: null, lastColumn: null }
  await sm.SourceMapConsumer.with(strWSM.map.toJSON(), null, consumer => {
    bundlePosition = consumer.generatedPositionFor({
      source: normalizePath(document.fileName, projectRoot),
      line: position.line + 1, // vs-code 0-based
      column: position.character
    })
  })

  if (
    bundlePosition.line == null ||
    bundlePosition.column == null ||
    token?.isCancellationRequested
  )
    return []
  // ;(await import('fs')).writeFileSync(`${document.fileName}.b.js`, strWSM.code)

  const env = logtime(getVTSEnv, projectRoot, strWSM.code)

  if (token?.isCancellationRequested) return []

  const pos = ts.getPositionOfLineAndCharacter(
    env.getSourceFile(bundle) as ts.SourceFileLike,
    bundlePosition.line - 1, // ts 0-based
    position.character
  )

  const bundleCompletionInfo = logtime(
    env.languageService.getCompletionsAtPosition,
    bundle,
    pos,
    { triggerKind: ts.CompletionTriggerKind.TriggerCharacter },
    ts.getDefaultFormatCodeSettings()
  )

  if (
    bundleCompletionInfo === undefined ||
    !bundleCompletionInfo.entries.length ||
    token?.isCancellationRequested
  )
    return []

  const completions = bundleCompletionInfo.entries.map<vscode.CompletionItem>(e => ({
    label: e.name,
    sortText: e.sortText,
    kind: TSElementKindtoVSCodeCompletionItemKind(e.kind)
  }))

  if (token?.isCancellationRequested) []

  return completions
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

  if (token?.isCancellationRequested) return

  const strWSM = sourceNode.toStringWithSourceMap({
    file: normalizePath(document.fileName, projectRoot)
  })

  let bundlePosition: sm.NullablePosition = { line: null, column: null, lastColumn: null }
  await sm.SourceMapConsumer.with(strWSM.map.toJSON(), null, consumer => {
    bundlePosition = consumer.generatedPositionFor({
      source: normalizePath(document.fileName, projectRoot),
      line: position.line + 1, // vs-code 0-based
      column: position.character
    })
  })

  if (
    bundlePosition.line == null ||
    bundlePosition.column == null ||
    token?.isCancellationRequested
  )
    return
  // ;(await import('fs')).writeFileSync(`${document.fileName}.b.js`, strWSM.code)

  const env = logtime(getVTSEnv, projectRoot, strWSM.code)

  if (token?.isCancellationRequested) return

  const pos = ts.getPositionOfLineAndCharacter(
    env.getSourceFile(bundle) as ts.SourceFileLike,
    bundlePosition.line - 1, // ts 0-based
    position.character
  )

  const details = logtime(
    env.languageService.getCompletionEntryDetails,
    bundle,
    pos,
    completionItemLabel,
    ts.getDefaultFormatCodeSettings(),
    undefined,
    undefined,
    undefined
  )

  if (details === undefined || token?.isCancellationRequested) return

  return {
    label: details.name,
    kind: TSElementKindtoVSCodeCompletionItemKind(details.kind),
    detail: (details.displayParts || []).map(p => p.text).join(''),
    documentation: new vscode.MarkdownString()
      .appendMarkdown((details.documentation || []).map(p => p.text).join(''))
      .appendMarkdown('\r\n\r\n')
      .appendMarkdown((details.tags || []).map(prettifyJSDoc).join('\r\n\r\n'))
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

  if (token?.isCancellationRequested) return []

  const strWSM = sourceNode.toStringWithSourceMap({
    file: normalizePath(document.fileName, projectRoot)
  })

  let bundlePosition: sm.NullablePosition = { line: null, column: null, lastColumn: null }
  await sm.SourceMapConsumer.with(strWSM.map.toJSON(), null, consumer => {
    bundlePosition = consumer.generatedPositionFor({
      source: normalizePath(document.fileName, projectRoot),
      line: position.line + 1, // vs-code 0-based
      column: position.character
    })
  })

  if (
    bundlePosition.line == null ||
    bundlePosition.column == null ||
    token?.isCancellationRequested
  )
    return []
  // ;(await import('fs')).writeFileSync(`${document.fileName}.b.js`, strWSM.code)

  const env = logtime(getVTSEnv, projectRoot, strWSM.code)

  if (token?.isCancellationRequested) return []

  const bundleQuickInfo = logtime(
    env.languageService.getQuickInfoAtPosition,
    bundle,
    ts.getPositionOfLineAndCharacter(
      env.getSourceFile(bundle) as ts.SourceFileLike,
      bundlePosition.line - 1, // ts 0-based
      position.character
    )
  )

  if (bundleQuickInfo === undefined || token?.isCancellationRequested) return []

  return [
    new vscode.MarkdownString()
      .appendCodeblock((bundleQuickInfo.displayParts || []).map(p => p.text).join(''), 'typescript')
      .appendMarkdown((bundleQuickInfo.documentation || []).map(p => p.text).join(''))
      .appendMarkdown('\r\n\r\n')
      .appendMarkdown((bundleQuickInfo.tags || []).map(prettifyJSDoc).join('\r\n\r\n'))
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

  if (token?.isCancellationRequested) return

  const strWSM = sourceNode.toStringWithSourceMap({
    file: normalizePath(document.fileName, projectRoot)
  })

  let bundlePosition: sm.NullablePosition = { line: null, column: null, lastColumn: null }
  await sm.SourceMapConsumer.with(strWSM.map.toJSON(), null, consumer => {
    bundlePosition = consumer.generatedPositionFor({
      source: normalizePath(document.fileName, projectRoot),
      line: position.line + 1, // vs-code 0-based
      column: position.character
    })
  })

  if (
    bundlePosition.line == null ||
    bundlePosition.column == null ||
    token?.isCancellationRequested
  )
    return
  // ;(await import('fs')).writeFileSync(`${document.fileName}.b.js`, strWSM.code)

  const env = logtime(getVTSEnv, projectRoot, strWSM.code)

  if (token?.isCancellationRequested) return

  const pos = ts.getPositionOfLineAndCharacter(
    env.getSourceFile(bundle) as ts.SourceFileLike,
    bundlePosition.line - 1, // ts 0-based
    position.character
  )

  const bundleSignatureHelpItems = logtime(env.languageService.getSignatureHelpItems, bundle, pos, {
    triggerReason: { kind: 'retrigger' }
  })

  if (
    bundleSignatureHelpItems === undefined ||
    !bundleSignatureHelpItems.items.length ||
    token?.isCancellationRequested
  )
    return

  const signatures = bundleSignatureHelpItems.items.map<vscode.SignatureInformation>(i => ({
    label:
      i.prefixDisplayParts.map(p => p.text).join('') +
      i.parameters.map(p => p.displayParts.map(d => d.text).join('')).join(', ') +
      i.suffixDisplayParts.map(p => p.text).join(''),
    parameters: i.parameters.map(p => ({ label: p.displayParts.map(d => d.text).join('') })),
    documentation: new vscode.MarkdownString()
      .appendMarkdown(i.documentation.map(d => d.text).join(''))
      .appendMarkdown('\r\n\r\n')
      .appendMarkdown(i.tags.map(prettifyJSDoc).join('\r\n\r\n'))
  }))

  return {
    signatures,
    activeSignature: 0,
    activeParameter: bundleSignatureHelpItems.argumentIndex
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
  token?: vscode.CancellationToken,
  source?: TNormalizedPath
): Promise<wgl.SymbolEntry[]> {
  if (token?.isCancellationRequested) return []

  const sourceNode = await compile(document.fileName, { projectRoot, modules: [] })

  if (token?.isCancellationRequested) return []

  const strWSM = sourceNode.toStringWithSourceMap({
    file: normalizePath(document.fileName, projectRoot)
  })

  let bundlePosition: sm.NullablePosition = { line: null, column: null, lastColumn: null }
  await sm.SourceMapConsumer.with(strWSM.map.toJSON(), null, consumer => {
    bundlePosition = consumer.generatedPositionFor({
      source: source ?? normalizePath(document.fileName, projectRoot),
      line: position.line + 1, // vs-code 0-based
      column: position.character
    })
  })

  if (
    bundlePosition.line == null ||
    bundlePosition.column == null ||
    token?.isCancellationRequested
  )
    return []
  // ;(await import('fs')).writeFileSync(`${document.fileName}.b.js`, strWSM.code)

  const env = logtime(getVTSEnv, projectRoot, strWSM.code)

  if (token?.isCancellationRequested) return []

  const bundleReferenceEntries = logtime(
    env.languageService.getReferencesAtPosition,
    bundle,
    ts.getPositionOfLineAndCharacter(
      env.getSourceFile(bundle) as ts.SourceFileLike,
      bundlePosition.line - 1, // ts 0-based
      position.character
    )
  )

  if (
    bundleReferenceEntries === undefined ||
    !bundleReferenceEntries.length ||
    token?.isCancellationRequested
  )
    return []

  const sourceEntries: wgl.SymbolEntry[] = []
  const refsAndPosForConsumer: [ts.ReferenceEntry, ts.LineAndCharacter][] = []
  for (const br of bundleReferenceEntries) {
    const lineAndCharacter = logtime(
      ts.getLineAndCharacterOfPosition,
      env.getSourceFile(br.fileName) as ts.SourceFileLike,
      br.textSpan.start
    )

    if (br.fileName !== bundle /** lib.d.ts files */) {
      sourceEntries.push({
        source: path.join('node_modules', '@types', 'wglscript', 'generated', br.fileName),
        line: lineAndCharacter.line, // vscode 0-based
        column: lineAndCharacter.character,
        length: br.textSpan.length
      })
    } else {
      refsAndPosForConsumer.push([br, lineAndCharacter])
    }
  }

  await sm.SourceMapConsumer.with(strWSM.map.toJSON(), null, consumer => {
    refsAndPosForConsumer.map(record => {
      const lineAndCharacter = record[1]
      const br = record[0]

      const sourcePosition = consumer.originalPositionFor({
        line: lineAndCharacter.line + 1,
        column: lineAndCharacter.character + 1
      })

      if (sourcePosition.source == null || sourcePosition.line == null) return

      sourceEntries.push({
        source: sourcePosition.source,
        line: sourcePosition.line - 1, // vscode 0-based
        column: lineAndCharacter.character,
        length: br.textSpan.length
      })
    })
  })

  if (token?.isCancellationRequested) return []

  return sourceEntries
}

export async function getNavigationBarItems(
  document: Pick<vscode.TextDocument, 'fileName'>,
  projectRoot: string,
  token?: vscode.CancellationToken,
  includeWorkspaceSymbols?: true
): Promise<vscode.ProviderResult<vscode.SymbolInformation[]>> {
  if (token?.isCancellationRequested) return

  const sourceNode = await compile(document.fileName, { projectRoot, modules: [] })
  const documentNormalized = normalizePath(document.fileName, projectRoot)

  if (token?.isCancellationRequested) return

  const strWSM = sourceNode.toStringWithSourceMap({
    file: normalizePath(document.fileName, projectRoot)
  })

  const env = logtime(getVTSEnv, projectRoot, strWSM.code)

  if (token?.isCancellationRequested) return

  const bundleNavigationTree = [logtime(env.languageService.getNavigationTree, bundle)]

  if (
    bundleNavigationTree === undefined ||
    !bundleNavigationTree.length ||
    token?.isCancellationRequested
  )
    return

  const sourceSymbols: vscode.SymbolInformation[] = []
  const refsAndPosForConsumer: Array<{
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
        const start = ts.getLineAndCharacterOfPosition(
          env.getSourceFile(bundle) as ts.SourceFileLike,
          pos.start
        )
        const end = ts.getLineAndCharacterOfPosition(
          env.getSourceFile(bundle) as ts.SourceFileLike,
          pos.start + pos.length
        )

        container && refsAndPosForConsumer.push({ item, start, end, container })
      }

      if (item.childItems) collectNavBarItemsWithLineAndCharacter(item.childItems, item.text)
    }
  }

  collectNavBarItemsWithLineAndCharacter(bundleNavigationTree)

  await sm.SourceMapConsumer.with(strWSM.map.toJSON(), null, consumer => {
    refsAndPosForConsumer.map(r => {
      if (token?.isCancellationRequested) return

      const sourcePositionStart = consumer.originalPositionFor({
        line: r.start.line + 1,
        column: r.start.character + 1
      })

      if (sourcePositionStart.source == null || sourcePositionStart.line == null) return
      if (sourcePositionStart.source !== documentNormalized && !includeWorkspaceSymbols) return

      const sourcePositionEnd = consumer.originalPositionFor({
        line: r.end.line + 1,
        column: r.end.character + 1
      })

      if (sourcePositionEnd.source == null || sourcePositionEnd.line == null) return
      if (sourcePositionEnd.source !== documentNormalized && !includeWorkspaceSymbols) return

      sourceSymbols.push(
        new vscode.SymbolInformation(
          r.item.text,
          TSElementKindtoVSCodeSymbolKind(r.item.kind),
          r.container ?? '',
          new vscode.Location(
            vscode.Uri.file(path.join(projectRoot, sourcePositionStart.source)),
            new vscode.Range(
              sourcePositionStart.line - 1, // vscode 0-based
              r.start.character,
              sourcePositionEnd.line - 1, // vscode 0-based
              r.end.character
            )
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
  token?: vscode.CancellationToken
): Promise<wgl.SymbolEntry[]> {
  // TODO: при мутации исходников делать грязной карту зависимостей

  const sourceDefinitionInfo = await getDefinitionInfoAtPosition(
    document,
    position,
    projectRoot,
    token
  )

  if (!sourceDefinitionInfo.length) return []

  // 1 глобальный скрипт определен
  const globalScript = path.join(projectRoot, getConfigurationOption<string>('path'))
  const globalScriptNormalized = normalizePath(globalScript, projectRoot)

  if (!fs.existsSync(globalScript)) {
    console.log(
      `INFO: Global script module ${globalScriptNormalized} not exists. Get references at position in project not available.`
    )
    return sourceDefinitionInfo
  }

  const definition = sourceDefinitionInfo[0]

  // 1.1 дефинишн находится в глобалскрипте
  if (definition.source === globalScriptNormalized) {
    return [definition]
  }

  // 1.2 дефинишн находится в локальном скрипте
  if (definition.source !== globalScriptNormalized) {
    const modules = await getModuleReferences(definition.source, projectRoot, token)
    const projectRefs: wgl.SymbolEntry[] = []
    let progressState = 0
    let lastReportedTime = Date.now()

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Window,
        cancellable: true,
        title: 'WGLToolchain'
      },
      async (p, t) => {
        if (token?.isCancellationRequested || t.isCancellationRequested) return

        const chunks = chunkedArray(modules, 4)
        for (let i = 0; i < chunks.length; i++) {
          if (token?.isCancellationRequested || t.isCancellationRequested) break

          await Promise.all(
            chunks[i].map(async m => {
              if (token?.isCancellationRequested || t.isCancellationRequested) return

              const refs = await getReferencesAtPosition(
                { fileName: path.join(projectRoot, m) },
                { line: definition.line, character: definition.column },
                projectRoot,
                token,
                definition.source
              )

              progressState++
              const now = Date.now()
              if (now - lastReportedTime > 100) {
                p.report({ message: `process references ${progressState}/${modules.length}` })
                lastReportedTime = now
              }

              refs.map(r => {
                if (token?.isCancellationRequested || t.isCancellationRequested) return
                if (
                  !projectRefs.find(
                    pr =>
                      pr.source === r.source &&
                      pr.line === r.line &&
                      pr.column === r.column &&
                      pr.length &&
                      r.length
                  )
                )
                  projectRefs.push({
                    source: r.source,
                    line: r.line,
                    column: r.column,
                    length: r.length
                  })
              })
            })
          )
        }
      }
    )

    return projectRefs
  }

  // 1.3 дефинишн находится в либе .d.ts
  if (definition.source.match('node_modules\\\\@types')) {
    return [definition]
  }

  return [definition]
}

const moduleReferencesStorage = new Map<TNormalizedPath, TNormalizedPath[]>()
const modulesWithError = new Set<string>()

/**
 * Get module references
 * @param module module to search for links
 * @param projectRoot root system path of project
 * @param token optional cancellation token
 * @returns
 */
export async function getModuleReferences(
  module: TNormalizedPath,
  projectRoot: string,
  token?: vscode.CancellationToken,
  extensionActivate?: true
): Promise<TNormalizedPath[]> {
  if (token?.isCancellationRequested) return []

  let scripts: Array<TNormalizedPath> = await getJsFiles(projectRoot)

  if (Array.from(moduleReferencesStorage.keys()).length) {
    const traversedScripts: Array<TNormalizedPath> = []
    for (const [_, deps] of moduleReferencesStorage) for (const d of deps) traversedScripts.push(d)
    scripts = scripts.filter(s => !traversedScripts.includes(s) && !modulesWithError.has(s))
  }

  const parsingPromises: Array<ReturnType<typeof parseScriptModule>> = []
  let lastReportedTime = Date.now()
  let progressState = 0

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Window,
      cancellable: true,
      title: 'WGLToolchain'
    },
    async (p, t) => {
      for (let i = 0; i < scripts.length; i++) {
        if (token?.isCancellationRequested || t.isCancellationRequested) break

        try {
          parsingPromises.push(
            parseScriptModule(path.join(projectRoot, scripts[i]), projectRoot).then(ast => {
              progressState++
              const now = Date.now()
              if (now - lastReportedTime > 100) {
                p.report({
                  message: `${extensionActivate ? 'Initialize features. ' : ''}Parsing ${progressState}/${scripts.length}`
                })
                lastReportedTime = now
              }
              return ast
            })
          )
        } catch (error) {
          modulesWithError.add(scripts[i])
          console.log(`ERROR: ${error}`)
        }
      }

      await Promise.all(parsingPromises)
    }
  )

  const globalScript = path.join(projectRoot, getConfigurationOption<string>('path'))
  const sourceNode = await compile(globalScript, { projectRoot, modules: [] })
  const strWSM = sourceNode.toStringWithSourceMap({
    file: getConfigurationOption<string>('path')
  })
  const globalDeps = (await new sm.SourceMapConsumer(strWSM.map.toString())).sources

  progressState = 0

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Window,
      cancellable: true,
      title: 'WGLToolchain'
    },
    async (p, t) => {
      const chunks = chunkedArray(scripts, 100)
      for (let j = 0; j < chunks.length; j++) {
        const chunk = chunks[j]
        const compilePromises: Array<Promise<1>> = []

        for (let i = 0; i < chunk.length; i++) {
          if (token?.isCancellationRequested || t.isCancellationRequested) break

          try {
            compilePromises.push(
              compile(path.join(projectRoot, chunk[i]), {
                projectRoot,
                modules: [...globalDeps],
                skipAttachGlobalScript: true
              })
                .then(sn => sn.toStringWithSourceMap({ file: chunk[i] }))
                .then(strWSM => new sm.SourceMapConsumer(strWSM.map.toString()))
                .then(map => {
                  progressState++
                  const now = Date.now()
                  if (now - lastReportedTime > 100) {
                    p.report({
                      message: `${extensionActivate ? 'Initialize features. ' : ''}Building ${progressState}/${scripts.length}`
                    })
                    lastReportedTime = now
                  }
                  const deps = [...map.sources]
                  map.destroy()
                  moduleReferencesStorage.set(chunk[i], deps)
                  return 1
                })
            )
          } catch (error) {
            modulesWithError.add(chunk[i])
            console.log(`ERROR: ${error}`)
          }
        }

        await Promise.all(compilePromises)
      }
    }
  )

  if (token?.isCancellationRequested) return []

  const moduleReferences: TNormalizedPath[] = []

  for (const [entry, deps] of moduleReferencesStorage)
    for (const d of deps)
      if (entry !== d && moduleReferencesStorage.has(d)) moduleReferencesStorage.delete(d)

  for (const [entry, deps] of moduleReferencesStorage)
    if (deps.find(d => d === module)) moduleReferences.push(entry)

  return moduleReferences
}

async function getJsFiles(projectRoot: string) {
  const gitignorePath = path.join(projectRoot, '.gitignore')
  let ignoreRules: string[] = []

  if (fs.existsSync(gitignorePath)) {
    ignoreRules = fs.readFileSync(gitignorePath, 'utf8').split('\n')
  }

  const ig = ignore().add(ignoreRules)

  async function readDirRecursive(dir: string) {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true })
    let jsFiles: TNormalizedPath[] = []

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      const relativePath = path.relative(projectRoot, fullPath)

      if (ig.ignores(relativePath)) continue

      if (entry.isDirectory()) {
        jsFiles = jsFiles.concat(await readDirRecursive(fullPath))
      } else if (entry.isFile() && path.extname(entry.name) === '.js') {
        jsFiles.push(relativePath)
      }
    }

    return jsFiles
  }

  return await readDirRecursive(projectRoot)
}

function chunkedArray<T>(arr: Array<T>, chunkSize: number) {
  const result = []
  for (let i = 0; i < arr.length; i += chunkSize) {
    result.push(arr.slice(i, i + chunkSize))
  }

  return result
}
