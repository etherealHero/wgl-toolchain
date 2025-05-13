import * as assert from 'assert'

import type { ImportNode, RegionNode, TNode } from '../../../compiler/compiler'
import { parse } from '../../../compiler/utils'
import type { Maybe } from '../helper'

suite('import statements', () => {
  test('should be parse', async () => {
    let n: Maybe<ImportNode>

    n = parse(`import 'foo.js'`).find(n => n.type === 'moduleResolution') as Maybe<ImportNode>
    assert.ok(n)
    assert.equal(n?.href, 'foo.js')

    n = parse(`import "bar.js";`).find(n => n.type === 'moduleResolution') as Maybe<ImportNode>
    assert.ok(n)
    assert.equal(n?.href, 'bar.js')

    n = parse(`import 'bar/foo.js'`).find(n => n.type === 'moduleResolution') as Maybe<ImportNode>
    assert.ok(n)
    assert.equal(n?.href, 'bar/foo.js')
  })

  test('should be parse #include derictive too', async () => {
    const n = parse(/*js*/ '#include <foo.js>').find(
      n => n.type === 'moduleResolution'
    ) as Maybe<ImportNode>
    assert.ok(n)
    assert.equal(n?.href, 'foo.js')
  })

  test('should be parse multiply imports', async () => {
    const imports = parse(/*js*/ `
import 'foo.js'
import 'bar.js'
`).filter(n => n.type === 'moduleResolution') as Maybe<ImportNode[]>
    assert.equal(imports?.length, 2)
    assert.equal(imports?.at(0)?.href, 'foo.js')
    assert.equal(imports?.at(1)?.href, 'bar.js')

    const includes = parse(/*js*/ `
#include <foo.js>
#include <bar.js>
`).filter(n => n.type === 'moduleResolution') as Maybe<ImportNode[]>
    assert.equal(includes?.length, 2)
    assert.equal(includes?.at(0)?.href, 'foo.js')
    assert.equal(includes?.at(1)?.href, 'bar.js')
  })

  test('should be parse with backslash', async () => {
    let n: Maybe<ImportNode>

    n = parse(`import 'foo.js'`).find(n => n.type === 'moduleResolution') as Maybe<ImportNode>
    assert.ok(n)
    assert.equal(n?.href, 'foo.js')

    n = parse(`import "bar.js"`).find(n => n.type === 'moduleResolution') as Maybe<ImportNode>
    assert.ok(n)
    assert.equal(n?.href, 'bar.js')

    n = parse(`import 'bar/foo.js'`).find(n => n.type === 'moduleResolution') as Maybe<ImportNode>
    assert.ok(n)
    assert.equal(n?.href, 'bar/foo.js')

    /**
     * Backslash is escaped in string literal
     */
    n = parse(`import "foo\\\\bar.js"`).find(
      n => n.type === 'moduleResolution'
    ) as Maybe<ImportNode>
    assert.ok(n)
    assert.equal(n?.href, 'foo\\\\bar.js')

    n = parse(`import "foo\\bar.js"`).find(n => n.type === 'moduleResolution') as Maybe<ImportNode>
    assert.ok(n)
    assert.equal(n?.href, 'foo\\bar.js')
  })

  test('should not be parse in singleline comment', async () => {
    const n: Maybe<TNode> = parse(`// import 'foo.js'
`).find(n => n.type === 'moduleResolution')
    assert.ok(!n)
  })

  test('should not be parse in multiline comment', async () => {
    let n: Maybe<TNode>

    n = parse(/*js*/ `/* import 'foo.js' */`).find(n => n.type === 'moduleResolution')
    assert.ok(!n)

    n = parse(/*js*/ `/* 
import 'foo.js' */`).find(n => n.type === 'moduleResolution')
    assert.ok(!n)

    n = parse(/*js*/ `/* 
import 'foo.js' 
*/`).find(n => n.type === 'moduleResolution')
    assert.ok(!n)

    n = parse(/*js*/ `/* 
comment
import 'foo.js' 
block
*/`).find(n => n.type === 'moduleResolution')
    assert.ok(!n)
  })
})

