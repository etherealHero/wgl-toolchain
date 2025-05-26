import * as assert from 'assert'

import { compile } from '../../compiler/compiler'
import { attachFS, projectRoot } from '../helper'

suite('module resolver', () => {
  test('should resolve absolute path', async () => {
    attachFS(
      new Map([
        ['c:\\root\\entry.js', "import 'dep.js';\n" + '\n' + 'double(10)\n'],
        ['c:\\root\\dep.js', 'function double (x) {\n' + '  return x * 2\n' + '}\n']
      ])
    )

    const bundleContent = (
      await compile('c:\\root\\entry.js', { modules: [], projectRoot })
    ).toStringWithSourceMap().code

    assert.equal(
      bundleContent,
      '/* @@resolved dep.js from entry.js */\n' +
        'function double (x) {\n' +
        '  return x * 2\n' +
        '}\n' +
        '\n' +
        '\n' +
        'double(10)\n'
    )
  })

  test('should resolve absolute path with dir via slash', async () => {
    attachFS(
      new Map([
        ['c:\\root\\entry.js', "import 'dir/dep.js';\n" + '\n' + 'double(10)\n'],
        ['c:\\root\\dir\\dep.js', 'function double (x) {\n' + '  return x * 2\n' + '}\n']
      ])
    )

    const bundleContent = (
      await compile('c:\\root\\entry.js', { modules: [], projectRoot })
    ).toStringWithSourceMap().code

    assert.equal(
      bundleContent,
      '/* @@resolved dir\\dep.js from entry.js */\n' +
        'function double (x) {\n' +
        '  return x * 2\n' +
        '}\n' +
        '\n' +
        '\n' +
        'double(10)\n'
    )
  })

  test('should resolve absolute path with dir via backslash (not escaped)', async () => {
    attachFS(
      new Map([
        ['c:\\root\\entry.js', "import 'dir\\dep.js';\n" + '\n' + 'double(10)\n'],
        ['c:\\root\\dir\\dep.js', 'function double (x) {\n' + '  return x * 2\n' + '}\n']
      ])
    )

    const bundleContent = (
      await compile('c:\\root\\entry.js', { modules: [], projectRoot })
    ).toStringWithSourceMap().code

    assert.equal(
      bundleContent,
      '/* @@resolved dir\\dep.js from entry.js */\n' +
        'function double (x) {\n' +
        '  return x * 2\n' +
        '}\n' +
        '\n' +
        '\n' +
        'double(10)\n'
    )
  })

  test('should resolve absolute path with dir via backslash (escaped)', async () => {
    attachFS(
      new Map([
        ['c:\\root\\entry.js', "import 'dir\\\\dep.js';\n" + '\n' + 'double(10)\n'],
        ['c:\\root\\dir\\dep.js', 'function double (x) {\n' + '  return x * 2\n' + '}\n']
      ])
    )

    const bundleContent = (
      await compile('c:\\root\\entry.js', { modules: [], projectRoot })
    ).toStringWithSourceMap().code

    assert.equal(
      bundleContent,
      '/* @@resolved dir\\dep.js from entry.js */\n' +
        'function double (x) {\n' +
        '  return x * 2\n' +
        '}\n' +
        '\n' +
        '\n' +
        'double(10)\n'
    )
  })

  test('should resolve relative path side by side', async () => {
    attachFS(
      new Map([
        ['c:\\root\\entry.js', "import './dep.js';\n" + '\n' + 'double(10)\n'],
        ['c:\\root\\dep.js', 'function double (x) {\n' + '  return x * 2\n' + '}\n']
      ])
    )

    const bundleContent = (
      await compile('c:\\root\\entry.js', { modules: [], projectRoot })
    ).toStringWithSourceMap().code

    assert.equal(
      bundleContent,
      '/* @@resolved dep.js from entry.js */\n' +
        'function double (x) {\n' +
        '  return x * 2\n' +
        '}\n' +
        '\n' +
        '\n' +
        'double(10)\n'
    )
  })

  test('should resolve relative path way up', async () => {
    attachFS(
      new Map([
        ['c:\\root\\dir\\entry.js', "import '../dep.js';\n" + '\n' + 'double(10)\n'],
        ['c:\\root\\dep.js', 'function double (x) {\n' + '  return x * 2\n' + '}\n']
      ])
    )

    const bundleContent = (
      await compile('c:\\root\\dir\\entry.js', { modules: [], projectRoot })
    ).toStringWithSourceMap().code

    assert.equal(
      bundleContent,
      '/* @@resolved dep.js from dir\\entry.js */\n' +
        'function double (x) {\n' +
        '  return x * 2\n' +
        '}\n' +
        '\n' +
        '\n' +
        'double(10)\n'
    )
  })
})

suite('module visitor', () => {
  test('should skip duplicated imports', async () => {
    attachFS(
      new Map([
        ['c:\\root\\entry.js', "import 'dep.js';\n" + "import 'dep.js';\n" + 'double(10)\n'],
        ['c:\\root\\dep.js', 'function double (x) {\n' + '  return x * 2\n' + '}\n']
      ])
    )

    const bundleContent = (
      await compile('c:\\root\\entry.js', { modules: [], projectRoot })
    ).toStringWithSourceMap().code

    assert.equal(
      bundleContent,
      '/* @@resolved dep.js from entry.js */\n' +
        'function double (x) {\n' +
        '  return x * 2\n' +
        '}\n' +
        '\n' +
        '/* @@unresolved dep.js from entry.js */\n' +
        '\n' +
        'double(10)\n'
    )
  })

  test('should resolve C-like order spec', async () => {
    attachFS(
      new Map([
        [
          'c:\\root\\entry.js',
          "import 'dep.js';\n" + "import 'roles.js';\n" + 'double(10, ADMIN_ROLE)\n'
        ],
        [
          'c:\\root\\dep.js',
          "import 'roles.js';\n" +
            '\n' +
            'function double (x, inputRole) {\n' +
            '  if (inputRole === ADMIN_ROLE)\n' +
            '  return x * 2\n' +
            '}\n'
        ],
        ['c:\\root\\roles.js', "var ADMIN_ROLE = 'admin';\n" + "var USER_ROLE = 'user';\n"]
      ])
    )

    const bundleContent = (
      await compile('c:\\root\\entry.js', { modules: [], projectRoot })
    ).toStringWithSourceMap().code

    assert.equal(
      bundleContent,
      '/* @@resolved dep.js from entry.js */\n' +
        '/* @@resolved roles.js from dep.js */\n' +
        "var ADMIN_ROLE = 'admin';\n" +
        "var USER_ROLE = 'user';\n" +
        '\n' +
        '\n' +
        'function double (x, inputRole) {\n' +
        '  if (inputRole === ADMIN_ROLE)\n' +
        '  return x * 2\n' +
        '}\n' +
        '\n' +
        '/* @@unresolved roles.js from entry.js */\n' +
        '\n' +
        'double(10, ADMIN_ROLE)\n'
    )
  })
})
