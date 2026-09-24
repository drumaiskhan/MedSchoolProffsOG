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
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, ChevronUp, Eye, EyeOff, ImageOff, Info, Loader2, Save, Search, Undo2, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { resolveUploadUrl } from '@/lib/api';

type IconType = typeof Info;

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

type PanelTone = 'default' | 'amber' | 'green' | 'red';

const PANEL_TONE: Record<PanelTone, string> = {
  default: 'border-border bg-card',
  amber: 'border-accent/40 bg-accent/10',
  green: 'border-primary/30 bg-primary/8',
  red: 'border-destructive/30 bg-destructive/8',
};

const ICON_TONE: Record<PanelTone, string> = {
  default: 'bg-primary/10 text-primary',
  amber: 'bg-accent/20 text-accent-text',
  green: 'bg-primary/15 text-primary',
  red: 'bg-destructive/15 text-destructive',
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
    className={cn('relative mt-0.5 inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50', checked ? (tone === 'amber' ? 'bg-accent' : 'bg-primary') : 'bg-input')}>
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
  info: { box: 'border-info/30 bg-info/10 text-info', icon: Info },
  warn: { box: 'border-accent/40 bg-accent/10 text-accent-text', icon: AlertTriangle },
  danger: { box: 'border-destructive/30 bg-destructive/8 text-destructive', icon: XCircle },
  success: { box: 'border-primary/30 bg-primary/8 text-primary', icon: CheckCircle2 },
};

export function Callout({ tone = 'info', title, children, testId }: { tone?: CalloutTone; title?: ReactNode; children?: ReactNode; testId?: string }) {
  const { box, icon: Icon } = CALLOUT[tone];
  return <div className={cn('flex gap-3 rounded-xl border p-4 text-xs leading-5', box)} data-testid={testId}>
    <Icon size={16} className="mt-0.5 shrink-0" />
    <div className="min-w-0">{title && <div className="font-extrabold">{title}</div>}{children && <div className={cn(title && 'mt-0.5', 'opacity-90')}>{children}</div>}</div>
  </div>;
}

