// Standalone marketing page at "/pricing" (see App.tsx). Distinct from the
// "#pricing" anchor section on Home — this gives pricing its own crawlable
// URL, which is what search engines need to show it as a sitelink (see
// the SEO fix requested for sitename/sitelinks). Same plan data and card
// layout as Home's pricing section.
import { Link } from 'wouter';
import { ArrowRight, Check } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useListMembershipPlans } from '@workspace/api-client-react';
import type { MembershipPlan } from '@workspace/api-client-react';
import { siteContentApi } from '@/lib/api';
import { cn, Footer, AnimatedBrandMark, useDocumentHead } from '@/lib/shared';

function formatPrice(plan: MembershipPlan) {
  if (!plan.price) return 'Free';
  const amount = plan.currency === 'PKR' ? `Rs. ${plan.price.toLocaleString()}` : `${plan.currency} ${plan.price}`;
  // Same fix as Home.tsx's copy of this function — see its comment.
  const unit = plan.duration === 1 ? plan.durationUnit.replace(/s$/, '') : `${plan.duration} ${plan.durationUnit}`;
  return `${amount} / ${unit}`;
}

export default function Pricing() {
  const siteQ = useQuery({ queryKey: ['site-content'], queryFn: siteContentApi.get });
  const plansQ = useListMembershipPlans();
  const platformName = siteQ.data?.PLATFORM_NAME || 'MedschoolProffs';
  const plans = (plansQ.data ?? []).filter((p) => p.active).sort((a, b) => a.displayOrder - b.displayOrder);

  useDocumentHead({
    title: `Pricing — ${platformName}`,
    description: `Simple, affordable membership plans for ${platformName}. One MCQ bank across every college, subject, and topic for MBBS & BDS students. No hidden fees, cancel anytime.`,
    path: '/pricing',
  });

  return <div className="min-h-[100dvh] bg-background">
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 md:px-8">
        <Link href="/" className="flex items-center gap-2" data-testid="link-pricing-logo">
          <AnimatedBrandMark size={22} className="text-primary" />
          <span className="text-[15px] font-extrabold tracking-[-.03em] text-primary">{platformName}</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/login" className="rounded-xl px-4 py-2.5 text-xs font-extrabold text-foreground hover:bg-muted" data-testid="link-pricing-login">Log in</Link>
          <Link href="/register" className="btn-pop rounded-xl bg-primary px-5 py-2.5 text-xs font-extrabold text-primary-foreground shadow-sm" data-testid="link-pricing-signup">Sign up</Link>
        </div>
      </div>
    </header>

    <section className="mx-auto max-w-6xl px-5 py-16 md:px-8">
      <div className="mx-auto max-w-2xl text-center">
        <div className="font-mono-app text-[10px] uppercase tracking-[.16em] text-primary">Pricing</div>
        <h1 className="mt-3 font-display text-4xl tracking-[-.03em] md:text-5xl">Simple, affordable plans</h1>
        <p className="mt-3 text-sm text-muted-foreground">No hidden fees. Cancel anytime.</p>
      </div>
      {plansQ.isLoading ? <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => <div key={i} className="skeleton h-64 rounded-2xl" />)}
      </div> : plans.length === 0 ? <div className="mt-12 rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
        <Link href="/register" className="font-bold text-primary hover:underline" data-testid="link-pricing-page-fallback">Create a free account</Link> to see current plans and pricing.
      </div> : <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan, i) => <div key={plan.id} className={cn('relative flex flex-col rounded-2xl border p-7', i === 1 ? 'border-primary bg-[#eef7f1] shadow-md' : 'border-border bg-card')} data-testid={`card-pricing-page-plan-${plan.id}`}>
          {plan.discountLabel && <span className="absolute -top-3 right-6 rounded-full bg-accent px-3 py-1 text-[10px] font-extrabold text-accent-foreground">{plan.discountLabel}</span>}
          <h3 className="text-sm font-extrabold">{plan.name}</h3>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{plan.description}</p>
          <div className="mt-5 flex items-baseline gap-2">
            <span className="font-display text-3xl tracking-[-.03em]">{formatPrice(plan)}</span>
            {plan.originalPrice != null && plan.originalPrice > plan.price && <span className="text-xs text-muted-foreground line-through">{plan.currency} {plan.originalPrice}</span>}
          </div>
          <Link href="/register" className={cn('btn-pop mt-7 inline-flex items-center justify-center gap-2 rounded-xl py-3 text-xs font-extrabold', i === 1 ? 'bg-primary text-primary-foreground' : 'border border-border text-foreground hover:bg-muted')} data-testid={`link-pricing-page-signup-${plan.id}`}>
            Get started <ArrowRight size={14} />
          </Link>
        </div>)}
      </div>}
      <div className="mx-auto mt-14 flex max-w-md items-center justify-center gap-2 text-xs font-bold text-muted-foreground">
        <span className="grid size-6 place-items-center rounded-full bg-primary text-primary-foreground"><Check size={13} /></span>
        Instant explanations on every question, on every plan
      </div>
    </section>

    <div className="mx-auto max-w-6xl px-5 pb-16 md:px-8"><Footer variant="full" /></div>
  </div>;
}