suite('backticks string literal', () => {
  test('should parse backticks', async () => {
    const n = parse(/*js*/ '`foo`').find(n => n.type === 'region') as Maybe<RegionNode>
    assert.ok(n)
    assert.strictEqual(n?.kind, 'backticksStringLit')
  })

  test('should parse backticks multiline string literal', async () => {
    const n = parse(/*js*/ `\`
  foo
  bar\``).find(n => n.type === 'region') as Maybe<RegionNode>
    assert.ok(n)
    assert.strictEqual(n?.kind, 'backticksStringLit')
  })

  test('should parse backticks near statement', async () => {
    let n: Maybe<TNode>

    n = parse(/*js*/ 'var x = `foo`').find(n => n.type === 'region')
    assert.ok(n)

    n = parse(/*js*/ `
  var x = \`
    foo
    bar
  \`;
  `).find(n => n.type === 'region')
    assert.ok(n)
  })

  test('should parse backticks with escaped backticks inside', async () => {
    let n: Maybe<TNode>

    n = parse(/*js*/ '`foo\\`bar`').find(n => n.type === 'region')
    assert.ok(n)

    n = parse(/*js*/ `\`
      fo\\\`o
      bar\``).find(n => n.type === 'region')
    assert.ok(n)
  })
})

suite('regions', () => {
  test('should parse #text region', async () => {
    const n = parse(`
#text
foo
bar
#endtext
    `).find(n => n.type === 'region') as Maybe<RegionNode>
    assert.ok(n)
    assert.strictEqual(n?.kind, 'text')
  })

  test('should parse #text region with indent', async () => {
    const n = parse(`
      #text
      foo
      bar
      #endtext
    `).find(n => n.type === 'region') as Maybe<RegionNode>
    assert.ok(n)
    assert.strictEqual(n?.kind, 'text')
  })

  test('should parse #sql region', async () => {
    const n = parse(`
#sql
select 'lorem' ipsum
#endsql
    `).find(n => n.type === 'region') as Maybe<RegionNode>
    assert.ok(n)
    assert.strictEqual(n?.kind, 'sql')
  })

  test('should parse #sql region with indent', async () => {
    const n = parse(`
      #sql
      select 'lorem' ipsum
      #endsql
    `).find(n => n.type === 'region') as Maybe<RegionNode>
    assert.ok(n)
    assert.strictEqual(n?.kind, 'sql')
  })
})

suite('multiline comments', () => {
  test('should parse multiline comment inline', async () => {
    const n = parse(/*js*/ '/* foo */').find(n => n.type === 'region') as Maybe<RegionNode>
    assert.ok(n)
    assert.strictEqual(n?.kind, 'multiLineComment')
  })

  test('should parse multiline comment JSDoc style inline', async () => {
    const n = parse(/*js*/ '/** foo */').find(n => n.type === 'region') as Maybe<RegionNode>
    assert.ok(n)
    assert.strictEqual(n?.kind, 'multiLineComment')
  })

  test('should parse multiline comment', async () => {
    const n = parse(/*js*/ `/*
lorem
ipsum 
*/`).find(n => n.type === 'region') as Maybe<RegionNode>
    assert.ok(n)
    assert.strictEqual(n?.kind, 'multiLineComment')
  })

  test('should parse multiline comment after statement', async () => {
    const n = parse(/*js*/ 'var x = 100 /* foo */').find(n => n.type === 'region')
    assert.ok(n)
  })

  test('should parse multiline comment inside statement', async () => {
    const n = parse(/*js*/ 'var /** @type {string} */ name = 100;').find(n => n.type === 'region')
    assert.ok(n)
  })
})

suite('singleline comments', () => {
  test('should be parse', async () => {
    const n = parse(/*js*/ '// foo').find(n => n.type === 'singleLineComment')
    assert.ok(n)
  })

  test('should be parse after statement per line', async () => {
    const n = parse(/*js*/ 'var x = 100; // foo').find(n => n.type === 'singleLineComment')
    assert.ok(n)
  })
})
