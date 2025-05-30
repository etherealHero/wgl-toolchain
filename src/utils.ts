import * as fs from 'fs'
import * as path from 'path'
import * as vscode from 'vscode'
import * as compilerUtils from './compiler/utils'
import * as ext from './extension'
import * as utils from './intellisense/utils'

import { intellisense } from './intellisense/features'

export const getExtOption = <T>(option: string): T => {
  if (option === 'globalScript.path') {
    const lastUsed = ext.ExtensionContext.globalState.get<string>(LAST_USED_KEY)
    if (!lastUsed) return vscode.workspace.getConfiguration('wglscript').get(option) as T
    if (lastUsed === NONE_FILE) return '' as T
    return lastUsed as T
  }
  return vscode.workspace.getConfiguration('wglscript').get(option) as T
}

export function requestOpenWglScriptWorkspace() {
  vscode.window
    .showWarningMessage(
      'WGLScript features are not working here. You need to open real ScriptModule in active WGLScript project workspace',
      'Open Folder'
    )
    .then(v => {
      if (v !== 'Open Folder') return
      vscode.commands.executeCommand('workbench.action.files.openFolder')
    })
}

export function arrayToMap<T>(array: Array<T>) {
  return new Map(array.map((item, index) => [index, item]))
}

export function mapToArray<T>(map: Map<number, T>) {
  return Array.from(map.values())
}

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
type AnyFn = (...args: any[]) => any

export function logtime<T extends AnyFn>(fn: T, ...args: Parameters<T>): ReturnType<T> {
  const stack = ((new Error().stack || '').split('\n').at(2) || '')
    .trim()
    .replace(/\s+\(.+:\d+:\d+\)/, '')

  const startTime = performance.now()
  const result = fn(...args)
  const endTime = performance.now()

  // console.log(`INFO: ${Math.round((endTime - startTime) * 100) / 100}ms ${fn.name} ${stack}`)
  return result
}

export const restartService = (behaviour?: 'cleanCache' | 'restartExtensionHost') => {
  try {
    const exceptionBehaviour =
      behaviour ||
      getExtOption<'cleanCache' | 'restartExtensionHost'>('intellisense.exceptionBehaviour')

    if (exceptionBehaviour === 'cleanCache') {
      ext.diagnosticsCollection.clear()
      utils.bundleInfoRepository.clear()
      utils.moduleSymbolsRepository.clear()

      compilerUtils.astStorage.clear()
      compilerUtils.gls.code = ''
      compilerUtils.gls.sourcemap = ''
      compilerUtils.gls.modules = new Map()

      initializeDiagnostics()
    } else if (exceptionBehaviour === 'restartExtensionHost') {
      vscode.commands.executeCommand('workbench.action.restartExtensionHost')
    }
  } catch (_) {}

  const wsf = vscode.workspace.workspaceFolders
  if (wsf !== undefined) {
    const projectRoot = wsf[0].uri.fsPath

    vscode.window.withProgress(
      {
        title: 'WGLToolchain: Initialize features',
        location: vscode.ProgressLocation.Window,
        cancellable: false
      },
      () => compilerUtils.attachGlobalScript('plug.js', { projectRoot, modules: [] }, [])
    )
  }
}

export async function showBundle() {
  const activeTE = vscode.window.activeTextEditor

  if (!activeTE) return

  const wsPath = vscode.workspace.getWorkspaceFolder(activeTE.document.uri)?.uri.fsPath

  if (!wsPath) return

  const [bundle, bundlePosition] = await intellisense.getBundle(
    activeTE.document,
    wsPath,
    activeTE.selection.active
  )

  if (!bundle) return

  const newDocument = await vscode.workspace.openTextDocument({
    content: bundle,
    language: 'javascript'
  })

  const secondEditor = await vscode.window.showTextDocument(newDocument, {
    viewColumn: vscode.ViewColumn.Beside,
    preserveFocus: false
  })

  secondEditor.selection = new vscode.Selection(
    new vscode.Position(bundlePosition.line - 1, activeTE.selection.active.character),
    new vscode.Position(bundlePosition.line - 1, activeTE.selection.active.character)
  )

  secondEditor.revealRange(
    new vscode.Range(
      new vscode.Position(bundlePosition.line - 1, activeTE.selection.active.character),
      new vscode.Position(bundlePosition.line - 1, activeTE.selection.active.character)
    ),
    vscode.TextEditorRevealType.InCenter
  )
}

