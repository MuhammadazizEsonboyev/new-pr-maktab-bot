// Supabase Edge Function: /functions/v1/bot — Telegram bot (webhook).
// (Vercel'da xuddi shu kod api/bot.js orqali ishlaydi — faqat bittasini ulang.)
//
// Deploy:
//   supabase functions deploy bot --no-verify-jwt
//   supabase secrets set BOT_WEBHOOK_URL=https://<ref>.supabase.co/functions/v1/bot
// So'ng brauzerda bir marta oching:  https://<ref>.supabase.co/functions/v1/bot?setup=1

// @ts-ignore — oddiy JS modul
import { createBotHandler } from '../_shared/bot.js'

Deno.serve(createBotHandler(Deno.env))
