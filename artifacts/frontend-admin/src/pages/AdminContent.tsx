// Academic content — blocks and the modules inside them (v37 rebuild).
//
// What changed vs. the old page:
//  * summary tiles, search, Published/Draft filter, expand/collapse all;
//  * block and module reordering now RENUMBERS the whole list (planReorder)
//    instead of swapping two displayOrder values — the old swap did nothing
//    when two rows shared an order number, and fired two racing requests;
//  * block thumbnails go through resolveUploadUrl (they used the raw URL, which
//    breaks when the admin app and the API are on different domains);
//  * responsive block header (it overflowed on phones).
// Behaviour and data-testid hooks of the old page are kept.
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { BookOpen, ChevronDown, ChevronRight, ChevronUp, EyeOff, FolderTree, GraduationCap, Layers, Library, ListTree, Pencil, Plus, Trash2 } from 'lucide-react';
import { getListModulesQueryKey } from '@workspace/api-client-react';
import { toast } from '@/hooks/use-toast';
import { ApiRequestError, blockAdminApi, moduleAdminApi, type AdminBlock, type AdminModule } from '@/lib/api';
import { AddModuleForm, BlockForm, ConfirmDialog, EmptyState, ModuleRow, SectionHeader, SkeletonPage, cn, groupByProgramYear } from '@/lib/shared';
import { Chip, SearchBox, StatTiles, Thumb, byOrder, planReorder } from '@/lib/admin-ui';
import { queryClient } from '@/lib/query-client';

type StatusFilter = 'all' | 'published' | 'draft';
type BlockLeaf = { key: string; kind: 'block'; block: AdminBlock; program: string | null; year: number | null };
type ModuleLeaf = { key: string; kind: 'module'; module: AdminModule; program: string | null; year: number | null };

