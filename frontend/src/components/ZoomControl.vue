<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import type { FitMode } from '../types/document'
import Icon from './Icon.vue'

const props = defineProps<{ scale: number; fitMode: FitMode }>()
const emit = defineEmits<{
  zoomIn: []
  zoomOut: []
  reset: []
  custom: [percent: number]
  fit: [mode: Exclude<FitMode, 'free'>]
}>()

const root = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)
const editing = ref(false)
const draft = ref('')
const showMenu = ref(false)

const percent = computed(() => Math.round(props.scale * 100))

const fitOptions: Array<{ label: string; mode: Exclude<FitMode, 'free'> }> = [
  { label: '适应宽度', mode: 'width' },
  { label: '适应高度', mode: 'height' },
  { label: '适应页面', mode: 'page' },
  { label: '适应窗口', mode: 'window' }
]

async function startEdit(): Promise<void> {
  draft.value = String(percent.value)
  editing.value = true
  await nextTick()
  inputRef.value?.focus()
  inputRef.value?.select()
}

function commit(): void {
  if (!editing.value) return
  const value = Number(draft.value.replace(/[%\s]/g, ''))
  if (Number.isFinite(value) && value > 0) emit('custom', value)
  editing.value = false
}

function cancelEdit(): void {
  editing.value = false
}

function chooseFit(mode: Exclude<FitMode, 'free'>): void {
  showMenu.value = false
  emit('fit', mode)
}

function onDocumentClick(event: MouseEvent): void {
  if (root.value && !root.value.contains(event.target as Node)) showMenu.value = false
}

/** 点击控件内的其他按钮（如查找）时收起适配菜单。 */
function onRootClick(event: MouseEvent): void {
  if (!showMenu.value) return
  const target = event.target as HTMLElement
  if (target.closest('.fit-trigger')) return
  if (target.closest('button')) showMenu.value = false
}

onMounted(() => document.addEventListener('click', onDocumentClick))
onUnmounted(() => document.removeEventListener('click', onDocumentClick))
</script>

<template>
  <div ref="root" class="zoom-control" @click.capture="onRootClick">
    <button class="icon-btn" title="缩小 (Ctrl + -)" @click="emit('zoomOut')"><Icon name="minus" :size="15" /></button>

    <input
      v-if="editing"
      ref="inputRef"
      v-model="draft"
      class="zoom-input"
      @keydown.enter="commit"
      @keydown.esc="cancelEdit"
      @blur="commit"
    />
    <button v-else class="zoom-value" title="点击输入自定义缩放比例" @click="startEdit">{{ percent }}%</button>

    <button class="icon-btn" title="放大 (Ctrl + +)" @click="emit('zoomIn')"><Icon name="plus" :size="15" /></button>

    <div class="menu-anchor">
      <slot></slot>
      <button class="icon-btn fit-trigger" :class="{ 'is-active': fitMode !== 'free' }" title="页面适配方式" @click.stop="showMenu = !showMenu">
        <Icon name="fit" :size="15" />
      </button>
      <div v-if="showMenu" class="zoom-menu">
        <button
          v-for="option in fitOptions"
          :key="option.mode"
          :class="{ selected: fitMode === option.mode }"
          @click="chooseFit(option.mode)"
        >
          <Icon v-if="fitMode === option.mode" name="check" :size="13" />
          <span v-else class="menu-icon-space"></span>
          {{ option.label }}
        </button>
        <div class="menu-sep"></div>
        <button @click="showMenu = false; emit('reset')">
          <span class="menu-icon-space"></span>100% (Ctrl + 0)
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.zoom-control {
  display: flex;
  align-items: center;
  gap: 2px;
}

.zoom-value,
.zoom-input {
  width: 58px;
  text-align: center;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.zoom-value {
  height: 26px;
  border-radius: var(--radius-sm);
  background: transparent;
  border: 1px solid transparent;
}

.zoom-value:hover {
  background: var(--bg-hover);
}

.zoom-input {
  padding: 4px;
}

.menu-anchor {
  position: relative;
  display: flex;
  align-items: center;
  gap: 2px;
}

.zoom-menu {
  position: absolute;
  right: 0;
  top: 34px;
  z-index: 60;
  min-width: 168px;
  padding: 5px;
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
}

.zoom-menu button {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 7px 8px;
  border-radius: var(--radius-sm);
  text-align: left;
  font-size: 12.5px;
  white-space: nowrap;
}

.zoom-menu button:hover {
  background: var(--bg-hover);
}

.zoom-menu .selected {
  color: var(--accent);
}

.menu-icon-space {
  width: 13px;
  flex: none;
}

.menu-sep {
  height: 1px;
  margin: 4px 3px;
  background: var(--border);
}
</style>
