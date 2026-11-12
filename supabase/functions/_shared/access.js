// =====================================================================
//  Ruxsatlar: adminlar va majburiy kanal obunasi.
//
//  Adminlar ikki xil:
//    • Bosh admin  — ID si ALLOWED_CREATOR_IDS da (hosting sozlamalarida).
//                    Uni ilova orqali o'chirib bo'lmaydi.
//    • Admin       — bosh admin yoki boshqa admin ilova/bot orqali qo'shgan
//                    (bazadagi `admins` jadvali). Test yaratadi, o'zi ham
//                    admin qo'sha oladi.
//  O'chirish: bosh admin istalgan adminni, oddiy admin faqat o'zi qo'shganini.
//
//  Obuna: REQUIRED_CHANNELS dagi har bir kanalga a'zo bo'lmagan foydalanuvchi
//  botdan foydalana olmaydi. Adminlar tekshirilmaydi.
//  Bot har bir kanalda ADMIN bo'lishi shart — aks holda Telegram a'zolikni
//  aytmaydi va o'sha kanal tekshiruvi o'tkazib yuboriladi (logga yoziladi).
// =====================================================================

import { HttpError } from './errors.js'
import { escapeHtml } from './telegram.js'

const MEMBER = new Set(['creator', 'administrator', 'member'])
const ADMIN_TTL = 30_000 // admin ro'yxati keshi
const SUB_TTL = 120_000 // "obuna bo'lgan" natija keshi (obuna bo'lmaganlik keshlanmaydi)
const CHAN_TTL = 3_600_000 // kanal nomi/havolasi keshi

/**
 * REQUIRED_CHANNELS ni o'qiydi. Qo'llab-quvvatlanadigan ko'rinishlar (vergul yoki bo'shliq bilan):
 *   @kanal_nomi
 *   kanal_nomi  yoki  https://t.me/kanal_nomi
 *   -1001234567890|https://t.me/+AbCdEfGh      (yopiq kanal: ID | taklif havolasi)
 *   -1001234567890                              (havola bot orqali olinadi)
 */
