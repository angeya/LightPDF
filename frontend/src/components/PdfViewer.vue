<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import type { JumpRequest, PageSize, PdfTab } from '../types/document'
import type { PageHighlight } from '../types/search'
import { useDocumentStore } from '../stores/documentStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useUiStore } from '../stores/uiStore'
import { getRuntime, initPageSizes } from '../services/pdfService'
import { invalidateRenders } from '../composables/usePdfRender'
import { usePdfZoom } from '../composables/usePdfZoom'
import PdfPage from './PdfPage.vue'

const props = defineProps<{ tab: PdfTab }>()
const docs = useDocumentStore()
const settings = useSettingsStore()
const ui = useUiStore()
const zoom = usePdfZoom()

const PAGE_GAP = 20
// 只预渲染紧邻可视区的页面，减少同时存在的 Canvas 数量。
const PRELOAD_MARGIN = 320

const containerRef = ref<HTMLElement | null>(null)
const sizes = ref<PageSize[]>([])
const visible = ref<Set<number>>(new Set())
const renderSet = ref<Set<number>>(new Set())
const restored = ref(false)

let observer: IntersectionObserver | null = null
let resizeObserver: ResizeObserver | null = null
let recentPages: number[] = []
let scrollFrame = 0
let pendingJumpRequest: JumpRequest | null = null

const scale = computed(() => props.tab.scale)
const pageCount = computed(() => props.tab.pageCount)
const heights = computed(() => sizes.value.map((size) => (size?.height || 842) * scale.value))
const offsets = computed(() => {
  const list: number[] = [PAGE_GAP / 2]
  for (const height of heights.value) list.push(list[list.length - 1] + height + PAGE_GAP)
  return list
})
const totalHeight = computed(() => offsets.value[offsets.value.length - 1] ?? 0)
const contentWidth = computed(() => {
  const widest = Math.max(0, ...sizes.value.map((size) => size?.width || 0))
  return Math.max(ui.viewerWidth, widest * scale.value + 48)
})

const highlightMap = computed(() => {
  const map = new Map<number, PageHighlight[]>()
  props.tab.searchResults.forEach((result, index) => {
    const list = map.get(result.pageNumber) ?? []
    list.push({ rects: result.rects, active: index === props.tab.currentSearchIndex })
    map.set(result.pageNumber, list)
  })
  return map
})

function updateRenderSet(): void {
  const next = new Set(visible.value)
  const limit = visible.value.size + 2
  for (const page of recentPages) {
    if (next.size >= limit) break
    next.add(page)
  }
  renderSet.value = next
}

function setupObserver(): void {
  const root = containerRef.value
  if (!root) return
  observer?.disconnect()
  observer = new IntersectionObserver(
    (entries) => {
      const next = new Set(visible.value)
      for (const entry of entries) {
        const page = Number((entry.target as HTMLElement).dataset.page)
        if (!page) continue
        if (entry.isIntersecting) {
          next.add(page)
          recentPages = [page, ...recentPages.filter((p) => p !== page)].slice(0, 8)
        } else {
          next.delete(page)
        }
      }
      visible.value = next
      updateRenderSet()
    },
    { root, rootMargin: `${PRELOAD_MARGIN}px 0px ${PRELOAD_MARGIN}px 0px`, threshold: 0 }
  )
  root.querySelectorAll('.page-slot').forEach((element) => observer?.observe(element))
}

function onScroll(): void {
  if (scrollFrame) return
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = 0
    const root = containerRef.value
    if (!root) return
    const top = root.scrollTop
    docs.setScrollTop(props.tab.id, top)
    const target = top + root.clientHeight * 0.3
    const list = offsets.value
    let page = 1
    for (let i = 0; i < list.length - 1; i += 1) {
      if (list[i] <= target) page = i + 1
      else break
    }
    docs.setCurrentPage(props.tab.id, Math.min(props.tab.pageCount, page))
  })
}

function scrollToJump(jump: JumpRequest): void {
  const root = containerRef.value
  if (!root || !sizes.value.length) return
  const page = Math.min(props.tab.pageCount, Math.max(1, jump.pageNumber))
  const top = (offsets.value[page - 1] ?? 0) + (jump.destY ?? 0) * scale.value - 16
  root.scrollTop = Math.max(0, top)
  pendingJumpRequest = null
  if (docs.pendingJump?.token === jump.token) docs.clearJump()
}

function onPageLinkJump(payload: { pageNumber: number; destY: number | null }): void {
  docs.requestJump(payload.pageNumber, payload.destY, props.tab.id)
}

