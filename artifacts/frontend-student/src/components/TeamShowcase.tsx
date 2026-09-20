// Landing page "academic team" section (v37): a dark stage with glass cards.
// Each card has a metallic ring around the photo, a coloured halo and contact
// shadow under it, a pointer-following highlight and a sheen sweep on hover.
// 3D is faked (shadows, gradients, 2D translate/scale) — see the depth-system
// note in index.css; no perspective/rotate transforms.
import { Link } from 'wouter';
import { ArrowRight, Award, Mail } from 'lucide-react';
import { TEAM_CATEGORIES, type TeamMember } from '@/lib/api';
import { TeamPhoto } from '@/lib/shared';
import { Reveal } from '@/lib/motion';

const RING: Record<TeamMember['category'], { ring: 'gold' | 'teal' | 'violet'; halo: string; chip: string }> = {
  ownership: { ring: 'gold', halo: 'hsl(43 90% 60% / .45)', chip: 'bg-[#f2c94c]/15 text-[#ffe08a]' },
  reviewer: { ring: 'teal', halo: 'hsl(160 55% 55% / .45)', chip: 'bg-[#4cbf95]/15 text-[#9fe3c8]' },
  question_setter: { ring: 'violet', halo: 'hsl(265 65% 68% / .45)', chip: 'bg-[#a67be0]/15 text-[#d9c4ff]' },
};

// Singular, short labels for the chip (the shared plural ones are section titles).
const CHIP_LABEL: Record<TeamMember['category'], string> = { ownership: 'Owner', reviewer: 'Reviewer', question_setter: 'Question setter' };

function orderOf(m: TeamMember): number {
  const i = TEAM_CATEGORIES.indexOf(m.category ?? 'reviewer');
  return i === -1 ? TEAM_CATEGORIES.length : i;
}

function MemberCard({ member, index }: { member: TeamMember; index: number }) {
  const cat = RING[member.category] ?? RING.reviewer;
  return <Reveal delay={Math.min(index, 7) * 70} className={index % 2 === 1 ? 'lg:mt-8' : ''}>
    <div className="team-card h-full" data-testid={`card-home-team-${member.id}`}
      onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`); e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`); }}>
      <div className="team-photo" style={{ ['--halo' as string]: cat.halo }}>
        <span className={`avatar-ring avatar-ring--${cat.ring}`}><TeamPhoto member={member} size={104} /></span>
      </div>
      <span className="team-floor" aria-hidden="true" />
      <h3 className="mt-4 text-[15px] font-extrabold leading-tight text-white">{member.name}</h3>
      <p className="mt-1 text-xs font-semibold text-white/60">{member.role}</p>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
        <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[.06em] ${cat.chip}`}>{CHIP_LABEL[member.category] ?? 'Team'}</span>
        {member.achievementBadge && <span className="inline-flex items-center gap-1 rounded-full bg-[#f2c94c]/15 px-2.5 py-1 text-[10px] font-bold text-[#ffe08a]"><Award size={10} /> {member.achievementBadge}</span>}
      </div>
      {member.bio && <p className="mt-3 line-clamp-2 text-[11px] leading-5 text-white/50">{member.bio}</p>}
      {member.email && <a href={`mailto:${member.email}`} className="mx-auto mt-3 grid size-8 place-items-center rounded-full bg-white/10 text-white/70 transition-colors hover:bg-white/20 hover:text-white" aria-label={`Email ${member.name}`}><Mail size={13} /></a>}
    </div>
  </Reveal>;
}

export function TeamShowcase({ team }: { team: TeamMember[] }) {
  const members = team.filter((t) => t.active).sort((a, b) => orderOf(a) - orderOf(b) || a.displayOrder - b.displayOrder).slice(0, 8);
  if (!members.length) return null;
  return <section className="team-stage border-b border-border" data-testid="section-home-team">
    <div className="hero-grid" />
    <div className="orb -left-24 top-10 size-80 bg-[hsl(var(--sidebar-primary))]" style={{ opacity: 0.22 }} />
    <div className="orb -right-24 bottom-0 size-80 bg-[#a67be0]" style={{ opacity: 0.16, animationDelay: '-7s' }} />
    <div className="relative mx-auto max-w-6xl px-5 py-20 md:px-8">
      <Reveal className="mx-auto max-w-2xl text-center">
        <div className="font-mono-app text-[10px] uppercase tracking-[.18em] text-[hsl(var(--sidebar-primary))]">Who's behind it</div>
        <h2 className="mt-3 font-display text-4xl tracking-[-.03em] text-white md:text-5xl">Meet the academic team</h2>
        <p className="mt-4 text-sm leading-7 text-white/60">The doctors and senior students who write, review and explain every question — so what you practise is checked by people who sat the same exams.</p>
      </Reveal>
      <div className="mt-14 grid grid-cols-2 gap-3.5 sm:gap-5 lg:grid-cols-4">
        {members.map((m, i) => <MemberCard key={m.id} member={m} index={i} />)}
      </div>
      <div className="mt-12 text-center">
        <Link href="/about" className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-5 py-2.5 text-xs font-extrabold text-white transition-colors hover:bg-white/20" data-testid="link-home-team-all">Read about the team <ArrowRight size={14} /></Link>
      </div>
    </div>
  </section>;
}
