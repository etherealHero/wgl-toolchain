import { defineConfig } from '@vscode/test-cli'

export default defineConfig({
  files: 'out/test/**/*.test.js',
  workspaceFolder: './src/test/intellisense',
  mocha: {
    timeout: 20_000
  }
})
