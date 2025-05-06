import * as path from 'path'
import * as vscode from 'vscode'

import { compile } from '../../compiler/compiler'
import { bundleInfoRepository } from '../../intellisense/utils'

export const __dirnameProxy = __dirname.replace(/([\\\/]+)out([\\\/]+)/, '$1src$2')

export async function buildWithTreeShaking(testCases: string) {
  const config = {
    entry: path.join(__dirnameProxy, 'tree-shaking', testCases, 'entry.js'),
    projectRoot: path.join(__dirnameProxy, 'tree-shaking', testCases)
  }

  const sn = await compile(config.entry, {
    projectRoot: config.projectRoot,
    modules: [],
    treeShaking: { searchPattern: /double/ },
    skipAttachGlobalScript: true
  })
  const bundle = sn.toStringWithSourceMap().code

  return bundle.replace(/(\n|\r\n)/gm, '\n')
}

export async function loadExtensionCase(entryModule: string): Promise<vscode.TextEditor> {
  const entryUri = vscode.Uri.file(path.join(__dirnameProxy, entryModule))

  for (const d of vscode.workspace.textDocuments) {
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor', d.uri)
  }

  const document = await vscode.workspace.openTextDocument(entryUri)
  await vscode.window.showTextDocument(document)
  await waitForLoadExtensionContext()

  return vscode.window.activeTextEditor as vscode.TextEditor
}

async function waitForLoadExtensionContext() {
  if (!bundleInfoRepository.size) {
    await new Promise(r => setTimeout(r, 10))
    await waitForLoadExtensionContext()
  }
}
