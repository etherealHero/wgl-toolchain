import * as assert from 'assert'
import * as path from 'path'

import { getDefinitionInfoAtPosition } from '../../intellisense/definition'

test('find valid definition', async () => {
  const __dirnameProxy = __dirname.replace(/([\\\/]+)out([\\\/]+)/, '$1src$2')
  const defInfo = await getDefinitionInfoAtPosition(
    { fileName: path.join(__dirnameProxy, 'entry.js') },
    // <here>sum(1, 2)
    { line: 2 /** vs-code 0-based */, character: 0 },
    __dirnameProxy
  )

  // function <here>sum(a, b) {
  assert.deepEqual(defInfo, [{ source: 'dep.js', line: 0, column: 9, length: 3 }])
})

// TODO: добавить тест с отступом символа (проксирование отступа в сурсмапах)

// TODO: добавить тест с символом из d.ts (валидное проксирование ресурса)
