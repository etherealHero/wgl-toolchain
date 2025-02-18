import * as vscode from 'vscode'

import { createHash } from 'crypto'
import { workspace } from 'vscode'

export const getConfigurationOption = <T>(option: string): T =>
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

  console.log(`INFO: ${Math.round((endTime - startTime) * 100) / 100}ms ${fn.name} ${stack}`)
  return result
}
