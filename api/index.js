// Vercel Function: https://<sayt>/api
// Environment Variables (Vercel → Settings → Environment Variables):
//   BOT_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ALLOWED_CREATOR_IDS, WEBAPP_URL
import { createHandler } from '../supabase/functions/_shared/core.js'

let handler
const run = (req) => (handler ??= createHandler(process.env))(req)

export function POST(req) {
  return run(req)
}

export function OPTIONS(req) {
  return run(req)
}

export function GET(req) {
  return run(req)
}
