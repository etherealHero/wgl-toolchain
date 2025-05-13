import * as fs from 'fs'
import * as path from 'path'
import * as prettier from 'prettier'
import * as sm from 'source-map'
import * as ts from 'typescript'
import * as vscode from 'vscode'
import * as compiler from '../compiler/compiler'
import * as cUtils from '../compiler/utils'
import * as libUtils from '../utils'
import * as utils from './utils'
import type * as wgl from './wglscript'

async function getDefinitionInfoAtPosition(
  document: Pick<vscode.TextDocument, 'fileName'>,
  position: Pick<vscode.Position, 'line' | 'character'>,
  projectRoot: string,
  token?: vscode.CancellationToken,
  searchPatternForTreeShaking?: string | RegExp
): Promise<wgl.SymbolEntry[]> {
  const consumer = async ({ map, bundlePosition, env, entryAst }: utils.IConsumerProps) => {
    if (token?.isCancellationRequested) return []

    const moduleRef = entryAst.find(
      n => n.type === 'moduleResolution' && n.location.start.line === position.line + 1
    )

    if (moduleRef) {
      const module = (moduleRef as compiler.ImportNode).href.startsWith('.')
        ? path.join(`${path.dirname(document.fileName)}/${(moduleRef as compiler.ImportNode).href}`)
        : path.join(`${projectRoot}/${(moduleRef as compiler.ImportNode).href}`)
      const moduleN = cUtils.normalizePath(module, projectRoot)

      return [
        {
          source: moduleN,
          column: 0,
          length: 0,
          line: 0
        } as wgl.SymbolEntry
      ]
    }

    if (
      bundlePosition.line == null ||
      bundlePosition.column == null ||
      token?.isCancellationRequested ||
      !env
    )
      return []

    if (token?.isCancellationRequested) return []

    const D = libUtils.logtime(
      env.languageService.getDefinitionAtPosition,
      utils.bundle,
      ts.getPositionOfLineAndCharacter(
        env.getSourceFile(utils.bundle) as ts.SourceFileLike,
        bundlePosition.line - 1,
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
        // символ находится в скрипт модуле
        forConsumer.push([di, lnCh])
        continue
      }

      // символ находится в .d.ts
      const source = path.join('node_modules', '@types', 'wglscript', 'generated', di.fileName)
      const { line, character: column } = lnCh

      if (
        !sourceD.find(
          sd =>
            sd.source.toLowerCase() === source.toLowerCase() &&
            sd.line === line &&
            sd.column === column &&
            sd.length === di.textSpan.length
        )
      ) {
        sourceD.push({ source, line, column, length: di.textSpan.length })
      }
    }

    forConsumer.map(record => {
      const lnCh = record[1]
      const { line: ln, character: col } = record[1]
      const length = record[0].textSpan.length
      const { source, line: orLn } = map.originalPositionFor({
        line: ln + 1,
        column: col + 1
      })

      if (source == null || orLn == null) return

      if (
        !sourceD.find(
          sd =>
            sd.source.toLowerCase() === source.toLowerCase() &&
            sd.line === orLn - 1 &&
            sd.column === lnCh.character &&
            sd.length === length
        )
      ) {
        sourceD.push({ source, line: orLn - 1, column: lnCh.character, length })
      }
    })

    if (token?.isCancellationRequested) return []

    return sourceD
  }

  return (
    (await utils.consumeScriptModule({
      document,
      position,
      projectRoot,
      consumer,
      token,
      compileOptions: {
        treeShaking: searchPatternForTreeShaking
          ? { searchPattern: searchPatternForTreeShaking }
          : undefined
      }
    })) || []
  )
}

async function getCompletionsAtPosition(
  document: Pick<vscode.TextDocument, 'fileName' | 'lineAt'>,
  position: Pick<vscode.Position, 'line' | 'character'>,
  projectRoot: string,
  resolveDependencies: boolean,
  token?: vscode.CancellationToken
): Promise<vscode.ProviderResult<vscode.CompletionItem[]>> {
  const consumer = async ({ bundlePosition, env }: utils.IConsumerProps) => {
    if (
      bundlePosition.line == null ||
      bundlePosition.column == null ||
      token?.isCancellationRequested ||
      !env
    )
      return []

    if (token?.isCancellationRequested) return []

    if (!resolveDependencies) {
      if (needBundleContextCompletionRequest({ bundlePosition, env, position, document })) {
        return await getCompletionsAtPosition(
          document,
          position,
          projectRoot,
          true /** resolveDependencies */,
          token
        )
      }
    }

    const C = libUtils.logtime(
      env.languageService.getCompletionsAtPosition,
      utils.bundle,
      ts.getPositionOfLineAndCharacter(
        env.getSourceFile(utils.bundle) as ts.SourceFileLike,
        bundlePosition.line - 1,
        position.character
      ),
      { triggerKind: ts.CompletionTriggerKind.TriggerCharacter },
      ts.getDefaultFormatCodeSettings()
    )

    if (token?.isCancellationRequested) return []

    const completions: Pick<ts.CompletionEntry, 'name' | 'sortText' | 'kind'>[] = C ? C.entries : []

    if (!resolveDependencies)
      await attachGlobalSymbolsIntoCompletions(document, projectRoot, token, completions)

    const getSortText = await getSortTextCallback(document, position, projectRoot, token)

    return completions.map<vscode.CompletionItem>(({ name: label, sortText, kind }) => ({
      kind: utils.TSElementKindtoVSCodeCompletionItemKind(kind),
      sortText: getSortText(label, sortText, kind),
      label
    }))
  }

  return await utils.consumeScriptModule({
    document,
    position,
    projectRoot,
    consumer,
    token,
    compileOptions: !resolveDependencies
      ? {
          skipAttachDependencies: true,
          skipAttachGlobalScript: true
        }
      : {}
  })
}

