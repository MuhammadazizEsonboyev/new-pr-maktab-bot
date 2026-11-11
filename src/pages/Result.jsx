import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import Page from '../components/Page'
import { Alert, Button, Loading, Panel, Stat } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { db } from '../lib/db'
import { haptic, inTelegram, toast } from '../lib/telegram'
import { cx, formatDate, formatTime, verdict } from '../lib/utils'

export default function Result() {
  const { id } = useParams()
  const { state } = useLocation()
  const navigate = useNavigate()
  const { isCreator } = useAuth()
  const [result, setResult] = useState(state?.result ?? null)
  const [error, setError] = useState(null)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [pdfSent, setPdfSent] = useState(false)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    if (result) return
    db.getAttempt(id)
      .then(setResult)
      .catch((e) => setError(e.message))
  }, [id, result])

  useEffect(() => {
    if (state?.result) haptic(Number(state.result.percent) >= 50 ? 'success' : 'warning')
  }, [state])

  const backTo = state?.result ? '/' : isCreator ? '/testlarim' : '/natijalarim'

  if (error)
    return (
      <Page title="Natija" back="/">
        <Alert>{error}</Alert>
      </Page>
    )
  if (!result)
    return (
      <Page back="/">
        <Loading />
      </Page>
    )

  const percent = Number(result.percent)
  const wrong = result.total - result.correct
  const v = verdict(percent)
  const tone = {
    mint: { bg: 'bg-mint/10', text: 'text-mint-dark', bar: 'bg-mint' },
    flame: { bg: 'bg-flame/10', text: 'text-flame-dark', bar: 'bg-flame' },
    wrong: { bg: 'bg-wrong/10', text: 'text-wrong-dark', bar: 'bg-wrong' },
  }[v.tone]
  const rows = result.review.filter((r) => (filter === 'all' ? true : filter === 'wrong' ? !r.correct : r.correct))

  const savePdf = async () => {
    setPdfBusy(true)
    try {
      const { downloadResultPdf, pdfFileName, resultPdfBase64 } = await import('../lib/pdf')
      if (inTelegram) {
        // Telegram ichida fayl yuklab olish ishonchsiz — PDF bot orqali chatga keladi
        await db.sendPdf(resultPdfBase64(result), pdfFileName(result), `📄 ${result.title} — ${percent.toFixed(1)}%`)
        setPdfSent(true)
        haptic('success')
      } else {
        downloadResultPdf(result)
        haptic('success')
      }
    } catch (e) {
      toast(e.message || 'PDF yaratilmadi. Qayta urinib ko‘ring.')
    } finally {
      setPdfBusy(false)
    }
  }

  return (
    <Page
      back={backTo}
      footer={
        <>
          <Button onClick={savePdf} loading={pdfBusy} tone={pdfSent ? 'soft' : 'brand'}>
            {pdfSent ? '✓ PDF bot chatiga yuborildi' : inTelegram ? '📄 PDF’ni chatga yuborish' : '📄 PDF yuklab olish'}
          </Button>
          <div className="mt-2 grid grid-cols-2 gap-2 pb-1">
            <Button tone="ghost" size="md" onClick={() => navigate('/qatnashish', { replace: true })}>
              Boshqa test
            </Button>
            <Button tone="ghost" size="md" onClick={() => navigate('/', { replace: true })}>
              Bosh sahifa
            </Button>
          </div>
        </>
      }
    >
      <div className={cx('animate-rise rounded-card p-5 text-center', tone.bg)}>
        <p className="text-[13px] font-bold text-ink-soft">{result.title}</p>
        <p className={cx('nums mt-2 text-[52px] font-extrabold leading-none tracking-tight', tone.text)}>
          {percent % 1 === 0 ? percent.toFixed(0) : percent.toFixed(1)}%
        </p>
        <p className="mt-2 text-[16px] font-extrabold text-ink">
          {v.emoji} {v.text}
        </p>
        <div className="mx-auto mt-4 h-2.5 max-w-[260px] overflow-hidden rounded-full bg-card">
          <div className={cx('h-full rounded-full transition-[width] duration-1000', tone.bar)} style={{ width: `${percent}%` }} />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat value={result.correct} label="to‘g‘ri" tone="text-mint-dark" />
        <Stat value={wrong} label="xato" tone="text-wrong-dark" />
        <Stat value={result.spent_seconds != null ? formatTime(result.spent_seconds) : '—'} label="vaqt" />
      </div>

      <Panel className="mt-3 py-3">
        <div className="flex justify-between text-[13px]">
          <span className="text-ink-mute">Ishtirokchi</span>
          <span className="font-bold">{result.user_name || 'Noma’lum'}</span>
        </div>
        <div className="mt-1.5 flex justify-between text-[13px]">
          <span className="text-ink-mute">Sana</span>
          <span className="nums font-bold">{formatDate(result.created_at)}</span>
        </div>
      </Panel>

      <div className="mb-2.5 mt-6 flex items-center justify-between px-1">
        <h2 className="text-[17px] font-extrabold">Javoblar tahlili</h2>
        <div className="flex gap-1 rounded-xl bg-field p-1 text-[12px] font-bold">
          {[
            ['all', 'Hammasi'],
            ['wrong', `Xato ${wrong}`],
          ].map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              className={cx('rounded-lg px-2.5 py-1', filter === k ? 'bg-card text-ink shadow-soft' : 'text-ink-mute')}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <Panel className="text-center text-[14px] font-semibold text-mint-dark">🎉 Xato javob yo‘q!</Panel>
      ) : (
        <div className="panel divide-y divide-line p-0">
          {rows.map((r) => (
            <div key={r.n} className="flex items-center gap-3 px-4 py-3">
              <span
                className={cx(
                  'nums grid h-8 min-w-8 place-items-center rounded-lg px-1.5 text-[13px] font-extrabold',
                  r.correct ? 'bg-mint/12 text-mint-dark' : 'bg-wrong/10 text-wrong-dark'
                )}
              >
                {r.n}
              </span>
              <div className="min-w-0 flex-1 text-[14px]">
                <p className="truncate">
                  <span className="text-ink-mute">Javobingiz: </span>
                  <span className={cx('font-extrabold', !r.given && 'font-semibold italic text-ink-mute')}>
                    {r.given || 'belgilanmagan'}
                  </span>
                </p>
                {!r.correct && r.answer != null && (
                  <p className="truncate">
                    <span className="text-ink-mute">To‘g‘ri: </span>
                    <span className="font-extrabold text-mint-dark">{r.answer}</span>
                  </p>
                )}
              </div>
              <span className="text-[18px]">{r.correct ? '✅' : '❌'}</span>
            </div>
          ))}
        </div>
      )}

      {!result.show_answers && (
        <p className="mt-3 px-1 text-[13px] text-ink-mute">Test muallifi to‘g‘ri javoblarni yashirgan.</p>
      )}
    </Page>
  )
}
