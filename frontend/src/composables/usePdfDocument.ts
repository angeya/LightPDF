import type { PdfHandle, RecentFile } from '../types/backend'
import { backend, isDesktop } from '../services/bridge'
import { destroyRuntime, loadPdf, resolveOutline } from '../services/pdfService'
import { useDocumentStore } from '../stores/documentStore'
import { useRecentStore } from '../stores/recentStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useUiStore } from '../stores/uiStore'

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** 防止快速连续打开同一路径时创建重复标签页。 */
const pendingPaths = new Set<string>()

export function usePdfDocument() {
  const docs = useDocumentStore()
  const recent = useRecentStore()
  const settings = useSettingsStore()
  const ui = useUiStore()

  async function loadRuntime(tabId: string): Promise<void> {
    const tab = docs.getTab(tabId)
    if (!tab) return
    const { id, docId, url } = tab
    try {
      const runtime = await loadPdf({ id, docId, url })
      // 用户在加载过程中关闭了标签页：立即释放，避免 Worker 与文档对象泄漏。
      if (!docs.getTab(tabId)) {
        await destroyRuntime(tabId)
        return
      }
      docs.updateTab(tabId, { pageCount: runtime.pageCount, isLoading: false, error: '' })
      const outline = await resolveOutline(runtime)
      if (docs.getTab(tabId)) docs.setOutline(tabId, outline)
      const current = docs.getTab(tabId)
      if (current && current.currentPage > 1) {
        docs.requestJump(current.currentPage, null, tabId)
      }
    } catch (err) {
      if (!docs.getTab(tabId)) return
      const text = message(err)
      docs.updateTab(tabId, { isLoading: false, error: text })
      ui.notify(text, 'error')
    }
  }

  async function openPath(path: string): Promise<void> {
    if (!path) return
    const existing = docs.findByPath(path)
    if (existing) {
      docs.setActive(existing.id)
      return
    }
    const key = path.replace(/\\/g, '/').toLowerCase()
    if (pendingPaths.has(key)) return
    if (!isDesktop()) {
      ui.notify('请在 LightPDF 桌面应用中打开 PDF 文件', 'info')
      return
    }

    pendingPaths.add(key)
    try {
      let handle: PdfHandle
      try {
        handle = await backend.openPdf(path)
      } catch (err) {
        ui.notify(message(err), 'error')
        return
      }

      const tab = docs.addTab(handle, settings.defaultZoom)
      docs.setActive(tab.id)
      await recent.refresh()
      await loadRuntime(tab.id)
    } finally {
      pendingPaths.delete(key)
    }
  }

  async function openDialog(): Promise<void> {
    if (!isDesktop()) {
      ui.notify('请在 LightPDF 桌面应用中使用文件选择窗口', 'info')
      return
    }
    try {
      const path = await backend.openPdfDialog()
      if (path) await openPath(path)
    } catch (err) {
      ui.notify(message(err), 'error')
    }
  }

  async function openPaths(paths: string[]): Promise<void> {
    for (const path of paths) {
      if (!/\.pdf$/i.test(path)) continue
      await openPath(path)
    }
  }

  async function openRecent(record: RecentFile): Promise<void> {
    if (isDesktop()) {
      try {
        const exists = await backend.fileExists(record.filePath)
        if (!exists) {
          ui.notify(`文件已移动或删除：${record.fileName}`, 'error')
          return
        }
      } catch {
        /* 检测失败时仍尝试打开，由后端给出明确错误 */
      }
    }
    await openPath(record.filePath)
  }

  return { openPath, openDialog, openPaths, openRecent, loadRuntime }
}
