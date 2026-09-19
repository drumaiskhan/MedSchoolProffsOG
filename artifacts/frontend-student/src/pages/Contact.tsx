// Standalone marketing page at "/contact" (see App.tsx) — didn't exist
// before this SEO pass. Surfaces the same admin-editable contact details
// (CONTACT_EMAIL, CONTACT_LOCATION, SUPPORT_HOURS, SUPPORT_WHATSAPP) that
// already power the Footer, just as a dedicated, linkable/crawlable page.
// No new backend endpoint: there's no public "send us a message" API, so
// this points visitors at email/WhatsApp instead of adding an unauthenticated
// contact-form submission surface.
import { Link } from 'wouter';
import { Mail, Landmark, Clock3, MessageSquare } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { siteContentApi } from '@/lib/api';
import { Footer, AnimatedBrandMark, SocialIcons, useDocumentHead } from '@/lib/shared';

export default function Contact() {
  const siteQ = useQuery({ queryKey: ['site-content'], queryFn: siteContentApi.get });
  const c = siteQ.data;
  const platformName = c?.PLATFORM_NAME || 'MedschoolProffs';

  useDocumentHead({
    title: `Contact ${platformName}`,
    description: `Get in touch with ${platformName} — email, WhatsApp, and support hours for MBBS & BDS students using our MCQ bank and exam prep platform.`,
    path: '/contact',
  });

  const rows = [
    c?.CONTACT_EMAIL && { icon: Mail, label: 'Email', value: c.CONTACT_EMAIL, href: `mailto:${c.CONTACT_EMAIL}` },
    c?.SUPPORT_WHATSAPP && { icon: MessageSquare, label: 'WhatsApp', value: c.SUPPORT_WHATSAPP, href: `https://wa.me/${c.SUPPORT_WHATSAPP.replace(/[^0-9]/g, '')}` },
    c?.CONTACT_LOCATION && { icon: Landmark, label: 'Location', value: c.CONTACT_LOCATION },
    c?.SUPPORT_HOURS && { icon: Clock3, label: 'Support hours', value: c.SUPPORT_HOURS },
  ].filter(Boolean) as Array<{ icon: typeof Mail; label: string; value: string; href?: string }>;

  return <div className="min-h-[100dvh] bg-background">
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 md:px-8">
        <Link href="/" className="flex items-center gap-2" data-testid="link-contact-logo">
          <AnimatedBrandMark size={22} className="text-primary" />
          <span className="text-[15px] font-extrabold tracking-[-.03em] text-primary">{platformName}</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/login" className="rounded-xl px-4 py-2.5 text-xs font-extrabold text-foreground hover:bg-muted" data-testid="link-contact-login">Log in</Link>
          <Link href="/register" className="btn-pop rounded-xl bg-primary px-5 py-2.5 text-xs font-extrabold text-primary-foreground shadow-sm" data-testid="link-contact-signup">Sign up</Link>
        </div>
      </div>
    </header>

    <section className="mx-auto max-w-3xl px-5 py-16 text-center md:px-8 md:py-20">
      <div className="font-mono-app text-[10px] uppercase tracking-[.16em] text-primary">Contact</div>
      <h1 className="mt-3 font-display text-4xl tracking-[-.03em] md:text-5xl">Get in touch</h1>
      <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-muted-foreground md:text-base">
        Questions about {platformName}, your membership, or something not working right? Reach us
        directly — we usually reply fast.
      </p>
    </section>

    <section className="mx-auto max-w-2xl px-5 pb-16 md:px-8">
      {rows.length === 0 ? <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
        Contact details are being updated — please check back shortly.
      </div> : <div className="grid gap-4 sm:grid-cols-2">
        {rows.map((row) => {
          const Body = <>
            <div className="grid size-11 place-items-center rounded-xl bg-[#eef7f1] text-primary"><row.icon size={20} /></div>
            <div className="mt-4 text-[10px] font-bold uppercase tracking-[.1em] text-muted-foreground">{row.label}</div>
            <div className="mt-1 text-sm font-extrabold text-foreground">{row.value}</div>
          </>;
          return row.href
            ? <a key={row.label} href={row.href} target="_blank" rel="noopener noreferrer" className="card-lift rounded-2xl border border-border bg-card p-6 hover:border-primary/40" data-testid={`link-contact-${row.label.toLowerCase()}`}>{Body}</a>
            : <div key={row.label} className="rounded-2xl border border-border bg-card p-6" data-testid={`text-contact-${row.label.toLowerCase().replace(' ', '-')}`}>{Body}</div>;
        })}
      </div>}
      <div className="mt-8 flex justify-center"><SocialIcons content={c} /></div>
    </section>

    <div className="mx-auto max-w-6xl px-5 pb-16 md:px-8"><Footer variant="full" /></div>
  </div>;
}
