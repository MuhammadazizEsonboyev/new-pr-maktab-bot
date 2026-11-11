import { cx, LETTERS } from '../lib/utils'
import { haptic } from '../lib/telegram'

export function Button({ children, tone = 'brand', size = 'lg', className, onClick, disabled, loading, type = 'button', ...rest }) {
  const tones = {
    brand: 'bg-brand text-white hover:bg-brand-dark dark:hover:bg-brand/90',
    mint: 'bg-mint text-white hover:bg-mint-dark dark:hover:bg-mint/90',
    soft: 'bg-brand/10 text-brand-dark hover:bg-brand/15',
    ghost: 'bg-card text-ink-soft border border-line hover:bg-field',
    danger: 'bg-wrong/10 text-wrong-dark hover:bg-wrong/15',
  }
  const sizes = { lg: 'h-[52px] text-[15px]', md: 'h-11 text-[14px]', sm: 'h-9 text-[13px] px-3' }
  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={(e) => {
        if (!disabled && !loading) haptic('light')
        onClick?.(e)
      }}
      className={cx(
        'inline-flex w-full select-none items-center justify-center gap-2 rounded-xl2 px-5 font-bold transition active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100',
        tones[tone],
        sizes[size],
        className
      )}
      {...rest}
    >
      {loading ? <Spinner className={tone === 'brand' || tone === 'mint' ? 'border-white/40 border-t-white' : ''} /> : children}
    </button>
  )
}

export function Panel({ className, children, ...rest }) {
  return (
    <div className={cx('panel', className)} {...rest}>
      {children}
    </div>
  )
}

export function Field({ label, hint, children, className }) {
  return (
    <label className={cx('block', className)}>
      {label && <span className="label">{label}</span>}
      {children}
      {hint && <span className="mt-1.5 block text-[12px] text-ink-mute">{hint}</span>}
    </label>
  )
}

/** iOS uslubidagi o'chirib-yoqgich */
export function Toggle({ checked, onChange, title, text, icon }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => {
        haptic('select')
        onChange(!checked)
      }}
      className="flex w-full items-center gap-3 py-3 text-left"
    >
      {icon && <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-field text-[18px]">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold text-ink">{title}</span>
        {text && <span className="block text-[12.5px] leading-snug text-ink-mute">{text}</span>}
      </span>
      <span
        className={cx(
          'relative h-[30px] w-[50px] shrink-0 rounded-full transition-colors',
          checked ? 'bg-mint' : 'bg-line'
        )}
      >
        <span
          className={cx(
            'absolute top-[3px] h-6 w-6 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-[23px]' : 'translate-x-[3px]'
          )}
        />
      </span>
    </button>
  )
}

/** Bir nechta variantdan birini tanlash */
export function Segmented({ value, onChange, options }) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => {
              haptic('select')
              onChange(o.value)
            }}
            className={cx(
              'rounded-xl2 border px-2 py-2.5 text-center transition active:scale-[.97]',
              active ? 'border-brand bg-brand/10 text-brand-dark' : 'border-line bg-field text-ink-soft'
            )}
          >
            <span className="block text-[18px] leading-none">{o.icon}</span>
            <span className="mt-1 block text-[13px] font-extrabold">{o.short}</span>
          </button>
        )
      })}
    </div>
  )
}

/** A–E tugmalari (test yaratish va yechishda bir xil) */
export function LetterPicker({ value, onPick, tone = 'brand' }) {
  const on = tone === 'mint' ? 'bg-mint text-white border-mint' : 'bg-brand text-white border-brand'
  return (
    <div className="grid grid-cols-5 gap-1.5" role="radiogroup">
      {LETTERS.map((l) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={value === l}
          onClick={() => onPick(l)}
          className={cx(
            'h-11 rounded-xl2 border text-[16px] font-extrabold transition active:scale-95',
            value === l ? on : 'border-line bg-field text-ink-soft'
          )}
        >
          {l}
        </button>
      ))}
    </div>
  )
}

export function Spinner({ className }) {
  return (
    <span
      role="status"
      aria-label="Yuklanmoqda"
      className={cx('inline-block h-5 w-5 animate-spin rounded-full border-2 border-brand/25 border-t-brand', className)}
    />
  )
}

export function Loading({ text = 'Yuklanmoqda…' }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-ink-mute">
      <Spinner />
      <p className="text-sm font-semibold">{text}</p>
    </div>
  )
}

export function Empty({ emoji = '📭', title, text, action }) {
  return (
    <div className="flex flex-col items-center px-4 py-12 text-center">
      <span className="grid h-16 w-16 place-items-center rounded-full bg-field text-3xl">{emoji}</span>
      <h3 className="mt-4 text-[16px] font-extrabold">{title}</h3>
      {text && <p className="mt-1 max-w-[30ch] text-sm leading-relaxed text-ink-mute">{text}</p>}
      {action && <div className="mt-5 w-full max-w-[240px]">{action}</div>}
    </div>
  )
}

export function Alert({ children, tone = 'wrong', className }) {
  const tones = {
    wrong: 'bg-wrong/10 text-wrong-dark border-wrong/20',
    mint: 'bg-mint/10 text-mint-dark border-mint/20',
    brand: 'bg-brand/10 text-brand-dark border-brand/20',
    flame: 'bg-flame/10 text-flame-dark border-flame/20',
  }
  return (
    <div role="alert" className={cx('animate-rise rounded-xl2 border px-4 py-3 text-[14px] font-semibold leading-snug', tones[tone], className)}>
      {children}
    </div>
  )
}

export function Pill({ children, tone = 'brand', className }) {
  const tones = {
    brand: 'bg-brand/10 text-brand-dark',
    mint: 'bg-mint/12 text-mint-dark',
    flame: 'bg-flame/12 text-flame-dark',
    wrong: 'bg-wrong/10 text-wrong-dark',
    grape: 'bg-grape/12 text-grape-dark',
    mute: 'bg-field text-ink-mute',
  }
  return (
    <span className={cx('inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-bold', tones[tone], className)}>
      {children}
    </span>
  )
}

export function Stat({ value, label, tone }) {
  return (
    <div className="rounded-xl2 bg-field px-2 py-3 text-center">
      <p className={cx('nums text-[20px] font-extrabold leading-none', tone)}>{value}</p>
      <p className="mt-1.5 text-[12px] font-semibold text-ink-mute">{label}</p>
    </div>
  )
}

export function TokenBox({ token, onCopy, copied }) {
  return (
    <button
      type="button"
      onClick={onCopy}
      className="nums flex w-full items-center justify-between gap-3 rounded-xl2 border border-dashed border-brand/40 bg-brand/5 px-4 py-3 text-left active:scale-[.99]"
    >
      <span className="text-[19px] font-extrabold tracking-[0.06em] text-brand-dark">{token}</span>
      <span className="text-[12px] font-bold text-ink-mute">{copied ? '✓ Nusxalandi' : 'Nusxalash'}</span>
    </button>
  )
}
