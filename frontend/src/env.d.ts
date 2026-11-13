/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

interface WailsRuntime {
  EventsOn?: (name: string, callback: (...args: unknown[]) => void) => (() => void) | void
  OnFileDrop?: (callback: (x: number, y: number, paths: string[]) => void, useDropTarget: boolean) => void
  OnFileDropOff?: () => void
  BrowserOpenURL?: (url: string) => void
}

interface Window {
  go?: {
    main?: {
      App?: Record<string, (...args: unknown[]) => Promise<unknown>>
    }
  }
  runtime?: WailsRuntime
}
