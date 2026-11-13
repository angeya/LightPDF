<script setup lang="ts">
import type { RecentFile } from '../types/backend'
import { formatRecentTime } from '../utils/format'
import Icon from './Icon.vue'

defineProps<{ items: RecentFile[] }>()
const emit = defineEmits<{
  open: [record: RecentFile]
  remove: [record: RecentFile]
}>()
</script>

<template>
  <div class="recent">
    <div class="recent-head">
      <Icon name="clock" :size="15" />
      <span>最近打开</span>
      <span class="recent-count">{{ items.length }} / 10</span>
    </div>

    <div v-if="!items.length" class="empty-hint">暂无最近打开记录</div>

    <div v-else class="recent-list scrollable">
      <div
        v-for="record in items"
        :key="record.filePath"
        class="recent-row"
        :title="record.filePath"
        @click="emit('open', record)"
      >
        <span class="recent-icon"><Icon name="file" :size="17" /></span>
        <span class="recent-info">
          <span class="recent-name">{{ record.fileName }}</span>
          <span class="recent-meta">
            {{ formatRecentTime(record.lastOpenedAt) }}
            <template v-if="record.lastPage > 1"> · 第 {{ record.lastPage }} 页</template>
          </span>
        </span>
        <button class="icon-btn recent-remove" title="从记录中移除" @click.stop="emit('remove', record)">
          <Icon name="close" :size="13" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.recent {
  width: min(560px, 100%);
}

.recent-head {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 12px;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
}

.recent-count {
  margin-left: auto;
  color: var(--text-muted);
  font-weight: 400;
  font-size: 12px;
}

.recent-list {
  max-height: 330px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-panel);
  overflow-y: auto;
}

.recent-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  transition: background var(--transition);
}

.recent-row:last-child {
  border-bottom: none;
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
  gap: 3px;
  min-width: 0;
  flex: 1;
}

.recent-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}

.recent-meta {
  color: var(--text-muted);
  font-size: 11.5px;
}

.recent-remove {
  opacity: 0;
  flex: none;
}

.recent-row:hover .recent-remove {
  opacity: 1;
}
</style>
