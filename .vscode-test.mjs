import { defineConfig } from '@vscode/test-cli'

export default defineConfig({
  files: 'out/test/**/*.test.js',
  workspaceFolder: './src/test',
  version: '1.98.2',
  mocha: {
    // timeout: 20_000_000_000
    timeout: 20_000
  }
})
