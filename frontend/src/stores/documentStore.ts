import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { PdfHandle } from '../types/backend'
import type { FitMode, JumpRequest, OutlineItem, PdfTab, SearchStatus } from '../types/document'
import type { SearchResult } from '../types/search'
import { destroyRuntime, touchRuntime } from '../services/pdfService'
import { storageService } from '../services/storageService'

let tabSeq = 0
let jumpSeq = 0
const progressTimers = new Map<string, number>()

export const useDocumentStore = defineStore('document', () => {
  const tabs = ref<PdfTab[]>([])
  const activeId = ref('')
  const pendingJump = ref<JumpRequest | null>(null)

  const activeTab = computed<PdfTab | null>(() => tabs.value.find((t) => t.id === activeId.value) ?? null)

  function getTab(id: string): PdfTab | undefined {
    return tabs.value.find((t) => t.id === id)
  }

  function findByPath(path: string): PdfTab | undefined {
    const key = path.replace(/\\/g, '/').toLowerCase()
    return tabs.value.find((t) => t.filePath.replace(/\\/g, '/').toLowerCase() === key)
  }

  function updateTab(id: string, patch: Partial<PdfTab>): void {
    const tab = getTab(id)
    if (tab) Object.assign(tab, patch)
  }

  function scheduleProgress(tab: PdfTab): void {
    const timer = progressTimers.get(tab.id)
    if (timer) window.clearTimeout(timer)
    progressTimers.set(
      tab.id,
      window.setTimeout(() => {
        progressTimers.delete(tab.id)
        void storageService.saveProgress(tab.filePath, tab.currentPage, tab.scale)
      }, 800)
    )
  }

  function flushProgress(tab: PdfTab): void {
    const timer = progressTimers.get(tab.id)
    if (timer) {
      window.clearTimeout(timer)
      progressTimers.delete(tab.id)
    }
    void storageService.saveProgress(tab.filePath, tab.currentPage, tab.scale)
  }

  function addTab(handle: PdfHandle, defaultZoom: number): PdfTab {
    const tab: PdfTab = {
      id: `tab-${++tabSeq}`,
      docId: handle.docId,
      filePath: handle.filePath,
      fileName: handle.fileName,
      url: handle.url,
      pageCount: 0,
      currentPage: Math.max(1, handle.lastPage || 1),
      scale: handle.zoom > 0 && handle.zoom !== 1 ? handle.zoom : defaultZoom,
      fitMode: 'free',
      scrollTop: 0,
      outline: [],
      outlineExpanded: {},
      searchKeyword: '',
      searchCaseSensitive: false,
      searchResults: [],
      currentSearchIndex: -1,
      searchStatus: 'idle',
      searchScanned: 0,
      searchTotal: 0,
      isLoading: true,
      error: ''
    }
    tabs.value.push(tab)
    return tab
  }

  function setActive(id: string): void {
    if (activeId.value === id) return
    const previous = activeTab.value
    if (previous) flushProgress(previous)
    activeId.value = id
    touchRuntime(id)
  }

  function closeTab(id: string): void {
    const index = tabs.value.findIndex((t) => t.id === id)
    if (index < 0) return
    const tab = tabs.value[index]
    flushProgress(tab)
    void destroyRuntime(id)
    tabs.value.splice(index, 1)
    if (activeId.value === id) {
      const next = tabs.value[Math.min(index, tabs.value.length - 1)]
      activeId.value = next?.id ?? ''
    }
  }

  function closeOthers(id: string): void {
    for (const tab of [...tabs.value]) {
      if (tab.id !== id) closeTab(tab.id)
    }
    activeId.value = id
  }

  function closeAll(): void {
    for (const tab of [...tabs.value]) closeTab(tab.id)
    activeId.value = ''
  }

  function setCurrentPage(id: string, page: number): void {
    const tab = getTab(id)
    if (!tab || tab.currentPage === page) return
    tab.currentPage = page
    scheduleProgress(tab)
  }

  function setScale(id: string, scale: number, fitMode: FitMode = 'free'): void {
    const tab = getTab(id)
    if (!tab) return
    tab.scale = scale
    tab.fitMode = fitMode
    scheduleProgress(tab)
  }

  function setScrollTop(id: string, top: number): void {
    const tab = getTab(id)
    if (tab) tab.scrollTop = top
  }

  function setOutline(id: string, outline: OutlineItem[]): void {
    const tab = getTab(id)
    if (!tab) return
    // 目录默认全部折叠，由用户手动展开或一键展开。
    tab.outline = outline
    tab.outlineExpanded = {}
  }

  function toggleOutlineNode(id: string, nodeId: string): void {
    const tab = getTab(id)
    if (!tab) return
    tab.outlineExpanded = { ...tab.outlineExpanded, [nodeId]: !tab.outlineExpanded[nodeId] }
  }

  function setOutlineExpandedAll(id: string, expanded: boolean): void {
    const tab = getTab(id)
    if (!tab) return
    const state: Record<string, boolean> = {}
    const walk = (nodes: OutlineItem[]) => {
      for (const node of nodes) {
        if (node.children.length) {
          state[node.id] = expanded
          walk(node.children)
        }
      }
    }
    walk(tab.outline)
    tab.outlineExpanded = state
  }

  function requestJump(pageNumber: number, destY: number | null = null, tabId = activeId.value): void {
    if (!tabId) return
    pendingJump.value = { tabId, pageNumber, destY, token: ++jumpSeq }
  }

  function clearJump(): void {
    pendingJump.value = null
  }

  function setSearchKeyword(id: string, keyword: string): void {
    updateTab(id, { searchKeyword: keyword })
  }

  function setSearchCaseSensitive(id: string, value: boolean): void {
    updateTab(id, { searchCaseSensitive: value })
  }

  function beginSearch(id: string, total: number): void {
    updateTab(id, {
      searchResults: [],
      currentSearchIndex: -1,
      searchStatus: 'running',
      searchScanned: 0,
      searchTotal: total
    })
  }

  function appendSearchResults(id: string, results: SearchResult[], scanned: number): void {
    const tab = getTab(id)
    if (!tab || tab.searchStatus !== 'running') return
    if (results.length) tab.searchResults = [...tab.searchResults, ...results]
    tab.searchScanned = scanned
  }

  function finishSearch(id: string, status: SearchStatus): void {
    const tab = getTab(id)
    if (!tab) return
    tab.searchStatus = status
    tab.searchScanned = tab.searchTotal
    if (status !== 'done') tab.currentSearchIndex = -1
  }

  function clearSearch(id: string): void {
    updateTab(id, {
      searchKeyword: '',
      searchResults: [],
      currentSearchIndex: -1,
      searchStatus: 'idle',
      searchScanned: 0,
      searchTotal: 0
    })
  }

  function setCurrentSearchIndex(id: string, index: number): void {
    updateTab(id, { currentSearchIndex: index })
  }

  function flushAllProgress(): void {
    for (const tab of tabs.value) flushProgress(tab)
  }

  return {
    tabs,
    activeId,
    activeTab,
    pendingJump,
    getTab,
    findByPath,
    updateTab,
    addTab,
    setActive,
    closeTab,
    closeOthers,
    closeAll,
    setCurrentPage,
    setScale,
    setScrollTop,
    setOutline,
    toggleOutlineNode,
    setOutlineExpandedAll,
    requestJump,
    clearJump,
    setSearchKeyword,
    setSearchCaseSensitive,
    beginSearch,
    appendSearchResults,
    finishSearch,
    clearSearch,
    setCurrentSearchIndex,
    flushAllProgress
  }
})
