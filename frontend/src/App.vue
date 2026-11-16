<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from 'vue'
import TitleBar from './components/TitleBar.vue'
import TabBar from './components/TabBar.vue'
import Toolbar from './components/Toolbar.vue'
import Sidebar from './components/Sidebar.vue'
import PdfViewer from './components/PdfViewer.vue'
import Welcome from './components/Welcome.vue'
import Toast from './components/Toast.vue'
import FindBar from './components/FindBar.vue'
import ThemeMenu from './components/ThemeMenu.vue'
import { PDF_THEME_LABELS, type PdfTheme, type ThemeOption } from './types/settings'
import { useDocumentStore } from './stores/documentStore'
import { useSettingsStore } from './stores/settingsStore'
import { useRecentStore } from './stores/recentStore'
import { useUiStore } from './stores/uiStore'
import { usePdfDocument } from './composables/usePdfDocument'
import { usePdfZoom } from './composables/usePdfZoom'
import { stopSearch } from './composables/usePdfSearch'
import { usePdfTheme } from './composables/usePdfTheme'
import { useShortcuts } from './composables/useShortcuts'
import { invalidateRenders } from './composables/usePdfRender'
import { backend } from './services/bridge'
import { destroyAllRuntimes, startIdleCleanup } from './services/pdfService'
import { disposeSearchWorker } from './services/searchService'

const docs = useDocumentStore()
const settings = useSettingsStore()
const recent = useRecentStore()
const ui = useUiStore()
const { openDialog, openPaths, openRecent } = usePdfDocument()
const zoom = usePdfZoom()

const pdfThemeOptions: ThemeOption[] = [
  { value: 'original', label: PDF_THEME_LABELS.original, icon: 'sun' },
  { value: 'dark-invert', label: PDF_THEME_LABELS['dark-invert'], icon: 'moon' },
  { value: 'dark-gray', label: PDF_THEME_LABELS['dark-gray'], icon: 'layers' },
  { value: 'sepia', label: PDF_THEME_LABELS.sepia, icon: 'file' },
  { value: 'eye-green', label: PDF_THEME_LABELS['eye-green'], icon: 'leaf' }
]

const pdfThemeValue = computed({
  get: () => settings.pdfTheme,
  set: (value: string) => {
    settings.pdfTheme = value as PdfTheme
  }
})

usePdfTheme()

let stopIdleCleanup: (() => void) | null = null

const activeTab = computed(() => docs.activeTab)
const showViewer = computed(
  () => !!activeTab.value && !activeTab.value.isLoading && !activeTab.value.error && activeTab.value.pageCount > 0
)
const showLoading = computed(() => !!activeTab.value && activeTab.value.isLoading)
const showError = computed(() => !!activeTab.value && !!activeTab.value.error)
const zoomPercent = computed(() => Math.round((activeTab.value?.scale ?? 1) * 100))

function cleanup(): void {
  docs.flushAllProgress()
  stopSearch()
  disposeSearchWorker()
  void destroyAllRuntimes()
}

onMounted(async () => {
  await settings.load()
  await recent.load()

  try {
    const args = await backend.startupArgs()
    if (args?.length) await openPaths(args)
  } catch {
    /* 非桌面环境下忽略启动参数 */
  }

  window.runtime?.OnFileDrop?.((_x, _y, paths) => {
    if (paths?.length) void openPaths(paths)
  }, false)

  // 单实例锁：文件关联双击/右键打开的文件路径由第一个实例接收。
  window.runtime?.EventsOn?.('lightpdf:open-files', (...args: unknown[]) => {
    const paths = args[0]
    if (Array.isArray(paths) && paths.length) void openPaths(paths as string[])
  })

  stopIdleCleanup = startIdleCleanup(() => docs.activeId)
  window.addEventListener('beforeunload', cleanup)
})

onUnmounted(() => {
  stopIdleCleanup?.()
  stopIdleCleanup = null
  window.removeEventListener('beforeunload', cleanup)
})

watch(
  () => docs.activeId,
  (_nextId, previousId) => {
    if (previousId && previousId !== _nextId) {
      stopSearch()
      const previous = docs.getTab(previousId)
      if (previous?.searchStatus === 'running') docs.finishSearch(previousId, 'idle')
    }
    // 切换标签页时暂停非激活文档的渲染任务，旧 Canvas 随组件卸载释放。
    invalidateRenders()
  }
)

