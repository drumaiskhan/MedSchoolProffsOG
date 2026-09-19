// Public marketing landing page — mounted at "/" (see App.tsx). Signed-out
// visitors land here first instead of being bounced straight to /login; a
// visitor who turns out to already have a session is sent on to
// /dashboard once that check resolves (see the effect below). Structure is
// modeled on the "hero → why us → about → pricing → features → CTA →
// footer" shape common to ed-tech marketing sites, filled in with this
// app's own copy, routes, and live data (site content + membership plans
// are both public endpoints) rather than any third-party site's content.
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import {
  ArrowRight, BookOpen, Bookmark, Check, ClipboardCheck, FileStack,
  GraduationCap, Lightbulb, Menu, Target, Trophy, TrendingUp, Wand2, X, Zap,
} from 'lucide-react';
import { useGetCurrentUser, getGetCurrentUserQueryKey, useListMembershipPlans } from '@workspace/api-client-react';
import type { MembershipPlan } from '@workspace/api-client-react';
import { siteContentApi } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import { cn, Footer, AnimatedBrandMark, Testimonials } from '@/lib/shared';

const WHY_US = [
  { icon: GraduationCap, title: 'Every college, one bank', desc: 'MCQs organised by program, year, subject, and topic — MBBS and BDS, side by side.' },
  { icon: Lightbulb, title: 'Explanations included', desc: "Every question comes with a worked explanation, not just an answer key." },
  { icon: Target, title: 'Practice, not panic', desc: 'Untimed practice by default. Timed Pre-Proffs exams when you actually want the pressure.' },
  { icon: TrendingUp, title: 'Analytics that find the gaps', desc: 'Automatic weak-topic tracking so revision time goes where it actually helps.' },
  { icon: Trophy, title: 'Streaks & leaderboards', desc: 'A little friendly competition to keep daily practice from fizzling out.' },
  { icon: Bookmark, title: 'Your own review flow', desc: 'Flag tricky MCQs, keep notes, and save sessions to pick up right where you left off.' },
];

const FEATURES = [
  { icon: BookOpen, title: 'MCQ Bank', desc: 'Thousands of questions across every subject, tagged and ready for focused practice.', href: '/blocks' },
  { icon: Target, title: 'Practice Mode', desc: 'Untimed, explanation-first practice sessions you can start in a couple of taps.', href: '/practice' },
  { icon: ClipboardCheck, title: 'Pre-Proffs Exams', desc: 'Timed mock exams built to feel like the real thing, with full result breakdowns.', href: '/exams' },
  { icon: FileStack, title: 'Past Papers', desc: "Previous years' papers, organised and ready to work through block by block.", href: '/past-papers' },
  { icon: Zap, title: 'Flashcards', desc: 'Quick-fire spaced review for the facts that need to just stick.', href: '/flashcards' },
  { icon: Wand2, title: 'AI Visualizer', desc: 'Turn dense concepts into step-by-step visual explanations on demand.', href: '/ai-visualizer' },
];

function formatPrice(plan: MembershipPlan) {
  if (!plan.price) return 'Free';
  const amount = plan.currency === 'PKR' ? `Rs. ${plan.price.toLocaleString()}` : `${plan.currency} ${plan.price}`;
  const unit = plan.duration === 1 ? plan.durationUnit : `${plan.duration} ${plan.durationUnit}s`;
  return `${amount} / ${unit}`;
}