/** @debug */
/*
export async function _showBuildOutput(
  bundleInfo: Pick<
    typeof bundleInfoRepository extends Map<infer _, infer V> ? V : never,
    'map' | 'bundleContent'
  >
) {
  const activeTE = vscode.window.activeTextEditor

  if (!activeTE) return

  const wsPath = vscode.workspace.getWorkspaceFolder(activeTE.document.uri)?.uri.fsPath

  if (!wsPath) return

  // const bundleInfo = bundleInfoRepository.get(
  //   compilerUtils.normalizePath(activeTE.document.fileName, wsPath)
  // )

  if (!bundleInfo) return

  const bundlePosition = bundleInfo.map.generatedPositionFor({
    source: compilerUtils.normalizePath(activeTE.document.fileName, wsPath),
    line: activeTE.selection.active.line + 1,
    column: activeTE.selection.active.character
  })

  if (!bundlePosition || bundlePosition.line == null || bundlePosition.column == null) return

  const newDocument = await vscode.workspace.openTextDocument({
    content: bundleInfo.bundleContent,
    language: 'javascript'
  })

  const secondEditor = await vscode.window.showTextDocument(newDocument, {
    viewColumn: vscode.ViewColumn.Beside,
    preserveFocus: false
  })

  secondEditor.selection = new vscode.Selection(
    new vscode.Position(bundlePosition.line - 1, activeTE.selection.active.character),
    new vscode.Position(bundlePosition.line - 1, activeTE.selection.active.character)
  )

  secondEditor.revealRange(
    new vscode.Range(
      new vscode.Position(bundlePosition.line - 1, activeTE.selection.active.character),
      new vscode.Position(bundlePosition.line - 1, activeTE.selection.active.character)
    ),
    vscode.TextEditorRevealType.InCenter
  )
}
// */

export async function showLocalBundle() {
  const activeTE = vscode.window.activeTextEditor

  if (!activeTE) return

  const wsPath = vscode.workspace.getWorkspaceFolder(activeTE.document.uri)?.uri.fsPath

  if (!wsPath) return

  const [localBundle, bundlePosition] = await intellisense.getLocalBundle(
    activeTE.document,
    wsPath,
    activeTE.selection.active
  )

  const newDocument = await vscode.workspace.openTextDocument({
    content: localBundle,
    language: 'javascript'
  })

  const secondEditor = await vscode.window.showTextDocument(newDocument, {
    viewColumn: vscode.ViewColumn.Beside,
    preserveFocus: false
  })

  secondEditor.selection = new vscode.Selection(
    new vscode.Position(bundlePosition.line - 1, activeTE.selection.active.character),
    new vscode.Position(bundlePosition.line - 1, activeTE.selection.active.character)
  )

  secondEditor.revealRange(
    new vscode.Range(
      new vscode.Position(bundlePosition.line - 1, activeTE.selection.active.character),
      new vscode.Position(bundlePosition.line - 1, activeTE.selection.active.character)
    ),
    vscode.TextEditorRevealType.InCenter
  )
}

