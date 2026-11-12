// Telegram Bot API bilan ishlash — server API ham, bot ham shuni ishlatadi.
// Hech qachon xato tashlamaydi: har doim { ok, result?, description? } qaytaradi.

export function createTelegram(cfg, fetchImpl = fetch) {
  async function call(method, body = {}, { timeout = 8000 } = {}) {
    const isForm = typeof FormData !== 'undefined' && body instanceof FormData
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeout)
    try {
      const res = await fetchImpl(`${cfg.telegramApi}/bot${cfg.botToken}/${method}`, {
        method: 'POST',
        headers: isForm ? undefined : { 'Content-Type': 'application/json' },
        body: isForm ? body : JSON.stringify(body),
        signal: ctrl.signal,
      })
      const data = await res.json().catch(() => null)
      if (!data?.ok) console.warn(`Telegram ${method}:`, data?.description)
      return data || { ok: false, description: `HTTP ${res.status}` }
    } catch (e) {
      console.warn(`Telegram ${method} ulanmadi:`, e?.message)
      return { ok: false, description: e?.name === 'AbortError' ? 'timeout' : e?.message || 'network' }
    } finally {
      clearTimeout(timer)
    }
  }

  const sendMessage = (chatId, text, extra = {}) =>
    call('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true, ...extra })

  return { call, sendMessage }
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
}
