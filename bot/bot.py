"""
Test Bot — Telegram bot (aiogram 3). Mini app bilan birga ishlaydi.

    pip install -r bot/requirements.txt
    python bot/bot.py              # sozlamalar loyiha ildizidagi .env dan o'qiladi

Render'da (Web Service, Free):
    Root Directory: bot · Build: pip install -r requirements.txt · Start: python bot.py
    PORT ni Render o'zi beradi — bot kichik veb-server ochadi (UptimeRobot shu manzilni ping qiladi).

Kerakli o'zgaruvchilar (.env yoki muhit) — server API bilan BIR XIL bo'lishi shart:
    BOT_TOKEN                  — @BotFather tokeni
    WEBAPP_URL                 — mini app manzili, masalan https://pr-bot-mini-app.vercel.app
    ALLOWED_CREATOR_IDS        — bosh adminlar ID si
    SUPABASE_URL               — qo'shilgan adminlarni bazadan o'qish/yozish uchun
    SUPABASE_SERVICE_ROLE_KEY  — (bo'lmasa faqat bosh adminlar ishlaydi)
    REQUIRED_CHANNELS          — majburiy obuna kanallari: @kanal, -100123|https://t.me/+xxx

Bot nima qiladi:
    • Admin bo'lmaganlardan kanalga obunani talab qiladi («✅ Obuna bo'ldim» tugmasi).
    • /start — menyu: adminga «Test yaratish», hammaga «Testga qatnashish».
    • /admins, /addadmin <ID> [ism], /deladmin <ID> — adminlarni boshqarish.
    • Kod yuborilsa yoki t.me/<bot>?start=<kod> havolasi bosilsa — testni darhol ochadi.
    • Chap pastdagi «Menu» tugmasini mini appga bog'laydi.
    • O'quvchi test topshirganda ustozga xabarni server API yuboradi (shu bot nomidan).
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import time
from html import escape

import aiohttp
from aiogram import BaseMiddleware, Bot, Dispatcher, F
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ChatType, ParseMode
from aiogram.filters import Command, CommandObject, CommandStart
from aiogram.exceptions import TelegramAPIError
from aiogram.types import (
    BotCommand,
    CallbackQuery,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    MenuButtonWebApp,
    Message,
    WebAppInfo,
)


def load_dotenv(path: Path) -> None:
    """Oddiy .env o'quvchi (qo'shimcha kutubxonasiz). Muhitdagi qiymatlar ustun."""
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        value = value.split(" #", 1)[0].strip().strip('"').strip("'")
        os.environ.setdefault(key.strip(), value)


ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")
load_dotenv(Path(__file__).resolve().parent / ".env")


def parse_ids(raw: str) -> set[int]:
    return {int(x) for x in re.split(r"[\s,;]+", raw or "") if x.strip().isdigit()}


def parse_channels(raw: str) -> list[dict]:
    """REQUIRED_CHANNELS: '@kanal, kanal2, https://t.me/kanal3, -1001234567890|https://t.me/+AbCd'"""
    out = []
    for item in re.split(r"[\s,;]+", raw or ""):
        if not item:
            continue
        cid, _, link = item.partition("|")
        cid, link = cid.strip(), link.strip()
        m = re.fullmatch(r"(?:https?://)?t\.me/([A-Za-z][A-Za-z0-9_]{3,})/?", cid, re.I)
        if m:
            cid = "@" + m.group(1)
        if re.fullmatch(r"[A-Za-z][A-Za-z0-9_]{3,}", cid):
            cid = "@" + cid
        if not (re.fullmatch(r"@[A-Za-z][A-Za-z0-9_]{3,}", cid) or re.fullmatch(r"-100\d{5,}", cid)):
            logging.warning("REQUIRED_CHANNELS: noto'g'ri qiymat o'tkazib yuborildi: %s", item)
            continue
        if link and not link.lower().startswith("https://t.me/"):
            link = ""
        if not link and cid.startswith("@"):
            link = f"https://t.me/{cid[1:]}"
        out.append({"id": cid, "link": link})
    return out


BOT_TOKEN = os.environ.get("BOT_TOKEN", "").strip()
WEBAPP_URL = os.environ.get("WEBAPP_URL", "").strip().rstrip("/")
CREATORS = parse_ids(os.environ.get("ALLOWED_CREATOR_IDS", ""))
SUPABASE_URL = (os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL") or "").strip().rstrip("/")
SERVICE_KEY = (os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_SECRET_KEY") or "").strip()
CHANNELS = parse_channels(os.environ.get("REQUIRED_CHANNELS", ""))

dp = Dispatcher()
private = F.chat.type == ChatType.PRIVATE


def app_url(route: str = "") -> str:
    return f"{WEBAPP_URL}/#{route}" if route else WEBAPP_URL


# ------------------------------- baza --------------------------------------
# Barcha baza chaqiruvlari shu funksiya orqali (Supabase PostgREST RPC).
# Bazani almashtirsangiz — faqat shu funksiyani o'zgartirasiz.

class DbError(Exception):
    pass


_http: aiohttp.ClientSession | None = None


async def rpc(name: str, args: dict | None = None):
    global _http
    if not (SUPABASE_URL and SERVICE_KEY):
        raise DbError("Baza sozlanmagan: SUPABASE_URL va SUPABASE_SERVICE_ROLE_KEY ni bering.")
    if _http is None or _http.closed:
        _http = aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=10))
    headers = {"apikey": SERVICE_KEY, "Content-Type": "application/json"}
    if SERVICE_KEY.startswith("eyJ"):
        headers["Authorization"] = f"Bearer {SERVICE_KEY}"
    try:
        async with _http.post(f"{SUPABASE_URL}/rest/v1/rpc/{name}", json=args or {}, headers=headers) as r:
            body = await r.json(content_type=None)
            if r.status >= 400:
                if isinstance(body, dict) and body.get("code") == "P0001":
                    raise DbError(body.get("message") or "Xatolik")
                logging.error("RPC %s: %s %s", name, r.status, body)
                raise DbError("Bazada xatolik yuz berdi.")
            return body
    except aiohttp.ClientError as e:
        raise DbError("Bazaga ulanib bo'lmadi.") from e


# ------------------------------ adminlar ------------------------------------

_admin_cache: dict[int, tuple[bool, float]] = {}


def is_super(user_id: int | None) -> bool:
    return bool(user_id) and user_id in CREATORS


async def is_creator(user_id: int | None) -> bool:
    """Bosh admin (ALLOWED_CREATOR_IDS) yoki bazadagi qo'shilgan admin."""
    if not user_id:
        return False
    if is_super(user_id):
        return True
    if not (SUPABASE_URL and SERVICE_KEY):
        return False
    cached = _admin_cache.get(user_id)
    if cached and cached[1] > time.monotonic():
        return cached[0]
    try:
        value = bool(await rpc("is_admin", {"p_user_id": user_id}))
    except DbError as e:
        logging.warning("is_admin tekshirilmadi: %s", e)
        return cached[0] if cached else False
    _admin_cache[user_id] = (value, time.monotonic() + 30)
    return value


