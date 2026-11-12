// =====================================================================
//  Test Bot — Telegram bot (webhook rejimi). Kompyuter yoki server kerak emas.
//
//  Qayerda ishlaydi (kod bir xil):
//    • Vercel:          api/bot.js                -> https://<sayt>/api/bot
//    • Supabase Edge:   supabase/functions/bot    -> https://<ref>.supabase.co/functions/v1/bot
//    • Istalgan Node:   server/index.js           -> https://<server>/api/bot
//
//  Ulash (bir marta, har ko'chirishdan keyin ham): brauzerda  <manzil>?setup=1  ni oching.
//  Bu webhook'ni o'rnatadi, buyruqlar ro'yxati va «Menu» tugmasini sozlaydi,
//  majburiy kanallarda bot admin ekanini tekshiradi.
//
//  bot/bot.py bilan bir xil ishlaydi. Ikkalasini birga ISHLATMANG:
//  webhook yoqilgan bo'lsa, bot.py (polling) ishlamaydi va aksincha.
// =====================================================================

import { readConfig } from './core.js'
import { createDb } from './database.js'
import { createTelegram, escapeHtml } from './telegram.js'
import { createAccess } from './access.js'
import { HttpError } from './errors.js'

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
  'Siz <b>admin (ustoz)</b> sifatida kirdingiz.\n' +
  '1️⃣ Savollarni kanal yoki guruhga joylang.\n' +
  '2️⃣ «Test yaratish» orqali faqat to‘g‘ri javoblarni kiriting.\n' +
  '3️⃣ Berilgan kodni o‘quvchilarga yuboring.\n\n' +
  'Har bir o‘quvchi natijasi shu chatga keladi 📥\n' +
  'Yangi admin qo‘shish: «👥 Adminlar» yoki /addadmin'

const WELCOME_STUDENT =
  '🧪 <b>Test Bot</b>\n\n' +
  'Ustozingiz bergan <b>test kodini</b> shu yerga yuboring ' +
  '(masalan: <code>a1b2-c3d4-e5f6</code>) yoki quyidagi tugmani bosing.'

const ADMIN_HELP =
  '👥 <b>Admin buyruqlari</b>\n' +
  '• /admins — adminlar ro‘yxati\n' +
  '• /addadmin <code>ID</code> [ism] — yangi admin qo‘shish\n' +
  '• /deladmin <code>ID</code> — adminni o‘chirish\n' +
  'ID ni bilish uchun u odam botga /id yozadi.'

