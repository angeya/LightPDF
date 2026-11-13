import { computed } from 'vue'
import type { OutlineItem } from '../types/document'
import { useDocumentStore } from '../stores/documentStore'
import { useUiStore } from '../stores/uiStore'

export function usePdfOutline() {
  const docs = useDocumentStore()
  const ui = useUiStore()

  /** 当前阅读位置对应的最深一级目录节点。 */
  const activeOutlineId = computed(() => {
    const tab = docs.activeTab
    if (!tab || !tab.outline.length) return ''
    let bestId = ''
    let bestPage = 0
    const walk = (nodes: OutlineItem[]) => {
      for (const node of nodes) {
        if (node.pageNumber > 0 && node.pageNumber <= tab.currentPage && node.pageNumber >= bestPage) {
          bestPage = node.pageNumber
          bestId = node.id
        }
        if (node.children.length) walk(node.children)
      }
    }
    walk(tab.outline)
    return bestId
  })

  function jumpTo(node: OutlineItem): void {
    if (node.pageNumber < 1) {
      ui.notify('该目录项没有可跳转的页面目标', 'info')
      return
    }
    docs.requestJump(node.pageNumber, node.destY)
  }

  return { activeOutlineId, jumpTo }
}