def display_name(chat) -> str:
    if chat is None:
        return ""
    name = " ".join(p for p in (getattr(chat, "first_name", None), getattr(chat, "last_name", None)) if p).strip()
    return name or (f"@{chat.username}" if getattr(chat, "username", None) else "")


# ------------------------------- obuna ---------------------------------------

_sub_cache: dict[int, float] = {}
_chan_cache: dict[str, tuple[dict, float]] = {}


async def channel_info(bot: Bot, ch: dict) -> dict:
    cached = _chan_cache.get(ch["id"])
    if cached and cached[1] > time.monotonic():
        return cached[0]
    chat = None
    try:
        chat = await bot.get_chat(ch["id"])
    except TelegramAPIError as e:
        logging.warning("Kanal ma'lumoti olinmadi (%s): %s", ch["id"], e)
    info = {
        "id": ch["id"],
        "title": (chat.title if chat and chat.title else ch["id"] if ch["id"].startswith("@") else "Kanal"),
        "url": ch["link"] or (f"https://t.me/{chat.username}" if chat and chat.username else (chat.invite_link if chat else "")) or "",
    }
    _chan_cache[ch["id"]] = (info, time.monotonic() + (3600 if chat else 60))
    return info


async def member_status(bot: Bot, ch: dict, user_id: int) -> bool | None:
    """True — a'zo, False — a'zo emas, None — aniqlab bo'lmadi (bot kanalda admin emas)."""
    try:
        m = await bot.get_chat_member(ch["id"], user_id)
    except TelegramAPIError as e:
        if re.search(r"user not found|participant_id_invalid", str(e), re.I):
            return False
        logging.warning("Obuna tekshirilmadi (%s): %s. Bot kanalda admin ekanini tekshiring.", ch["id"], e)
        return None
    status = str(getattr(m, "status", "")).split(".")[-1].lower()
    if status in ("creator", "administrator", "member"):
        return True
    if status == "restricted":
        return bool(getattr(m, "is_member", False))
    return False


