<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useDocumentStore } from '../stores/documentStore'
import { useUiStore } from '../stores/uiStore'
import { usePdfSearch } from '../composables/usePdfSearch'
import Icon from './Icon.vue'

const docs = useDocumentStore()
const ui = useUiStore()
const search = usePdfSearch()

const inputRef = ref<HTMLInputElement | null>(null)
const keyword = ref('')
const tab = computed(() => docs.activeTab)

watch(
  () => tab.value?.id,
  () => {
    keyword.value = tab.value?.searchKeyword ?? ''
  },
  { immediate: true }
)

watch(
  () => ui.focusSearchToken,
  async () => {
    await nextTick()
    inputRef.value?.focus()
    inputRef.value?.select()
  }
)

// 打开时恢复关键词并聚焦，关闭时清除高亮与搜索状态（与 Chrome 查找栏一致）。
watch(
  () => ui.findOpen,
  (open) => {
    if (open) {
      keyword.value = tab.value?.searchKeyword ?? ''
      void nextTick(() => {
        inputRef.value?.focus()
        inputRef.value?.select()
      })
    } else {
      keyword.value = ''
      search.clear()
    }
  }
)

watch(keyword, (value) => {
  if (!ui.findOpen) return
  const current = tab.value
  if (!current) return
  docs.setSearchKeyword(current.id, value)
  search.scheduleSearch(value, current.searchCaseSensitive)
})

const noResults = computed(() => {
  const current = tab.value
  return (
    !!current &&
    !!keyword.value.trim() &&
    current.searchStatus === 'done' &&
    current.searchResults.length === 0
  )
})

const counter = computed(() => {
  const current = tab.value
  if (!current || !keyword.value.trim()) return ''
  if (current.searchStatus === 'running') return `${current.searchScanned}/${current.searchTotal}`
  return `${current.searchResults.length ? current.currentSearchIndex + 1 : 0}/${current.searchResults.length}`
})

const hint = computed(() => {
  const current = tab.value
  if (!current) return '打开 PDF 后即可查找'
  if (!keyword.value.trim()) return ''
  if (current.searchStatus === 'no-text') return '当前 PDF 不包含可搜索文本。'
  if (current.searchStatus === 'error') return '搜索失败，请重新输入'
  if (current.searchStatus === 'running') return `正在扫描 ${current.searchScanned} / ${current.searchTotal} 页…`
  return ''
})

function toggleCase(): void {
  const current = tab.value
  if (!current) return
  const nextValue = !current.searchCaseSensitive
  docs.setSearchCaseSensitive(current.id, nextValue)
  search.run(keyword.value, nextValue)
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter') {
    event.preventDefault()
    if (event.shiftKey) search.previous()
    else search.next()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    ui.closeFind()
  }
}
</script>

<template>
  <div v-if="ui.findOpen" class="find-bar">
    <Icon name="search" :size="14" class="find-icon" />
    <input
      ref="inputRef"
      v-model="keyword"
      class="find-input"
      :class="{ 'no-hit': noResults }"
      type="text"
      placeholder="在 PDF 中查找"
      @keydown="onKeydown"
    />
    <span v-if="counter" class="find-count" :class="{ 'no-hit': noResults }">{{ counter }}</span>
    <span class="find-sep"></span>
    <button class="find-btn" title="上一个匹配 (Shift + Enter)" @click="search.previous()">
      <Icon name="up" :size="14" />
    </button>
    <button class="find-btn" title="下一个匹配 (Enter)" @click="search.next()">
      <Icon name="down" :size="14" />
    </button>
    <button
      class="find-btn case-btn"
      :class="{ active: tab?.searchCaseSensitive }"
      title="大小写敏感"
      @click="toggleCase"
    >Aa</button>
    <span class="find-sep"></span>
    <button class="find-btn" title="关闭 (Esc)" @click="ui.closeFind()">
      <Icon name="close" :size="14" />
    </button>
    <div v-if="hint" class="find-hint">{{ hint }}</div>
  </div>
</template>

<style scoped>
.find-bar {
  position: absolute;
  top: 12px;
  right: 16px;
  z-index: 60;
  display: flex;
  align-items: center;
  gap: 3px;
  height: 38px;
  padding: 0 6px 0 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-panel);
  box-shadow: var(--shadow);
}

.find-icon {
  color: var(--text-muted);
  flex: none;
}

.find-input {
  width: 210px;
  padding: 4px 6px;
  border: none;
  background: transparent;
  box-shadow: none;
  font-size: 12.5px;
}

.find-input:focus {
  border: none;
  box-shadow: none;
}

.find-input.no-hit {
  color: var(--danger);
}

.find-count {
  min-width: 42px;
  text-align: center;
  font-size: 11.5px;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.find-count.no-hit {
  color: var(--danger);
}

.find-sep {
  width: 1px;
  height: 18px;
  margin: 0 3px;
  background: var(--border);
  flex: none;
}

.find-btn {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: 11px;
  flex: none;
}

.find-btn:hover {
  background: var(--bg-hover);
  color: var(--text);
}

.find-btn.active {
  background: var(--accent-soft);
  color: var(--accent);
}

.case-btn {
  font-weight: 600;
}

.find-hint {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  padding: 5px 9px;
  border-radius: var(--radius-sm);
  background: var(--bg-panel);
  border: 1px solid var(--border);
  box-shadow: var(--shadow);
  color: var(--text-secondary);
  font-size: 11.5px;
  white-space: nowrap;
}
</style>