export function createBotHandler(env, { fetchImpl = fetch } = {}) {
  const cfg = readConfig(env)
  const db = createDb(cfg, fetchImpl)
  const tg = createTelegram(cfg, fetchImpl)
  const access = createAccess(cfg, { db, tg })

  const app = (route = '') => (route ? `${cfg.webappUrl}/#${route}` : cfg.webappUrl)
  const btn = (text, route) => ({ text, web_app: { url: app(route) } })

  const menu = (admin) => {
    const rows = []
    if (admin) {
      rows.push([btn('📝 Test yaratish', '/yaratish')])
      rows.push([btn('📚 Mening testlarim', '/testlarim')])
      rows.push([btn('👥 Adminlar', '/adminlar')])
    }
    rows.push([btn('🎯 Testga qatnashish', '/qatnashish')])
    rows.push([btn('📊 Natijalarim', '/natijalarim')])
    return { inline_keyboard: rows }
  }

  const send = (chatId, text, markup) => tg.sendMessage(chatId, text, markup ? { reply_markup: markup } : {})

  const sendJoin = (chatId, token) =>
    send(chatId, `✅ Kod qabul qilindi: <code>${token}</code>\nTugmani bosing — test ochiladi.`, {
      inline_keyboard: [[btn('▶️ Testni boshlash', `/qatnashish?kod=${token}`)]],
    })

  /** Obuna talab qiluvchi xabar. token — obunadan keyin ochiladigan test (bo'lsa) */
  const subscribeMarkup = (missing, token) => ({
    inline_keyboard: [
      ...missing.filter((c) => c.url).map((c) => [{ text: `📢 ${c.title}`, url: c.url }]),
      [{ text: '✅ Obuna bo‘ldim', callback_data: token ? `sub:${token}` : 'sub' }],
    ],
  })
  const subscribeText = (missing) =>
    '🔒 <b>Botdan foydalanish uchun kanalimizga obuna bo‘ling</b>\n\n' +
    missing.map((c) => `• ${escapeHtml(c.title)}`).join('\n') +
    '\n\nObuna bo‘lgach, «✅ Obuna bo‘ldim» tugmasini bosing.'

  async function adminCommand(chatId, uid, name, cmd, args) {
    try {
      if (cmd === 'admins') {
        const { admins } = await access.listAdmins(uid)
        const lines = admins.map(
          (a) => `${a.super ? '⭐️' : '•'} ${escapeHtml(a.name || 'Nomaʼlum')} — <code>${a.user_id}</code>`
        )
        return send(chatId, `👥 <b>Adminlar (${admins.length})</b>\n⭐️ — bosh admin\n\n${lines.join('\n')}\n\n${ADMIN_HELP}`)
      }
      const [rawId, ...nameParts] = args.split(/\s+/).filter(Boolean)
      if (!rawId) return send(chatId, ADMIN_HELP)
      if (cmd === 'addadmin') {
        const r = await access.addAdmin(uid, name, rawId, nameParts.join(' '))
        return send(
          chatId,
          `✅ <b>${escapeHtml(r.admin?.name || rawId)}</b> admin qilindi.\n` +
            (r.notified
              ? 'Unga xabar yuborildi.'
              : '⚠️ Unga xabar yetmadi — u botga hali /start bosmagan. /start bossa, admin menyusi chiqadi.')
        )
      }
      if (cmd === 'deladmin') {
        await access.removeAdmin(uid, rawId)
        return send(chatId, `🗑 <code>${escapeHtml(rawId)}</code> adminlikdan olindi.`)
      }
    } catch (e) {
      return send(chatId, `❌ ${escapeHtml(e instanceof HttpError ? e.message : 'Xatolik yuz berdi')}`)
    }
  }

  async function onMessage(msg) {
    const chat = msg.chat
    const uid = msg.from?.id
    const text = String(msg.text ?? '').trim()
    if (!text || !uid) return

    const [rawCmd, ...rest] = text.split(/\s+/)
    const cmd = rawCmd.startsWith('/') ? rawCmd.slice(1).split('@')[0].toLowerCase() : null
    const args = rest.join(' ')

    // /id hamma joyda va obunasiz ham ishlaydi (yangi admin ID sini bilishi uchun)
    if (cmd === 'id') return send(chat.id, `Sizning Telegram ID: <code>${uid}</code>`)
    if (chat.type !== 'private') return

    const token = cmd === 'start' ? extractToken(args) : cmd ? null : extractToken(text)
    const gate = await access.gate(uid)
    if (!gate.ok) return send(chat.id, subscribeText(gate.missing), subscribeMarkup(gate.missing, token))

    const name = [msg.from.first_name, msg.from.last_name].filter(Boolean).join(' ') || msg.from.username || ''

    if (cmd === 'start') {
      if (token) return sendJoin(chat.id, token)
      return send(chat.id, gate.admin ? WELCOME_TEACHER : WELCOME_STUDENT, menu(gate.admin))
    }
    if (cmd === 'help') {
      return send(
        chat.id,
        'ℹ️ <b>Yordam</b>\n\n' +
          '• Test kodini yuboring — test ochiladi.\n' +
          '• /start — asosiy menyu.\n' +
          '• Natijalaringiz «📊 Natijalarim» bo‘limida saqlanadi.\n' +
          '• PDF natijani mini app ichidan shu chatga olishingiz mumkin.' +
          (gate.admin ? `\n\n${ADMIN_HELP}` : ''),
        menu(gate.admin)
      )
    }
    if (cmd === 'admins' || cmd === 'addadmin' || cmd === 'deladmin') {
      if (!gate.admin) return send(chat.id, '⛔️ Bu buyruq faqat adminlar uchun.')
      return adminCommand(chat.id, uid, name, cmd, args)
    }

    if (token) return sendJoin(chat.id, token)

    return send(
      chat.id,
      '🤔 Bu test kodiga o‘xshamaydi. Kod 12 ta belgidan iborat: <code>xxxx-xxxx-xxxx</code>.\nYoki menyudan foydalaning:',
      menu(gate.admin)
    )
  }

  async function onCallback(cq) {
    const data = String(cq.data || '')
    const uid = cq.from?.id
    const chatId = cq.message?.chat?.id
    if (!data.startsWith('sub') || !uid) return tg.call('answerCallbackQuery', { callback_query_id: cq.id })

    const token = extractToken(data.slice(4))
    // "Obuna bo'lmagan" natija keshlanmaydi — har bosishda Telegramdan qayta so'raladi
    const gate = await access.gate(uid)
    if (!gate.ok) {
      return tg.call('answerCallbackQuery', {
        callback_query_id: cq.id,
        text: `❌ Hali obuna bo‘lmagansiz: ${gate.missing.map((c) => c.title).join(', ')}`,
        show_alert: true,
      })
    }

    await tg.call('answerCallbackQuery', { callback_query_id: cq.id, text: '✅ Rahmat! Obuna tasdiqlandi.' })
    if (chatId && cq.message?.message_id) {
      await tg.call('editMessageText', {
        chat_id: chatId,
        message_id: cq.message.message_id,
        text: '✅ Obuna tasdiqlandi. Xush kelibsiz!',
      })
    }
    if (!chatId) return
    if (token) return sendJoin(chatId, token)
    return send(chatId, gate.admin ? WELCOME_TEACHER : WELCOME_STUDENT, menu(gate.admin))
  }

  function webhookUrl(origin) {
    return cfg.botWebhookUrl || `${cfg.webappUrl || origin}/api/bot`
  }

  async function setup(origin) {
    if (!cfg.webappUrl) cfg.webappUrl = origin
    const url = webhookUrl(origin)
    const steps = {}
    steps.webhook = await tg.call('setWebhook', {
      url,
      secret_token: await webhookSecret(cfg.botToken),
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: true,
    })
    steps.commands = await tg.call('setMyCommands', {
      commands: [
        { command: 'start', description: 'Asosiy menyu' },
        { command: 'help', description: 'Yordam' },
        { command: 'id', description: 'Telegram ID ni bilish' },
        { command: 'admins', description: 'Adminlar (faqat admin)' },
      ],
    })
    steps.menu = await tg.call('setChatMenuButton', {
      menu_button: { type: 'web_app', text: 'Ilovani ochish', web_app: { url: app() } },
    })
    const ok = Object.values(steps).every((s) => s?.ok)
    return {
      ok,
      url,
      steps: Object.fromEntries(Object.entries(steps).map(([k, v]) => [k, v?.ok ? 'OK' : v?.description || 'xato'])),
      kanallar: await access.diagnoseChannels(),
      baza: db.configured ? 'OK' : '❌ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY berilmagan — qo‘shilgan adminlar ishlamaydi',
    }
  }

  const json = (body, status = 200) =>
    new Response(JSON.stringify(body, null, 2), {
      status,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    })

  return async function handle(req) {
    if (!cfg.botToken) return json({ ok: false, error: 'BOT_TOKEN berilmagan (hosting → Environment Variables).' }, 500)

    if (req.method === 'GET') {
      const u = new URL(req.url)
      const origin = u.origin.replace(/^http:\/\//, 'https://')
      if (u.searchParams.get('setup') === '1') {
        if (!cfg.webappUrl && !u.origin.startsWith('https://'))
          return json({ ok: false, error: 'WEBAPP_URL berilmagan.' }, 500)
        const r = await setup(cfg.webappUrl || origin)
        return json(
          r.ok
            ? { ...r, xabar: '✅ Bot ulandi. Endi botga /start yozing. bot.py ni ishga tushirish shart emas.' }
            : { ...r, xabar: '❌ Ulanmadi. BOT_TOKEN to‘g‘riligini tekshiring.' },
          r.ok ? 200 : 500
        )
      }
      const info = await tg.call('getWebhookInfo', {})
      const expected = webhookUrl(origin)
      const r = info?.result || {}
      const callbacks = (r.allowed_updates || ['message', 'callback_query']).includes('callback_query')
      const connected = r.url === expected && callbacks
      return json({
        ulangan: connected,
        webhook: r.url || '(yo‘q)',
        kutilmoqda: r.pending_update_count ?? 0,
        oxirgi_xato: r.last_error_message || null,
        majburiy_kanallar: cfg.channels.map((c) => c.id),
        yordam: connected
          ? 'Bot ishlayapti ✅'
          : `Ulash (yoki yangilash) uchun oching: ${u.origin}${u.pathname}?setup=1`,
      })
    }

    if (req.method !== 'POST') return json({ ok: false }, 405)

    const secret = req.headers.get('x-telegram-bot-api-secret-token') || ''
    if (secret !== (await webhookSecret(cfg.botToken))) return json({ ok: false }, 401)

    try {
      const update = await req.json()
      if (update?.message) await onMessage(update.message)
      else if (update?.callback_query) await onCallback(update.callback_query)
    } catch (e) {
      // Telegramga har doim 200 qaytaramiz — aks holda u bir xil xabarni qayta-qayta yuboradi
      console.error('Bot xatosi:', e)
    }
    return json({ ok: true })
  }
}
