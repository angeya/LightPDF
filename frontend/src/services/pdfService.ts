import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy, type PDFPageProxy } from 'pdfjs-dist'
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker&inline'
import type { TextItem } from 'pdfjs-dist/types/src/display/api'
import type { OutlineItem, PageSize } from '../types/document'
import type { PageText, TextItemLite } from '../types/search'
import { backend } from './bridge'

// 内联 Worker 通过 blob URL 创建，避免 Wails 自定义协议下外部脚本加载受限；
// PDF 解析工作始终在独立 Worker 中进行，不占用主线程。
GlobalWorkerOptions.workerPort = new PdfWorker()

const TEXT_CACHE_LIMIT = 24

export interface LoadPdfOptions {
  id: string
  docId: string
  url: string
}

/** PDF.js 运行时对象集中保存在模块级 Map，避免进入 Vue 深度响应式系统。 */
export interface PdfRuntime {
  id: string
  docId: string
  pdf: PDFDocumentProxy
  pageCount: number
  pageSizes: PageSize[]
  measuredPages: Set<number>
  sizeReady: boolean
  textCache: Map<number, PageText>
  destroyed: boolean
}

const runtimes = new Map<string, PdfRuntime>()

export function getRuntime(id: string): PdfRuntime | undefined {
  const rt = runtimes.get(id)
  return rt && !rt.destroyed ? rt : undefined
}

/** 二维仿射矩阵相乘（与 PDF.js Util.transform 等价）。 */
export function transformMatrix(m1: number[], m2: number[]): number[] {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5]
  ]
}

function errorName(err: unknown): string {
  return String((err as { name?: string })?.name ?? '')
}

function errorMessage(err: unknown): string {
  return String((err as { message?: string })?.message ?? err ?? '')
}

export function explainPdfError(err: unknown): string {
  const name = errorName(err)
  if (name === 'PasswordException') return '该 PDF 已加密，LightPDF 暂不支持打开加密文档'
  if (name === 'InvalidPDFException') return 'PDF 文件损坏或格式不正确'
  if (name === 'MissingPDFException') return '未找到有效的 PDF 内容'
  if (name === 'UnexpectedResponseException') return '读取 PDF 失败，文件可能已被移动、删除或占用'
  const msg = errorMessage(err)
  if (/password|加密/i.test(msg)) return '该 PDF 已加密，LightPDF 暂不支持打开加密文档'
  if (/timeout|超时/i.test(msg)) return 'PDF 加载超时，请重试'
  return msg ? `打开 PDF 失败：${msg}` : '打开 PDF 失败'
}

function isTransportError(err: unknown): boolean {
  const name = errorName(err)
  const msg = errorMessage(err)
  return (
    name === 'UnexpectedResponseException' ||
    /fetch|network|range|超时|timeout|Failed to load|status/i.test(msg)
  )
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

async function loadByUrl(url: string): Promise<PDFDocumentProxy> {
  const task = getDocument({
    url,
    rangeChunkSize: 65536,
    disableAutoFetch: true,
    disableStream: true
  })
  let timer = 0
  const timeout = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => reject(new Error('PDF 加载超时')), 45000)
  })
  try {
    return await Promise.race([task.promise, timeout])
  } catch (err) {
    await task.destroy().catch(() => undefined)
    throw err
  } finally {
    window.clearTimeout(timer)
  }
}

/** 优先通过 Go 本地 HTTP Range 服务加载；服务不可达时降级为一次性字节读取。 */
export async function loadPdf(options: LoadPdfOptions): Promise<PdfRuntime> {
  let pdf: PDFDocumentProxy
  try {
    pdf = await loadByUrl(options.url)
  } catch (err) {
    if (!isTransportError(err)) throw new Error(explainPdfError(err))
    try {
      const base64 = await backend.getPdfData(options.docId)
      pdf = await getDocument({ data: base64ToBytes(base64), useSystemFonts: true }).promise
    } catch (fallbackErr) {
      throw new Error(explainPdfError(fallbackErr))
    }
  }

  const runtime: PdfRuntime = {
    id: options.id,
    docId: options.docId,
    pdf,
    pageCount: pdf.numPages,
    pageSizes: [],
    measuredPages: new Set(),
    sizeReady: false,
    textCache: new Map(),
    destroyed: false
  }
  runtimes.set(options.id, runtime)
  return runtime
}

export async function getPage(runtime: PdfRuntime, pageNumber: number): Promise<PDFPageProxy> {
  if (runtime.destroyed) throw new Error('文档已关闭')
  return runtime.pdf.getPage(pageNumber)
}

/** 用首页尺寸填充占位后立即返回；其余页只在进入可视区时按需测量，避免一次性把整本文档装入 PDF.js 页面缓存。 */
export async function initPageSizes(
  runtime: PdfRuntime,
  onUpdate: (sizes: PageSize[]) => void
): Promise<void> {
  if (runtime.destroyed || runtime.pageCount < 1) return
  const first = await getPage(runtime, 1)
  const firstViewport = first.getViewport({ scale: 1 })
  const fallback: PageSize = { width: firstViewport.width, height: firstViewport.height }
  runtime.pageSizes = Array.from({ length: runtime.pageCount }, () => ({ ...fallback }))
  runtime.measuredPages.add(1)
  runtime.sizeReady = true
  onUpdate(runtime.pageSizes.slice())
}

