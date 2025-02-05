import * as ts from 'typescript'

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
