import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Page from '../components/Page'
import { Alert, Button, Empty, Loading, Panel, Pill, Stat, TokenBox } from '../components/ui'
import { db } from '../lib/db'
import { confirmAction, copyText, haptic, shareToken, toast } from '../lib/telegram'
import { cx, formatDate } from '../lib/utils'

const MEDALS = ['🥇', '🥈', '🥉']

export default function TestDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const load = useCallback(() => {
    setError(null)
    db.testAttempts(id)
      .then(setData)
      .catch((e) => setError(e.message))
  }, [id])

  useEffect(load, [load])

  const toggle = async () => {
    setBusy(true)
    try {
      const r = await db.setActive(id, !data.test.is_active)
      setData((d) => ({ ...d, test: { ...d.test, is_active: r.is_active } }))
      haptic('success')
    } catch (e) {
      toast(e.message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    const ok = await confirmAction('Test va uning barcha natijalari butunlay o‘chiriladi. Davom etamizmi?')
    if (!ok) return
    setBusy(true)
    try {
      await db.deleteTest(id)
      haptic('success')
      navigate('/testlarim', { replace: true })
    } catch (e) {
      toast(e.message)
      setBusy(false)
    }
  }

  if (error)
    return (
      <Page title="Test" back="/testlarim">
        <Alert>{error}</Alert>
      </Page>
    )
  if (!data)
    return (
      <Page back="/testlarim">
        <Loading />
      </Page>
    )

  const { test, attempts } = data
  const best = attempts[0]
  const avg = attempts.length ? attempts.reduce((s, a) => s + Number(a.percent), 0) / attempts.length : null

  return (
    <Page title={test.title} lead={`Yaratilgan: ${formatDate(test.created_at)}`} back="/testlarim">
      <Panel>
        <div className="mb-3 flex items-center justify-between">
          <span className="label mb-0">Test kodi</span>
          <Pill tone={test.is_active ? 'mint' : 'mute'}>{test.is_active ? '● Faol' : 'Yopiq'}</Pill>
        </div>
        <TokenBox
          token={test.token}
          copied={copied}
          onCopy={async () => {
            if (await copyText(test.token)) {
              setCopied(true)
              setTimeout(() => setCopied(false), 1600)
            }
          }}
        />
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Stat value={attempts.length} label="ishtirokchi" />
          <Stat value={avg == null ? '—' : `${avg.toFixed(0)}%`} label="o‘rtacha" />
          <Stat value={best ? `${Number(best.percent).toFixed(0)}%` : '—'} label="eng yuqori" tone="text-mint-dark" />
        </div>
        <Button size="md" tone="soft" className="mt-3" onClick={() => shareToken(test.token, test.title)}>
          ↗ Kodni ulashish
        </Button>
      </Panel>

      <div className="mb-2.5 mt-6 flex items-baseline justify-between px-1">
        <h2 className="text-[17px] font-extrabold">Reyting</h2>
        <button type="button" onClick={load} className="text-[13px] font-bold text-brand-dark">
          ↻ Yangilash
        </button>
      </div>

      {attempts.length === 0 ? (
        <Panel>
          <Empty emoji="⏳" title="Hozircha natija yo‘q" text="Kodni tarqating — natijalar shu yerda paydo bo‘ladi." />
        </Panel>
      ) : (
        <ol className="panel divide-y divide-line p-0">
          {attempts.map((a, i) => (
            <li key={a.id}>
              <Link to={`/natija/${a.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-field">
                <span className="nums w-7 text-center text-[15px] font-extrabold text-ink-mute">{MEDALS[i] ?? i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-bold">{a.user_name || 'Noma’lum'}</span>
                  <span className="block text-[12px] text-ink-mute">{formatDate(a.created_at)}</span>
                </span>
                <span className="text-right">
                  <span
                    className={cx(
                      'nums block text-[15px] font-extrabold',
                      Number(a.percent) >= 70 ? 'text-mint-dark' : Number(a.percent) >= 50 ? 'text-flame-dark' : 'text-wrong-dark'
                    )}
                  >
                    {Number(a.percent).toFixed(0)}%
                  </span>
                  <span className="nums block text-[12px] text-ink-mute">
                    {a.correct}/{a.total}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}

      <div className="mt-6 grid grid-cols-2 gap-2.5">
        <Button tone="ghost" size="md" onClick={toggle} disabled={busy}>
          {test.is_active ? '🔒 Yopish' : '🔓 Qayta ochish'}
        </Button>
        <Button tone="danger" size="md" onClick={remove} disabled={busy}>
          🗑 O‘chirish
        </Button>
      </div>
      <p className="mt-2 px-1 text-[12px] text-ink-mute">Yopilgan testga yangi ishtirokchilar kira olmaydi, natijalar saqlanib qoladi.</p>
    </Page>
  )
}
