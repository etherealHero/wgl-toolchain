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
  if (el === ts.ScriptElementKind.variableElement) return vscode.CompletionItemKind.Variable
  if (el === ts.ScriptElementKind.functionElement) return vscode.CompletionItemKind.Function
  if (el === ts.ScriptElementKind.memberFunctionElement) return vscode.CompletionItemKind.Method
  if (el === ts.ScriptElementKind.memberVariableElement) return vscode.CompletionItemKind.Property
  return vscode.CompletionItemKind.Text
}
