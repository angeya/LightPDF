import type { PageMatch } from '../types/search'

interface WorkerPage {
  pageNumber: number
  text: string
}

interface WorkerRequest {
  id: number
  keyword: string
  caseSensitive: boolean
  pages: WorkerPage[]
}

interface WorkerResponse {
  id: number
  matches: PageMatch[]
  textLength: number
}

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null
  postMessage: (data: WorkerResponse) => void
}

scope.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, keyword, caseSensitive, pages } = event.data
  const needle = caseSensitive ? keyword : keyword.toLocaleLowerCase()
  const matches: PageMatch[] = []
  let textLength = 0

  if (needle.length > 0) {
    for (const page of pages) {
      const text = page.text || ''
      textLength += text.length
      const haystack = caseSensitive ? text : text.toLocaleLowerCase()
      let from = 0
      let guard = 0
      while (guard < 500) {
        guard += 1
        const index = haystack.indexOf(needle, from)
        if (index < 0) break
        const before = text.slice(Math.max(0, index - 26), index).replace(/\s+/g, ' ')
        const hit = text.slice(index, index + needle.length)
        const after = text.slice(index + needle.length, index + needle.length + 26).replace(/\s+/g, ' ')
        matches.push({
          pageNumber: page.pageNumber,
          index,
          length: needle.length,
          context: `${before}${hit}${after}`
        })
        from = index + Math.max(1, needle.length)
      }
    }
  }

  scope.postMessage({ id, matches, textLength })
}
