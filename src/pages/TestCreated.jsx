import { useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import Page from '../components/Page'
import { Button, Panel, TokenBox } from '../components/ui'
import { BOT_USERNAME, copyText, shareToken } from '../lib/telegram'

export default function TestCreated() {
  const { token } = useParams()
  const { state } = useLocation()
  const navigate = useNavigate()
  const [copied, setCopied] = useState(false)
  const title = state?.created?.title ?? 'Test'
  const count = state?.created?.question_count

  const copy = async () => {
    const ok = await copyText(token)
    setCopied(ok)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Page back="/">
      <div className="pt-6 text-center">
        <span className="inline-grid h-20 w-20 animate-pop place-items-center rounded-full bg-mint/12 text-4xl">🎉</span>
        <h1 className="mt-4 text-[26px] font-extrabold leading-tight">Test tayyor!</h1>
        <p className="mt-1 text-[15px] text-ink-mute">
          {title}
          {count ? ` · ${count} ta savol` : ''}
        </p>
      </div>

      <Panel className="mt-6">
        <p className="label text-center">Test kodi</p>
        <TokenBox token={token} onCopy={copy} copied={copied} />
        <p className="mt-3 text-center text-[13px] leading-relaxed text-ink-mute">
          Kodni o‘quvchilarga yuboring. Ular uni botga yozadi yoki «Testga qatnashish» bo‘limiga kiritadi.
          {BOT_USERNAME && ' «Ulashish» orqali yuborilgan havola testni darhol ochadi.'}
        </p>
      </Panel>

      <div className="mt-4 space-y-2.5">
        <Button onClick={() => shareToken(token, title)}>↗ Kodni ulashish</Button>
        <Button tone="ghost" onClick={() => navigate('/testlarim', { replace: true })}>
          📚 Mening testlarim
        </Button>
        <Button tone="ghost" onClick={() => navigate('/', { replace: true })}>
          Bosh sahifa
        </Button>
      </div>
    </Page>
  )
}