async def missing_channels(bot: Bot, user_id: int) -> list[dict]:
    """Foydalanuvchi a'zo bo'lmagan kanallar (bo'sh ro'yxat = hammasiga a'zo). Adminlar tekshirilmaydi."""
    if not CHANNELS or await is_creator(user_id):
        return []
    if _sub_cache.get(user_id, 0) > time.monotonic():
        return []
    results = await asyncio.gather(*(member_status(bot, ch, user_id) for ch in CHANNELS))
    missing = [ch for ch, ok in zip(CHANNELS, results) if ok is False]
    if not missing:
        _sub_cache[user_id] = time.monotonic() + 120
        return []
    _sub_cache.pop(user_id, None)
    return list(await asyncio.gather(*(channel_info(bot, ch) for ch in missing)))


def subscribe_keyboard(missing: list[dict], token: str | None) -> InlineKeyboardMarkup:
    rows = [[InlineKeyboardButton(text=f"📢 {c['title']}", url=c["url"])] for c in missing if c["url"]]
    rows.append([InlineKeyboardButton(text="✅ Obuna bo‘ldim", callback_data=f"sub:{token}" if token else "sub")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def subscribe_text(missing: list[dict]) -> str:
    lines = "\n".join(f"• {escape(c['title'])}" for c in missing)
    return (
        "🔒 <b>Botdan foydalanish uchun kanalimizga obuna bo‘ling</b>\n\n"
        f"{lines}\n\nObuna bo‘lgach, «✅ Obuna bo‘ldim» tugmasini bosing."
    )


class SubscriptionMiddleware(BaseMiddleware):
    """Shaxsiy chatdagi har bir xabardan oldin obunani tekshiradi (/id bundan mustasno)."""

    async def __call__(self, handler, event: Message, data):
        if not CHANNELS or event.chat.type != ChatType.PRIVATE or not event.from_user:
            return await handler(event, data)
        text = (event.text or "").strip()
        cmd = text.split()[0].split("@")[0].lower() if text.startswith("/") else ""
        if cmd == "/id":
            return await handler(event, data)
        missing = await missing_channels(event.bot, event.from_user.id)
        if not missing:
            return await handler(event, data)
        if cmd == "/start":
            token = extract_token(text.partition(" ")[2])
        else:
            token = None if cmd else extract_token(text)
        await event.answer(subscribe_text(missing), reply_markup=subscribe_keyboard(missing, token))
        return None


async def menu(user_id: int | None) -> InlineKeyboardMarkup:
    rows: list[list[InlineKeyboardButton]] = []
    if await is_creator(user_id):
        rows.append([InlineKeyboardButton(text="📝 Test yaratish", web_app=WebAppInfo(url=app_url("/yaratish")))])
        rows.append([InlineKeyboardButton(text="📚 Mening testlarim", web_app=WebAppInfo(url=app_url("/testlarim")))])
        rows.append([InlineKeyboardButton(text="👥 Adminlar", web_app=WebAppInfo(url=app_url("/adminlar")))])
    rows.append([InlineKeyboardButton(text="🎯 Testga qatnashish", web_app=WebAppInfo(url=app_url("/qatnashish")))])
    rows.append([InlineKeyboardButton(text="📊 Natijalarim", web_app=WebAppInfo(url=app_url("/natijalarim")))])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def extract_token(text: str | None) -> str | None:
    """'A3F9-12bc–77DE', ' a3f9 12bc 77de ', 'a3f912bc77de' → 'a3f9-12bc-77de'."""
    if not text or len(text) > 40:
        return None
    key = re.sub(r"[^a-z0-9]", "", text.lower())
    if not re.fullmatch(r"[a-f0-9]{12}", key):
        return None
    return f"{key[:4]}-{key[4:8]}-{key[8:]}"


def join_keyboard(token: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="▶️ Testni boshlash", web_app=WebAppInfo(url=app_url(f"/qatnashish?kod={token}")))]
        ]
    )


