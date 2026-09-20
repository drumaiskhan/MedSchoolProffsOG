// Shared building blocks for the modernised admin pages (Settings, Site
// content, ...). Kept in their own module — not in lib/shared.tsx, which is
// already 2,600 lines — so a page that only needs a card, a switch and a
// save bar doesn't have to reach into the app shell to get them.
//
// Everything here is presentational: no data fetching, no page-specific
// knowledge. Colours come from the theme tokens (bg-card, text-primary,
// border-border, ...) so the admin's own Design & Branding settings keep
// re-skinning these too.
import { type ComponentProps, type ReactNode, useState } from 'react';
import { AlertTriangle, CheckCircle2, Eye, EyeOff, Info, Loader2, Save, Undo2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

type IconType = typeof Info;

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

type PanelTone = 'default' | 'amber' | 'green' | 'red';

const PANEL_TONE: Record<PanelTone, string> = {
  default: 'border-border bg-card',
  amber: 'border-[#e5a952]/60 bg-[#fff9ee]',
  green: 'border-primary/30 bg-[#eef7f1]',
  red: 'border-[#efc7bc] bg-[#fff5f0]',
};

const ICON_TONE: Record<PanelTone, string> = {
  default: 'bg-primary/10 text-primary',
  amber: 'bg-[#e5a952]/20 text-[#8a5a12]',
  green: 'bg-primary/15 text-primary',
  red: 'bg-[#f9ddd6] text-[#a34c3e]',
};

/** A settings card: tinted icon tile, title, optional one-line description
 * and a right-aligned slot for a badge or button. */
export function Panel({ icon: Icon, title, description, badge, action, tone = 'default', className, children, testId }: {
  icon?: IconType; title: string; description?: ReactNode; badge?: ReactNode; action?: ReactNode; tone?: PanelTone; className?: string; children?: ReactNode; testId?: string;
}) {
  return <section className={cn('rounded-2xl border p-5 shadow-[var(--shadow-2xs)] transition-colors sm:p-6', PANEL_TONE[tone], className)} data-testid={testId}>
    <header className="flex flex-wrap items-start gap-3">
      {Icon && <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', ICON_TONE[tone])}><Icon size={18} strokeWidth={2} /></span>}
      <div className="min-w-0 flex-1">
        <h3 className="flex flex-wrap items-center gap-2 text-[15px] font-extrabold tracking-[-.01em]">{title}{badge}</h3>
        {description && <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
    {children !== undefined && children !== null && <div className="mt-5">{children}</div>}
  </section>;
}

/** A labelled divider inside a Panel — replaces the ad-hoc `border-t pt-5`
 * blocks that used to separate sub-sections. */
export function SubSection({ title, description, children, className }: { title: string; description?: ReactNode; children?: ReactNode; className?: string }) {
  return <div className={cn('mt-6 border-t border-border/70 pt-5 first:mt-0 first:border-t-0 first:pt-0', className)}>
    <h4 className="text-[11px] font-extrabold uppercase tracking-[.1em] text-muted-foreground">{title}</h4>
    {description && <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>}
    {children !== undefined && children !== null && <div className="mt-4">{children}</div>}
  </div>;
}

// ---------------------------------------------------------------------------
// Form controls
// ---------------------------------------------------------------------------

export const inputClass = 'h-10 w-full rounded-xl border border-border bg-background px-3 text-xs outline-none transition-shadow placeholder:text-muted-foreground/70 focus:border-primary/50 focus:ring-2 focus:ring-primary/15 disabled:opacity-60';

export function Field({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return <label className={cn('block text-xs font-bold', className)}>
    <span className="flex flex-wrap items-baseline gap-x-2">{label}</span>
    <span className="mt-2 block">{children}</span>
    {hint && <span className="mt-1.5 block text-[11px] font-normal leading-4 text-muted-foreground">{hint}</span>}
  </label>;
}

export function TextInput({ className, ...props }: ComponentProps<'input'>) {
  return <input {...props} className={cn(inputClass, className)} />;
}

export function TextArea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea {...props} className={cn(inputClass, 'min-h-24 h-auto p-3 leading-5', className)} />;
}

export function SelectInput({ className, children, ...props }: ComponentProps<'select'>) {
  return <select {...props} className={cn(inputClass, 'cursor-pointer appearance-none bg-[length:16px] bg-[right_.75rem_center] bg-no-repeat pr-9', className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }}>{children}</select>;
}

/** A secret (API key, password) input: masked by default with a reveal
 * button, and it says whether one is already saved so "blank" reads as
 * "keep the current one" rather than "empty". */
export function SecretInput({ value, onChange, isSet, masked, placeholder, testId, className }: {
  value: string; onChange: (value: string) => void; isSet?: boolean; masked?: string; placeholder?: string; testId?: string; className?: string;
}) {
  const [shown, setShown] = useState(false);
  return <div className={className}>
    <div className="relative">
      <input type={shown ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} autoComplete="off" spellCheck={false}
        placeholder={isSet ? 'Leave blank to keep the saved key' : placeholder} className={cn(inputClass, 'pr-10 font-mono-app')} data-testid={testId} />
      <button type="button" onClick={() => setShown((v) => !v)} className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground hover:bg-muted" aria-label={shown ? 'Hide' : 'Show'} tabIndex={-1}>
        {shown ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
    {isSet && <p className="mt-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-primary"><CheckCircle2 size={12} /> Saved{masked ? <span className="font-mono-app font-normal text-muted-foreground">· {masked}</span> : null}</p>}
  </div>;
}

/** iOS-style switch with a title and description — the row pattern used by
 * every on/off setting, so they all look and behave the same. */
export function ToggleRow({ checked, onChange, title, description, testId, disabled, tone = 'default' }: {
  checked: boolean; onChange: (next: boolean) => void; title: ReactNode; description?: ReactNode; testId?: string; disabled?: boolean; tone?: 'default' | 'amber';
}) {
  return <div className="flex items-start justify-between gap-4 rounded-xl border border-border/70 bg-background/60 px-4 py-3.5">
    <div className="min-w-0">
      <div className="text-xs font-bold">{title}</div>
      {description && <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{description}</p>}
    </div>
    <Switch checked={checked} onChange={onChange} testId={testId} disabled={disabled} tone={tone} label={typeof title === 'string' ? title : undefined} />
  </div>;
}

export function Switch({ checked, onChange, testId, disabled, tone = 'default', label }: { checked: boolean; onChange: (next: boolean) => void; testId?: string; disabled?: boolean; tone?: 'default' | 'amber'; label?: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)} data-testid={testId}
    className={cn('relative mt-0.5 inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50', checked ? (tone === 'amber' ? 'bg-[#d9982f]' : 'bg-primary') : 'bg-input')}>
    <span className={cn('inline-block size-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[22px]' : 'translate-x-0.5')} />
  </button>;
}

/** A pill that toggles on/off — used for multi-select groups (academic
 * years, trial presets) where a native <select multiple> would be clumsy. */
export function Chip({ active, onClick, children, testId, icon: Icon }: { active: boolean; onClick: () => void; children: ReactNode; testId?: string; icon?: IconType }) {
  return <button type="button" onClick={onClick} aria-pressed={active} data-testid={testId}
    className={cn('inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[11px] font-bold transition-colors', active ? 'border-primary bg-primary text-primary-foreground shadow-sm' : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground')}>
    {Icon && <Icon size={12} />}{children}
  </button>;
}

/** Selectable card (icon, title, description) for choosing between a few
 * mutually exclusive options, e.g. the email provider. */
export function OptionCard({ active, onClick, icon: Icon, title, description, testId }: { active: boolean; onClick: () => void; icon: IconType; title: string; description: string; testId?: string }) {
  return <button type="button" onClick={onClick} aria-pressed={active} data-testid={testId}
    className={cn('flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-all', active ? 'border-primary bg-primary/5 ring-2 ring-primary/15' : 'border-border bg-background hover:border-primary/40')}>
    <span className={cn('grid size-8 place-items-center rounded-lg', active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}><Icon size={15} /></span>
    <span className="text-xs font-extrabold">{title}</span>
    <span className="text-[11px] leading-4 text-muted-foreground">{description}</span>
  </button>;
}

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

type CalloutTone = 'info' | 'warn' | 'danger' | 'success';
const CALLOUT: Record<CalloutTone, { box: string; icon: IconType }> = {
  info: { box: 'border-[#c9dbe6] bg-[#f1f7fb] text-[#32647b]', icon: Info },
  warn: { box: 'border-[#e8cf9c] bg-[#fff8e8] text-[#8a5a12]', icon: AlertTriangle },
  danger: { box: 'border-[#efc7bc] bg-[#fff5f0] text-[#9e4c39]', icon: XCircle },
  success: { box: 'border-primary/30 bg-[#eef7f1] text-[#287058]', icon: CheckCircle2 },
};

export function Callout({ tone = 'info', title, children, testId }: { tone?: CalloutTone; title?: ReactNode; children?: ReactNode; testId?: string }) {
  const { box, icon: Icon } = CALLOUT[tone];
  return <div className={cn('flex gap-3 rounded-xl border p-4 text-xs leading-5', box)} data-testid={testId}>
    <Icon size={16} className="mt-0.5 shrink-0" />
    <div className="min-w-0">{title && <div className="font-extrabold">{title}</div>}{children && <div className={cn(title && 'mt-0.5', 'opacity-90')}>{children}</div>}</div>
  </div>;
}

export function StatusPill({ tone = 'neutral', children }: { tone?: 'neutral' | 'green' | 'amber' | 'red'; children: ReactNode }) {
  const styles = { neutral: 'bg-muted text-muted-foreground', green: 'bg-[#d7eee4] text-[#287058]', amber: 'bg-[#fff0cb] text-[#8d6420]', red: 'bg-[#f9ddd6] text-[#a34c3e]' }[tone];
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold', styles)}>{children}</span>;
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

export function Button({ variant = 'secondary', size = 'md', icon: Icon, loading, className, children, ...props }: ComponentProps<'button'> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'md'; icon?: IconType; loading?: boolean }) {
  const styles = {
    primary: 'bg-primary text-primary-foreground shadow-sm hover:brightness-105',
    secondary: 'border border-border bg-card text-foreground hover:bg-muted',
    ghost: 'text-muted-foreground hover:bg-muted hover:text-foreground',
    danger: 'border border-[#efc7bc] bg-[#fff5f0] text-[#a34c3e] hover:bg-[#fbe5de]',
  }[variant];
  return <button type="button" {...props} disabled={props.disabled || loading}
    className={cn('btn-pop inline-flex items-center justify-center gap-1.5 rounded-xl font-extrabold disabled:cursor-not-allowed disabled:opacity-50', size === 'sm' ? 'px-3 py-1.5 text-[11px]' : 'px-4 py-2.5 text-xs', styles, className)}>
    {loading ? <Loader2 size={13} className="animate-spin" /> : Icon ? <Icon size={13} /> : null}{children}
  </button>;
}

/** Sticky footer that appears only while there are unsaved changes, so an
 * admin never has to scroll to the bottom of a long tab to find Save. */
export function SaveBar({ dirty, saving, saved, onSave, onDiscard, testId = 'button-save-settings' }: { dirty: boolean; saving: boolean; saved: boolean; onSave: () => void; onDiscard: () => void; testId?: string }) {
  return <div className="pointer-events-none sticky bottom-4 z-20 mt-6 flex justify-center px-2">
    <div className={cn('pointer-events-auto flex w-full max-w-xl items-center gap-3 rounded-2xl border bg-card/95 px-4 py-3 shadow-[var(--shadow-lg)] backdrop-blur transition-all duration-200', dirty || saving ? 'translate-y-0 border-primary/40 opacity-100' : saved ? 'translate-y-0 border-border opacity-100' : 'pointer-events-none translate-y-3 border-border opacity-0')}>
      <div className="min-w-0 flex-1 text-xs">
        {dirty || saving
          ? <><div className="font-extrabold">Unsaved changes</div><div className="text-[11px] text-muted-foreground">Nothing is live for students until you save.</div></>
          : <div className="flex items-center gap-1.5 font-extrabold text-primary"><CheckCircle2 size={14} /> All changes saved</div>}
      </div>
      {(dirty || saving) && <>
        <Button variant="ghost" size="sm" icon={Undo2} onClick={onDiscard} disabled={saving}>Discard</Button>
        <Button variant="primary" icon={Save} loading={saving} onClick={onSave} data-testid={testId}>{saving ? 'Saving…' : 'Save changes'}</Button>
      </>}
    </div>
  </div>;
}
