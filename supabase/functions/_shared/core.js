// =====================================================================
//  Test Bot — yagona server API (runtime-agnostik)
//
//  Bir xil kod ikki joyda ishlaydi:
//    • Vercel:          api/index.js           ->  https://<sayt>/api
//    • Supabase Edge:   supabase/functions/api ->  https://<ref>.supabase.co/functions/v1/api
//
//  Vazifasi:
//    1. Telegram initData'ni BOT_TOKEN bilan HMAC-SHA256 orqali tekshiradi.
//    2. Foydalanuvchi ID va ismini FAQAT tekshirilgan initData'dan oladi.
//    3. Admin (test yaratuvchi) ro'yxatini serverda tekshiradi.
//    4. Bazadagi funksiyalarni service_role kaliti bilan chaqiradi
//       (anon kalit bilan ular yopiq — schema.sql ga qarang).
//    5. Majburiy kanal obunasini tekshiradi (adminlar mustasno).
//    6. Adminlarni boshqaradi (qo'shish / o'chirish).
//    7. O'quvchi test topshirganda ustozga bot orqali xabar yuboradi.
//
//  Baza chaqiruvlari: database.js · Telegram: telegram.js · Ruxsatlar: access.js
// =====================================================================

import { HttpError } from './errors.js'
import { createDb } from './database.js'
import { createTelegram, escapeHtml } from './telegram.js'
import { createAccess, parseChannels } from './access.js'

export { HttpError }

const enc = new TextEncoder()

export function readConfig(env) {
  const get = (k) => (typeof env.get === 'function' ? env.get(k) : env[k]) ?? ''
  const ids = String(get('ALLOWED_CREATOR_IDS'))
    .split(/[\s,;]+/)
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isSafeInteger(n) && n > 0)
  return {
    botToken: String(get('BOT_TOKEN')).trim(),
    supabaseUrl: String(get('SUPABASE_URL') || get('VITE_SUPABASE_URL')).trim().replace(/\/+$/, ''),
    serviceKey: String(get('SUPABASE_SERVICE_ROLE_KEY') || get('SUPABASE_SECRET_KEY')).trim(),
    creators: new Set(ids),
    maxAge: Number(get('INIT_DATA_MAX_AGE_SECONDS')) || 86400,
    origin: String(get('ALLOWED_ORIGIN')).trim() || '*',
    notify: String(get('NOTIFY_OWNER') || '1') !== '0',
    webappUrl: String(get('WEBAPP_URL')).trim().replace(/\/+$/, ''),
    telegramApi: String(get('TELEGRAM_API_URL') || 'https://api.telegram.org').replace(/\/+$/, ''),
    // Majburiy obuna kanallari: "@kanal1, -1001234567890|https://t.me/+xxxx"
    channels: parseChannels(get('REQUIRED_CHANNELS')),
    // Ixtiyoriy: bot webhook manzili (Supabase Edge yoki boshqa hostingda kerak bo'ladi)
    botWebhookUrl: String(get('BOT_WEBHOOK_URL')).trim(),
  }
}

/* ----------------------------- yordamchilar ----------------------------- */

function hex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function hmac(key, message) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return crypto.subtle.sign('HMAC', k, enc.encode(message))
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false
  let out = 0
  for (let i = 0; i < a.length; i += 1) out |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return out === 0
}

