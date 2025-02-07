import * as path from 'path'
import * as sm from 'source-map'
import * as ts from 'typescript'
import * as vscode from 'vscode'
import type * as wgl from './wglscript'

import { compile } from '../compiler/compiler'
import { normalizePath } from '../compiler/utils'
import { logtime } from '../utils'
import { TSElementKindtoVSCodeCompletionItemKind, bundle, getVTSEnv, prettifyJSDoc } from './utils'

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
      await sm.SourceMapConsumer.with(strWSM.map.toJSON(), null, consumer => {
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
    }
  }

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

  const completions = bundleCompletionInfo.entries.map<vscode.CompletionItem>((e, i) => ({
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

export async function getReferencesAtPosition(
  document: Pick<vscode.TextDocument, 'fileName'>,
  position: Pick<vscode.Position, 'line' | 'character'>,
  projectRoot: string,
  token?: vscode.CancellationToken
): Promise<wgl.SymbolEntry[]> {
  // TODO:
  // 1 находим модуль* в котором определен символ для поиска
  // 2 находим все модули** где есть в зивисимостях моудль*
  // 3 во всех модулях** от дефинишена символа ищем референсы и сливаем их
  // 2* кэшировать АСТ всех модулей на диск
  // 3* по этой фиче делать прогресс от 0..кол-во обработанных модулей-бандлов
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
  for (const br of bundleReferenceEntries) {
    const lineAndCharacter = ts.getLineAndCharacterOfPosition(
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
      await sm.SourceMapConsumer.with(strWSM.map.toJSON(), null, consumer => {
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
    }
  }

  if (token?.isCancellationRequested) return []

  return sourceEntries
}
