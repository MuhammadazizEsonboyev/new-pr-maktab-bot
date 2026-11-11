// =====================================================================
//  Test Bot — Telegram bot (webhook rejimi). Kompyuter yoki server kerak emas:
//  Vercel'da  https://<sayt>/api/bot  manzilida ishlaydi.
//
//  Ulash (bir marta): brauzerda  https://<sayt>/api/bot?setup=1  ni oching.
//  Bu webhook'ni o'rnatadi, buyruqlar ro'yxati va «Menu» tugmasini sozlaydi.
//
//  bot/bot.py bilan bir xil ishlaydi. Ikkalasini birga ISHLATMANG:
//  webhook yoqilgan bo'lsa, bot.py (polling) ishlamaydi va aksincha.
// =====================================================================

import { readConfig } from './core.js'

const enc = new TextEncoder()

async function sha256hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(s))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Webhook maxfiy kaliti BOT_TOKEN dan hosil qilinadi — alohida o'zgaruvchi kerak emas */
export async function webhookSecret(botToken) {
  return (await sha256hex(`webhook:${botToken}`)).slice(0, 48)
}

export function extractToken(text) {
  if (!text || text.length > 40) return null
  const key = String(text).toLowerCase().replace(/[^a-z0-9]/g, '')
  if (!/^[a-f0-9]{12}$/.test(key)) return null
  return `${key.slice(0, 4)}-${key.slice(4, 8)}-${key.slice(8)}`
}

const WELCOME_TEACHER =
  '🧪 <b>Test Bot</b>\n\n' +
  'Siz <b>ustoz</b> sifatida kirdingiz.\n' +
  '1️⃣ Savollarni kanal yoki guruhga joylang.\n' +
  '2️⃣ «Test yaratish» orqali faqat to‘g‘ri javoblarni kiriting.\n' +
  '3️⃣ Berilgan kodni o‘quvchilarga yuboring.\n\n' +
  'Har bir o‘quvchi natijasi shu chatga keladi 📥'

const WELCOME_STUDENT =
  '🧪 <b>Test Bot</b>\n\n' +
  'Ustozingiz bergan <b>test kodini</b> shu yerga yuboring ' +
  '(masalan: <code>a1b2-c3d4-e5f6</code>) yoki quyidagi tugmani bosing.'

