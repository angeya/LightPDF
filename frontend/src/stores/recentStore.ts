import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { RecentFile } from '../types/backend'
import { storageService } from '../services/storageService'

export const useRecentStore = defineStore('recent', () => {
  const items = ref<RecentFile[]>([])

  async function load(): Promise<void> {
    items.value = await storageService.loadRecent()
  }

  async function refresh(): Promise<void> {
    await load()
  }

  async function remove(path: string): Promise<void> {
    items.value = await storageService.removeRecent(path)
  }

  return { items, load, refresh, remove }
})
