import * as path from 'path'
import * as sm from 'source-map'
import * as ts from 'typescript'
import * as vscode from 'vscode'
import type * as wgl from './wglscript'

import { compile } from '../compiler/compiler'
import { normalizePath } from '../compiler/utils'
import { logtime } from '../utils'
import { TSElementKindtoVSCodeCompletionItemKind, bundle, getVTSEnv } from './utils'

export async function getDefinitionInfoAtPosition(
  document: Pick<vscode.TextDocument, 'fileName'>,
  position: Pick<vscode.Position, 'line' | 'character'>,
  projectRoot: string,
  token?: vscode.CancellationToken
): Promise<wgl.Definition[]> {
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

  const sourceDefinitionInfo: wgl.Definition[] = []
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
  wordRangeAtPosition: string,
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

  const completions = bundleCompletionInfo.entries.map<vscode.CompletionItem>((e, i) => {
    const c: vscode.CompletionItem = {
      label: e.name,
      sortText: e.sortText,
      kind: TSElementKindtoVSCodeCompletionItemKind(e.kind)
    }

    if (token?.isCancellationRequested) return c

    if (wordRangeAtPosition.length >= 4 && e.name.match(wordRangeAtPosition)) {
      const entryDetails = env.languageService.getCompletionEntryDetails(
        bundle,
        pos,
        e.name,
        ts.getDefaultFormatCodeSettings(),
        undefined,
        undefined,
        undefined
      )

      if (entryDetails === undefined) return c

      c.documentation = new vscode.MarkdownString()
        .appendText(`${(entryDetails.documentation || []).map(p => p.text).join('')}\r\n`)
        .appendText(
          (entryDetails.tags || [])
            .map(t => `@${t.name} ${(t.text || []).map(p => p.text).join('')}\r\n`)
            .join('')
        )

      c.detail = (entryDetails.displayParts || []).map(p => p.text).join('')
    }

    return c
  })

  if (token?.isCancellationRequested) []

  return completions
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

  const bundleQuickInfo = env.languageService.getQuickInfoAtPosition(
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
      .appendText(`${(bundleQuickInfo.documentation || []).map(p => p.text).join('')}\r\n`)
      .appendText(
        (bundleQuickInfo.tags || [])
          .map(t => `@${t.name} ${(t.text || []).map(p => p.text).join('')}`)
          .join('\r\n')
      )
  ]
}
