// Friend-challenge achievements — computed client-side from the challenge
// list the student already loads (GET /challenges/mine), the same "read only
// what already exists, no new backend model" approach the exam-result and
// Student 360° achievements use. Recomputed on every view, so a badge is
// "what your challenge history demonstrates" rather than a persisted unlock
// log. Ties never count as wins, and a win only exists once BOTH players have
// finished (status COMPLETED with both scores present).
import { Crown, Flame, Medal, Repeat, Star, Swords, Target, Trophy, Users, Zap, type LucideIcon } from 'lucide-react';
import type { ChallengeSummary } from '@/lib/api';

export type ChallengeCategory = 'Starter' | 'Winning' | 'Skill' | 'Social';
export type ChallengeAchievement = {
  id: string; label: string; hint: string; icon: LucideIcon; category: ChallengeCategory;
  tier: number;            // 0-based position inside its family (bronze → platinum)
  earned: boolean;
  progress: number;        // 0..1 for the locked-card progress bar
  current: number; target: number;
};

function family(o: {
  id: string; category: ChallengeCategory; icon: LucideIcon; current: number; thresholds: number[];
  label: (t: number) => string; hint: (t: number) => string;
}): ChallengeAchievement[] {
  return o.thresholds.map((t, i) => ({
    id: `${o.id}-${t}`, label: o.label(t), hint: o.hint(t), icon: o.icon, category: o.category, tier: i,
    earned: o.current >= t, progress: Math.min(1, o.current / t), current: Math.min(o.current, t), target: t,
  }));
}

export type ChallengeStats = {
  sent: number; played: number; completed: number; wins: number; draws: number;
  bestStreak: number; perfect: number; sharp: number; bestMargin: number;
  opponents: number; bestRematch: number; acceptedReceived: number; questionsAnswered: number;
};

export function computeChallengeStats(sent: ChallengeSummary[], received: ChallengeSummary[]): ChallengeStats {
  const all = [...sent, ...received];
  const played = all.filter((c) => c.iHavePlayed && c.myScorePercent != null);
  const done = all.filter((c) => c.status === 'COMPLETED' && c.myScorePercent != null && c.opponentScorePercent != null);
  const chrono = [...done].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  let wins = 0, draws = 0, run = 0, bestStreak = 0, bestMargin = 0;
  for (const c of chrono) {
    const diff = (c.myScorePercent as number) - (c.opponentScorePercent as number);
    if (diff > 0) { wins++; run++; bestStreak = Math.max(bestStreak, run); bestMargin = Math.max(bestMargin, diff); }
    else { if (diff === 0) draws++; run = 0; }
  }

  const perOpponent = new Map<number, number>();
  for (const c of done) if (c.opponent) perOpponent.set(c.opponent.id, (perOpponent.get(c.opponent.id) ?? 0) + 1);
  const opponentIds = new Set(played.map((c) => c.opponent?.id).filter((x): x is number => typeof x === 'number'));

  return {
    sent: sent.length,
    played: played.length,
    completed: done.length,
    wins, draws, bestStreak,
    perfect: played.filter((c) => (c.myScorePercent as number) >= 100).length,
    sharp: played.filter((c) => (c.myScorePercent as number) >= 90).length,
    bestMargin: Math.floor(bestMargin),
    opponents: opponentIds.size,
    bestRematch: Math.max(0, ...perOpponent.values()),
    acceptedReceived: received.filter((c) => c.iHavePlayed).length,
    questionsAnswered: played.reduce((a, c) => a + (c.totalQuestions || 0), 0),
  };
}

export function computeChallengeAchievements(sent: ChallengeSummary[], received: ChallengeSummary[]): ChallengeAchievement[] {
  const s = computeChallengeStats(sent, received);
  return [
    ...family({ id: 'ch-sent', category: 'Starter', icon: Swords, current: s.sent, thresholds: [1, 5, 10, 25],
      label: (t) => (t === 1 ? 'First challenge sent' : `${t} challenges sent`), hint: (t) => `Challenge ${t === 1 ? 'a classmate' : `${t} times`}` }),
    ...family({ id: 'ch-played', category: 'Starter', icon: Swords, current: s.played, thresholds: [1, 5, 10, 25, 50],
      label: (t) => (t === 1 ? 'First duel played' : `${t} duels played`), hint: (t) => `Finish ${t} friend ${t === 1 ? 'challenge' : 'challenges'}` }),
    ...family({ id: 'ch-wins', category: 'Winning', icon: Trophy, current: s.wins, thresholds: [1, 3, 5, 10, 25],
      label: (t) => (t === 1 ? 'First victory' : `${t} victories`), hint: (t) => `Beat a friend in ${t} ${t === 1 ? 'challenge' : 'challenges'}` }),
    ...family({ id: 'ch-streak', category: 'Winning', icon: Flame, current: s.bestStreak, thresholds: [2, 3, 5, 10],
      label: (t) => `${t}-win streak`, hint: (t) => `Win ${t} completed challenges in a row` }),
    ...family({ id: 'ch-margin', category: 'Winning', icon: Zap, current: s.bestMargin, thresholds: [20, 40, 60],
      label: (t) => `Won by ${t}+ points`, hint: (t) => `Beat a friend by ${t} percentage points or more` }),
    ...family({ id: 'ch-perfect', category: 'Skill', icon: Crown, current: s.perfect, thresholds: [1, 3, 5],
      label: (t) => (t === 1 ? 'Flawless duel' : `${t} flawless duels`), hint: (t) => `Score 100% in ${t} friend ${t === 1 ? 'challenge' : 'challenges'}` }),
    ...family({ id: 'ch-sharp', category: 'Skill', icon: Star, current: s.sharp, thresholds: [1, 5, 10],
      label: (t) => (t === 1 ? 'Sharpshooter · 90%+' : `${t} scores of 90%+`), hint: (t) => `Score 90% or higher in ${t} friend ${t === 1 ? 'challenge' : 'challenges'}` }),
    ...family({ id: 'ch-questions', category: 'Skill', icon: Target, current: s.questionsAnswered, thresholds: [50, 200, 500],
      label: (t) => `${t} duel questions`, hint: (t) => `Answer ${t} questions across friend challenges` }),
    ...family({ id: 'ch-opponents', category: 'Social', icon: Users, current: s.opponents, thresholds: [2, 5, 10],
      label: (t) => `Faced ${t} classmates`, hint: (t) => `Play challenges against ${t} different classmates` }),
    ...family({ id: 'ch-rematch', category: 'Social', icon: Repeat, current: s.bestRematch, thresholds: [2, 3, 5],
      label: (t) => (t === 2 ? 'Rematch' : `${t}-match rivalry`), hint: (t) => `Complete ${t} challenges against the same friend` }),
    ...family({ id: 'ch-accepted', category: 'Social', icon: Medal, current: s.acceptedReceived, thresholds: [1, 5, 10],
      label: (t) => (t === 1 ? 'Challenge accepted' : `${t} challenges accepted`), hint: (t) => `Play ${t} ${t === 1 ? 'challenge' : 'challenges'} a friend sent you` }),
  ];
}
