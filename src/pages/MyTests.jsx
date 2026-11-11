import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Page from '../components/Page'
import { Alert, Button, Empty, Loading, Pill } from '../components/ui'
import { db } from '../lib/db'
import { copyText, haptic } from '../lib/telegram'
import { formatDate } from '../lib/utils'

export default function MyTests() {
  const navigate = useNavigate()
  const [tests, setTests] = useState(null)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(null)

  const load = useCallback(() => {
    setError(null)
    db.myTests()
      .then(setTests)
      .catch((e) => setError(e.message))
  }, [])

  useEffect(load, [load])

  const copy = async (token) => {
    if (await copyText(token)) {
      setCopied(token)
      setTimeout(() => setCopied(null), 1600)
    }
  }

  return (
    <Page
      emoji="📚"
      title="Mening testlarim"
      lead="Kodni nusxalang yoki natijalarni oching"
      back="/"
      footer={tests?.length ? <Button onClick={() => navigate('/yaratish')}>+ Yangi test</Button> : null}
    >
      {error && (
        <div className="space-y-3">
          <Alert>{error}</Alert>
          <Button tone="ghost" size="md" onClick={load}>Qayta urinish</Button>
        </div>
      )}

      {!tests && !error && <Loading />}

      {tests?.length === 0 && (
        <Empty
          emoji="🗒"
          title="Hali test yaratmagansiz"
          text="Birinchi testni yarating — kod avtomatik beriladi."
          action={<Button onClick={() => navigate('/yaratish')}>Test yaratish</Button>}
        />
      )}

      <div className="space-y-2.5">
        {tests?.map((t) => (
          <div key={t.id} className="panel p-0">
            <Link to={`/testlarim/${t.id}`} onClick={() => haptic('light')} className="block p-4 pb-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate text-[16px] font-extrabold">{t.title}</h3>
                  <p className="mt-0.5 text-[12px] text-ink-mute">{formatDate(t.created_at)}</p>
                </div>
                <Pill tone={t.is_active ? 'mint' : 'mute'}>{t.is_active ? '● Faol' : 'Yopiq'}</Pill>
              </div>
              <div className="nums mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] font-semibold text-ink-soft">
                <span>📝 {t.question_count} savol</span>
                <span>👥 {t.attempts_count} ishtirokchi</span>
                {t.avg_percent != null && <span>📈 o‘rtacha {Number(t.avg_percent).toFixed(0)}%</span>}
              </div>
            </Link>
            <div className="flex items-center gap-2 border-t border-line px-4 py-2.5">
              <button
                type="button"
                onClick={() => copy(t.token)}
                className="nums flex-1 rounded-lg py-1.5 text-left text-[15px] font-extrabold tracking-wide text-brand-dark active:opacity-70"
              >
                {t.token}
              </button>
              <span className="text-[12px] font-bold text-ink-mute">{copied === t.token ? '✓ Nusxalandi' : 'bosib nusxalang'}</span>
            </div>
          </div>
        ))}
      </div>
    </Page>
  )
}
