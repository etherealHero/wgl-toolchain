import * as vscode from 'vscode'
import * as compilerUtils from './compiler/utils'

import { createHash } from 'crypto'
import { workspace } from 'vscode'
import { diagnosticsCollection } from './extension'
import { intellisense } from './intellisense/features'
import { VTSEnvStorage, bundleInfoRepository } from './intellisense/utils'

export const getExtOption = <T>(option: string): T =>
  workspace.getConfiguration('wglscript').get(option) as T

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

export function getHash(content: string) {
  const hash = createHash('sha256')
  hash.update(content)
  return hash.digest('hex')
}

export function verifyHash(content: string, originalHash: string) {
  const currentHash = getHash(content)
  return currentHash === originalHash
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

export const restartService = () => {
  try {
    diagnosticsCollection.clear()
    VTSEnvStorage.clear()
    bundleInfoRepository.clear()

    compilerUtils.astStorage.clear()
    compilerUtils.gls.code = ''
    compilerUtils.gls.sourcemap = ''
    compilerUtils.gls.modules = new Map()
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
