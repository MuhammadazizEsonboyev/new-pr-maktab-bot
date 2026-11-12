// =====================================================================
//  Baza qatlami — loyihadagi BARCHA baza chaqiruvlari shu fayl orqali o'tadi.
//
//  Hozir: Supabase (PostgREST) — {SUPABASE_URL}/rest/v1/rpc/<funksiya>
//
//  Boshqa Supabase loyihasiga o'tish: kod o'zgarmaydi, faqat SUPABASE_URL va
//  SUPABASE_SERVICE_ROLE_KEY ni almashtirasiz (QOLLANMA.md ga qarang).
//
//  Supabase'dan butunlay voz kechish (oddiy PostgreSQL, Neon, o'z serveringiz):
//  faqat shu fayldagi rpc() ni almashtirasiz — masalan PostgREST'ni o'zingiz
//  ko'tarasiz (kod o'zgarmaydi) yoki `select <funksiya>(...)` ni pg drayveri
//  bilan chaqirasiz. Qolgan kod faqat rpc(name, args) ni biladi.
// =====================================================================

import { HttpError } from './errors.js'

export function createDb(cfg, fetchImpl = fetch) {
  const configured = Boolean(cfg.supabaseUrl && cfg.serviceKey)

  async function rpc(name, args = {}) {
    if (!configured)
      throw new HttpError(500, 'Server sozlanmagan: SUPABASE_URL yoki SUPABASE_SERVICE_ROLE_KEY berilmagan.')

    const headers = { apikey: cfg.serviceKey, 'Content-Type': 'application/json' }
    // Eski (JWT) kalitlar Authorization'da ham yuboriladi; yangi sb_secret_ kalitlar faqat apikey'da.
    if (cfg.serviceKey.startsWith('eyJ')) headers.Authorization = `Bearer ${cfg.serviceKey}`

    let res
    try {
      res = await fetchImpl(`${cfg.supabaseUrl}/rest/v1/rpc/${name}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(args),
      })
    } catch {
      throw new HttpError(502, "Bazaga ulanib bo'lmadi. Keyinroq urinib ko'ring.")
    }

    const text = await res.text()
    let body = null
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      body = text
    }

    if (!res.ok) {
      const msg = String(body?.message || body?.error || '')
      if (body?.code === 'PGRST202' || /Could not find the function/i.test(msg))
        throw new HttpError(500, "Baza sxemasi eski yoki o'rnatilmagan: supabase/schema.sql ni SQL Editor'da qayta ishga tushiring.")
      if (res.status === 401 || res.status === 403 || /permission denied|Invalid API key/i.test(msg))
        throw new HttpError(500, "Server kaliti noto'g'ri: SUPABASE_SERVICE_ROLE_KEY ni tekshiring.")
      // Bizning `raise exception` xabarlari P0001 kodi bilan keladi — ular foydalanuvchi uchun.
      if (body?.code === 'P0001') throw new HttpError(400, msg)
      console.error('RPC error', name, res.status, text)
      throw new HttpError(500, 'Bazada xatolik yuz berdi.')
    }
    return body
  }

  return { configured, rpc }
}
