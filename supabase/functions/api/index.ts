// Supabase Edge Function: /functions/v1/api
// (Vercel'da xuddi shu kod api/index.js orqali ishlaydi — ikkalasidan birini tanlang.)
//
// Deploy:
//   supabase functions deploy api --no-verify-jwt
//   supabase secrets set BOT_TOKEN=... ALLOWED_CREATOR_IDS=8204982447 WEBAPP_URL=https://...
// SUPABASE_URL va SUPABASE_SERVICE_ROLE_KEY Supabase tomonidan avtomatik beriladi.
// Frontendda: VITE_API_URL=https://<ref>.supabase.co/functions/v1/api

// @ts-ignore — oddiy JS modul
import { createHandler } from '../_shared/core.js'

Deno.serve(createHandler(Deno.env))
