import * as assert from 'assert'
import * as path from 'path'
import * as vscode from 'vscode'

import { restartService } from '../../utils'
import { __dirnameProxy, buildWithTreeShaking, waitForSelectionChange } from './helper'

test('find definition of local Symbol', async () => {
  const entryUri = vscode.Uri.file(path.join(__dirnameProxy, 'entry.js'))

  for (const d of vscode.workspace.textDocuments) {
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor', d.uri)
  }

  const document = await vscode.workspace.openTextDocument(entryUri)
  await vscode.window.showTextDocument(document)

  let activeEditor = vscode.window.activeTextEditor

  if (activeEditor) {
    const symbolPosition = new vscode.Position(2, 0)
    activeEditor.selection = new vscode.Selection(symbolPosition, symbolPosition)
  }

  await waitForSelectionChange({ timeoutInMilliseconds: 1000 })
  await vscode.commands.executeCommand('editor.action.revealDefinition')

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

test('should hover info', async () => {
  const entryUri = vscode.Uri.file(path.join(__dirnameProxy, 'entry.js'))

  for (const d of vscode.workspace.textDocuments) {
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor', d.uri)
  }

  const document = await vscode.workspace.openTextDocument(entryUri)
  await vscode.window.showTextDocument(document)

  const hover = (await vscode.commands.executeCommand(
    'vscode.executeHoverProvider',
    vscode.window.activeTextEditor?.document.uri,
    new vscode.Position(2, 0)
  )) as vscode.Hover[]

  let hasValidHoverInfo = false

  for (const c of hover)
    for (const s of c.contents as unknown as vscode.MarkdownString[])
      if (/function sum/gm.test(s.value)) hasValidHoverInfo = true

  assert.equal(hasValidHoverInfo, true)
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

  await vscode.commands.executeCommand('editor.action.revealDefinition')

  activeEditor = vscode.window.activeTextEditor

  assert.equal(
    path.basename(activeEditor?.document.fileName || ''),
    'appglobalscript.js',
    'Module file of definition is valid'
  )

  assert.deepEqual(
    activeEditor?.selection.active,
    new vscode.Position(5, 6),
    'Selection of definition Symbol is valid'
  )
})

test('should get references', async () => {
  const entryUri = vscode.Uri.file(path.join(__dirnameProxy, 'entry.js'))

  for (const d of vscode.workspace.textDocuments) {
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor', d.uri)
  }

  const document = await vscode.workspace.openTextDocument(entryUri)
  await vscode.window.showTextDocument(document)

  await waitForSelectionChange({ timeoutInMilliseconds: 200 })
  const refs = (await vscode.commands.executeCommand(
    'vscode.executeReferenceProvider',
    vscode.window.activeTextEditor?.document.uri,
    new vscode.Position(4, 5)
  )) as vscode.Location[]

  assert.equal(
    refs.some(
      r =>
        /AppGlobalScript\.js/gm.test(r.uri.fsPath) &&
        r.range.start.line === 5 &&
        r.range.start.character === 6 &&
        r.range.end.line === 5 &&
        r.range.end.character === 10
    ),
    true
  )

  assert.equal(
    refs.some(
      r =>
        /dep\.js/gm.test(r.uri.fsPath) &&
        r.range.start.line === 0 &&
        r.range.start.character === 15 &&
        r.range.end.line === 0 &&
        r.range.end.character === 19
    ),
    true
  )

  assert.equal(
    refs.some(
      r =>
        /entry\.js/gm.test(r.uri.fsPath) &&
        r.range.start.line === 4 &&
        r.range.start.character === 4 &&
        r.range.end.line === 4 &&
        r.range.end.character === 8
    ),
    true
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

  await vscode.commands.executeCommand('editor.action.revealDefinition')

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

  await vscode.commands.executeCommand('editor.action.formatDocument')

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

  await vscode.commands.executeCommand('editor.action.formatDocument')

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

  await vscode.commands.executeCommand('editor.action.formatDocument')

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

  await vscode.commands.executeCommand('editor.action.formatDocument')

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

  await waitForSelectionChange({ timeoutInMilliseconds: 1500 })

  const document = await vscode.workspace.openTextDocument(entryUri)
  await vscode.window.showTextDocument(document)

  await waitForSelectionChange({ timeoutInMilliseconds: 1500 })

  if (!vscode.window.activeTextEditor) return

  const actualDiagnostics = vscode.languages.getDiagnostics(
    vscode.window.activeTextEditor.document.uri
  )

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

  if (activeEditor) {
    const symbolPosition = new vscode.Position(0, 12)
    activeEditor.selection = new vscode.Selection(symbolPosition, symbolPosition)
  }

  await vscode.commands.executeCommand('editor.action.revealDefinition')

  activeEditor = vscode.window.activeTextEditor

  assert.equal(
    path.basename(activeEditor?.document.fileName || ''),
    'dep.js',
    'Module file of definition is valid'
  )
})

test('should build bundle with tree shaking direct-inheritance', async () => {
  restartService('cleanCache')
  assert.equal(
    await buildWithTreeShaking('direct-inheritance'),
    '/* @@resolved double.js from entry.js */\n' +
      '/* @@skippedByTreeShaking constants.js from double.js */\n' +
      '\n' +
      '\n' +
      'function double(a) {\n' +
      '  return a * 2\n' +
      '}\n' +
      '\n' +
      '/* @@skippedByTreeShaking sum.js from entry.js */\n' +
      '\n' +
      '\n' +
      'double(2)\n'
  )
})

test('should build bundle with tree shaking direct-inheritance-reverse-import', async () => {
  restartService('cleanCache')
  assert.equal(
    await buildWithTreeShaking('direct-inheritance-reverse-import'),
    '/* @@skippedByTreeShaking sum.js from entry.js */\n' +
      '\n' +
      '/* @@resolved double.js from entry.js */\n' +
      '/* @@skippedByTreeShaking constants.js from double.js */\n' +
      '\n' +
      '\n' +
      'function double(a) {\n' +
      '  return a * 2\n' +
      '}\n' +
      '\n' +
      '\n' +
      'double(2)\n'
  )
})

test('should build bundle with tree shaking indirect-inheritance', async () => {
  restartService('cleanCache')
  assert.equal(
    await buildWithTreeShaking('indirect-inheritance'),
    '/* @@resolved dep.js from entry.js */\n' +
      '/* @@resolved double.js from dep.js */\n' +
      '/* @@skippedByTreeShaking constants.js from double.js */\n' +
      '\n' +
      '\n' +
      'function double(a) {\n' +
      '  return a * 2\n' +
      '}\n' +
      '\n' +
      '/* @@skippedByTreeShaking sum.js from dep.js */\n' +
      '\n' +
      '\n' +
      '\n' +
      'double(2)\n'
  )
})

test('should build bundle with tree shaking indirect-inheritance-reverse-import', async () => {
  restartService('cleanCache')
  assert.equal(
    await buildWithTreeShaking('indirect-inheritance-reverse-import'),
    '/* @@resolved dep.js from entry.js */\n' +
      '/* @@skippedByTreeShaking sum.js from dep.js */\n' +
      '\n' +
      '/* @@resolved double.js from dep.js */\n' +
      '/* @@skippedByTreeShaking constants.js from double.js */\n' +
      '\n' +
      '\n' +
      'function double(a) {\n' +
      '  return a * 2\n' +
      '}\n' +
      '\n' +
      '\n' +
      '\n' +
      'double(2)\n'
  )
})
