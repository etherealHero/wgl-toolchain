import * as path from 'path'

export const normilizePath = (file: string, projectRoot: string) =>
  path.join(file.replace(projectRoot, '').replace(/^[\/\\]*/, ''))
