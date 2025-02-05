import * as path from 'path'
import * as vscode from 'vscode'
import { getDefinitionInfoAtPosition } from './intellisense/definition'
import type * as wgl from './intellisense/wglscript'

export function activate(context: vscode.ExtensionContext) {
  console.log('Extension "wgl-toolchain" is now active')

  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(['javascript'], {
      provideDefinition: async (document, position, _token) => {
        const ws = vscode.workspace.getWorkspaceFolder(document.uri)
        const wsPath = (vscode.workspace.getWorkspaceFolder(document.uri) as vscode.WorkspaceFolder)
          .uri.fsPath

        if (ws === undefined) {
          vscode.window.showWarningMessage(
            'Языковая служба не работает. Необходимо открыть рабочее пространство WGLScript'
          )
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
        }

        return di.map(d => ({
          uri: vscode.Uri.file(path.join(wsPath, d.source)),
          range: new vscode.Range(d.line, d.column, d.line, d.column + d.length)
        }))
      }
    })
  )
}
