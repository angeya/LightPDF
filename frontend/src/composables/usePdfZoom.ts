import { MAX_SCALE, MIN_SCALE } from '../types/settings'
import type { FitMode, PageSize } from '../types/document'
import { useDocumentStore } from '../stores/documentStore'

export function clampScale(value: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value))
}

export function usePdfZoom() {
  const docs = useDocumentStore()

  function zoomIn(): void {
    const tab = docs.activeTab
    if (tab) docs.setScale(tab.id, clampScale(tab.scale * 1.2))
  }

  function zoomOut(): void {
    const tab = docs.activeTab
    if (tab) docs.setScale(tab.id, clampScale(tab.scale / 1.2))
  }

  function zoomReset(): void {
    const tab = docs.activeTab
    if (tab) docs.setScale(tab.id, 1)
  }

  function setCustomScale(percent: number): void {
    const tab = docs.activeTab
    if (!tab || !Number.isFinite(percent)) return
    docs.setScale(tab.id, clampScale(percent / 100))
  }

  function applyFit(
    mode: Exclude<FitMode, 'free'>,
    containerWidth: number,
    containerHeight: number,
    size: PageSize
  ): void {
    const tab = docs.activeTab
    if (!tab || !size?.width || !size?.height) return
    const availableWidth = Math.max(120, containerWidth - 48)
    const availableHeight = Math.max(120, containerHeight - 40)
    let scale: number
    if (mode === 'width') {
      scale = availableWidth / size.width
    } else if (mode === 'height') {
      scale = availableHeight / size.height
    } else {
      scale = Math.min(availableWidth / size.width, availableHeight / size.height)
    }
    docs.setScale(tab.id, clampScale(scale), mode)
  }

  return { zoomIn, zoomOut, zoomReset, setCustomScale, applyFit }
}
