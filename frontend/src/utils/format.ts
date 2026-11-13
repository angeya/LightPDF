/** 最近打开记录的时间展示：今天/昨天显示时刻，其余显示日期。 */
export function formatRecentTime(timestamp: number): string {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  const now = new Date()
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  if (date.toDateString() === now.toDateString()) return `今天 ${time}`
  const yesterday = new Date(now.getTime() - 86400000)
  if (date.toDateString() === yesterday.toDateString()) return `昨天 ${time}`
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
