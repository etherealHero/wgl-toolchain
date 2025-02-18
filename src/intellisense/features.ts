import * as fs from 'fs'
import * as path from 'path'
import * as sm from 'source-map'
import * as ts from 'typescript'
import * as vscode from 'vscode'
import type * as wgl from './wglscript'

import { compile } from '../compiler/compiler'
import { type TNormalizedPath, normalizePath, parseScriptModule } from '../compiler/utils'
import { getConfigurationOption, logtime } from '../utils'
import {
  TSElementKindtoVSCodeCompletionItemKind,
  TSElementKindtoVSCodeSymbolKind,
  bundle,
  chunkedArray,
  getJsFiles,
  getVTSEnv,
  isCancelled,
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
  token?: undefined | vscode.CancellationToken | (vscode.CancellationToken | undefined)[],
  source?: TNormalizedPath,
  clearVTS?: boolean
): Promise<wgl.SymbolEntry[]> {
  if (isCancelled(token)) return []

  const sourceNode = await compile(document.fileName, { projectRoot, modules: [] })

  if (isCancelled(token)) return []

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

  if (bundlePosition.line == null || bundlePosition.column == null || isCancelled(token)) return []
  // ;(await import('fs')).writeFileSync(`${document.fileName}.b.js`, strWSM.code)

  const env = logtime(getVTSEnv, projectRoot, strWSM.code, clearVTS ? false : undefined)

  if (isCancelled(token)) return []

  const bundleReferenceEntries = logtime(
    env.languageService.getReferencesAtPosition,
    bundle,
    ts.getPositionOfLineAndCharacter(
      env.getSourceFile(bundle) as ts.SourceFileLike,
      bundlePosition.line - 1, // ts 0-based
      position.character
    )
  )

  if (bundleReferenceEntries === undefined || !bundleReferenceEntries.length || isCancelled(token))
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

  if (isCancelled(token)) return []

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
  const sourceDefinitionInfo = await getDefinitionInfoAtPosition(
    document,
    position,
    projectRoot,
    token
  )

  if (!sourceDefinitionInfo.length || isCancelled(token)) return []

  // 1 глобальный скрипт определен
  const globalScript = path.join(projectRoot, getConfigurationOption<string>('globalScript.path'))
  const globalScriptNormalized = normalizePath(globalScript, projectRoot)

  if (!fs.existsSync(globalScript)) {
    console.log(
      `INFO: Global script module ${globalScriptNormalized} not exists. Get references at position in project not available.`
    )
    return sourceDefinitionInfo
  }

  const sourceNode = await compile(globalScript, { projectRoot, modules: [] })
  const strWSM = sourceNode.toStringWithSourceMap({
    file: getConfigurationOption<string>('globalScript.path')
  })
  const globalDeps = (await new sm.SourceMapConsumer(strWSM.map.toString())).sources
  const definition = sourceDefinitionInfo[0]

  // 1.1 дефинишн находится в либе .d.ts
  if (definition.source.match('node_modules\\\\@types')) {
    // TODO: обратно запроксировать позицию в tsvfs (=> /lib.d.ts), поднять референсы также как в других флоу ниже
    return await getReferencesAtPosition(document, position, projectRoot, token)
  }

  let modules: TNormalizedPath[]
  if (globalDeps.includes(definition.source)) {
    // 1.2 дефинишн находится в глобалскрипте
    // TODO: фильтруем скрипты по матчу наименования символа в контенте файла (!Регистрозависимо)
    modules = Array.from(moduleReferencesStorage.keys())
  } else {
    // 1.3 дефинишн находится в локальном скрипте
    modules = await getModuleReferences(definition.source, projectRoot, token)
  }

  const modulesLength = modules.length
  const sliceModuleReferencesLength = getConfigurationOption<number>(
    'intellisense.workspaceFeatures.sliceModuleReferencesLength'
  )

  let postfix = ''
  if (modulesLength > sliceModuleReferencesLength) {
    modules = chunkedArray(modules, sliceModuleReferencesLength)[0]
    postfix = ` (${modulesLength - modules.length} skipped)`
  }

  const projectRefs = new Set<string>()
  let progressState = 0
  let lastReportedTime = Date.now()

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Window,
      cancellable: true,
      title: 'WGLToolchain'
    },
    async (p, t) => {
      if (isCancelled([token, t])) return

      p.report({
        message: `Processing script modules ${progressState}/${modules.length}${postfix}`
      })
      const threads = getConfigurationOption<number>('intellisense.tsvfsThreads')

      for (const chunk of chunkedArray(modules, threads)) {
        if (isCancelled([token, t])) break
        await Promise.all(
          chunk.map(async module => {
            if (isCancelled([token, t])) return

            for (const ref of await getReferencesAtPosition(
              { fileName: path.join(projectRoot, module) },
              { line: definition.line, character: definition.column },
              projectRoot,
              [token, t],
              definition.source,
              true /** clear VTS after request */
            )) {
              if (isCancelled([token, t])) break
              projectRefs.add(
                JSON.stringify({
                  source: ref.source,
                  line: ref.line,
                  column: ref.column,
                  length: ref.length
                })
              )
            }

            progressState++
            const now = Date.now()
            if (now - lastReportedTime > 200) {
              p.report({
                message: `Processing script modules ${progressState}/${modules.length}${postfix}`
              })
              lastReportedTime = now
            }
          })
        )
      }
    }
  )

  if (isCancelled(token)) return []
  return Array.from(projectRefs.values()).map<wgl.SymbolEntry>(r => JSON.parse(r))
}

