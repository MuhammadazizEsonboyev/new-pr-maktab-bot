import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Page from '../components/Page'
import { Alert, Button, Empty, Loading, Pill } from '../components/ui'
import { db } from '../lib/db'
import { formatDate, verdict } from '../lib/utils'

export default function MyResults() {
  const navigate = useNavigate()
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    db.myResults()
      .then(setRows)
      .catch((e) => setError(e.message))
  }, [])

  return (
    <Page emoji="📊" title="Natijalarim" lead="Topshirgan testlaringiz tarixi" back="/">
      {error && <Alert>{error}</Alert>}
      {!rows && !error && <Loading />}

      {rows?.length === 0 && (
        <Empty
          emoji="🎯"
          title="Hali test topshirmagansiz"
          text="Test kodini kiriting — natijangiz shu yerda saqlanadi."
          action={
            <Button tone="mint" onClick={() => navigate('/qatnashish')}>
              Testga qatnashish
            </Button>
          }
        />
      )}

      {rows?.length > 0 && (
        <div className="panel divide-y divide-line p-0">
          {rows.map((r) => {
            const v = verdict(Number(r.percent))
            return (
              <Link key={r.id} to={`/natija/${r.id}`} className="flex items-center gap-3 px-4 py-3.5 active:bg-field">
                <span className="text-[22px]">{v.emoji}</span>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-[15px] font-extrabold">{r.title}</h3>
                  <p className="nums mt-0.5 text-[12px] text-ink-mute">
                    {formatDate(r.created_at)} · {r.correct}/{r.total} to‘g‘ri
                  </p>
                </div>
                <Pill tone={v.tone}>{Number(r.percent).toFixed(0)}%</Pill>
              </Link>
            )
          })}
        </div>
      )}
    </Page>
  )
}
