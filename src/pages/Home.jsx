import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { haptic } from '../lib/telegram'
import { cx } from '../lib/utils'

const MENU = [
  { to: '/yaratish', icon: '📝', title: 'Test yaratish', text: 'Javoblar kalitini kiriting va kod oling', tone: 'bg-brand', creator: true },
  { to: '/testlarim', icon: '📚', title: 'Mening testlarim', text: 'Kodlar, ishtirokchilar va reyting', tone: 'bg-grape', creator: true },
  { to: '/adminlar', icon: '👥', title: 'Adminlar', text: 'Yangi admin qo‘shish va ro‘yxat', tone: 'bg-grape/20', creator: true },
  { to: '/qatnashish', icon: '🎯', title: 'Testga qatnashish', text: 'Kodni kiriting va javoblarni belgilang', tone: 'bg-mint' },
  { to: '/natijalarim', icon: '📊', title: 'Natijalarim', text: 'Topshirgan testlaringiz tarixi', tone: 'bg-flame' },
]

export default function Home() {
  const { me, isCreator, isSuperAdmin } = useAuth()
  const items = MENU.filter((m) => !m.creator || isCreator)
  const firstName = (me?.name || '').split(' ')[0]

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col px-4 pb-8 safe-top">
      <header className="pb-6 pt-4">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand text-2xl shadow-soft">🧪</span>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-ink-mute">Assalomu alaykum{firstName ? ',' : ''}</p>
            <h1 className="truncate text-[22px] font-extrabold leading-tight tracking-tight">
              {firstName || 'Test Bot'}
            </h1>
          </div>
          {isCreator && (
            <span className="ml-auto rounded-full bg-grape/12 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-grape-dark">
              {isSuperAdmin ? 'Bosh admin' : 'Admin'}
            </span>
          )}
        </div>
      </header>

      <nav className="space-y-3">
        {items.map((m, i) => (
          <Link
            key={m.to}
            to={m.to}
            onClick={() => haptic('light')}
            style={{ animationDelay: `${i * 40}ms` }}
            className="panel flex animate-rise items-center gap-4 px-4 py-4 transition active:scale-[.985]"
          >
            <span className={cx('grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-[24px]', m.tone)}>
              {m.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[16px] font-extrabold leading-tight">{m.title}</span>
              <span className="mt-0.5 block text-[13px] leading-snug text-ink-mute">{m.text}</span>
            </span>
            <svg className="shrink-0 text-ink-mute/70" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </Link>
        ))}
      </nav>

      <section className="mt-6 rounded-card bg-field px-4 py-4">
        <h2 className="text-[14px] font-extrabold">Qanday ishlaydi?</h2>
        <ol className="mt-2 space-y-1.5 text-[13px] leading-snug text-ink-soft">
          {isCreator ? (
            <>
              <li>1. Savollarni kanal yoki guruhga joylang.</li>
              <li>2. Bu yerda faqat to‘g‘ri javoblarni kiriting — kod beriladi.</li>
              <li>3. Kodni o‘quvchilarga yuboring. Har bir natija botga keladi.</li>
            </>
          ) : (
            <>
              <li>1. Ustozingizdan test kodini oling.</li>
              <li>2. «Testga qatnashish» bo‘limida kodni kiriting.</li>
              <li>3. Javoblarni belgilang va natijani darhol ko‘ring.</li>
            </>
          )}
        </ol>
      </section>

      <footer className="mt-auto pt-8 text-center">
        <p className="text-[12px] font-semibold text-ink-mute">Test Bot · v2.1</p>
      </footer>
    </div>
  )
}
