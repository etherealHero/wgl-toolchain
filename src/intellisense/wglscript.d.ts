type VsCodePosition = import('vscode').Position

declare namespace wgl {
  /** source-map MappedPosition with 0-based line for vscode API {@link VsCodePosition} */
  type SymbolEntry = import('source-map').MappedPosition & { length: number }
}

export = wgl