WELCOME_TEACHER = (
    "🧪 <b>Test Bot</b>\n\n"
    "Siz <b>admin (ustoz)</b> sifatida kirdingiz.\n"
    "1️⃣ Savollarni kanal yoki guruhga joylang.\n"
    "2️⃣ «Test yaratish» orqali faqat to‘g‘ri javoblarni kiriting.\n"
    "3️⃣ Berilgan kodni o‘quvchilarga yuboring.\n\n"
    "Har bir o‘quvchi natijasi shu chatga keladi 📥\n"
    "Yangi admin qo‘shish: «👥 Adminlar» yoki /addadmin"
)
ADMIN_HELP = (
    "👥 <b>Admin buyruqlari</b>\n"
    "• /admins — adminlar ro‘yxati\n"
    "• /addadmin <code>ID</code> [ism] — yangi admin qo‘shish\n"
    "• /deladmin <code>ID</code> — adminni o‘chirish\n"
    "ID ni bilish uchun u odam botga /id yozadi."
)
WELCOME_STUDENT = (
    "🧪 <b>Test Bot</b>\n\n"
    "Ustozingiz bergan <b>test kodini</b> shu yerga yuboring "
    "(masalan: <code>a1b2-c3d4-e5f6</code>) yoki quyidagi tugmani bosing."
)


async def send_join(message: Message, token: str) -> None:
    await message.answer(
        f"✅ Kod qabul qilindi: <code>{token}</code>\nTugmani bosing — test ochiladi.",
        reply_markup=join_keyboard(token),
    )


# t.me/<bot>?start=<kod> havolasi: testni to'g'ridan-to'g'ri ochadi
@dp.message(CommandStart(deep_link=True), private)
async def start_with_code(message: Message, command: CommandObject) -> None:
    token = extract_token(command.args)
    if token:
        await send_join(message, token)
    else:
        await start(message)


@dp.message(CommandStart(), private)
async def start(message: Message) -> None:
    uid = message.from_user.id if message.from_user else None
    admin = await is_creator(uid)
    await message.answer(WELCOME_TEACHER if admin else WELCOME_STUDENT, reply_markup=await menu(uid))


@dp.message(Command("help"), private)
async def help_cmd(message: Message) -> None:
    uid = message.from_user.id if message.from_user else None
    await message.answer(
        "ℹ️ <b>Yordam</b>\n\n"
        "• Test kodini yuboring — test ochiladi.\n"
        "• /start — asosiy menyu.\n"
        "• Natijalaringiz «📊 Natijalarim» bo‘limida saqlanadi.\n"
        "• PDF natijani mini app ichidan shu chatga olishingiz mumkin."
        + (f"\n\n{ADMIN_HELP}" if await is_creator(uid) else ""),
        reply_markup=await menu(uid),
    )


# ------------------------------ admin buyruqlari -----------------------------

