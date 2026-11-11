import { tg } from './telegram'

// Server API manzili. Vercel'da: /api (shu sayt ichida).
// Supabase Edge Function ishlatilsa: VITE_API_URL=https://<ref>.supabase.co/functions/v1/api
const API_URL = String(import.meta.env.VITE_API_URL || '/api').trim()

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

// Kodni xxxx-xxxx-xxxx ko'rinishiga keltiradi: registr, bo'shliq, uzun tire va
// ko'rinmas belgilar (telefonda nusxalashda qo'shilib qoladi) e'tiborga olinmaydi.
export function cleanToken(raw) {
  const key = String(raw ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
  return key.length === 12 ? key.match(/.{4}/g).join('-') : String(raw ?? '').trim().toLowerCase()
}

async function call(action, data = {}) {
  let res
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Init-Data': tg?.initData || '',
      },
      body: JSON.stringify({ action, data }),
    })
  } catch {
    throw new ApiError("Serverga ulanib bo'lmadi. Internetni tekshiring.", 0)
  }
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const fallback =
      res.status === 404 ? 'Server API topilmadi (deploy sozlamalarini tekshiring).' : 'Xatolik yuz berdi'
    throw new ApiError(body?.error || fallback, res.status)
  }
  return body
}

export const db = {
  me: () => call('me'),
  createTest: (payload) => call('createTest', payload),
  getTest: (token) => call('getTest', { token: cleanToken(token) }),
  submit: (token, given, spentSeconds) => call('submit', { token: cleanToken(token), given, spentSeconds }),
  getAttempt: (id) => call('getAttempt', { id }),
  myTests: () => call('myTests'),
  testAttempts: (testId) => call('testAttempts', { testId }),
  setActive: (testId, active) => call('setActive', { testId, active }),
  deleteTest: (testId) => call('deleteTest', { testId }),
  myResults: () => call('myResults'),
  sendPdf: (pdfBase64, fileName, caption) => call('sendPdf', { pdfBase64, fileName, caption }),
}
