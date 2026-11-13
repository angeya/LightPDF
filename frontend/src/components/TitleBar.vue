<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { backend } from '../services/bridge'
import BrandLogo from './BrandLogo.vue'
import Icon from './Icon.vue'

const maximised = ref(false)
let resizeTimer = 0
let offMaximised: (() => void) | null = null

async function refreshMaximised(): Promise<void> {
  try {
    maximised.value = await backend.windowIsMaximised()
  } catch {
    /* 非桌面环境（浏览器预览）忽略 */
  }
}

function onWindowResize(): void {
  if (resizeTimer) window.clearTimeout(resizeTimer)
  resizeTimer = window.setTimeout(() => {
    resizeTimer = 0
    void refreshMaximised()
  }, 200)
}

onMounted(() => {
  void refreshMaximised()
  offMaximised =
    window.runtime?.EventsOn?.('lightpdf:window-maximised', (...args: unknown[]) => {
      maximised.value = args[0] === true
    }) ?? null
  window.addEventListener('resize', onWindowResize)
})

onUnmounted(() => {
  offMaximised?.()
  offMaximised = null
  window.removeEventListener('resize', onWindowResize)
  if (resizeTimer) window.clearTimeout(resizeTimer)
})

function minimise(): void {
  void backend.windowMinimise().catch(() => undefined)
}

function maximise(): void {
  void backend.windowToggleMaximise()
    .then(() => refreshMaximised())
    .catch(() => undefined)
}

function close(): void {
  void backend.windowClose().catch(() => undefined)
}
</script>

<template>
  <header class="title-bar" @dblclick="maximise">
    <div class="title-left">
      <BrandLogo :size="18" />
      <strong class="title-name">LightPDF</strong>
      <span class="title-tagline">轻量 · 专注阅读</span>
    </div>

    <div class="title-drag"></div>

    <div class="window-controls">
      <button class="win-btn" title="最小化" @click.stop="minimise" @dblclick.stop>
        <Icon name="minus" :size="13" />
      </button>
      <button
        class="win-btn"
        :title="maximised ? '还原' : '最大化'"
        @click.stop="maximise"
        @dblclick.stop
      >
        <Icon :name="maximised ? 'restore' : 'square'" :size="12" />
      </button>
      <button class="win-btn is-close" title="关闭" @click.stop="close" @dblclick.stop>
        <Icon name="close" :size="13" />
      </button>
    </div>
  </header>
</template>

<style scoped>
.title-bar {
  --wails-draggable: drag;
  height: var(--titlebar-h);
  flex: none;
  display: flex;
  align-items: center;
  padding-left: 12px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-panel);
  user-select: none;
}

.title-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
  min-width: 0;
}

.title-name {
  font-size: 12.5px;
  letter-spacing: 0.2px;
  white-space: nowrap;
}

.title-tagline {
  color: var(--text-muted);
  font-size: 11px;
  white-space: nowrap;
}

.title-drag {
  flex: 1;
  min-width: 0;
  height: 100%;
}

.window-controls {
  --wails-draggable: no-drag;
  display: flex;
  height: 100%;
  flex: none;
}

.win-btn {
  width: 44px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  transition: background var(--transition), color var(--transition);
}

.win-btn:hover {
  background: var(--bg-hover);
  color: var(--text);
}

.win-btn.is-close:hover {
  background: #e81123;
  color: #ffffff;
}
</style>
