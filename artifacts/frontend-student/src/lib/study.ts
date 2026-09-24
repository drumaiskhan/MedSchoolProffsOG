// v60 — study intelligence built ONLY on existing endpoints + this device's localStorage.
// (No backend / schema / route changes.) The mistake ledger and spaced-repetition state live
// on the device; everything else is derived from /student/progress-overview, /mcqs, /flashcards.
import { listMcqs, type Mcq } from '@workspace/api-client-react';
import { analyticsApi, flaggedMcqsApi } from '@/lib/api';

/* ---------------- Mistake ledger ---------------- */
export interface Miss { id: number; q: string; topicId?: number; tags: string[]; difficulty: string; wrong: number; right: number; streak: number; lastWrong: number; lastSeen: number }
const LEDGER = 'msp.mistakes.v1';
const read = <T,>(key: string, fallback: T): T => { try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; } };
const write = (key: string, v: unknown) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage full / private mode */ } };

export const getLedger = (): Record<number, Miss> => read(LEDGER, {});
/** Called once when a practice session is finished. `streak` = consecutive correct answers since the last miss. */
export function recordSession(mcqs: Mcq[], answers: Record<number, string | null>, topicId?: number) {
  const ledger = getLedger(); const now = Date.now();
  for (const m of mcqs) {
    const a = answers[m.id]; if (a == null) continue;
    const ok = a === m.correctAnswer;
    const e = ledger[m.id] ?? { id: m.id, q: m.question.slice(0, 220), topicId, tags: (m as { tags?: string[] }).tags ?? [], difficulty: m.difficulty, wrong: 0, right: 0, streak: 0, lastWrong: 0, lastSeen: now };
    e.topicId = e.topicId ?? topicId; e.lastSeen = now;
    if (ok) { e.right += 1; e.streak += 1; } else { e.wrong += 1; e.streak = 0; e.lastWrong = now; }
    ledger[m.id] = e;
  }
  write(LEDGER, ledger);
}
/** Open mistakes = missed at least once and not yet answered right twice in a row. */
export const openMistakes = (): Miss[] => Object.values(getLedger()).filter((e) => e.wrong > 0 && e.streak < 2).sort((a, b) => b.lastWrong - a.lastWrong);
export const repeatedMistakes = (): Miss[] => openMistakes().filter((e) => e.wrong >= 2).sort((a, b) => b.wrong - a.wrong);
export const clearLedger = () => write(LEDGER, {});

/* ---------------- Study sets (Practice ?set=weak|mistakes&count=N) ---------------- */
const shuffle = <T,>(xs: T[]) => { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
export async function weakTopicIds(limit = 6): Promise<number[]> {
  const o = await analyticsApi.overview();
  return o.improvement.needsWork.slice(0, limit).map((t) => t.id);
}
export async function buildStudySet(kind: string, count: number): Promise<Mcq[]> {
  let pool: Mcq[] = [];
  if (kind === 'mistakes') {
    const open = openMistakes(); const want = new Set(open.map((e) => e.id));
    const topics = [...new Set(open.map((e) => e.topicId).filter((x): x is number => !!x))].slice(0, 8);
    const lists = await Promise.all(topics.map((topicId) => listMcqs({ topicId }).catch(() => [] as Mcq[])));
    pool = lists.flat().filter((m) => want.has(m.id));
    const found = new Set(pool.map((m) => m.id));
    const loose = open.filter((e) => !found.has(e.id)).slice(0, 12); // no topic recorded (past papers, etc.)
    const singles = await Promise.all(loose.map((e) => listMcqs({ mcqId: e.id }).catch(() => [] as Mcq[])));
    pool = [...pool, ...singles.flat()];
    const rank = new Map(open.map((e, i) => [e.id, e.wrong * 10 - i]));
    pool.sort((a, b) => (rank.get(b.id) ?? 0) - (rank.get(a.id) ?? 0));
    return pool.slice(0, count);
  }
  if (kind === 'flagged') {
    const open = (await flaggedMcqsApi.list()).filter((f) => f.status === 'open' && !f.mcqDeleted).slice(0, count);
    const lists = await Promise.all(open.map((f) => listMcqs({ mcqId: f.mcqId }).catch(() => [] as Mcq[])));
    return lists.flat();
  }
  const ids = await weakTopicIds(8);
  const lists = await Promise.all(ids.map((topicId) => listMcqs({ topicId }).catch(() => [] as Mcq[])));
  // Round-robin across weak topics so one big topic can't crowd the set out.
  const shuffled = lists.map(shuffle); const out: Mcq[] = [];
  for (let i = 0; out.length < count; i++) { let added = false; for (const l of shuffled) if (l[i]) { out.push(l[i]); added = true; } if (!added) break; }
  return out.slice(0, count);
}

/* ---------------- Flashcard spaced repetition (Leitner-style, per device) ---------------- */
export type Grade = 'again' | 'hard' | 'good' | 'easy';
export interface Sr { box: number; due: number; reps: number; lapses: number }
const SR = 'msp.flashcards.sr.v1'; const DAY = 86400000;
const GAP = [0, 1, 3, 7, 16, 35]; // days per box
export const getSr = (): Record<number, Sr> => read(SR, {});
export function gradeCard(id: number, g: Grade): Sr {
  const all = getSr(); const cur = all[id] ?? { box: 0, due: 0, reps: 0, lapses: 0 };
  const box = g === 'again' ? 0 : g === 'hard' ? Math.max(1, cur.box) : g === 'good' ? Math.min(5, cur.box + 1) : Math.min(5, cur.box + 2);
  const minutes = g === 'again' ? 10 : 0;
  const next: Sr = { box, reps: cur.reps + 1, lapses: cur.lapses + (g === 'again' ? 1 : 0), due: Date.now() + (minutes ? minutes * 60000 : Math.max(g === 'hard' ? 0.5 : 1, GAP[box]) * DAY) };
  all[id] = next; write(SR, all); return next;
}
export const isDue = (sr: Sr | undefined) => !sr || sr.due <= Date.now();
export const nextIntervalLabel = (id: number, g: Grade) => { const cur = getSr()[id] ?? { box: 0 }; const box = g === 'again' ? 0 : g === 'hard' ? Math.max(1, cur.box) : g === 'good' ? Math.min(5, cur.box + 1) : Math.min(5, cur.box + 2); if (g === 'again') return '10m'; const d = Math.max(g === 'hard' ? 0.5 : 1, GAP[box]); return d < 1 ? '12h' : `${d}d`; };
