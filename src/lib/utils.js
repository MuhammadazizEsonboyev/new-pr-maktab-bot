export const cx = (...p) => p.filter(Boolean).join(' ')

export const LETTERS = ['A', 'B', 'C', 'D', 'E']

export function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

export function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}, ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function verdict(percent) {
  if (percent >= 90) return { text: 'Ajoyib natija!', emoji: '🏆', tone: 'mint' }
  if (percent >= 70) return { text: 'Yaxshi natija', emoji: '👍', tone: 'mint' }
  if (percent >= 50) return { text: 'Qoniqarli', emoji: '🙂', tone: 'flame' }
  return { text: 'Takrorlash kerak', emoji: '📚', tone: 'wrong' }
}

export const TEST_TYPES = [
  { value: 'closed', icon: '🔘', short: 'Yopiq', label: 'Yopiq test (A–E)', hint: 'Har savolga A, B, C, D yoki E' },
  { value: 'open', icon: '✍️', short: 'Ochiq', label: 'Ochiq test', hint: "Javob so'z yoki son bilan yoziladi" },
  { value: 'mixed', icon: '🔀', short: 'Aralash', label: 'Aralash', hint: 'Har savol uchun turini alohida tanlaysiz' },
]

export function typeLabel(value) {
  return TEST_TYPES.find((t) => t.value === value)?.label ?? value
}

/** "ta" bilan son: 5 ta savol */
export const plural = (n, word) => `${n} ta ${word}`
