import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { PdfTheme, UITheme } from '../types/settings'
import { storageService } from '../services/storageService'

export const useSettingsStore = defineStore('settings', () => {
  const uiTheme = ref<UITheme>('system')
  const pdfTheme = ref<PdfTheme>('original')
  const sidebarWidth = ref(260)
  const sidebarExpanded = ref(true)
  const defaultZoom = ref(1)
  const loaded = ref(false)

  async function load(): Promise<void> {
    const saved = await storageService.loadSettings()
    uiTheme.value = (['light', 'dark', 'system'].includes(saved.uiTheme) ? saved.uiTheme : 'system') as UITheme
    pdfTheme.value = (['original', 'dark-invert', 'dark-gray', 'sepia', 'eye-green'].includes(saved.pdfTheme)
      ? saved.pdfTheme
      : 'original') as PdfTheme
    sidebarWidth.value = Math.min(520, Math.max(190, saved.sidebarWidth || 260))
    sidebarExpanded.value = saved.sidebarExpanded !== false
    defaultZoom.value = saved.defaultZoom > 0 ? saved.defaultZoom : 1
    loaded.value = true
  }

  watch(
    [uiTheme, pdfTheme, sidebarWidth, sidebarExpanded, defaultZoom],
    () => {
      if (!loaded.value) return
      void storageService.saveSettings({
        uiTheme: uiTheme.value,
        pdfTheme: pdfTheme.value,
        sidebarWidth: sidebarWidth.value,
        sidebarExpanded: sidebarExpanded.value,
        defaultZoom: defaultZoom.value
      })
    }
  )

  return { uiTheme, pdfTheme, sidebarWidth, sidebarExpanded, defaultZoom, load }
})
