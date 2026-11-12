# 🧪 Test Bot — Telegram bot + Mini App

Javoblar kaliti asosidagi test platformasi. Ustoz faqat **to‘g‘ri javoblarni** kiritadi va
**kod** oladi. O‘quvchi kodni botga yuboradi yoki mini appga kiritadi, javoblarini belgilaydi,
natijani darhol ko‘radi va PDF qilib oladi. Har bir natija haqida ustozga bot orqali xabar keladi.

React 18 + Vite 5 + Tailwind 3 · Server API (Vercel yoki Supabase Edge) · Supabase Postgres · aiogram 3.

## Qanday bog‘langan

```
 Telegram bot (bot/bot.py) ──── tugmalar / Menu ────▶  Mini App (src/, Vercel)
        ▲                                                  │  X-Telegram-Init-Data
        │ «Yangi natija» xabari, PDF fayl                  ▼
        └──────────────────────────────  Server API (api/index.js = supabase/functions/api)
                                            │  initData imzosini BOT_TOKEN bilan tekshiradi
                                            ▼  service_role kaliti
                                     Supabase Postgres (supabase/schema.sql)
```

- Bot va server **bitta `BOT_TOKEN`** va **bitta `ALLOWED_CREATOR_IDS`** dan foydalanadi.
- Foydalanuvchi kimligini faqat server aniqlaydi (Telegram imzosi orqali) — brauzerdan
  birovning nomidan ish qilib bo‘lmaydi.
- Baza funksiyalari `anon` kalit uchun yopiq; ularni faqat server chaqiradi.

## O‘rnatish (3 qadam)

### 1. Supabase — baza

1. supabase.com → loyiha → **SQL Editor** → `supabase/schema.sql` ni to‘liq run qiling
   (eski baza ustiga ham xavfsiz, ma’lumotlar o‘chmaydi).
2. **Project Settings → API** dan `Project URL` va **service_role** (yoki `sb_secret_…`) kalitni oling.

### 2. Vercel — mini app + API

GitHub’ga yuklang va Vercel’da import qiling. **Settings → Environment Variables**:

| O‘zgaruvchi | Qiymat |
|---|---|
| `BOT_TOKEN` | @BotFather tokeni |
| `SUPABASE_URL` | `https://xxxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role kaliti (**maxfiy**) |
| `ALLOWED_CREATOR_IDS` | ustozlar ID si, vergul bilan: `8204982447,123456` |
| `WEBAPP_URL` | `https://pr-bot-mini-app.vercel.app` |
| `VITE_BOT_USERNAME` | `prezidentschool_bot` |

So‘ng **Redeploy**. Tekshirish: `https://<sayt>/api` ga brauzerda kirsangiz
`{"error":"Faqat POST…"}` chiqishi kerak.

> Vercel o‘rniga Supabase Edge Function ham ishlaydi (kod bir xil):
> `supabase functions deploy api --no-verify-jwt`, `supabase secrets set BOT_TOKEN=… ALLOWED_CREATOR_IDS=… WEBAPP_URL=…`,
> frontendda esa `VITE_API_URL=https://xxxx.supabase.co/functions/v1/api`.

### 3. Bot (kompyutersiz, Vercel'da)

Bot `api/bot.js` orqali Vercel'da ishlaydi — kompyuter yoki server kerak emas.
Deploy tugagach, brauzerda **bir marta** oching:

```
https://<sayt>/api/bot?setup=1
```

`"ok": true` chiqsa — bot ulandi (webhook, buyruqlar va «Menu» tugmasi sozlandi).
Holatni tekshirish: `https://<sayt>/api/bot` → `"ulangan": true`.

> `BOT_TOKEN` yoki sayt manzili o'zgarsa — `?setup=1` ni qayta oching.
> Yangi ustoz qo'shish: u botga `/id` yozadi → ID ni Vercel'dagi `ALLOWED_CREATOR_IDS` ga
> qo'shasiz → Redeploy.

