import type { AssociationStatus, FileInfo, PdfHandle, ReaderSettings, RecentFile } from '../types/backend'

export function isDesktop(): boolean {
  return typeof window !== 'undefined' && !!window.go?.main?.App
}

function normalizeError(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message)
  }
  return '未知错误'
}

async function call<T>(method: string, ...args: unknown[]): Promise<T> {
  const app = window.go?.main?.App
  if (!app || typeof app[method] !== 'function') {
    throw new Error(`桌面服务未就绪（${method}）`)
  }
  try {
    return (await app[method](...args)) as T
  } catch (err) {
    throw new Error(normalizeError(err))
  }
}

/** Wails Go 绑定的唯一入口，前端不直接触碰 window.go。 */
export const backend = {
  openPdfDialog: () => call<string>('OpenPdfDialog'),
  openPdf: (path: string) => call<PdfHandle>('OpenPdf', path),
  getPdfData: (docId: string) => call<string>('GetPdfData', docId),
  fileExists: (path: string) => call<boolean>('FileExists', path),
  getFileInfo: (path: string) => call<FileInfo>('GetFileInfo', path),
  startupArgs: () => call<string[]>('StartupArgs'),
  recentList: () => call<RecentFile[]>('RecentList'),
  recentRemove: (path: string) => call<RecentFile[]>('RecentRemove', path),
  recentUpdateProgress: (path: string, page: number, zoom: number) =>
    call<void>('RecentUpdateProgress', path, page, zoom),
  settingsGet: () => call<ReaderSettings>('SettingsGet'),
  settingsSave: (settings: ReaderSettings) => call<ReaderSettings>('SettingsSave', settings),
  windowMinimise: () => call<void>('WindowMinimise'),
  windowToggleMaximise: () => call<void>('WindowToggleMaximise'),
  windowIsMaximised: () => call<boolean>('IsWindowMaximised'),
  windowClose: () => call<void>('WindowClose'),
  registerPdfAssociation: () => call<void>('RegisterPdfAssociation'),
  unregisterPdfAssociation: () => call<void>('UnregisterPdfAssociation'),
  getAssociationStatus: () => call<AssociationStatus>('GetAssociationStatus'),
  openDefaultAppsSettings: () => call<void>('OpenDefaultAppsSettings')
}
