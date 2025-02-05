import { workspace } from 'vscode'

export const getConfigurationOption = <T>(option: string): T =>
  workspace.getConfiguration('wglscript.globalscript').get(option) as T
