export interface PdfHandle {
  docId: string
  url: string
  filePath: string
  fileName: string
  size: number
  lastPage: number
  zoom: number
  uiSupport: boolean
}

export interface RecentFile {
  filePath: string
  fileName: string
  lastOpenedAt: number
  lastPage: number
  zoom: number
}

export interface ReaderSettings {
  uiTheme: string
  pdfTheme: string
  sidebarWidth: number
  sidebarExpanded: boolean
  defaultZoom: number
}

export interface FileInfo {
  path: string
  name: string
  size: number
  exists: boolean
  modTime: number
}

export interface AssociationStatus {
  registered: boolean
  exePath: string
}
