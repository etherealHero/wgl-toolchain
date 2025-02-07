import * as path from 'path'
import * as vscode from 'vscode'
import { astStorage, gls, normalizePath } from './compiler/utils'
import { getDefinitionInfoAtPosition } from './intellisense/definition'
import type * as wgl from './intellisense/wglscript'
import { mapToArray, requestOpenWglScriptWorkspace } from './utils'

export function activate(context: vscode.ExtensionContext) {
  console.log('Extension "wgl-toolchain" is now active')

  const wsf = vscode.workspace.workspaceFolders
  if (wsf === undefined) {
    requestOpenWglScriptWorkspace()
  } else {
    context.subscriptions.push(
      vscode.workspace.onDidChangeTextDocument(e => {
        if (!e.document.isDirty) return // TODO: проверить когда гит откатывается проходит ли триггер

        const projectRoot = wsf[0].uri.fsPath
        const normalized = normalizePath(e.document.uri.fsPath, projectRoot)

        if (astStorage.has(normalized)) {
          astStorage.delete(normalized)
        }

        if (gls.code !== '') {
          if (mapToArray(gls.modules).indexOf(normalized.toLowerCase()) === -1) return

          gls.code = ''
          gls.sourcemap = ''
          gls.modules = new Map()
        }
      })
    )
  }

  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(['javascript'], {
      provideDefinition: async (document, position, _token) => {
        const ws = vscode.workspace.getWorkspaceFolder(document.uri)
        const wsPath = (vscode.workspace.getWorkspaceFolder(document.uri) as vscode.WorkspaceFolder)
          .uri.fsPath

        if (ws === undefined) {
          requestOpenWglScriptWorkspace()
          return []
        }

        let di: wgl.Definition[] = []
        try {
          di = await getDefinitionInfoAtPosition(
            { fileName: document.fileName },
            position,
            (vscode.workspace.getWorkspaceFolder(document.uri) as vscode.WorkspaceFolder).uri.fsPath
          )
        } catch (error) {
          console.log(`ERROR: ${error}`)
          astStorage.clear()
          gls.code = ''
          gls.sourcemap = ''
          gls.modules = new Map()
        }

        return di.map(d => ({
          uri: vscode.Uri.file(path.join(wsPath, d.source)),
          range: new vscode.Range(d.line, d.column, d.line, d.column + d.length)
        }))
      }
    })
  )
}
