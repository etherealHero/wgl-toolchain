import * as assert from 'assert'
import * as vscode from 'vscode'
import { firstNonPatternLeftChar } from '../../utils'

suite('get first non pattern left char', () => {
  test('finds last non-whitespace in same line', async () => {
    const doc = await vscode.workspace.openTextDocument({
      content: 'abc def',
      language: 'javascript'
    })
    const result = firstNonPatternLeftChar(doc, new vscode.Position(0, 5), /\s/)
    assert.equal(result.char, 'd')
    assert.deepEqual(result.pos, new vscode.Position(0, 4))
  })

  test('crosses line breaks when searching left', async () => {
    const doc = await vscode.workspace.openTextDocument({
      content: 'abc\n def',
      language: 'javascript'
    })
    const result = firstNonPatternLeftChar(doc, new vscode.Position(1, 1), /\s/)
    assert.equal(result.char, 'c')
    assert.deepEqual(result.pos, new vscode.Position(0, 2))
  })

  test('returns undefined when only whitespace exists', async () => {
    const doc = await vscode.workspace.openTextDocument({
      content: '   ',
      language: 'javascript'
    })
    const result = firstNonPatternLeftChar(doc, new vscode.Position(0, 2), /\s/)
    assert.equal(result.char, undefined)
    assert.equal(result.pos, undefined)
  })
})
