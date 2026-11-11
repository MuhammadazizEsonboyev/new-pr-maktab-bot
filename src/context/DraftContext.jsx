import { createContext, useContext, useEffect, useMemo, useState } from 'react'

const DraftContext = createContext(null)
const KEY = 'testbot:draft'

const EMPTY = {
  title: '',
  testType: 'closed',
  questionCount: 10,
  useTimeLimit: false,
  timeLimit: 30,
  onceOnly: false,
  showAnswers: true,
  answerKey: [],
}

function load() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) || 'null')
    return saved ? { ...EMPTY, ...saved } : EMPTY
  } catch {
    return EMPTY
  }
}

export function DraftProvider({ children }) {
  const [draft, setDraft] = useState(load)

  // Ilova yangilansa ham kiritilgan javoblar yo'qolmasin
  useEffect(() => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(draft))
    } catch {
      /* ignore */
    }
  }, [draft])

  const value = useMemo(
    () => ({
      draft,
      patch: (part) => setDraft((d) => ({ ...d, ...(typeof part === 'function' ? part(d) : part) })),
      reset: () => setDraft(EMPTY),
    }),
    [draft]
  )
  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>
}

export function useDraft() {
  const ctx = useContext(DraftContext)
  if (!ctx) throw new Error('useDraft faqat DraftProvider ichida ishlaydi')
  return ctx
}
