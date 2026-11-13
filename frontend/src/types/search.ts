/** 矩形坐标基于 scale = 1 的页面视口，渲染时乘以当前 scale。 */
export interface HighlightRect {
  x: number
  y: number
  width: number
  height: number
}

export interface PageHighlight {
  rects: HighlightRect[]
  active: boolean
}

export interface SearchResult {
  pageNumber: number
  text: string
  matchIndex: number
  rects: HighlightRect[]
}

/** Worker 返回的轻量匹配结果。 */
export interface PageMatch {
  pageNumber: number
  index: number
  length: number
  context: string
}

export interface TextItemLite {
  str: string
  start: number
  transform: number[]
  width: number
  height: number
}

/** 单页文本缓存：text 用于搜索，items 用于把匹配映射到页面坐标。 */
export interface PageText {
  pageNumber: number
  text: string
  items: TextItemLite[]
  viewportTransform: number[]
  pageHeight: number
}
