import * as assert from 'assert'
import * as vscode from 'vscode'

import { __dirnameProxy, loadExtensionCase } from './helper'

test('should build & show bundle', async () => {
  let activeEditor: vscode.TextEditor | undefined = await loadExtensionCase('entry.js')
  const sourceContentLength = activeEditor.document.getText().length
  await new Promise(r => setTimeout(r, 200))

  await vscode.commands.executeCommand('wglscript.showBundle')

  activeEditor = vscode.window.activeTextEditor

  assert.equal(!!activeEditor, true, 'document open')
  assert.equal(
    activeEditor && activeEditor.document.getText().length > sourceContentLength,
    true,
    'bundle size greather then entry file'
  )
})

test('should build & show local bundle', async () => {
  let activeEditor: vscode.TextEditor | undefined = await loadExtensionCase('entry.js')
  const sourceContentLength = activeEditor.document.getText().length

  await vscode.commands.executeCommand('wglscript.showLocalBundle')

  activeEditor = vscode.window.activeTextEditor

  assert.equal(!!activeEditor, true, 'document open')
  assert.equal(
    activeEditor && activeEditor.document.getText().length > sourceContentLength,
    true,
    'bundle size greather then entry file'
  )
})

test('should build & show Module info', async () => {
  await loadExtensionCase('entry.js')
  await vscode.commands.executeCommand('wglscript.showModuleInfo')

  const activeEditor = vscode.window.activeTextEditor

  assert.equal(!!activeEditor, true, 'document open')
  assert.equal(activeEditor?.document.languageId, 'markdown', 'present Module info')
})
