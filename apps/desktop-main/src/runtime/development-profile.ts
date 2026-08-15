import { join } from 'node:path'

export interface DesktopProfileApp {
  isPackaged: boolean
  getPath(name: 'appData'): string
  setName(name: string): void
  setPath(name: 'userData', value: string): void
}

export function configureDesktopProfile(app: DesktopProfileApp): void {
  if (app.isPackaged) {
    app.setName('DeepSeek Desktop')
    return
  }
  app.setName('DeepSeek Desktop Dev')
  app.setPath('userData', join(app.getPath('appData'), 'DeepSeek Desktop Dev'))
}
