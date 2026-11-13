import type { SearchResult } from './search'

export type FitMode = 'free' | 'width' | 'height' | 'page' | 'window'

export interface PageSize {
  width: number
  height: number
}

/** 目录节点：pageNumber 为 1 起始，0 表示无法解析目标。destY 为页面顶部起算的像素（scale = 1）。 */
export interface OutlineItem {
  id: string
  title: string
  pageNumber: number
  destY: number | null
  level: number
  children: OutlineItem[]
}

export type SearchStatus = 'idle' | 'running' | 'done' | 'no-text' | 'error'

/** 标签页状态，全部为可序列化纯数据，PDF.js 运行时对象不放在这里。 */
export interface PdfTab {
  id: string
  docId: string
  filePath: string
  fileName: string
  url: string
  pageCount: number
  currentPage: number
  scale: number
  fitMode: FitMode
  scrollTop: number
  outline: OutlineItem[]
  outlineExpanded: Record<string, boolean>
  searchKeyword: string
  searchCaseSensitive: boolean
  searchResults: SearchResult[]
  currentSearchIndex: number
  searchStatus: SearchStatus
  searchScanned: number
  searchTotal: number
  isLoading: boolean
  error: string
}

export interface JumpRequest {
  tabId: string
  pageNumber: number
  destY: number | null
  token: number
}