export default function Home() {
  const [, setLocation] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  // Lightweight session check — doesn't block the page from rendering for
  // the (much more common) signed-out visitor; if it turns out there IS a
  // valid session, we hand off to the real dashboard once we know that.
  const userQuery = useGetCurrentUser({ query: { retry: false, queryKey: getGetCurrentUserQueryKey() } });
  const siteQ = useQuery({ queryKey: ['site-content'], queryFn: siteContentApi.get });
  const plansQ = useListMembershipPlans();
  const platformName = siteQ.data?.PLATFORM_NAME || 'MedschoolProffs';
  const tagline = siteQ.data?.PLATFORM_TAGLINE;
  const plans = (plansQ.data ?? []).filter((p) => p.active).sort((a, b) => a.displayOrder - b.displayOrder);

  useEffect(() => {
    if (userQuery.data) setLocation('/dashboard');
  }, [userQuery.data, setLocation]);

  return <div className="min-h-[100dvh] bg-background">
    {/* Nav */}
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 md:px-8">
        <Link href="/" className="flex items-center gap-2" data-testid="link-home-logo">
          <AnimatedBrandMark size={22} className="text-primary" />
          <span className="text-[15px] font-extrabold tracking-[-.03em] text-primary">{platformName}</span>
        </Link>
        <nav className="hidden items-center gap-7 text-xs font-bold text-muted-foreground md:flex">
          <a href="#features" className="hover:text-foreground">Features</a>
          <a href="#pricing" className="hover:text-foreground">Pricing</a>
          <a href="#reviews" className="hover:text-foreground">Reviews</a>
          <a href="#about" className="hover:text-foreground">About</a>
        </nav>
        <div className="hidden items-center gap-3 md:flex">
          <Link href="/login" className="rounded-xl px-4 py-2.5 text-xs font-extrabold text-foreground hover:bg-muted" data-testid="link-nav-login">Log in</Link>
          <Link href="/register" className="btn-pop rounded-xl bg-primary px-5 py-2.5 text-xs font-extrabold text-primary-foreground shadow-sm" data-testid="link-nav-signup">Sign up</Link>
        </div>
        <button onClick={() => setMenuOpen((v) => !v)} className="grid size-9 place-items-center rounded-lg border border-border text-foreground md:hidden" data-testid="button-nav-menu" aria-label="Menu">
          {menuOpen ? <X size={17} /> : <Menu size={17} />}
        </button>
      </div>
      {menuOpen && <div className="border-t border-border bg-background px-5 py-4 md:hidden">
        <nav className="flex flex-col gap-1 text-sm font-bold text-foreground">
          <a href="#features" onClick={() => setMenuOpen(false)} className="rounded-lg px-2 py-2.5 hover:bg-muted">Features</a>
          <a href="#pricing" onClick={() => setMenuOpen(false)} className="rounded-lg px-2 py-2.5 hover:bg-muted">Pricing</a>
          <a href="#reviews" onClick={() => setMenuOpen(false)} className="rounded-lg px-2 py-2.5 hover:bg-muted">Reviews</a>
          <a href="#about" onClick={() => setMenuOpen(false)} className="rounded-lg px-2 py-2.5 hover:bg-muted">About</a>
          <div className="mt-2 flex gap-2 border-t border-border pt-3">
            <Link href="/login" className="flex-1 rounded-xl border border-border py-2.5 text-center text-xs font-extrabold" data-testid="link-nav-login-mobile">Log in</Link>
            <Link href="/register" className="flex-1 rounded-xl bg-primary py-2.5 text-center text-xs font-extrabold text-primary-foreground" data-testid="link-nav-signup-mobile">Sign up</Link>
          </div>
        </nav>
      </div>}
    </header>

    {/* Hero */}
    <section className="relative overflow-hidden bg-sidebar text-sidebar-foreground">
      <div className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full border-[44px] border-sidebar-accent/40" />
      <div className="pointer-events-none absolute -bottom-16 left-0 size-64 rounded-full border-[24px] border-sidebar-primary/25" />
      <div className="relative mx-auto max-w-6xl px-5 py-20 text-center md:px-8 md:py-28">
        <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-sidebar-border bg-sidebar-accent/60 px-4 py-1.5 font-mono-app text-[10px] uppercase tracking-[.16em] text-sidebar-foreground/80">
          Built for MBBS &amp; BDS students
        </div>
        <h1 className="mx-auto mt-7 max-w-3xl font-display text-5xl leading-[1.02] tracking-[-.03em] md:text-7xl">
          Every MCQ<br /><em className="text-sidebar-primary not-italic">you'll need.</em>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-sm leading-6 text-sidebar-foreground/80 md:text-base">
          {tagline || 'One MCQ bank across every college, subject, and topic — built for steady daily practice, not exam pressure.'}
        </p>
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href="/register" className="btn-pop inline-flex items-center gap-2 rounded-xl bg-sidebar-primary px-7 py-3.5 text-xs font-extrabold text-sidebar-primary-foreground shadow-sm" data-testid="link-hero-signup">
            Start practicing free <ArrowRight size={15} />
          </Link>
          <a href="#features" className="btn-pop rounded-xl border border-sidebar-border px-7 py-3.5 text-xs font-extrabold text-sidebar-foreground hover:bg-sidebar-accent/60" data-testid="link-hero-features">
            Explore features
          </a>
        </div>
        <div className="mx-auto mt-8 flex max-w-md items-center justify-center gap-2 text-xs font-bold text-sidebar-foreground/80">
          <span className="grid size-6 place-items-center rounded-full bg-sidebar-primary text-sidebar-primary-foreground"><Check size={13} /></span>
          Instant explanations on every question
        </div>
      </div>
    </section>

    {/* Why choose us */}
    <section className="mx-auto max-w-6xl px-5 py-20 md:px-8">
      <div className="mx-auto max-w-2xl text-center">
        <div className="font-mono-app text-[10px] uppercase tracking-[.16em] text-primary">Why choose us</div>
        <h2 className="mt-3 font-display text-4xl tracking-[-.03em]">Built for how you actually study</h2>
      </div>
      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {WHY_US.map((item) => <div key={item.title} className="card-lift rounded-2xl border border-border bg-card p-6">
          <div className="grid size-11 place-items-center rounded-xl bg-[#eef7f1] text-primary"><item.icon size={20} /></div>
          <h3 className="mt-4 text-sm font-extrabold">{item.title}</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.desc}</p>
        </div>)}
      </div>
    </section>

    <Testimonials />

    {/* About */}
    <section id="about" className="border-y border-border bg-muted/40">
      <div className="mx-auto max-w-3xl px-5 py-20 text-center md:px-8">
        <div className="font-mono-app text-[10px] uppercase tracking-[.16em] text-primary">About {platformName}</div>
        <h2 className="mt-3 font-display text-4xl tracking-[-.03em]">One bank. Every subject. No exam pressure.</h2>
        <p className="mt-5 text-sm leading-7 text-muted-foreground md:text-base">
          {platformName} brings every subject, every topic, and thousands of MCQs into one place, so
          revision stops being a scavenger hunt across scattered PDFs and group-chat screenshots.
          Practice mode stays untimed and explanation-first by default — the Pre-Proffs exams are
          there for when you actually want the pressure. Progress tracking quietly keeps an eye on
          which topics need another pass, so your next study session already knows where to start.
        </p>
      </div>
    </section>

    {/* Pricing */}
    <section id="pricing" className="mx-auto max-w-6xl px-5 py-20 md:px-8">
      <div className="mx-auto max-w-2xl text-center">
        <div className="font-mono-app text-[10px] uppercase tracking-[.16em] text-primary">Pricing</div>
        <h2 className="mt-3 font-display text-4xl tracking-[-.03em]">Simple, affordable plans</h2>
        <p className="mt-3 text-sm text-muted-foreground">No hidden fees. Cancel anytime.</p>
      </div>
      {plansQ.isLoading ? <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => <div key={i} className="skeleton h-64 rounded-2xl" />)}
      </div> : plans.length === 0 ? <div className="mt-12 rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
        <Link href="/register" className="font-bold text-primary hover:underline" data-testid="link-pricing-fallback">Create a free account</Link> to see current plans and pricing.
      </div> : <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan, i) => <div key={plan.id} className={cn('relative flex flex-col rounded-2xl border p-7', i === 1 ? 'border-primary bg-[#eef7f1] shadow-md' : 'border-border bg-card')} data-testid={`card-plan-${plan.id}`}>
          {plan.discountLabel && <span className="absolute -top-3 right-6 rounded-full bg-accent px-3 py-1 text-[10px] font-extrabold text-accent-foreground">{plan.discountLabel}</span>}
          <h3 className="text-sm font-extrabold">{plan.name}</h3>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{plan.description}</p>
          <div className="mt-5 flex items-baseline gap-2">
            <span className="font-display text-3xl tracking-[-.03em]">{formatPrice(plan)}</span>
            {plan.originalPrice != null && plan.originalPrice > plan.price && <span className="text-xs text-muted-foreground line-through">{plan.currency} {plan.originalPrice}</span>}
          </div>
          <Link href="/register" className={cn('btn-pop mt-7 inline-flex items-center justify-center gap-2 rounded-xl py-3 text-xs font-extrabold', i === 1 ? 'bg-primary text-primary-foreground' : 'border border-border text-foreground hover:bg-muted')} data-testid={`link-plan-signup-${plan.id}`}>
            Get started <ArrowRight size={14} />
          </Link>
        </div>)}
      </div>}
    </section>

    {/* Features */}
    <section id="features" className="border-y border-border bg-muted/40">
      <div className="mx-auto max-w-6xl px-5 py-20 md:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <div className="font-mono-app text-[10px] uppercase tracking-[.16em] text-primary">Platform features</div>
          <h2 className="mt-3 font-display text-4xl tracking-[-.03em]">Everything you need in one place</h2>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => <div key={f.title} className="card-lift rounded-2xl border border-border bg-card p-6">
            <div className="grid size-11 place-items-center rounded-xl bg-[#eef7f1] text-primary"><f.icon size={20} /></div>
            <h3 className="mt-4 text-sm font-extrabold">{f.title}</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{f.desc}</p>
          </div>)}
        </div>
      </div>
    </section>

    {/* Final CTA */}
    <section className="mx-auto max-w-4xl px-5 py-20 text-center md:px-8">
      <h2 className="font-display text-4xl tracking-[-.03em]">Ready to start studying smarter?</h2>
      <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-muted-foreground">
        Create a free account and see the question bank for your program and year right away.
      </p>
      <Link href="/register" className="btn-pop mt-8 inline-flex items-center gap-2 rounded-xl bg-primary px-8 py-3.5 text-xs font-extrabold text-primary-foreground shadow-sm" data-testid="link-cta-signup">
        Create your free account <ArrowRight size={15} />
      </Link>
    </section>

    <div className="mx-auto max-w-6xl px-5 pb-16 md:px-8"><Footer variant="full" /></div>
  </div>;
}
