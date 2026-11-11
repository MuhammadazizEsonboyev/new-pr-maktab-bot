import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Page from '../components/Page'
import { Alert, Button, Panel } from '../components/ui'
import { db } from '../lib/db'
import { haptic } from '../lib/telegram'

// xxxx-xxxx-xxxx ko'rinishiga keltirish
function mask(raw) {
  const clean = String(raw).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12)
  return clean.match(/.{1,4}/g)?.join('-') ?? ''
}

export default function JoinTest() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [token, setToken] = useState(mask(params.get('kod') ?? ''))
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const autoTried = useRef(false)

  const load = async (value = token, auto = false) => {
    if (value.replace(/-/g, '').length < 12) {
      setError('Kod 12 ta belgidan iborat: xxxx-xxxx-xxxx')
      haptic('error')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const test = await db.getTest(value)
      haptic('success')
      // Avtomatik ochilganda tarixga yozmaymiz — aks holda "orqaga" yana shu yerga qaytaradi
      navigate(`/test/${test.token}`, { state: { test }, replace: auto })
    } catch (e) {
      setError(e.message)
      haptic('error')
    } finally {
      setLoading(false)
    }
  }

  // Botdan kod bilan kelgan bo'lsa — darhol yuklaymiz
  useEffect(() => {
    if (autoTried.current) return
    autoTried.current = true
    const preset = mask(params.get('kod') ?? '')
    if (preset.length === 14) load(preset, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text) {
        setToken(mask(text))
        setError(null)
      }
    } catch {
      /* ruxsat berilmagan */
    }
  }

  const ready = token.length === 14

  return (
    <Page emoji="🎯" title="Testga qatnashish" lead="Ustozingiz bergan kodni kiriting" back="/">
      <Panel>
        <label htmlFor="code" className="label">
          Test kodi
        </label>
        <div className="relative">
          <input
            id="code"
            className="field nums h-14 pr-20 text-center text-[20px] tracking-[0.12em]"
            value={token}
            autoFocus
            inputMode="text"
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => {
              setToken(mask(e.target.value))
              setError(null)
            }}
            onKeyDown={(e) => e.key === 'Enter' && load()}
            placeholder="xxxx-xxxx-xxxx"
          />
          {!token && navigator.clipboard?.readText && (
            <button
              type="button"
              onClick={paste}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-card px-2.5 py-1.5 text-[12px] font-bold text-brand-dark shadow-soft"
            >
              Qo‘yish
            </button>
          )}
        </div>

        <Button tone="mint" className="mt-3" onClick={() => load()} loading={loading} disabled={!ready}>
          Testni boshlash
        </Button>

        {error && <Alert className="mt-3">{error}</Alert>}
      </Panel>

      <p className="mt-4 px-1 text-[13px] leading-relaxed text-ink-mute">
        Savollar kanal yoki guruhda bo‘ladi — bu yerda faqat javoblaringizni belgilaysiz. Kodni botga
        yuborsangiz ham test ochiladi.
      </p>
    </Page>
  )
}
