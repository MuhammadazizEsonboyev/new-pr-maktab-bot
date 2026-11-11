import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { createHmac } from 'node:crypto'
import { createHandler } from './supabase/functions/_shared/core.js'

/**
 * `npm run dev` paytida /api ni shu yerning o'zida ishga tushiradi (Vercel bilan bir xil kod).
 * DEV_USER_ID berilsa, Telegramdan tashqarida (oddiy brauzerda) o'sha foydalanuvchi nomidan
 * imzolangan initData yasaladi — faqat lokal sinov uchun, productionga ta'sir qilmaydi.
 */
function localApi(env) {
  return {
    name: 'local-api',
    configureServer(server) {
      server.middlewares.use('/api', middleware(env))
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api', middleware(env))
    },
  }
}

function middleware(env) {
  const handle = createHandler(env)
  return async (req, res) => {
    const chunks = []
    for await (const c of req) chunks.push(c)
    const headers = new Headers()
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)

    if (!headers.get('x-telegram-init-data') && env.DEV_USER_ID && env.BOT_TOKEN) {
      headers.set('x-telegram-init-data', signInitData(env.BOT_TOKEN, {
        id: Number(env.DEV_USER_ID),
        first_name: env.DEV_USER_NAME || 'Sinov',
      }))
    }

    const request = new Request(`http://localhost${req.originalUrl}`, {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks),
    })
    const response = await handle(request)
    res.statusCode = response.status
    response.headers.forEach((v, k) => res.setHeader(k, v))
    res.end(Buffer.from(await response.arrayBuffer()))
  }
}

export function signInitData(botToken, user, extra = {}) {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: 'dev',
    user: JSON.stringify(user),
    ...extra,
  })
  const dcs = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join('\n')
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest()
  params.set('hash', createHmac('sha256', secret).update(dcs).digest('hex'))
  return params.toString()
}

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env }
  return {
    plugins: [react(), localApi(env)],
    base: '/',
    server: { host: true, port: 5173, allowedHosts: true },
    build: { outDir: 'dist', sourcemap: false },
  }
})
