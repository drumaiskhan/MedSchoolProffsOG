// Platform settings — code-split via React.lazy() in App.tsx.
//
// Rebuilt for the admin-panel modernisation pass: a left rail of sections
// (horizontal pills on mobile), icon-led cards, real switches instead of
// checkboxes, one sticky "unsaved changes" bar instead of a Save button at
// the bottom of every tab, and every setting in exactly one place — the
// Design & branding cards that used to live on Site content, and the
// Platform description that sat next to them, now live here; the dead
// "Support email" field (nothing ever read it — the footer uses Contact
// email on Site content) is gone.
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useSearch } from 'wouter';
import {
  Bell, Cloud, ClipboardCheck, Copy, FileStack, FolderOpen, Gift, Globe, KeyRound, Library, ListChecks, Mail, Megaphone, Palette, Plus,
  Repeat, Send, Server, Settings, ShieldCheck, Shuffle, Sparkles, Stethoscope, Swords, Target, ToggleRight, Trash2, UploadCloud, Users, Wand2, Wifi, X, Zap, GraduationCap,
} from 'lucide-react';
import { readableForegroundHsl, DEFAULT_THEME } from '@/lib/theme';
import { toast } from '@/hooks/use-toast';
import { settingsApi, ApiRequestError, type TrialFeatureOption } from '@/lib/api';
import { AdminAccountSection, AdminImageUpload, ColorField, FaviconUploader, NotificationBroadcastPanel, SectionHeader } from '@/lib/shared';
import { Button, Callout, Chip, Field, OptionCard, Panel, SaveBar, SecretInput, SelectInput, StatusPill, SubSection, TextArea, TextInput, ToggleRow } from '@/lib/admin-ui';
import { queryClient } from '@/lib/query-client';
import { cn } from '@/lib/utils';

type TabId = 'general' | 'branding' | 'access' | 'ai' | 'email' | 'storage' | 'security' | 'notifications';

// Sent in place of a secret's value to mean "delete the saved key" — a blank
// value already means "leave it alone" (the GET never returns secrets), so
// removing one needs its own signal. Must match CLEAR_SECRET in
// api-server/src/routes/settings.ts.
const CLEAR_SECRET = '__CLEAR__';

const ordinal = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'} Year`;

// Icons for the trial's feature toggles, keyed by the server's feature keys
// (TRIAL_FEATURE_OPTIONS in api-server/src/lib/trial.ts). A key the server
// adds later still renders — it just gets the generic icon.
const FEATURE_ICON: Record<string, typeof Target> = {
  mcqs: Target, past_papers: FileStack, exams: ClipboardCheck, flashcards: Zap, resources: FolderOpen,
  ai_explain: Sparkles, ai_visualizer: Wand2, challenges: Swords, books: Library,
};

const PRACTICE_ESSENTIALS = ['mcqs', 'past_papers', 'exams'];

const AI_PROVIDERS: Array<[string, string]> = [['anthropic', 'Anthropic (Claude)'], ['openai', 'OpenAI'], ['gemini', 'Google Gemini'], ['custom', 'Custom (OpenAI-compatible)']];

function parseJson<T>(raw: string | undefined, fallback: T): T {
  try { return raw ? (JSON.parse(raw) as T) : fallback; } catch { return fallback; }
}

function parseYears(raw: string | undefined): number[] {
  return Array.from(new Set((raw || '').split(',').map((p) => Number(p.trim())).filter((n) => Number.isInteger(n) && n >= 1 && n <= 6))).sort((a, b) => a - b);
}