**Muqobil — Render (bepul Web Service):** New Web Service → shu GitHub repo →
Root Directory: `bot`, Build: `pip install -r requirements.txt`, Start: `python bot.py`,
Instance: Free, Environment: `BOT_TOKEN`, `WEBAPP_URL`, `ALLOWED_CREATOR_IDS`.
Bepul servis 15 daqiqada uxlaydi — uptimerobot.com da Render manzilini har 5 daqiqada ping qiling.
`bot.py` ishga tushganda Vercel webhook'ini o'zi uzadi.

**Muqobil:** `bot/bot.py` (aiogram, polling) — o'z serveringizda ishlatmoqchi bo'lsangiz.
Ikkalasini birga ishlatmang: `bot.py` ni ishga tushirishdan oldin webhook'ni o'chiring
(`https://api.telegram.org/bot<TOKEN>/deleteWebhook`).

## Imkoniyatlar

**Ustoz:** test yaratish (yopiq A–E / ochiq / aralash, 1–200 savol), tez to‘ldirish
(`ABCDA…`), vaqt cheklovi, «faqat bir marta», javoblarni yashirish, kodni ulashish
(havola botni ochib testni darhol boshlaydi), reyting, o‘quvchi natijasini ochish, testni
yopish/o‘chirish, har bir natija haqida botda xabar.

**O‘quvchi:** kodni botga yuborish yoki ilovada kiritish, taymer, javoblar va taymer ilova
yopilsa ham saqlanadi, vaqt tugasa avtomatik yuborish, batafsil tahlil («faqat xatolar»
filtri), PDF bot chatiga keladi, natijalar tarixi.

Ochiq javoblarda registr, bo‘shliq va apostrof turi (ʻ ’ ') farqlanmaydi; sonlar son
sifatida solishtiriladi (`3,5` = `3.5` = `3.50`). Telegram qorong‘i mavzusi qo‘llab-quvvatlanadi.

## Lokal ishga tushirish

```bash
npm install
cp .env.example .env     # server qiymatlarini to‘ldiring, DEV_USER_ID ni oching
npm run dev              # http://localhost:5173 — /api ham shu yerda ishlaydi
```

`DEV_USER_ID` berilsa, oddiy brauzerda o‘sha foydalanuvchi nomidan kirasiz (faqat lokal
`npm run dev`/`preview` uchun, productionga ta’sir qilmaydi). Telegramda sinash uchun:
`npx cloudflared tunnel --url http://localhost:5173`.

## Tuzilishi

```
api/index.js                      Vercel funksiyasi (/api)
api/bot.js                        Telegram bot, webhook (/api/bot)
supabase/functions/_shared/core.js  Server API: initData tekshiruvi, ruxsatlar, xabarlar
supabase/functions/api/index.ts   Xuddi shu API — Supabase Edge varianti
supabase/schema.sql               Jadvallar va funksiyalar
supabase/functions/_shared/bot.js Bot mantiqi (webhook)
bot/bot.py                        Muqobil: bot polling rejimida (aiogram 3)
src/
  pages/      Home, CreateTest, CreateAnswers, TestCreated, MyTests, TestDetail,
              JoinTest, TakeTest, Result, MyResults, Gate
  components/ Page.jsx, ui.jsx
  context/    AuthContext (server tasdiqlagan foydalanuvchi), DraftContext
  lib/        db.js (API klient), telegram.js, pdf.js, utils.js
```

| Yo‘l | Ekran |
|---|---|
| `/` | Bosh menyu (ustozga 4 ta, o‘quvchiga 2 ta bo‘lim) |
| `/yaratish`, `/yaratish/javoblar` | Test yaratish (2 qadam) |
| `/yaratildi/:token` | Kod, nusxalash, ulashish |
| `/testlarim`, `/testlarim/:id` | Testlar, reyting, boshqaruv |
| `/qatnashish?kod=…` | Kod kiritish |
| `/test/:token` | Javob varaqasi, taymer |
| `/natija/:id` | Natija, tahlil, PDF |
| `/natijalarim` | Natijalar tarixi |

## Xavfsizlik

- `.env` faylni hech qachon gitga, arxivga yoki chatga qo‘ymang. Token tarqalgan bo‘lsa —
  @BotFather → `/revoke` qilib yangisini oling.
- `SUPABASE_SERVICE_ROLE_KEY` faqat serverda (Vercel env) turadi, frontendga tushmaydi.