export async function showModuleInfo() {
  try {
    const activeTE = vscode.window.activeTextEditor

    if (!activeTE) return

    const wsPath = vscode.workspace.getWorkspaceFolder(activeTE.document.uri)?.uri.fsPath

    if (!wsPath) return

    const moduleInfo = await intellisense.getModuleInfo(activeTE.document, wsPath)

    if (!moduleInfo) return

    const newDocument = await vscode.workspace.openTextDocument({
      content: moduleInfo.value,
      language: 'markdown'
    })

    await vscode.window.showTextDocument(newDocument, {
      viewColumn: vscode.ViewColumn.Beside,
      preserveFocus: false
    })
  } catch (error) {
    console.log(error)
    vscode.window.showErrorMessage(`WGLToolchain ${error}`)
    restartService()
  }
}

export let lastEdit: Date = new Date()

export async function debaunceChangeTextDocument(signal: Date) {
  await new Promise(r => setTimeout(r, 2000))
  if (signal === lastEdit) return true
}

/**
 * Handle document updates
 * @param document
 * @param force handle document updates regardless of {@link vscode.TextDocument.isDirty isDirty} TextDocument prop
 * @returns
 */
export function didChangeTextDocumentHandler({
  document,
  force
}: {
  document: Pick<vscode.TextDocument, 'isDirty' | 'uri' | 'fileName' | 'version' | 'languageId'>
  force?: boolean
}) {
  if (document.languageId !== 'javascript') return
  if (force !== true && !document.isDirty) return

  const activeTE = vscode.window.activeTextEditor

  if (!activeTE) return

  const wsPath = vscode.workspace.getWorkspaceFolder(activeTE.document.uri)?.uri.fsPath

  if (!wsPath) return

  lastEdit = new Date()

  const normalized = compilerUtils.normalizePath(document.uri.fsPath, wsPath)
  const normalizedLC = normalized.toLowerCase()

  if (intellisense.modulesWithError.has(normalized)) {
    intellisense.modulesWithError.delete(normalized)
  }

  for (const [entry, info] of utils.bundleInfoRepository) {
    if (info.map.sources.find(d => d === normalizedLC)) {
      // exit not implemented in tsvfs
      // if (info.env) info.env.sys.exit(0)
      utils.bundleInfoRepository.delete(entry)
    }
  }

  for (const [entry, deps] of intellisense.moduleReferencesStorage)
    if (deps.find(d => d === normalizedLC)) intellisense.moduleReferencesStorage.delete(entry)

  if (compilerUtils.astStorage.has(normalizedLC)) {
    compilerUtils.astStorage.delete(normalizedLC)
  }

  if (utils.moduleSymbolsRepository.has(normalizedLC)) {
    utils.moduleSymbolsRepository.delete(normalizedLC)
  }

  if (compilerUtils.gls.code !== '') {
    if (mapToArray(compilerUtils.gls.modules).indexOf(normalizedLC) !== -1) {
      compilerUtils.gls.code = ''
      compilerUtils.gls.sourcemap = ''
      compilerUtils.gls.modules = new Map()
    }
  }

  const diagnosticsStrategy = getExtOption<'onchange' | 'onsave' | 'disabled'>(
    'intellisense.requestStrategy.diagnostics'
  )

  if (vscode.window.activeTextEditor && diagnosticsStrategy === 'onchange') {
    const activeDoc = vscode.window.activeTextEditor.document
    if (document.fileName === activeDoc.fileName) {
      const wsPath = vscode.workspace.getWorkspaceFolder(activeDoc.uri)?.uri.fsPath

      if (wsPath) {
        if (vscode.window.activeTextEditor?.document.version !== document.version) return

        debaunceChangeTextDocument(lastEdit).then(
          passed =>
            passed &&
            intellisense
              .getDiagnostics({ fileName: activeDoc.fileName }, wsPath)
              .then(diagnostics => {
                if (!diagnostics) return

                ext.diagnosticsCollection.clear()
                for (const [m, d] of diagnostics)
                  ext.diagnosticsCollection.set(vscode.Uri.file(path.join(wsPath, m)), d)
              })
        )
      }
    }
  }
}

