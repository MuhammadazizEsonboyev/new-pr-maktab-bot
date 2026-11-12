import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { Alert, Button } from '../components/ui'
import { haptic, openLink } from '../lib/telegram'

/** Majburiy kanal(lar)ga obuna bo'lmagan foydalanuvchi uchun ekran */
export default function SubscribeGate() {
  const { channels, reload, me } = useAuth()
  const [checking, setChecking] = useState(false)
  const [notYet, setNotYet] = useState(false)

  const check = async () => {
    setChecking(true)
    setNotYet(false)
    await reload()
    setChecking(false)
    // reload dan keyin ham shu ekranda qolsak — hali obuna yo'q
    setNotYet(true)
    haptic('warning')
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10 safe-top">
      <div className="text-center">
        <span className="inline-grid h-20 w-20 animate-pop place-items-center rounded-[26px] bg-brand text-4xl shadow-soft">
          📢
        </span>
        <h1 className="mt-5 text-[24px] font-extrabold tracking-tight">Kanalimizga obuna bo‘ling</h1>
        <p className="mx-auto mt-1.5 max-w-[32ch] text-[15px] text-ink-mute">
          {me?.name ? `${me.name.split(' ')[0]}, botdan` : 'Botdan'} foydalanish uchun quyidagi
          {channels.length > 1 ? ' kanallarga' : ' kanalga'} obuna bo‘ling va «Tekshirish» tugmasini bosing.
        </p>
      </div>

      <div className="mt-8 space-y-2.5">
        {channels.map((c) => (
          <button
            key={c.id}
            type="button"
            disabled={!c.url}
            onClick={() => {
              haptic('light')
              setNotYet(false)
              openLink(c.url)
            }}
            className="panel flex w-full items-center gap-3 text-left transition active:scale-[.985] disabled:opacity-60"
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand/10 text-[22px]">📣</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-extrabold">{c.title}</span>
              <span className="block text-[12.5px] text-ink-mute">{c.url ? 'Obuna bo‘lish uchun bosing' : 'Havola sozlanmagan'}</span>
            </span>
            <span className="text-[13px] font-bold text-brand-dark">Ochish</span>
          </button>
        ))}

        {notYet && !checking && (
          <Alert tone="flame">Hali obuna aniqlanmadi. Kanalga «Join / Qo‘shilish» ni bosganingizga ishonch hosil qiling.</Alert>
        )}

        <Button tone="mint" className="mt-2" onClick={check} loading={checking}>
          ✅ Obuna bo‘ldim — tekshirish
        </Button>
      </div>
    </div>
  )
}
