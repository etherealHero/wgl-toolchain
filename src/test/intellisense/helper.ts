import * as path from 'path'
import * as vscode from 'vscode'

import { compile } from '../../compiler/compiler'

export const __dirnameProxy = __dirname.replace(/([\\\/]+)out([\\\/]+)/, '$1src$2')

export async function waitForSelectionChange({
  timeoutInMilliseconds
}: { timeoutInMilliseconds: number }): Promise<boolean> {
  return new Promise<boolean>(resolve => {
    const disposable = vscode.window.onDidChangeTextEditorSelection(event => {
      if (event.textEditor === vscode.window.activeTextEditor) {
        clearTimeout(timeoutId) // Очищаем таймер
        disposable.dispose() // Убираем подписку
        resolve(true) // Разрешаем промис с true
      }
    })

    // Устанавливаем таймер для разрешения промиса с false
    const timeoutId = setTimeout(() => {
      disposable.dispose() // Убираем подписку
      resolve(false) // Разрешаем промис с false
    }, timeoutInMilliseconds)
  })
}
export async function buildWithTreeShaking(testCases: string) {
  const config = {
    entry: path.join(__dirnameProxy, 'tree-shaking', testCases, 'entry.js'),
    projectRoot: path.join(__dirnameProxy, 'tree-shaking', testCases)
  }

  const sn = await compile(config.entry, {
    projectRoot: config.projectRoot,
    modules: [],
    treeShaking: { searchPattern: /double/ },
    skipAttachGlobalScript: true
  })
  const bundle = sn.toStringWithSourceMap().code

  return bundle.replace(/(\n|\r\n)/gm, '\n')
}
