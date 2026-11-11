export const tg = typeof window !== 'undefined' ? window.Telegram?.WebApp : undefined

/** Telegram ichida ochilganmi (imzolangan initData bormi) */
export const inTelegram = Boolean(tg?.initData)

export const BOT_USERNAME = String(import.meta.env.VITE_BOT_USERNAME || '').trim().replace(/^@/, '')
export const botLink = (start) =>
  BOT_USERNAME ? `https://t.me/${BOT_USERNAME}${start ? `?start=${encodeURIComponent(start)}` : ''}` : null

const THEME = {
  light: { bg: '#F4F6FA', header: '#F4F6FA' },
  dark: { bg: '#0F141B', header: '#0F141B' },
}

function applyTheme() {
  const scheme = tg?.colorScheme === 'dark' ? 'dark' : 'light'
  const root = document.documentElement
  root.classList.toggle('dark', scheme === 'dark')
  root.style.colorScheme = scheme
  try {
    tg?.setHeaderColor?.(THEME[scheme].header)
    tg?.setBackgroundColor?.(THEME[scheme].bg)
    tg?.setBottomBarColor?.(THEME[scheme].bg)
  } catch {
    /* eski Telegram versiyalari */
  }
}

function applyInsets() {
  const root = document.documentElement
  const top = (tg?.safeAreaInset?.top ?? 0) + (tg?.contentSafeAreaInset?.top ?? 0)
  const bottom = (tg?.safeAreaInset?.bottom ?? 0) + (tg?.contentSafeAreaInset?.bottom ?? 0)
  root.style.setProperty('--tg-top', `${top}px`)
  root.style.setProperty('--tg-bottom', `${bottom}px`)
}

export function initTelegram() {
  if (!tg) {
    if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) document.documentElement.classList.add('dark')
    return
  }
  tg.ready()
  tg.expand()
  try {
    tg.disableVerticalSwipes?.()
  } catch {
    /* ignore */
  }
  applyTheme()
  applyInsets()
  tg.onEvent?.('themeChanged', applyTheme)
  tg.onEvent?.('safeAreaChanged', applyInsets)
  tg.onEvent?.('contentSafeAreaChanged', applyInsets)
}

/** Faqat ko'rsatish uchun (ism). Server ID ni o'zi tekshiradi. */
export function localUser() {
  return tg?.initDataUnsafe?.user ?? null
}

// t.me/bot/app?startapp=join_abcd1234ef56  yoki  startapp=create
export function getStartParam() {
  return tg?.initDataUnsafe?.start_param ?? null
}

export function haptic(kind = 'light') {
  const h = tg?.HapticFeedback
  if (!h) return
  try {
    if (['success', 'error', 'warning'].includes(kind)) h.notificationOccurred(kind)
    else if (kind === 'select') h.selectionChanged()
    else h.impactOccurred(kind)
  } catch {
    /* ignore */
  }
}

export function showBackButton(handler) {
  const b = tg?.BackButton
  if (!b) return () => {}
  b.show()
  b.onClick(handler)
  return () => {
    b.offClick(handler)
    b.hide()
  }
}

export function confirmAction(message) {
  return new Promise((resolve) => {
    if (tg?.showConfirm && tg.isVersionAtLeast?.('6.2')) tg.showConfirm(message, (ok) => resolve(Boolean(ok)))
    else resolve(window.confirm(message))
  })
}

export function toast(message) {
  if (tg?.showAlert && tg.isVersionAtLeast?.('6.2')) tg.showAlert(message)
  else window.alert(message)
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    haptic('success')
    return true
  } catch {
    // Eski WebView'lar uchun zaxira usul
    try {
      const el = document.createElement('textarea')
      el.value = text
      el.style.position = 'fixed'
      el.style.opacity = '0'
      document.body.appendChild(el)
      el.select()
      const ok = document.execCommand('copy')
      el.remove()
      if (ok) haptic('success')
      return ok
    } catch {
      return false
    }
  }
}

/** Kodni ulashish: havola bosilsa bot ochiladi va kod avtomatik qabul qilinadi. */
export function shareToken(token, title) {
  const link = botLink(token.replace(/-/g, '')) ?? window.location.origin
  const text = `📝 «${title}» testi\nKod: ${token}\n\nHavolani bosing yoki kodni botga yuboring.`
  const url = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`
  if (tg?.openTelegramLink) tg.openTelegramLink(url)
  else window.open(url, '_blank', 'noopener')
}

export function openLink(url) {
  if (url.startsWith('https://t.me/') && tg?.openTelegramLink) tg.openTelegramLink(url)
  else window.open(url, '_blank', 'noopener')
}
