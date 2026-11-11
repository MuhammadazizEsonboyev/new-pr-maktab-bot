import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { inTelegram, showBackButton } from '../lib/telegram'
import { cx } from '../lib/utils'

export default function Page({ emoji, title, lead, back = '/', children, className, footer, step }) {
  const navigate = useNavigate()

  useEffect(() => {
    if (!back) return undefined
    return showBackButton(() => navigate(back))
  }, [back, navigate])

  // Telegram'dan tashqarida (brauzerda) — ekranda o'z "orqaga" tugmamiz
  const showOwnBack = Boolean(back) && !inTelegram

  return (
    <div className="min-h-full">
      <div className={cx('mx-auto max-w-md px-4 safe-top', footer ? 'pb-40' : 'pb-10', className)}>
        {showOwnBack && (
          <button
            type="button"
            onClick={() => navigate(back)}
            className="-ml-1 mb-2 inline-flex items-center gap-1 rounded-lg px-1 py-1 text-[14px] font-bold text-brand-dark"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
            Orqaga
          </button>
        )}
        {title && (
          <header className="pb-4 pt-1">
            {step && <p className="mb-1 text-[12px] font-extrabold uppercase tracking-wider text-brand-dark">{step}</p>}
            <div className="flex items-center gap-2.5">
              {emoji && <span className="text-[24px] leading-none">{emoji}</span>}
              <h1 className="text-[24px] font-extrabold leading-tight tracking-tight">{title}</h1>
            </div>
            {lead && <p className="mt-1.5 text-[14px] leading-snug text-ink-mute">{lead}</p>}
          </header>
        )}
        {children}
      </div>

      {footer && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-canvas/90 backdrop-blur-md safe-bottom">
          <div className="mx-auto max-w-md px-4 pt-3">{footer}</div>
        </div>
      )}
    </div>
  )
}
