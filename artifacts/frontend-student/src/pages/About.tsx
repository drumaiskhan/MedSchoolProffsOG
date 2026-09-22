// Standalone marketing page at "/about" (see App.tsx). Distinct from the
// "#about" anchor section on Home — that section is a quick blurb inside
// the landing page's scroll; this is its own crawlable, linkable URL so
// Google (and anyone sharing a link) has a real /about page to index,
// per the SEO fix requested for sitelinks/sitename. Mirrors Home's visual
// language (same header/footer shape) rather than introducing a new look.
import { Link } from 'wouter';
import { ArrowRight, GraduationCap, Lightbulb, Target, TrendingUp, Trophy, Bookmark } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { siteContentApi } from '@/lib/api';
import { Footer, AnimatedBrandMark, useDocumentHead, TeamPhoto } from '@/lib/shared';

const VALUES = [
  { icon: GraduationCap, title: 'Every college, one bank', desc: 'MCQs organised by program, year, subject, and topic — MBBS and BDS, side by side.' },
  { icon: Lightbulb, title: 'Explanations included', desc: "Every question comes with a worked explanation, not just an answer key." },
  { icon: Target, title: 'Practice, not panic', desc: 'Untimed practice by default. Timed Pre-Proffs exams when you actually want the pressure.' },
  { icon: TrendingUp, title: 'Analytics that find the gaps', desc: 'Automatic weak-topic tracking so revision time goes where it actually helps.' },
  { icon: Trophy, title: 'Streaks & leaderboards', desc: 'A little friendly competition to keep daily practice from fizzling out.' },
  { icon: Bookmark, title: 'Your own review flow', desc: 'Flag tricky MCQs, keep notes, and save sessions to pick up right where you left off.' },
];

export default function About() {
  const siteQ = useQuery({ queryKey: ['site-content'], queryFn: siteContentApi.get });
  const platformName = siteQ.data?.PLATFORM_NAME || 'MedschoolProffs';
  const team = siteQ.data?.team?.filter((t) => t.active) ?? [];

  useDocumentHead({
    title: `About ${platformName} — MCQ Bank for MBBS & BDS Students`,
    description: `${platformName} is Pakistan's medical education platform for MBBS and BDS students — one MCQ bank across every college, subject, and topic, built for steady daily practice instead of exam-week panic.`,
    path: '/about',
  });

  return <div className="min-h-[100dvh] bg-background">
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 md:px-8">
        <Link href="/" className="flex items-center gap-2" data-testid="link-about-logo">
          <AnimatedBrandMark size={22} className="text-primary" />
          <span className="text-[15px] font-extrabold tracking-[-.03em] text-primary">{platformName}</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/login" className="rounded-xl px-4 py-2.5 text-xs font-extrabold text-foreground hover:bg-muted" data-testid="link-about-login">Log in</Link>
          <Link href="/register" className="btn-pop rounded-xl bg-primary px-5 py-2.5 text-xs font-extrabold text-primary-foreground shadow-sm" data-testid="link-about-signup">Sign up</Link>
        </div>
      </div>
    </header>

    <section className="relative overflow-hidden bg-sidebar text-sidebar-foreground">
      <div className="relative mx-auto max-w-3xl px-5 py-16 text-center md:px-8 md:py-20">
        <div className="font-mono-app text-[10px] uppercase tracking-[.16em] text-sidebar-foreground/80">About us</div>
        <h1 className="mx-auto mt-4 max-w-2xl font-display text-4xl leading-[1.05] tracking-[-.03em] md:text-5xl">
          One bank. Every subject. <em className="text-sidebar-primary not-italic">No exam pressure.</em>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-sm leading-6 text-sidebar-foreground/80 md:text-base">
          {platformName} brings every subject, every topic, and thousands of MCQs into one place, so
          revision stops being a scavenger hunt across scattered PDFs and group-chat screenshots.
        </p>
      </div>
    </section>

    <section className="mx-auto max-w-6xl px-5 py-16 md:px-8">
      <p className="mx-auto max-w-2xl text-center text-sm leading-7 text-muted-foreground md:text-base">
        Practice mode stays untimed and explanation-first by default — the Pre-Proffs exams are there
        for when you actually want the pressure. Progress tracking quietly keeps an eye on which
        topics need another pass, so your next study session already knows where to start.
      </p>
      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {VALUES.map((item) => <div key={item.title} className="card-lift rounded-2xl border border-border bg-card p-6">
          <div className="grid size-11 place-items-center rounded-xl bg-[#eef7f1] text-primary"><item.icon size={20} /></div>
          <h3 className="mt-4 text-sm font-extrabold">{item.title}</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.desc}</p>
        </div>)}
      </div>
    </section>

    {team.length > 0 && <section className="border-y border-border bg-muted/40">
      <div className="mx-auto max-w-6xl px-5 py-16 md:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <div className="font-mono-app text-[10px] uppercase tracking-[.16em] text-primary">Who's behind it</div>
          <h2 className="mt-3 font-display text-3xl tracking-[-.03em]">The team</h2>
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {team.slice(0, 6).map((member) => <div key={member.id} className="rounded-2xl border border-border bg-card p-6 text-center">
            <div className="mx-auto w-fit"><TeamPhoto member={member} /></div>
            <h3 className="mt-3 text-sm font-extrabold">{member.name}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{member.role}</p>
            {member.achievementBadge && <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-[#fdeecb] px-2.5 py-1 text-[10px] font-bold text-[#8a5a12]">{member.achievementBadge}</span>}
          </div>)}
        </div>
      </div>
    </section>}

    <section className="mx-auto max-w-4xl px-5 py-16 text-center md:px-8">
      <h2 className="font-display text-3xl tracking-[-.03em]">Ready to start studying smarter?</h2>
      <Link href="/register" className="btn-pop mt-7 inline-flex items-center gap-2 rounded-xl bg-primary px-8 py-3.5 text-xs font-extrabold text-primary-foreground shadow-sm" data-testid="link-about-cta-signup">
        Create your free account <ArrowRight size={15} />
      </Link>
    </section>

    <div className="mx-auto max-w-6xl px-5 pb-16 md:px-8"><Footer variant="full" /></div>
  </div>;
}
