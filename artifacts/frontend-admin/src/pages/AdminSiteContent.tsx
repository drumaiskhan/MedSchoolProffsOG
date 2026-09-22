// Footer & public content — code-split via React.lazy() in App.tsx.
//
// Modernisation pass: Design & branding (colours, theme mode, dashboard
// photo) and the Platform description moved to Settings, where the rest of
// the branding (favicon, name, tagline) already lived — each setting now has
// exactly one home. This page keeps what is genuinely "public site content":
// SEO, social links, contact info, feature highlights, quick links, copyright.
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Globe, Link2, Mail, Plus, Search, Share2, Sparkles, Trash2, X } from 'lucide-react';
import { settingsApi, ApiRequestError } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { SectionHeader } from '@/lib/shared';
import { Button, Callout, Field, Panel, SaveBar, TextArea, TextInput } from '@/lib/admin-ui';
import { queryClient } from '@/lib/query-client';

function AdminSiteContent() {
  const settingsQuery = useQuery({ queryKey: ['admin-settings'], queryFn: settingsApi.get });
  const [form, setForm] = useState<Record<string, string> | null>(null);
  const values = form ?? settingsQuery.data ?? {};
  const dirty = form !== null;
  const save = useMutation({
    mutationFn: settingsApi.update,
    onSuccess: (data) => { setForm(null); queryClient.setQueryData(['admin-settings'], data); queryClient.invalidateQueries({ queryKey: ['site-content'] }); },
    onError: (err: unknown) => toast({ title: 'Could not save site content', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }),
  });
  const set = (key: string, value: string) => setForm({ ...values, [key]: value });

  let features: string[] = [];
  try { features = JSON.parse(values.FEATURES_LIST || '[]'); } catch { features = []; }
  const [newFeature, setNewFeature] = useState('');
  const setFeatures = (list: string[]) => set('FEATURES_LIST', JSON.stringify(list));

  let quickLinks: Array<{ label: string; url: string }> = [];
  try { quickLinks = JSON.parse(values.QUICK_LINKS || '[]'); } catch { quickLinks = []; }
  const setQuickLinks = (list: Array<{ label: string; url: string }>) => set('QUICK_LINKS', JSON.stringify(list));

  const addFeature = () => { if (newFeature.trim()) { setFeatures([...features, newFeature.trim()]); setNewFeature(''); } };

  return <div className="mx-auto max-w-3xl">
    <SectionHeader eyebrow="Site content" title="Footer & public content" action={<span className="hidden text-[11px] text-muted-foreground sm:inline">Shown across the sign-in pages and student footer</span>} />
    <div className="space-y-5">
      <Callout tone="info" title="Looking for colours, favicon or the platform description?">
        They now live together in <Link href="/admin/settings?tab=branding" className="font-extrabold underline">Settings → Branding</Link> and <Link href="/admin/settings?tab=general" className="font-extrabold underline">Settings → General</Link>.
      </Callout>

      <Panel icon={Search} title="Search & social (SEO)" description="Homepage title, Google listing, and link previews.">
        <div className="space-y-4">
          <Field label="Page title" hint="Shown as the browser tab title and as the blue link in Google. Leave blank to keep the site's built-in default.">
            <TextInput value={values.SEO_TITLE || ''} onChange={(e) => set('SEO_TITLE', e.target.value)} placeholder="MedschoolProffs — MCQ Bank & Exam Prep for MBBS & BDS Students" data-testid="input-seo-title" />
          </Field>
          <Field label="Meta description" hint="The snippet under the title in Google and on WhatsApp/Facebook/Twitter previews. One or two sentences (about 150–160 characters) shows best.">
            <TextArea value={values.SEO_DESCRIPTION || ''} onChange={(e) => set('SEO_DESCRIPTION', e.target.value)} maxLength={300} data-testid="input-seo-description" />
          </Field>
          <p className="text-[11px] text-muted-foreground">The site name in search results and link previews comes from <strong>Platform name</strong> in Settings → General.</p>
        </div>
      </Panel>

      <Panel icon={Share2} title="Social links">
        <div className="grid gap-4 sm:grid-cols-2">
          {([['Facebook', 'SOCIAL_FACEBOOK', 'facebook'], ['YouTube', 'SOCIAL_YOUTUBE', 'youtube'], ['LinkedIn', 'SOCIAL_LINKEDIN', 'linkedin'], ['Instagram', 'SOCIAL_INSTAGRAM', 'instagram']] as const).map(([label, key, slug]) =>
            <Field key={key} label={label}><TextInput value={values[key] || ''} onChange={(e) => set(key, e.target.value)} placeholder={`https://${slug}.com/…`} data-testid={`input-social-${slug}`} /></Field>)}
        </div>
      </Panel>

      <Panel icon={Mail} title="Contact info" description="The only contact email students see — it's used in the footer.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Email"><TextInput value={values.CONTACT_EMAIL || ''} onChange={(e) => set('CONTACT_EMAIL', e.target.value)} data-testid="input-contact-email" /></Field>
          <Field label="Location"><TextInput value={values.CONTACT_LOCATION || ''} onChange={(e) => set('CONTACT_LOCATION', e.target.value)} data-testid="input-contact-location" /></Field>
          <Field label="Support hours"><TextInput value={values.SUPPORT_HOURS || ''} onChange={(e) => set('SUPPORT_HOURS', e.target.value)} placeholder="24/7 Available" data-testid="input-support-hours" /></Field>
        </div>
      </Panel>

      <Panel icon={Sparkles} title="Feature highlights" description="Short selling points shown on the public pages.">
        {features.length > 0 && <div className="mb-3 flex flex-wrap gap-2">
          {features.map((f, i) => <span key={i} className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-xs font-bold">{f}
            <button type="button" onClick={() => setFeatures(features.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive" aria-label={`Remove ${f}`} data-testid={`button-remove-feature-${i}`}><X size={12} /></button></span>)}
        </div>}
        <div className="flex gap-2">
          <TextInput value={newFeature} onChange={(e) => setNewFeature(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addFeature(); } }} placeholder="e.g. 30,000+ MCQs" data-testid="input-new-feature" />
          <Button variant="primary" icon={Plus} disabled={!newFeature.trim()} onClick={addFeature} data-testid="button-add-feature">Add</Button>
        </div>
      </Panel>

      <Panel icon={Link2} title="Quick links" description="Links in the footer.">
        <div className="space-y-2">
          {quickLinks.map((l, i) => <div key={i} className="flex items-center gap-2">
            <TextInput value={l.label} onChange={(e) => setQuickLinks(quickLinks.map((q, idx) => (idx === i ? { ...q, label: e.target.value } : q)))} placeholder="Label" className="w-40" data-testid={`input-quicklink-label-${i}`} />
            <TextInput value={l.url} onChange={(e) => setQuickLinks(quickLinks.map((q, idx) => (idx === i ? { ...q, url: e.target.value } : q)))} placeholder="/path or https://…" data-testid={`input-quicklink-url-${i}`} />
            <Button variant="ghost" size="sm" onClick={() => setQuickLinks(quickLinks.filter((_, idx) => idx !== i))} aria-label="Remove link" data-testid={`button-remove-quicklink-${i}`}><Trash2 size={14} /></Button>
          </div>)}
        </div>
        <Button className="mt-3" icon={Plus} onClick={() => setQuickLinks([...quickLinks, { label: '', url: '/' }])} data-testid="button-add-quicklink">Add link</Button>
      </Panel>

      <Panel icon={Globe} title="Copyright notice">
        <TextInput value={values.COPYRIGHT_NOTICE || ''} onChange={(e) => set('COPYRIGHT_NOTICE', e.target.value)} placeholder="All rights reserved." className="max-w-sm" data-testid="input-copyright-notice" />
      </Panel>

      <SaveBar dirty={dirty} saving={save.isPending} saved={save.isSuccess && !dirty} onSave={() => save.mutate(values)} onDiscard={() => setForm(null)} testId="button-save-site-content" />
    </div>
  </div>;
}

export default AdminSiteContent;
