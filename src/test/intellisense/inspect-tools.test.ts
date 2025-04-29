import * as assert from 'assert'
import * as path from 'path'
import * as vscode from 'vscode'

import { __dirnameProxy, waitForSelectionChange } from './helper'

test('should build & show bundle', async () => {
  const entryUri = vscode.Uri.file(path.join(__dirnameProxy, 'entry.js'))

  for (const d of vscode.workspace.textDocuments) {
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor', d.uri)
  }

  const document = await vscode.workspace.openTextDocument(entryUri)
  await vscode.window.showTextDocument(document)

  let activeEditor = vscode.window.activeTextEditor

  // wait WGLScript Intellisense
  await waitForSelectionChange({ timeoutInMilliseconds: 3000 })
  await vscode.commands.executeCommand('wglscript.showBundle')
  await waitForSelectionChange({ timeoutInMilliseconds: 200 })

  activeEditor = vscode.window.activeTextEditor

  assert.equal(!!activeEditor, true, 'document open')
  assert.equal(
    activeEditor && activeEditor.document.getText().length > document.getText().length,
    true,
    'bundle size greather then entry file'
  )
})

test('should build & show local bundle', async () => {
  const entryUri = vscode.Uri.file(path.join(__dirnameProxy, 'entry.js'))

  for (const d of vscode.workspace.textDocuments) {
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor', d.uri)
  }

  const document = await vscode.workspace.openTextDocument(entryUri)
  await vscode.window.showTextDocument(document)

  let activeEditor = vscode.window.activeTextEditor

  // wait WGLScript Intellisense
  await waitForSelectionChange({ timeoutInMilliseconds: 3000 })
  await vscode.commands.executeCommand('wglscript.showLocalBundle')
  await waitForSelectionChange({ timeoutInMilliseconds: 200 })

  activeEditor = vscode.window.activeTextEditor

  assert.equal(!!activeEditor, true, 'document open')
  assert.equal(
    activeEditor && activeEditor.document.getText().length > document.getText().length,
    true,
    'bundle size greather then entry file'
  )
})

test('should build & show Module info', async () => {
  const entryUri = vscode.Uri.file(path.join(__dirnameProxy, 'entry.js'))

  for (const d of vscode.workspace.textDocuments) {
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor', d.uri)
  }

  const document = await vscode.workspace.openTextDocument(entryUri)
  await vscode.window.showTextDocument(document)

  let activeEditor = vscode.window.activeTextEditor

  // wait WGLScript Intellisense
  await waitForSelectionChange({ timeoutInMilliseconds: 3000 })
  await vscode.commands.executeCommand('wglscript.showModuleInfo')
  await waitForSelectionChange({ timeoutInMilliseconds: 200 })

  activeEditor = vscode.window.activeTextEditor

  assert.equal(!!activeEditor, true, 'document open')
  assert.equal(activeEditor?.document.languageId, 'markdown', 'present Module info')
})
