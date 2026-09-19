// Standalone marketing page at "/faq" (see App.tsx) — didn't exist before
// this SEO pass. Also emits FAQPage JSON-LD (same structured-data approach
// as the site-wide Organization/WebSite/SiteNavigationElement blocks in
// index.html) since it's a natural fit here and can earn FAQ rich results
// in search, not just the sitelink itself.
import { Link } from 'wouter';
import { ArrowRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { siteContentApi } from '@/lib/api';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Footer, AnimatedBrandMark, useDocumentHead } from '@/lib/shared';

const FAQS = [
  { q: 'Is practice mode timed?', a: "No — practice mode is untimed and explanation-first by default. Timed Pre-Proffs exams are there separately, for when you actually want the exam-day pressure." },
  { q: 'Which programs and years are covered?', a: 'MBBS and BDS, across every college, program, and academic year — organised by subject and topic so you only see what\'s relevant to you.' },
  { q: 'Do questions come with explanations?', a: 'Yes — every MCQ includes a worked explanation, not just the correct answer, so you understand the "why" as you go.' },
  { q: 'Can I track my weak areas?', a: 'Yes — progress tracking automatically flags weak topics from your practice history, so revision time goes where it actually helps.' },
  { q: 'What do the paid plans include?', a: 'Paid plans unlock full access to the MCQ bank, timed Pre-Proffs exams, past papers, and flashcards. See the Pricing page for current plans and rates.' },
  { q: 'How do I cancel or change my plan?', a: 'Manage your membership any time from Profile → Membership once you\'re signed in. Plans can be changed or cancelled there, no hidden fees.' },
  { q: 'I found a wrong answer or a bug — how do I report it?', a: "Flag the MCQ directly from the question screen, or use Send Feedback from your account menu once you're signed in. You can also reach us on the Contact page." },
];

export default function Faq() {
  const siteQ = useQuery({ queryKey: ['site-content'], queryFn: siteContentApi.get });
  const platformName = siteQ.data?.PLATFORM_NAME || 'MedschoolProffs';

  useDocumentHead({
    title: `FAQs — ${platformName}`,
    description: `Frequently asked questions about ${platformName}'s MCQ bank, Pre-Proffs exams, pricing, and progress tracking for MBBS & BDS students.`,
    path: '/faq',
  });

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQS.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };

  return <div className="min-h-[100dvh] bg-background">
    <script type="application/ld+json">{JSON.stringify(faqSchema)}</script>
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 md:px-8">
        <Link href="/" className="flex items-center gap-2" data-testid="link-faq-logo">
          <AnimatedBrandMark size={22} className="text-primary" />
          <span className="text-[15px] font-extrabold tracking-[-.03em] text-primary">{platformName}</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/login" className="rounded-xl px-4 py-2.5 text-xs font-extrabold text-foreground hover:bg-muted" data-testid="link-faq-login">Log in</Link>
          <Link href="/register" className="btn-pop rounded-xl bg-primary px-5 py-2.5 text-xs font-extrabold text-primary-foreground shadow-sm" data-testid="link-faq-signup">Sign up</Link>
        </div>
      </div>
    </header>

    <section className="mx-auto max-w-3xl px-5 py-16 text-center md:px-8 md:py-20">
      <div className="font-mono-app text-[10px] uppercase tracking-[.16em] text-primary">FAQs</div>
      <h1 className="mt-3 font-display text-4xl tracking-[-.03em] md:text-5xl">Frequently asked questions</h1>
    </section>

    <section className="mx-auto max-w-2xl px-5 pb-16 md:px-8">
      <Accordion type="single" collapsible className="rounded-2xl border border-border bg-card px-2">
        {FAQS.map((f, i) => <AccordionItem key={f.q} value={`faq-${i}`} className="border-border last:border-b-0">
          <AccordionTrigger className="px-4 text-left text-sm font-extrabold hover:no-underline" data-testid={`trigger-faq-${i}`}>{f.q}</AccordionTrigger>
          <AccordionContent className="px-4 text-sm leading-6 text-muted-foreground">{f.a}</AccordionContent>
        </AccordionItem>)}
      </Accordion>
      <div className="mt-10 text-center">
        <p className="text-sm text-muted-foreground">Didn't find what you needed?</p>
        <Link href="/contact" className="btn-pop mt-4 inline-flex items-center gap-2 rounded-xl border border-border px-6 py-3 text-xs font-extrabold text-foreground hover:bg-muted" data-testid="link-faq-contact">
          Contact us <ArrowRight size={14} />
        </Link>
      </div>
    </section>

    <div className="mx-auto max-w-6xl px-5 pb-16 md:px-8"><Footer variant="full" /></div>
  </div>;
}
