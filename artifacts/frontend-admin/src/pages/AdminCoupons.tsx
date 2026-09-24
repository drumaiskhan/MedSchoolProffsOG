// New page (client request: "add Coupon code") — manages med_coupons,
// discount codes that apply to membership-plan purchases only (see the
// comment on couponsTable in schema/medschool.ts for why: this app has no
// live payment gateway, payment is a manual proof-review flow, so a
// coupon just discounts the amount a student is told to pay and gets
// recorded on their payment row for the admin reviewing it — see
// routes/coupons.ts and lib/coupons.ts on the backend).
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Plus, Percent, Trash2, Copy } from 'lucide-react';
import { SectionHeader, EmptyState, ConfirmDialog, cn } from '@/lib/shared';
import { couponsAdminApi, ApiRequestError, type AdminCoupon } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { queryClient } from '@/lib/query-client';

function AdminCoupons() {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [discountType, setDiscountType] = useState<'percent' | 'fixed'>('percent');
  const [discountValue, setDiscountValue] = useState('');
  const [maxUses, setMaxUses] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const couponsQ = useQuery({ queryKey: ['admin-coupons'], queryFn: couponsAdminApi.list });
  const coupons = couponsQ.data ?? [];
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-coupons'] });

  const create = useMutation({
    mutationFn: () => couponsAdminApi.create({
      code: code.trim(), discountType, discountValue: Number(discountValue),
      maxUses: maxUses ? Number(maxUses) : null,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    }),
    onSuccess: () => { invalidate(); setOpen(false); setCode(''); setDiscountValue(''); setMaxUses(''); setExpiresAt(''); toast({ title: 'Coupon created' }); },
    onError: (err: unknown) => toast({ title: 'Could not create coupon', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) => couponsAdminApi.update(id, { active }),
    onSuccess: invalidate,
    onError: (err: unknown) => toast({ title: 'Could not update coupon', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }),
  });

  const remove = useMutation({
    mutationFn: (id: number) => couponsAdminApi.remove(id),
    onSuccess: () => { invalidate(); setDeletingId(null); toast({ title: 'Coupon deleted' }); },
    onError: (err: unknown) => toast({ title: 'Could not delete coupon', description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' }),
  });

  const copyCode = (c: string) => { navigator.clipboard?.writeText(c); toast({ title: 'Code copied' }); };

  return <div><SectionHeader eyebrow="Subscription plans" title="Coupon codes" action={<button onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-foreground" data-testid="button-toggle-add-coupon"><Plus size={15} /> {open ? 'Close' : 'New coupon'}</button>} />
    <p className="mb-5 text-xs text-muted-foreground">Coupons discount a membership plan's price at checkout. They never apply to books — books have no separate purchase.</p>
    {open && <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="mb-5 space-y-3 rounded-2xl border border-border bg-card p-5">
      <div className="grid gap-2 sm:grid-cols-2">
        <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="CODE e.g. WELCOME20" required className="h-10 rounded-xl border border-border bg-background px-3 text-xs font-mono-app uppercase" data-testid="input-coupon-code" />
        <select value={discountType} onChange={(e) => setDiscountType(e.target.value as 'percent' | 'fixed')} className="h-10 rounded-xl border border-border bg-background px-3 text-xs" data-testid="select-coupon-discount-type">
          <option value="percent">Percent off</option>
          <option value="fixed">Fixed amount off</option>
        </select>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <input value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} type="number" min="0" max={discountType === 'percent' ? 100 : undefined} step="0.01" required placeholder={discountType === 'percent' ? 'e.g. 20 for 20%' : 'e.g. 500'} className="h-10 rounded-xl border border-border bg-background px-3 text-xs" data-testid="input-coupon-value" />
        <input value={maxUses} onChange={(e) => setMaxUses(e.target.value)} type="number" min="1" placeholder="Max uses (optional)" className="h-10 rounded-xl border border-border bg-background px-3 text-xs" data-testid="input-coupon-max-uses" />
        <input value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} type="date" placeholder="Expires (optional)" className="h-10 rounded-xl border border-border bg-background px-3 text-xs" data-testid="input-coupon-expires" />
      </div>
      <button type="submit" disabled={create.isPending || !code.trim() || !discountValue} className="rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground disabled:opacity-50" data-testid="button-submit-coupon">{create.isPending ? 'Creating…' : 'Create coupon'}</button>
    </form>}
    {coupons.length ? <div className="overflow-x-auto rounded-2xl border border-border bg-card">
      <table className="w-full min-w-[640px] text-left text-xs">
        <thead className="bg-muted text-[10px] uppercase tracking-[.12em] text-muted-foreground"><tr><th className="px-5 py-3">Code</th><th className="px-5 py-3">Discount</th><th className="px-5 py-3">Uses</th><th className="px-5 py-3">Expires</th><th className="px-5 py-3">Status</th><th className="px-5 py-3" /></tr></thead>
        <tbody>{coupons.map((c: AdminCoupon) => <tr key={c.id} className="border-t border-border" data-testid={`row-coupon-${c.id}`}>
          <td className="px-5 py-4"><button onClick={() => copyCode(c.code)} className="inline-flex items-center gap-1.5 font-mono-app text-[11px] font-bold hover:text-primary" data-testid={`button-copy-coupon-${c.id}`}>{c.code} <Copy size={11} /></button></td>
          <td className="px-5 py-4">{c.discountType === 'percent' ? `${c.discountValue}%` : `Rs. ${c.discountValue}`} off</td>
          <td className="px-5 py-4">{c.usedCount}{c.maxUses != null ? ` / ${c.maxUses}` : ''}</td>
          <td className="px-5 py-4 text-muted-foreground">{c.expiresAt ? new Date(c.expiresAt).toLocaleDateString() : 'Never'}</td>
          <td className="px-5 py-4"><button onClick={() => toggleActive.mutate({ id: c.id, active: !c.active })} className={cn('rounded-full px-2 py-0.5 text-[10px] font-extrabold', c.active ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground')} data-testid={`button-toggle-coupon-${c.id}`}>{c.active ? 'Active' : 'Disabled'}</button></td>
          <td className="px-5 py-4"><button onClick={() => setDeletingId(c.id)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Delete coupon" data-testid={`button-delete-coupon-${c.id}`}><Trash2 size={14} /></button></td>
        </tr>)}</tbody>
      </table>
    </div> : <EmptyState icon={Percent} title="No coupons yet" body="Create one above to offer a discount on a membership plan." />}
    {deletingId !== null && <ConfirmDialog title="Delete this coupon?" body="Students will no longer be able to use this code. There is no undo." confirmLabel="Delete" onCancel={() => setDeletingId(null)} onConfirm={() => remove.mutate(deletingId)} pending={remove.isPending} />}
  </div>;
}

export default AdminCoupons;
