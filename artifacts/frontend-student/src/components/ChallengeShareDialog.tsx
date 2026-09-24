// "Share your win" dialog for a completed friend challenge: previews the
// result card, then shares it as an image (native share sheet when the
// device supports sharing files), or downloads / copies the caption.
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Copy, Download, Share2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { siteContentApi, type ChallengeSummary } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { canvasToBlob, drawChallengeShareCard, shareCaption, type ShareCardOptions } from '@/lib/challengeShareCard';

/** A result is shareable when it's finished and you won or tied (no card for a loss). */
export function shareableVerdict(c: ChallengeSummary): 'win' | 'tie' | null {
  if (c.status !== 'COMPLETED' || c.myScorePercent == null || c.opponentScorePercent == null) return null;
  if (c.myScorePercent > c.opponentScorePercent) return 'win';
  if (c.myScorePercent === c.opponentScorePercent) return 'tie';
  return null;
}

export function ChallengeShareDialog({ challenge, onClose }: { challenge: ChallengeSummary | null; onClose: () => void }) {
  const site = useQuery({ queryKey: ['site-content'], queryFn: siteContentApi.get, staleTime: 5 * 60_000 });
  const platformName = site.data?.PLATFORM_NAME || 'MedschoolProffs';
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showName, setShowName] = useState(false);
  const [busy, setBusy] = useState(false);
  const verdict = challenge ? shareableVerdict(challenge) : null;
  const firstName = challenge?.opponent?.name?.trim().split(/\s+/)[0] ?? null;

  const opts: ShareCardOptions | null = challenge && verdict ? {
    verdict, myScore: challenge.myScorePercent as number, opponentScore: challenge.opponentScorePercent as number,
    totalQuestions: challenge.totalQuestions, platformName, opponentFirstName: showName ? firstName : null, seed: challenge.id,
  } : null;

  // Redraw the preview whenever the card's inputs change (canvas mounts with the dialog, so wait a frame).
  useEffect(() => {
    if (!opts) return;
    const raf = requestAnimationFrame(() => { if (canvasRef.current) void drawChallengeShareCard(canvasRef.current, opts); });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challenge?.id, verdict, showName, platformName]);

  if (!challenge || !opts) return null;
  const caption = `${shareCaption(opts)} ${window.location.origin}`;

  const makeFile = async () => {
    if (!canvasRef.current) throw new Error('Card not ready');
    await drawChallengeShareCard(canvasRef.current, opts);
    const blob = await canvasToBlob(canvasRef.current);
    return new File([blob], `challenge-${challenge.id}.png`, { type: 'image/png' });
  };
  const download = async () => {
    setBusy(true);
    try {
      const file = await makeFile(); const url = URL.createObjectURL(file);
      const a = document.createElement('a'); a.href = url; a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { toast({ title: 'Could not save the image', variant: 'destructive' }); } finally { setBusy(false); }
  };
  const share = async () => {
    setBusy(true);
    try {
      const file = await makeFile();
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], text: caption });
      else if (navigator.share) await navigator.share({ text: caption });
      else { await download(); toast({ title: 'Image saved', description: 'Sharing isn’t supported here, so it was downloaded instead.' }); }
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') toast({ title: 'Could not share', description: 'Try saving the image instead.', variant: 'destructive' });
    } finally { setBusy(false); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(caption); toast({ title: 'Caption copied' }); } catch { toast({ title: 'Could not copy', variant: 'destructive' }); }
  };

  return <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
    <DialogContent className="max-h-[92dvh] max-w-md overflow-y-auto" data-testid="dialog-share-challenge">
      <DialogHeader>
        <DialogTitle>{verdict === 'win' ? 'Share your win' : 'Share this result'}</DialogTitle>
        <DialogDescription>A card you can post to your story or send to your group.</DialogDescription>
      </DialogHeader>
      <div className="mx-auto w-full max-w-[300px] overflow-hidden rounded-2xl border border-border shadow-lg">
        <canvas ref={canvasRef} className="block h-auto w-full" style={{ aspectRatio: '1080 / 1350' }} aria-label="Challenge result card" />
      </div>
      {firstName && <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold">
        <input type="checkbox" checked={showName} onChange={(e) => setShowName(e.target.checked)} className="size-4 accent-primary" data-testid="checkbox-share-name" />
        Show {firstName}’s first name on the card
      </label>}
      <div className="grid grid-cols-[1fr_auto_auto] gap-2">
        <button type="button" onClick={share} disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-xs font-extrabold text-primary-foreground disabled:opacity-60" data-testid="button-share-challenge"><Share2 size={14} /> Share</button>
        <button type="button" onClick={download} disabled={busy} aria-label="Download image" className="grid size-11 place-items-center rounded-xl border border-border hover:bg-muted disabled:opacity-60" data-testid="button-download-challenge-card"><Download size={15} /></button>
        <button type="button" onClick={copy} aria-label="Copy caption" className="grid size-11 place-items-center rounded-xl border border-border hover:bg-muted" data-testid="button-copy-challenge-caption"><Copy size={15} /></button>
      </div>
    </DialogContent>
  </Dialog>;
}
