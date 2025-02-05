import * as fs from 'fs'
import * as path from 'path'
import * as tsvfs from '@typescript/vfs'
import * as sm from 'source-map'
import * as ts from 'typescript'
import type * as vscode from 'vscode'
import type * as wgl from './wglscript'

import { compile } from '../compiler/compiler'
import { normalizePath } from '../compiler/utils'
import { compilerOpts } from './utils'

export async function getDefinitionInfoAtPosition(
  document: Pick<vscode.TextDocument, 'fileName'>,
  position: Pick<vscode.Position, 'line' | 'character'>,
  projectRoot: string
): Promise<wgl.Definition[]> {
  let startTime = 0
  let endTime = 0

  const bundle = 'bundle.js'
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

  const fsMap = tsvfs.createDefaultMapFromNodeModules(compilerOpts)

  try {
    const wgldts = fs.readFileSync(
      path.join(projectRoot, 'node_modules', '@types', 'wglscript', 'lib.wglscript.d.ts')
    )

    fsMap.set('/lib.es5.d.ts', `${wgldts}${fsMap.get('/lib.es5.d.ts') as string}`)
  } catch (error) {
    console.log(
      'WARN: types for WGLScript at node_modules/@types/wglscript/lib.wglscript.d.ts not found'
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

  fsMap.set(bundle, strWSM.code)
  // ;(await import('fs')).writeFileSync(`${document.fileName}.b.js`, strWSM.code)
  // ;(await import('fs')).writeFileSync(`${document.fileName}.b.map`, strWSM.map.toString())

  startTime = performance.now()
  const system = tsvfs.createSystem(fsMap)
  endTime = performance.now()
  console.log(`createSystem ${endTime - startTime}ms`)

  startTime = performance.now()
  const env = tsvfs.createVirtualTypeScriptEnvironment(system, [bundle], ts, compilerOpts)
  endTime = performance.now()
  console.log(`createSystem ${endTime - startTime}ms`)

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
  console.log(`getDefinitionAtPosition ${endTime - startTime}ms`)

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
