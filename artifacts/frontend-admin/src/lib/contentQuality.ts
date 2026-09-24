// v60 — pure content-quality checks over the existing GET /admin/mcqs rows. No API, no side effects.
import type { AdminMcqRow } from '@/lib/api';

export type Stage = 'draft' | 'review' | 'approved' | 'published';
export const norm = (s: string) => s.toLowerCase().replace(/<[^>]*>/g, ' ').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
export function invalidReasons(m: AdminMcqRow): string[] {
  const out: string[] = []; const opts = (m.options ?? []).map((o) => (o ?? '').trim());
  if (!m.question?.trim()) out.push('Empty question');
  if (opts.filter(Boolean).length < 2) out.push('Fewer than 2 options');
  if (new Set(opts.filter(Boolean).map(norm)).size < opts.filter(Boolean).length) out.push('Duplicate options');
  if (!m.correctAnswer?.trim()) out.push('No correct answer set');
  else if (!opts.includes(m.correctAnswer.trim()) && !(m.options ?? []).includes(m.correctAnswer)) out.push('Correct answer is not one of the options');
  return out;
}
export const hasExplanation = (m: AdminMcqRow) => !!m.explanation?.trim();
export const hasReference = (m: AdminMcqRow) => !!m.reference?.trim();
/** Draft → Review → Approved → Published, derived from the two server fields that already exist. */
export function stageOf(m: AdminMcqRow): Stage {
  if (m.status === 'published') return 'published';
  if (m.explanationStatus === 'APPROVED' && hasExplanation(m) && !invalidReasons(m).length) return 'approved';
  if (m.explanationStatus === 'REVIEWED' && hasExplanation(m)) return 'review';
  return 'draft';
}
const tokens = (s: string) => new Set(norm(s).split(' ').filter((w) => w.length > 2));
export interface DupPair { a: AdminMcqRow; b: AdminMcqRow; score: number }
/** Near-duplicate finder: inverted index over rare words, then Jaccard on the candidates (fast enough for ~10k questions). */
export function findDuplicates(rows: AdminMcqRow[], threshold = 0.72, cap = 150): DupPair[] {
  const toks = rows.map((r) => tokens(r.question)); const index = new Map<string, number[]>();
  toks.forEach((t, i) => t.forEach((w) => { const l = index.get(w); l ? l.push(i) : index.set(w, [i]); }));
  const shared = new Map<number, number>();
  for (const ids of index.values()) { if (ids.length > 40) continue; for (let x = 0; x < ids.length; x++) for (let y = x + 1; y < ids.length; y++) { const k = ids[x] * 100003 + ids[y]; shared.set(k, (shared.get(k) ?? 0) + 1); } }
  const out: DupPair[] = [];
  for (const [k, c] of shared) { if (c < 3) continue; const i = Math.floor(k / 100003), j = k % 100003; const ti = toks[i], tj = toks[j]; let inter = 0; ti.forEach((w) => tj.has(w) && inter++); const score = inter / (ti.size + tj.size - inter || 1); if (score >= threshold) out.push({ a: rows[i], b: rows[j], score }); }
  return out.sort((p, q) => q.score - p.score).slice(0, cap);
}
