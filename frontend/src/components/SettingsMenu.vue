<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { backend, isDesktop } from '../services/bridge'
import type { AssociationStatus } from '../types/backend'
import { useUiStore } from '../stores/uiStore'
import Icon from './Icon.vue'

const ui = useUiStore()

const root = ref<HTMLElement | null>(null)
const open = ref(false)
const loading = ref(false)
const busy = ref(false)
const status = ref<AssociationStatus | null>(null)
const loadError = ref('')

const desktop = computed(() => isDesktop())

const statusText = computed(() => {
  if (!desktop.value) return '文件关联仅在桌面应用中可用'
  if (loading.value) return '正在检测…'
  if (loadError.value) return loadError.value
  if (!status.value) return ''
  return status.value.registered
    ? '已注册：可在右键「打开方式」中选择 LightPDF'
    : '未注册：注册后可通过右键「打开方式」使用'
})

function toggle(): void {
  open.value = !open.value
  if (open.value) void refresh()
}

async function refresh(): Promise<void> {
  if (!desktop.value) {
    status.value = null
    loadError.value = ''
    return
  }
  loading.value = true
  loadError.value = ''
  try {
    status.value = await backend.getAssociationStatus()
  } catch (err) {
    status.value = null
    loadError.value = err instanceof Error ? err.message : '检测失败'
  } finally {
    loading.value = false
  }
}

async function toggleAssociation(): Promise<void> {
  if (!status.value || busy.value) return
  const wasRegistered = status.value.registered
  busy.value = true
  try {
    if (wasRegistered) await backend.unregisterPdfAssociation()
    else await backend.registerPdfAssociation()
    ui.notify(
      wasRegistered ? '已取消注册，右键菜单将不再显示 LightPDF' : '注册成功，现在可通过右键「打开方式」选择 LightPDF',
      'success'
    )
    await refresh()
  } catch (err) {
    ui.notify(err instanceof Error ? err.message : '操作失败', 'error')
  } finally {
    busy.value = false
  }
}

async function openSystemSettings(): Promise<void> {
  try {
    await backend.openDefaultAppsSettings()
  } catch (err) {
    ui.notify(err instanceof Error ? err.message : '打开失败', 'error')
  }
}

function onDocumentClick(event: MouseEvent): void {
  if (root.value && !root.value.contains(event.target as Node)) open.value = false
}

onMounted(() => document.addEventListener('click', onDocumentClick))
onUnmounted(() => document.removeEventListener('click', onDocumentClick))
</script>

<template>
  <div ref="root" class="settings-root">
    <button
      class="icon-btn settings-trigger"
      :class="{ 'is-active': open }"
      title="设置"
      @click.stop="toggle"
    >
      <Icon name="settings" :size="16" />
    </button>

    <div v-if="open" class="settings-panel">
      <div class="settings-panel-title">设置</div>

      <div class="settings-section">文件关联</div>
      <div class="settings-status" :class="{ ok: !!status?.registered, error: !!loadError }">{{ statusText }}</div>
      <button class="settings-action" :disabled="busy || !desktop" @click="toggleAssociation">
        <Icon :name="status?.registered ? 'close' : 'check'" :size="14" />
        {{ status?.registered ? '取消注册' : '注册为 PDF 打开方式' }}
      </button>
      <button class="settings-action" :disabled="!desktop" @click="openSystemSettings">
        <Icon name="fit" :size="14" />
        打开系统「默认应用」设置
      </button>
      <p class="settings-note">
        注册写入当前用户注册表（无需管理员权限），仅在右键「打开方式」中加入 LightPDF，不会修改现有的默认打开方式；如需双击默认打开，请在系统设置中确认。
      </p>
    </div>
  </div>
</template>

<style scoped>
.settings-root {
  position: relative;
  flex: none;
  align-self: center;
}

.settings-trigger.is-active {
  background: var(--accent-soft);
  color: var(--accent);
}

.settings-panel {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 90;
  width: 330px;
  padding: 10px 12px 12px;
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
}

.settings-panel-title {
  padding: 2px 2px 8px;
  font-size: 12.5px;
  font-weight: 600;
  border-bottom: 1px solid var(--border);
  margin-bottom: 8px;
}

.settings-section {
  padding: 0 2px 6px;
  color: var(--text-muted);
  font-size: 11px;
}

.settings-status {
  padding: 0 2px 8px;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.settings-status.ok {
  color: #43a875;
}

.settings-status.error {
  color: var(--danger);
}

.settings-action {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 9px;
  margin-bottom: 6px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-strong);
  background: var(--bg-subtle);
  color: var(--text);
  font-size: 12.5px;
  text-align: left;
  transition: background var(--transition), border-color var(--transition);
}

.settings-action:hover:not(:disabled) {
  background: var(--bg-hover);
  border-color: var(--accent);
}

.settings-action:disabled {
  opacity: 0.5;
  cursor: default;
}

.settings-note {
  margin: 4px 0 0;
  padding: 0 2px;
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1.6;
}
</style>