export function StatusPill({ tone = 'neutral', children }: { tone?: 'neutral' | 'green' | 'amber' | 'red'; children: ReactNode }) {
  const styles = { neutral: 'bg-muted text-muted-foreground', green: 'bg-primary/15 text-primary', amber: 'bg-accent/20 text-accent-text', red: 'bg-destructive/15 text-destructive' }[tone];
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
    danger: 'border border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20',
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


// ---------------------------------------------------------------------------
// Curriculum pages (Academic content, Subjects, Topics, MCQ bank)
// ---------------------------------------------------------------------------

type StatTone = 'green' | 'amber' | 'blue' | 'violet' | 'neutral';
const STAT_TONE: Record<StatTone, string> = {
  green: 'bg-primary/12 text-primary',
  amber: 'bg-accent/20 text-accent-text',
  blue: 'bg-info/15 text-info',
  violet: 'bg-violet/15 text-violet',
  neutral: 'bg-muted text-muted-foreground',
};

/** A row of at-a-glance counters that sits under a page header. */
export function StatTiles({ items, className }: { items: Array<{ label: string; value: ReactNode; icon: IconType; tone?: StatTone; hint?: string; testId?: string }>; className?: string }) {
  return <div className={cn('mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))]', className)}>
    {items.map((it) => <div key={it.label} className="card-lift flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5" data-testid={it.testId}>
      <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl shadow-[0_2px_0_hsl(0_0%_0%/.08),inset_0_1px_0_hsl(0_0%_100%/.6)]', STAT_TONE[it.tone ?? 'green'])}><it.icon size={17} /></span>
      <div className="min-w-0"><div className="font-display text-2xl leading-none tabular-nums">{it.value}</div><div className="mt-1 truncate text-[10px] font-bold uppercase tracking-[.08em] text-muted-foreground" title={it.hint}>{it.label}</div></div>
    </div>)}
  </div>;
}

/** Search field with a clear button — the one every curriculum list uses. */
export function SearchBox({ value, onChange, placeholder = 'Search…', testId, className }: { value: string; onChange: (value: string) => void; placeholder?: string; testId?: string; className?: string }) {
  return <div className={cn('relative min-w-0', className)}>
    <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
    <input value={value} onChange={(e: { target: { value: string } }) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} className={cn(inputClass, 'pl-9 pr-8')} data-testid={testId} />
    {value && <button type="button" onClick={() => onChange('')} aria-label="Clear search" className="absolute right-1.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground hover:bg-muted"><X size={13} /></button>}
  </div>;
}

/** Square thumbnail that resolves stored upload paths (so it also works when
 * the admin app and the API live on different domains) and falls back to an icon. */
export function Thumb({ url, size = 40, icon: Icon = ImageOff, className }: { url?: string | null; size?: number; icon?: IconType; className?: string }) {
  const src = resolveUploadUrl(url);
  return <div className={cn('grid shrink-0 place-items-center overflow-hidden rounded-xl bg-primary/10 text-primary shadow-[inset_0_1px_0_hsl(0_0%_100%/.5)]', className)} style={{ width: size, height: size }}>
    {src ? <img src={src} alt="" loading="lazy" decoding="async" className="size-full object-cover" /> : <Icon size={Math.round(size * 0.45)} />}
  </div>;
}

/** Reorder helper. `all` is EVERY sibling in display order (sort by displayOrder,
 * then id); `group` is the visible subset being reordered. Moves `id` one step
 * inside `group`, leaves every other item's slot alone, renumbers `all` as
 * 0..n-1 and returns only the rows whose displayOrder actually changes.
 * Renumbering (instead of swapping two displayOrder values) is what makes the
 * arrows work when two rows share the same order number. */
export function planReorder<T extends { id: number; displayOrder?: number }>(all: T[], group: T[], id: number, dir: -1 | 1): Array<{ id: number; displayOrder: number }> {
  const from = group.findIndex((x) => x.id === id);
  const to = from + dir;
  if (from < 0 || to < 0 || to >= group.length) return [];
  const reordered = [...group];
  [reordered[from], reordered[to]] = [reordered[to], reordered[from]];
  const inGroup = new Set(group.map((x) => x.id));
  let k = 0;
  const merged = all.map((x) => (inGroup.has(x.id) ? reordered[k++] : x));
  return merged.flatMap((x, i) => ((x.displayOrder ?? -1) === i ? [] : [{ id: x.id, displayOrder: i }]));
}

export const byOrder = <T extends { id: number; displayOrder?: number }>(a: T, b: T) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || a.id - b.id;

/** Controlled disclosure used for the Year → Module / Year → Subject trees.
 * Controlled (unlike shared.tsx's CollapsibleGroup) so a page can force every
 * group open while a search is active. Keeps the `button-toggle-<testId>` hook. */
export function Group({ title, count, icon, open, onToggle, testId, nested, children }: { title: ReactNode; count?: ReactNode; icon?: ReactNode; open: boolean; onToggle: () => void; testId: string; nested?: boolean; children?: ReactNode }) {
  return <div className={cn('overflow-hidden rounded-2xl border bg-card shadow-[var(--shadow-2xs)]', nested ? 'border-border/70' : 'border-border')}>
    <button type="button" onClick={onToggle} aria-expanded={open} className={cn('flex w-full items-center gap-2.5 text-left hover:bg-muted/40', nested ? 'px-3.5 py-3' : 'px-4 py-3.5')} data-testid={`button-toggle-${testId}`}>
      <ChevronRight size={nested ? 14 : 16} className={cn('shrink-0 text-primary transition-transform', open && 'rotate-90')} />
      {icon}
      <span className={cn('min-w-0 flex-1 truncate', nested ? 'text-xs font-extrabold' : 'text-sm font-extrabold')}>{title}</span>
      {count !== undefined && <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[10px] font-bold text-muted-foreground">{count}</span>}
    </button>
    {open && <div className="border-t border-border/70 bg-muted/20 p-3 sm:p-4">{children}</div>}
  </div>;
}

/** Tiny "type a name, press Enter" row for adding a child in place. */
export function QuickAdd({ placeholder, onAdd, pending, testId }: { placeholder: string; onAdd: (name: string) => void; pending?: boolean; testId?: string }) {
  const [value, setValue] = useState('');
  return <form onSubmit={(e) => { e.preventDefault(); const name = value.trim(); if (name) { onAdd(name); setValue(''); } }} className="mt-3 flex gap-2">
    <input value={value} onChange={(e: { target: { value: string } }) => setValue(e.target.value)} placeholder={placeholder} className={cn(inputClass, 'h-9 flex-1')} data-testid={testId} />
    <button type="submit" disabled={pending || !value.trim()} className="btn-pop inline-flex h-9 items-center gap-1 rounded-xl bg-primary px-3.5 text-[11px] font-extrabold text-primary-foreground disabled:opacity-50" data-testid={testId ? `${testId}-submit` : undefined}>Add</button>
  </form>;
}

/** Up/down arrow pair used on every reorderable row. */
export function MoveButtons({ canUp, canDown, onUp, onDown, testIdSuffix }: { canUp: boolean; canDown: boolean; onUp: () => void; onDown: () => void; testIdSuffix: string }) {
  const cls = 'grid size-5 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-25 disabled:hover:bg-transparent';
  return <div className="flex shrink-0 flex-col">
    <button type="button" disabled={!canUp} onClick={onUp} className={cls} aria-label="Move up" data-testid={`button-move-up-${testIdSuffix}`}><ChevronUp size={13} /></button>
    <button type="button" disabled={!canDown} onClick={onDown} className={cls} aria-label="Move down" data-testid={`button-move-down-${testIdSuffix}`}><ChevronDown size={13} /></button>
  </div>;
}