export function getRealCasePath(
  projectRoot: string,
  module: compilerUtils.TNormalizedPath | string
): string {
  const absolutePath = path.join(projectRoot, module)
  const parts = module.split(path.sep).filter(part => part.length > 0)
  let currentPath = projectRoot

  for (const part of parts) {
    try {
      const files = fs.readdirSync(currentPath)
      const found = files.find(f => f.toLowerCase() === part.toLowerCase())

      if (!found) return module

      currentPath = path.join(currentPath, found)
    } catch (error) {
      console.error(`Error resolving case for path ${currentPath}:`, error)
      return absolutePath
    }
  }

  return currentPath
}

export function firstNonPatternLeftChar(
  document: Pick<vscode.TextDocument, 'lineAt'>,
  position: Pick<vscode.Position, 'line' | 'character'>,
  pattern: RegExp
): { char: string; pos: vscode.Position } | { char: undefined; pos: undefined } {
  let currentLine = position.line
  let currentChar = position.character - 1

  while (currentLine >= 0) {
    const lineText = document.lineAt(currentLine).text

    while (currentChar >= 0) {
      const char = lineText[currentChar]
      if (char && !pattern.test(char))
        return { char, pos: new vscode.Position(currentLine, currentChar) }
      currentChar--
    }

    currentLine--
    if (currentLine >= 0) currentChar = document.lineAt(currentLine).text.length - 1
  }

  return { char: undefined, pos: undefined }
}

export const buildTask = new vscode.Task(
  { type: 'wglscript', command: 'build' },
  vscode.TaskScope.Workspace,
  'WGLScript build',
  'wglscript',
  new vscode.CustomExecution(async () => new utils.WGLBuildTaskTerminal())
)

export const LAST_USED_KEY = 'lastUsedFilePath'
export const NONE_FILE = 'NONE_FILE'

export async function promptFileSelectionForGlobalModule(
  context: vscode.ExtensionContext
): Promise<string | undefined> {
  const defaultFromConfig = vscode.workspace
    .getConfiguration('wglscript')
    .get<string>('globalScript.path')
  const lastUsed = context.globalState.get<string>(LAST_USED_KEY) || NONE_FILE
  const items: vscode.QuickPickItem[] = []

  items.push({
    label: `$(history) Последний выбор: ${lastUsed === NONE_FILE ? 'не использовать файл' : lastUsed}`,
    description: lastUsed,
    detail: '',
    alwaysShow: true
  })

  if (defaultFromConfig) {
    items.push({
      label: `$(settings) По умолчанию: ${defaultFromConfig}`,
      description: defaultFromConfig,
      detail: '',
      alwaysShow: true
    })
  }

  items.push(
    {
      label: '$(close) Не использовать файл',
      description: '',
      detail: '',
      alwaysShow: true
    },
    {
      label: '$(folder) Выбрать файл из проекта...',
      description: '',
      detail: '',
      alwaysShow: true
    }
  )

  const selection = await vscode.window.showQuickPick(items, {
    placeHolder: 'Выберите файл для глобального модуля',
    ignoreFocusOut: true
  })

  if (!selection) return undefined

  switch (selection.label) {
    case '$(close) Не использовать файл':
      context.globalState.update(LAST_USED_KEY, NONE_FILE)
      return undefined
    case '$(folder) Выбрать файл из проекта...': {
      let filePath = await selectFileFromWorkspace(context)
      if (filePath) {
        const wsPath = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath))?.uri.fsPath
        if (wsPath) {
          filePath = compilerUtils.normalizePath(filePath, wsPath)
          context.globalState.update(LAST_USED_KEY, filePath)
        }
      }
      return filePath
    }
    default: {
      const filePath = selection.description
      if (filePath) {
        context.globalState.update(LAST_USED_KEY, filePath)
        return filePath
      }
      return undefined
    }
  }
}

