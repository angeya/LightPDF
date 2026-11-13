import SearchWorker from '../workers/search.worker.ts?worker&inline'
import type { HighlightRect, PageMatch, PageText, SearchResult } from '../types/search'
import { getPageText, getRuntime, transformMatrix } from './pdfService'

interface WorkerRequest {
  id: number
  keyword: string
  caseSensitive: boolean
  pages: Array<{ pageNumber: number; text: string }>
}

interface WorkerResponse {
  id: number
  matches: PageMatch[]
  textLength: number
}

let worker: Worker | null = null
let sequence = 0
const waiting = new Map<number, (value: WorkerResponse) => void>()

function ensureWorker(): Worker {
  if (!worker) {
    worker = new SearchWorker()
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const resolve = waiting.get(event.data.id)
      if (resolve) {
        waiting.delete(event.data.id)
        resolve(event.data)
      }
    }
    worker.onerror = () => {
      waiting.clear()
    }
  }
  return worker
}

function matchBatch(request: Omit<WorkerRequest, 'id'>): Promise<WorkerResponse> {
  return new Promise((resolve) => {
    const id = ++sequence
    waiting.set(id, resolve)
    ensureWorker().postMessage({ ...request, id })
    // Worker 异常时不应让搜索永久挂起。
    window.setTimeout(() => {
      if (waiting.has(id)) {
        waiting.delete(id)
        resolve({ id, matches: [], textLength: 0 })
      }
    }, 10000)
  })
}

/** 把页内字符区间映射为页面坐标矩形（scale = 1 的 CSS 像素）。 */
export function rectsForMatch(page: PageText, index: number, length: number): HighlightRect[] {
  const rects: HighlightRect[] = []
  const end = index + length
  const scaleX = Math.abs(page.viewportTransform[0]) || 1

  for (const item of page.items) {
    if (!item.str) continue
    const itemEnd = item.start + item.str.length
    if (itemEnd <= index || item.start >= end) continue

    const localStart = Math.max(0, index - item.start)
    const localEnd = Math.min(item.str.length, end - item.start)
    const tx = transformMatrix(page.viewportTransform, item.transform)
    const fontHeight = Math.hypot(tx[2], tx[3]) || item.height || 12
    const width = (item.width || fontHeight * item.str.length * 0.5) * scaleX
    const ratioStart = localStart / item.str.length
    const ratioLength = (localEnd - localStart) / item.str.length

    rects.push({
      x: tx[4] + width * ratioStart,
      y: tx[5] - fontHeight,
      width: Math.max(1, width * ratioLength),
      height: fontHeight
    })
  }
  return rects
}

export type SearchDoneStatus = 'done' | 'no-text' | 'cancelled' | 'error'

export interface SearchOptions {
  runtimeId: string
  keyword: string
  caseSensitive: boolean
  onBatch: (results: SearchResult[], scanned: number, total: number) => void
  onDone: (status: SearchDoneStatus, message?: string) => void
}

export interface SearchController {
  cancel: () => void
}

const BATCH_SIZE = 2

/** 逐页提取文本、分批交给 Worker 匹配，支持取消并持续上报进度。 */
export function startSearch(options: SearchOptions): SearchController {
  let cancelled = false
  const runtime = getRuntime(options.runtimeId)

  if (!runtime) {
    options.onDone('error', '文档已关闭')
    return { cancel: () => undefined }
  }

  void (async () => {
    let totalTextLength = 0
    for (let start = 1; start <= runtime.pageCount; start += BATCH_SIZE) {
      if (cancelled || runtime.destroyed) {
        options.onDone('cancelled')
        return
      }
      const end = Math.min(runtime.pageCount, start + BATCH_SIZE - 1)
      const pageNumbers: number[] = []
      for (let n = start; n <= end; n += 1) pageNumbers.push(n)

      const pages = await Promise.all(
        pageNumbers.map(async (n) => {
          try {
            return await getPageText(runtime, n)
          } catch {
            return null
          }
        })
      )
      if (cancelled || runtime.destroyed) {
        options.onDone('cancelled')
        return
      }

      const validPages = pages.filter((p): p is PageText => p !== null)
      const byNumber = new Map<number, PageText>()
      for (const page of validPages) {
        totalTextLength += page.text.length
        byNumber.set(page.pageNumber, page)
      }

      const response = await matchBatch({
        keyword: options.keyword,
        caseSensitive: options.caseSensitive,
        pages: validPages.map((p) => ({ pageNumber: p.pageNumber, text: p.text }))
      })
      if (cancelled || runtime.destroyed) {
        options.onDone('cancelled')
        return
      }

      const results: SearchResult[] = response.matches.map((match, i) => {
        const page = byNumber.get(match.pageNumber)
        return {
          pageNumber: match.pageNumber,
          text: match.context,
          matchIndex: i,
          rects: page ? rectsForMatch(page, match.index, match.length) : []
        }
      })
      options.onBatch(results, end, runtime.pageCount)
    }
    options.onDone(totalTextLength === 0 ? 'no-text' : 'done')
  })().catch((err: unknown) => {
    options.onDone('error', err instanceof Error ? err.message : '搜索过程发生错误')
  })

  return {
    cancel: () => {
      cancelled = true
    }
  }
}

export function disposeSearchWorker(): void {
  worker?.terminate()
  worker = null
  waiting.clear()
}
