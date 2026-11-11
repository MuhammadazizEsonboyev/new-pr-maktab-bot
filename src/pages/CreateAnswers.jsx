import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Page from '../components/Page'
import { Alert, Button, LetterPicker, Panel } from '../components/ui'
import { useDraft } from '../context/DraftContext'
import { db } from '../lib/db'
import { haptic } from '../lib/telegram'
import { cx } from '../lib/utils'

const isFilled = (q) => String(q.answer ?? '').trim() !== ''

export default function CreateAnswers() {
  const navigate = useNavigate()
  const { draft, patch, reset } = useDraft()
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [bulk, setBulk] = useState('')
  const [bulkInfo, setBulkInfo] = useState(null)

  useEffect(() => {
    if (!draft.answerKey.length) navigate('/yaratish', { replace: true })
  }, [draft.answerKey.length, navigate])

  const total = draft.answerKey.length
  const filled = useMemo(() => draft.answerKey.filter(isFilled).length, [draft.answerKey])
  const mixed = draft.testType === 'mixed'
  const hasClosed = draft.answerKey.some((q) => q.type === 'closed')
  const hasOpen = draft.answerKey.some((q) => q.type === 'open')

  const setAnswer = (n, answer) => {
    setError(null)
    patch((d) => ({ answerKey: d.answerKey.map((q) => (q.n === n ? { ...q, answer } : q)) }))
  }

  const toggleType = (n) => {
    haptic('select')
    patch((d) => ({
      answerKey: d.answerKey.map((q) => (q.n === n ? { ...q, type: q.type === 'closed' ? 'open' : 'closed', answer: '' } : q)),
    }))
  }

  // Tez to'ldirish: "ABCDA", "A B C D", "1a 2b 3c" yoki "12, 7, 3.5"
  const applyBulk = () => {
    const raw = bulk.trim()
    if (!raw) return
    let parts = raw.split(/[\s,;]+/).filter(Boolean)
    // Yopiq test uchun "ABCDA" — bitta so'z bo'lsa harflarga bo'lamiz
    if (parts.length === 1 && !hasOpen && /^[a-e]+$/i.test(parts[0])) parts = parts[0].split('')
    // "1a", "2-b", "3)c" ko'rinishidagi raqamni olib tashlaymiz
    parts = parts.map((p) => p.replace(/^\d+[).:-]?(?=[a-e]$)/i, ''))

    let applied = 0
    let skipped = 0
    const key = draft.answerKey.map((q, i) => {
      const v = parts[i]
      if (v == null) return q
      if (q.type === 'closed') {
        const L = v.toUpperCase()
        if (!/^[A-E]$/.test(L)) {
          skipped += 1
          return q
        }
        applied += 1
        return { ...q, answer: L }
      }
      applied += 1
      return { ...q, answer: v }
    })
    patch({ answerKey: key })
    setBulk('')
    setError(null)
    setBulkInfo(
      `${applied} ta javob joylandi` + (skipped ? `, ${skipped} tasi o‘tkazib yuborildi (A–E emas)` : '') +
        (parts.length > total ? `. Ortiqcha ${parts.length - total} ta javob e’tiborsiz qoldi.` : '')
    )
    haptic(applied ? 'success' : 'warning')
  }

  const create = async () => {
    const empty = draft.answerKey.find((q) => !isFilled(q))
    if (empty) {
      setError(`${empty.n}-savolning javobi kiritilmagan`)
      haptic('error')
      document.getElementById(`q-${empty.n}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    setSaving(true)
    setError(null)
    try {
      const created = await db.createTest({
        title: draft.title.trim(),
        testType: draft.testType,
        questionCount: total,
        timeLimit: draft.useTimeLimit ? Number(draft.timeLimit) : null,
        onceOnly: draft.onceOnly,
        showAnswers: draft.showAnswers,
        answerKey: draft.answerKey.map((q) => ({ n: q.n, type: q.type, answer: String(q.answer).trim() })),
      })
      haptic('success')
      reset()
      navigate(`/yaratildi/${created.token}`, { replace: true, state: { created } })
    } catch (e) {
      setError(e.message)
      haptic('error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Page
      step="2-qadam / 2"
      title="To‘g‘ri javoblar"
      lead={draft.title || 'Nomsiz test'}
      back="/yaratish"
      footer={
        <>
          <Button tone="mint" onClick={create} loading={saving}>
            ✓ Testni yaratish
          </Button>
          <p className="nums pb-1 pt-2 text-center text-[12px] font-semibold text-ink-mute">
            {filled} / {total} ta javob kiritildi
          </p>
        </>
      }
    >
      <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-mint transition-[width] duration-300" style={{ width: `${(filled / total) * 100}%` }} />
      </div>

      <Panel className="mb-4">
        <p className="label">⚡ Tez to‘ldirish</p>
        <div className="flex gap-2">
          <input
            className="field min-w-0 flex-1 py-2.5"
            value={bulk}
            onChange={(e) => {
              setBulk(e.target.value)
              setBulkInfo(null)
            }}
            onKeyDown={(e) => e.key === 'Enter' && applyBulk()}
            placeholder={hasOpen && !hasClosed ? '12, 7, 3.5, Toshkent' : 'ABCDAEBC…'}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={applyBulk}
            disabled={!bulk.trim()}
            className="shrink-0 rounded-xl2 bg-brand px-4 text-[14px] font-bold text-white transition active:scale-95 disabled:opacity-40"
          >
            Joylash
          </button>
        </div>
        <p className="mt-1.5 text-[12px] leading-snug text-ink-mute">
          {bulkInfo ?? 'Barcha javoblarni ketma-ket yozing — 1-savoldan boshlab joylashadi.'}
        </p>
      </Panel>

      <div className="space-y-2">
        {draft.answerKey.map((q) => (
          <div
            key={q.n}
            id={`q-${q.n}`}
            className={cx('panel py-3', error && !isFilled(q) && 'border-wrong/50')}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <span
                  className={cx(
                    'nums inline-flex h-7 items-center rounded-lg px-2.5 text-[13px] font-extrabold',
                    isFilled(q) ? 'bg-mint/12 text-mint-dark' : 'bg-field text-ink-mute'
                  )}
                >
                  {isFilled(q) ? '✓ ' : ''}{q.n}-savol
                </span>
              </span>
              {mixed ? (
                <button
                  type="button"
                  onClick={() => toggleType(q.n)}
                  className={cx(
                    'rounded-full px-2.5 py-1 text-[12px] font-bold transition active:scale-95',
                    q.type === 'closed' ? 'bg-brand/10 text-brand-dark' : 'bg-grape/12 text-grape-dark'
                  )}
                >
                  {q.type === 'closed' ? '🔘 Yopiq' : '✍️ Ochiq'} ⇄
                </button>
              ) : null}
            </div>

            {q.type === 'closed' ? (
              <LetterPicker
                value={q.answer}
                onPick={(l) => {
                  haptic('select')
                  setAnswer(q.n, l)
                }}
              />
            ) : (
              <input
                className="field"
                value={q.answer}
                maxLength={100}
                onChange={(e) => setAnswer(q.n, e.target.value)}
                placeholder="To‘g‘ri javobni yozing"
              />
            )}
          </div>
        ))}
      </div>

      {error && <Alert className="mt-4">{error}</Alert>}
      {hasOpen && (
        <p className="mt-4 px-1 text-[12.5px] leading-relaxed text-ink-mute">
          Ochiq javoblarda katta-kichik harf, ortiqcha bo‘shliq va apostrof turi (ʻ ’ ') farqlanmaydi.
          Sonlar son sifatida solishtiriladi: 3,5 = 3.5 = 3.50.
        </p>
      )}
    </Page>
  )
}
