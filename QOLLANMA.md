# Hosting yoki Supabase'ni almashtirish — to‘liq qo‘llanma

Loyiha ko‘chirishga moslab yozilgan: **kod hech qayerda manzil yoki kalitni “qattiq” saqlamaydi**,
hammasi muhit o‘zgaruvchilaridan (Environment Variables) o‘qiladi. Shuning uchun ko‘chirish
deyarli har doim faqat **o‘zgaruvchilarni yangi joyga yozish + `?setup=1` ni ochish** dan iborat.

## 0. Loyiha qanday qismlardan iborat

| Qism | Nima qiladi | Qayerda turishi mumkin |
|---|---|---|
| **Mini app** (`src/` → `dist/`) | Telegram ichida ochiladigan sahifa | Vercel, Netlify, Cloudflare Pages, Render, VPS — istalgan statik hosting |
| **Server API** (`_shared/core.js`) | Foydalanuvchini tekshiradi, bazaga yozadi | Vercel (`api/index.js`), Supabase Edge (`functions/api`), istalgan Node (`server/index.js`) |
| **Bot** (`_shared/bot.js` yoki `bot/bot.py`) | Telegramdagi xabarlar, obuna, admin buyruqlari | Vercel (`api/bot.js`), Supabase Edge (`functions/bot`), istalgan Node, yoki Python (`bot.py`) |
| **Baza** (`supabase/schema.sql`) | Testlar, natijalar, adminlar | Istalgan Supabase loyihasi |

Barcha baza chaqiruvlari bitta faylda — `supabase/functions/_shared/database.js` (Python botda — `rpc()` funksiyasi).
Barcha Telegram chaqiruvlari — `_shared/telegram.js`.

## 1. Muhit o‘zgaruvchilari — har qanday hostingda bir xil

| O‘zgaruvchi | Majburiy | Izoh |
|---|---|---|
| `BOT_TOKEN` | ✅ | @BotFather tokeni |
| `SUPABASE_URL` | ✅ | `https://xxxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | service_role yoki `sb_secret_…` kalit (**maxfiy**) |
| `ALLOWED_CREATOR_IDS` | ✅ | Bosh adminlar ID si, vergul bilan |
| `WEBAPP_URL` | ✅ | Mini app manzili (`https://…`, oxirida `/` siz) |
| `REQUIRED_CHANNELS` | — | Majburiy obuna kanallari: `@kanal` yoki `-100…\|https://t.me/+havola` |
| `VITE_BOT_USERNAME` | ✅ (build) | Bot username, `@` siz. **Build vaqtida** kerak |
| `VITE_API_URL` | — (build) | API boshqa domenda bo‘lsa (masalan Supabase Edge) |
| `BOT_WEBHOOK_URL` | — | Bot `/api/bot` dan boshqa manzilda bo‘lsa (Supabase Edge) |
| `ALLOWED_ORIGIN` | — | API va mini app turli domenda bo‘lsa — mini app manzili |
| `NOTIFY_OWNER` | — | `0` — ustozga natija xabarini o‘chirish |

> `VITE_` bilan boshlanganlar **frontend build** paytida kodga yoziladi — ularni o‘zgartirsangiz,
> qayta build (Redeploy) qilish shart. Qolganlari server ishga tushganda o‘qiladi.

## 2. Supabase loyihasini almashtirish (yangi akkaunt / yangi loyiha)

Kod o‘zgarmaydi.

1. **Yangi loyiha** → SQL Editor → `supabase/schema.sql` ni to‘liq **Run** qiling.
2. **Eski ma’lumotlarni ko‘chirish** (kerak bo‘lsa). Eng oson usul — terminalda `pg_dump`:
   ```bash
   # Eski loyiha: Project Settings → Database → Connection string (URI)
   pg_dump "postgresql://postgres:PAROL@db.ESKI.supabase.co:5432/postgres" \
     --data-only --table=public.tests --table=public.attempts --table=public.admins \
     > malumot.sql
   psql "postgresql://postgres:PAROL@db.YANGI.supabase.co:5432/postgres" -f malumot.sql
   ```
   Terminal bo‘lmasa: eski loyihada **Table Editor → tests → Export to CSV**, so‘ng yangisida
   **Import data from CSV**. Tartib muhim: avval `tests`, keyin `attempts`, keyin `admins`.
3. Hostingda **`SUPABASE_URL`** va **`SUPABASE_SERVICE_ROLE_KEY`** ni yangisiga almashtiring.
   Python bot ishlatsangiz — uning sozlamalarida ham.
4. Redeploy (Vercel) yoki serverni qayta ishga tushiring.

Bot, foydalanuvchilar, test kodlari — hammasi joyida qoladi.

## 3. Hostingni almashtirish

Har bir variantdan keyin **albatta** bir marta oching: `<bot manzili>?setup=1` →
`"ok": true` chiqishi kerak. Bu Telegram’ga botning yangi manzilini aytadi va «Menu» tugmasini
yangi mini appga bog‘laydi. Ochmasangiz, bot eski manzilga ulanib qoladi.

Keyin @BotFather → **/mybots → Bot Settings → Configure Mini App / Menu Button** da ham eski
manzil qolgan bo‘lsa, yangisini yozing (`?setup=1` odatda buni o‘zi qiladi).

### A. Vercel (hozirgi holat)
Sozlash README’da. Vercel akkauntini almashtirsangiz: yangi akkauntga GitHub repo’ni import
qiling → barcha o‘zgaruvchilarni ko‘chiring → `WEBAPP_URL` ni yangi domenga o‘zgartiring →
Redeploy → `https://<yangi-sayt>/api/bot?setup=1`.

### B. Render / Railway / Koyeb / Fly.io / VPS — bitta Node server
`server/index.js` mini app, API va botni bitta jarayonda beradi.

