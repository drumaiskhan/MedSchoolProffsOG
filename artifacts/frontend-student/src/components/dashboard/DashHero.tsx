// Dashboard hero: greeting, a nudge chosen from the student's real numbers, the
// streak flame with the last 7 days as coins, and the primary "resume" action.
// Depth is faked (gradients, layered shadows, plain 2D float/scale) — never
// perspective/rotateX/rotateY, see the v34 note in index.css.
import { type ReactNode } from 'react';
import { Link } from 'wouter';
import { ArrowRight, Check, Play } from 'lucide-react';
import { Count, DayPartIcon, FlameIcon } from '@/lib/fx3d';
import { useParallax, depth } from '@/lib/motion';
import type { StreakCard } from '@/lib/api';
import { DASH_LIMITS, DAY_PART_LABEL, dayLabel, dayPartForHour } from './dash-utils';

const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');

export interface DashHeroProps {
  firstName: string;
  hour: number;
  message: string;
  streak: StreakCard | undefined;
  /** Where the primary button goes and what it says (resume / start / browse). */
  action: { href: string; label: string; hint?: string | null };
  /** The membership / trial chip, built by the dashboard from real status data. */
  chip?: ReactNode;
  heroImageUrl?: string | null;
}

export function DashHero({ firstName, hour, message, streak, action, chip, heroImageUrl }: DashHeroProps) {
  const part = dayPartForHour(hour);
  const parallax = useParallax<HTMLElement>();
  const current = streak?.currentStreak ?? 0;
  const days = (streak?.days ?? []).slice(-DASH_LIMITS.streakDays);
  const lastIdx = days.length - 1;
  return <section ref={parallax} className={cx('dash-hero', heroImageUrl && 'dash-hero--photo')} style={heroImageUrl ? { ['--hero-photo' as string]: `url(${heroImageUrl})` } : undefined} data-testid="card-dashboard-hero">
    <span className="dash-hero__orb dash-hero__orb--a float-slow" style={depth(18, 12)} aria-hidden="true" />
    <span className="dash-hero__orb dash-hero__orb--b float-med" style={depth(-14, -10)} aria-hidden="true" />
    <span className="dash-hero__ring" style={depth(-8, 6)} aria-hidden="true" />
    <div className="hero-grid" aria-hidden="true" />

    <div className="dash-hero__body">
      <div className="dash-hero__top">
        <span className="dash-eyebrow dash-eyebrow--glass">Your study desk</span>
        {chip}
      </div>

      <p className="dash-hero__greet">{DAY_PART_LABEL[part]},</p>
      <h2 className="dash-hero__name">
        <span className="dash-hero__nameText">{firstName}</span>{' '}
        <span className="dash-hero__glyph" aria-hidden="true"><DayPartIcon part={part} size={40} /></span>
      </h2>
      <p className="dash-hero__msg">{message}</p>

      <div className="dash-streak" data-testid="strip-dashboard-streak">
        <Link href="/leaderboard" className="dash-streak__main" data-testid="link-dashboard-streak" aria-label={`Current streak: ${current} ${current === 1 ? 'day' : 'days'}. Open leaderboard`}>
          <FlameIcon size={34} lit={current > 0} />
          <span className="dash-streak__count"><strong><Count value={current} /></strong><span>day streak</span></span>
        </Link>
        <ol className="dash-streak__days" aria-label="Last 7 days of practice">
          {days.map((d, i) => {
            const on = d.sessions > 0;
            const label = dayLabel(d.date);
            return <li key={d.date} className="dash-streak__day" title={`${label.long}: ${on ? `${d.sessions} session${d.sessions === 1 ? '' : 's'}` : 'no practice'}`}>
              <span className={cx('day-coin', 'dash-coin', on ? 'day-coin--on' : 'day-coin--off', i === lastIdx && 'day-coin--today')} style={{ ['--i' as string]: i }}>{on && <Check size={12} strokeWidth={3.4} color="#fff" />}</span>
              <small>{label.weekday}</small>
            </li>;
          })}
        </ol>
      </div>

      <div className="dash-hero__cta">
        <Link href={action.href} className="dash-key dash-key--light shine-btn" data-testid="button-dashboard-primary"><Play size={14} fill="currentColor" /> {action.label} <ArrowRight size={15} /></Link>
        {action.hint && <span className="dash-hero__hint">{action.hint}</span>}
      </div>
    </div>
  </section>;
}
