import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import Page from '../components/Page'
import { Alert, Button, LetterPicker, Loading, Pill } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { db } from '../lib/db'
import { confirmAction, haptic } from '../lib/telegram'
import { cx, formatTime } from '../lib/utils'

const isSet = (v) => String(v ?? '').trim() !== ''

/** Yechish jarayonini saqlash: ilova yopilib qayta ochilsa ham javoblar va taymer davom etadi */
function useRun(key) {
  const read = () => {
    try {
      return JSON.parse(localStorage.getItem(key) || 'null')
    } catch {
      return null
    }
  }
  const [run] = useState(() => {
    const saved = read()
    if (saved && Date.now() - saved.startedAt < 24 * 3600 * 1000) return saved
    return { startedAt: Date.now(), given: {} }
  })
  const save = useCallback(
    (given) => {
      try {
        localStorage.setItem(key, JSON.stringify({ startedAt: run.startedAt, given }))
      } catch {
        /* ignore */
      }
    },
    [key, run.startedAt]
  )
  const clear = useCallback(() => {
    try {
      localStorage.removeItem(key)
    } catch {
      /* ignore */
    }
  }, [key])
  return { run, save, clear }
}

export default function TakeTest() {
  const { token } = useParams()
  const { state } = useLocation()
  const navigate = useNavigate()
  const { me } = useAuth()

  const [test, setTest] = useState(state?.test ?? null)
  const [error, setError] = useState(null)
  const { run, save, clear } = useRun(`testbot:run:${me?.id}:${token}`)
  const [given, setGiven] = useState(run.given)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState(null)
  const [left, setLeft] = useState(null)
  const givenRef = useRef(given)
  const sentRef = useRef(false)
  const autoRef = useRef(false)

  useEffect(() => {
    if (test) return
    db.getTest(token)
      .then(setTest)
      .catch((e) => setError(e.message))
  }, [token, test])

  useEffect(() => {
    givenRef.current = given
    save(given)
  }, [given, save])

  const submit = useCallback(
    async (auto = false) => {
      if (sentRef.current || !test) return
      if (!auto) {
        const unanswered = test.questions.filter((q) => !isSet(givenRef.current[q.n])).length
        const msg = unanswered
          ? `${unanswered} ta savolga javob berilmagan. Baribir yakunlaymizmi?`
          : 'Javoblarni yuboramizmi? Keyin o‘zgartirib bo‘lmaydi.'
        if (!(await confirmAction(msg))) return
      }
      sentRef.current = true
      setSending(true)
      setSendError(null)
      try {
        let spent = Math.round((Date.now() - run.startedAt) / 1000)
        if (test.time_limit_minutes) spent = Math.min(spent, test.time_limit_minutes * 60)
        const result = await db.submit(test.token, givenRef.current, spent)
        clear()
        haptic('success')
        navigate(`/natija/${result.id}`, { replace: true, state: { result } })
      } catch (e) {
        sentRef.current = false
        setSending(false)
        setSendError(e.message)
        haptic('error')
      }
    },
    [navigate, test, run.startedAt, clear]
  )

  // Taymer: boshlanish vaqti saqlangani uchun orqa fonda ham, qayta ochilganda ham to'g'ri sanaydi
  useEffect(() => {
    if (!test?.time_limit_minutes) return undefined
    const end = run.startedAt + test.time_limit_minutes * 60 * 1000
    const tick = () => {
      const remaining = Math.max(0, (end - Date.now()) / 1000)
      setLeft(remaining)
      if (remaining <= 0 && !autoRef.current) {
        autoRef.current = true // faqat bir marta avtomatik yuboramiz
        submit(true)
      }
    }
    tick()
    const id = setInterval(tick, 500)
    return () => clearInterval(id)
  }, [test, submit, run.startedAt])

  if (error)
    return (
      <Page title="Test ochilmadi" back="/qatnashish">
        <Alert>{error}</Alert>
        <Button tone="ghost" className="mt-3" onClick={() => navigate('/qatnashish', { replace: true })}>
          Boshqa kod kiritish
        </Button>
      </Page>
    )
  if (!test)
    return (
      <Page back="/qatnashish">
        <Loading text="Test yuklanmoqda…" />
      </Page>
    )

  const total = test.questions.length
  const answered = test.questions.filter((q) => isSet(given[q.n])).length
  const lowTime = left !== null && left <= 60
  const timeUp = left !== null && left <= 0

  const mark = (n, value) => {
    haptic('select')
    setGiven((prev) => ({ ...prev, [n]: value }))
  }

  return (
    <Page
      title={test.title}
      lead={test.owner_name ? `Muallif: ${test.owner_name}` : undefined}
      back="/"
      footer={
        <>
          {sendError && <Alert className="mb-2">{sendError}</Alert>}
          <Button tone="mint" onClick={() => submit(false)} loading={sending}>
            {timeUp ? 'Qayta yuborish' : 'Javoblarni yuborish'}
          </Button>
          <p className="nums pb-1 pt-2 text-center text-[12px] font-semibold text-ink-mute">
            {answered} / {total} savolga javob berildi
          </p>
        </>
      }
    >
      <div className="sticky top-0 z-[5] -mx-4 mb-3 bg-canvas/90 px-4 py-2 backdrop-blur-md">
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Pill tone="brand">{total} savol</Pill>
            {test.once_only && <Pill tone="flame">1 marta</Pill>}
          </div>
          {left !== null && (
            <span
              className={cx(
                'nums rounded-full px-3 py-1 text-[15px] font-extrabold',
                lowTime ? 'animate-pulse bg-wrong/12 text-wrong-dark' : 'bg-card text-ink shadow-soft'
              )}
            >
              ⏱ {formatTime(left)}
            </span>
          )}
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
          <div className="h-full rounded-full bg-mint transition-[width] duration-300" style={{ width: `${(answered / total) * 100}%` }} />
        </div>
      </div>

      <div className="space-y-2">
        {test.questions.map((q) => (
          <div key={q.n} className="panel py-3">
            <div className="mb-2 flex items-center gap-2">
              <span
                className={cx(
                  'nums inline-flex h-7 items-center rounded-lg px-2.5 text-[13px] font-extrabold',
                  isSet(given[q.n]) ? 'bg-mint/12 text-mint-dark' : 'bg-field text-ink-mute'
                )}
              >
                {isSet(given[q.n]) ? '✓ ' : ''}{q.n}-savol
              </span>
              {q.type === 'open' && <span className="ml-auto text-[12px] font-semibold text-ink-mute">javobni yozing</span>}
            </div>

            {q.type === 'closed' ? (
              <LetterPicker tone="mint" value={given[q.n]} onPick={(l) => mark(q.n, l)} />
            ) : (
              <input
                className="field"
                value={given[q.n] ?? ''}
                maxLength={100}
                onChange={(e) => setGiven((prev) => ({ ...prev, [q.n]: e.target.value }))}
                placeholder="Javobingiz"
                autoComplete="off"
              />
            )}
          </div>
        ))}
      </div>
    </Page>
  )
}
