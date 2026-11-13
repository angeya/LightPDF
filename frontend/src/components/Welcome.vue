<script setup lang="ts">
import type { RecentFile } from '../types/backend'
import BrandLogo from './BrandLogo.vue'
import Icon from './Icon.vue'
import RecentFiles from './RecentFiles.vue'

defineProps<{ recent: RecentFile[] }>()
const emit = defineEmits<{
  open: []
  openRecent: [record: RecentFile]
  removeRecent: [record: RecentFile]
}>()
</script>

<template>
  <div class="welcome scrollable">
    <div class="welcome-inner">
      <div class="brand">
        <div class="brand-mark"><BrandLogo :size="56" /></div>
        <h1>LightPDF</h1>
        <p>简洁、流畅、无广告的本地 PDF 阅读体验</p>
      </div>

      <div class="welcome-actions">
        <button class="primary-btn" @click="emit('open')">
          <Icon name="folder" :size="17" />
          打开 PDF 文件
        </button>
        <span class="shortcut-tip">Ctrl + O</span>
      </div>

      <div class="drop-tip">
        <Icon name="layers" :size="15" />
        也可以将 PDF 文件直接拖拽到窗口中打开
      </div>

      <RecentFiles
        :items="recent"
        @open="(record) => emit('openRecent', record)"
        @remove="(record) => emit('removeRecent', record)"
      />
    </div>
  </div>
</template>

<style scoped>
.welcome {
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  background: var(--bg-app);
}

.welcome-inner {
  width: min(620px, 100%);
  padding: 66px 26px 40px;
}

.brand {
  text-align: center;
  margin-bottom: 30px;
}

.brand-mark {
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 18px;
}

.brand h1 {
  margin: 0 0 8px;
  font-size: 30px;
  font-weight: 650;
  letter-spacing: 0.5px;
}

.brand p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 13.5px;
}

.welcome-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.shortcut-tip {
  color: var(--text-muted);
  font-size: 12px;
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.drop-tip {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  margin: 22px 0 36px;
  color: var(--text-muted);
  font-size: 12.5px;
}
</style>