export async function selectFileFromWorkspace(
  context: vscode.ExtensionContext
): Promise<string | undefined> {
  const files = await vscode.workspace.findFiles('**/*.{wgl,js}', '**/node_modules/**')
  const activeDoc = vscode.window.activeTextEditor?.document
  if (!activeDoc) return

  if (files.length === 0) {
    vscode.window.showWarningMessage('В workspace нет подходящих файлов.')
    return undefined
  }

  const wsPath = vscode.workspace.getWorkspaceFolder(activeDoc.uri)?.uri.fsPath
  if (!wsPath) return

  let lastUsed = context.globalState.get<string>(LAST_USED_KEY)
  if (lastUsed) {
    lastUsed = path.join(wsPath, lastUsed)
    files.sort((a, b) => (a.fsPath === lastUsed ? -1 : b.fsPath === lastUsed ? 1 : 0))
  }

  const items = files.map(file => ({
    label: `$(file) ${compilerUtils.normalizePath(file.fsPath, wsPath)}`,
    description: '',
    detail: '',
    fileUri: file
  }))

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'Начните вводить имя файла...',
    matchOnDescription: true,
    matchOnDetail: true,
    canPickMany: false
  })

  if (selected) {
    const path = selected.fileUri.fsPath
    return path
  }

  return undefined
}

export class FileStatusBar {
  private statusBar: vscode.StatusBarItem
  private globalState: vscode.Memento

  constructor(context: vscode.ExtensionContext) {
    this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100)
    this.globalState = context.globalState
    this.updateStatusBar()
  }

  private shortenPath(fullPath: string): string {
    const parts = fullPath.split(path.sep)
    const shortened = parts.slice(0, -1).map(part => {
      const words = part.split(/[-_]/).flatMap(word => word.match(/[A-Z][a-z]*|[a-z]+/g) || [])
      const initials = words.map(word => word[0]).join('')
      return initials
    })
    return [...shortened, parts.at(-1)].join('/')
  }

  public updateStatusBar(): void {
    const filePath =
      this.globalState.get<string>(LAST_USED_KEY) ||
      vscode.workspace.getConfiguration('wglscript').get('globalScript.path')

    if (!filePath || filePath === NONE_FILE) {
      this.statusBar.text = '$(notebook-open-as-text) No global'
      this.statusBar.tooltip = 'Click to select a file'
    } else {
      // const shortened = path.basename(filePath)
      const shortened = this.shortenPath(filePath)
      this.statusBar.text = `$(notebook-open-as-text) Global: ${shortened}`
      this.statusBar.tooltip = filePath
    }
    this.statusBar.command = 'wglscript.selectGlobalScript'
    this.statusBar.show()
  }
}

export function initializeDiagnostics() {
  const diagnosticsStrategy = getExtOption<'onchange' | 'onsave' | 'disabled'>(
    'intellisense.requestStrategy.diagnostics'
  )

  if (vscode.window.activeTextEditor?.document && diagnosticsStrategy !== 'disabled') {
    const activeDoc = vscode.window.activeTextEditor?.document
    const wsPath = vscode.workspace.getWorkspaceFolder(activeDoc.uri)?.uri.fsPath

    if (wsPath && activeDoc.languageId === 'javascript') {
      intellisense.getDiagnostics({ fileName: activeDoc.fileName }, wsPath).then(diagnostics => {
        if (!diagnostics) return
        ext.diagnosticsCollection.clear()
        for (const [m, d] of diagnostics)
          ext.diagnosticsCollection.set(vscode.Uri.file(path.join(wsPath, m)), d)
      })
    }
  }
}

export function waitForDependencies(
  isDependenciesExists: () => boolean,
  timeoutMs = 120000
): Promise<boolean> {
  const checkInterval = 5000 // Проверка каждые 5 секунд
  let elapsed = 0

  return new Promise(resolve => {
    const interval = setInterval(() => {
      if (isDependenciesExists()) {
        clearInterval(interval)
        resolve(true)
      } else if (elapsed >= timeoutMs) {
        clearInterval(interval)
        resolve(false)
      }
      elapsed += checkInterval
    }, checkInterval)
  })
}
