import * as path from 'path'
import * as sm from 'source-map'
import * as ts from 'typescript'
import type * as vscode from 'vscode'
import type * as wgl from './wglscript'

import { compile } from '../compiler/compiler'
import { normalizePath } from '../compiler/utils'
import { bundle, createVirtualTypeScriptEnvironment } from './utils'

export async function getDefinitionInfoAtPosition(
  document: Pick<vscode.TextDocument, 'fileName'>,
  position: Pick<vscode.Position, 'line' | 'character'>,
  projectRoot: string
): Promise<wgl.Definition[]> {
  let startTime = 0
  let endTime = 0

  const sourceNode = await compile(document.fileName, { projectRoot, modules: [] })
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

  if (bundlePosition.line == null || bundlePosition.column == null) return []
  // ;(await import('fs')).writeFileSync(`${document.fileName}.b.js`, strWSM.code)

  startTime = performance.now()
  const env = createVirtualTypeScriptEnvironment(projectRoot, strWSM.code)
  endTime = performance.now()
  console.log(`INFO: createVirtualTypeScriptEnvironment ${endTime - startTime}ms`)

  startTime = performance.now()
  const bundleDefinitionInfo = env.languageService.getDefinitionAtPosition(
    bundle,
    ts.getPositionOfLineAndCharacter(
      env.getSourceFile(bundle) as ts.SourceFileLike,
      bundlePosition.line - 1, // ts 0-based
      position.character
    )
  )
  endTime = performance.now()
  console.log(`INFO: getDefinitionAtPosition ${endTime - startTime}ms`)

  if (bundleDefinitionInfo === undefined || !bundleDefinitionInfo.length) return []

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

  return sourceDefinitionInfo
}
