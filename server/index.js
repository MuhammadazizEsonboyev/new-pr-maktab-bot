// =====================================================================
//  Universal Node server — Vercel'siz istalgan hostingda ishlatish uchun
//  (Render Web Service, Railway, Fly.io, Koyeb, VPS, cPanel Node.js App ...).
//
//  Bitta jarayon hammasini beradi:
//    /            -> mini app (dist/ papkadagi tayyor frontend)
//    /api         -> server API      (supabase/functions/_shared/core.js)
//    /api/bot     -> Telegram bot    (supabase/functions/_shared/bot.js)
//
//  Ishga tushirish:
//    npm install && npm run build && npm start
//  Sozlamalar muhit o'zgaruvchilaridan yoki loyiha ildizidagi .env dan o'qiladi.
//  PORT ni hosting o'zi beradi (bo'lmasa 3000).
// =====================================================================

import http from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHandler } from '../supabase/functions/_shared/core.js'
import { createBotHandler } from '../supabase/functions/_shared/bot.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST = path.join(ROOT, 'dist')

// Oddiy .env o'quvchi (muhitdagi qiymatlar ustun)
const envFile = path.join(ROOT, '.env')
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!m || line.trim().startsWith('#')) continue
    const value = m[2].split(' #')[0].trim().replace(/^(['"])(.*)\1$/, '$2')
    if (process.env[m[1]] === undefined) process.env[m[1]] = value
  }
}

const api = createHandler(process.env)
const bot = createBotHandler(process.env)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8',
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
}

async function toRequest(req) {
  const chunks = []
  for await (const c of req) chunks.push(c)
  const headers = new Headers()
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === 'string') headers.set(k, v)
    else if (Array.isArray(v)) headers.set(k, v.join(', '))
  }
  // Hosting proksisi ortida: haqiqiy protokol va domen
  const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim()
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost'
  return new Request(`${proto}://${host}${req.url}`, {
    method: req.method,
    headers,
    body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks),
  })
}

async function sendResponse(res, response) {
  res.statusCode = response.status
  response.headers.forEach((v, k) => res.setHeader(k, v))
  res.end(Buffer.from(await response.arrayBuffer()))
}

async function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  let file = path.normalize(path.join(DIST, urlPath))
  if (!file.startsWith(DIST)) {
    res.statusCode = 403
    return res.end('Forbidden')
  }
  try {
    if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html')
  } catch {
    file = path.join(DIST, 'index.html') // SPA: noma'lum yo'l -> index.html
  }
  try {
    const body = await readFile(file)
    const ext = path.extname(file)
    res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream')
    res.setHeader('Cache-Control', file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache')
    res.end(req.method === 'HEAD' ? undefined : body)
  } catch {
    res.statusCode = 404
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.end('dist/ topilmadi: avval `npm run build` ni bajaring.')
  }
}

const server = http.createServer(async (req, res) => {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v)
  try {
    const pathname = new URL(req.url, 'http://x').pathname.replace(/\/+$/, '')
    if (pathname === '/api/bot') return await sendResponse(res, await bot(await toRequest(req)))
    if (pathname === '/api') return await sendResponse(res, await api(await toRequest(req)))
    if (pathname === '/health') {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      return res.end('ok')
    }
    return await serveStatic(req, res)
  } catch (e) {
    console.error('Server xatosi:', e)
    if (!res.headersSent) res.statusCode = 500
    res.end('Server xatosi')
  }
})

const port = Number(process.env.PORT) || 3000
server.listen(port, '0.0.0.0', () => {
  console.log(`✅ Server ishlayapti: http://0.0.0.0:${port}  (mini app + /api + /api/bot)`)
  console.log('   Botni ulash: brauzerda  https://<domeningiz>/api/bot?setup=1  ni oching')
})
