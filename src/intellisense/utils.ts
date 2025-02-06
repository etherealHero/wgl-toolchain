import * as fs from 'fs'
import * as path from 'path'
import * as tsvfs from '@typescript/vfs'
import * as ts from 'typescript'
import { getHash } from '../utils'

/**
 * Bundle file name
 */
export const bundle = 'bundle.js'

/**
 * WGLScript compiler options
 */
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

export function createVirtualTypeScriptEnvironment(
  projectRoot: string,
  bundleContent: string
): tsvfs.VirtualTypeScriptEnvironment {
  console.log(`INFO: ${Array.from(VTSEnvStorage.keys()).length} VTSEnv instances`)

  const hash = getHash(bundleContent)

  if (VTSEnvStorage.has(hash)) {
    console.log('INFO: get VTSEnv from storage')
    return VTSEnvStorage.get(hash) as tsvfs.VirtualTypeScriptEnvironment
  }

  console.log('INFO: create VTSEnv')
  const fsMap = tsvfs.createDefaultMapFromNodeModules(compilerOpts)

  try {
    const wgldts = fs.readFileSync(
      path.join(projectRoot, 'node_modules', '@types', 'wglscript', 'lib.wglscript.d.ts')
    )

    fsMap.set('/lib.es5.d.ts', `${wgldts}${fsMap.get('/lib.es5.d.ts') as string}`)
  } catch (error) {
    console.log(
      'WARN: types for WGLScript at node_modules/@types/wglscript/lib.wglscript.d.ts not found'
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
  const env = tsvfs.createVirtualTypeScriptEnvironment(system, [bundle], ts, compilerOpts)

  VTSEnvStorage.set(hash, env)

  return env
}
