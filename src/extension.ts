import * as path from 'path'
import * as vscode from 'vscode'
import * as compilerUtils from './compiler/utils'
import * as intellisense from './intellisense/features'
import * as utils from './utils'

import type * as wgl from './intellisense/wglscript'

let diagnosticsCollection: vscode.DiagnosticCollection
let diagnosticsCollectionBusy = false

export function activate(context: vscode.ExtensionContext) {
  console.log('Extension "wgl-toolchain" is now active')

  const wsf = vscode.workspace.workspaceFolders
  if (wsf === undefined) {
    utils.requestOpenWglScriptWorkspace()
  } else {
    const projectRoot = wsf[0].uri.fsPath

    if (
      utils.getExtOption<boolean>('intellisense.workspaceFeatures.renameAllReferencesInProject') ||
      utils.getExtOption<boolean>('intellisense.workspaceFeatures.findAllReferencesInProject')
    ) {
      // TODO: обернуть в промис и добавить опцию в настройки с включением фич только после индексации
      // TODO: переименовать инициализацию в индексацию / собрать нормальный StatusBarItem
      intellisense.getModuleReferences('plug.js', projectRoot, undefined, true)
    } else {
      vscode.window.withProgress(
        {
          title: 'WGLToolchain: Initialize features',
          location: vscode.ProgressLocation.Window,
          cancellable: false
        },
        () => compilerUtils.attachGlobalScript('plug.js', { projectRoot, modules: [] }, [])
      )
    }

    if (vscode.window.activeTextEditor?.document) {
      const activeDoc = vscode.window.activeTextEditor?.document
      const wsPath = vscode.workspace.getWorkspaceFolder(activeDoc.uri)?.uri.fsPath

      if (wsPath) {
        intellisense
          .getSemanticDiagnostics({ fileName: activeDoc.fileName }, wsPath, activeDoc.version)
          .then(diagnostics => {
            if (!diagnostics) return
            diagnosticsCollection.clear()
            for (const [m, d] of diagnostics)
              diagnosticsCollection.set(vscode.Uri.file(path.join(wsPath, m)), d)
          })
      }
    }

    context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor(async e => {
        if (!e) return
        if (!vscode.window.activeTextEditor) return

        const activeDoc = vscode.window.activeTextEditor.document
        if (e.document.fileName !== activeDoc.fileName) return

        const wsPath = vscode.workspace.getWorkspaceFolder(activeDoc.uri)?.uri.fsPath
        if (!wsPath) return
        await new Promise(r => setTimeout(r, 1000))

        const diagnostics = await intellisense.getSemanticDiagnostics(
          { fileName: activeDoc.fileName },
          wsPath,
          activeDoc.version
        )

        if (!diagnostics) return

        diagnosticsCollection.clear()
        for (const [m, d] of diagnostics)
          diagnosticsCollection.set(vscode.Uri.file(path.join(wsPath, m)), d)
      })
    )

    context.subscriptions.push(
      vscode.workspace.onDidChangeTextDocument(async e => {
        if (!e.document.isDirty) return // TODO: проверить когда гит откатывается проходит ли триггер

        const normalized = compilerUtils.normalizePath(e.document.uri.fsPath, projectRoot)

        // TODO: удалять tsvfs инстанс текущего бандла

        if (intellisense.modulesWithError.has(normalized)) {
          intellisense.modulesWithError.delete(normalized)
        }

        for (const [entry, deps] of intellisense.moduleReferencesStorage)
          if (deps.find(d => d === normalized)) intellisense.moduleReferencesStorage.delete(entry)

        if (compilerUtils.astStorage.has(normalized)) {
          compilerUtils.astStorage.delete(normalized)
        }

        if (compilerUtils.gls.code !== '') {
          if (
            utils.mapToArray(compilerUtils.gls.modules).indexOf(normalized.toLowerCase()) !== -1
          ) {
            compilerUtils.gls.code = ''
            compilerUtils.gls.sourcemap = ''
            compilerUtils.gls.modules = new Map()
          }
        }

        if (vscode.window.activeTextEditor) {
          const activeDoc = vscode.window.activeTextEditor.document
          if (e.document.fileName === activeDoc.fileName) {
            const wsPath = vscode.workspace.getWorkspaceFolder(activeDoc.uri)?.uri.fsPath

            if (wsPath && !diagnosticsCollectionBusy) {
              diagnosticsCollectionBusy = true
              await new Promise(r => setTimeout(r, 2000))

              intellisense
                .getSemanticDiagnostics(
                  { fileName: activeDoc.fileName },
                  wsPath,
                  e.document.version
                )
                .then(diagnostics => {
                  if (!diagnostics) return
                  diagnosticsCollection.clear()
                  for (const [m, d] of diagnostics)
                    diagnosticsCollection.set(vscode.Uri.file(path.join(wsPath, m)), d)
                  diagnosticsCollectionBusy = false
                })
            }
          }
        }
      })
    )
  }

  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(['javascript'], {
      provideDefinition: async (document, position, token) => {
        const wsPath = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath

        if (wsPath === undefined) {
          utils.requestOpenWglScriptWorkspace()
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
          compilerUtils.astStorage.clear()
          compilerUtils.gls.code = ''
          compilerUtils.gls.sourcemap = ''
          compilerUtils.gls.modules = new Map()
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
            utils.requestOpenWglScriptWorkspace()
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
            compilerUtils.astStorage.clear()
            compilerUtils.gls.code = ''
            compilerUtils.gls.sourcemap = ''
            compilerUtils.gls.modules = new Map()
          }
        },
        resolveCompletionItem: async (item, token) => {
          if (!vscode.window.activeTextEditor) return

          const document = vscode.window.activeTextEditor.document
          const position = vscode.window.activeTextEditor.selection.active
          const wsPath = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath

          if (wsPath === undefined) {
            utils.requestOpenWglScriptWorkspace()
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
            compilerUtils.astStorage.clear()
            compilerUtils.gls.code = ''
            compilerUtils.gls.sourcemap = ''
            compilerUtils.gls.modules = new Map()
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
          utils.requestOpenWglScriptWorkspace()
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
          compilerUtils.astStorage.clear()
          compilerUtils.gls.code = ''
          compilerUtils.gls.sourcemap = ''
          compilerUtils.gls.modules = new Map()
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
            utils.requestOpenWglScriptWorkspace()
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
            compilerUtils.astStorage.clear()
            compilerUtils.gls.code = ''
            compilerUtils.gls.sourcemap = ''
            compilerUtils.gls.modules = new Map()
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
          utils.requestOpenWglScriptWorkspace()
          return
        }

        const wordPos = document.getWordRangeAtPosition(position)
        let word = ''
        if (wordPos && wordPos.start.line === wordPos.end.line) {
          word = document
            .lineAt(wordPos.start.line)
            .text.slice(wordPos.start.character, wordPos.end.character)
        }

        let refs: wgl.SymbolEntry[] = []
        try {
          if (
            utils.getExtOption<boolean>('intellisense.workspaceFeatures.findAllReferencesInProject')
          ) {
            refs = await intellisense.getReferencesAtPositionInProject(
              { fileName: document.fileName },
              position,
              wsPath,
              token,
              new RegExp(word, 'm')
            )
          } else {
            refs = await intellisense.getReferencesAtPosition(
              { fileName: document.fileName },
              position,
              wsPath,
              token
            )
          }
        } catch (error) {
          console.log(`ERROR: ${error}`)
          compilerUtils.astStorage.clear()
          compilerUtils.gls.code = ''
          compilerUtils.gls.sourcemap = ''
          compilerUtils.gls.modules = new Map()
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
          utils.requestOpenWglScriptWorkspace()
          return
        }

        const wordPos = document.getWordRangeAtPosition(position)
        let word = ''
        if (wordPos && wordPos.start.line === wordPos.end.line) {
          word = document
            .lineAt(wordPos.start.line)
            .text.slice(wordPos.start.character, wordPos.end.character)
        }

        let refs: wgl.SymbolEntry[] = []
        try {
          if (
            utils.getExtOption<boolean>(
              'intellisense.workspaceFeatures.renameAllReferencesInProject'
            )
          ) {
            refs = await intellisense.getReferencesAtPositionInProject(
              { fileName: document.fileName },
              position,
              wsPath,
              token,
              new RegExp(word, 'm')
            )
          } else {
            refs = await intellisense.getReferencesAtPosition(
              { fileName: document.fileName },
              position,
              wsPath,
              token
            )
          }
        } catch (error) {
          console.log(`ERROR: ${error}`)
          compilerUtils.astStorage.clear()
          compilerUtils.gls.code = ''
          compilerUtils.gls.sourcemap = ''
          compilerUtils.gls.modules = new Map()
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
          utils.requestOpenWglScriptWorkspace()
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
          compilerUtils.astStorage.clear()
          compilerUtils.gls.code = ''
          compilerUtils.gls.sourcemap = ''
          compilerUtils.gls.modules = new Map()
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
          utils.requestOpenWglScriptWorkspace()
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
          compilerUtils.astStorage.clear()
          compilerUtils.gls.code = ''
          compilerUtils.gls.sourcemap = ''
          compilerUtils.gls.modules = new Map()
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
          utils.requestOpenWglScriptWorkspace()
          return
        }

        try {
          return await intellisense.getNavigationBarItems(
            { fileName: editor.document.fileName },
            wsPath,
            token,
            true /** includeWorkspaceSymbols */
          )
        } catch (error) {
          console.log(`ERROR: ${error}`)
          compilerUtils.astStorage.clear()
          compilerUtils.gls.code = ''
          compilerUtils.gls.sourcemap = ''
          compilerUtils.gls.modules = new Map()
        }
      }
    })
  )

  diagnosticsCollection = vscode.languages.createDiagnosticCollection('wglscript')
  context.subscriptions.push(diagnosticsCollection)
}
