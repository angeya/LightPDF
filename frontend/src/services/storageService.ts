import type { ReaderSettings, RecentFile } from '../types/backend'
import { backend, isDesktop } from './bridge'

const LS_RECENT = 'lightpdf.recent'
const LS_SETTINGS = 'lightpdf.settings'

const defaultSettings: ReaderSettings = {
  uiTheme: 'system',
  pdfTheme: 'original',
  sidebarWidth: 260,
  sidebarExpanded: true,
  defaultZoom: 1
}

function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeLocal(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* 忽略本地存储不可用的情况 */
  }
}

/** 设置与最近记录持久化；非桌面环境（浏览器预览）退回 localStorage。 */
export const storageService = {
  async loadSettings(): Promise<ReaderSettings> {
    if (!isDesktop()) return readLocal(LS_SETTINGS, defaultSettings)
    try {
      return { ...defaultSettings, ...(await backend.settingsGet()) }
    } catch {
      return readLocal(LS_SETTINGS, defaultSettings)
    }
  },

  async saveSettings(settings: ReaderSettings): Promise<void> {
    writeLocal(LS_SETTINGS, settings)
    if (!isDesktop()) return
    try {
      await backend.settingsSave(settings)
    } catch {
      /* 磁盘写入失败不影响当前会话 */
    }
  },

  async loadRecent(): Promise<RecentFile[]> {
    if (!isDesktop()) return readLocal<RecentFile[]>(LS_RECENT, [])
    try {
      return (await backend.recentList()) || []
    } catch {
      return []
    }
  },

  async removeRecent(path: string): Promise<RecentFile[]> {
    if (!isDesktop()) {
      const list = readLocal<RecentFile[]>(LS_RECENT, []).filter((r) => r.filePath !== path)
      writeLocal(LS_RECENT, list)
      return list
    }
    return (await backend.recentRemove(path)) || []
  },

  async saveProgress(path: string, page: number, zoom: number): Promise<void> {
    if (!isDesktop()) return
    try {
      await backend.recentUpdateProgress(path, page, zoom)
    } catch {
      /* 忽略写入失败 */
    }
  }
}
