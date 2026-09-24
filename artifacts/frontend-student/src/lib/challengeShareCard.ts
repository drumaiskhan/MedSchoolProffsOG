// Draws the shareable "I won!" result card for a friend challenge onto a
// canvas (no image library needed). Brand colors are read from the app's CSS
// tokens so the card matches the theme; the friend's name is opt-in because
// the card is meant to be posted publicly.
export type ShareCardOptions = {
  verdict: 'win' | 'tie';
  myScore: number;
  opponentScore: number;
  totalQuestions: number;
  platformName: string;
  opponentFirstName?: string | null; // only passed when the student opts in
  seed?: number;                     // keeps the confetti stable for a given challenge
};

export const SHARE_CARD_SIZE = { width: 1080, height: 1350 };

function token(name: string, fallback: string): string {
  if (typeof document === 'undefined') return `hsl(${fallback})`;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return `hsl(${v || fallback})`;
}
function tokenA(name: string, fallback: string, alpha: number): string {
  if (typeof document === 'undefined') return `hsl(${fallback} / ${alpha})`;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return `hsl(${v || fallback} / ${alpha})`;
}

// Small deterministic PRNG so the same challenge always gets the same confetti.
function rng(seed: number) { let s = (seed || 1) >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, startPx: number, weight = 800): number {
  let px = startPx;
  while (px > 24) { ctx.font = `${weight} ${px}px Manrope, system-ui, sans-serif`; if (ctx.measureText(text).width <= maxWidth) break; px -= 4; }
  return px;
}

export async function drawChallengeShareCard(canvas: HTMLCanvasElement, o: ShareCardOptions): Promise<void> {
  const { width: W, height: H } = SHARE_CARD_SIZE;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  try { await document.fonts?.load('800 100px Manrope'); await document.fonts?.load('500 30px Manrope'); } catch { /* fall back to system fonts */ }

  const sidebar = token('--sidebar', '206 41% 16%');
  const primary = token('--primary', '164 42% 39%');
  const accent = token('--accent', '34 74% 62%');

  // Background: deep brand gradient + two soft glows.
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, sidebar); bg.addColorStop(1, 'hsl(226 32% 6%)');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  for (const [x, y, r, c] of [[W * 0.18, H * 0.12, 620, tokenA('--primary', '164 42% 39%', 0.35)], [W * 0.9, H * 0.55, 560, tokenA('--accent', '34 74% 62%', 0.22)]] as const) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, c); g.addColorStop(1, 'transparent');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  // Confetti (wins only, to keep a tie card calm).
  if (o.verdict === 'win') {
    const rand = rng(o.seed ?? 7);
    const colors = [accent, primary, 'hsl(0 0% 100% / .85)', 'hsl(271 45% 68%)', 'hsl(206 55% 65%)'];
    for (let i = 0; i < 70; i++) {
      const x = rand() * W, y = rand() * H * 0.5, w = 10 + rand() * 16, h = 6 + rand() * 10, rot = rand() * Math.PI;
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.globalAlpha = 0.35 + rand() * 0.5;
      ctx.fillStyle = colors[Math.floor(rand() * colors.length)]; ctx.fillRect(-w / 2, -h / 2, w, h); ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // Medal: layered discs for a raised, 3D look.
  const cx = W / 2, cy = 470;
  ctx.save();
  ctx.shadowColor = 'hsl(0 0% 0% / .55)'; ctx.shadowBlur = 60; ctx.shadowOffsetY = 28;
  const rim = ctx.createLinearGradient(cx - 210, cy - 210, cx + 210, cy + 210);
  rim.addColorStop(0, 'hsl(44 92% 78%)'); rim.addColorStop(0.5, accent); rim.addColorStop(1, 'hsl(30 70% 36%)');
  ctx.fillStyle = rim; ctx.beginPath(); ctx.arc(cx, cy, 210, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  const face = ctx.createRadialGradient(cx - 70, cy - 90, 20, cx, cy, 180);
  face.addColorStop(0, 'hsl(46 95% 82%)'); face.addColorStop(1, accent);
  ctx.fillStyle = face; ctx.beginPath(); ctx.arc(cx, cy, 176, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'hsl(0 0% 100% / .55)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(cx, cy, 176, Math.PI * 1.05, Math.PI * 1.75); ctx.stroke();
  ctx.font = '210px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(o.verdict === 'win' ? '🏆' : '🤝', cx, cy + 10);

  // Headline
  ctx.textBaseline = 'alphabetic'; ctx.fillStyle = 'hsl(0 0% 100%)';
  const headline = o.verdict === 'win' ? 'I WON!' : "IT'S A TIE!";
  ctx.font = `800 ${fitText(ctx, headline, W - 160, 150)}px Manrope, system-ui, sans-serif`;
  ctx.fillText(headline, cx, 820);

  // Score panel
  const panelY = 880, panelH = 250, panelX = 90, panelW = W - 180;
  ctx.fillStyle = 'hsl(0 0% 100% / .08)'; ctx.strokeStyle = 'hsl(0 0% 100% / .16)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(panelX, panelY, panelW, panelH, 36); ctx.fill(); ctx.stroke();
  ctx.font = '800 130px Manrope, system-ui, sans-serif'; ctx.fillStyle = 'hsl(0 0% 100%)';
  ctx.fillText(`${Math.round(o.myScore)}%`, cx - 250, panelY + 150);
  ctx.fillStyle = 'hsl(0 0% 100% / .45)'; ctx.font = '700 60px Manrope, system-ui, sans-serif'; ctx.fillText('vs', cx, panelY + 135);
  ctx.fillStyle = 'hsl(0 0% 100% / .8)'; ctx.font = '800 130px Manrope, system-ui, sans-serif';
  ctx.fillText(`${Math.round(o.opponentScore)}%`, cx + 250, panelY + 150);
  ctx.fillStyle = 'hsl(0 0% 100% / .6)'; ctx.font = '600 32px Manrope, system-ui, sans-serif';
  ctx.fillText('ME', cx - 250, panelY + 208);
  ctx.fillText((o.opponentFirstName?.trim() || 'CLASSMATE').toUpperCase().slice(0, 14), cx + 250, panelY + 208);

  ctx.fillStyle = 'hsl(0 0% 100% / .7)'; ctx.font = '600 36px Manrope, system-ui, sans-serif';
  ctx.fillText(`${o.totalQuestions}-question friend challenge`, cx, 1190);

  // Footer
  ctx.fillStyle = accent; ctx.font = '800 44px Manrope, system-ui, sans-serif';
  ctx.fillText(o.platformName, cx, 1265);
  ctx.fillStyle = 'hsl(0 0% 100% / .55)'; ctx.font = '500 28px Manrope, system-ui, sans-serif';
  ctx.fillText('Think you can beat me? Challenge a classmate.', cx, 1310);
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not create image'))), 'image/png'));
}

export function shareCaption(o: Pick<ShareCardOptions, 'verdict' | 'myScore' | 'opponentScore' | 'totalQuestions' | 'platformName' | 'opponentFirstName'>): string {
  const who = o.opponentFirstName?.trim() || 'a classmate';
  const line = o.verdict === 'win'
    ? `I just beat ${who} ${Math.round(o.myScore)}% to ${Math.round(o.opponentScore)}% in a ${o.totalQuestions}-question quiz challenge on ${o.platformName}!`
    : `${who === 'a classmate' ? 'A classmate' : who} and I tied ${Math.round(o.myScore)}% each in a ${o.totalQuestions}-question quiz challenge on ${o.platformName}!`;
  return `${line} Think you can beat me?`;
}