function AdminSettings() {
  const settingsQuery = useQuery({ queryKey: ['admin-settings'], queryFn: settingsApi.get });
  const [form, setForm] = useState<Record<string, string> | null>(null);
  const values = form ?? settingsQuery.data ?? {};
  const dirty = form !== null;
  const save = useMutation({
    mutationFn: settingsApi.update,
    onSuccess: (data) => { setForm(null); queryClient.setQueryData(['admin-settings'], data); queryClient.invalidateQueries({ queryKey: ['site-content'] }); },
    onError: (err: unknown) => toast({ title: 'Could not save settings', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }),
  });
  const rotate = useMutation({ mutationFn: settingsApi.rotateAdminCode, onSuccess: (data) => setForm({ ...values, ...data }) });
  const testStorage = useMutation({
    mutationFn: settingsApi.testStorage,
    onError: (err: unknown) => toast({ title: 'Could not run the test', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }),
  });

  // Email test results are kept per target ("all" = the whole setup exactly
  // as real mail is sent, or a Brevo slot number = that one key on its own).
  const [testEmailTo, setTestEmailTo] = useState('');
  const [emailTests, setEmailTests] = useState<Record<string, { ok: boolean; error?: string }>>({});
  const testEmail = useMutation({
    mutationFn: (vars: { to: string; slot?: number }) => settingsApi.testEmail(vars.to, vars.slot),
    onSuccess: (data, vars) => setEmailTests((prev) => ({ ...prev, [String(vars.slot ?? 'all')]: data })),
    onError: (err: unknown) => toast({ title: 'Could not run the test', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }),
  });
  const testingTarget = testEmail.isPending ? String(testEmail.variables?.slot ?? 'all') : null;

  const set = (key: string, value: string) => setForm({ ...values, [key]: value });
  const patch = (changes: Record<string, string>) => setForm({ ...values, ...changes });

  const search = useSearch();
  const requestedTab = new URLSearchParams(search).get('tab');
  const [tab, setTab] = useState<TabId>(() => (requestedTab === 'features' ? 'access' : (['general', 'branding', 'access', 'ai', 'email', 'storage', 'security', 'notifications'] as string[]).includes(requestedTab ?? '') ? (requestedTab as TabId) : 'general'));

  // ANNOUNCEMENT_BANNER is a JSON array of strings (a site with the old
  // plain-text value shows it as one existing entry instead of losing it).
  let announcements: string[] = [];
  try {
    const parsed = JSON.parse(values.ANNOUNCEMENT_BANNER || '[]');
    if (Array.isArray(parsed)) announcements = parsed.filter((x): x is string => typeof x === 'string');
  } catch {
    if (values.ANNOUNCEMENT_BANNER?.trim()) announcements = [values.ANNOUNCEMENT_BANNER.trim()];
  }
  const [newAnnouncement, setNewAnnouncement] = useState('');
  const setAnnouncements = (list: string[]) => set('ANNOUNCEMENT_BANNER', JSON.stringify(list));

  const storageIssue = values.CLOUDINARY_CONFIGURED !== 'true';
  const emailIssue = values.EMAIL_CONFIGURED !== 'true';

  const TABS: Array<{ id: TabId; label: string; blurb: string; icon: typeof Settings; badge?: boolean }> = [
    { id: 'general', label: 'General', blurb: 'Name, tagline, announcements', icon: Settings },
    { id: 'branding', label: 'Branding', blurb: 'Colours, favicon, dashboard photo', icon: Palette },
    { id: 'access', label: 'Access & trial', blurb: 'Registration, trial mode, switches', icon: ToggleRight },
    { id: 'ai', label: 'AI', blurb: 'Providers and explanations', icon: Sparkles },
    { id: 'email', label: 'Email', blurb: 'Brevo accounts, SMTP, test sends', icon: Mail, badge: emailIssue },
    { id: 'storage', label: 'Storage', blurb: 'Cloudinary uploads', icon: UploadCloud, badge: storageIssue },
    { id: 'security', label: 'Security', blurb: 'Invite code and your login', icon: ShieldCheck },
    { id: 'notifications', label: 'Broadcast', blurb: 'Message your students', icon: Bell },
  ];

  // ---- Branding -----------------------------------------------------------
  const theme = {
    primary: values.THEME_PRIMARY || DEFAULT_THEME.THEME_PRIMARY,
    secondary: values.THEME_SECONDARY || DEFAULT_THEME.THEME_SECONDARY,
    accent: values.THEME_ACCENT || DEFAULT_THEME.THEME_ACCENT,
    background: values.THEME_BACKGROUND || DEFAULT_THEME.THEME_BACKGROUND,
    card: values.THEME_CARD || DEFAULT_THEME.THEME_CARD,
    text: values.THEME_TEXT || DEFAULT_THEME.THEME_TEXT,
    mode: values.THEME_MODE || DEFAULT_THEME.THEME_MODE,
  };

  // ---- General trial mode -------------------------------------------------
  const trialOn = values.GLOBAL_TRIAL_MODE === 'true';
  const featureOptions = parseJson<TrialFeatureOption[]>(values.TRIAL_FEATURE_OPTIONS, []);
  const defaultFeatureKeys = featureOptions.filter((o) => o.defaultOn).map((o) => o.key);
  const savedFeatures = parseJson<unknown>(values.GLOBAL_TRIAL_FEATURES, null);
  // Blank / unparseable = the server's default set, exactly as lib/trial.ts resolves it.
  const trialFeatures: string[] = Array.isArray(savedFeatures) ? savedFeatures.filter((k): k is string => typeof k === 'string') : defaultFeatureKeys;
  // GLOBAL_TRIAL_YEAR is the pre-multi-year single value; if that's all that's saved, show it as the selection.
  const trialYears = parseYears(values.GLOBAL_TRIAL_YEARS || values.GLOBAL_TRIAL_YEAR);
  const setTrialYears = (years: number[]) => patch({ GLOBAL_TRIAL_YEARS: years.join(','), GLOBAL_TRIAL_YEAR: '' });
  const toggleTrialYear = (year: number) => setTrialYears(trialYears.includes(year) ? trialYears.filter((y) => y !== year) : [...trialYears, year].sort((a, b) => a - b));
  const setTrialFeatures = (keys: string[]) => set('GLOBAL_TRIAL_FEATURES', JSON.stringify(keys));
  const toggleTrialFeature = (key: string) => setTrialFeatures(trialFeatures.includes(key) ? trialFeatures.filter((k) => k !== key) : [...trialFeatures, key]);
  const trialEndsAt = values.GLOBAL_TRIAL_ENDS_AT || '';
  // Mirrors lib/trial.ts: a bare date runs through the end of that day (UTC).
  const trialExpired = !!trialEndsAt && Date.parse(`${trialEndsAt}T23:59:59.999Z`) < Date.now();
  const trialWho = [values.GLOBAL_TRIAL_PROGRAM, trialYears.length ? trialYears.map(ordinal).join(', ').replace(/ Year/g, '') + ' Year' : ''].filter(Boolean).join(' · ');
  const trialWhat = featureOptions.filter((o) => trialFeatures.includes(o.key)).map((o) => o.label);

  // ---- Email --------------------------------------------------------------
  const brevoMax = Number(values.BREVO_MAX_SLOTS) || 5;
  const slotKey = (n: number) => (n === 1 ? 'BREVO_API_KEY' : `BREVO_API_KEY_${n}`);
  const slotSenderKey = (n: number) => `BREVO_SENDER_EMAIL_${n}`;
  const slotSaved = (n: number) => values[`${slotKey(n)}_SET`] === 'true' && values[slotKey(n)] !== CLEAR_SECRET;
  const slotFilled = (n: number) => slotSaved(n) || (!!values[slotKey(n)] && values[slotKey(n)] !== CLEAR_SECRET);
  const [slotsRequested, setSlotsRequested] = useState(1);
  const highestFilled = Array.from({ length: brevoMax }, (_, i) => i + 1).filter(slotFilled).pop() ?? 1;
  const shownSlots = Math.min(brevoMax, Math.max(1, highestFilled, slotsRequested));
  const filledSlotCount = Array.from({ length: brevoMax }, (_, i) => i + 1).filter(slotFilled).length;
  const emailProvider = values.EMAIL_PROVIDER || '';

  const inputRow = 'grid gap-4 sm:grid-cols-2';

  return <div className="mx-auto max-w-6xl">
    <SectionHeader eyebrow="Workspace" title="Platform settings" action={<span className="hidden text-[11px] text-muted-foreground sm:inline">Saved changes apply to every student instantly</span>} />

    <div className="grid gap-6 lg:grid-cols-[236px_minmax(0,1fr)]">
      {/* Section rail — vertical on desktop, scrolling pills on mobile */}
      <nav aria-label="Settings sections" className="lg:sticky lg:top-[92px] lg:self-start">
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0">
          {TABS.map((t) => <button key={t.id} type="button" onClick={() => setTab(t.id)} aria-current={tab === t.id ? 'page' : undefined}
            className={cn('group relative flex shrink-0 items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all lg:w-full', tab === t.id ? 'border-primary/40 bg-card shadow-sm' : 'border-transparent hover:bg-card/70')} data-testid={`tab-settings-${t.id}`}>
            <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg transition-colors', tab === t.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground group-hover:text-foreground')}><t.icon size={16} /></span>
            <span className="min-w-0"><span className="block text-xs font-extrabold">{t.label}</span><span className="mt-0.5 hidden truncate text-[10px] text-muted-foreground lg:block">{t.blurb}</span></span>
            {t.badge && <span className="absolute right-2.5 top-2.5 size-2 rounded-full bg-accent" title="Needs attention" />}
          </button>)}
        </div>
      </nav>

      <div className="min-w-0 space-y-5">
        {/* ------------------------------------------------------------ General */}
        {tab === 'general' && <>
          <Panel icon={Globe} title="Platform profile" description="The details students see across their study desk, the footer and link previews.">
            <div className={inputRow}>
              <Field label="Platform name"><TextInput value={values.PLATFORM_NAME || ''} onChange={(e) => set('PLATFORM_NAME', e.target.value)} data-testid="input-platform-name" /></Field>
              <Field label="WhatsApp support number" hint='Country code + number, digits only. Students get a "Chat on WhatsApp" button that opens this number.'>
                <TextInput value={values.SUPPORT_WHATSAPP || ''} onChange={(e) => set('SUPPORT_WHATSAPP', e.target.value.replace(/[^\d+]/g, ''))} placeholder="e.g. 923001234567" data-testid="input-support-whatsapp" />
              </Field>
              <Field label="Tagline" className="sm:col-span-2"><TextInput value={values.PLATFORM_TAGLINE || ''} onChange={(e) => set('PLATFORM_TAGLINE', e.target.value)} data-testid="input-platform-tagline" /></Field>
              <Field label="Platform description" hint="Shown in the site footer. Contact email, location, social links and SEO live on the Site content page." className="sm:col-span-2">
                <TextArea value={values.PLATFORM_DESCRIPTION || ''} onChange={(e) => set('PLATFORM_DESCRIPTION', e.target.value)} data-testid="input-platform-description" />
              </Field>
            </div>
          </Panel>

          <Panel icon={Megaphone} title="Announcement banner" badge={announcements.length ? <StatusPill tone="green">{announcements.length} live</StatusPill> : <StatusPill>Hidden</StatusPill>}
            description="Scrolls across the top of the student app. Add more than one and they scroll through together. Remove them all to hide the banner.">
            {announcements.length > 0 && <div className="mb-3 space-y-2">
              {announcements.map((a, i) => <div key={i} className="flex items-center gap-2">
                <TextInput value={a} onChange={(e) => setAnnouncements(announcements.map((x, idx) => (idx === i ? e.target.value : x)))} data-testid={`input-announcement-${i}`} />
                <Button variant="ghost" size="sm" onClick={() => setAnnouncements(announcements.filter((_, idx) => idx !== i))} aria-label="Remove announcement" data-testid={`button-remove-announcement-${i}`}><Trash2 size={14} /></Button>
              </div>)}
            </div>}
            <div className="flex gap-2">
              <TextInput value={newAnnouncement} onChange={(e) => setNewAnnouncement(e.target.value)} placeholder="e.g. New batch enrollment opens Monday" data-testid="input-new-announcement"
                onKeyDown={(e) => { if (e.key === 'Enter' && newAnnouncement.trim()) { e.preventDefault(); setAnnouncements([...announcements, newAnnouncement.trim()]); setNewAnnouncement(''); } }} />
              <Button variant="primary" icon={Plus} disabled={!newAnnouncement.trim()} onClick={() => { setAnnouncements([...announcements, newAnnouncement.trim()]); setNewAnnouncement(''); }} data-testid="button-add-announcement">Add</Button>
            </div>
          </Panel>
        </>}

        {/* ----------------------------------------------------------- Branding */}
        {tab === 'branding' && <>
          <Panel icon={Palette} title="Design & branding" description="Applies across the student and admin apps, including the sign-in pages.">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_240px]">
              <div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <ColorField label="Primary" value={theme.primary} onChange={(v) => set('THEME_PRIMARY', v)} testId="theme-primary" />
                  <ColorField label="Secondary" value={theme.secondary} onChange={(v) => set('THEME_SECONDARY', v)} testId="theme-secondary" />
                  <ColorField label="Accent" value={theme.accent} onChange={(v) => set('THEME_ACCENT', v)} testId="theme-accent" />
                  <ColorField label="Background" value={theme.background} onChange={(v) => set('THEME_BACKGROUND', v)} testId="theme-background" />
                  <ColorField label="Card" value={theme.card} onChange={(v) => set('THEME_CARD', v)} testId="theme-card" />
                  <ColorField label="Text" value={theme.text} onChange={(v) => set('THEME_TEXT', v)} testId="theme-text" />
                </div>
                <div className="mt-5">
                  <div className="text-xs font-bold">Theme mode</div>
                  <div className="mt-2 inline-flex rounded-xl border border-border bg-background p-1">
                    {(['light', 'dark'] as const).map((mode) => <button key={mode} type="button" onClick={() => set('THEME_MODE', mode)} className={cn('rounded-lg px-4 py-2 text-xs font-bold capitalize transition-colors', theme.mode === mode ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')} data-testid={`button-theme-mode-${mode}`}>{mode}</button>)}
                  </div>
                </div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Live preview</div>
                <div className="mt-2 overflow-hidden rounded-xl border border-border" style={{ backgroundColor: theme.background }} data-testid="panel-theme-preview">
                  <div className="m-3 overflow-hidden rounded-lg shadow-sm" style={{ backgroundColor: theme.card }}>
                    <div className="flex items-center gap-2 px-3 py-2.5" style={{ backgroundColor: theme.primary }}>
                      <span className="grid size-5 place-items-center rounded-md" style={{ backgroundColor: theme.accent }}><Stethoscope size={11} color="#fff" /></span>
                      <span className="text-[10px] font-extrabold" style={{ color: readableForegroundHsl(theme.primary) === '0 0% 100%' ? '#fff' : theme.text }}>Dashboard</span>
                    </div>
                    <div className="space-y-2 p-3">
                      <div className="h-2 w-3/4 rounded-full" style={{ backgroundColor: theme.secondary, opacity: 0.4 }} />
                      <div className="h-2 w-1/2 rounded-full" style={{ backgroundColor: theme.secondary, opacity: 0.25 }} />
                      <span className="mt-2 inline-block rounded-md px-3 py-1.5 text-[10px] font-extrabold text-white" style={{ backgroundColor: theme.primary }}>Continue</span>
                      <span className="ml-2 inline-block rounded-md px-3 py-1.5 text-[10px] font-extrabold" style={{ backgroundColor: theme.accent, color: '#fff' }}>68%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Panel>
          <Panel icon={GraduationCap} title="Dashboard greeting photo" description="Optional — shown behind the student Dashboard's greeting card (e.g. a stethoscope photo). PNG, JPEG or WEBP. Falls back to a plain pattern when unset.">
            <AdminImageUpload currentUrl={values.DASHBOARD_HERO_IMAGE_URL || ''} kind="resource" accept="image/png,image/jpeg,image/webp" hint="" testId="input-dashboard-hero-upload" onUploaded={(storagePath) => set('DASHBOARD_HERO_IMAGE_PATH', storagePath)} />
          </Panel>
          <Panel icon={Globe} title="Website favicon" description="The small icon shown in browser tabs and bookmarks.">
            <FaviconUploader currentUrl={values.SITE_FAVICON_URL || ''} onUploaded={(storagePath) => set('SITE_FAVICON_PATH', storagePath)} />
          </Panel>
        </>}

        {/* ------------------------------------------------------ Access & trial */}
        {tab === 'access' && <>
          <Panel icon={Users} title="Registration" description="Whether new students can create an account. Payment methods and collection details live under Payments & collection.">
            <ToggleRow title="Open student registration" description="Off hides the sign-up form; existing students can still sign in." checked={values.REGISTRATION_ENABLED !== 'false'} onChange={(on) => set('REGISTRATION_ENABLED', on ? 'true' : 'false')} testId="checkbox-registration-enabled" />
          </Panel>

          <Panel icon={ToggleRight} title="Student features" description="Site-wide switches. Turning one off hides it for every student and blocks direct access too.">
            <div className="space-y-3">
              <ToggleRow title="AI Visualizer" description='Off removes the "AI Visualizer" link from every sidebar and blocks the page directly.' checked={values.AI_VISUALIZER_ENABLED !== 'false'} onChange={(on) => set('AI_VISUALIZER_ENABLED', on ? 'true' : 'false')} testId="checkbox-ai-visualizer-enabled" />
              <ToggleRow title={'"Ask AI to explain differently"'} description="The button on MCQs, flashcards and past papers. Doesn't touch admin-side AI generation or auto-explain-on-import (AI tab)." checked={values.AI_EXPLAIN_ENABLED !== 'false'} onChange={(on) => set('AI_EXPLAIN_ENABLED', on ? 'true' : 'false')} testId="checkbox-ai-explain-enabled" />
            </div>
          </Panel>

          <Panel icon={Gift} tone={trialOn && !trialExpired ? 'amber' : 'default'} title="General trial mode"
            badge={trialOn ? (trialExpired ? <StatusPill tone="red">Ended</StatusPill> : <StatusPill tone="amber">Live</StatusPill>) : <StatusPill>Off</StatusPill>}
            description="Let students without a paid membership use chosen features for free — for a launch week, an exam-season promo or a single year group. It never touches anyone's membership record, so switching it off restores normal access instantly.">
            <ToggleRow tone="amber" title="Enable trial mode" description="Students inside the group below get the features you pick, signed in and free." checked={trialOn} onChange={(on) => set('GLOBAL_TRIAL_MODE', on ? 'true' : 'false')} testId="checkbox-global-trial-mode" />

            {trialOn && <div className="mt-6 space-y-7">
              <SubSection title="Who gets it" description="Leave everything on “All” to open it to every signed-in student. Students with no program or year on their profile only match an unrestricted trial.">
                <div className="grid gap-4 sm:grid-cols-[200px_minmax(0,1fr)]">
                  <Field label="Program">
                    <SelectInput value={values.GLOBAL_TRIAL_PROGRAM || ''} onChange={(e) => set('GLOBAL_TRIAL_PROGRAM', e.target.value)} data-testid="select-global-trial-program">
                      <option value="">All programs</option><option value="MBBS">MBBS</option><option value="BDS">BDS</option>
                    </SelectInput>
                  </Field>
                  <div>
                    <div className="text-xs font-bold">Academic years <span className="font-normal text-muted-foreground">— pick as many as you like</span></div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Chip active={trialYears.length === 0} onClick={() => setTrialYears([])} testId="chip-trial-year-all">All years</Chip>
                      {[1, 2, 3, 4, 5].map((y) => <Chip key={y} active={trialYears.includes(y)} onClick={() => toggleTrialYear(y)} testId={`chip-trial-year-${y}`}>{ordinal(y)}</Chip>)}
                    </div>
                  </div>
                </div>
              </SubSection>

              <SubSection title="What they can use" description="Only the features you switch on unlock. Everything else stays behind the normal membership.">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-bold text-muted-foreground">Presets:</span>
                  <Chip active={false} onClick={() => setTrialFeatures(defaultFeatureKeys)} testId="preset-trial-everything">Everything (no paid books)</Chip>
                  <Chip active={false} onClick={() => setTrialFeatures(PRACTICE_ESSENTIALS.filter((k) => featureOptions.some((o) => o.key === k)))} testId="preset-trial-practice">MCQs, past papers &amp; Pre-Proffs</Chip>
                  <Chip active={false} onClick={() => setTrialFeatures([])} testId="preset-trial-none">Clear</Chip>
                </div>
                <div className="grid gap-2.5 sm:grid-cols-2" data-testid="grid-trial-features">
                  {featureOptions.map((o) => {
                    const Icon = FEATURE_ICON[o.key] ?? Sparkles;
                    const on = trialFeatures.includes(o.key);
                    return <button key={o.key} type="button" onClick={() => toggleTrialFeature(o.key)} aria-pressed={on} data-testid={`toggle-trial-feature-${o.key}`}
                      className={cn('flex items-start gap-3 rounded-xl border p-3.5 text-left transition-all', on ? 'border-accent bg-card shadow-sm ring-2 ring-accent/25' : 'border-border bg-background/60 hover:border-accent/60')}>
                      <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg', on ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground')}><Icon size={16} /></span>
                      <span className="min-w-0 flex-1"><span className="flex items-center gap-2 text-xs font-extrabold">{o.label}{!o.defaultOn && <StatusPill tone="red">Paid content</StatusPill>}</span><span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">{o.description}</span></span>
                      <span className={cn('mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border text-[10px] font-black', on ? 'border-accent bg-accent text-accent-foreground' : 'border-border text-transparent')}>✓</span>
                    </button>;
                  })}
                </div>
                {trialFeatures.length === 0 && <div className="mt-3"><Callout tone="warn" title="Nothing selected">With no features switched on, trial mode unlocks nothing for anyone.</Callout></div>}
                {trialFeatures.includes('books') && <div className="mt-3"><Callout tone="warn" title="Paid books are included">Every paid book becomes readable for trial students. Book files are still direct links today, so anyone who opens one can keep or share it — leave this off unless you're comfortable with that.</Callout></div>}
              </SubSection>

              <SubSection title="Until when" description="Optional. The trial switches itself off after the end of this day (UTC) — no need to remember to come back.">
                <div className="flex flex-wrap items-end gap-3">
                  <Field label="End date"><TextInput type="date" value={trialEndsAt} onChange={(e) => set('GLOBAL_TRIAL_ENDS_AT', e.target.value)} className="w-48" data-testid="input-global-trial-ends-at" /></Field>
                  {trialEndsAt && <Button variant="ghost" size="sm" icon={X} onClick={() => set('GLOBAL_TRIAL_ENDS_AT', '')}>No end date</Button>}
                </div>
              </SubSection>

              <div data-testid="text-trial-summary">
                {trialExpired
                  ? <Callout tone="danger" title="This trial has ended">Its end date has passed, so nothing is unlocked. Change the date or clear it to run it again.</Callout>
                  : <Callout tone="warn" title="Live once you save">
                    <strong>{trialWho ? `${trialWho} students` : 'Every signed-in student'}</strong> {trialWhat.length ? <>can use <strong>{trialWhat.join(', ')}</strong></> : 'get nothing yet'}{trialEndsAt ? <>, until <strong>{new Date(`${trialEndsAt}T12:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}</strong></> : ', with no end date'}. This is separate from granting a trial to a single student on <Link href="/admin/students" className="font-extrabold underline">Students</Link>.
                  </Callout>}
              </div>
            </div>}
          </Panel>

          <Panel icon={ListChecks} title="Trial daily MCQ limit" description="Caps how many MCQs a trial-only student can submit per day (UTC), summed across every practice session. Applies to both General trial mode above and a per-student trial granted from Students → grant trial. Paying students (an active membership) are never capped.">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="MCQs per day">
                <TextInput type="number" min={0} value={values.TRIAL_DAILY_MCQ_LIMIT ?? ''} placeholder="50" onChange={(e) => set('TRIAL_DAILY_MCQ_LIMIT', e.target.value)} className="w-28" data-testid="input-trial-daily-mcq-limit" />
              </Field>
              <span className="pb-2.5 text-[11px] text-muted-foreground">0 = unlimited. Blank saves as the default, 50.</span>
            </div>
          </Panel>
        </>}

        {/* ----------------------------------------------------------------- AI */}
        {tab === 'ai' && <>
          <Panel icon={Sparkles} title="AI provider" description={'Powers the "Ask AI to explain differently" button, plus admin-side AI-generated questions, explanations and flashcard drafts. Falls back to the server\'s ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY env vars if left blank.'}>
            <div className={inputRow}>
              <Field label="Provider"><SelectInput value={values.AI_PROVIDER || 'anthropic'} onChange={(e) => set('AI_PROVIDER', e.target.value)} data-testid="select-ai-provider">{AI_PROVIDERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</SelectInput></Field>
              <Field label="API key"><SecretInput value={values.AI_API_KEY || ''} onChange={(v) => set('AI_API_KEY', v)} isSet={values.AI_API_KEY_SET === 'true'} masked={values.AI_API_KEY_MASKED} placeholder="sk-..." testId="input-ai-api-key" /></Field>
              <Field label={<>Model <span className="font-normal text-muted-foreground">(optional)</span></>} hint="Blank uses the provider's default."><TextInput value={values.AI_MODEL || ''} onChange={(e) => set('AI_MODEL', e.target.value)} placeholder="e.g. claude-sonnet-4-6, gpt-4o-mini" data-testid="input-ai-model" /></Field>
              {values.AI_PROVIDER === 'custom' && <Field label="Base URL" hint="An OpenAI-compatible /chat/completions endpoint."><TextInput value={values.AI_BASE_URL || ''} onChange={(e) => set('AI_BASE_URL', e.target.value)} placeholder="https://api.example.com/v1" data-testid="input-ai-base-url" /></Field>}
            </div>
          </Panel>

          <Panel icon={Repeat} title="Backup AI providers" badge={<StatusPill>Optional · up to 5</StatusPill>}
            description="Tried automatically, in order, whenever an earlier provider fails — an outage, a rate limit, an expired key, a timeout — so one API running out doesn't take Ask AI down. Mix providers and accounts freely (e.g. Anthropic, then OpenAI, then a couple of Groq/OpenRouter keys via Custom). Leave a slot blank to skip it.">
            <div className="space-y-4">
              {(['2', '3', '4', '5', '6'] as const).map((n) => {
                const providerKey = `AI_PROVIDER_${n}`, apiKeyKey = `AI_API_KEY_${n}`, modelKey = `AI_MODEL_${n}`, baseUrlKey = `AI_BASE_URL_${n}`;
                const active = !!values[providerKey];
                return <div key={n} className={cn('rounded-xl border p-4 transition-colors', active ? 'border-primary/30 bg-background/60' : 'border-dashed border-border')}>
                  <div className="flex items-center gap-3">
                    <span className={cn('grid size-8 place-items-center rounded-lg text-[11px] font-black', active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>{Number(n) - 1}</span>
                    <div className="min-w-0 flex-1"><SelectInput value={values[providerKey] || ''} onChange={(e) => set(providerKey, e.target.value)} data-testid={`select-ai-provider-${n}`}><option value="">Backup {Number(n) - 1} — not configured</option>{AI_PROVIDERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</SelectInput></div>
                  </div>
                  {active && <div className={cn(inputRow, 'mt-4')}>
                    <Field label="API key"><SecretInput value={values[apiKeyKey] || ''} onChange={(v) => set(apiKeyKey, v)} isSet={values[`${apiKeyKey}_SET`] === 'true'} masked={values[`${apiKeyKey}_MASKED`]} placeholder="sk-..." testId={`input-ai-api-key-${n}`} /></Field>
                    <Field label={<>Model <span className="font-normal text-muted-foreground">(optional)</span></>}><TextInput value={values[modelKey] || ''} onChange={(e) => set(modelKey, e.target.value)} placeholder="Provider default" data-testid={`input-ai-model-${n}`} /></Field>
                    {values[providerKey] === 'custom' && <Field label="Base URL" className="sm:col-span-2"><TextInput value={values[baseUrlKey] || ''} onChange={(e) => set(baseUrlKey, e.target.value)} placeholder="https://api.example.com/v1" data-testid={`input-ai-base-url-${n}`} /></Field>}
                  </div>}
                </div>;
              })}
            </div>
          </Panel>

          <Panel icon={Wand2} title="Auto-explain on import" description="Generate explanations and hints while MCQs are imported, instead of only on demand.">
            <ToggleRow title="Auto-generate explanations & hints on MCQ import" description='Uses the provider above (and backups). Every imported question without an explanation is queued automatically, landing as "AI generated — awaiting review", never auto-approved. Runs in the background.' checked={values.AI_AUTO_EXPLAIN_ON_IMPORT === 'true'} onChange={(on) => set('AI_AUTO_EXPLAIN_ON_IMPORT', on ? 'true' : 'false')} testId="checkbox-ai-auto-explain-import" />
            {values.AI_AUTO_EXPLAIN_ON_IMPORT === 'true' && <div className="mt-4 max-w-sm"><Field label={<>Bulk-generation model <span className="font-normal text-muted-foreground">(optional)</span></>} hint="A cheaper/faster model for high-volume imports. Blank uses the Model above."><TextInput value={values.AI_AUTO_EXPLAIN_MODEL || ''} onChange={(e) => set('AI_AUTO_EXPLAIN_MODEL', e.target.value)} placeholder="e.g. claude-haiku-4-5, gpt-4o-mini" data-testid="input-ai-auto-explain-model" /></Field></div>}
          </Panel>
        </>}

        {/* -------------------------------------------------------------- Email */}
        {tab === 'email' && <>
          {emailIssue && <Callout tone="danger" title="No email provider is configured" testId="banner-email-warning">Verification, welcome, password-reset, membership/trial and payment emails are logged to the server console instead of being sent until a provider below is set up.</Callout>}

          <Panel icon={Mail} title="Email provider" badge={values.EMAIL_CONFIGURED === 'true' ? <StatusPill tone="green">Configured</StatusPill> : undefined}
            description="Used for every automated email: verification, welcome, password reset, membership activated, trial started, payment submitted/rejected. Pick one — the fields for the others can stay filled in without being used.">
            <div className="grid gap-3 sm:grid-cols-4">
              <OptionCard active={emailProvider === ''} onClick={() => set('EMAIL_PROVIDER', '')} icon={Server} title="Env vars only" description="Use the server's environment variables." testId="option-email-none" />
              <OptionCard active={emailProvider === 'brevo'} onClick={() => set('EMAIL_PROVIDER', 'brevo')} icon={Send} title="Brevo" description="API keys, with backup accounts." testId="option-email-brevo" />
              <OptionCard active={emailProvider === 'smtp'} onClick={() => set('EMAIL_PROVIDER', 'smtp')} icon={Mail} title="SMTP" description="Any standard mail server." testId="option-email-smtp" />
              <OptionCard active={emailProvider === 'custom'} onClick={() => set('EMAIL_PROVIDER', 'custom')} icon={Cloud} title="Custom API" description="Postmark, Resend, an internal mailer…" testId="option-email-custom" />
            </div>
            <div className={cn(inputRow, 'mt-5')}>
              <Field label={'"From" email'}><TextInput value={values.MAIL_FROM || ''} onChange={(e) => set('MAIL_FROM', e.target.value)} placeholder="no-reply@yourdomain.com" data-testid="input-mail-from" /></Field>
              <Field label={'"From" name'}><TextInput value={values.MAIL_FROM_NAME || ''} onChange={(e) => set('MAIL_FROM_NAME', e.target.value)} placeholder="MedschoolProffs" data-testid="input-mail-from-name" /></Field>
            </div>
          </Panel>

          {emailProvider === 'brevo' && <Panel icon={Send} title="Brevo accounts" badge={<StatusPill tone={filledSlotCount ? 'green' : 'neutral'}>{filledSlotCount} of {brevoMax} slots in use</StatusPill>}
            description="Each Brevo account has its own daily sending limit. Add more than one API key and mail keeps flowing when one runs out, is revoked or Brevo has a hiccup. Get a key at Brevo → Settings → SMTP & API → API keys.">
            <Field label="How to use the slots" className="max-w-md" hint={values.BREVO_SLOT_STRATEGY === 'round_robin' ? 'Each email goes out through the next account in turn (spreading the daily limits); if that one fails, the others are tried for that email.' : 'Slot 1 sends everything; the next slot is used only when a send fails (quota reached, bad key, outage).'}>
              <SelectInput value={values.BREVO_SLOT_STRATEGY || 'failover'} onChange={(e) => set('BREVO_SLOT_STRATEGY', e.target.value)} data-testid="select-brevo-strategy">
                <option value="failover">Failover — slot 1 first, others as backup</option>
                <option value="round_robin">Round robin — spread across all slots</option>
              </SelectInput>
            </Field>

            <div className="mt-5 space-y-3">
              {Array.from({ length: shownSlots }, (_, i) => i + 1).map((n) => {
                const key = slotKey(n);
                const marked = values[key] === CLEAR_SECRET;
                const result = emailTests[String(n)];
                return <div key={n} className={cn('rounded-xl border p-4', marked ? 'border-destructive/30 bg-destructive/10' : slotFilled(n) ? 'border-primary/30 bg-background/60' : 'border-dashed border-border')} data-testid={`brevo-slot-${n}`}>
                  <div className="mb-3 flex flex-wrap items-center gap-2.5">
                    <span className={cn('grid size-8 place-items-center rounded-lg text-[11px] font-black', slotFilled(n) && !marked ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>{n}</span>
                    <div className="text-xs font-extrabold">{n === 1 ? 'Primary account' : `Backup account ${n - 1}`}</div>
                    {marked ? <StatusPill tone="red">Will be removed on save</StatusPill> : slotSaved(n) ? <StatusPill tone="green">Saved</StatusPill> : <StatusPill>Empty</StatusPill>}
                    {result && <StatusPill tone={result.ok ? 'green' : 'red'}>{result.ok ? 'Test sent' : 'Test failed'}</StatusPill>}
                    <div className="ml-auto flex gap-1.5">
                      {slotSaved(n) && !marked && <Button size="sm" variant="secondary" icon={Send} loading={testingTarget === String(n)} disabled={dirty || !testEmailTo} title={dirty ? 'Save your changes first' : !testEmailTo ? 'Enter an address in "Send a test email" below' : undefined} onClick={() => testEmail.mutate({ to: testEmailTo, slot: n })} data-testid={`button-test-brevo-slot-${n}`}>Test this key</Button>}
                      {n > 1 && (marked
                        ? <Button size="sm" variant="ghost" onClick={() => patch({ [key]: '' })}>Undo</Button>
                        : (slotSaved(n) || values[key]) && <Button size="sm" variant="danger" icon={Trash2} onClick={() => patch({ [key]: slotSaved(n) ? CLEAR_SECRET : '', [slotSenderKey(n)]: '' })} data-testid={`button-remove-brevo-slot-${n}`}>Remove</Button>)}
                    </div>
                  </div>
                  {!marked && <div className={inputRow}>
                    <Field label="API key"><SecretInput value={values[key] || ''} onChange={(v) => set(key, v)} isSet={slotSaved(n)} masked={values[`${key}_MASKED`]} placeholder="xkeysib-..." testId={n === 1 ? 'input-brevo-api-key' : `input-brevo-api-key-${n}`} /></Field>
                    {n > 1 && <Field label={<>Sender email <span className="font-normal text-muted-foreground">(optional)</span></>} hint={<>Only if this account&apos;s verified sender differs from the “From” email above.</>}><TextInput type="email" value={values[slotSenderKey(n)] || ''} onChange={(e) => set(slotSenderKey(n), e.target.value)} placeholder="Uses the “From” email" data-testid={`input-brevo-sender-${n}`} /></Field>}
                  </div>}
                  {result && !result.ok && <p className="mt-3 rounded-lg bg-destructive/10 p-3 text-[11px] leading-4 text-destructive" data-testid={`text-brevo-slot-error-${n}`}>{result.error}</p>}
                </div>;
              })}
            </div>
            {shownSlots < brevoMax && <Button className="mt-4" variant="secondary" icon={Plus} onClick={() => setSlotsRequested(shownSlots + 1)} data-testid="button-add-brevo-slot">Add another Brevo account</Button>}
          </Panel>}

          {emailProvider === 'smtp' && <Panel icon={Mail} title="SMTP server">
            <div className={inputRow}>
              <Field label="Host"><TextInput value={values.SMTP_HOST || ''} onChange={(e) => set('SMTP_HOST', e.target.value)} placeholder="smtp.yourprovider.com" data-testid="input-smtp-host" /></Field>
              <Field label="Port"><TextInput value={values.SMTP_PORT || ''} onChange={(e) => set('SMTP_PORT', e.target.value.replace(/[^\d]/g, ''))} placeholder="587" data-testid="input-smtp-port" /></Field>
              <Field label="Username"><TextInput value={values.SMTP_USER || ''} onChange={(e) => set('SMTP_USER', e.target.value)} data-testid="input-smtp-user" /></Field>
              <Field label="Password"><SecretInput value={values.SMTP_PASS || ''} onChange={(v) => set('SMTP_PASS', v)} isSet={values.SMTP_PASS_SET === 'true'} masked={values.SMTP_PASS_MASKED} testId="input-smtp-pass" /></Field>
            </div>
          </Panel>}

          {emailProvider === 'custom' && <Panel icon={Cloud} title="Custom email API" description={<>For any provider that isn't Brevo. Point this at an endpoint that accepts a JSON body: <code className="rounded bg-background px-1 py-0.5">{'{ to, subject, html, from, fromName }'}</code>.</>}>
            <div className={inputRow}>
              <Field label="Endpoint URL" className="sm:col-span-2"><TextInput value={values.CUSTOM_EMAIL_API_URL || ''} onChange={(e) => set('CUSTOM_EMAIL_API_URL', e.target.value)} placeholder="https://api.example.com/send-email" data-testid="input-custom-email-url" /></Field>
              <Field label="API key"><SecretInput value={values.CUSTOM_EMAIL_API_KEY || ''} onChange={(v) => set('CUSTOM_EMAIL_API_KEY', v)} isSet={values.CUSTOM_EMAIL_API_KEY_SET === 'true'} masked={values.CUSTOM_EMAIL_API_KEY_MASKED} testId="input-custom-email-key" /></Field>
              <Field label={<>Header name <span className="font-normal text-muted-foreground">(default: Authorization)</span></>}><TextInput value={values.CUSTOM_EMAIL_API_KEY_HEADER || ''} onChange={(e) => set('CUSTOM_EMAIL_API_KEY_HEADER', e.target.value)} placeholder="Authorization" data-testid="input-custom-email-header" /></Field>
              <Field label={<>Header prefix <span className="font-normal text-muted-foreground">(default: "Bearer ")</span></>} hint='Clear it for providers that want the raw key in a header like "api-key".' className="sm:col-span-2"><TextInput value={values.CUSTOM_EMAIL_API_KEY_PREFIX ?? ''} onChange={(e) => set('CUSTOM_EMAIL_API_KEY_PREFIX', e.target.value)} placeholder="Bearer " className="max-w-xs" data-testid="input-custom-email-prefix" /></Field>
            </div>
          </Panel>}

          <Panel icon={Send} title="Send a test email" description="Save your settings first, then send a real email to confirm the provider actually works — not just that the fields aren't blank.">
            <div className="flex flex-wrap items-center gap-3">
              <TextInput type="email" value={testEmailTo} onChange={(e) => setTestEmailTo(e.target.value)} placeholder="you@example.com" className="w-72" data-testid="input-test-email-to" />
              <Button variant="primary" icon={Send} loading={testingTarget === 'all'} disabled={!testEmailTo || dirty} onClick={() => testEmail.mutate({ to: testEmailTo })} data-testid="button-test-email">{testingTarget === 'all' ? 'Sending…' : emailProvider === 'brevo' && filledSlotCount > 1 ? 'Test full setup' : 'Send test email'}</Button>
              {emailTests.all && <StatusPill tone={emailTests.all.ok ? 'green' : 'red'}>{emailTests.all.ok ? 'Sent' : 'Failed'}</StatusPill>}
            </div>
            {dirty && <p className="mt-2 text-[11px] text-muted-foreground">You have unsaved changes — save them before testing, since tests use what's saved.</p>}
            {emailTests.all && !emailTests.all.ok && <p className="mt-3 rounded-xl bg-destructive/10 p-3 text-[11px] leading-4 text-destructive" data-testid="text-email-test-error">{emailTests.all.error}</p>}
          </Panel>
        </>}

        {/* ------------------------------------------------------------ Storage */}
        {tab === 'storage' && <>
          {storageIssue && <Callout tone="danger" title="No file storage is configured" testId="banner-storage-warning">Every upload (favicon, payment QR code, payment proofs, team photos, MCQ images, books, resources) goes through Cloudinary — there's no fallback, so uploads fail until it's configured below.</Callout>}
          <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-card p-4">
            <p className="min-w-0 flex-1 text-xs leading-5 text-muted-foreground">The green “Saved” badge only means credentials were entered — it doesn't prove the connection works. Save first, then test. (Supabase holds the database only; file storage runs on Cloudinary.)</p>
            <Button icon={Wifi} loading={testStorage.isPending} disabled={dirty} onClick={() => testStorage.mutate()} data-testid="button-test-storage">{testStorage.isPending ? 'Testing…' : 'Test connection'}</Button>
          </div>

          <Panel icon={Cloud} title="Cloudinary" badge={<>
            {values.CLOUDINARY_CONFIGURED === 'true' && <StatusPill tone="green">Saved</StatusPill>}
            {testStorage.data && <StatusPill tone={testStorage.data.cloudinary.ok ? 'green' : 'red'}>{testStorage.data.cloudinary.ok ? 'Connected' : 'Not working'}</StatusPill>}
          </>} description="Used for large files — book PDFs, resource files, and anything over ~5MB regardless of type.">
            {testStorage.data && !testStorage.data.cloudinary.ok && <p className="mb-4 rounded-xl bg-destructive/10 p-3 text-[11px] text-destructive" data-testid="text-cloudinary-test-error">{testStorage.data.cloudinary.error}</p>}
            <div className={inputRow}>
              <Field label="Cloud name"><TextInput value={values.CLOUDINARY_CLOUD_NAME || ''} onChange={(e) => set('CLOUDINARY_CLOUD_NAME', e.target.value)} placeholder="my-cloud-name" data-testid="input-cloudinary-cloud-name" /></Field>
              <Field label="API key"><TextInput value={values.CLOUDINARY_API_KEY || ''} onChange={(e) => set('CLOUDINARY_API_KEY', e.target.value)} placeholder="123456789012345" data-testid="input-cloudinary-api-key" /></Field>
              <Field label="API secret" className="sm:col-span-2"><SecretInput value={values.CLOUDINARY_API_SECRET || ''} onChange={(v) => set('CLOUDINARY_API_SECRET', v)} isSet={values.CLOUDINARY_API_SECRET_SET === 'true'} masked={values.CLOUDINARY_API_SECRET_MASKED} placeholder="abc123..." testId="input-cloudinary-api-secret" /></Field>
            </div>
          </Panel>

          <Panel icon={Repeat} title="Backup Cloudinary account" badge={<>
            <StatusPill>Optional</StatusPill>
            {values.CLOUDINARY_BACKUP_CONFIGURED === 'true' && <StatusPill tone="green">Saved</StatusPill>}
            {testStorage.data && values.CLOUDINARY_BACKUP_CONFIGURED === 'true' && <StatusPill tone={testStorage.data.cloudinaryBackup.ok ? 'green' : 'red'}>{testStorage.data.cloudinaryBackup.ok ? 'Connected' : 'Not working'}</StatusPill>}
          </>} description="A second account, tried automatically whenever the primary's upload fails — plan quota full, bad key, outage. Uploads still try the primary first. Existing files aren't moved; re-upload anything affected by a past storage issue.">
            {testStorage.data && values.CLOUDINARY_BACKUP_CONFIGURED === 'true' && !testStorage.data.cloudinaryBackup.ok && <p className="mb-4 rounded-xl bg-destructive/10 p-3 text-[11px] text-destructive" data-testid="text-cloudinary-backup-test-error">{testStorage.data.cloudinaryBackup.error}</p>}
            <div className={inputRow}>
              <Field label="Cloud name"><TextInput value={values.CLOUDINARY_CLOUD_NAME_2 || ''} onChange={(e) => set('CLOUDINARY_CLOUD_NAME_2', e.target.value)} placeholder="my-backup-cloud-name" data-testid="input-cloudinary-backup-cloud-name" /></Field>
              <Field label="API key"><TextInput value={values.CLOUDINARY_API_KEY_2 || ''} onChange={(e) => set('CLOUDINARY_API_KEY_2', e.target.value)} placeholder="123456789012345" data-testid="input-cloudinary-backup-api-key" /></Field>
              <Field label="API secret" className="sm:col-span-2"><SecretInput value={values.CLOUDINARY_API_SECRET_2 || ''} onChange={(v) => set('CLOUDINARY_API_SECRET_2', v)} isSet={values.CLOUDINARY_API_SECRET_2_SET === 'true'} masked={values.CLOUDINARY_API_SECRET_2_MASKED} placeholder="abc123..." testId="input-cloudinary-backup-api-secret" /></Field>
            </div>
          </Panel>
        </>}

        {/* ----------------------------------------------------------- Security */}
        {tab === 'security' && <>
          <Panel icon={KeyRound} tone="green" title="Admin sign-up invite code" description={<>Share this code with anyone who should be able to create an admin account at <code className="rounded bg-card px-1 py-0.5">/admin-signup/1</code>. Rotate it any time to revoke access for anyone holding the old one.</>}>
            <div className="flex flex-wrap items-center gap-3">
              <TextInput value={values.ADMIN_SIGNUP_CODE || ''} onChange={(e) => set('ADMIN_SIGNUP_CODE', e.target.value)} className="w-56 font-mono-app tracking-wider" data-testid="input-admin-signup-code" />
              <Button icon={Shuffle} loading={rotate.isPending} onClick={() => rotate.mutate()} data-testid="button-rotate-admin-code">{rotate.isPending ? 'Rotating…' : 'Generate new code'}</Button>
            </div>
            {values.ADMIN_SIGNUP_CODE && <div className="mt-3 flex flex-wrap items-center gap-2">
              <TextInput readOnly value={`${window.location.origin}/admin-signup/1?code=${encodeURIComponent(values.ADMIN_SIGNUP_CODE)}`} className="h-9 min-w-0 flex-1 text-[11px] text-muted-foreground" data-testid="input-admin-invite-link" onFocus={(e) => e.currentTarget.select()} />
              <Button variant="primary" icon={Copy} onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/admin-signup/1?code=${encodeURIComponent(values.ADMIN_SIGNUP_CODE || '')}`); toast({ title: 'Invite link copied' }); }} data-testid="button-copy-admin-invite-link">Copy link</Button>
            </div>}
          </Panel>
          <Panel icon={Users} tone="green" title="Devices per student account" description="How many devices one student account can be signed in on at the same time. Signing out (or an admin resetting devices) frees a slot. Admin accounts are never limited.">
            <div className="flex flex-wrap items-center gap-3">
              <TextInput type="number" min={0} max={50} value={values.DEFAULT_MAX_DEVICES ?? ''} placeholder="2" onChange={(e) => set('DEFAULT_MAX_DEVICES', e.target.value)} className="w-24" data-testid="input-default-max-devices" />
              <span className="text-xs text-muted-foreground">devices at once — blank means 2, 0 means unlimited</span>
            </div>
            <p className="mt-3 text-[11px] leading-5 text-muted-foreground">This is the default for every student. To give one student more or fewer, open them under Students and change their device limit there — that overrides this number for them only. Lowering it never signs anyone out; it only blocks new sign-ins until they're under the limit.</p>
          </Panel>
          <AdminAccountSection />
        </>}

        {tab === 'notifications' && <NotificationBroadcastPanel />}

        {tab !== 'notifications' && <SaveBar dirty={dirty} saving={save.isPending} saved={save.isSuccess && !dirty} onSave={() => save.mutate(values)} onDiscard={() => setForm(null)} />}
      </div>
    </div>
  </div>;
}

export default AdminSettings;