@dp.message(Command("admins", "addadmin", "deladmin"), private)
async def admin_cmd(message: Message, command: CommandObject) -> None:
    uid = message.from_user.id if message.from_user else None
    if not await is_creator(uid):
        await message.answer("⛔️ Bu buyruq faqat adminlar uchun.")
        return
    cmd = command.command.lower()
    try:
        if cmd == "admins":
            rows = []
            for cid in sorted(CREATORS):
                try:
                    name = display_name(await message.bot.get_chat(cid))
                except TelegramAPIError:
                    name = ""
                rows.append(f"⭐️ {escape(name or 'Nomaʼlum')} — <code>{cid}</code>")
            added = await rpc("list_admins") if SUPABASE_URL and SERVICE_KEY else []
            for a in added or []:
                if int(a["user_id"]) not in CREATORS:
                    rows.append(f"• {escape(a.get('name') or 'Nomaʼlum')} — <code>{a['user_id']}</code>")
            await message.answer(f"👥 <b>Adminlar ({len(rows)})</b>\n⭐️ — bosh admin\n\n" + "\n".join(rows) + f"\n\n{ADMIN_HELP}")
            return

        parts = (command.args or "").split()
        if not parts:
            await message.answer(ADMIN_HELP)
            return
        if not parts[0].isdigit() or int(parts[0]) <= 0:
            raise DbError("Telegram ID noto'g'ri. Faqat raqam bo'lishi kerak (masalan 123456789).")
        target = int(parts[0])
        if is_super(target):
            raise DbError("Bu foydalanuvchi bosh admin (ALLOWED_CREATOR_IDS da).")

        if cmd == "addadmin":
            if target == uid:
                raise DbError("Siz allaqachon adminsiz.")
            name = " ".join(parts[1:])[:80]
            if not name:
                try:
                    name = display_name(await message.bot.get_chat(target))
                except TelegramAPIError:
                    name = ""
            await rpc("add_admin", {"p_user_id": target, "p_name": name or None, "p_added_by": uid})
            _admin_cache[target] = (True, time.monotonic() + 30)
            try:
                await message.bot.send_message(
                    target,
                    "🎉 <b>Siz admin qilib tayinlandingiz!</b>\n"
                    f"Tayinlagan: {escape(display_name(message.from_user) or str(uid))}\n\n"
                    "Endi test yaratishingiz va boshqa admin qo'shishingiz mumkin. Menyuni yangilash uchun /start bosing.",
                )
                note = "Unga xabar yuborildi."
            except TelegramAPIError:
                note = "⚠️ Unga xabar yetmadi — u botga hali /start bosmagan. /start bossa, admin menyusi chiqadi."
            await message.answer(f"✅ <b>{escape(name or str(target))}</b> admin qilindi.\n{note}")
        else:
            await rpc("remove_admin", {"p_user_id": target, "p_by": uid, "p_force": is_super(uid)})
            _admin_cache.pop(target, None)
            try:
                await message.bot.send_message(target, "ℹ️ Sizning admin huquqingiz olib tashlandi. /start")
            except TelegramAPIError:
                pass
            await message.answer(f"🗑 <code>{target}</code> adminlikdan olindi.")
    except DbError as e:
        await message.answer(f"❌ {escape(str(e))}")


# ------------------------- «✅ Obuna bo'ldim» tugmasi ------------------------

@dp.callback_query(F.data.startswith("sub"))
async def check_sub(cq: CallbackQuery) -> None:
    uid = cq.from_user.id
    missing = await missing_channels(cq.bot, uid)
    if missing:
        await cq.answer("❌ Hali obuna bo‘lmagansiz: " + ", ".join(c["title"] for c in missing), show_alert=True)
        return
    await cq.answer("✅ Rahmat! Obuna tasdiqlandi.")
    token = extract_token((cq.data or "")[4:])
    if not isinstance(cq.message, Message):
        return
    try:
        await cq.message.edit_text("✅ Obuna tasdiqlandi. Xush kelibsiz!")
    except TelegramAPIError:
        pass
    if token:
        await send_join(cq.message, token)
    else:
        admin = await is_creator(uid)
        await cq.message.answer(WELCOME_TEACHER if admin else WELCOME_STUDENT, reply_markup=await menu(uid))


@dp.message(Command("id"))
async def my_id(message: Message) -> None:
    """Ustozni ALLOWED_CREATOR_IDS ga qo'shish uchun ID ni bilib olish."""
    if message.from_user:
        await message.answer(f"Sizning Telegram ID: <code>{message.from_user.id}</code>")


