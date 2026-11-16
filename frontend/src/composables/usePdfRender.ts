export interface RenderSignal {
  cancelled: boolean
  onCancel: (fn: () => void) => void
}

interface RenderJob {
  key: string
  generation: number
  factory: (signal: RenderSignal) => Promise<void>
  resolve: () => void
  reject: (err: unknown) => void
}

// 图片型 PDF 单页 Canvas 像素开销很大，降低并发以削平快速滚动时的内存峰值。
const MAX_CONCURRENT = 2
let generation = 0
let running = 0
const queue: RenderJob[] = []
const cancellers = new Map<string, () => void>()

function pump(): void {
  while (running < MAX_CONCURRENT && queue.length > 0) {
    const job = queue.shift()!
    if (job.generation !== generation) {
      job.resolve()
      continue
    }
    running += 1
    const cancelFns: Array<() => void> = []
    const signal: RenderSignal = {
      cancelled: false,
      onCancel: (fn) => cancelFns.push(fn)
    }
    cancellers.set(job.key, () => {
      signal.cancelled = true
      for (const fn of cancelFns) {
        try {
          fn()
        } catch {
          /* 渲染任务可能已经结束 */
        }
      }
    })
    void job
      .factory(signal)
      .catch(job.reject)
      .finally(() => {
        running -= 1
        cancellers.delete(job.key)
        job.resolve()
        pump()
      })
  }
}

/** 统一渲染调度器：限制并发、合并同一页面的重复任务、取消过期渲染。 */
export function scheduleRender(key: string, factory: (signal: RenderSignal) => Promise<void>): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const existing = queue.findIndex((job) => job.key === key)
    if (existing >= 0) {
      const old = queue.splice(existing, 1)[0]
      old.resolve()
    }
    queue.push({ key, generation, factory, resolve, reject })
    pump()
  })
}

/** 缩放、切换标签页、关闭文档时调用，使所有在途渲染任务失效。 */
export function invalidateRenders(): void {
  generation += 1
  queue.length = 0
  for (const cancel of cancellers.values()) cancel()
  cancellers.clear()
}

export function cancelRender(key: string): void {
  cancellers.get(key)?.()
  const index = queue.findIndex((job) => job.key === key)
  if (index >= 0) queue.splice(index, 1)[0].resolve()
}

/** 关闭 / 清理文档时取消该文档全部在途任务，避免渲染任务持有已销毁文档的页面与 Canvas。 */
export function cancelRendersForRuntime(runtimeId: string): void {
  const prefix = `${runtimeId}:`
  for (const [key, cancel] of [...cancellers]) {
    if (key.startsWith(prefix)) cancel()
  }
  for (let i = queue.length - 1; i >= 0; i -= 1) {
    if (queue[i].key.startsWith(prefix)) queue.splice(i, 1)[0].resolve()
  }
}