function switchTab(offset: number): void {
  if (!docs.tabs.length) return
  const current = docs.tabs.findIndex((tab) => tab.id === docs.activeId)
  const next = (current + offset + docs.tabs.length) % docs.tabs.length
  docs.setActive(docs.tabs[next].id)
}

function jumpBy(delta: number): void {
  const tab = docs.activeTab
  if (!tab || !tab.pageCount) return
  docs.requestJump(Math.min(tab.pageCount, Math.max(1, tab.currentPage + delta)))
}

function onEscape(): void {
  if (ui.findOpen) ui.closeFind()
}

useShortcuts({
  open: () => void openDialog(),
  search: () => {
    if (docs.activeTab) ui.openFind()
  },
  closeTab: () => {
    if (docs.activeId) docs.closeTab(docs.activeId)
  },
  nextTab: () => switchTab(1),
  previousTab: () => switchTab(-1),
  selectTab: (index) => {
    const tab = docs.tabs[index]
    if (tab) docs.setActive(tab.id)
  },
  zoomIn: zoom.zoomIn,
  zoomOut: zoom.zoomOut,
  zoomReset: zoom.zoomReset,
  firstPage: () => docs.requestJump(1),
  lastPage: () => {
    const tab = docs.activeTab
    if (tab) docs.requestJump(tab.pageCount)
  },
  previousPage: () => jumpBy(-1),
  nextPage: () => jumpBy(1),
  escape: onEscape
})
</script>

<template>
  <div class="app-shell">
    <TitleBar />
    <TabBar
      :tabs="docs.tabs"
      :active-id="docs.activeId"
      @select="docs.setActive"
      @close="docs.closeTab"
      @close-others="docs.closeOthers"
      @close-all="docs.closeAll"
      @open="openDialog()"
    />

    <Toolbar v-if="activeTab" />

    <div class="main-area">
      <Sidebar v-if="activeTab" />
      <main class="reader-area">
        <FindBar v-if="activeTab" />
        <PdfViewer v-if="showViewer" :key="activeTab!.id" :tab="activeTab!" />

        <div v-else-if="showLoading" class="state-panel">
          <div class="loading-spinner"></div>
          <p>正在打开 PDF…</p>
          <span>{{ activeTab?.fileName }}</span>
        </div>

        <div v-else-if="showError" class="state-panel is-error">
          <p>无法打开该 PDF</p>
          <span>{{ activeTab?.error }}</span>
          <button class="plain-btn" @click="openDialog()">重新选择文件</button>
        </div>

        <Welcome
          v-else
          :recent="recent.items"
          @open="openDialog()"
          @open-recent="openRecent"
          @remove-recent="(record) => recent.remove(record.filePath)"
        />
      </main>
    </div>

    <footer class="status-bar">
      <span class="status-file">{{ activeTab?.fileName || '就绪' }}</span>
      <div class="spacer"></div>
      <span v-if="activeTab && activeTab.searchStatus === 'running'" class="status-accent">
        搜索中 {{ activeTab.searchScanned }} / {{ activeTab.searchTotal }} 页
      </span>
      <span v-if="activeTab">第 {{ activeTab.currentPage }} / {{ activeTab.pageCount }} 页</span>
      <span>{{ zoomPercent }}% 缩放</span>
      <div class="status-sep"></div>
      <ThemeMenu
        v-model="pdfThemeValue"
        :options="pdfThemeOptions"
        title="PDF 页面主题"
        placement="up"
        compact
      />
    </footer>

    <Toast />
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: var(--bg-app);
}

.main-area {
  display: flex;
  flex: 1;
  min-height: 0;
}

.reader-area {
  position: relative;
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
}

.state-panel {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-secondary);
  background: var(--bg-app);
}

.state-panel p {
  margin: 0;
  font-size: 15px;
  color: var(--text);
}

.state-panel span {
  max-width: 520px;
  text-align: center;
  line-height: 1.6;
  color: var(--text-muted);
  word-break: break-word;
}

.state-panel.is-error p {
  color: var(--danger);
}

.loading-spinner {
  width: 26px;
  height: 26px;
  border: 2px solid var(--border-strong);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.status-bar {
  position: relative;
  z-index: 5;
  height: var(--statusbar-h);
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 12px;
  border-top: 1px solid var(--border);
  background: var(--bg-panel);
  color: var(--text-muted);
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
}

.status-sep {
  width: 1px;
  height: 13px;
  background: var(--border-strong);
  flex: none;
}

.status-file {
  max-width: 45%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-accent {
  color: var(--accent);
}
</style>