export const moduleReferencesStorage = new Map<TNormalizedPath, TNormalizedPath[]>()
export const modulesWithError = new Set<string>()

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

  if (moduleReferencesStorage.size) {
    const traversedScripts: Array<TNormalizedPath> = []
    for (const [_, deps] of moduleReferencesStorage) for (const d of deps) traversedScripts.push(d)
    scripts = scripts.filter(s => !traversedScripts.includes(s) && !modulesWithError.has(s))
  }

  let lastReportedTime = Date.now()
  let progressState = 0

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Window,
      cancellable: true,
      title: 'WGLToolchain'
    },
    async (p, t) => {
      await Promise.all(
        scripts.map(s =>
          isCancelled([token, t])
            ? null
            : parseScriptModule(path.join(projectRoot, s), projectRoot)
                .then(() => {
                  progressState++
                  const now = Date.now()
                  if (now - lastReportedTime > 200) {
                    p.report({
                      message: `${extensionActivate ? 'Initialize features. ' : ''}Parsing ${progressState}/${scripts.length}`
                    })
                    lastReportedTime = now
                  }
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
      progressState = 0
      p.report({
        message: `${extensionActivate ? 'Initialize features. ' : ''}Building ${progressState}/${scripts.length}`
      })

      const globalScript = path.join(
        projectRoot,
        getConfigurationOption<string>('globalScript.path')
      )
      const sourceNode = await compile(globalScript, { projectRoot, modules: [] })
      const strWSM = sourceNode.toStringWithSourceMap({
        file: getConfigurationOption<string>('globalScript.path')
      })
      const globalDeps = (await new sm.SourceMapConsumer(strWSM.map.toString())).sources
      const threads = getConfigurationOption<number>('intellisense.buildThreads')

      for (const chunk of chunkedArray(scripts, threads)) {
        if (isCancelled([token, t])) break
        await Promise.all(
          chunk.map(script =>
            isCancelled([token, t])
              ? null
              : compile(path.join(projectRoot, script), {
                  projectRoot,
                  modules: [...globalDeps],
                  skipAttachGlobalScript: true
                })
                  .then(sn => sn.toStringWithSourceMap({ file: script }))
                  .then(strWSM => new sm.SourceMapConsumer(strWSM.map.toString()))
                  .then(map => {
                    progressState++
                    const now = Date.now()
                    if (now - lastReportedTime > 200) {
                      p.report({
                        message: `${extensionActivate ? 'Initialize features. ' : ''}Building ${progressState}/${scripts.length}`
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

  const moduleReferences: TNormalizedPath[] = []

  for (const [entry, deps] of moduleReferencesStorage)
    for (const d of deps)
      if (entry !== d && moduleReferencesStorage.has(d)) moduleReferencesStorage.delete(d)

  for (const [entry, deps] of moduleReferencesStorage)
    if (deps.find(d => d === module)) moduleReferences.push(entry)

  return moduleReferences
}
