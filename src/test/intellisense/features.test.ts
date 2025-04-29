import * as assert from 'assert'
import * as path from 'path'
import * as vscode from 'vscode'

import { __dirnameProxy, waitForSelectionChange } from './helper'

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
    const symbolPosition = new vscode.Position(5, 20)
    activeEditor.selection = new vscode.Selection(symbolPosition, symbolPosition)
  }

  await waitForSelectionChange({ timeoutInMilliseconds: 200 })
  await vscode.commands.executeCommand('editor.action.revealDefinition')
  await waitForSelectionChange({ timeoutInMilliseconds: 200 })

  activeEditor = vscode.window.activeTextEditor

  assert.equal(
    path.basename(activeEditor?.document.fileName || ''),
    'lib.d.ts',
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

test('format document with with region example in other region', async () => {
  const unformattedUri = vscode.Uri.file(
    path.join(__dirnameProxy, 'formatting', 'region-in-region.js')
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
      '/**',
      ' * #text',
      ' * lorem',
      ' * #endtext',
      ' */',
      '',
      'var query = `',
      '#sql',
      'select 1 v',
      '#endsql',
      '`;',
      ''
    ].join('\n'),
    'Module file has been formatted'
  )
})

test('should do completion', async () => {
  const entryUri = vscode.Uri.file(path.join(__dirnameProxy, 'entry.js'))

  for (const d of vscode.workspace.textDocuments) {
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor', d.uri)
  }

  const document = await vscode.workspace.openTextDocument(entryUri)
  await vscode.window.showTextDocument(document)

  const activeEditor = vscode.window.activeTextEditor

  // wait WGLScript Intellisense
  await waitForSelectionChange({ timeoutInMilliseconds: 3000 })

  if (!activeEditor) return

  const actualCompletionList = (await vscode.commands.executeCommand(
    'vscode.executeCompletionItemProvider',
    activeEditor.document.uri,
    new vscode.Position(0, 0)
  )) as vscode.CompletionList

  assert.equal(
    actualCompletionList.items.some(c => c.insertText === 'multiply'),
    true,
    'should find local Symbol'
  )

  assert.equal(
    actualCompletionList.items.some(c => c.insertText === 'ROLE'),
    true,
    'should find global Symbol'
  )

  assert.equal(
    actualCompletionList.items.some(c => c.insertText === 'IDCancel'),
    true,
    'should find library Symbol'
  )
})

test('should get diagnostics', async () => {
  const entryUri = vscode.Uri.file(path.join(__dirnameProxy, 'entry.js'))

  for (const d of vscode.workspace.textDocuments) {
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor', d.uri)
  }

  const document = await vscode.workspace.openTextDocument(entryUri)
  await vscode.window.showTextDocument(document)

  const activeEditor = vscode.window.activeTextEditor

  // wait WGLScript Intellisense
  await waitForSelectionChange({ timeoutInMilliseconds: 3000 })

  if (!activeEditor) return

  const actualDiagnostics = vscode.languages.getDiagnostics(activeEditor.document.uri)

  actualDiagnostics

  assert.equal(
    actualDiagnostics.some(d => d.source === 'WGLScript'),
    true,
    'diagnostics are present'
  )

  assert.equal(
    actualDiagnostics.some(d => d.message === "Cannot find name 'unknownFunction'."),
    true,
    'has valid diagnostic'
  )
})

test('should resolve module', async () => {
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
    const symbolPosition = new vscode.Position(0, 12)
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
})