const failToast = (title: string) => (err: unknown) => toast({ title, description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' });

function AdminContent() {
  const modulesQ = useQuery({ queryKey: ['admin-modules'], queryFn: moduleAdminApi.listAll });
  const blocksQ = useQuery({ queryKey: ['admin-blocks'], queryFn: blockAdminApi.listAll });
  const modules = [...(modulesQ.data ?? [])].sort(byOrder);
  const blocks = [...(blocksQ.data ?? [])].sort(byOrder);

  const invalidateModules = () => { queryClient.invalidateQueries({ queryKey: ['admin-modules'] }); queryClient.invalidateQueries({ queryKey: getListModulesQueryKey() }); };
  const invalidateBlocks = () => queryClient.invalidateQueries({ queryKey: ['admin-blocks'] });

  const createModule = useMutation({ mutationFn: moduleAdminApi.create, onSuccess: invalidateModules, onError: failToast('Could not create module') });
  const update = useMutation({ mutationFn: ({ id, body }: { id: number; body: Parameters<typeof moduleAdminApi.update>[1] }) => moduleAdminApi.update(id, body), onSuccess: invalidateModules, onError: failToast('Could not update module') });
  const removeModulePermanent = useMutation({ mutationFn: moduleAdminApi.removePermanent, onSuccess: () => { invalidateModules(); setDeletingId(null); }, onError: failToast('Could not delete module') });
  const createBlock = useMutation({ mutationFn: blockAdminApi.create, onSuccess: invalidateBlocks, onError: failToast('Could not create block') });
  const updateBlock = useMutation({ mutationFn: ({ id, body }: { id: number; body: Parameters<typeof blockAdminApi.update>[1] }) => blockAdminApi.update(id, body), onSuccess: invalidateBlocks, onError: failToast('Could not update block') });
  const removeBlockPermanent = useMutation({ mutationFn: blockAdminApi.removePermanent, onSuccess: () => { invalidateBlocks(); invalidateModules(); setDeletingBlockId(null); }, onError: failToast('Could not delete block') });
  // One request per row that actually moved, all awaited together.
  const reorderModules = useMutation({ mutationFn: (rows: { id: number; displayOrder: number }[]) => Promise.all(rows.map((r) => moduleAdminApi.update(r.id, { displayOrder: r.displayOrder }))), onSuccess: invalidateModules, onError: failToast('Could not reorder modules') });
  const reorderBlocks = useMutation({ mutationFn: (rows: { id: number; displayOrder: number }[]) => Promise.all(rows.map((r) => blockAdminApi.update(r.id, { displayOrder: r.displayOrder }))), onSuccess: invalidateBlocks, onError: failToast('Could not reorder blocks') });

  const [openBlockForm, setOpenBlockForm] = useState(false);
  const [editingBlockId, setEditingBlockId] = useState<number | null>(null);
  const [deletingBlockId, setDeletingBlockId] = useState<number | null>(null);
  const [openModuleFormFor, setOpenModuleFormFor] = useState<number | 'unassigned' | null>(null);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [yearOpen, setYearOpen] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editProgram, setEditProgram] = useState('');
  const [editYear, setEditYear] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [curriculumId, setCurriculumId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');

  const q = search.trim().toLowerCase();
  const filtering = !!q || status !== 'all';
  const matchesModule = (m: AdminModule) => (status === 'all' || (status === 'published') === m.active) && (!q || m.name.toLowerCase().includes(q));

  const modulesByBlock = new Map<number, AdminModule[]>();
  const unassigned: AdminModule[] = [];
  for (const m of modules) {
    if (m.blockId != null) { if (!modulesByBlock.has(m.blockId)) modulesByBlock.set(m.blockId, []); modulesByBlock.get(m.blockId)!.push(m); } else unassigned.push(m);
  }

  // What is visible under the current filters. A block stays if its own name
  // matches (all its modules show) or at least one of its modules matches.
  const visibleModules = (blockId: number, blockName: string): AdminModule[] => {
    const list = modulesByBlock.get(blockId) ?? [];
    if (!filtering) return list;
    if (q && blockName.toLowerCase().includes(q) && status === 'all') return list;
    return list.filter(matchesModule);
  };

  const blockLeaves: BlockLeaf[] = blocks.flatMap((b): BlockLeaf[] => {
    const list = modulesByBlock.get(b.id) ?? [];
    if (filtering && !visibleModules(b.id, b.name).length && !(q && b.name.toLowerCase().includes(q) && status === 'all')) return [];
    const fallback = list.find((m) => m.programTargetKind || m.yearTargetNumber);
    return [{ key: `block-${b.id}`, kind: 'block', block: b, program: b.programTargetKind || fallback?.programTargetKind || null, year: b.yearTargetNumber ?? fallback?.yearTargetNumber ?? null }];
  });
  const standaloneLeaves: ModuleLeaf[] = unassigned.filter((m) => !filtering || matchesModule(m)).map((m) => ({ key: `module-${m.id}`, kind: 'module', module: m, program: m.programTargetKind || null, year: m.yearTargetNumber ?? null }));
  const yearGroups = groupByProgramYear<BlockLeaf | ModuleLeaf>([...blockLeaves, ...standaloneLeaves]);

  const loading = modulesQ.isLoading || blocksQ.isLoading;
  const totals = {
    blocks: blocks.length,
    modules: modules.length,
    subjects: modules.reduce((n, m) => n + (m.subjectCount ?? 0), 0),
    topics: modules.reduce((n, m) => n + (m.topicCount ?? 0), 0),
    drafts: modules.filter((m) => !m.active).length,
  };
  const allYearKeys = yearGroups.map((g) => `${g.programLabel}-${g.yearLabel}`);

  const toggleIn = <T,>(set: Set<T>, value: T): Set<T> => { const next = new Set(set); if (next.has(value)) next.delete(value); else next.add(value); return next; };

  const moveModule = (group: AdminModule[], m: AdminModule, dir: -1 | 1) => {
    const plan = planReorder(modules, group, m.id, dir);
    if (plan.length && !reorderModules.isPending) reorderModules.mutate(plan);
  };
  const moveBlock = (group: AdminBlock[], b: AdminBlock, dir: -1 | 1) => {
    const plan = planReorder(blocks, group, b.id, dir);
    if (plan.length && !reorderBlocks.isPending) reorderBlocks.mutate(plan);
  };

  // `group` = the unfiltered siblings the arrows reorder within. Reordering is
  // switched off while a search/filter hides some of them, so what you move is
  // always what you see.
  const renderModuleGroup = (visible: AdminModule[], group: AdminModule[]) => visible.map((m) => {
    const i = group.findIndex((x) => x.id === m.id);
    return <ModuleRow key={m.id} m={m} canMoveUp={!filtering && i > 0} canMoveDown={!filtering && i >= 0 && i < group.length - 1} onReorder={(dir) => moveModule(group, m, dir === 'up' ? -1 : 1)}
      update={update} curriculumId={curriculumId} setCurriculumId={setCurriculumId} editingId={editingId} setEditingId={setEditingId}
      editProgram={editProgram} setEditProgram={setEditProgram} editYear={editYear} setEditYear={setEditYear} setDeletingId={setDeletingId} />;
  });

  const renderBlockCard = (b: AdminBlock, siblings: AdminBlock[]) => {
    const all = modulesByBlock.get(b.id) ?? [];
    const visible = visibleModules(b.id, b.name);
    const bi = siblings.findIndex((x) => x.id === b.id);
    const isCollapsed = !filtering && collapsed.has(b.id);
    const published = all.filter((m) => m.active).length;
    return <div key={b.id} className="overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-2xs)]" data-testid={`section-block-${b.id}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3.5 sm:p-4">
        <button onClick={() => setCollapsed((s) => toggleIn(s, b.id))} className="rounded-lg p-1 text-muted-foreground hover:bg-muted" aria-label={isCollapsed ? 'Expand block' : 'Collapse block'} data-testid={`button-toggle-block-${b.id}`}><ChevronRight size={16} className={cn('transition-transform', !isCollapsed && 'rotate-90')} /></button>
        <Thumb url={b.iconUrl} icon={Library} size={40} />
        <div className="min-w-[8rem] flex-1">
          <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-extrabold" data-testid={`text-block-name-${b.id}`}>{b.name}</span>{!b.active && <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground"><EyeOff size={10} /> hidden</span>}</div>
          {b.subtitle && <div className="text-xs text-muted-foreground">{b.subtitle}</div>}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
          <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">{all.length} module{all.length === 1 ? '' : 's'}</span>
          {all.length > 0 && <span className={cn('rounded-full px-2.5 py-1', published === all.length ? 'bg-primary/15 text-primary' : 'bg-accent/20 text-accent-text')}>{published}/{all.length} published</span>}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <div className="flex flex-col"><button onClick={() => moveBlock(siblings, b, -1)} disabled={filtering || bi <= 0 || reorderBlocks.isPending} className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-25" aria-label="Move block up" data-testid={`button-block-move-up-${b.id}`}><ChevronUp size={13} /></button><button onClick={() => moveBlock(siblings, b, 1)} disabled={filtering || bi < 0 || bi === siblings.length - 1 || reorderBlocks.isPending} className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-25" aria-label="Move block down" data-testid={`button-block-move-down-${b.id}`}><ChevronDown size={13} /></button></div>
          <button onClick={() => setOpenModuleFormFor(openModuleFormFor === b.id ? null : b.id)} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-[11px] font-bold text-muted-foreground hover:bg-muted" data-testid={`button-add-module-to-block-${b.id}`}><Plus size={12} /> Module</button>
          <button onClick={() => setEditingBlockId(editingBlockId === b.id ? null : b.id)} className="rounded-lg p-2 text-muted-foreground hover:bg-muted" aria-label="Edit block" data-testid={`button-edit-block-${b.id}`}><Pencil size={15} /></button>
          <button onClick={() => setDeletingBlockId(b.id)} className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Delete block" data-testid={`button-delete-block-${b.id}`}><Trash2 size={15} /></button>
        </div>
      </div>
      {editingBlockId === b.id && <div className="border-t border-border p-4"><BlockForm initial={b} pending={updateBlock.isPending} onCancel={() => setEditingBlockId(null)} onSubmit={(body) => updateBlock.mutate({ id: b.id, body }, { onSuccess: () => setEditingBlockId(null) })} /></div>}
      {!isCollapsed && <div className="border-t border-border">
        {openModuleFormFor === b.id && <div className="p-4"><AddModuleForm blockId={b.id} onCreate={createModule} onDone={() => setOpenModuleFormFor(null)} /></div>}
        {visible.length ? renderModuleGroup(visible, all) : <p className="p-5 text-xs text-muted-foreground">{all.length ? 'No modules match the current filters.' : 'No modules in this block yet — use “+ Module” above to add one.'}</p>}
      </div>}
    </div>;
  };

  return <div>
    <SectionHeader eyebrow="Curriculum operations" title="Academic content" action={<div className="flex flex-wrap gap-2">
      <button onClick={() => setOpenBlockForm(true)} className="btn-pop inline-flex items-center gap-2 rounded-xl border border-primary/40 bg-card px-4 py-2.5 text-xs font-extrabold text-primary" data-testid="button-create-block"><Plus size={15} /> Add block</button>
      <button onClick={() => setOpenModuleFormFor('unassigned')} className="btn-pop inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-foreground" data-testid="button-create-module"><Plus size={15} /> Add module</button>
    </div>} />
    {openBlockForm && <BlockForm pending={createBlock.isPending} onCancel={() => setOpenBlockForm(false)} onSubmit={(body) => createBlock.mutate(body, { onSuccess: () => setOpenBlockForm(false) })} />}

    {loading ? <SkeletonPage /> : <>
      <StatTiles items={[
        { label: 'Blocks', value: totals.blocks, icon: Library, tone: 'green', testId: 'stat-blocks' },
        { label: 'Modules', value: totals.modules, icon: BookOpen, tone: 'blue', testId: 'stat-modules' },
        { label: 'Subjects', value: totals.subjects, icon: Layers, tone: 'violet', testId: 'stat-subjects' },
        { label: 'Topics', value: totals.topics, icon: ListTree, tone: 'amber', testId: 'stat-topics' },
        { label: 'Drafts', value: totals.drafts, icon: EyeOff, tone: totals.drafts ? 'amber' : 'neutral', hint: 'Modules students cannot see yet', testId: 'stat-drafts' },
      ]} />

      <div className="mb-4 flex flex-wrap items-center gap-2.5 rounded-2xl border border-border bg-card p-3">
        <SearchBox value={search} onChange={setSearch} placeholder="Search blocks and modules…" testId="input-search-content" className="min-w-[14rem] flex-1 sm:max-w-xs" />
        <div className="flex flex-wrap items-center gap-1.5">
          {([['all', 'All'], ['published', 'Published'], ['draft', 'Draft']] as Array<[StatusFilter, string]>).map(([key, label]) => <Chip key={key} active={status === key} onClick={() => setStatus(key)} testId={`chip-status-${key}`}>{label}</Chip>)}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={() => { setYearOpen(new Set(allYearKeys)); setCollapsed(new Set()); }} className="rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-muted-foreground hover:bg-muted" data-testid="button-expand-all">Expand all</button>
          <button onClick={() => { setYearOpen(new Set()); setCollapsed(new Set(blocks.map((b) => b.id))); }} className="rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-muted-foreground hover:bg-muted" data-testid="button-collapse-all">Collapse all</button>
        </div>
        {filtering && <p className="basis-full text-[11px] text-muted-foreground">Filtered view — reordering is switched off until you clear the search/filter.</p>}
      </div>

      {(!blocks.length && !modules.length) ? <EmptyState icon={Library} title="No modules yet" body="Add your first block or module above to start building the curriculum." />
        : filtering && !yearGroups.length ? <EmptyState icon={FolderTree} title="Nothing matches" body="No blocks or modules fit that search and status. Clear the filters to see everything." action={<button onClick={() => { setSearch(''); setStatus('all'); }} className="rounded-xl bg-primary px-4 py-2 text-xs font-extrabold text-primary-foreground">Clear filters</button>} />
        : <div className="space-y-5">
          {openModuleFormFor === 'unassigned' && <div className="rounded-2xl border border-border bg-card p-4"><AddModuleForm blockId={null} onCreate={createModule} onDone={() => setOpenModuleFormFor(null)} /></div>}
          {yearGroups.map(({ programLabel, yearLabel, groups }) => {
            const groupKey = `${programLabel}-${yearLabel}`;
            const isOpen = filtering || yearOpen.has(groupKey);
            const blockGroups = groups.filter((g): g is BlockLeaf => g.kind === 'block');
            const moduleGroups = groups.filter((g): g is ModuleLeaf => g.kind === 'module');
            const siblings = blockGroups.map((g) => g.block);
            const totalModules = blockGroups.reduce((n, g) => n + (modulesByBlock.get(g.block.id)?.length ?? 0), 0) + moduleGroups.length;
            return <div key={groupKey} className="overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-2xs)]" data-testid={`section-year-${groupKey}`}>
              <button type="button" onClick={() => setYearOpen((s) => toggleIn(s, groupKey))} className="flex w-full items-center gap-3 p-4 text-left hover:bg-muted/40" data-testid={`button-toggle-year-${groupKey}`}>
                <ChevronRight size={18} className={cn('shrink-0 text-primary transition-transform', isOpen && 'rotate-90')} />
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><GraduationCap size={16} /></span>
                <span className="flex-1 text-sm font-extrabold" data-testid={`text-year-group-${groupKey}`}>{programLabel} <span className="font-normal text-muted-foreground">· {yearLabel}</span></span>
                <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-bold text-muted-foreground">{blockGroups.length} block{blockGroups.length === 1 ? '' : 's'} · {totalModules} module{totalModules === 1 ? '' : 's'}</span>
              </button>
              {isOpen && <div className="space-y-4 border-t border-border bg-muted/20 p-3 sm:p-4">
                {blockGroups.map((g) => renderBlockCard(g.block, siblings))}
                {!!moduleGroups.length && <div className="overflow-hidden rounded-2xl border border-dashed border-border bg-card" data-testid={`section-year-unassigned-${groupKey}`}>
                  <div className="p-4 text-sm font-extrabold text-muted-foreground">Modules not in a block</div>
                  <div className="border-t border-border">{renderModuleGroup(moduleGroups.map((g) => g.module), moduleGroups.map((g) => g.module))}</div>
                </div>}
              </div>}
            </div>;
          })}
        </div>}
    </>}

    {deletingId !== null && <ConfirmDialog title="Permanently delete this module?" body="This erases the module and its subjects/topics for good — MCQs and flashcards filed under it stay in their banks, just unassigned. There is no undo." confirmLabel="Delete forever" onCancel={() => setDeletingId(null)} onConfirm={() => removeModulePermanent.mutate(deletingId)} pending={removeModulePermanent.isPending} />}
    {deletingBlockId !== null && <ConfirmDialog title="Permanently delete this block?" body="Modules inside it are kept — they move to Unassigned, not deleted. There is no undo for the block itself." confirmLabel="Delete forever" onCancel={() => setDeletingBlockId(null)} onConfirm={() => removeBlockPermanent.mutate(deletingBlockId)} pending={removeBlockPermanent.isPending} />}
  </div>;
}

export default AdminContent;
