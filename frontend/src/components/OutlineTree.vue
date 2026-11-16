<script setup lang="ts">
import type { OutlineItem } from '../types/document'
import Icon from './Icon.vue'

defineOptions({ name: 'OutlineTree' })

defineProps<{
  nodes: OutlineItem[]
  expanded: Record<string, boolean>
  activeId: string
}>()

const emit = defineEmits<{
  toggle: [id: string]
  jump: [node: OutlineItem]
}>()

/** 有子目录的节点：点击整行切换展开/收缩；无子目录的节点：点击直接跳转。 */
function onRowClick(node: OutlineItem): void {
  if (node.children.length) emit('toggle', node.id)
  else emit('jump', node)
}

function rowTitle(node: OutlineItem): string {
  if (node.children.length) return `点击展开/收缩「${node.title}」的子目录，点击页码跳转`
  if (node.pageNumber > 0) return `${node.title}（点击跳转）`
  return node.title
}
</script>

<template>
  <ul class="outline-tree">
    <li v-for="node in nodes" :key="node.id" class="outline-node">
      <div
        class="outline-row"
        :class="{ active: activeId === node.id }"
        :style="{ paddingLeft: `${7 + node.level * 14}px` }"
        :title="rowTitle(node)"
        @click="onRowClick(node)"
      >
        <button v-if="node.children.length" class="tree-toggle" @click.stop="emit('toggle', node.id)">
          <Icon :name="expanded[node.id] ? 'tree-down' : 'tree-right'" :size="11" />
        </button>
        <span v-else class="tree-spacer"></span>
        <span class="outline-title">{{ node.title }}</span>
        <span
          v-if="node.pageNumber > 0"
          class="outline-page"
          :title="`跳转到第 ${node.pageNumber} 页`"
          @click.stop="emit('jump', node)"
        >{{ node.pageNumber }}</span>
      </div>
      <OutlineTree
        v-if="node.children.length && expanded[node.id]"
        :nodes="node.children"
        :expanded="expanded"
        :active-id="activeId"
        @toggle="(id) => emit('toggle', id)"
        @jump="(item) => emit('jump', item)"
      />
    </li>
  </ul>
</template>

<style scoped>
.outline-tree {
  list-style: none;
  margin: 0;
  padding: 0;
}

.outline-row {
  display: flex;
  align-items: center;
  gap: 5px;
  min-height: 29px;
  padding-right: 8px;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 12.5px;
  line-height: 1.4;
  transition: background var(--transition), color var(--transition);
}

.outline-row:hover {
  background: var(--bg-hover);
  color: var(--text);
}

.outline-row.active {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 500;
}

.tree-toggle,
.tree-spacer {
  width: 16px;
  height: 20px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  /* 重置 button 的 UA 默认内边距，否则 16px 容器只剩 4px 可用，图标会被压扁。 */
  padding: 0;
  color: var(--text);
}

.tree-toggle :deep(svg) {
  flex: none;
}

.tree-toggle:hover {
  color: var(--accent);
}

.outline-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.outline-page {
  flex: none;
  color: var(--text-muted);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  border-radius: 3px;
  padding: 1px 4px;
  cursor: pointer;
}

.outline-page:hover {
  color: var(--accent);
  background: var(--accent-soft);
}

.outline-row.active .outline-page {
  color: var(--accent);
}
</style>