/** 仅测量指定页的真实尺寸，结果记入运行时缓存；绝大多数同尺寸文档无需遍历其余页面。 */
export async function getPageSize(runtime: PdfRuntime, pageNumber: number): Promise<PageSize | null> {
  if (runtime.destroyed || pageNumber < 1 || pageNumber > runtime.pageCount) return null
  if (runtime.measuredPages.has(pageNumber)) return runtime.pageSizes[pageNumber - 1]
  const page = await getPage(runtime, pageNumber)
  const viewport = page.getViewport({ scale: 1 })
  const size: PageSize = { width: viewport.width, height: viewport.height }
  runtime.pageSizes[pageNumber - 1] = size
  runtime.measuredPages.add(pageNumber)
  return size
}

/** 提取单页文本并按页缓存（有限容量 LRU），搜索不依赖 Canvas 渲染。 */
export async function getPageText(runtime: PdfRuntime, pageNumber: number): Promise<PageText> {
  const cached = runtime.textCache.get(pageNumber)
  if (cached) {
    runtime.textCache.delete(pageNumber)
    runtime.textCache.set(pageNumber, cached)
    return cached
  }
  const page = await getPage(runtime, pageNumber)
  const content = await page.getTextContent()
  const viewport = page.getViewport({ scale: 1 })

  let text = ''
  const items: TextItemLite[] = []
  for (const raw of content.items) {
    if (!('str' in raw)) continue
    const item = raw as TextItem
    const str = item.str ?? ''
    items.push({
      str,
      start: text.length,
      transform: (item.transform as number[]).slice(0, 6),
      width: item.width ?? 0,
      height: item.height ?? 0
    })
    text += str
    if (item.hasEOL) text += '\n'
  }

  const result: PageText = {
    pageNumber,
    text,
    items,
    viewportTransform: (viewport.transform as number[]).slice(0, 6),
    pageHeight: viewport.height
  }
  runtime.textCache.set(pageNumber, result)
  while (runtime.textCache.size > TEXT_CACHE_LIMIT) {
    const oldest = runtime.textCache.keys().next().value
    if (oldest === undefined) break
    runtime.textCache.delete(oldest)
  }
  return result
}

interface RawOutlineItem {
  title?: string
  dest?: string | unknown[] | null
  items?: RawOutlineItem[]
}

/** 解析 Outline 与 Link 注释共用的目标：页面索引、命名目标或页面内坐标。 */
export async function resolvePdfDestination(
  runtime: PdfRuntime,
  dest: string | unknown[] | null | undefined
): Promise<{ pageNumber: number; destY: number | null } | null> {
  if (!dest) return null
  let resolved: unknown[]
  if (typeof dest === 'string') {
    let named: unknown
    try {
      named = await runtime.pdf.getDestination(dest)
    } catch {
      return null
    }
    if (!Array.isArray(named)) return null
    resolved = named
  } else {
    resolved = dest
  }
  if (resolved.length === 0) return null

  const target = resolved[0]
  let pageIndex = -1
  if (typeof target === 'number') {
    pageIndex = target
  } else if (target && typeof target === 'object') {
    try {
      pageIndex = await runtime.pdf.getPageIndex(target as { num: number; gen: number })
    } catch {
      return null
    }
  }
  if (pageIndex < 0 || pageIndex >= runtime.pageCount) return null

  const fitName = String((resolved[1] as { name?: string } | undefined)?.name ?? '')
  let top: number | null = null
  if (fitName === 'XYZ') {
    const v = resolved[3]
    if (typeof v === 'number') top = v
  } else if (['FitH', 'FitBH', 'FitV', 'FitBV'].includes(fitName)) {
    const v = resolved[2]
    if (typeof v === 'number') top = v
  }

  let destY: number | null = null
  if (top !== null && !Number.isNaN(top)) {
    try {
      const page = await getPage(runtime, pageIndex + 1)
      const viewport = page.getViewport({ scale: 1 })
      destY = Math.max(0, Math.min(viewport.height, viewport.height - top))
    } catch {
      destY = null
    }
  }
  return { pageNumber: pageIndex + 1, destY }
}

/** 把 PDF.js Outline 转成前端树形数据，兼容命名目标与页面内坐标。 */
export async function resolveOutline(runtime: PdfRuntime): Promise<OutlineItem[]> {
  let raw: RawOutlineItem[] = []
  try {
    raw = (await runtime.pdf.getOutline()) as RawOutlineItem[]
  } catch {
    return []
  }
  if (!Array.isArray(raw)) return []

  const walk = async (items: RawOutlineItem[], level: number, prefix: string): Promise<OutlineItem[]> => {
    const result: OutlineItem[] = []
    for (let i = 0; i < items.length; i += 1) {
      if (runtime.destroyed) return result
      const item = items[i]
      const id = `${prefix}${i}`
      const target = await resolvePdfDestination(runtime, item.dest)
      const children = item.items?.length ? await walk(item.items, level + 1, `${id}-`) : []
      result.push({
        id,
        title: item.title?.trim() || `（无标题 ${i + 1}）`,
        pageNumber: target?.pageNumber ?? 0,
        destY: target?.destY ?? null,
        level,
        children
      })
    }
    return result
  }
  return walk(raw, 0, '')
}

/** 关闭标签页时销毁 PDF.js 文档并撤销后端文件授权。 */
export async function destroyRuntime(id: string): Promise<void> {
  const runtime = runtimes.get(id)
  if (!runtime) return
  runtime.destroyed = true
  runtime.textCache.clear()
  runtime.pageSizes = []
  runtimes.delete(id)
  try {
    await runtime.pdf.cleanup()
    await runtime.pdf.destroy()
  } catch {
    /* 文档可能已经被 PDF.js 自行回收 */
  }
  try {
    const app = window.go?.main?.App
    if (app?.ClosePdf) await app.ClosePdf(runtime.docId)
  } catch {
    /* 忽略退出时的清理错误 */
  }
}

export async function destroyAllRuntimes(): Promise<void> {
  await Promise.all([...runtimes.keys()].map((id) => destroyRuntime(id)))
}
