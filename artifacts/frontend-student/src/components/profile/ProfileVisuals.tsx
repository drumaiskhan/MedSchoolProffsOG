// v59 — 3D profile hero + membership pass. Presentational; styles live in profile3d.css.
import { Link } from 'wouter';
import { CheckCircle2, Clock3, Crown, Flame, ShieldCheck, Sparkles, Target } from 'lucide-react';
import { useGetStudentDashboard } from '@workspace/api-client-react';
import { TiltDiv } from '@/lib/tilt';
import { Count } from '@/lib/fx3d';
import { cn, initials } from '@/lib/shared';

const daysLeft = (iso?: string | null) => iso ? Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000)) : null;

export function ProfileHero({ name, programYear, avatarUrl, isActive, streak, progress, days }: {
  name: string; programYear: string; avatarUrl?: string | null; isActive: boolean; streak: number; progress: number; days: number | null;
}) {
  const stats = [
    { icon: Flame, label: 'Day streak', value: streak, suffix: '' },
    { icon: Target, label: 'Progress', value: Math.round(progress), suffix: '%' },
    { icon: Crown, label: isActive ? 'Days left' : 'Membership', value: days ?? 0, suffix: '', text: isActive ? undefined : 'Inactive' },
  ];
  return <TiltDiv className="pf-hero" testId="card-profile-hero" style={{ '--tilt': 3 } as never}>
    <div className="pf-hero__body">
      <span className="pf-orb pf-orb--a" /><span className="pf-orb pf-orb--b" /><span className="pf-grid" />
      <div className="relative flex flex-wrap items-center gap-5">
        <div className="pf-avatar">
          {avatarUrl ? <img src={avatarUrl} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} /> : <span>{initials(name)}</span>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-bold uppercase tracking-[.16em] text-[#9fe9d2]">Student profile</div>
          <h2 className="mt-1 truncate font-display text-3xl leading-tight">{name}</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="pf-chip"><Sparkles size={12} /> {programYear}</span>
            <span className="pf-chip">{isActive ? <CheckCircle2 size={12} className="text-[#5ef0c0]" /> : <Clock3 size={12} className="text-[#ffd27a]" />}{isActive ? 'Active member' : 'Pending activation'}</span>
          </div>
        </div>
      </div>
      <div className="relative mt-5 grid grid-cols-3 gap-2.5">
        {stats.map(({ icon: Icon, label, value, suffix, text }) => <div key={label} className="pf-stat">
          <Icon size={14} className="text-[#ffe08a]" />
          <div className="mt-1 font-display text-2xl leading-none">{text ?? <Count value={value} suffix={suffix} />}</div>
          <div className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[#b8ecdc]">{label}</div>
        </div>)}
      </div>
    </div>
  </TiltDiv>;
}

/** Credit-card style membership pass. Reads its own status from the dashboard. */
export function MembershipPass({ payments = [], name, manageHref }: { payments?: { planName: string; status: string }[]; name?: string; manageHref?: string }) {
  const d = useGetStudentDashboard().data;
  const isActive = d?.membershipStatus === 'ACTIVE';
  const days = daysLeft(d?.membershipExpiry);
  const pending = payments.find((p) => p.status === 'pending');
  const plan = payments.find((p) => p.status === 'approved')?.planName;
  const warn = isActive && days !== null && days <= 7;
  const R = 34, C = 2 * Math.PI * R;
  const frac = isActive && days !== null ? Math.min(1, days / 90) : 0; // ring fills toward a 90-day window
  const expiry = d?.membershipExpiry ? new Date(d.membershipExpiry).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : null;
  return <TiltDiv className={cn('pf-pass', warn && 'pf-pass--warn', !isActive && 'pf-pass--off')} testId="card-subscription-status" style={{ '--tilt': 5 } as never}>
    <div className="pf-pass__body">
      <span className="pf-pass__holo" />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <div className="pf-pass__chip" />
          <div className="mt-3 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[.16em] text-white/70"><ShieldCheck size={12} /> Membership pass</div>
          <div className="mt-1 font-display text-2xl leading-tight">{isActive ? (plan ?? 'Active member') : pending ? 'Awaiting approval' : 'Not activated'}</div>
        </div>
        <div className="relative grid size-[5.5rem] place-items-center">
          <svg viewBox="0 0 80 80" className="pf-ring absolute inset-0 size-full" aria-hidden="true">
            <circle className="pf-ring__bg" cx="40" cy="40" r={R} strokeWidth="6" />
            <circle className="pf-ring__fg" cx="40" cy="40" r={R} strokeWidth="6" strokeDasharray={C} strokeDashoffset={C * (1 - frac)} />
          </svg>
          <div className="text-center leading-none"><div className="font-display text-2xl">{isActive && days !== null ? <Count value={days} /> : '—'}</div><div className="mt-0.5 text-[8px] font-bold uppercase tracking-wide text-white/70">days left</div></div>
        </div>
      </div>
      <div className="relative mt-5 flex items-end justify-between gap-3 text-xs">
        <div><div className="text-[9px] font-bold uppercase tracking-[.14em] text-white/55">Member</div><div className="mt-0.5 font-bold tracking-wide">{name ?? d?.user?.name ?? 'Student'}</div></div>
        <div className="text-right"><div className="text-[9px] font-bold uppercase tracking-[.14em] text-white/55">{isActive ? 'Valid until' : 'Status'}</div><div className="mt-0.5 font-bold">{isActive ? (expiry ?? '—') : pending ? 'In review' : 'Choose a plan'}</div></div>
        {manageHref && <Link href={manageHref} className="no-3d rounded-xl bg-white/15 px-3 py-2 text-[11px] font-extrabold backdrop-blur transition-colors hover:bg-white/25" data-testid="link-manage-membership">Manage</Link>}
      </div>
    </div>
  </TiltDiv>;
}
