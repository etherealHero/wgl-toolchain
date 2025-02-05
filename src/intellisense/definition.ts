import * as tsvfs from '@typescript/vfs'
import * as sm from 'source-map'
import * as ts from 'typescript'
import type * as vscode from 'vscode'
import type * as wgl from './wglscript'

import { compile } from '../compiler/compiler'
import { normilizePath } from '../compiler/utils'
import { compilerOpts } from './utils'

export async function getDefinitionInfoAtPosition(
  document: Pick<vscode.TextDocument, 'fileName'>,
  position: Pick<vscode.Position, 'line' | 'character'>,
  projectRoot: string
): Promise<wgl.Definition[]> {
  const bundle = 'bundle.js'
  const sourceNode = await compile(document.fileName, { projectRoot, modules: [] })
  const strWSM = sourceNode.toStringWithSourceMap({
    file: normilizePath(document.fileName, projectRoot)
  })

  let bundlePosition: sm.NullablePosition = { line: null, column: null, lastColumn: null }
  await sm.SourceMapConsumer.with(strWSM.map.toJSON(), null, consumer => {
    bundlePosition = consumer.generatedPositionFor({
      source: normilizePath(document.fileName, projectRoot),
      line: position.line + 1, // vs-code 0-based
      column: position.character
    })
  })

  if (bundlePosition.line == null || bundlePosition.column == null) return []

  const fsMap = tsvfs.createDefaultMapFromNodeModules(compilerOpts)

  fsMap.set(bundle, strWSM.code)
  // ;(await import('fs')).writeFileSync(`${document.fileName}.b.js`, strWSM.code)
  // ;(await import('fs')).writeFileSync(`${document.fileName}.b.map`, strWSM.map.toString())

  const system = tsvfs.createSystem(fsMap)
  const env = tsvfs.createVirtualTypeScriptEnvironment(system, [bundle], ts, compilerOpts)
  const bundleDefinitionInfo = env.languageService.getDefinitionAtPosition(
    bundle,
    ts.getPositionOfLineAndCharacter(
      env.getSourceFile(bundle) as ts.SourceFileLike,
      bundlePosition.line - 1, // ts 0-based
      position.character
    )
  )

  if (bundleDefinitionInfo === undefined || !bundleDefinitionInfo.length) return []

  const sourceDefinitionInfo: wgl.Definition[] = []
  for (const di of bundleDefinitionInfo) {
    const lineAndCharacter = ts.getLineAndCharacterOfPosition(
      env.getSourceFile(bundle) as ts.SourceFileLike,
      di.textSpan.start
    )

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

  return sourceDefinitionInfo
}