- **Build:** `npm install && npm run build`
- **Start:** `npm start`
- **Node:** 18 yoki undan yuqori
- O‘zgaruvchilar: 1-bo‘limdagi hammasi. `WEBAPP_URL` = shu servisning manzili.
- Bot: `https://<servis>/api/bot?setup=1`

Render bepul tarifi 15 daqiqada uxlaydi — uxlab qolganda birinchi xabarga bot 30–50 soniyada
javob beradi. Buni oldini olish uchun uptimerobot.com da `https://<servis>/health` ni har
5 daqiqada ping qiling.

**VPS (Ubuntu) misoli:**
```bash
git clone <repo> && cd pr-maktab-bot
cp .env.example .env && nano .env      # qiymatlarni yozing
npm install && npm run build
npx pm2 start npm --name testbot -- start && npx pm2 save
```
HTTPS uchun oldiga Nginx + Let’s Encrypt (yoki Caddy) qo‘ying — Telegram faqat `https://` bilan ishlaydi.

### C. Supabase Edge Functions (Vercel’siz, faqat Supabase)
Frontend baribir statik hostingda turadi (Netlify, Cloudflare Pages, Vercel, GitHub Pages).
```bash
supabase functions deploy api --no-verify-jwt
supabase functions deploy bot --no-verify-jwt
supabase secrets set BOT_TOKEN=… ALLOWED_CREATOR_IDS=… WEBAPP_URL=https://<frontend> \
  REQUIRED_CHANNELS=@kanal BOT_WEBHOOK_URL=https://<ref>.supabase.co/functions/v1/bot \
  ALLOWED_ORIGIN=https://<frontend>
```
`SUPABASE_URL` va `SUPABASE_SERVICE_ROLE_KEY` ni Supabase o‘zi beradi.
Frontend build’ida: `VITE_API_URL=https://<ref>.supabase.co/functions/v1/api`.
Bot: `https://<ref>.supabase.co/functions/v1/bot?setup=1`.

### D. Python bot (`bot/bot.py`, polling)
Webhook o‘rniga doimiy ishlaydigan jarayon. Kerakli o‘zgaruvchilar: `BOT_TOKEN`, `WEBAPP_URL`,
`ALLOWED_CREATOR_IDS`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `REQUIRED_CHANNELS`.
`SUPABASE_*` berilmasa, faqat bosh adminlar ishlaydi va `/addadmin` ishlamaydi.
Ishga tushganda webhook’ni o‘zi uzadi. Keyin webhook’ga qaytmoqchi bo‘lsangiz — `?setup=1`.

**Muhim:** bir vaqtda faqat **bitta** bot ishlashi kerak: yo webhook (`/api/bot`), yo `bot.py`.

## 4. Supabase’dan butunlay voz kechish (oddiy PostgreSQL: Neon, o‘z serveringiz)

`schema.sql` oddiy PostgreSQL — istalgan Postgres 14+ da ishlaydi (Supabase rollari bo‘lmasa,
ruxsatlar bloki ularni o‘tkazib yuboradi). Kod esa bazaga PostgREST orqali murojaat qiladi.
Ikki yo‘l:

1. **Kod o‘zgarmaydi:** bazangiz yoniga [PostgREST](https://postgrest.org) ni ko‘taring va
   `SUPABASE_URL` ga uning manzilini, `SUPABASE_SERVICE_ROLE_KEY` ga PostgREST JWT kalitini yozing.
2. **Drayver orqali:** faqat `supabase/functions/_shared/database.js` dagi `rpc(name, args)`
   funksiyasini `select public.<name>(...)` ni `pg` drayveri bilan chaqiradigan qilib yozasiz
   (Python botda — `rpc()`). Boshqa hech bir fayl bazani bilmaydi.

## 5. Botni (tokenni) almashtirish

1. @BotFather’dan yangi token → hamma joyda `BOT_TOKEN` ni almashtiring.
2. Bot username o‘zgarsa — `VITE_BOT_USERNAME` ni ham va **qayta build** qiling.
3. Yangi botni majburiy kanalga **admin** qiling.
4. `?setup=1` ni oching.

Testlar va natijalar saqlanib qoladi (ular bazada, Telegram ID bo‘yicha).

## 6. Majburiy kanalni almashtirish

1. Yangi kanalga botni admin qiling.
2. `REQUIRED_CHANNELS` ni o‘zgartiring (bir nechta kanal — vergul bilan).
3. Redeploy / qayta ishga tushirish. `?setup=1` javobidagi `kanallar` bo‘limida
   har bir kanal yonida «✅ bot admin» chiqishi kerak.

Yopiq (private) kanal uchun ID kerak: kanaldagi istalgan postni @userinfobot ga forward
qiling — `-100…` bilan boshlanadigan ID chiqadi. Yozilishi: `-1001234567890|https://t.me/+TaklifHavola`.

## 7. Ko‘chirgandan keyin tekshiruv ro‘yxati

- [ ] `https://<api>/api` (yoki `/functions/v1/api`) brauzerda `{"error":"Faqat POST…"}` beradi
- [ ] `<bot manzili>?setup=1` → `"ok": true`, `kanallar` → «✅ bot admin», `baza` → `OK`
- [ ] `<bot manzili>` (setup’siz) → `"ulangan": true`
- [ ] Oddiy akkauntdan /start → obuna talab qilinadi → obuna bo‘lib «✅ Obuna bo‘ldim» → menyu
- [ ] Admin akkauntdan /start → «Test yaratish» va «👥 Adminlar» ko‘rinadi
- [ ] Test yaratib, boshqa akkauntdan topshirib ko‘ring → ustozga «Yangi natija» xabari keladi
