<script setup lang="ts">
import { computed, ref } from 'vue'
import { useDocumentStore } from '../stores/documentStore'
import { useSettingsStore } from '../stores/settingsStore'
import { usePdfOutline } from '../composables/usePdfOutline'
import Icon from './Icon.vue'
import OutlineTree from './OutlineTree.vue'

const docs = useDocumentStore()
const settings = useSettingsStore()
const { activeOutlineId, jumpTo } = usePdfOutline()

const tab = computed(() => docs.activeTab)
const dragging = ref(false)
const dragWidth = ref(260)
const currentWidth = computed(() => (dragging.value ? dragWidth.value : settings.sidebarWidth))

function expandAll(expanded: boolean): void {
  const id = tab.value?.id
  if (id) docs.setOutlineExpandedAll(id, expanded)
}

function startDrag(event: MouseEvent): void {
  dragging.value = true
  dragWidth.value = settings.sidebarWidth
  const startX = event.clientX
  const startWidth = settings.sidebarWidth

  const onMove = (moveEvent: MouseEvent) => {
    dragWidth.value = Math.min(520, Math.max(190, startWidth + moveEvent.clientX - startX))
  }
  const onUp = () => {
    dragging.value = false
    settings.sidebarWidth = Math.min(520, Math.max(190, dragWidth.value))
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }

  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}
</script>

<template>
  <aside v-if="settings.sidebarExpanded" class="sidebar" :style="{ width: `${currentWidth}px` }">
    <div class="sidebar-head">
      <Icon name="outline" :size="14" />
      <span class="sidebar-title">目录</span>
      <div class="spacer"></div>
      <button class="icon-btn" title="全部展开" @click="expandAll(true)"><Icon name="expand-all" :size="14" /></button>
      <button class="icon-btn" title="全部收缩" @click="expandAll(false)"><Icon name="collapse-all" :size="14" /></button>
    </div>

    <div class="sidebar-body scrollable">
      <OutlineTree
        v-if="tab?.outline.length"
        :nodes="tab.outline"
        :expanded="tab.outlineExpanded"
        :active-id="activeOutlineId"
        @toggle="(id) => docs.toggleOutlineNode(tab?.id ?? '', id)"
        @jump="jumpTo"
      />
      <div v-else class="empty-hint">
        {{ tab?.isLoading ? '正在读取目录…' : '当前 PDF 没有可用的目录' }}
      </div>
    </div>

    <div class="sidebar-resizer" title="拖动调整宽度" @mousedown.prevent="startDrag"></div>
  </aside>
</template>

<style scoped>
.sidebar {
  position: relative;
  flex: none;
  display: flex;
  flex-direction: column;
  min-width: var(--sidebar-min);
  max-width: var(--sidebar-max);
  border-right: 1px solid var(--border);
  background: var(--bg-panel);
  overflow: hidden;
}

.sidebar-head {
  height: 34px;
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 6px 0 11px;
  border-bottom: 1px solid var(--border);
  color: var(--text-secondary);
}

.sidebar-title {
  font-size: 12.5px;
  font-weight: 600;
}

.sidebar-body {
  flex: 1;
  min-height: 0;
  padding: 6px 5px 12px;
}

.sidebar-resizer {
  position: absolute;
  top: 0;
  right: 0;
  width: 5px;
  height: 100%;
  cursor: col-resize;
  z-index: 5;
}

.sidebar-resizer:hover {
  background: var(--accent-soft);
}
</style>
