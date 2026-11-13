<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { RecentFile } from '../types/backend'
import { useRecentStore } from '../stores/recentStore'
import { usePdfDocument } from '../composables/usePdfDocument'
import { formatRecentTime } from '../utils/format'
import Icon from './Icon.vue'

const recent = useRecentStore()
const { openRecent } = usePdfDocument()

const root = ref<HTMLElement | null>(null)
const open = ref(false)
const items = computed(() => recent.items)

function toggle(): void {
  open.value = !open.value
}

function openFile(record: RecentFile): void {
  open.value = false
  void openRecent(record)
}

function removeRecord(record: RecentFile): void {
  void recent.remove(record.filePath)
}

function onDocumentClick(event: MouseEvent): void {
  if (root.value && !root.value.contains(event.target as Node)) open.value = false
}

onMounted(() => document.addEventListener('click', onDocumentClick))
onUnmounted(() => document.removeEventListener('click', onDocumentClick))
</script>

<template>
  <div ref="root" class="recent-root">
    <button
      class="icon-btn recent-trigger"
      :class="{ 'is-active': open }"
      title="最近打开"
      @click.stop="toggle"
    >
      <Icon name="clock" :size="16" />
    </button>

    <div v-if="open" class="recent-panel">
      <div class="recent-panel-head">
        <span>最近打开</span>
        <span class="recent-panel-count">{{ items.length }} / 10</span>
      </div>
      <div v-if="!items.length" class="empty-hint">暂无最近打开记录</div>
      <div v-else class="recent-list scrollable">
        <div
          v-for="record in items"
          :key="record.filePath"
          class="recent-row"
          :title="record.filePath"
          @click="openFile(record)"
        >
          <span class="recent-icon"><Icon name="file" :size="15" /></span>
          <span class="recent-info">
            <span class="recent-name">{{ record.fileName }}</span>
            <span class="recent-meta">
              {{ formatRecentTime(record.lastOpenedAt) }}
              <template v-if="record.lastPage > 1"> · 第 {{ record.lastPage }} 页</template>
            </span>
          </span>
          <button class="icon-btn recent-remove" title="从记录中移除" @click.stop="removeRecord(record)">
            <Icon name="close" :size="12" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.recent-root {
  position: relative;
  flex: none;
  align-self: center;
}

.recent-trigger.is-active {
  background: var(--accent-soft);
  color: var(--accent);
}

.recent-panel {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 90;
  width: 320px;
  padding: 8px;
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
}

.recent-panel-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 6px 8px;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
}

.recent-panel-count {
  margin-left: auto;
  color: var(--text-muted);
  font-weight: 400;
  font-size: 11px;
}

.recent-list {
  max-height: 340px;
  overflow-y: auto;
}

.recent-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 8px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background var(--transition);
}

.recent-row:hover {
  background: var(--bg-hover);
}

.recent-icon {
  display: flex;
  color: var(--accent);
  flex: none;
}

.recent-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.recent-name {
  font-size: 12.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recent-meta {
  font-size: 11px;
  color: var(--text-muted);
}

.recent-remove {
  width: 20px;
  height: 20px;
  opacity: 0;
  flex: none;
}

.recent-row:hover .recent-remove {
  opacity: 1;
}
</style>
