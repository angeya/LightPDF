export type UITheme = 'light' | 'dark' | 'system'
export type PdfTheme = 'original' | 'dark-invert' | 'dark-gray' | 'sepia' | 'eye-green'

export const MIN_SCALE = 0.25
export const MAX_SCALE = 4
export const PDF_THEME_LABELS: Record<PdfTheme, string> = {
  original: '原始',
  'dark-invert': '深色反转',
  'dark-gray': '深灰',
  sepia: '护眼 · 牛皮黄',
  'eye-green': '护眼 · 淡绿'
}

export const UI_THEME_LABELS: Record<UITheme, string> = {
  light: '浅色',
  dark: '深色',
  system: '跟随系统'
}

export interface ThemeOption {
  value: string
  label: string
  icon: string
}
