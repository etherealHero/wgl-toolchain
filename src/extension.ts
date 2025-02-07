import * as path from 'path'
import * as vscode from 'vscode'
import { astStorage, attachGlobalScript, gls, normalizePath } from './compiler/utils'
import {
  getCompletionsAtPosition,
  getDefinitionInfoAtPosition,
  getQuickInfoAtPosition
} from './intellisense/features'
import type * as wgl from './intellisense/wglscript'
import { mapToArray, requestOpenWglScriptWorkspace } from './utils'

export function activate(context: vscode.ExtensionContext) {
  console.log('Extension "wgl-toolchain" is now active')

  const wsf = vscode.workspace.workspaceFolders
  if (wsf === undefined) {
    requestOpenWglScriptWorkspace()
  } else {
    const projectRoot = wsf[0].uri.fsPath

    vscode.window.withProgress(
      {
        title: 'Initialize WGLScript features...',
        location: vscode.ProgressLocation.Window,
        cancellable: false
      },
      () => attachGlobalScript('plug.js', { projectRoot, modules: [] }, [])
    )

    context.subscriptions.push(
      vscode.workspace.onDidChangeTextDocument(e => {
        if (!e.document.isDirty) return // TODO: проверить когда гит откатывается проходит ли триггер

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
      provideDefinition: async (document, position, token) => {
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
            (vscode.workspace.getWorkspaceFolder(document.uri) as vscode.WorkspaceFolder).uri
              .fsPath,
            token
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

  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      ['javascript'],
      {
        provideCompletionItems: async (document, position, token) => {
          // console.log(`[DEBUG:${new Date().toISOString()}]: trigger provideCompletionItems`)

          const ws = vscode.workspace.getWorkspaceFolder(document.uri)

          if (ws === undefined) {
            requestOpenWglScriptWorkspace()
            return []
          }

          const r = document.getWordRangeAtPosition(position)
          const wordRangeAtPosition = document
            .lineAt(position.line)
            .text.slice(r?.start.character, r?.end.character)

          try {
            const completions = await getCompletionsAtPosition(
              { fileName: document.fileName },
              position,
              wordRangeAtPosition,
              (vscode.workspace.getWorkspaceFolder(document.uri) as vscode.WorkspaceFolder).uri
                .fsPath,
              token
            )

            return completions
          } catch (error) {
            console.log(`ERROR: ${error}`)
            astStorage.clear()
            gls.code = ''
            gls.sourcemap = ''
            gls.modules = new Map()

            return []
          }
        }
      },
      '.'
    )
  )

  context.subscriptions.push(
    vscode.languages.registerHoverProvider(['javascript'], {
      provideHover: async (document, position, token) => {
        console.log(`[DEBUG:${new Date().toISOString()}]: trigger provideHover`)
        const ws = vscode.workspace.getWorkspaceFolder(document.uri)

        if (ws === undefined) {
          requestOpenWglScriptWorkspace()
          return { contents: [] }
        }

        try {
          const quickInfo = await getQuickInfoAtPosition(
            { fileName: document.fileName },
            position,
            (vscode.workspace.getWorkspaceFolder(document.uri) as vscode.WorkspaceFolder).uri
              .fsPath,
            token
          )

          return { contents: quickInfo }
        } catch (error) {
          console.log(`ERROR: ${error}`)
          astStorage.clear()
          gls.code = ''
          gls.sourcemap = ''
          gls.modules = new Map()

          return { contents: [] }
        }
      }
    })
  )
}
