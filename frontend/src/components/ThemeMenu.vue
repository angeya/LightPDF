<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { ThemeOption } from '../types/settings'
import Icon from './Icon.vue'

const props = withDefaults(
  defineProps<{
    modelValue: string
    options: ThemeOption[]
    title?: string
    icon?: string
    placement?: 'down' | 'up'
    compact?: boolean
  }>(),
  { title: '主题', icon: '', placement: 'down', compact: false }
)

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const root = ref<HTMLElement | null>(null)
const open = ref(false)
const current = computed(() => props.options.find((item) => item.value === props.modelValue) ?? props.options[0])

function select(value: string): void {
  emit('update:modelValue', value)
  open.value = false
}

function onDocumentClick(event: MouseEvent): void {
  if (root.value && !root.value.contains(event.target as Node)) open.value = false
}

onMounted(() => document.addEventListener('click', onDocumentClick))
onUnmounted(() => document.removeEventListener('click', onDocumentClick))
</script>

<template>
  <div ref="root" class="theme-root" :class="{ compact }">
    <button class="theme-trigger" :title="title" @click.stop="open = !open">
      <Icon :name="icon || current?.icon || 'sun'" :size="compact ? 13 : 15" />
      <span class="theme-label">{{ current?.label }}</span>
      <Icon v-if="!compact" name="down" :size="12" />
    </button>

    <div v-if="open" class="theme-menu" :class="placement">
      <div class="theme-menu-title">{{ title }}</div>
      <button
        v-for="option in options"
        :key="option.value"
        :class="{ selected: option.value === modelValue }"
        @click="select(option.value)"
      >
        <Icon :name="option.icon" :size="14" />
        <span>{{ option.label }}</span>
        <Icon v-if="option.value === modelValue" name="check" :size="14" />
        <span v-else class="check-space"></span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.theme-root {
  position: relative;
  flex: none;
}

.theme-trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 9px;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: 12px;
  white-space: nowrap;
}

.theme-trigger:hover {
  background: var(--bg-hover);
  color: var(--text);
}

.compact .theme-trigger {
  gap: 5px;
  padding: 2px 7px;
  font-size: 11px;
}

.compact .theme-label {
  max-width: 92px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.theme-menu {
  position: absolute;
  right: 0;
  z-index: 80;
  min-width: 176px;
  padding: 6px;
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
}

.theme-menu.down {
  top: calc(100% + 6px);
}

.theme-menu.up {
  bottom: calc(100% + 6px);
}

.theme-menu-title {
  padding: 4px 8px 7px;
  color: var(--text-muted);
  font-size: 11px;
}

.theme-menu button {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 7px 8px;
  border-radius: var(--radius-sm);
  text-align: left;
  font-size: 12.5px;
  white-space: nowrap;
}

.theme-menu button span {
  flex: 1;
}

.theme-menu button:hover {
  background: var(--bg-hover);
}

.theme-menu .selected {
  color: var(--accent);
}

.check-space {
  width: 14px;
  flex: none;
}
</style>
