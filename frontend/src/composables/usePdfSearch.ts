import { startSearch, type SearchController } from '../services/searchService'
import { useDocumentStore } from '../stores/documentStore'
import { useUiStore } from '../stores/uiStore'

let controller: SearchController | null = null
let debounceTimer = 0
let autoJumped = false

/** 全局停止搜索，供切换/关闭文档时调用。 */
export function stopSearch(): void {
  if (debounceTimer) window.clearTimeout(debounceTimer)
  debounceTimer = 0
  controller?.cancel()
  controller = null
}

export function usePdfSearch() {
  const docs = useDocumentStore()
  const ui = useUiStore()

  function gotoResult(index: number, tabId = docs.activeId): void {
    const tab = docs.getTab(tabId)
    if (!tab) return
    const result = tab.searchResults[index]
    if (!result) return
    docs.setCurrentSearchIndex(tabId, index)
    const rect = result.rects[0]
    docs.requestJump(result.pageNumber, rect ? Math.max(0, rect.y - 60) : null, tabId)
  }

  function run(keyword: string, caseSensitive: boolean): void {
    stopSearch()
    const tab = docs.activeTab
    if (!tab) return
    if (!keyword.trim()) {
      docs.clearSearch(tab.id)
      return
    }
    if (tab.isLoading || tab.pageCount === 0) {
      ui.notify('PDF 仍在加载，请稍后再搜索', 'info')
      return
    }

    const tabId = tab.id
    autoJumped = false
    docs.beginSearch(tabId, tab.pageCount)

    controller = startSearch({
      runtimeId: tabId,
      keyword: keyword.trim(),
      caseSensitive,
      onBatch: (results, scanned, total) => {
        const current = docs.getTab(tabId)
        if (!current || current.searchKeyword !== keyword || current.searchStatus !== 'running') return
        current.searchTotal = total
        docs.appendSearchResults(tabId, results, scanned)
        if (!autoJumped && current.searchResults.length > 0) {
          autoJumped = true
          gotoResult(0, tabId)
        }
      },
      onDone: (status, message) => {
        const current = docs.getTab(tabId)
        if (!current || current.searchKeyword !== keyword) return
        docs.finishSearch(tabId, status === 'cancelled' ? 'idle' : status)
        if (status === 'no-text') ui.notify('当前 PDF 不包含可搜索文本。', 'info')
        else if (status === 'error' && message) ui.notify(message, 'error')
      }
    })
  }

  /** 输入停止 300ms 后再触发全文搜索。 */
  function scheduleSearch(keyword: string, caseSensitive: boolean): void {
    if (debounceTimer) window.clearTimeout(debounceTimer)
    debounceTimer = window.setTimeout(() => {
      debounceTimer = 0
      run(keyword, caseSensitive)
    }, 300)
  }

  function next(): void {
    const tab = docs.activeTab
    if (!tab || !tab.searchResults.length) return
    const index = (tab.currentSearchIndex + 1) % tab.searchResults.length
    gotoResult(index)
  }

  function previous(): void {
    const tab = docs.activeTab
    if (!tab || !tab.searchResults.length) return
    const index = (tab.currentSearchIndex - 1 + tab.searchResults.length) % tab.searchResults.length
    gotoResult(index)
  }

  function clear(): void {
    stopSearch()
    if (docs.activeId) docs.clearSearch(docs.activeId)
  }

  return { run, scheduleSearch, next, previous, gotoResult, clear, stop: stopSearch }
}
