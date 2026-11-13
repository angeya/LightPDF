import { onMounted, onUnmounted } from 'vue'

export interface ShortcutActions {
  open: () => void
  search: () => void
  closeTab: () => void
  nextTab: () => void
  previousTab: () => void
  selectTab: (index: number) => void
  zoomIn: () => void
  zoomOut: () => void
  zoomReset: () => void
  firstPage: () => void
  lastPage: () => void
  previousPage: () => void
  nextPage: () => void
  escape: () => void
}

function isTyping(): boolean {
  const el = document.activeElement as HTMLElement | null
  if (!el) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable
}

export function useShortcuts(actions: ShortcutActions): void {
  const onKeyDown = (event: KeyboardEvent) => {
    const ctrl = event.ctrlKey || event.metaKey
    const key = event.key.toLowerCase()

    if (event.key === 'Escape') {
      actions.escape()
      return
    }

    // 输入框聚焦时，只保留 Ctrl+F 与 Esc，避免误触发页面操作。
    if (isTyping()) {
      if (ctrl && key === 'f') {
        event.preventDefault()
        actions.search()
      }
      return
    }

    if (ctrl) {
      if (key === 'tab') {
        event.preventDefault()
        if (event.shiftKey) actions.previousTab()
        else actions.nextTab()
        return
      }
      if (/^[1-9]$/.test(key)) {
        event.preventDefault()
        actions.selectTab(Number(key) - 1)
        return
      }
      switch (key) {
        case 'o':
          event.preventDefault()
          actions.open()
          break
        case 'f':
          event.preventDefault()
          actions.search()
          break
        case 'w':
          event.preventDefault()
          actions.closeTab()
          break
        case '=':
        case '+':
          event.preventDefault()
          actions.zoomIn()
          break
        case '-':
          event.preventDefault()
          actions.zoomOut()
          break
        case '0':
          event.preventDefault()
          actions.zoomReset()
          break
        default:
          break
      }
      return
    }

    switch (event.key) {
      case 'Home':
        event.preventDefault()
        actions.firstPage()
        break
      case 'End':
        event.preventDefault()
        actions.lastPage()
        break
      case 'PageUp':
        event.preventDefault()
        actions.previousPage()
        break
      case 'PageDown':
        event.preventDefault()
        actions.nextPage()
        break
      default:
        break
    }
  }

  onMounted(() => window.addEventListener('keydown', onKeyDown))
  onUnmounted(() => window.removeEventListener('keydown', onKeyDown))
}
