import * as vscode from 'vscode'

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