async function attachGlobalSymbolsIntoCompletions(
  document: Pick<vscode.TextDocument, 'fileName' | 'lineAt'>,
  projectRoot: string,
  token: vscode.CancellationToken | undefined,
  completions: Pick<ts.CompletionEntry, 'name' | 'sortText' | 'kind'>[]
) {
  const documentN = cUtils.normalizePath(document.fileName, projectRoot).toLowerCase()
  const deps = await utils
    .consumeScriptModule({
      document,
      projectRoot,
      consumer: p => p.map.sources,
      getTypeScriptEnvironment: false
    })
    .then(deps => deps?.filter(d => d !== documentN))

  if (!deps?.every(d => utils.moduleSymbolsRepository.has(d))) {
    await getNavigationBarItems(document, projectRoot, token, true)
  }

  if (deps)
    for (const d of deps) {
      const repo = utils.moduleSymbolsRepository.get(d)
      if (!repo) {
        continue
      }
      for (const s of repo)
        if (
          s.containerName === '<global>' &&
          /^[_$a-zA-ZА-Яа-я]+$/.test(s.name) &&
          !completions.some(
            c =>
              c.name === s.name &&
              c.kind === utils.VSCodeSymbolKindToTSElementKind(s.kind) &&
              c.sortText === '11'
          )
        )
          completions.push({
            name: s.name,
            kind: utils.VSCodeSymbolKindToTSElementKind(s.kind),
            sortText: '11'
          })
    }
}

function needBundleContextCompletionRequest<T extends Parameters<typeof getCompletionsAtPosition>>(
  props: { document: T[0]; position: T[1] } & Required<
    Pick<utils.IConsumerProps, 'env' | 'bundlePosition'>
  >
) {
  let foundNode: ts.Node | undefined
  const sf = props.env.getSourceFile(utils.bundle) as ts.SourceFile
  const bundleOffset = ts.getPositionOfLineAndCharacter(
    sf,
    (props.bundlePosition.line || 1) - 1,
    props.position.character
  )

  let isInCallExpressionObjectLiteral = false

  const visit = (node: ts.Node): void => {
    const start = node.getStart()
    const end = node.getEnd()

    if (start <= bundleOffset && bundleOffset <= end) {
      foundNode = node

      if (node.kind === ts.SyntaxKind.ObjectLiteralExpression) {
        let parent = node.parent
        while (parent) {
          if (parent.kind === ts.SyntaxKind.CallExpression) {
            isInCallExpressionObjectLiteral = true
            break
          }
          parent = parent.parent
        }
      }

      ts.forEachChild(node, visit)
    }
  }

  ts.forEachChild(sf, visit)

  const isDottedCompletionRequest =
    libUtils.firstNonPatternLeftChar(props.document, props.position, /\s/).char === '.' ||
    (foundNode?.kind === ts.SyntaxKind.Identifier &&
      foundNode?.parent &&
      foundNode?.parent.kind === ts.SyntaxKind.PropertyAccessExpression &&
      foundNode?.parent.getChildAt(2).getStart() === foundNode.getStart())

  return isDottedCompletionRequest || isInCallExpressionObjectLiteral
}

async function getSortTextCallback(
  document: Pick<vscode.TextDocument, 'fileName' | 'lineAt'>,
  position: Pick<vscode.Position, 'line' | 'character'>,
  projectRoot: string,
  token?: vscode.CancellationToken
) {
  const localSymbols = await getNavigationBarItems(document, projectRoot, token)
  const typedPosition = new vscode.Position(position.line, position.character)
  const contextRanges = localSymbols
    ?.filter(s => s.location.range.contains(typedPosition))
    ?.sort((a, b) => (b.location.range.contains(a.location.range) ? -1 : 1))
    .map((s, i) => ({ ...s, ctx: (-i - 1).toString() }))
  return (label: string, sortText: string, kind: ts.ScriptElementKind) => {
    const s = localSymbols?.find(
      s =>
        s.name === label &&
        utils.TSElementKindtoVSCodeSymbolKind(kind) === s.kind &&
        contextRanges?.some(r => r.location.range.contains(s.location.range))
    )
    if (!s) return sortText
    const r = contextRanges
      ?.filter(r => r.location.range.contains(s.location.range))
      .sort((a, b) => (Number(a.ctx) > Number(b.ctx) ? 1 : 0))[0]
    if (!r) return sortText
    return r.ctx
  }
}

