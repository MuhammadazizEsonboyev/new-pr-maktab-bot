import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Page from '../components/Page'
import { Alert, Button, Field, Panel, Segmented, Toggle } from '../components/ui'
import { useDraft } from '../context/DraftContext'
import { haptic } from '../lib/telegram'
import { TEST_TYPES } from '../lib/utils'

const QUICK_COUNTS = [10, 20, 30, 40, 50]

export default function CreateTest() {
  const navigate = useNavigate()
  const { draft, patch } = useDraft()
  const [error, setError] = useState(null)
  const type = TEST_TYPES.find((t) => t.value === draft.testType) ?? TEST_TYPES[0]

  const next = () => {
    const count = Number(draft.questionCount)
    if (!draft.title.trim()) return fail('Test nomini kiriting')
    if (!Number.isInteger(count) || count < 1 || count > 200) return fail('Savollar soni 1 dan 200 gacha bo‘lishi kerak')
    const limit = Number(draft.timeLimit)
    if (draft.useTimeLimit && (!Number.isInteger(limit) || limit < 1 || limit > 600))
      return fail('Vaqtni 1 dan 600 daqiqagacha kiriting')

    // Avval kiritilgan javoblarni saqlab qolamiz (orqaga qaytib, sonni o'zgartirsa ham)
    const prev = new Map(draft.answerKey.map((q) => [q.n, q]))
    const key = Array.from({ length: count }, (_, i) => {
      const n = i + 1
      const qType = draft.testType === 'mixed' ? prev.get(n)?.type ?? 'closed' : draft.testType
      const old = prev.get(n)
      const keep = old && old.type === qType
      return { n, type: qType, answer: keep ? old.answer : '' }
    })
    patch({ questionCount: count, answerKey: key })
    setError(null)
    navigate('/yaratish/javoblar')
  }

  function fail(msg) {
    setError(msg)
    haptic('error')
  }

  return (
    <Page
      step="1-qadam / 2"
      title="Yangi test"
      lead="Test haqida asosiy ma’lumotlar"
      back="/"
      footer={<Button onClick={next}>Davom etish →</Button>}
    >
      <Panel className="space-y-5">
        <Field label="Test nomi">
          <input
            className="field"
            value={draft.title}
            maxLength={80}
            onChange={(e) => {
              patch({ title: e.target.value })
              setError(null)
            }}
            placeholder="Masalan: Matematika, 5-sinf, 1-chorak"
          />
        </Field>

        <div>
          <span className="label">Test turi</span>
          <Segmented
            value={draft.testType}
            onChange={(v) => patch({ testType: v })}
            options={TEST_TYPES}
          />
          <p className="mt-2 text-[12.5px] text-ink-mute">{type.hint}</p>
        </div>

        <div>
          <span className="label">Savollar soni</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Kamaytirish"
              onClick={() => patch({ questionCount: Math.max(1, Number(draft.questionCount || 1) - 1) })}
              className="grid h-12 w-12 shrink-0 place-items-center rounded-xl2 border border-line bg-field text-xl font-bold text-ink-soft active:scale-95"
            >
              −
            </button>
            <input
              className="field nums h-12 text-center text-[18px]"
              type="number"
              inputMode="numeric"
              min={1}
              max={200}
              value={draft.questionCount}
              onChange={(e) => patch({ questionCount: e.target.value.replace(/\D/g, '').slice(0, 3) })}
              onBlur={(e) => patch({ questionCount: Math.min(200, Math.max(1, Number(e.target.value) || 1)) })}
            />
            <button
              type="button"
              aria-label="Ko‘paytirish"
              onClick={() => patch({ questionCount: Math.min(200, Number(draft.questionCount || 0) + 1) })}
              className="grid h-12 w-12 shrink-0 place-items-center rounded-xl2 border border-line bg-field text-xl font-bold text-ink-soft active:scale-95"
            >
              +
            </button>
          </div>
          <div className="mt-2 flex gap-1.5">
            {QUICK_COUNTS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => {
                  haptic('select')
                  patch({ questionCount: n })
                }}
                className={
                  'nums flex-1 rounded-lg py-1.5 text-[13px] font-bold transition ' +
                  (Number(draft.questionCount) === n ? 'bg-brand text-white' : 'bg-field text-ink-soft')
                }
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </Panel>

      <h2 className="mb-2 mt-5 px-1 text-[13px] font-extrabold uppercase tracking-wide text-ink-mute">Sozlamalar</h2>
      <Panel className="divide-y divide-line py-1">
        <div>
          <Toggle
            icon="⏱"
            title="Vaqt cheklovi"
            text="Vaqt tugasa javoblar avtomatik yuboriladi"
            checked={draft.useTimeLimit}
            onChange={(v) => patch({ useTimeLimit: v })}
          />
          {draft.useTimeLimit && (
            <div className="flex animate-rise items-center gap-2 pb-3 pl-12">
              <input
                className="field nums w-24 py-2.5 text-center"
                type="number"
                inputMode="numeric"
                min={1}
                max={600}
                value={draft.timeLimit}
                onChange={(e) => patch({ timeLimit: e.target.value.replace(/\D/g, '').slice(0, 3) })}
              />
              <span className="text-sm font-semibold text-ink-soft">daqiqa</span>
            </div>
          )}
        </div>
        <Toggle
          icon="🔒"
          title="Faqat bir marta"
          text="Har bir o‘quvchi testni bir marta topshiradi"
          checked={draft.onceOnly}
          onChange={(v) => patch({ onceOnly: v })}
        />
        <Toggle
          icon="👁"
          title="To‘g‘ri javoblarni ko‘rsatish"
          text="Natijada o‘quvchiga to‘g‘ri javoblar ko‘rinadi"
          checked={draft.showAnswers}
          onChange={(v) => patch({ showAnswers: v })}
        />
      </Panel>

      {error && <Alert className="mt-4">{error}</Alert>}

      <p className="mt-4 px-1 text-[13px] leading-relaxed text-ink-mute">
        Savollarning o‘zi kanal yoki guruhda bo‘ladi. Bu yerda faqat to‘g‘ri javoblar kaliti saqlanadi
        va o‘quvchilarga ko‘rinmaydi.
      </p>
    </Page>
  )
}

