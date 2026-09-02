import dayjs from 'dayjs'

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']

// startDate 〜 endDate (両端を含む) の日数分、日付ブロックのメタ情報を生成する。
// 旅の基本情報 (メタデータ) が起点であり、予定アイテムの有無には依存しない。
// 不正な日程 (未設定・終了日が開始日より前 など) の場合は空配列を返す。
export function buildDateRange(startDate, endDate) {
  if (!startDate || !endDate) return []

  const start = dayjs(startDate)
  const end = dayjs(endDate)
  if (!start.isValid() || !end.isValid() || end.isBefore(start, 'day')) return []

  const dayCount = end.diff(start, 'day') + 1

  return Array.from({ length: dayCount }, (_, index) => {
    const date = start.add(index, 'day')
    return {
      dayIndex: index + 1,
      dayLabel: dayCount === 1 ? '日帰り' : `${index + 1}日目`,
      date: date.format('YYYY-MM-DD'),
      dayOfWeek: WEEKDAY_LABELS[date.day()],
    }
  })
}

// 日付ヘッダー表示用のフォーマット (例: "9/20")
export function formatShortDate(dateStr) {
  if (!dateStr) return ''
  const d = dayjs(dateStr)
  return d.isValid() ? d.format('M/D') : ''
}

// 期間表示用 (例: "9/20 〜 9/22" / 単日なら "9/20")
export function formatDateRangeLabel(startDate, endDate) {
  const start = formatShortDate(startDate)
  const end = formatShortDate(endDate)
  if (!start) return ''
  if (!end || start === end) return start
  return `${start} 〜 ${end}`
}
