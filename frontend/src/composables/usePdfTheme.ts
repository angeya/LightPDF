import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useSettingsStore } from '../stores/settingsStore'

/** UI 主题与 PDF 内容主题相互独立；跟随系统时监听系统主题变化。 */
export function usePdfTheme() {
  const settings = useSettingsStore()
  const query = window.matchMedia('(prefers-color-scheme: dark)')
  const systemDark = ref(query.matches)

  const onSystemChange = (event: MediaQueryListEvent) => {
    systemDark.value = event.matches
  }

  const resolvedTheme = computed(() => {
    if (settings.uiTheme === 'system') return systemDark.value ? 'dark' : 'light'
    return settings.uiTheme
  })

  watch(
    resolvedTheme,
    (theme) => document.documentElement.setAttribute('data-ui-theme', theme),
    { immediate: true }
  )

  onMounted(() => query.addEventListener('change', onSystemChange))
  onUnmounted(() => query.removeEventListener('change', onSystemChange))

  return { resolvedTheme }
}
