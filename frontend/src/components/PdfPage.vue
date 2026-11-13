<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { PDFPageProxy, PageViewport, RenderTask } from 'pdfjs-dist'
import type { TextItem } from 'pdfjs-dist/types/src/display/api'
import type { PageHighlight } from '../types/search'
import type { PdfTheme } from '../types/settings'
import { getPage, getRuntime, resolvePdfDestination, transformMatrix } from '../services/pdfService'
import { cancelRender, scheduleRender, type RenderSignal } from '../composables/usePdfRender'

const emit = defineEmits<{
  jump: [payload: { pageNumber: number; destY: number | null }]
}>()

const props = defineProps<{
  runtimeId: string
  pageNumber: number
  scale: number
  width: number
  height: number
  active: boolean
  pdfTheme: PdfTheme
  highlights: PageHighlight[]
}>()

interface PageLink {
  id: number
  x: number
  y: number
  width: number
  height: number
  pageNumber: number
  destY: number | null
  url: string
}

const canvasRef = ref<HTMLCanvasElement | null>(null)
const textLayerRef = ref<HTMLDivElement | null>(null)
const links = ref<PageLink[]>([])
const renderKey = computed(() => `${props.runtimeId}:${props.pageNumber}`)
let currentTask: RenderTask | null = null

/** 用 TextContent + 视口变换矩阵生成透明文本层，实现文本选择与复制。 */
async function buildTextLayer(page: PDFPageProxy, viewport: PageViewport): Promise<void> {
  const layer = textLayerRef.value
  if (!layer) return
  const content = await page.getTextContent()
  const measure = document.createElement('canvas').getContext('2d')
  const fragment = document.createDocumentFragment()

  for (const raw of content.items) {
    if (!('str' in raw)) continue
    const item = raw as TextItem
    const str = item.str ?? ''
    if (!str) continue
    const tx = transformMatrix(viewport.transform as number[], (item.transform as number[]).slice(0, 6))
    const fontHeight = Math.hypot(tx[2], tx[3]) || item.height || 12

    const span = document.createElement('span')
    span.textContent = str
    span.style.left = `${tx[4]}px`
    span.style.top = `${tx[5] - fontHeight}px`
    span.style.fontSize = `${fontHeight}px`

    let transform = ''
    if (measure && item.width > 0) {
      measure.font = `${fontHeight}px sans-serif`
      const measured = measure.measureText(str).width
      if (measured > 0) {
        const ratio = (item.width * viewport.scale) / measured
        if (Math.abs(ratio - 1) > 0.02) transform = `scaleX(${ratio})`
      }
    }
    const angle = Math.atan2(tx[1], tx[0])
    if (Math.abs(angle) > 0.01) transform += ` rotate(${angle}rad)`
    if (transform) span.style.transform = transform

    fragment.appendChild(span)
  }
  layer.replaceChildren(fragment)
}

/** 读取 Link 注释生成透明点击热区，支持 PDF 目录页跳转到对应章节。 */
async function buildLinks(page: PDFPageProxy, viewport: PageViewport): Promise<void> {
  const runtime = getRuntime(props.runtimeId)
  let annotations: Array<{
    subtype?: string
    rect?: number[] | null
    dest?: string | unknown[] | null
    url?: string
  }> = []
  try {
    annotations = (await page.getAnnotations({ intent: 'display' })) as typeof annotations
  } catch {
    links.value = []
    return
  }

  const result: PageLink[] = []
  let id = 0
  for (const annotation of annotations) {
    if (annotation.subtype !== 'Link' || !Array.isArray(annotation.rect)) continue
    const rect = annotation.rect
    if (rect.length < 4) continue
    const converted = viewport.convertToViewportRectangle(rect as [number, number, number, number]) as number[]
    const [x1, y1, x2, y2] = converted
    const target = runtime && annotation.dest
      ? await resolvePdfDestination(runtime, annotation.dest)
      : null
    result.push({
      id: id++,
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      width: Math.abs(x2 - x1),
      height: Math.abs(y2 - y1),
      pageNumber: target?.pageNumber ?? 0,
      destY: target?.destY ?? null,
      url: annotation.url || ''
    })
  }
  links.value = result
}

function onLinkClick(link: PageLink): void {
  if (link.pageNumber > 0) {
    emit('jump', { pageNumber: link.pageNumber, destY: link.destY })
  } else if (link.url) {
    window.runtime?.BrowserOpenURL?.(link.url)
  }
}

async function render(signal: RenderSignal): Promise<void> {
  const runtime = getRuntime(props.runtimeId)
  const canvas = canvasRef.value
  if (!runtime || !canvas || props.width <= 0 || props.height <= 0) return

  const page = await getPage(runtime, props.pageNumber)
  if (signal.cancelled) return

  const viewport = page.getViewport({ scale: props.scale })
  // 渲染分辨率：高分屏跟随 devicePixelRatio（上限 2 倍），普通屏至少 1.5 倍超采样，
  // 保证 100% 缩放下文字边缘平滑清晰；超过 2 倍会显著增加 Canvas 像素内存。
  const ratio = Math.min(Math.max(window.devicePixelRatio || 1, 1.5), 2)
  canvas.width = Math.max(1, Math.floor(viewport.width * ratio))
  canvas.height = Math.max(1, Math.floor(viewport.height * ratio))
  canvas.style.width = `${viewport.width}px`
  canvas.style.height = `${viewport.height}px`

  const context = canvas.getContext('2d', { alpha: false })
  if (!context) return

  const task = page.render({
    canvasContext: context,
    viewport,
    transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined,
    background: '#ffffff'
  })
  currentTask = task
  signal.onCancel(() => {
    try {
      task.cancel()
    } catch {
      /* 任务可能已结束 */
    }
  })

  try {
    await task.promise
  } catch (err) {
    if ((err as { name?: string })?.name === 'RenderingCancelledException') return
    throw err
  } finally {
    currentTask = null
  }

  if (signal.cancelled) return
  await buildTextLayer(page, viewport)
  if (signal.cancelled) return
  await buildLinks(page, viewport)
}

