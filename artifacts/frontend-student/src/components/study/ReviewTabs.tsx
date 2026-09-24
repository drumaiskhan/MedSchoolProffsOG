// v61 — one connected "review" area: Flagged · Notes · Saved sessions · Mistakes, with live counts.
import { Link, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Bookmark, CalendarCheck, Flag, NotebookPen } from 'lucide-react';
import { flaggedMcqsApi, notebookApi, savedSessionsApi } from '@/lib/api';
import { cn } from '@/lib/shared';
import { openMistakes } from '@/lib/study';

export function ReviewTabs() {
  const [loc] = useLocation();
  const flags = useQuery({ queryKey: ['flagged-mcqs'], queryFn: flaggedMcqsApi.list });
  const notes = useQuery({ queryKey: ['notebook'], queryFn: notebookApi.list });
  const sessions = useQuery({ queryKey: ['saved-sessions'], queryFn: savedSessionsApi.list });
  const openFlags = (flags.data ?? []).filter((f) => f.status === 'open').length;
  const tabs = [
    { href: '/flagged-mcqs', label: 'Flagged', icon: Flag, n: openFlags },
    { href: '/notebook', label: 'Notes', icon: NotebookPen, n: notes.data?.length ?? 0 },
    { href: '/saved-sessions', label: 'Saved', icon: Bookmark, n: sessions.data?.length ?? 0 },
    { href: '/study?tab=mistakes', label: 'Mistakes', icon: CalendarCheck, n: openMistakes().length },
  ];
  return <nav aria-label="Review tools" className="-mx-1 mb-5 flex gap-1.5 overflow-x-auto px-1 pb-1" data-testid="review-tabs">
    {tabs.map(({ href, label, icon: Icon, n }) => { const active = loc === href.split('?')[0] && !href.includes('?'); return <Link key={href} href={href} className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-extrabold transition-all active:scale-95', active ? 'border-primary bg-primary text-primary-foreground shadow-sm' : 'border-border bg-card text-muted-foreground hover:-translate-y-0.5 hover:text-foreground')}>
      <Icon size={13} />{label}{n > 0 && <span className={cn('rounded-full px-1.5 text-[10px]', active ? 'bg-white/25' : 'bg-muted')}>{n}</span>}
    </Link>; })}
  </nav>;
}
