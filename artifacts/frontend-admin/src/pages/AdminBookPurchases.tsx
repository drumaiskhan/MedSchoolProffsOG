// New page (client decision: paid-book payments get their own review
// queue, separate from the membership Payments & collection hub) — mirrors
// PaymentProofsTab's approve/reject pattern in lib/shared.tsx, just against
// med_book_purchases instead of med_payments. See routes/books.ts on the
// backend for the submit/approve/reject routes this talks to.
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCircle2, X, FileText, BookOpen, PauseCircle, PlayCircle, Trash2 } from 'lucide-react';
import { SectionHeader, EmptyState, Badge, ConfirmDialog, cn, money } from '@/lib/shared';
import { bookPurchasesAdminApi, resolveUploadUrl, ApiRequestError, type AdminBookPurchase } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { queryClient } from '@/lib/query-client';

const FILTERS: Array<{ key: string; label: string }> = [{ key: 'all', label: 'all' }, { key: 'PAYMENT_PENDING_REVIEW', label: 'pending' }, { key: 'approved', label: 'approved' }, { key: 'suspended', label: 'suspended' }, { key: 'rejected', label: 'rejected' }];
const isImage = (url: string) => /\.(png|jpe?g|webp)$/i.test(url);

function AdminBookPurchases() {
  const q = useQuery({ queryKey: ['admin-book-purchases'], queryFn: bookPurchasesAdminApi.list });
  const [filter, setFilter] = useState('all');
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [approvingId, setApprovingId] = useState<number | null>(null);
  const [suspendingId, setSuspendingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const purchases = (q.data ?? []).filter((p) => filter === 'all' || p.status === filter);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-book-purchases'] });

  const approve = useMutation({
    mutationFn: (id: number) => bookPurchasesAdminApi.approve(id),
    onSuccess: () => { invalidate(); setApprovingId(null); toast({ title: 'Purchase approved', description: "Student's access unlocks immediately." }); },
    onError: (err: unknown) => toast({ title: 'Could not approve', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }),
  });
  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => bookPurchasesAdminApi.reject(id, reason),
    onSuccess: () => { invalidate(); setRejectingId(null); setReason(''); toast({ title: 'Purchase rejected' }); },
    onError: (err: unknown) => toast({ title: 'Could not reject', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }),
  });
  const suspend = useMutation({
    mutationFn: (id: number) => bookPurchasesAdminApi.suspend(id),
    onSuccess: () => { invalidate(); setSuspendingId(null); toast({ title: 'Access suspended', description: "The student's access to this book is revoked until reactivated." }); },
    onError: (err: unknown) => toast({ title: 'Could not suspend', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }),
  });
  const reactivate = useMutation({
    mutationFn: (id: number) => bookPurchasesAdminApi.reactivate(id),
    onSuccess: () => { invalidate(); toast({ title: 'Access reactivated' }); },
    onError: (err: unknown) => toast({ title: 'Could not reactivate', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }),
  });
  const remove = useMutation({
    mutationFn: (id: number) => bookPurchasesAdminApi.remove(id),
    onSuccess: () => { invalidate(); setDeletingId(null); toast({ title: 'Purchase deleted' }); },
    onError: (err: unknown) => toast({ title: 'Could not delete', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }),
  });

  const approvingPurchase = approvingId !== null ? purchases.find((p) => p.id === approvingId) : undefined;
  const suspendingPurchase = suspendingId !== null ? purchases.find((p) => p.id === suspendingId) : undefined;
  const deletingPurchase = deletingId !== null ? purchases.find((p) => p.id === deletingId) : undefined;
  const statusTone = (s: string) => s === 'approved' ? 'green' : s === 'rejected' || s === 'suspended' ? 'red' : 'amber';

  return <div><SectionHeader eyebrow="Question banks" title="Book purchase requests" />
    <p className="mb-4 text-xs text-muted-foreground">Separate from membership payments — approving here unlocks only the one book a student paid for.</p>
    <div className="mb-4 flex justify-end"><div className="flex rounded-xl border border-border bg-card p-1">{FILTERS.map((f) => <button key={f.key} onClick={() => setFilter(f.key)} className={cn('rounded-lg px-3 py-1.5 text-[11px] font-bold capitalize', filter === f.key && 'bg-muted text-primary')} data-testid={`button-book-purchase-filter-${f.label}`}>{f.label}</button>)}</div></div>
    <div className="space-y-3">{purchases.map((p: AdminBookPurchase) => <div key={p.id} className="rounded-2xl border border-border bg-card p-5" data-testid={`card-book-purchase-${p.id}`}>
      <div className="flex flex-col gap-4 md:flex-row md:items-start">
        <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><BookOpen size={19} /></div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-bold">{p.user?.name ?? 'Unknown student'}</span><Badge tone={statusTone(p.status)}>{p.status === 'PAYMENT_PENDING_REVIEW' ? 'pending' : p.status}</Badge></div>
          <div className="mt-1 text-xs text-muted-foreground">{p.bookTitle}{p.user?.email ? ` · ${p.user.email}` : ''}</div>
          <div className="mt-2 font-mono-app text-[10px] text-muted-foreground">{p.method} · {p.reference} · {p.paymentDate}</div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-4">
          <div className="text-right"><div className="font-display text-2xl">{money(p.amount, p.currency)}</div><div className="text-[10px] text-muted-foreground">Submitted {p.submittedAt.slice(0, 10)}</div></div>
          <div className="flex flex-wrap justify-end gap-2">
            {p.status === 'PAYMENT_PENDING_REVIEW' && <>
              <button onClick={() => setRejectingId(rejectingId === p.id ? null : p.id)} className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-[11px] font-bold text-destructive hover:bg-destructive/10" data-testid={`button-reject-book-purchase-${p.id}`}><X size={14} /> Reject</button>
              <button onClick={() => setApprovingId(p.id)} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-[11px] font-extrabold text-primary-foreground shadow-sm hover:opacity-90" data-testid={`button-approve-book-purchase-${p.id}`}><CheckCircle2 size={14} /> Approve</button>
            </>}
            {p.status === 'approved' && <button onClick={() => setSuspendingId(p.id)} className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-[11px] font-bold text-accent-text hover:bg-accent/15" data-testid={`button-suspend-book-purchase-${p.id}`}><PauseCircle size={14} /> Suspend access</button>}
            {p.status === 'suspended' && <button onClick={() => reactivate.mutate(p.id)} disabled={reactivate.isPending} className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-[11px] font-bold text-primary hover:bg-primary/10 disabled:opacity-50" data-testid={`button-reactivate-book-purchase-${p.id}`}><PlayCircle size={14} /> Reactivate</button>}
            <button onClick={() => setDeletingId(p.id)} className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-[11px] font-bold text-muted-foreground hover:border-destructive hover:text-destructive" data-testid={`button-delete-book-purchase-${p.id}`}><Trash2 size={14} /> Delete</button>
          </div>
        </div>
      </div>
      {p.proofPath && (() => { const url = resolveUploadUrl(p.proofPath)!; return <div className="mt-4 border-t border-border pt-4">{isImage(p.proofPath!) ? <a href={url} target="_blank" rel="noreferrer" data-testid={`link-book-purchase-proof-${p.id}`}><img src={url} alt="Payment proof" loading="lazy" decoding="async" className="max-h-64 rounded-xl border border-border object-contain" /></a> : <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-border bg-muted px-3 py-2 text-xs font-bold" data-testid={`link-book-purchase-proof-${p.id}`}><FileText size={14} /> View payment proof</a>}</div>; })()}
      {p.rejectionReason && <p className="mt-3 text-[11px] font-bold text-destructive">{p.status === 'suspended' ? 'Suspended' : 'Rejected'}: {p.rejectionReason}</p>}
      {rejectingId === p.id && <div className="mt-4 flex gap-2 border-t border-border pt-4"><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for rejection (shown to student)" className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-xs" data-testid={`input-reject-book-purchase-reason-${p.id}`} /><button onClick={() => reason.trim() && reject.mutate({ id: p.id, reason: reason.trim() })} disabled={!reason.trim() || reject.isPending} className="rounded-lg bg-destructive px-4 text-xs font-bold text-destructive-foreground disabled:opacity-50" data-testid={`button-confirm-reject-book-purchase-${p.id}`}>Confirm reject</button></div>}
    </div>)}{!purchases.length && <EmptyState icon={BookOpen} title="Queue is clear" body="No book purchase submissions match this filter." />}</div>
    {approvingPurchase && <ConfirmDialog title="Approve this purchase?" body={`This confirms ${money(approvingPurchase.amount, approvingPurchase.currency)} from ${approvingPurchase.user?.name ?? 'this student'} for "${approvingPurchase.bookTitle}" and unlocks just that book for them.`} confirmLabel="Approve purchase" pendingLabel="Approving…" tone="primary" testId="approve-book-purchase" onCancel={() => setApprovingId(null)} onConfirm={() => approve.mutate(approvingPurchase.id)} pending={approve.isPending} />}
    {suspendingPurchase && <ConfirmDialog title="Suspend this student's access?" body={`${suspendingPurchase.user?.name ?? 'This student'} will immediately lose access to "${suspendingPurchase.bookTitle}" in the secure reader. The payment record stays — you can reactivate at any time.`} confirmLabel="Suspend access" pendingLabel="Suspending…" tone="destructive" testId="suspend-book-purchase" onCancel={() => setSuspendingId(null)} onConfirm={() => suspend.mutate(suspendingPurchase.id)} pending={suspend.isPending} />}
    {deletingPurchase && <ConfirmDialog title="Delete this purchase record?" body={`This permanently removes ${deletingPurchase.user?.name ?? 'this student'}'s "${deletingPurchase.bookTitle}" purchase — including access if it was approved. This can't be undone; use Suspend instead if you just want to pause access.`} confirmLabel="Delete permanently" pendingLabel="Deleting…" tone="destructive" testId="delete-book-purchase" onCancel={() => setDeletingId(null)} onConfirm={() => remove.mutate(deletingPurchase.id)} pending={remove.isPending} />}
  </div>;
}

export default AdminBookPurchases;
