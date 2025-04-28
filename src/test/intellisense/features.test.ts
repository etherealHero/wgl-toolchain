import * as assert from 'assert'
import * as path from 'path'
import * as vscode from 'vscode'

const __dirnameProxy = __dirname.replace(/([\\\/]+)out([\\\/]+)/, '$1src$2')

async function waitForSelectionChange({
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

test('find definition of local Symbol', async () => {
  const entryUri = vscode.Uri.file(path.join(__dirnameProxy, 'entry.js'))

  for (const d of vscode.workspace.textDocuments) {
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor', d.uri)
  }

  const document = await vscode.workspace.openTextDocument(entryUri)
  await vscode.window.showTextDocument(document)

  let activeEditor = vscode.window.activeTextEditor

  // wait WGLScript Intellisense
  await waitForSelectionChange({ timeoutInMilliseconds: 3000 })

  if (activeEditor) {
    const symbolPosition = new vscode.Position(2, 0)
    activeEditor.selection = new vscode.Selection(symbolPosition, symbolPosition)
  }

  await waitForSelectionChange({ timeoutInMilliseconds: 200 })
  await vscode.commands.executeCommand('editor.action.revealDefinition')
  await waitForSelectionChange({ timeoutInMilliseconds: 200 })

  activeEditor = vscode.window.activeTextEditor

  assert.equal(
    path.basename(activeEditor?.document.fileName || ''),
    'dep.js',
    'Module file of definition is valid'
  )

  assert.deepEqual(
    activeEditor?.selection.active,
    new vscode.Position(8, 9),
    'Selection of definition Symbol is valid'
  )
})

test('find definition of global Symbol', async () => {
  const entryUri = vscode.Uri.file(path.join(__dirnameProxy, 'entry.js'))

  for (const d of vscode.workspace.textDocuments) {
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor', d.uri)
  }

  const document = await vscode.workspace.openTextDocument(entryUri)
  await vscode.window.showTextDocument(document)

  let activeEditor = vscode.window.activeTextEditor

  if (activeEditor) {
    const symbolPosition = new vscode.Position(4, 5)
    activeEditor.selection = new vscode.Selection(symbolPosition, symbolPosition)
  }

  await waitForSelectionChange({ timeoutInMilliseconds: 200 })
  await vscode.commands.executeCommand('editor.action.revealDefinition')
  await waitForSelectionChange({ timeoutInMilliseconds: 200 })

  activeEditor = vscode.window.activeTextEditor

  assert.equal(
    path.basename(activeEditor?.document.fileName || ''),
    'AppGlobalScript.js',
    'Module file of definition is valid'
  )

  assert.deepEqual(
    activeEditor?.selection.active,
    new vscode.Position(5, 6),
    'Selection of definition Symbol is valid'
  )
})

test('find definition of library Symbol', async () => {
  const entryUri = vscode.Uri.file(path.join(__dirnameProxy, 'entry.js'))

  for (const d of vscode.workspace.textDocuments) {
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor', d.uri)
  }

  const document = await vscode.workspace.openTextDocument(entryUri)
  await vscode.window.showTextDocument(document)

  let activeEditor = vscode.window.activeTextEditor

  if (activeEditor) {
    const symbolPosition = new vscode.Position(5, 10)
    activeEditor.selection = new vscode.Selection(symbolPosition, symbolPosition)
  }

  await waitForSelectionChange({ timeoutInMilliseconds: 200 })
  await vscode.commands.executeCommand('editor.action.revealDefinition')
  await waitForSelectionChange({ timeoutInMilliseconds: 200 })

  activeEditor = vscode.window.activeTextEditor

  assert.equal(
    path.basename(activeEditor?.document.fileName || ''),
    'lib.es5.d.ts',
    'Module file of definition is valid'
  )

  assert.deepEqual(
    activeEditor?.selection.active,
    new vscode.Position(3, 14),
    'Selection of definition Symbol is valid'
  )
})

test('format document with wgl syntax', async () => {
  const unformattedUri = vscode.Uri.file(
    path.join(__dirnameProxy, 'formatting', 'wgl-syntax-compatibility.js')
  )

  for (const d of vscode.workspace.textDocuments) {
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor', d.uri)
  }

  const document = await vscode.workspace.openTextDocument(unformattedUri)
  await vscode.window.showTextDocument(document)

  let activeEditor = vscode.window.activeTextEditor

  if (activeEditor) {
    const symbolPosition = new vscode.Position(5, 10)
    activeEditor.selection = new vscode.Selection(symbolPosition, symbolPosition)
  }

  await waitForSelectionChange({ timeoutInMilliseconds: 200 })
  await vscode.commands.executeCommand('editor.action.formatDocument')
  await waitForSelectionChange({ timeoutInMilliseconds: 200 })

  activeEditor = vscode.window.activeTextEditor

  assert.equal(
    activeEditor?.document.getText() || '',
    [
      '// @ts-nocheck',
      '// format feature by Prettier (config .prettierrc supported)',
      '',
      "alert('lorem');",
      '',
      '// support #regions',
      'var getUser = ',
      '  #text',
      '  suser_sname()',
      '  #endtext',
      '',
      '// support call expression assignment',
      "Params.Param(0) = 'ipsum';",
      ''
    ].join('\n'),
    'Module file has been formatted'
  )
})

test('format document with eof', async () => {
  const unformattedUri = vscode.Uri.file(path.join(__dirnameProxy, 'formatting', 'eof.js'))

  for (const d of vscode.workspace.textDocuments) {
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor', d.uri)
  }

  const document = await vscode.workspace.openTextDocument(unformattedUri)
  await vscode.window.showTextDocument(document)

  let activeEditor = vscode.window.activeTextEditor

  if (activeEditor) {
    const symbolPosition = new vscode.Position(5, 10)
    activeEditor.selection = new vscode.Selection(symbolPosition, symbolPosition)
  }

  await waitForSelectionChange({ timeoutInMilliseconds: 200 })
  await vscode.commands.executeCommand('editor.action.formatDocument')
  await waitForSelectionChange({ timeoutInMilliseconds: 200 })

  activeEditor = vscode.window.activeTextEditor

  assert.equal(
    activeEditor?.document.getText() || '',
    ["alert('lorem');", ''].join('\n'),
    'Module file has been formatted'
  )
})

test('format document with missing eof', async () => {
  const unformattedUri = vscode.Uri.file(path.join(__dirnameProxy, 'formatting', 'missing-eof.js'))

  for (const d of vscode.workspace.textDocuments) {
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor', d.uri)
  }

  const document = await vscode.workspace.openTextDocument(unformattedUri)
  await vscode.window.showTextDocument(document)

  let activeEditor = vscode.window.activeTextEditor

  if (activeEditor) {
    const symbolPosition = new vscode.Position(5, 10)
    activeEditor.selection = new vscode.Selection(symbolPosition, symbolPosition)
  }

  await waitForSelectionChange({ timeoutInMilliseconds: 200 })
  await vscode.commands.executeCommand('editor.action.formatDocument')
  await waitForSelectionChange({ timeoutInMilliseconds: 200 })

  activeEditor = vscode.window.activeTextEditor

  assert.equal(
    activeEditor?.document.getText() || '',
    ["alert('lorem');", ''].join('\n'),
    'Module file has been formatted'
  )
})
