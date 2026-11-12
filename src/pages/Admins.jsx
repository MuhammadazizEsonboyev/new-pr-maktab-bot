import { useCallback, useEffect, useState } from 'react'
import Page from '../components/Page'
import { Alert, Button, Field, Loading, Panel, Pill } from '../components/ui'
import { db } from '../lib/db'
import { confirmAction, haptic } from '../lib/telegram'
import { formatDate } from '../lib/utils'
import { useAuth } from '../context/AuthContext'

/** Adminlar: ro'yxat, yangi admin qo'shish, o'chirish */
export default function Admins() {
  const { me } = useAuth()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [form, setForm] = useState({ userId: '', name: '' })
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState(null)
  const [removing, setRemoving] = useState(null)

  const load = useCallback(() => {
    setError(null)
    db.listAdmins()
      .then(setData)
      .catch((e) => setError(e.message))
  }, [])

  useEffect(load, [load])

  const add = async (e) => {
    e.preventDefault()
    setNotice(null)
    const userId = form.userId.replace(/\D/g, '')
    if (!userId) {
      setNotice({ tone: 'wrong', text: 'Telegram ID ni kiriting (faqat raqamlar).' })
      return
    }
    setSaving(true)
    try {
      const r = await db.addAdmin(userId, form.name.trim())
      haptic('success')
      setForm({ userId: '', name: '' })
      setNotice(
        r.notified
          ? { tone: 'mint', text: `✅ ${r.admin?.name || userId} admin qilindi va unga xabar yuborildi.` }
          : {
              tone: 'flame',
              text: `✅ ${r.admin?.name || userId} admin qilindi. Unga xabar yetmadi — u botga hali /start bosmagan. /start bosgach, admin menyusi chiqadi.`,
            }
      )
      load()
    } catch (err) {
      haptic('error')
      setNotice({ tone: 'wrong', text: err.message })
    } finally {
      setSaving(false)
    }
  }

  const remove = async (a) => {
    if (!(await confirmAction(`${a.name || a.user_id} adminlikdan olinsinmi? Uning testlari o‘chmaydi.`))) return
    setRemoving(a.user_id)
    setNotice(null)
    try {
      await db.removeAdmin(a.user_id)
      haptic('success')
      load()
    } catch (err) {
      setNotice({ tone: 'wrong', text: err.message })
    } finally {
      setRemoving(null)
    }
  }

  return (
    <Page emoji="👥" title="Adminlar" lead="Adminlar test yarata oladi va o‘zi ham yangi admin qo‘sha oladi" back="/">
      <Panel>
        <form onSubmit={add} className="space-y-3">
          <Field
            label="Telegram ID"
            hint="Qo‘shmoqchi bo‘lgan odam botga /id yozsin — chiqqan raqamni shu yerga kiriting."
          >
            <input
              className="field nums"
              inputMode="numeric"
              autoComplete="off"
              placeholder="masalan 123456789"
              value={form.userId}
              maxLength={16}
              onChange={(e) => setForm((f) => ({ ...f, userId: e.target.value.replace(/[^\d]/g, '') }))}
            />
          </Field>
          <Field label="Ismi (ixtiyoriy)" hint="Bo‘sh qoldirsangiz, Telegramdagi ismi olinadi.">
            <input
              className="field"
              autoComplete="off"
              placeholder="masalan Aziza opa"
              value={form.name}
              maxLength={80}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </Field>
          <Button type="submit" loading={saving}>
            + Admin qo‘shish
          </Button>
        </form>
      </Panel>

      {notice && (
        <Alert tone={notice.tone} className="mt-3">
          {notice.text}
        </Alert>
      )}

      <h2 className="mb-2 mt-6 text-[15px] font-extrabold">Ro‘yxat{data ? ` (${data.admins.length})` : ''}</h2>

      {error && (
        <div className="space-y-3">
          <Alert>{error}</Alert>
          <Button tone="ghost" size="md" onClick={load}>
            Qayta urinish
          </Button>
        </div>
      )}
      {!data && !error && <Loading />}

      <div className="space-y-2.5">
        {data?.admins.map((a) => (
          <div key={a.user_id} className="panel flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-field text-[20px]">
              {a.super ? '⭐️' : '👤'}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-[15px] font-extrabold">{a.name || 'Nomaʼlum'}</p>
                {Number(a.user_id) === Number(me?.id) && <Pill tone="mute">Siz</Pill>}
              </div>
              <p className="nums text-[12.5px] text-ink-mute">ID: {a.user_id}</p>
              <p className="text-[12px] text-ink-mute">
                {a.super
                  ? 'Bosh admin (hosting sozlamalarida)'
                  : `Qo‘shgan: ${a.added_by_name || data.admins.find((x) => Number(x.user_id) === Number(a.added_by))?.name || a.added_by} · ${formatDate(a.created_at)}`}
                {!a.super && a.tests_count > 0 ? ` · ${a.tests_count} ta test` : ''}
              </p>
            </div>
            {a.super ? (
              <Pill tone="grape">Bosh</Pill>
            ) : (
              a.canRemove && (
                <Button
                  tone="danger"
                  size="sm"
                  className="!w-auto shrink-0"
                  loading={removing === a.user_id}
                  onClick={() => remove(a)}
                >
                  O‘chirish
                </Button>
              )
            )}
          </div>
        ))}
      </div>

      {data && !data.viewerSuper && (
        <p className="mt-4 text-center text-[12px] text-ink-mute">
          Siz faqat o‘zingiz qo‘shgan adminlarni o‘chira olasiz.
        </p>
      )}
    </Page>
  )
}
