import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface ToastItem {
  id: number
  message: string
  type: 'info' | 'error' | 'success'
}

let toastSeq = 0

export const useUiStore = defineStore('ui', () => {
  const toasts = ref<ToastItem[]>([])
  const findOpen = ref(false)
  const focusSearchToken = ref(0)
  const dragActive = ref(false)
  const viewerWidth = ref(1000)
  const viewerHeight = ref(700)

  function notify(message: string, type: ToastItem['type'] = 'info'): void {
    const id = ++toastSeq
    toasts.value.push({ id, message, type })
    window.setTimeout(() => {
      toasts.value = toasts.value.filter((t) => t.id !== id)
    }, 4200)
  }

  function focusSearch(): void {
    focusSearchToken.value += 1
  }

  function openFind(): void {
    findOpen.value = true
    focusSearch()
  }

  function closeFind(): void {
    findOpen.value = false
  }

  return {
    toasts,
    findOpen,
    focusSearchToken,
    dragActive,
    viewerWidth,
    viewerHeight,
    notify,
    focusSearch,
    openFind,
    closeFind
  }
})
