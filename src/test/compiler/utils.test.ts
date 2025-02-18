import * as assert from 'assert'
import { transpileCallExpressionAssignment } from '../../compiler/compiler'
import { normalizePath } from '../../compiler/utils'

suite('transpile call expression assignment', () => {
  test('with comment', () => {
    assert.equal(
      transpileCallExpressionAssignment('tp.Param("ViewList") = "Books"; // comment'),
      'tp.AddParam("ViewList", "Books"); // comment'
    )
  })

  test('skip comparison', () => {
    assert.equal(
      transpileCallExpressionAssignment(`multipick.Param("records").split(',').length) == 2);`),
      `multipick.Param("records").split(',').length) == 2);`
    )
  })
})

suite('normalizePath - get absolute path from project root', () => {
  test('file path has project root path and extension', () => {
    assert.equal(normalizePath('/a/b.js', '/a'), 'b.js')
  })
  test('file path has project root path without extension', () => {
    assert.equal(normalizePath('/a/b', '/a'), 'b')
  })
})