async function getCompletionEntryDetails(
  document: Pick<vscode.TextDocument, 'fileName'>,
  position: Pick<vscode.Position, 'line' | 'character'>,
  completionItemLabel: string,
  projectRoot: string,
  token?: vscode.CancellationToken
): Promise<vscode.ProviderResult<vscode.CompletionItem>> {
  const consumer = async ({ bundlePosition, env }: utils.IConsumerProps) => {
    if (
      bundlePosition.line == null ||
      bundlePosition.column == null ||
      token?.isCancellationRequested ||
      !env
    )
      return

    return libUtils.logtime(
      env.languageService.getCompletionEntryDetails,
      utils.bundle,
      ts.getPositionOfLineAndCharacter(
        env.getSourceFile(utils.bundle) as ts.SourceFileLike,
        bundlePosition.line - 1,
        position.character
      ),
      completionItemLabel,
      ts.getDefaultFormatCodeSettings(),
      undefined,
      undefined,
      undefined
    )
  }

  const D = await utils.consumeScriptModule({ document, position, projectRoot, consumer, token })

  if (D === undefined) return

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

async function getQuickInfoAtPosition(
  document: Pick<vscode.TextDocument, 'fileName'>,
  position: Pick<vscode.Position, 'line' | 'character'>,
  projectRoot: string,
  token?: vscode.CancellationToken
): Promise<vscode.MarkdownString[]> {
  const consumer = async ({ bundlePosition, env }: utils.IConsumerProps) => {
    if (
      bundlePosition.line == null ||
      bundlePosition.column == null ||
      token?.isCancellationRequested ||
      !env
    )
      return

    if (token?.isCancellationRequested) return

    return libUtils.logtime(
      env.languageService.getQuickInfoAtPosition,
      utils.bundle,
      ts.getPositionOfLineAndCharacter(
        env.getSourceFile(utils.bundle) as ts.SourceFileLike,
        bundlePosition.line - 1,
        position.character
      )
    )
  }

  const QI = await utils.consumeScriptModule({
    document,
    position,
    projectRoot,
    consumer,
    token
  })

  if (QI === undefined) return []

  return [
    new vscode.MarkdownString()
      .appendCodeblock((QI.displayParts || []).map(p => p.text).join(''), 'typescript')
      .appendMarkdown((QI.documentation || []).map(p => p.text).join(''))
      .appendMarkdown('\r\n\r\n')
      .appendMarkdown((QI.tags || []).map(utils.prettifyJSDoc).join('\r\n\r\n'))
  ]
}

async function getSignatureHelpItems(
  document: Pick<vscode.TextDocument, 'fileName'>,
  position: Pick<vscode.Position, 'line' | 'character'>,
  projectRoot: string,
  token?: vscode.CancellationToken
  // TODO: все фичи привести к одному АПИ
): Promise<vscode.ProviderResult<vscode.SignatureHelp>> {
  const functionName = await utils.consumeScriptModule({
    token,
    document,
    position,
    projectRoot,
    cacheTypeScriptEnvironment: false,
    compileOptions: { skipAttachDependencies: true, skipAttachGlobalScript: true },
    consumer(props) {
      if (!props.env) return

      const sf = props.env.getSourceFile(utils.bundle) as ts.SourceFile
      const bundleOffset = ts.getPositionOfLineAndCharacter(
        sf,
        (props.bundlePosition.line || 1) - 1,
        position.character
      )

      let callExpr: ts.CallExpression | undefined
      const visit = (node: ts.Node): void => {
        if (node.getStart() <= bundleOffset && node.getEnd() >= bundleOffset) {
          if (ts.isCallExpression(node)) {
            callExpr = node
          }
          ts.forEachChild(node, visit)
        }
      }
      ts.forEachChild(sf, visit)

      if (!callExpr) return

      let functionName: string | undefined
      const expression = callExpr.expression

      if (ts.isIdentifier(expression)) {
        functionName = expression.text
      } else if (ts.isPropertyAccessExpression(expression)) {
        functionName = expression.name.text
      } else if (ts.isElementAccessExpression(expression)) {
        return
      }

      return new RegExp(`[^a-zA-Z0-9$_]${functionName}[^a-zA-Z0-9$_]`, 'm')
    }
  })

  const H = await utils.consumeScriptModule({
    token,
    document,
    position,
    projectRoot,
    compileOptions: functionName ? { treeShaking: { searchPattern: functionName } } : undefined,
    consumer: async ({ bundlePosition, env }: utils.IConsumerProps) => {
      if (
        bundlePosition.line == null ||
        bundlePosition.column == null ||
        token?.isCancellationRequested ||
        !env
      )
        return

      if (token?.isCancellationRequested) return

      return libUtils.logtime(
        env.languageService.getSignatureHelpItems,
        utils.bundle,
        ts.getPositionOfLineAndCharacter(
          env.getSourceFile(utils.bundle) as ts.SourceFileLike,
          bundlePosition.line - 1,
          position.character
        ),
        {
          triggerReason: { kind: 'retrigger' }
        }
      )
    }
  })

  if (H === undefined || !H.items.length) return

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
async function getReferencesAtPosition(
  // TODO: переделать под объект-пропсы
  document: Pick<vscode.TextDocument, 'fileName'>,
  position: Pick<vscode.Position, 'line' | 'character'>,
  projectRoot: string,
  token?: undefined | vscode.CancellationToken | (vscode.CancellationToken | undefined)[],
  source?: cUtils.TNormalizedPath,
  clearVTS?: boolean,
  searchPatternForTreeShaking?: RegExp | string
): Promise<wgl.SymbolEntry[]> {
  const consumer = async ({ bundlePosition, map, env, bundleContent }: utils.IConsumerProps) => {
    if (
      bundlePosition.line == null ||
      bundlePosition.column == null ||
      utils.isCancelled(token) ||
      !env
    )
      return

    if (utils.isCancelled(token)) return

    const R = libUtils.logtime(
      env.languageService.getReferencesAtPosition,
      source === '/lib.d.ts' ? '/lib.d.ts' : utils.bundle,
      ts.getPositionOfLineAndCharacter(
        env.getSourceFile(source === '/lib.d.ts' ? '/lib.d.ts' : utils.bundle) as ts.SourceFileLike,
        bundlePosition.line - 1,
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

    forConsumer.map(record => {
      const length = record[0].textSpan.length
      const { line: ln, character: column } = record[1]
      const { line, source } = map.originalPositionFor({ line: ln + 1, column: column + 1 })

      if (source == null || line == null) return
      sourceR.push({ source, column, length, line: line - 1 })
    })

    if (utils.isCancelled(token)) return

    // libUtils._showBuildOutput({ bundleContent, map })

    return sourceR
  }

  return (
    (await utils.consumeScriptModule({
      document,
      position,
      projectRoot,
      consumer,
      token,
      source,
      compileOptions: {
        treeShaking: searchPatternForTreeShaking
          ? { searchPattern: searchPatternForTreeShaking }
          : undefined
      },
      cacheTypeScriptEnvironment: clearVTS ? false : undefined
    })) || []
  )
}

async function getNavigationBarItems(
  document: Pick<vscode.TextDocument, 'fileName'>,
  projectRoot: string,
  token?: vscode.CancellationToken,
  includeWorkspaceSymbols?: true
): Promise<vscode.ProviderResult<vscode.SymbolInformation[]>> {
  if (includeWorkspaceSymbols) {
    const documentN = cUtils.normalizePath(document.fileName, projectRoot).toLowerCase()
    const deps = await utils
      .consumeScriptModule({
        document,
        projectRoot,
        consumer: p => p.map.sources,
        getTypeScriptEnvironment: false
      })
      .then(deps => deps?.filter(d => d !== documentN))

    if (deps?.every(d => utils.moduleSymbolsRepository.has(d))) {
      const entrySymbols = (await getNavigationBarItems(document, projectRoot, token)) || []
      const notEntrySymbols: vscode.SymbolInformation[] = []
      for (const d of deps) {
        const repo = utils.moduleSymbolsRepository.get(d)
        if (repo)
          repo.map(s =>
            notEntrySymbols.push(
              new vscode.SymbolInformation(
                s.name,
                s.kind,
                s.containerName,
                new vscode.Location(
                  vscode.Uri.file(s.fileName),
                  new vscode.Position(s.line, s.character)
                )
              )
            )
          )
      }
      return [...entrySymbols, ...notEntrySymbols]
    }
  }

  const consumer = async ({ map, env, bundleContent }: utils.IConsumerProps) => {
    if (!env) return

    const NT = [env.languageService.getNavigationTree(utils.bundle)]

    if (NT === undefined || !NT.length || token?.isCancellationRequested) return

    const sourceSymbols: vscode.SymbolInformation[] = []
    const sf = env.getSourceFile(utils.bundle) as ts.SourceFileLike
    const documentN = cUtils.normalizePath(document.fileName, projectRoot)
    const forConsumer: Array<{
      item: ts.NavigationTree
      start: ts.LineAndCharacter
      end: ts.LineAndCharacter
      container?: string
    }> = []

    function collectNavBarItemsWithLineAndCharacter(
      items: ts.NavigationTree[],
      container?: string
    ) {
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

    forConsumer.map(({ start, end, item, container }) => {
      if (token?.isCancellationRequested) return

      const posS = map.originalPositionFor({
        line: start.line + 1,
        column: start.character + 1
      })

      if (posS.source == null || posS.line == null) return
      if (posS.source !== documentN.toLowerCase() && !includeWorkspaceSymbols) return

      const posE = map.originalPositionFor({
        line: end.line + 1,
        column: end.character + 1
      })

      if (posE.source == null || posE.line == null) return
      if (posE.source !== documentN.toLowerCase() && !includeWorkspaceSymbols) return

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

    if (token?.isCancellationRequested) return

    if (includeWorkspaceSymbols) {
      for (const s of sourceSymbols) {
        if (s.location.uri.fsPath.toLowerCase() === document.fileName.toLowerCase()) continue
        const dependency = cUtils.normalizePath(s.location.uri.fsPath, projectRoot).toLowerCase()
        const repo = utils.moduleSymbolsRepository.get(dependency)
        if (!repo)
          utils.moduleSymbolsRepository.set(dependency, [
            {
              name: s.name,
              kind: s.kind,
              containerName: s.containerName,
              fileName: s.location.uri.fsPath,
              line: s.location.range.start.line,
              character: s.location.range.start.character
            }
          ])
        else if (
          !repo.some(
            rs =>
              rs.name === s.name &&
              rs.fileName === s.location.uri.fsPath &&
              rs.line === s.location.range.start.line &&
              rs.character === s.location.range.start.character
          )
        )
          repo.push({
            name: s.name,
            kind: s.kind,
            containerName: s.containerName,
            fileName: s.location.uri.fsPath,
            line: s.location.range.start.line,
            character: s.location.range.start.character
          })
      }
    }

    return sourceSymbols
  }

  return await utils.consumeScriptModule({
    document,
    projectRoot,
    consumer,
    token,
    compileOptions: includeWorkspaceSymbols
      ? {}
      : { skipAttachGlobalScript: true, skipAttachDependencies: true }
  })
}

/**
 * Find All References to a Symbol in whole project
 * @param document entry TextDocument to compile
 * @param position position of request
 * @param projectRoot root system path of project
 * @param token optional cancellation token
 */
async function getReferencesAtPositionInProject(
  document: Pick<vscode.TextDocument, 'fileName'>,
  position: Pick<vscode.Position, 'line' | 'character'>,
  projectRoot: string,
  token?: vscode.CancellationToken,
  searchPattern?: RegExp
): Promise<wgl.SymbolEntry[]> {
  const definitions = await getDefinitionInfoAtPosition(
    document,
    position,
    projectRoot,
    token,
    searchPattern
  )

  if (!definitions.length || utils.isCancelled(token)) return []

  // 1 глобальный скрипт определен
  const globalScript = path.join(projectRoot, libUtils.getExtOption<string>('globalScript.path'))
  const globalScriptN = cUtils.normalizePath(globalScript, projectRoot)

  if (!fs.existsSync(globalScript)) {
    // все эти консоли переписать на channel расширения
    // console.log(
    //   `INFO: Global script module ${globalScriptN} not exists. Get references at position in project not available.`
    // )
    return definitions
  }

  const globalDeps = await utils.getGlobalDeps(projectRoot)
  const D = definitions[0]
  const entry = cUtils.normalizePath(document.fileName, projectRoot)
  let modules: cUtils.TNormalizedPath[] = []
  let postfix = ''

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Window,
      cancellable: true,
      title: 'WGLToolchain'
    },
    async (p, t) => {
      p.report({ message: 'Searching module references' })

      if (D.source.match('node_modules\\\\@types')) {
        // 1.1 дефинишн находится в либе .d.ts
        const strategy = libUtils.getExtOption<'bundle' | 'project'>(
          'intellisense.requestDepthStrategy.librarySymbols'
        )

        if (strategy === 'project') {
          modules = await utils.getJsFiles(projectRoot, searchPattern)
          modules = modules.filter(m => !globalDeps.includes(m))
          D.source = `/${path.basename(D.source)}`
        } else {
          return await getReferencesAtPosition(
            document,
            position,
            projectRoot,
            token,
            undefined,
            undefined,
            searchPattern
          )
        }
      } else if (globalDeps.includes(D.source)) {
        // 1.2 дефинишн находится в глобалскрипте
        const strategy = libUtils.getExtOption<'bundle' | 'project'>(
          'intellisense.requestDepthStrategy.globalSymbols'
        )

        if (strategy === 'project') {
          modules = await utils.getJsFiles(projectRoot, searchPattern)
          modules = modules.filter(m => !globalDeps.includes(m))
        } else {
          return await getReferencesAtPosition(
            document,
            position,
            projectRoot,
            token,
            undefined,
            undefined,
            searchPattern
          )
        }
      } else {
        // 1.3 дефинишн находится в локальном скрипте
        const strategy = libUtils.getExtOption<'bundle' | 'project'>(
          'intellisense.requestDepthStrategy.localSymbols'
        )

        if (strategy === 'project') {
          modules = await getModuleReferences(
            D.source,
            projectRoot,
            token,
            false /** init */,
            searchPattern
          )
        } else {
          return await getReferencesAtPosition(
            document,
            position,
            projectRoot,
            token,
            undefined,
            undefined,
            searchPattern
          )
        }
      }

      const modulesLen = modules.length
      const extModulesLenOption = libUtils.getExtOption<number>(
        'intellisense.requestDepthStrategy.sliceModuleReferencesLength'
      )

      if (modulesLen > extModulesLenOption) {
        modules = utils.chunkedArray(modules, extModulesLenOption)[0]

        // TODO: принудительный хоистинг для широкого охвата символов при слайсе модулей, совместить с кешированием компиляции ??
        /*
        const modulesCopy = [...modules]
        modules = []
        for (const m of modulesCopy.filter(m => !globalDeps.includes(m))) {
          const refs = await getModuleReferences(m, projectRoot, token, false, searchPattern)
          for (const r of refs) if (!modules.includes(r)) modules.push(r)
        }
        // */
      }

      if (!modules.includes(entry)) modules.push(entry)
      if (!modules.includes(globalScriptN)) modules.push(globalScriptN)
      postfix = modulesLen - modules.length > 0 ? ` (${modulesLen - modules.length} skipped)` : ''
    }
  )

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
              true /** clear VTS after request */,
              searchPattern
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

const moduleReferencesStorage = new Map<cUtils.TNormalizedPath, cUtils.TNormalizedPath[]>()
const modulesWithError = new Set<string>()

/**
 * Get module references
 * @param module module to search for links
 * @param projectRoot root system path of project
 * @param token optional cancellation token
 * @param init first initialization on startup service
 * @param searchPattern optional filter of module content
 * @returns
 */
async function getModuleReferences(
  module: cUtils.TNormalizedPath,
  projectRoot: string,
  token?: vscode.CancellationToken,
  init?: boolean,
  searchPattern?: RegExp
): Promise<cUtils.TNormalizedPath[]> {
  if (token?.isCancellationRequested) return []

  // TODO: здесь теряется хоистинг
  let scripts: Array<cUtils.TNormalizedPath> = await utils.getJsFiles(projectRoot, searchPattern)

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

      const globalDeps = await utils.getGlobalDeps(projectRoot)
      const threads = libUtils.getExtOption<number>('intellisense.buildThreads')

      for (const chunk of utils.chunkedArray(scripts, threads)) {
        if (utils.isCancelled([token, t])) break
        await Promise.all(
          chunk.map(script =>
            utils.isCancelled([token, t])
              ? null
              : compiler
                  .compile(path.join(projectRoot, script), {
                    projectRoot,
                    modules: [...globalDeps],
                    skipAttachGlobalScript: true,
                    skipAttachNonImportStatements: true
                  })
                  .then(sn => sn.toStringWithSourceMap({ file: script }))
                  .then(strWSM => sm.SourceMapConsumer.fromSourceMap(strWSM.map))
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
      if (entry.toLowerCase() !== d.toLowerCase() && moduleReferencesStorage.has(d))
        moduleReferencesStorage.delete(d)

  for (const [entry, deps] of moduleReferencesStorage)
    if (deps.find(d => d.toLowerCase() === module.toLowerCase())) moduleReferences.push(entry)

  return moduleReferences
}

// TODO: добавить линтер с исправлением callExpressionAssignment
async function getDiagnostics(
  document: Pick<vscode.TextDocument, 'fileName'>,
  projectRoot: string
): Promise<Map<cUtils.TNormalizedPath, vscode.Diagnostic[]> | undefined> {
  const consumer = async ({ map, env }: utils.IConsumerProps) => {
    if (!env) return

    const documentN = cUtils.normalizePath(document.fileName, projectRoot)
    const semanticD = libUtils.logtime(env.languageService.getSemanticDiagnostics, utils.bundle)
    const syntacticD = libUtils.logtime(env.languageService.getSyntacticDiagnostics, utils.bundle)
    const sourceD = new Map<cUtils.TNormalizedPath, vscode.Diagnostic[]>()
    const allowedErrorCodes = libUtils.getExtOption<number[]>(
      'intellisense.diagnostics.allowedErrorCodes'
    )
    const ignoreCodes = libUtils.getExtOption<number[]>('intellisense.diagnostics.ignoreCodes')

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
        d.start < cUtils.gls.code.length /** location at global script */ ||
        ignoreCodes.includes(d.code)
      )
        continue

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
        d.start < cUtils.gls.code.length /** location at global script */ ||
        ignoreCodes.includes(d.code)
      )
        continue

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

    for (const { start, end, category, code, message } of forConsumer) {
      const posS = map.originalPositionFor({
        line: start.line + 1,
        column: start.character + 1
      })

      const posE = map.originalPositionFor({
        line: end.line + 1,
        column: end.character + 1
      })

      if (posS.source == null || posS.line == null) continue
      if (posE.source == null || posE.line == null) continue

      // TODO: сделать опцию в настройках расширения "стратегия запроса диагностик"
      if (posS.source !== documentN.toLowerCase()) continue

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

    return sourceD
  }

  return await utils.consumeScriptModule({ document, projectRoot, consumer })
}

// TODO: add support Octal literals
async function getFormattingEditsForDocument(
  document: Pick<vscode.TextDocument, 'fileName' | 'getText'>,
  projectRoot: string,
  endPos: vscode.Position,
  token?: vscode.CancellationToken
): Promise<vscode.ProviderResult<vscode.TextEdit[]>> {
  const consumer = async ({ entryContent }: utils.IConsumerProps) => {
    let config = await prettier.resolveConfig(path.join(projectRoot, '.prettierrc'))

    if (config) config = { ...config, parser: 'typescript' }
    else config = { parser: 'typescript' }

    if (token?.isCancellationRequested) return

    const newText = await prettier.format(entryContent, config)
    const unformattedDocumentAST = cUtils.parse(document.getText())
    const formattedDocumentAST = cUtils.parse(newText)
    const sn = await compiler.saveLegacyAstNodes(unformattedDocumentAST, formattedDocumentAST)
    const strWSM = sn.toStringWithSourceMap({ file: path.relative(projectRoot, document.fileName) })

    return [
      {
        newText: strWSM.code,
        range: new vscode.Range(0, 0, endPos.line + 1, endPos.character + 1)
      }
    ]
  }

  return await utils.consumeScriptModule({
    compileOptions: { skipAttachDependencies: true, skipAttachGlobalScript: true },
    cacheTypeScriptEnvironment: false,
    getTypeScriptEnvironment: false,
    projectRoot,
    document,
    consumer
  })
}

async function fixLegacySyntaxAction(
  document: Pick<vscode.TextDocument, 'fileName' | 'getText'>,
  projectRoot: string,
  endPos: vscode.Position,
  token?: vscode.CancellationToken
): Promise<vscode.ProviderResult<vscode.TextEdit>> {
  const consumer = async ({ entryContent }: utils.IConsumerProps) => {
    let config = await prettier.resolveConfig(path.join(projectRoot, '.prettierrc'))

    if (config) config = { ...config, parser: 'typescript' }
    else config = { parser: 'typescript' }

    if (token?.isCancellationRequested) return

    const newText = await prettier.format(entryContent, config)
    const unformattedDocumentAST = cUtils.parse(document.getText())
    const formattedDocumentAST = cUtils.parse(newText)
    const sn = await compiler.fixLegacyAstNodes(unformattedDocumentAST, formattedDocumentAST)
    const strWSM = sn.toStringWithSourceMap({ file: path.relative(projectRoot, document.fileName) })

    return {
      newText: strWSM.code,
      range: new vscode.Range(0, 0, endPos.line + 1, endPos.character + 1)
    }
  }

  return await utils.consumeScriptModule({
    compileOptions: { skipAttachDependencies: true, skipAttachGlobalScript: true },
    cacheTypeScriptEnvironment: false,
    getTypeScriptEnvironment: false,
    projectRoot,
    document,
    consumer
  })
}

async function getFoldingRanges(
  document: Pick<vscode.TextDocument, 'fileName'>,
  projectRoot: string,
  token?: vscode.CancellationToken
): Promise<vscode.ProviderResult<vscode.FoldingRange[]>> {
  const consumer = async ({ map, env }: utils.IConsumerProps) => {
    if (!env) return

    const S = env.languageService.getOutliningSpans(utils.bundle)

    if (S === undefined || !S.length || token?.isCancellationRequested) return

    const sourceFR: vscode.FoldingRange[] = []
    const sf = env.getSourceFile(utils.bundle) as ts.SourceFileLike
    const documentN = cUtils.normalizePath(document.fileName, projectRoot)

    for (const s of S) {
      if (token?.isCancellationRequested) return

      const start = ts.getLineAndCharacterOfPosition(sf, s.textSpan.start)
      const end = ts.getLineAndCharacterOfPosition(sf, s.textSpan.start + s.textSpan.length)

      const posS = map.originalPositionFor({
        line: start.line + 1,
        column: start.character + 1
      })

      if (posS.source == null || posS.line == null) return
      if (posS.source !== documentN.toLowerCase()) return

      const posE = map.originalPositionFor({
        line: end.line + 1,
        column: end.character + 1
      })

      if (posE.source == null || posE.line == null) return
      if (posE.source !== documentN.toLowerCase()) return

      sourceFR.push(
        new vscode.FoldingRange(
          posS.line - 1,
          posE.line - 1,
          utils.TSOutliningSpanKindToVSCodeSymbolKind(s.kind)
        )
      )
    }

    return sourceFR
  }

  return await utils.consumeScriptModule({
    compileOptions: { skipAttachDependencies: true, skipAttachGlobalScript: true },
    projectRoot,
    document,
    consumer,
    token
  })
}

async function getBundle(
  document: Pick<vscode.TextDocument, 'fileName'>,
  projectRoot: string,
  position: Pick<vscode.Position, 'line' | 'character'>
): Promise<[string, sm.Position]> {
  const consumer = async ({ bundlePosition, bundleContent, map }: utils.IConsumerProps) => {
    if (bundlePosition.line === null || bundlePosition.column === null)
      return ['', { line: 1, column: 0 }] as [string, sm.Position]

    const { line, column } = map.generatedPositionFor({
      source: path.relative(projectRoot, document.fileName).toLowerCase(),
      line: position.line + 1,
      column: position.character
    })

    return [bundleContent, { line: line || 1, column: column || 0 }] as [string, sm.Position]
  }

  return (
    (await utils.consumeScriptModule({
      document,
      position,
      projectRoot,
      consumer
    })) || (['', { line: 1, column: 0 }] as [string, sm.Position])
  )
}

async function getLocalBundle(
  document: Pick<vscode.TextDocument, 'fileName'>,
  projectRoot: string,
  position: vscode.Position
): Promise<[string, sm.Position]> {
  let bundlePosition: sm.Position = { line: 1, column: 0 }

  const globalDeps = await utils.getGlobalDeps(projectRoot)

  const localBundle = await compiler
    .compile(path.join(document.fileName), {
      projectRoot,
      modules: [...globalDeps],
      skipAttachGlobalScript: true
    })
    .then(sn => sn.toStringWithSourceMap({ file: path.relative(projectRoot, document.fileName) }))
    .then(async strWSM => {
      const map = await sm.SourceMapConsumer.fromSourceMap(strWSM.map)
      const pos = map.generatedPositionFor({
        source: path.relative(projectRoot, document.fileName).toLowerCase(),
        line: position.line + 1,
        column: position.character
      })

      bundlePosition = { line: pos.line || 1, column: pos.column || 0 }

      return strWSM.code
    })

  return [localBundle, bundlePosition]
}

async function getModuleInfo(
  document: Pick<vscode.TextDocument, 'fileName'>,
  projectRoot: string
): Promise<vscode.ProviderResult<vscode.MarkdownString>> {
  const consumer = async ({ map }: utils.IConsumerProps) => {
    const info = new vscode.MarkdownString('')
    const entry = cUtils.normalizePath(document.fileName, projectRoot)
    const globalDeps = await utils.getGlobalDeps(projectRoot)

    type FileTree = { [key: string]: FileTree }
    function buildFileTree(paths: string[]): FileTree {
      const tree: FileTree = {}

      paths.map(path => {
        const parts = path.split('\\')
        let current: FileTree = tree

        parts.map(part => {
          if (!current[part]) {
            current[part] = {}
          }
          current = current[part]
        })
      })

      return tree
    }

    /*
      markdown += `${indent}${isLastItem ? '┗━━📂 ', '┣━━📂 '}${key}\n`
        `${indent}${isLastItem ? '   ' : '┃  '}`,
      markdown += `${indent}${isLastItem ? '┗━━🧾 ' : '┣━━🧾 '}${key}\t${fileLink}\n`
    */

    function generateMarkdown(tree: FileTree, indent: string, context: string): string {
      let markdown = ''

      const keys = Object.keys(tree).sort() // Сортируем ключи по алфавиту
      const totalKeys = keys.length

      keys.map((key, index) => {
        const isDirectory = Object.keys(tree[key]).length > 0
        const isLastItem = index === totalKeys - 1 // Проверяем, является ли текущий элемент последним

        if (isDirectory) {
          markdown += `${indent}${isLastItem ? '   - 📂 ' : '   - 📂 '}${key}\n`
          markdown += generateMarkdown(
            tree[key],
            `${indent}${isLastItem ? '   ' : '   '}`,
            `${context}${key}/`
          )
        } else {
          const fileLink = `[](${context}${key})`
          markdown += `${indent}${isLastItem ? '   - 🧾 ' : '   - 🧾 '}${key}\t${fileLink}\n`
        }
      })

      return markdown
    }

    function prettifyMarkdownTree(md: string): string {
      let maxLength = 0

      md.split('\n').map(line => {
        const parts = line.split('\t')
        if (parts.length === 2 && maxLength < parts[0].length) maxLength = parts[0].length
      })

      maxLength++

      return md
        .split('\n')
        .map(line => {
          const parts = line.split('\t')
          if (parts.length !== 2) return line

          return parts[0] + ' '.repeat(maxLength - parts[0].length) + parts[1].trim()
        })
        .join('\n')
    }

    let fileTree: FileTree = {}

    info.appendMarkdown('# Module info\n')
    info.appendMarkdown('\n')
    info.appendMarkdown('**Entry**\n')
    info.appendMarkdown(`${entry}\n`)
    info.appendMarkdown('\n')
    info.appendMarkdown('## local dependencies \n')
    info.appendMarkdown('\n')

    fileTree = buildFileTree(
      map.sources
        .filter(d => !globalDeps.includes(d) && d !== entry)
        .map(m => cUtils.normalizePath(libUtils.getRealCasePath(projectRoot, m), projectRoot))
    )
    info.appendMarkdown('- 📂 Project\n')
    info.appendMarkdown(prettifyMarkdownTree(generateMarkdown(fileTree, '', '')))
    info.appendMarkdown('\n')

    info.appendMarkdown(
      `## global dependencies (${libUtils.getExtOption<string>('globalScript.path')})\n`
    )
    info.appendMarkdown('\n')

    fileTree = buildFileTree(
      map.sources
        .filter(d => globalDeps.includes(d))
        .map(m => cUtils.normalizePath(libUtils.getRealCasePath(projectRoot, m), projectRoot))
    )
    info.appendMarkdown('- 📂 Project\n')
    info.appendMarkdown(prettifyMarkdownTree(generateMarkdown(fileTree, '', '')))

    return info
  }

  return await utils.consumeScriptModule({
    document,
    projectRoot,
    consumer,
    getTypeScriptEnvironment: false
  })
}

export const intellisense = utils.track({
  getDiagnostics,
  modulesWithError,
  moduleReferencesStorage,
  getDefinitionInfoAtPosition,
  getCompletionsAtPosition,
  getCompletionEntryDetails,
  getQuickInfoAtPosition,
  getSignatureHelpItems,
  getReferencesAtPositionInProject,
  getReferencesAtPosition,
  getNavigationBarItems,
  getFormattingEditsForDocument,
  getFoldingRanges,
  getLocalBundle,
  getModuleInfo,
  getBundle,
  fixLegacySyntaxAction
})
