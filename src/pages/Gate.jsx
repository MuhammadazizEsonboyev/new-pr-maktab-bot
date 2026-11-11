import { useAuth } from '../context/AuthContext'
import { Alert, Button } from '../components/ui'
import { botLink, inTelegram, openLink } from '../lib/telegram'

/** Foydalanuvchi tasdiqlanmagan holat: brauzerda ochilgan yoki server xatosi */
export default function Gate() {
  const { error, status, reload, loading } = useAuth()
  const link = botLink()
  const needTelegram = !inTelegram || status === 401

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10 safe-top">
      <div className="text-center">
        <span className="inline-grid h-20 w-20 animate-pop place-items-center rounded-[26px] bg-brand text-4xl shadow-soft">
          🧪
        </span>
        <h1 className="mt-5 text-[26px] font-extrabold tracking-tight">Test Bot</h1>
        <p className="mt-1.5 text-[15px] text-ink-mute">Test yaratish va topshirish platformasi</p>
      </div>

      <div className="mt-8 space-y-3">
        {needTelegram ? (
          <>
            <Alert tone="brand">
              Ilova Telegram orqali ishlaydi. Botni oching va «Ilovani ochish» tugmasini bosing.
            </Alert>
            {inTelegram && error && <Alert>{error}</Alert>}
            {link && <Button onClick={() => openLink(link)}>Telegramda ochish</Button>}
          </>
        ) : (
          <>
            <Alert>{error || 'Xatolik yuz berdi'}</Alert>
            <Button onClick={reload} loading={loading}>
              Qayta urinish
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
