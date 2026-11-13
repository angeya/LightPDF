<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { FitMode } from '../types/document'
import { UI_THEME_LABELS, type ThemeOption, type UITheme } from '../types/settings'
import { useDocumentStore } from '../stores/documentStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useUiStore } from '../stores/uiStore'
import { usePdfDocument } from '../composables/usePdfDocument'
import { usePdfZoom } from '../composables/usePdfZoom'
import { getRuntime } from '../services/pdfService'
import Icon from './Icon.vue'
import ZoomControl from './ZoomControl.vue'
import ThemeMenu from './ThemeMenu.vue'

const docs = useDocumentStore()
const settings = useSettingsStore()
const ui = useUiStore()
const { openDialog } = usePdfDocument()
const zoom = usePdfZoom()

const tab = computed(() => docs.activeTab)
const pageDraft = ref('1')
const disabled = computed(() => !tab.value || tab.value.pageCount === 0)

const uiThemeOptions: ThemeOption[] = [
  { value: 'light', label: UI_THEME_LABELS.light, icon: 'sun' },
  { value: 'dark', label: UI_THEME_LABELS.dark, icon: 'moon' },
  { value: 'system', label: UI_THEME_LABELS.system, icon: 'monitor' }
]

const uiThemeValue = computed({
  get: () => settings.uiTheme,
  set: (value: string) => {
    settings.uiTheme = value as UITheme
  }
})

watch(
  () => tab.value?.currentPage,
  (page) => {
    pageDraft.value = String(page ?? 1)
  },
  { immediate: true }
)

function toggleOutline(): void {
  settings.sidebarExpanded = !settings.sidebarExpanded
}

function gotoPage(): void {
  const current = tab.value
  if (!current || !current.pageCount) return
  const value = Number(pageDraft.value)
  if (Number.isFinite(value) && value >= 1) {
    docs.requestJump(Math.min(current.pageCount, Math.floor(value)))
  } else {
    pageDraft.value = String(current.currentPage)
  }
}

function stepPage(delta: number): void {
  const current = tab.value
  if (!current || !current.pageCount) return
  docs.requestJump(Math.min(current.pageCount, Math.max(1, current.currentPage + delta)))
}

function fit(mode: Exclude<FitMode, 'free'>): void {
  const current = tab.value
  if (!current) return
  const runtime = getRuntime(current.id)
  const size = runtime?.pageSizes[Math.max(0, current.currentPage - 1)] ?? runtime?.pageSizes[0]
  if (!size) return
  zoom.applyFit(mode, ui.viewerWidth, ui.viewerHeight, size)
}
</script>

<template>
  <div class="toolbar">
    <button class="icon-btn" title="打开 PDF (Ctrl + O)" @click="openDialog()"><Icon name="folder" :size="16" /></button>
    <div class="divider"></div>
    <button
      class="icon-btn"
      :class="{ 'is-active': settings.sidebarExpanded }"
      title="显示 / 隐藏目录"
      @click="toggleOutline"
    ><Icon name="outline" :size="16" /></button>
    <div class="divider"></div>
    <button class="icon-btn" :disabled="disabled" title="上一页 (PageUp)" @click="stepPage(-1)"><Icon name="left" :size="16" /></button>
    <div class="page-nav">
      <input v-model="pageDraft" :disabled="disabled" aria-label="页码" @keydown.enter="gotoPage" @blur="gotoPage" />
      <span>/ {{ tab?.pageCount || 0 }}</span>
    </div>
    <button class="icon-btn" :disabled="disabled" title="下一页 (PageDown)" @click="stepPage(1)"><Icon name="right" :size="16" /></button>

    <div class="spacer"></div>

    <ZoomControl
      :scale="tab?.scale ?? 1"
      :fit-mode="tab?.fitMode ?? 'free'"
      @zoom-in="zoom.zoomIn()"
      @zoom-out="zoom.zoomOut()"
      @reset="zoom.zoomReset()"
      @custom="zoom.setCustomScale"
      @fit="fit"
    >
      <div class="divider"></div>
      <button class="icon-btn" title="查找 (Ctrl + F)" @click="ui.openFind()"><Icon name="search" :size="16" /></button>
    </ZoomControl>
    <div class="divider"></div>

    <ThemeMenu v-model="uiThemeValue" :options="uiThemeOptions" title="界面主题" placement="down" />
  </div>
</template>

<style scoped>
.toolbar {
  height: var(--toolbar-h);
  flex: none;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 10px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-panel);
}

.page-nav {
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--text-secondary);
  font-size: 12px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.page-nav input {
  width: 46px;
  padding: 4px 5px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
</style>