# Kod yuborilsa — o'sha testni ochadigan tugma
@dp.message(private, F.text.func(lambda s: extract_token(s) is not None))
async def by_token(message: Message) -> None:
    await send_join(message, extract_token(message.text))  # type: ignore[arg-type]


@dp.message(private, F.text)
async def fallback(message: Message) -> None:
    await message.answer(
        "🤔 Bu test kodiga o‘xshamaydi. Kod 12 ta belgidan iborat: <code>xxxx-xxxx-xxxx</code>.\n"
        "Yoki menyudan foydalaning:",
        reply_markup=await menu(message.from_user.id if message.from_user else None),
    )


async def setup(bot: Bot) -> None:
    await bot.set_my_commands(
        [
            BotCommand(command="start", description="Asosiy menyu"),
            BotCommand(command="help", description="Yordam"),
            BotCommand(command="id", description="Telegram ID ni bilish"),
            BotCommand(command="admins", description="Adminlar (faqat admin)"),
        ]
    )
    await bot.set_chat_menu_button(menu_button=MenuButtonWebApp(text="Ilovani ochish", web_app=WebAppInfo(url=app_url())))


def check_config() -> None:
    missing = [k for k, v in {"BOT_TOKEN": BOT_TOKEN, "WEBAPP_URL": WEBAPP_URL}.items() if not v]
    if missing:
        raise SystemExit(f"Sozlanmagan: {', '.join(missing)}. .env faylini to'ldiring (.env.example ga qarang).")
    if not WEBAPP_URL.startswith("https://"):
        raise SystemExit("WEBAPP_URL https:// bilan boshlanishi shart (Telegram talabi).")
    if not CREATORS:
        logging.warning("ALLOWED_CREATOR_IDS bo'sh — bosh admin yo'q.")
    if not (SUPABASE_URL and SERVICE_KEY):
        logging.warning("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY berilmagan — faqat bosh adminlar ishlaydi, /addadmin ishlamaydi.")


class _Health(BaseHTTPRequestHandler):
    """Render (Web Service) va UptimeRobot uchun: GET / → 200 «Bot ishlayapti»."""

    def do_GET(self) -> None:
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.end_headers()
        self.wfile.write("Bot ishlayapti ✅".encode())

    def do_HEAD(self) -> None:
        self.send_response(200)
        self.end_headers()

    def log_message(self, *args) -> None:  # har bir pingni logga yozmaymiz
        pass


def start_health_server() -> None:
    """PORT berilgan bo'lsa (Render shunday qiladi) — kichik veb-server ochadi."""
    port = os.environ.get("PORT")
    if not port:
        return
    server = HTTPServer(("0.0.0.0", int(port)), _Health)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    logging.info("Health server: 0.0.0.0:%s", port)


async def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    check_config()
    start_health_server()
    bot = Bot(BOT_TOKEN, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    # Polling webhook bilan birga ishlamaydi: Vercel'dagi webhook ulangan bo'lsa, uzamiz.
    await bot.delete_webhook(drop_pending_updates=False)
    await setup(bot)
    for ch in CHANNELS:
        try:
            me = await bot.get_me()
            m = await bot.get_chat_member(ch["id"], me.id)
            status = str(m.status).split(".")[-1].lower()
            if status not in ("administrator", "creator"):
                logging.warning("❌ Bot %s kanalida admin EMAS — obuna tekshirilmaydi!", ch["id"])
        except TelegramAPIError as e:
            logging.warning("❌ Kanal %s tekshirilmadi: %s — botni kanalga admin qiling.", ch["id"], e)
    dp.message.outer_middleware(SubscriptionMiddleware())
    logging.info(
        "Bot ishga tushdi. Mini app: %s | bosh adminlar: %s | kanallar: %s",
        WEBAPP_URL, sorted(CREATORS), [c["id"] for c in CHANNELS] or "yo'q",
    )
    try:
        await dp.start_polling(bot, allowed_updates=["message", "callback_query"])
    finally:
        if _http and not _http.closed:
            await _http.close()


if __name__ == "__main__":
    asyncio.run(main())