export function createBotHandler(env, { fetchImpl = fetch } = {}) {
  const cfg = readConfig(env)
  const app = (route = '') => (route ? `${cfg.webappUrl}/#${route}` : cfg.webappUrl)
  const btn = (text, route) => ({ text, web_app: { url: app(route) } })
  const isCreator = (id) => cfg.creators.has(Number(id))

  async function tg(method, body) {
    const res = await fetchImpl(`${cfg.telegramApi}/bot${cfg.botToken}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => null)
    if (!data?.ok) console.warn(`Telegram ${method} xato:`, data?.description)
    return data
  }

  const menu = (uid) => {
    const rows = []
    if (isCreator(uid)) {
      rows.push([btn('📝 Test yaratish', '/yaratish')])
      rows.push([btn('📚 Mening testlarim', '/testlarim')])
    }
    rows.push([btn('🎯 Testga qatnashish', '/qatnashish')])
    rows.push([btn('📊 Natijalarim', '/natijalarim')])
    return { inline_keyboard: rows }
  }

  const send = (chatId, text, markup) =>
    tg('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...(markup ? { reply_markup: markup } : {}),
    })

  const sendJoin = (chatId, token) =>
    send(chatId, `✅ Kod qabul qilindi: <code>${token}</code>\nTugmani bosing — test ochiladi.`, {
      inline_keyboard: [[btn('▶️ Testni boshlash', `/qatnashish?kod=${token}`)]],
    })

  async function onMessage(msg) {
    const chat = msg.chat
    const uid = msg.from?.id
    const text = String(msg.text ?? '').trim()
    if (!text) return

    const [rawCmd, ...rest] = text.split(/\s+/)
    const cmd = rawCmd.startsWith('/') ? rawCmd.slice(1).split('@')[0].toLowerCase() : null
    const args = rest.join(' ')

    // /id hamma joyda ishlaydi; qolganlari faqat shaxsiy chatda (web_app tugmalar guruhda ishlamaydi)
    if (cmd === 'id') return send(chat.id, `Sizning Telegram ID: <code>${uid}</code>`)
    if (chat.type !== 'private') return

    if (cmd === 'start') {
      const token = extractToken(args)
      if (token) return sendJoin(chat.id, token)
      return send(chat.id, isCreator(uid) ? WELCOME_TEACHER : WELCOME_STUDENT, menu(uid))
    }
    if (cmd === 'help') {
      return send(
        chat.id,
        'ℹ️ <b>Yordam</b>\n\n' +
          '• Test kodini yuboring — test ochiladi.\n' +
          '• /start — asosiy menyu.\n' +
          '• Natijalaringiz «📊 Natijalarim» bo‘limida saqlanadi.\n' +
          '• PDF natijani mini app ichidan shu chatga olishingiz mumkin.',
        menu(uid)
      )
    }

    const token = extractToken(text)
    if (token) return sendJoin(chat.id, token)

    return send(
      chat.id,
      '🤔 Bu test kodiga o‘xshamaydi. Kod 12 ta belgidan iborat: <code>xxxx-xxxx-xxxx</code>.\nYoki menyudan foydalaning:',
      menu(uid)
    )
  }

  async function setup(origin) {
    const base = cfg.webappUrl || origin
    if (!cfg.webappUrl) cfg.webappUrl = base
    const url = `${base}/api/bot`
    const steps = {}
    steps.webhook = await tg('setWebhook', {
      url,
      secret_token: await webhookSecret(cfg.botToken),
      allowed_updates: ['message'],
      drop_pending_updates: true,
    })
    steps.commands = await tg('setMyCommands', {
      commands: [
        { command: 'start', description: 'Asosiy menyu' },
        { command: 'help', description: 'Yordam' },
        { command: 'id', description: 'Telegram ID ni bilish' },
      ],
    })
    steps.menu = await tg('setChatMenuButton', {
      menu_button: { type: 'web_app', text: 'Ilovani ochish', web_app: { url: app() } },
    })
    const ok = Object.values(steps).every((s) => s?.ok)
    return { ok, url, steps: Object.fromEntries(Object.entries(steps).map(([k, v]) => [k, v?.ok ? 'OK' : v?.description || 'xato'])) }
  }

  const json = (body, status = 200) =>
    new Response(JSON.stringify(body, null, 2), {
      status,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    })

  return async function handle(req) {
    if (!cfg.botToken) return json({ ok: false, error: 'BOT_TOKEN berilmagan (Vercel → Environment Variables).' }, 500)

    if (req.method === 'GET') {
      const u = new URL(req.url)
      if (u.searchParams.get('setup') === '1') {
        if (!cfg.webappUrl && !u.origin.startsWith('https://'))
          return json({ ok: false, error: 'WEBAPP_URL berilmagan.' }, 500)
        const r = await setup(cfg.webappUrl || u.origin)
        return json(
          r.ok
            ? { ...r, xabar: '✅ Bot ulandi. Endi botga /start yozing. bot.py ni ishga tushirish shart emas.' }
            : { ...r, xabar: '❌ Ulanmadi. BOT_TOKEN to‘g‘riligini tekshiring.' },
          r.ok ? 200 : 500
        )
      }
      const info = await tg('getWebhookInfo', {})
      const expected = `${cfg.webappUrl || u.origin}/api/bot`
      const r = info?.result || {}
      return json({
        ulangan: r.url === expected,
        webhook: r.url || '(yo‘q)',
        kutilmoqda: r.pending_update_count ?? 0,
        oxirgi_xato: r.last_error_message || null,
        yordam: r.url === expected ? 'Bot ishlayapti ✅' : `Ulash uchun oching: ${expected}?setup=1`,
      })
    }

    if (req.method !== 'POST') return json({ ok: false }, 405)

    const secret = req.headers.get('x-telegram-bot-api-secret-token') || ''
    if (secret !== (await webhookSecret(cfg.botToken))) return json({ ok: false }, 401)

    try {
      const update = await req.json()
      if (update?.message) await onMessage(update.message)
    } catch (e) {
      // Telegramga har doim 200 qaytaramiz — aks holda u bir xil xabarni qayta-qayta yuboradi
      console.error('Bot xatosi:', e)
    }
    return json({ ok: true })
  }
}
