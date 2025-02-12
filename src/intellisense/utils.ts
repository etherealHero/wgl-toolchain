import * as fs from 'fs'
import * as path from 'path'
import * as tsvfs from '@typescript/vfs'
import * as ts from 'typescript'
import * as vscode from 'vscode'
import { getHash, logtime } from '../utils'

/** Bundle file name */
export const bundle = 'bundle.js'

/** WGLScript compiler options */
export const compilerOpts = {
  allowJs: true,
  module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2015,
  esModuleInterop: true,
  forceConsistentCasingInFileNames: true,
  skipDefaultLibCheck: true,
  disableReferencedProjectLoad: true,
  noImplicitAny: true,
  checkJs: true,
  noEmit: true,
  strict: false,
  baseUrl: './',
  typeRoots: ['./node_modules/@types'],
  diagnostics: false
}

/** Map-key: bundle hash */
const VTSEnvStorage: Map<string, tsvfs.VirtualTypeScriptEnvironment> = new Map()

export function getVTSEnv(
  projectRoot: string,
  bundleContent: string
): tsvfs.VirtualTypeScriptEnvironment {
  const hash = getHash(bundleContent)

  if (VTSEnvStorage.has(hash)) {
    return VTSEnvStorage.get(hash) as tsvfs.VirtualTypeScriptEnvironment
  }

  // TODO: здесь разобраться и складывать только нужные либы
  const fsMap = tsvfs.createDefaultMapFromNodeModules(compilerOpts)

  try {
    const wgldts = fs.readFileSync(
      path.join(projectRoot, 'node_modules', '@types', 'wglscript', 'lib.wglscript.d.ts')
    )

    fsMap.set('/lib.es5.d.ts', `${wgldts}${fsMap.get('/lib.es5.d.ts') as string}`)
  } catch (error) {
    console.log(
      'ERROR: types for WGLScript at node_modules/@types/wglscript/lib.wglscript.d.ts not found'
    )
  }

  for (const lib of fsMap.keys()) {
    const dir = path.join(projectRoot, 'node_modules', '@types', 'wglscript', 'generated')
    const libFile = path.join(dir, lib)
    if (!fs.existsSync(libFile)) {
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(libFile, fsMap.get(lib) as string)
    }
  }

  fsMap.set(bundle, bundleContent)

  const system = tsvfs.createSystem(fsMap)
  const env = logtime(tsvfs.createVirtualTypeScriptEnvironment, system, [bundle], ts, compilerOpts)

  VTSEnvStorage.set(hash, env)

  return env
}

export function TSElementKindtoVSCodeCompletionItemKind(
  el: ts.ScriptElementKind
): vscode.CompletionItemKind {
  switch (el) {
    case ts.ScriptElementKind.moduleElement:
      return vscode.CompletionItemKind.Module
    case ts.ScriptElementKind.classElement:
    case ts.ScriptElementKind.localClassElement:
      return vscode.CompletionItemKind.Class
    case ts.ScriptElementKind.interfaceElement:
      return vscode.CompletionItemKind.Interface
    case ts.ScriptElementKind.typeElement:
      return vscode.CompletionItemKind.Struct
    case ts.ScriptElementKind.enumElement:
      return vscode.CompletionItemKind.Enum
    case ts.ScriptElementKind.enumMemberElement:
      return vscode.CompletionItemKind.EnumMember
    case ts.ScriptElementKind.variableElement:
    case ts.ScriptElementKind.localVariableElement:
    case ts.ScriptElementKind.variableUsingElement:
    case ts.ScriptElementKind.variableAwaitUsingElement:
      return vscode.CompletionItemKind.Variable
    case ts.ScriptElementKind.constElement:
      return vscode.CompletionItemKind.Constant
    case ts.ScriptElementKind.letElement:
      return vscode.CompletionItemKind.Variable
    case ts.ScriptElementKind.functionElement:
    case ts.ScriptElementKind.localFunctionElement:
      return vscode.CompletionItemKind.Function
    case ts.ScriptElementKind.memberFunctionElement:
      return vscode.CompletionItemKind.Method
    case ts.ScriptElementKind.memberVariableElement:
      return vscode.CompletionItemKind.Property
    case ts.ScriptElementKind.memberGetAccessorElement:
    case ts.ScriptElementKind.memberSetAccessorElement:
    case ts.ScriptElementKind.memberAccessorVariableElement:
      return vscode.CompletionItemKind.Property
    case ts.ScriptElementKind.constructorImplementationElement:
      return vscode.CompletionItemKind.Constructor
    case ts.ScriptElementKind.callSignatureElement:
      return vscode.CompletionItemKind.Function
    case ts.ScriptElementKind.indexSignatureElement:
      return vscode.CompletionItemKind.Operator
    case ts.ScriptElementKind.constructSignatureElement:
      return vscode.CompletionItemKind.Constructor
    case ts.ScriptElementKind.parameterElement:
      return vscode.CompletionItemKind.Variable
    case ts.ScriptElementKind.typeParameterElement:
      return vscode.CompletionItemKind.TypeParameter
    case ts.ScriptElementKind.keyword:
      return vscode.CompletionItemKind.Keyword
    case ts.ScriptElementKind.string:
      return vscode.CompletionItemKind.Text
    default:
      return vscode.CompletionItemKind.Text
  }
}