export function parseChannels(raw) {
  return String(raw || '')
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((item) => {
      let [id, link = ''] = item.split('|').map((s) => s.trim())
      const fromUrl = id.match(/^(?:https?:\/\/)?t\.me\/([A-Za-z][A-Za-z0-9_]{3,})\/?$/i)
      if (fromUrl) id = `@${fromUrl[1]}`
      if (/^[A-Za-z][A-Za-z0-9_]{3,}$/.test(id)) id = `@${id}`
      if (!/^@[A-Za-z][A-Za-z0-9_]{3,}$/.test(id) && !/^-100\d{5,}$/.test(id)) {
        console.warn('REQUIRED_CHANNELS: noto‘g‘ri qiymat o‘tkazib yuborildi:', item)
        return null
      }
      if (link && !/^https:\/\/t\.me\//i.test(link)) link = ''
      if (!link && id.startsWith('@')) link = `https://t.me/${id.slice(1)}`
      return { id, link }
    })
    .filter(Boolean)
}

export function displayName(u) {
  if (!u) return ''
  return (
    [u.first_name, u.last_name].filter(Boolean).join(' ').trim().slice(0, 80) ||
    (u.username ? `@${u.username}` : '') ||
    u.title ||
    ''
  )
}

export function createAccess(cfg, { db, tg }) {
  const adminCache = new Map()
  const subCache = new Map()
  const chanCache = new Map()
  const now = () => Date.now()

  const isSuperAdmin = (uid) => cfg.creators.has(Number(uid))

  async function isAdmin(uid) {
    const id = Number(uid)
    if (!id) return false
    if (isSuperAdmin(id)) return true
    if (!db.configured) return false
    const c = adminCache.get(id)
    if (c && c.until > now()) return c.v
    try {
      const v = Boolean(await db.rpc('is_admin', { p_user_id: id }))
      adminCache.set(id, { v, until: now() + ADMIN_TTL })
      return v
    } catch (e) {
      console.warn('is_admin tekshirilmadi:', e?.message)
      return c?.v ?? false
    }
  }

  /* ----------------------------- obuna ----------------------------- */

  async function channelInfo(ch) {
    const c = chanCache.get(ch.id)
    if (c && c.until > now()) return c.v
    const r = await tg.call('getChat', { chat_id: ch.id }, { timeout: 4000 })
    const chat = r?.ok ? r.result : null
    const v = {
      id: ch.id,
      title: chat?.title || (ch.id.startsWith('@') ? ch.id : 'Kanal'),
      url: ch.link || (chat?.username ? `https://t.me/${chat.username}` : chat?.invite_link || ''),
    }
    chanCache.set(ch.id, { v, until: now() + (chat ? CHAN_TTL : 60_000) })
    return v
  }

  /** true — a'zo, false — a'zo emas, null — aniqlab bo'lmadi (bot kanalda admin emas va h.k.) */
  async function memberStatus(ch, uid) {
    const r = await tg.call('getChatMember', { chat_id: ch.id, user_id: Number(uid) }, { timeout: 4000 })
    if (!r?.ok) {
      const d = String(r?.description || '')
      // Foydalanuvchi kanalda umuman bo'lmagan holat
      if (/user not found|participant_id_invalid/i.test(d)) return false
      console.warn(`Obuna tekshirilmadi (${ch.id}): ${d}. Bot kanalda admin ekanini tekshiring.`)
      return null
    }
    const m = r.result || {}
    if (MEMBER.has(m.status)) return true
    if (m.status === 'restricted') return Boolean(m.is_member)
    return false
  }

  /** { ok, missing: [{ id, title, url }] } */
  async function checkSubscription(uid, { fresh = false } = {}) {
    if (!cfg.channels.length) return { ok: true, missing: [] }
    const id = Number(uid)
    const c = subCache.get(id)
    if (!fresh && c && c.until > now()) return { ok: true, missing: [] }

    const res = await Promise.all(cfg.channels.map((ch) => memberStatus(ch, id)))
    const notJoined = cfg.channels.filter((_, i) => res[i] === false)
    if (!notJoined.length) {
      subCache.set(id, { until: now() + SUB_TTL })
      return { ok: true, missing: [] }
    }
    subCache.delete(id)
    return { ok: false, missing: await Promise.all(notJoined.map(channelInfo)) }
  }

  /** Foydalanuvchi botdan foydalana oladimi: admin yoki barcha kanallarga a'zo */
  async function gate(uid) {
    const admin = await isAdmin(uid)
    if (admin) return { admin, ok: true, missing: [] }
    return { admin, ...(await checkSubscription(uid)) }
  }

  /** ?setup=1 uchun: bot har bir kanalda admin ekanini tekshiradi */
  async function diagnoseChannels() {
    if (!cfg.channels.length) return 'REQUIRED_CHANNELS berilmagan — obuna tekshirilmaydi'
    const me = await tg.call('getMe', {})
    const botId = me?.result?.id
    const out = {}
    for (const ch of cfg.channels) {
      const chat = await tg.call('getChat', { chat_id: ch.id })
      if (!chat?.ok) {
        out[ch.id] = `❌ Kanal topilmadi: ${chat?.description || ''}. Botni kanalga admin qiling.`
        continue
      }
      const m = botId ? await tg.call('getChatMember', { chat_id: ch.id, user_id: botId }) : null
      const st = m?.result?.status
      out[ch.id] =
        st === 'administrator' || st === 'creator'
          ? `✅ ${chat.result.title}: bot admin`
          : `❌ ${chat.result.title}: bot admin EMAS — kanal sozlamalaridan botni admin qiling`
    }
    return out
  }

  /* ----------------------------- adminlar ---------------------------- */

  function parseUserId(raw) {
    const id = Number(String(raw ?? '').trim())
    if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, "Telegram ID noto'g'ri. Faqat raqam bo'lishi kerak (masalan 123456789).")
    return id
  }

  async function listAdmins(viewerId) {
    const viewerSuper = isSuperAdmin(viewerId)
    const supers = await Promise.all(
      [...cfg.creators].map(async (id) => {
        const r = await tg.call('getChat', { chat_id: id }, { timeout: 3000 })
        return { user_id: id, name: displayName(r?.result) || null, super: true, canRemove: false }
      })
    )
    const rows = db.configured ? (await db.rpc('list_admins', {})) || [] : []
    const added = rows
      .filter((a) => !cfg.creators.has(Number(a.user_id)))
      .map((a) => ({
        ...a,
        super: false,
        canRemove: viewerSuper || Number(a.added_by) === Number(viewerId),
      }))
    return { admins: [...supers, ...added], viewerSuper }
  }

  async function addAdmin(byId, byName, rawTarget, rawName) {
    const target = parseUserId(rawTarget)
    if (target === Number(byId)) throw new HttpError(400, 'Siz allaqachon adminsiz.')
    if (isSuperAdmin(target)) throw new HttpError(400, 'Bu foydalanuvchi bosh admin (ALLOWED_CREATOR_IDS da).')

    // Telegram'dan ismini olishga harakat qilamiz (foydalanuvchi botga /start bosgan bo'lsa ishlaydi)
    const chat = await tg.call('getChat', { chat_id: target }, { timeout: 4000 })
    if (chat?.ok && chat.result?.type && chat.result.type !== 'private')
      throw new HttpError(400, 'Bu ID foydalanuvchiga emas, guruh yoki kanalga tegishli.')
    const name = String(rawName ?? '').trim().slice(0, 80) || displayName(chat?.result) || null

    const admin = await db.rpc('add_admin', { p_user_id: target, p_name: name, p_added_by: Number(byId) })
    adminCache.set(target, { v: true, until: now() + ADMIN_TTL })

    const sent = await tg.sendMessage(
      target,
      `🎉 <b>Siz admin qilib tayinlandingiz!</b>\n` +
        `Tayinlagan: ${escapeHtml(byName || byId)}\n\n` +
        `Endi test yaratishingiz va boshqa admin qo'shishingiz mumkin. Menyuni yangilash uchun /start bosing.`
    )
    return { admin, notified: Boolean(sent?.ok) }
  }

  async function removeAdmin(byId, rawTarget) {
    const target = parseUserId(rawTarget)
    if (isSuperAdmin(target)) throw new HttpError(400, "Bosh adminni ilova orqali o'chirib bo'lmaydi (ALLOWED_CREATOR_IDS dan olib tashlang).")
    const r = await db.rpc('remove_admin', {
      p_user_id: target,
      p_by: Number(byId),
      p_force: isSuperAdmin(byId),
    })
    adminCache.delete(target)
    await tg.sendMessage(target, 'ℹ️ Sizning admin huquqingiz olib tashlandi. /start')
    return r
  }

  return {
    isSuperAdmin,
    isAdmin,
    checkSubscription,
    gate,
    diagnoseChannels,
    listAdmins,
    addAdmin,
    removeAdmin,
  }
}