/** Telegram Mini App initData tekshiruvi (core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app) */
export async function verifyInitData(initData, botToken, maxAge = 86400) {
  if (!initData) throw new HttpError(401, 'Ilovani Telegram bot orqali oching.')
  const params = new URLSearchParams(initData)
  const hash = params.get('hash')
  if (!hash) throw new HttpError(401, "Telegram ma'lumotlari noto'g'ri.")
  params.delete('hash')

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')

  const secret = await hmac(enc.encode('WebAppData'), botToken)
  const calculated = hex(await hmac(new Uint8Array(secret), dataCheckString))
  if (!safeEqual(calculated, hash.toLowerCase())) {
    throw new HttpError(401, "Telegram ma'lumotlari tasdiqlanmadi. Ilovani bot orqali qayta oching.")
  }

  const authDate = Number(params.get('auth_date') || 0)
  if (!authDate) throw new HttpError(401, 'Telegram sessiyasi topilmadi.')
  if (Math.floor(Date.now() / 1000) - authDate > maxAge) {
    throw new HttpError(401, 'Sessiya muddati tugagan. Ilovani yopib, qayta oching.')
  }

  let user = null
  try {
    user = JSON.parse(params.get('user') || 'null')
  } catch {
    user = null
  }
  if (!user?.id) throw new HttpError(401, 'Telegram foydalanuvchisi aniqlanmadi.')
  return user
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TYPES = new Set(['closed', 'open', 'mixed'])

function uuid(v, label) {
  const s = String(v ?? '')
  if (!UUID_RE.test(s)) throw new HttpError(400, `${label} noto'g'ri.`)
  return s
}

function str(v, max) {
  return String(v ?? '').trim().slice(0, max)
}

function cleanToken(raw) {
  const key = String(raw ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
  if (key.length !== 12) throw new HttpError(400, "Kod 12 ta belgidan iborat bo'lishi kerak: xxxx-xxxx-xxxx")
  return key.match(/.{4}/g).join('-')
}

function validateTest(d) {
  const title = str(d.title, 80)
  if (!title) throw new HttpError(400, 'Test nomini kiriting.')
  const type = TYPES.has(d.testType) ? d.testType : 'closed'
  const count = Number(d.questionCount)
  if (!Number.isInteger(count) || count < 1 || count > 200)
    throw new HttpError(400, "Savollar soni 1 dan 200 gacha bo'lishi kerak.")
  let limit = d.timeLimit == null || d.timeLimit === '' ? null : Number(d.timeLimit)
  if (limit != null && (!Number.isInteger(limit) || limit < 1 || limit > 600))
    throw new HttpError(400, "Vaqt 1 dan 600 daqiqagacha bo'lishi kerak.")
  if (!Array.isArray(d.answerKey) || d.answerKey.length !== count)
    throw new HttpError(400, 'Javoblar soni savollar soniga mos emas.')
  const key = d.answerKey.map((q, i) => {
    const qType = type === 'mixed' ? (q?.type === 'open' ? 'open' : 'closed') : type
    const answer = str(q?.answer, 100)
    if (!answer) throw new HttpError(400, `${i + 1}-savolning javobi kiritilmagan.`)
    if (qType === 'closed' && !/^[A-E]$/.test(answer.toUpperCase()))
      throw new HttpError(400, `${i + 1}-savol uchun A–E dan birini tanlang.`)
    return { n: i + 1, type: qType, answer: qType === 'closed' ? answer.toUpperCase() : answer }
  })
  return { title, type, count, limit, onceOnly: Boolean(d.onceOnly), show: d.showAnswers !== false, key }
}

function validateGiven(g) {
  const out = {}
  if (!g || typeof g !== 'object' || Array.isArray(g)) return out
  for (const [k, v] of Object.entries(g)) {
    const n = Number(k)
    if (!Number.isInteger(n) || n < 1 || n > 200) continue
    const s = str(v, 100)
    if (s) out[String(n)] = s
  }
  return out
}

/* ------------------------------- handler -------------------------------- */

export function createHandler(env, { fetchImpl = fetch } = {}) {
  const cfg = readConfig(env)

  const cors = {
    'Access-Control-Allow-Origin': cfg.origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-telegram-init-data',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
    'Cache-Control': 'no-store',
  }
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' },
    })

  const db = createDb(cfg, fetchImpl)
  const tg = createTelegram(cfg, fetchImpl)
  const access = createAccess(cfg, { db, tg })
  const rpc = db.rpc

  async function notifyOwner(ownerId, result) {
    if (!cfg.notify || !ownerId) return
    const text =
      `📥 <b>Yangi natija</b>\n` +
      `Test: <b>${escapeHtml(result.title)}</b>\n` +
      `O'quvchi: ${escapeHtml(result.user_name)}\n` +
      `Natija: <b>${result.correct}/${result.total}</b> (${Number(result.percent).toFixed(1)}%)`
    const extra = {}
    if (cfg.webappUrl) {
      extra.reply_markup = {
        inline_keyboard: [[{ text: '📊 Natijani ochish', web_app: { url: `${cfg.webappUrl}/#/natija/${result.id}` } }]],
      }
    }
    await tg.call('sendMessage', { chat_id: ownerId, text, parse_mode: 'HTML', disable_web_page_preview: true, ...extra }, { timeout: 3500 })
  }

  return async function handle(req) {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
    if (req.method !== 'POST') return json({ error: 'Faqat POST so‘rov qabul qilinadi.' }, 405)

    try {
      if (!cfg.botToken) throw new HttpError(500, 'Server sozlanmagan: BOT_TOKEN berilmagan.')
      if (!db.configured)
        throw new HttpError(500, 'Server sozlanmagan: SUPABASE_URL yoki SUPABASE_SERVICE_ROLE_KEY berilmagan.')

      const user = await verifyInitData(req.headers.get('x-telegram-init-data') || '', cfg.botToken, cfg.maxAge)
      const body = await req.json().catch(() => null)
      const action = String(body?.action || '')
      const d = body?.data && typeof body.data === 'object' ? body.data : {}

      const userId = Number(user.id)
      const name =
        [user.first_name, user.last_name].filter(Boolean).join(' ').trim().slice(0, 80) ||
        user.username ||
        'Foydalanuvchi'
      // Admin bo'lmaganlar uchun kanal obunasi tekshiriladi
      const gate = await access.gate(userId)
      const isCreator = gate.admin
      const needCreator = () => {
        if (!isCreator) throw new HttpError(403, "Bu amal faqat admin (ustoz) uchun.")
      }

      if (action === 'me') {
        return json({
          id: userId,
          name,
          username: user.username || '',
          isCreator,
          isSuperAdmin: access.isSuperAdmin(userId),
          subscribed: gate.ok,
          channels: gate.missing,
        })
      }

      if (!gate.ok) {
        throw new HttpError(403, "Botdan foydalanish uchun kanalimizga obuna bo'ling.", {
          code: 'NOT_SUBSCRIBED',
          channels: gate.missing,
        })
      }

      switch (action) {

        case 'createTest': {
          needCreator()
          const t = validateTest(d)
          return json(
            await rpc('create_test', {
              p_owner_id: userId,
              p_owner_name: name,
              p_title: t.title,
              p_type: t.type,
              p_count: t.count,
              p_time_limit: t.limit,
              p_once_only: t.onceOnly,
              p_show: t.show,
              p_answer_key: t.key,
            })
          )
        }

        case 'getTest':
          return json(await rpc('get_test', { p_token: cleanToken(d.token), p_user_id: userId }))

        case 'submit': {
          const spent = Number(d.spentSeconds)
          const result = await rpc('submit_attempt', {
            p_token: cleanToken(d.token),
            p_user_id: userId,
            p_name: name,
            p_given: validateGiven(d.given),
            p_spent: Number.isFinite(spent) && spent >= 0 ? Math.min(Math.round(spent), 86400) : null,
          })
          const ownerId = result?.owner_id
          delete result.owner_id
          await notifyOwner(ownerId, result)
          return json(result)
        }

        case 'getAttempt':
          return json(await rpc('get_attempt', { p_attempt_id: uuid(d.id, 'Natija ID'), p_user_id: userId }))

        case 'myTests':
          needCreator()
          return json(await rpc('my_tests', { p_owner_id: userId }))

        case 'testAttempts':
          needCreator()
          return json(await rpc('test_attempts', { p_test_id: uuid(d.testId, 'Test ID'), p_owner_id: userId }))

        case 'setActive':
          needCreator()
          return json(
            await rpc('set_test_active', {
              p_test_id: uuid(d.testId, 'Test ID'),
              p_owner_id: userId,
              p_active: Boolean(d.active),
            })
          )

        case 'deleteTest':
          needCreator()
          return json(await rpc('delete_test', { p_test_id: uuid(d.testId, 'Test ID'), p_owner_id: userId }))

        case 'sendPdf': {
          // PDF faqat so'rov yuborgan foydalanuvchining o'ziga (bot chatiga) yuboriladi
          const b64 = String(d.pdfBase64 || '')
          if (!b64 || b64.length > 3_000_000 || !/^[A-Za-z0-9+/=]+$/.test(b64))
            throw new HttpError(400, "PDF fayl noto'g'ri.")
          const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
          if (bin[0] !== 0x25 || bin[1] !== 0x50) throw new HttpError(400, "PDF fayl noto'g'ri.")
          const fileName = (str(d.fileName, 60).replace(/[^\w.-]+/g, '_') || 'natija') .replace(/(\.pdf)?$/i, '.pdf')
          const form = new FormData()
          form.append('chat_id', String(userId))
          form.append('caption', str(d.caption, 200) || '📄 Test natijangiz')
          form.append('document', new Blob([bin], { type: 'application/pdf' }), fileName)
          const tgBody = await tg.call('sendDocument', form, { timeout: 20000 })
          if (!tgBody?.ok) {
            if (/chat not found|bot was blocked|have no rights/i.test(tgBody?.description || ''))
              throw new HttpError(400, 'Avval botga /start yuboring, keyin qayta urinib ko‘ring.')
            throw new HttpError(502, 'PDF yuborilmadi. Keyinroq urinib ko‘ring.')
          }
          return json({ ok: true })
        }

        case 'myResults':
          return json(await rpc('my_results', { p_user_id: userId }))

        /* --------------------------- adminlar --------------------------- */

        case 'listAdmins':
          needCreator()
          return json(await access.listAdmins(userId))

        case 'addAdmin':
          needCreator()
          return json(await access.addAdmin(userId, name, d.userId, d.name))

        case 'removeAdmin':
          needCreator()
          return json(await access.removeAdmin(userId, d.userId))

        default:
          throw new HttpError(400, "Noma'lum amal.")
      }
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message, ...(e.extra || {}) }, e.status)
      console.error('Unexpected error:', e)
      return json({ error: 'Serverda kutilmagan xatolik yuz berdi.' }, 500)
    }
  }
}
