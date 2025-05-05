import * as path from 'path'
import * as vscode from 'vscode'
import * as compilerUtils from './compiler/utils'
import * as ext from './extension'

import { intellisense } from './intellisense/features'
import { bundleInfoRepository } from './intellisense/utils'

export const getExtOption = <T>(option: string): T =>
  vscode.workspace.getConfiguration('wglscript').get(option) as T

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
      bundleInfoRepository.clear()
      compilerUtils.astStorage.clear()

      compilerUtils.gls.code = ''
      compilerUtils.gls.sourcemap = ''
      compilerUtils.gls.modules = new Map()
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

  const bundleInfo = bundleInfoRepository.get(
    compilerUtils.normalizePath(activeTE.document.fileName, wsPath)
  )

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

  if (intellisense.modulesWithError.has(normalized)) {
    intellisense.modulesWithError.delete(normalized)
  }

  for (const [entry, info] of bundleInfoRepository) {
    if (info.dependencies.find(d => d === normalized)) {
      // exit not implemented in tsvfs
      // if (info.env) info.env.sys.exit(0)
      bundleInfoRepository.delete(entry)
    }
  }

  for (const [entry, deps] of intellisense.moduleReferencesStorage)
    if (deps.find(d => d === normalized)) intellisense.moduleReferencesStorage.delete(entry)

  if (compilerUtils.astStorage.has(normalized)) {
    compilerUtils.astStorage.delete(normalized)
  }

  if (compilerUtils.gls.code !== '') {
    if (mapToArray(compilerUtils.gls.modules).indexOf(normalized.toLowerCase()) !== -1) {
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
