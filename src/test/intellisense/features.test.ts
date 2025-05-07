import * as assert from 'assert'
import * as path from 'path'
import * as vscode from 'vscode'

import { restartService } from '../../utils'
import { __dirnameProxy, buildWithTreeShaking, loadExtensionCase } from './helper'

suite('definition context', () => {
  test('find definition of local Symbol', async () => {
    let activeEditor: vscode.TextEditor | undefined = await loadExtensionCase('entry.js')

    activeEditor.selection = new vscode.Selection(
      new vscode.Position(2, 12),
      new vscode.Position(2, 12)
    )

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

  test('find definition of global Symbol', async () => {
    let activeEditor: vscode.TextEditor | undefined = await loadExtensionCase('entry.js')
    activeEditor.selection = new vscode.Selection(
      new vscode.Position(4, 5),
      new vscode.Position(4, 5)
    )

    await vscode.commands.executeCommand('editor.action.revealDefinition')

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
    let activeEditor: vscode.TextEditor | undefined = await loadExtensionCase('entry.js')

    activeEditor.selection = new vscode.Selection(
      new vscode.Position(5, 20),
      new vscode.Position(5, 20)
    )

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

  test('should resolve module', async () => {
    let activeEditor: vscode.TextEditor | undefined = await loadExtensionCase('entry.js')

    activeEditor.selection = new vscode.Selection(
      new vscode.Position(0, 12),
      new vscode.Position(0, 12)
    )

    await vscode.commands.executeCommand('editor.action.revealDefinition')

    activeEditor = vscode.window.activeTextEditor

    assert.equal(
      path.basename(activeEditor?.document.fileName || ''),
      'dep.js',
      'Module file of definition is valid'
    )
  })
})

suite('language features', () => {
  test('should hover info', async () => {
    await loadExtensionCase('entry.js')

    let hover = (await vscode.commands.executeCommand(
      'vscode.executeHoverProvider',
      vscode.window.activeTextEditor?.document.uri,
      new vscode.Position(2, 12)
    )) as vscode.Hover[]

    let hasValidHoverInfo = false

    for (const c of hover)
      for (const s of c.contents as unknown as vscode.MarkdownString[])
        if (/function sum/gm.test(s.value)) hasValidHoverInfo = true

    assert.equal(hasValidHoverInfo, true, 'resolve symbol declaration')

    hasValidHoverInfo = false

    hover = (await vscode.commands.executeCommand(
      'vscode.executeHoverProvider',
      vscode.window.activeTextEditor?.document.uri,
      new vscode.Position(2, 6)
    )) as vscode.Hover[]

    for (const c of hover)
      for (const s of c.contents as unknown as vscode.MarkdownString[])
        if (/number/gm.test(s.value)) hasValidHoverInfo = true

    assert.equal(hasValidHoverInfo, true, 'resolve returned type of assignment expression')
  })

  test('should get references', async () => {
    await loadExtensionCase('entry.js')

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

  test('should do completion', async () => {
    const activeEditor: vscode.TextEditor = await loadExtensionCase('entry.js')
    await new Promise(r => setTimeout(r, 400))
    const actualCompletionList = (await vscode.commands.executeCommand(
      'vscode.executeCompletionItemProvider',
      activeEditor.document.uri,
      new vscode.Position(0, 0)
    )) as vscode.CompletionList
    await new Promise(r => setTimeout(r, 400))

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
    const activeEditor = await loadExtensionCase('entry.js')
    const actualDiagnostics = vscode.languages.getDiagnostics(activeEditor.document.uri)
    await new Promise(r => setTimeout(r, 200))

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
})

suite('formatting', () => {
  test('format document with wgl syntax', async () => {
    const activeEditor = await loadExtensionCase('formatting\\wgl-syntax-compatibility.js')
    await vscode.commands.executeCommand('editor.action.formatDocument')

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
    const activeEditor = await loadExtensionCase('formatting\\eof.js')
    await vscode.commands.executeCommand('editor.action.formatDocument')

    assert.equal(
      activeEditor?.document.getText() || '',
      ["alert('lorem');", ''].join('\n'),
      'Module file has been formatted'
    )
  })

  test('format document with missing eof', async () => {
    const activeEditor = await loadExtensionCase('formatting\\missing-eof.js')
    await vscode.commands.executeCommand('editor.action.formatDocument')

    assert.equal(
      activeEditor?.document.getText() || '',
      ["alert('lorem');", ''].join('\n'),
      'Module file has been formatted'
    )
  })

  test('format document with with region example in other region', async () => {
    const activeEditor = await loadExtensionCase('formatting\\region-in-region.js')
    await vscode.commands.executeCommand('editor.action.formatDocument')

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
})

suite('tree shaking', () => {
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
})

suite('inspect tools', () => {
  test('should build & show bundle', async () => {
    let activeEditor: vscode.TextEditor | undefined = await loadExtensionCase('entry.js')
    const sourceContentLength = activeEditor.document.getText().length

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
})
