import * as path from 'path'
import * as vscode from 'vscode'
import type * as wgl from './intellisense/wglscript'
import * as utils from './utils'

import { intellisense } from './intellisense/features'

export let diagnosticsCollection: vscode.DiagnosticCollection

// TODO: активация только на WGLProject
// TODO: разобрать в каких еще фичах можно применить tree shaking
export function activate(context: vscode.ExtensionContext) {
  console.log('Extension "wgl-toolchain" is now active')

  const wsf = vscode.workspace.workspaceFolders
  if (wsf === undefined) {
    utils.requestOpenWglScriptWorkspace()
  } else {
    let command: vscode.Disposable

    command = vscode.commands.registerCommand('wglscript.restartService', utils.restartService)
    context.subscriptions.push(command)
    command = vscode.commands.registerCommand('wglscript.showBundle', utils.showBundle)
    context.subscriptions.push(command)
    command = vscode.commands.registerCommand('wglscript.showLocalBundle', utils.showLocalBundle)
    context.subscriptions.push(command)
    command = vscode.commands.registerCommand('wglscript.showModuleInfo', utils.showModuleInfo)
    context.subscriptions.push(command)

    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 10)
    statusBar.text = '$(sparkle) wgl'
    statusBar.tooltip = new vscode.MarkdownString('', true)
    statusBar.tooltip.isTrusted = true
    statusBar.tooltip.appendMarkdown('WGL Toolchain')
    statusBar.tooltip.appendMarkdown(
      '\n\n[$(debug-restart) Restart Service](command:wglscript.restartService)'
    )
    statusBar.tooltip.appendMarkdown(
      '\n\n[$(extensions) BuiltIn Extensions](command:workbench.extensions.action.listBuiltInExtensions)'
    )
    statusBar.tooltip.appendMarkdown('\n\nInspect tools:')
    statusBar.tooltip.appendMarkdown('\n\n[$(symbol-enum) Bundle](command:wglscript.showBundle)')
    statusBar.tooltip.appendMarkdown(
      '\n\n[$(symbol-constant) Local Bundle](command:wglscript.showLocalBundle)'
    )
    statusBar.tooltip.appendMarkdown('\n\n[$(info) Module Info](command:wglscript.showModuleInfo)')
    statusBar.command = 'wglscript.restartService'
    statusBar.show()

    context.subscriptions.push(statusBar)

    // уходит в рекурсию на старте
    // utils.restartService()

    const diagnosticsStrategy = utils.getExtOption<'onchange' | 'onsave' | 'disabled'>(
      'intellisense.requestStrategy.diagnostics'
    )

    if (vscode.window.activeTextEditor?.document && diagnosticsStrategy !== 'disabled') {
      const activeDoc = vscode.window.activeTextEditor?.document
      const wsPath = vscode.workspace.getWorkspaceFolder(activeDoc.uri)?.uri.fsPath

      if (wsPath && activeDoc.languageId === 'javascript') {
        intellisense.getDiagnostics({ fileName: activeDoc.fileName }, wsPath).then(diagnostics => {
          if (!diagnostics) return
          diagnosticsCollection.clear()
          for (const [m, d] of diagnostics)
            diagnosticsCollection.set(vscode.Uri.file(path.join(wsPath, m)), d)
        })
      }
    }

    context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor(async e => {
        const diagnosticsStrategy = utils.getExtOption<'onchange' | 'onsave' | 'disabled'>(
          'intellisense.requestStrategy.diagnostics'
        )

        if (!e || !vscode.window.activeTextEditor || diagnosticsStrategy === 'disabled') return

        const activeDoc = vscode.window.activeTextEditor.document
        if (activeDoc.languageId !== 'javascript') return
        if (e.document.fileName !== activeDoc.fileName) return

        const wsPath = vscode.workspace.getWorkspaceFolder(activeDoc.uri)?.uri.fsPath
        if (!wsPath) return
        await new Promise(r => setTimeout(r, 1000))
        // TODO: мб теряется обновление диагностик при обновлении зависимотей
        if (vscode.window.activeTextEditor?.document.version !== e.document.version) return

        const diagnostics = await intellisense.getDiagnostics(
          { fileName: activeDoc.fileName },
          wsPath
        )

        if (!diagnostics) return
        // TODO: мб теряется обновление диагностик при обновлении зависимотей
        if (vscode.window.activeTextEditor?.document.version !== e.document.version) return

        diagnosticsCollection.clear()
        for (const [m, d] of diagnostics)
          diagnosticsCollection.set(vscode.Uri.file(path.join(wsPath, m)), d)
      })
    )

    context.subscriptions.push(
      vscode.workspace.onDidSaveTextDocument(e => {
        if (e.languageId !== 'javascript') return

        const diagnosticsStrategy = utils.getExtOption<'onchange' | 'onsave' | 'disabled'>(
          'intellisense.requestStrategy.diagnostics'
        )

        if (vscode.window.activeTextEditor && diagnosticsStrategy === 'onsave') {
          const activeDoc = vscode.window.activeTextEditor.document
          if (e.fileName === activeDoc.fileName) {
            const wsPath = vscode.workspace.getWorkspaceFolder(activeDoc.uri)?.uri.fsPath

            if (wsPath) {
              // при обновлении зависимостей надо пересобирать диагностики
              // if (vscode.window.activeTextEditor?.document.version !== e.version) return

              utils.debaunceChangeTextDocument(utils.lastEdit).then(
                passed =>
                  passed &&
                  intellisense
                    .getDiagnostics({ fileName: activeDoc.fileName }, wsPath)
                    .then(diagnostics => {
                      if (!diagnostics) return

                      diagnosticsCollection.clear()
                      for (const [m, d] of diagnostics)
                        diagnosticsCollection.set(vscode.Uri.file(path.join(wsPath, m)), d)
                    })
              )
            }
          }
        }
      })
    )

    context.subscriptions.push(
      vscode.workspace.onDidChangeTextDocument(e =>
        utils.didChangeTextDocumentHandler({ document: e.document })
      )
    )
  }

  if (
    utils.getExtOption<'enabled' | 'disabled'>('intellisense.features.goToDefinition') === 'enabled'
  ) {
    context.subscriptions.push(
      vscode.languages.registerDefinitionProvider(['javascript'], {
        provideDefinition: async (document, position, token) => {
          const wsPath = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath

          if (wsPath === undefined) return

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
            utils.restartService()
            return
          }

          return di.map(d => ({
            uri: vscode.Uri.file(path.join(wsPath, d.source)),
            range: new vscode.Range(d.line, d.column, d.line, d.column + d.length)
          }))
        }
      })
    )
  }

  if (
    utils.getExtOption<'enabled' | 'disabled'>('intellisense.features.getCompletions') === 'enabled'
  ) {
    context.subscriptions.push(
      vscode.languages.registerCompletionItemProvider(
        ['javascript'],
        {
          provideCompletionItems: async (document, position, token) => {
            const wsPath = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath

            if (wsPath === undefined) return

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
              utils.restartService()
            }
          },
          resolveCompletionItem: async (item, token) => {
            if (!vscode.window.activeTextEditor || vscode.window.activeTextEditor.document.isDirty)
              return

            const document = vscode.window.activeTextEditor.document
            const position = vscode.window.activeTextEditor.selection.active
            const wsPath = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath

            if (wsPath === undefined) return

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
              utils.restartService()
            }
          }
        },
        '.'
      )
    )
  }

  if (utils.getExtOption<'enabled' | 'disabled'>('intellisense.features.getHover') === 'enabled') {
    context.subscriptions.push(
      vscode.languages.registerHoverProvider(['javascript'], {
        provideHover: async (document, position, token) => {
          const wsPath = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath

          if (wsPath === undefined) return

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
            utils.restartService()
          }
        }
      })
    )
  }

  if (
    utils.getExtOption<'enabled' | 'disabled'>('intellisense.features.getSignatureHelp') ===
    'enabled'
  ) {
    context.subscriptions.push(
      vscode.languages.registerSignatureHelpProvider(
        ['javascript'],
        {
          provideSignatureHelp: async (document, position, token, _context) => {
            const wsPath = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath

            if (wsPath === undefined) return

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
              utils.restartService()
            }
          }
        },
        ',',
        '('
      )
    )
  }

  if (
    utils.getExtOption<'enabled' | 'disabled'>('intellisense.features.getReferences') === 'enabled'
  ) {
    context.subscriptions.push(
      vscode.languages.registerReferenceProvider(['javascript'], {
        provideReferences: async (document, position, context, token) => {
          const wsPath = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath

          if (wsPath === undefined) return

          const wordPos = document.getWordRangeAtPosition(position)
          let word = ''
          if (wordPos && wordPos.start.line === wordPos.end.line) {
            word = document
              .lineAt(wordPos.start.line)
              .text.slice(wordPos.start.character, wordPos.end.character)
          }

          try {
            const refs = await intellisense.getReferencesAtPositionInProject(
              { fileName: document.fileName },
              position,
              wsPath,
              token,
              new RegExp(`[^a-zA-Z0-9$_]${word}[^a-zA-Z0-9$_]`, 'm')
            )

            return refs.map(d => ({
              uri: vscode.Uri.file(path.join(wsPath, d.source)),
              range: new vscode.Range(d.line, d.column, d.line, d.column + d.length)
            }))
          } catch (error) {
            console.log(`ERROR: ${error}`)
            utils.restartService()
            return
          }
        }
      })
    )
  }

  if (
    utils.getExtOption<'enabled' | 'disabled'>('intellisense.features.renameSymbol') === 'enabled'
  ) {
    context.subscriptions.push(
      vscode.languages.registerRenameProvider(['javascript'], {
        provideRenameEdits: async (document, position, newName, token) => {
          const wsPath = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath

          if (wsPath === undefined) return

          const wordPos = document.getWordRangeAtPosition(position)
          let word = ''
          if (wordPos && wordPos.start.line === wordPos.end.line) {
            word = document
              .lineAt(wordPos.start.line)
              .text.slice(wordPos.start.character, wordPos.end.character)
          }

          try {
            const refs = await intellisense.getReferencesAtPositionInProject(
              { fileName: document.fileName },
              position,
              wsPath,
              token,
              new RegExp(word, 'm')
            )

            const wsEdit = new vscode.WorkspaceEdit()
            const docsSync: Pick<
              vscode.TextDocument,
              'isDirty' | 'uri' | 'fileName' | 'version' | 'languageId'
            >[] = []

            refs.map(d => {
              const uri = vscode.Uri.file(path.join(wsPath, d.source))

              docsSync.push({
                isDirty: true,
                uri,
                fileName: uri.fsPath,
                version: 0,
                languageId: 'javascript'
              })

              wsEdit.replace(
                uri,
                new vscode.Range(d.line, d.column, d.line, d.column + d.length),
                newName
              )
            })

            new Promise(r => setTimeout(r, 0)).then(() =>
              docsSync.map(d => utils.didChangeTextDocumentHandler({ document: d, force: true }))
            )

            return wsEdit
          } catch (error) {
            console.log(`ERROR: ${error}`)
            utils.restartService()
            return
          }
        },
        prepareRename: async (document, position, token) => {
          const wsPath = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath

          if (wsPath === undefined) return

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
            utils.restartService()
          }

          if (di.find(d => d.source.match('node_modules\\\\@types'))) {
            return new Promise((_, r) =>
              r('You cannot rename elements that are defined in the standart library')
            )
          }
        }
      })
    )
  }

  if (
    utils.getExtOption<'enabled' | 'disabled'>('intellisense.features.goToSymbol') === 'enabled'
  ) {
    context.subscriptions.push(
      vscode.languages.registerDocumentSymbolProvider(['javascript'], {
        provideDocumentSymbols: async (document, token) => {
          const wsPath = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath

          if (wsPath === undefined) return

          try {
            if (await utils.debaunceChangeTextDocument(utils.lastEdit)) {
              return await intellisense.getNavigationBarItems(
                { fileName: document.fileName },
                wsPath,
                token
              )
            }
          } catch (error) {
            console.log(`ERROR: ${error}`)
            utils.restartService()
          }
        }
      })
    )
  }

  if (
    utils.getExtOption<'enabled' | 'disabled'>('intellisense.features.goToSymbolWorkspace') ===
    'enabled'
  ) {
    context.subscriptions.push(
      vscode.languages.registerWorkspaceSymbolProvider({
        provideWorkspaceSymbols: async (_query, token) => {
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

          if (wsPath === undefined) return

          try {
            return await intellisense.getNavigationBarItems(
              { fileName: editor.document.fileName },
              wsPath,
              token,
              true /** includeWorkspaceSymbols */
            )
          } catch (error) {
            console.log(`ERROR: ${error}`)
            utils.restartService()
          }
        }
      })
    )
  }

  if (utils.getExtOption<'enabled' | 'disabled'>('intellisense.features.formatter') === 'enabled') {
    context.subscriptions.push(
      vscode.languages.registerDocumentFormattingEditProvider('javascript', {
        provideDocumentFormattingEdits: async (document, options, token) => {
          const wsPath = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath

          if (wsPath === undefined) return

          const endPos = document.positionAt(document.getText().length - 1)

          try {
            return await intellisense.getFormattingEditsForDocument(document, wsPath, endPos, token)
          } catch (error) {
            console.log(`ERROR: ${error}`)
            vscode.window.showErrorMessage(`WGLFormatter ${error}`)
            utils.restartService()
          }

          return null
        }
      })
    )
  }

  if (utils.getExtOption<'enabled' | 'disabled'>('intellisense.features.folding') === 'enabled') {
    context.subscriptions.push(
      vscode.languages.registerFoldingRangeProvider(['javascript'], {
        provideFoldingRanges: async (document, context, token) => {
          const wsPath = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath

          if (wsPath === undefined) return

          try {
            if (await utils.debaunceChangeTextDocument(utils.lastEdit)) {
              return await intellisense.getFoldingRanges(
                { fileName: document.fileName },
                wsPath,
                token
              )
            }
          } catch (error) {
            console.log(`ERROR: ${error}`)
            utils.restartService()
          }
        }
      })
    )
  }

  if (
    utils.getExtOption<'enabled' | 'disabled'>('intellisense.features.codeActions') === 'enabled'
  ) {
    context.subscriptions.push(
      vscode.languages.registerCodeActionsProvider(['javascript'], {
        provideCodeActions: async (document, range, context, token) => {
          const wsPath = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath

          if (wsPath === undefined) return
          if (context.triggerKind === vscode.CodeActionTriggerKind.Automatic) return null

          const action = new vscode.CodeAction('WGL to ES syntax', vscode.CodeActionKind.Refactor)
          const endPos = document.positionAt(document.getText().length - 1)

          try {
            const edit = await intellisense.fixLegacySyntaxAction(document, wsPath, endPos, token)
            const wsEdit = new vscode.WorkspaceEdit()

            if (!edit) return null

            wsEdit.replace(document.uri, edit.range, edit.newText)
            action.edit = wsEdit

            return [action]
          } catch (error) {
            console.log(`ERROR: ${error}`)
            vscode.window.showErrorMessage(`WGLFormatter ${error}`)
            utils.restartService()
          }
        }
      })
    )
  }

  diagnosticsCollection = vscode.languages.createDiagnosticCollection('wglscript')
  context.subscriptions.push(diagnosticsCollection)
}
