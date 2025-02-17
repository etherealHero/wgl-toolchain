import * as path from 'path'
import * as vscode from 'vscode'
import * as intellisense from './intellisense/features'
import type * as wgl from './intellisense/wglscript'

import { astStorage, attachGlobalScript, gls, normalizePath } from './compiler/utils'
import { mapToArray, requestOpenWglScriptWorkspace } from './utils'

export function activate(context: vscode.ExtensionContext) {
  console.log('Extension "wgl-toolchain" is now active')

  const wsf = vscode.workspace.workspaceFolders
  if (wsf === undefined) {
    requestOpenWglScriptWorkspace()
  } else {
    const projectRoot = wsf[0].uri.fsPath

    intellisense.getModuleReferences('plug.js', projectRoot, undefined, true)

    context.subscriptions.push(
      vscode.workspace.onDidChangeTextDocument(e => {
        if (!e.document.isDirty) return // TODO: проверить когда гит откатывается проходит ли триггер

        const normalized = normalizePath(e.document.uri.fsPath, projectRoot)

        // TODO: удалять tsvfs инстанс текущего бандла

        if (astStorage.has(normalized)) astStorage.delete(normalized)

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
        const wsPath = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath

        if (wsPath === undefined) {
          requestOpenWglScriptWorkspace()
          return
        }

        let di: wgl.SymbolEntry[] = []
        try {
          di = await intellisense.getDefinitionInfoAtPosition(
            { fileName: document.fileName },
            position,
            wsPath,
            token
          )
        } catch (error) {
          console.log(`ERROR: ${error}`)
          astStorage.clear()
          gls.code = ''
          gls.sourcemap = ''
          gls.modules = new Map()
          return
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
          const wsPath = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath

          if (wsPath === undefined) {
            requestOpenWglScriptWorkspace()
            return
          }

          try {
            const completions = await intellisense.getCompletionsAtPosition(
              { fileName: document.fileName },
              position,
              wsPath,
              token
            )

            return completions
          } catch (error) {
            console.log(`ERROR: ${error}`)
            astStorage.clear()
            gls.code = ''
            gls.sourcemap = ''
            gls.modules = new Map()
          }
        },
        resolveCompletionItem: async (item, token) => {
          if (!vscode.window.activeTextEditor) return

          const document = vscode.window.activeTextEditor.document
          const position = vscode.window.activeTextEditor.selection.active
          const wsPath = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath

          if (wsPath === undefined) {
            requestOpenWglScriptWorkspace()
            return
          }

          try {
            const completion = await intellisense.getCompletionEntryDetails(
              { fileName: document.fileName },
              position,
              typeof item.label === 'string' ? item.label : item.label.label,
              wsPath,
              token
            )

            return completion
          } catch (error) {
            console.log(`ERROR: ${error}`)
            astStorage.clear()
            gls.code = ''
            gls.sourcemap = ''
            gls.modules = new Map()
          }
        }
      },
      '.'
    )
  )

  context.subscriptions.push(
    vscode.languages.registerHoverProvider(['javascript'], {
      provideHover: async (document, position, token) => {
        const wsPath = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath

        if (wsPath === undefined) {
          requestOpenWglScriptWorkspace()
          return
        }

        try {
          const quickInfo = await intellisense.getQuickInfoAtPosition(
            { fileName: document.fileName },
            position,
            wsPath,
            token
          )

          return { contents: quickInfo }
        } catch (error) {
          console.log(`ERROR: ${error}`)
          astStorage.clear()
          gls.code = ''
          gls.sourcemap = ''
          gls.modules = new Map()
        }
      }
    })
  )

  context.subscriptions.push(
    vscode.languages.registerSignatureHelpProvider(
      ['javascript'],
      {
        provideSignatureHelp: async (document, position, token, _context) => {
          const wsPath = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath

          if (wsPath === undefined) {
            requestOpenWglScriptWorkspace()
            return
          }

          try {
            const signatureHelpItems = await intellisense.getSignatureHelpItems(
              { fileName: document.fileName },
              position,
              wsPath,
              token
            )

            return signatureHelpItems
          } catch (error) {
            console.log(`ERROR: ${error}`)
            astStorage.clear()
            gls.code = ''
            gls.sourcemap = ''
            gls.modules = new Map()
          }
        }
      },
      ',',
      '('
    )
  )

  context.subscriptions.push(
    vscode.languages.registerReferenceProvider(['javascript'], {
      provideReferences: async (document, position, context, token) => {
        const wsPath = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath

        if (wsPath === undefined) {
          requestOpenWglScriptWorkspace()
          return
        }

        let refs: wgl.SymbolEntry[] = []
        try {
          refs = await intellisense.getReferencesAtPositionInProject(
            { fileName: document.fileName },
            position,
            wsPath,
            token
          )
        } catch (error) {
          console.log(`ERROR: ${error}`)
          astStorage.clear()
          gls.code = ''
          gls.sourcemap = ''
          gls.modules = new Map()
          return
        }

        return refs.map(d => ({
          uri: vscode.Uri.file(path.join(wsPath, d.source)),
          range: new vscode.Range(d.line, d.column, d.line, d.column + d.length)
        }))
      }
    })
  )

  context.subscriptions.push(
    vscode.languages.registerRenameProvider(['javascript'], {
      provideRenameEdits: async (document, position, newName, token) => {
        const wsPath = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath

        if (wsPath === undefined) {
          requestOpenWglScriptWorkspace()
          return
        }

        let refs: wgl.SymbolEntry[] = []
        try {
          refs = await intellisense.getReferencesAtPositionInProject(
            { fileName: document.fileName },
            position,
            wsPath,
            token
          )
        } catch (error) {
          console.log(`ERROR: ${error}`)
          astStorage.clear()
          gls.code = ''
          gls.sourcemap = ''
          gls.modules = new Map()
          return
        }

        const wsEdit = new vscode.WorkspaceEdit()

        refs.map(d =>
          wsEdit.replace(
            vscode.Uri.file(path.join(wsPath, d.source)),
            new vscode.Range(d.line, d.column, d.line, d.column + d.length),
            newName
          )
        )

        return wsEdit
      },
      prepareRename: async (document, position, token) => {
        const wsPath = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath

        if (wsPath === undefined) {
          requestOpenWglScriptWorkspace()
          return
        }

        let di: wgl.SymbolEntry[] = []
        try {
          di = await intellisense.getDefinitionInfoAtPosition(
            { fileName: document.fileName },
            position,
            wsPath,
            token
          )
        } catch (error) {
          console.log(`ERROR: ${error}`)
          astStorage.clear()
          gls.code = ''
          gls.sourcemap = ''
          gls.modules = new Map()
        }

        if (di.find(d => d.source.match('node_modules\\\\@types'))) {
          return new Promise((_, r) =>
            r('You cannot rename elements that are defined in the standart library')
          )
        }
      }
    })
  )

  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider(['javascript'], {
      provideDocumentSymbols: async (document, token) => {
        const wsPath = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath

        if (wsPath === undefined) {
          requestOpenWglScriptWorkspace()
          return
        }

        try {
          return await intellisense.getNavigationBarItems(
            { fileName: document.fileName },
            wsPath,
            token
          )
        } catch (error) {
          console.log(`ERROR: ${error}`)
          astStorage.clear()
          gls.code = ''
          gls.sourcemap = ''
          gls.modules = new Map()
        }
      }
    })
  )

  context.subscriptions.push(
    vscode.languages.registerWorkspaceSymbolProvider({
      provideWorkspaceSymbols: async (query, token) => {
        const editor = vscode.window.activeTextEditor
        if (!editor) {
          // TODO: потом переделать под глобальные символы
          return [
            new vscode.SymbolInformation(
              'You need to open any WGLScript file to resolve workspace symbols',
              vscode.SymbolKind.File,
              '',
              new vscode.Location(vscode.Uri.file(''), new vscode.Range(0, 0, 0, 0))
            )
          ]
        }

        const wsPath = vscode.workspace.getWorkspaceFolder(editor.document.uri)?.uri.fsPath

        if (wsPath === undefined) {
          requestOpenWglScriptWorkspace()
          return
        }

        try {
          return await intellisense.getNavigationBarItems(
            { fileName: editor.document.fileName },
            wsPath,
            token,
            true
          )
        } catch (error) {
          console.log(`ERROR: ${error}`)
          astStorage.clear()
          gls.code = ''
          gls.sourcemap = ''
          gls.modules = new Map()
        }
      }
    })
  )
}
