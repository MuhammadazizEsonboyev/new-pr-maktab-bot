"""
Test Bot — Telegram bot (aiogram 3). Mini app bilan birga ishlaydi.

    pip install -r bot/requirements.txt
    python bot/bot.py              # sozlamalar loyiha ildizidagi .env dan o'qiladi

Kerakli o'zgaruvchilar (.env yoki muhit):
    BOT_TOKEN            — @BotFather tokeni (server API bilan BIR XIL bo'lishi shart)
    WEBAPP_URL           — mini app manzili, masalan https://pr-bot-mini-app.vercel.app
    ALLOWED_CREATOR_IDS  — test yarata oladigan ustozlar ID si (server bilan bir xil)

Bot nima qiladi:
    • /start — menyu: ustozga «Test yaratish», hammaga «Testga qatnashish».
    • Kod yuborilsa yoki t.me/<bot>?start=<kod> havolasi bosilsa — testni darhol ochadi.
    • Chap pastdagi «Menu» tugmasini mini appga bog'laydi.
    • O'quvchi test topshirganda ustozga xabarni server API yuboradi (shu bot nomidan).
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
from pathlib import Path

from aiogram import Bot, Dispatcher, F
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ChatType, ParseMode
from aiogram.filters import Command, CommandObject, CommandStart
from aiogram.types import (
    BotCommand,
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


BOT_TOKEN = os.environ.get("BOT_TOKEN", "").strip()
WEBAPP_URL = os.environ.get("WEBAPP_URL", "").strip().rstrip("/")
CREATORS = parse_ids(os.environ.get("ALLOWED_CREATOR_IDS", ""))

dp = Dispatcher()
private = F.chat.type == ChatType.PRIVATE


def app_url(route: str = "") -> str:
    return f"{WEBAPP_URL}/#{route}" if route else WEBAPP_URL


def is_creator(user_id: int | None) -> bool:
    return bool(user_id) and user_id in CREATORS


def menu(user_id: int | None) -> InlineKeyboardMarkup:
    rows: list[list[InlineKeyboardButton]] = []
    if is_creator(user_id):
        rows.append([InlineKeyboardButton(text="📝 Test yaratish", web_app=WebAppInfo(url=app_url("/yaratish")))])
        rows.append([InlineKeyboardButton(text="📚 Mening testlarim", web_app=WebAppInfo(url=app_url("/testlarim")))])
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
    "Siz <b>ustoz</b> sifatida kirdingiz.\n"
    "1️⃣ Savollarni kanal yoki guruhga joylang.\n"
    "2️⃣ «Test yaratish» orqali faqat to‘g‘ri javoblarni kiriting.\n"
    "3️⃣ Berilgan kodni o‘quvchilarga yuboring.\n\n"
    "Har bir o‘quvchi natijasi shu chatga keladi 📥"
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
    await message.answer(
        WELCOME_TEACHER if is_creator(uid) else WELCOME_STUDENT,
        reply_markup=menu(uid),
    )


@dp.message(Command("help"), private)
async def help_cmd(message: Message) -> None:
    await message.answer(
        "ℹ️ <b>Yordam</b>\n\n"
        "• Test kodini yuboring — test ochiladi.\n"
        "• /start — asosiy menyu.\n"
        "• Natijalaringiz «📊 Natijalarim» bo‘limida saqlanadi.\n"
        "• PDF natijani mini app ichidan shu chatga olishingiz mumkin.",
        reply_markup=menu(message.from_user.id if message.from_user else None),
    )


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
        reply_markup=menu(message.from_user.id if message.from_user else None),
    )


async def setup(bot: Bot) -> None:
    await bot.set_my_commands(
        [
            BotCommand(command="start", description="Asosiy menyu"),
            BotCommand(command="help", description="Yordam"),
            BotCommand(command="id", description="Telegram ID ni bilish"),
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
        logging.warning("ALLOWED_CREATOR_IDS bo'sh — hech kim test yarata olmaydi.")


async def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    check_config()
    bot = Bot(BOT_TOKEN, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    await setup(bot)
    logging.info("Bot ishga tushdi. Mini app: %s | ustozlar: %s", WEBAPP_URL, sorted(CREATORS))
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