/** 缩放时以视口中心所在页面为锚点，保持阅读位置不跳回顶部。 */
function preserveAnchor(nextScale: number, previousScale: number): void {
  const root = containerRef.value
  if (!root || !sizes.value.length || nextScale === previousScale) return
  const anchor = root.scrollTop + root.clientHeight / 2
  const oldHeights = sizes.value.map((size) => size.height * previousScale + PAGE_GAP)
  let index = 0
  let ratio = 0
  let accumulated = 0
  for (let i = 0; i < oldHeights.length; i += 1) {
    if (accumulated + oldHeights[i] >= anchor) {
      index = i
      ratio = (anchor - accumulated) / oldHeights[i]
      break
    }
    accumulated += oldHeights[i]
    index = i
  }
  void nextTick(() => {
    const el = containerRef.value
    const size = sizes.value[index]
    if (!el || !size) return
    const newHeight = size.height * nextScale + PAGE_GAP
    el.scrollTop = Math.max(0, (offsets.value[index] ?? 0) + ratio * newHeight - el.clientHeight / 2)
  })
}

watch(
  () => props.tab.scale,
  (next, previous) => {
    invalidateRenders()
    preserveAnchor(next, previous)
  }
)

watch(
  () => docs.pendingJump,
  (jump) => {
    if (!jump || jump.tabId !== props.tab.id) return
    pendingJumpRequest = jump
    if (restored.value && sizes.value.length) scrollToJump(jump)
  }
)

watch(sizes, () => {
  void nextTick(setupObserver)
})

onMounted(() => {
  const root = containerRef.value
  if (!root) return
  ui.viewerWidth = root.clientWidth
  ui.viewerHeight = root.clientHeight

  resizeObserver = new ResizeObserver(() => {
    const el = containerRef.value
    if (!el) return
    ui.viewerWidth = el.clientWidth
    ui.viewerHeight = el.clientHeight
    const mode = props.tab.fitMode
    if (mode !== 'free') {
      const size = sizes.value[Math.max(0, props.tab.currentPage - 1)] ?? sizes.value[0]
      if (size) zoom.applyFit(mode, el.clientWidth, el.clientHeight, size)
    }
  })
  resizeObserver.observe(root)

  const runtime = getRuntime(props.tab.id)
  if (!runtime) return

  const onSizes = (next: PageSize[]) => {
    sizes.value = next
    if (restored.value) return
    restored.value = true
    void nextTick(() => {
      const el = containerRef.value
      if (!el) return
      const jump = pendingJumpRequest ?? (docs.pendingJump?.tabId === props.tab.id ? docs.pendingJump : null)
      if (jump) {
        scrollToJump(jump)
      } else if (props.tab.scrollTop > 0) {
        el.scrollTop = props.tab.scrollTop
      } else if (props.tab.currentPage > 1) {
        el.scrollTop = offsets.value[props.tab.currentPage - 1] ?? 0
      }
    })
  }

  // 已解析过的文档直接复用页面尺寸，切换标签页时不重复解析。
  if (runtime.sizeReady && runtime.pageSizes.length) onSizes(runtime.pageSizes.slice())
  else void initPageSizes(runtime, onSizes).catch(() => undefined)
})

onUnmounted(() => {
  observer?.disconnect()
  observer = null
  resizeObserver?.disconnect()
  resizeObserver = null
  if (scrollFrame) cancelAnimationFrame(scrollFrame)
  invalidateRenders()
})
</script>

<template>
  <div ref="containerRef" class="pdf-viewer scrollable" @scroll.passive="onScroll">
    <div class="pdf-pages" :style="{ height: `${totalHeight}px`, minWidth: `${contentWidth}px` }">
      <div
        v-for="page in pageCount"
        :key="page"
        class="page-slot"
        :data-page="page"
        :style="{
          top: `${offsets[page - 1] ?? 0}px`,
          width: `${(sizes[page - 1]?.width || 595) * scale}px`,
          height: `${heights[page - 1] ?? 0}px`
        }"
      >
        <PdfPage
          v-if="renderSet.has(page) && sizes[page - 1]"
          :runtime-id="tab.id"
          :page-number="page"
          :scale="scale"
          :width="(sizes[page - 1]?.width || 595) * scale"
          :height="heights[page - 1] ?? 0"
          :active="visible.has(page)"
          :pdf-theme="settings.pdfTheme"
          :highlights="highlightMap.get(page) || []"
          @jump="onPageLinkJump"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.pdf-viewer {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: auto;
  background: var(--bg-reader);
}

.pdf-pages {
  position: relative;
  width: 100%;
  margin: 0 auto;
}

.page-slot {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: flex-start;
  justify-content: center;
}
</style>