export function TSElementKindtoVSCodeSymbolKind(el: ts.ScriptElementKind): vscode.SymbolKind {
  switch (el) {
    case ts.ScriptElementKind.moduleElement:
      return vscode.SymbolKind.Module
    case ts.ScriptElementKind.classElement:
    case ts.ScriptElementKind.localClassElement:
      return vscode.SymbolKind.Class
    case ts.ScriptElementKind.interfaceElement:
      return vscode.SymbolKind.Interface
    case ts.ScriptElementKind.typeElement:
      return vscode.SymbolKind.Struct
    case ts.ScriptElementKind.enumElement:
      return vscode.SymbolKind.Enum
    case ts.ScriptElementKind.enumMemberElement:
      return vscode.SymbolKind.EnumMember
    case ts.ScriptElementKind.variableElement:
    case ts.ScriptElementKind.localVariableElement:
    case ts.ScriptElementKind.variableUsingElement:
    case ts.ScriptElementKind.variableAwaitUsingElement:
      return vscode.SymbolKind.Variable
    case ts.ScriptElementKind.constElement:
      return vscode.SymbolKind.Constant
    case ts.ScriptElementKind.letElement:
      return vscode.SymbolKind.Variable
    case ts.ScriptElementKind.functionElement:
    case ts.ScriptElementKind.localFunctionElement:
      return vscode.SymbolKind.Function
    case ts.ScriptElementKind.memberFunctionElement:
      return vscode.SymbolKind.Method
    case ts.ScriptElementKind.memberVariableElement:
      return vscode.SymbolKind.Property
    case ts.ScriptElementKind.memberGetAccessorElement:
    case ts.ScriptElementKind.memberSetAccessorElement:
    case ts.ScriptElementKind.memberAccessorVariableElement:
      return vscode.SymbolKind.Property
    case ts.ScriptElementKind.constructorImplementationElement:
      return vscode.SymbolKind.Constructor
    case ts.ScriptElementKind.callSignatureElement:
      return vscode.SymbolKind.Function
    case ts.ScriptElementKind.indexSignatureElement:
      return vscode.SymbolKind.Key
    case ts.ScriptElementKind.constructSignatureElement:
      return vscode.SymbolKind.Constructor
    case ts.ScriptElementKind.parameterElement:
      return vscode.SymbolKind.Variable
    case ts.ScriptElementKind.typeParameterElement:
      return vscode.SymbolKind.TypeParameter
    case ts.ScriptElementKind.string:
      return vscode.SymbolKind.String
    case ts.ScriptElementKind.primitiveType:
      return vscode.SymbolKind.TypeParameter
    case ts.ScriptElementKind.label:
      return vscode.SymbolKind.Object
    case ts.ScriptElementKind.alias:
      return vscode.SymbolKind.Namespace
    case ts.ScriptElementKind.directory:
      return vscode.SymbolKind.Package
    case ts.ScriptElementKind.externalModuleName:
      return vscode.SymbolKind.Module
    default:
      return vscode.SymbolKind.Null
  }
}

export function prettifyJSDoc(t: ts.JSDocTagInfo): string {
  return `_@${t.name}_ ${(t.text || []).map((p, i) => (i ? p.text.replace(/([<>])/g, '\\$1') : `**${p.text.replace(/([<>])/g, '\\$1')}**`)).join('')}`
}
