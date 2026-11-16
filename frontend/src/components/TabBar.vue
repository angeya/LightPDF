<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import type { PdfTab } from '../types/document'
import Icon from './Icon.vue'
import RecentMenu from './RecentMenu.vue'
import SettingsMenu from './SettingsMenu.vue'

defineProps<{ tabs: PdfTab[]; activeId: string }>()
const emit = defineEmits<{
  select: [id: string]
  close: [id: string]
  closeOthers: [id: string]
  closeAll: []
  open: []
}>()

const menu = ref<{ x: number; y: number; tabId: string } | null>(null)
const scroller = ref<HTMLElement | null>(null)

function openMenu(event: MouseEvent, tab: PdfTab): void {
  event.preventDefault()
  menu.value = { x: event.clientX, y: event.clientY, tabId: tab.id }
}

function onDocumentClick(): void {
  menu.value = null
}

function onTabMouseDown(event: MouseEvent, tab: PdfTab): void {
  if (event.button !== 1) return
  event.preventDefault()
  emit('close', tab.id)
}

function onWheel(event: WheelEvent): void {
  if (!scroller.value) return
  if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
    scroller.value.scrollLeft += event.deltaY
    event.preventDefault()
  }
}

onMounted(() => document.addEventListener('click', onDocumentClick))
onUnmounted(() => document.removeEventListener('click', onDocumentClick))
</script>

<template>
  <div class="tabbar">
    <div ref="scroller" class="tab-scroller" @wheel="onWheel">
      <div
        v-for="tab in tabs"
        :key="tab.id"
        class="tab"
        :class="{ active: tab.id === activeId }"
        :title="tab.filePath"
        @mousedown="onTabMouseDown($event, tab)"
        @click="emit('select', tab.id)"
        @contextmenu="openMenu($event, tab)"
      >
        <span class="tab-icon"><Icon name="file" :size="13" /></span>
        <span class="tab-name">{{ tab.fileName }}</span>
        <span v-if="tab.isLoading" class="tab-loading" title="正在加载"></span>
        <button class="tab-close" title="关闭标签页" @click.stop="emit('close', tab.id)">
          <Icon name="close" :size="12" />
        </button>
      </div>
    </div>
    <RecentMenu />
    <SettingsMenu />
    <button class="icon-btn tab-add" title="打开 PDF" @click="emit('open')">
      <Icon name="plus" :size="16" />
    </button>

    <div
      v-if="menu"
      class="tab-menu"
      :style="{ left: `${menu.x}px`, top: `${menu.y}px` }"
      @click.stop
    >
      <button @click="emit('close', menu.tabId); menu = null">关闭当前</button>
      <button @click="emit('closeOthers', menu.tabId); menu = null">关闭其他</button>
      <button @click="emit('closeAll'); menu = null">关闭全部</button>
    </div>
  </div>
</template>

<style scoped>
.tabbar {
  height: var(--tabbar-h);
  flex: none;
  display: flex;
  align-items: stretch;
  background: var(--bg-subtle);
  border-bottom: 1px solid var(--border);
}

.tab-scroller {
  display: flex;
  align-items: stretch;
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
}

.tab-scroller::-webkit-scrollbar {
  height: 3px;
}

.tab-scroller::-webkit-scrollbar-thumb {
  background: var(--border-strong);
}

.tab {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 118px;
  max-width: 210px;
  flex: none;
  padding: 0 5px 0 9px;
  border-right: 1px solid var(--border);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 12px;
  transition: background var(--transition);
}

.tab:hover {
  background: var(--bg-hover);
}

.tab.active {
  background: var(--bg-panel);
  color: var(--text);
  box-shadow: inset 0 2px 0 var(--accent);
  font-weight: 500;
}

.tab-icon {
  color: var(--accent);
  flex: none;
  display: flex;
}

.tab-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tab-loading {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent);
  opacity: 0.6;
  animation: pulse 1.1s ease-in-out infinite;
  flex: none;
}

@keyframes pulse {
  50% { opacity: 0.15; }
}

.tab-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 4px;
  color: var(--text-muted);
  flex: none;
}

.tab-close:hover {
  background: var(--border);
  color: var(--text);
}

.tab-add {
  align-self: center;
  margin: 0 6px;
  flex: none;
}

.tab-menu {
  position: fixed;
  z-index: 100;
  min-width: 132px;
  padding: 5px;
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
}

.tab-menu button {
  display: block;
  width: 100%;
  padding: 7px 10px;
  text-align: left;
  border-radius: var(--radius-sm);
  font-size: 12.5px;
}

.tab-menu button:hover {
  background: var(--bg-hover);
}
</style>