/** 离屏页面清空 Canvas 像素并移除文本层，释放主要内存但保留 DOM 结构避免重复创建 Canvas。 */
function release(): void {
  if (currentTask) {
    try {
      currentTask.cancel()
    } catch {
      /* 忽略 */
    }
    currentTask = null
  }
  const canvas = canvasRef.value
  if (canvas) {
    canvas.width = 1
    canvas.height = 1
    canvas.style.width = '0px'
    canvas.style.height = '0px'
  }
  textLayerRef.value?.replaceChildren()
  links.value = []
}

function trigger(): void {
  cancelRender(renderKey.value)
  if (props.active && props.width > 0 && props.height > 0) {
    void scheduleRender(renderKey.value, render).catch(() => undefined)
  } else {
    release()
  }
}

watch(() => [props.active, props.scale, props.width, props.height], trigger)
onMounted(trigger)
onUnmounted(() => {
  cancelRender(renderKey.value)
  release()
})
</script>

<template>
  <div class="pdf-page" :data-pdf-theme="pdfTheme" :style="{ width: `${width}px`, height: `${height}px` }">
    <canvas ref="canvasRef" class="pdf-canvas" :data-pdf-theme="pdfTheme"></canvas>
    <div ref="textLayerRef" class="text-layer" :style="{ width: `${width}px`, height: `${height}px` }"></div>
    <div class="highlight-layer" :style="{ width: `${width}px`, height: `${height}px` }">
      <template v-for="(group, groupIndex) in highlights" :key="groupIndex">
        <div
          v-for="(rect, rectIndex) in group.rects"
          :key="`${groupIndex}-${rectIndex}`"
          class="pdf-highlight"
          :class="{ active: group.active }"
          :style="{
            left: `${rect.x * scale}px`,
            top: `${rect.y * scale}px`,
            width: `${rect.width * scale}px`,
            height: `${rect.height * scale}px`
          }"
        ></div>
      </template>
    </div>
    <div class="link-layer" :style="{ width: `${width}px`, height: `${height}px` }">
      <a
        v-for="link in links"
        :key="link.id"
        class="pdf-link"
        :title="link.pageNumber > 0 ? `跳转到第 ${link.pageNumber} 页` : link.url || '链接'"
        :style="{
          left: `${link.x}px`,
          top: `${link.y}px`,
          width: `${link.width}px`,
          height: `${link.height}px`
        }"
        @click.prevent="onLinkClick(link)"
      ></a>
    </div>
    <span class="page-label">{{ pageNumber }}</span>
  </div>
</template>

<style scoped>
.pdf-page {
  position: relative;
  background: #ffffff;
  box-shadow: var(--page-shadow);
  overflow: hidden;
}

.pdf-canvas {
  display: block;
}

.text-layer {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 2;
  overflow: hidden;
  color: transparent;
  user-select: text;
  line-height: 1;
}

.text-layer :deep(span) {
  position: absolute;
  white-space: pre;
  color: transparent;
  transform-origin: 0% 0%;
  user-select: text;
}

.text-layer :deep(span)::selection {
  background: rgba(80, 130, 230, 0.38);
}

.highlight-layer {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 2;
  pointer-events: none;
}

/* 护眼主题用半透明色层与页面相乘：白底变为牛皮黄 / 淡绿，黑色文字保持深色。 */
.pdf-page[data-pdf-theme="sepia"]::after,
.pdf-page[data-pdf-theme="eye-green"]::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  mix-blend-mode: multiply;
}

.pdf-page[data-pdf-theme="sepia"]::after {
  background: rgba(226, 196, 137, 0.42);
}

.pdf-page[data-pdf-theme="eye-green"]::after {
  background: rgba(166, 205, 162, 0.42);
}

.link-layer {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 3;
  pointer-events: none;
}

.pdf-link {
  position: absolute;
  display: block;
  pointer-events: auto;
  cursor: pointer;
  border-radius: 2px;
}

.pdf-link:hover {
  background: rgba(56, 103, 214, 0.14);
  box-shadow: inset 0 0 0 1px rgba(56, 103, 214, 0.5);
}

.pdf-highlight {
  position: absolute;
  background: var(--highlight);
  border-radius: 2px;
}

.pdf-highlight.active {
  background: var(--highlight-active);
  box-shadow: 0 0 0 1px rgba(214, 90, 40, 0.7);
}

.page-label {
  position: absolute;
  right: 8px;
  bottom: 6px;
  font-size: 10px;
  color: rgba(90, 100, 120, 0.45);
  pointer-events: none;
}
</style>
