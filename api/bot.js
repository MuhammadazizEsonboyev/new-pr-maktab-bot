// Vercel Function: https://<sayt>/api/bot — Telegram bot (webhook).
// Ulash: brauzerda bir marta  https://<sayt>/api/bot?setup=1  ni oching.
// Holatni tekshirish:          https://<sayt>/api/bot
import { createBotHandler } from '../supabase/functions/_shared/bot.js'

let handler
const run = (req) => (handler ??= createBotHandler(process.env))(req)

export function POST(req) {
  return run(req)
}

export function GET(req) {
  return run(req)
}
