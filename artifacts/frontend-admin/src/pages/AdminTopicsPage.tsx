// Topics (v37 rebuild): Program/Year → Subject tree with search, an "empty
// topics" filter (topics no MCQ points at yet), in-place add, BULK add (paste a
// list, one topic per line), inline rename and a reorder that renumbers the
// whole subject list. data-testid hooks of the old page are kept.
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CircleSlash, Layers, ListChecks, ListPlus, ListTree, Pencil, Trash2, GraduationCap } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { ApiRequestError, moduleAdminApi, subjectAdminApi, topicAdminApi, type AdminTopic } from '@/lib/api';
import { ConfirmDialog, EmptyState, SectionHeader, SkeletonPage, groupByProgramYear } from '@/lib/shared';
import { Chip, Group, MoveButtons, QuickAdd, SearchBox, StatTiles, byOrder, inputClass, planReorder } from '@/lib/admin-ui';
import { queryClient } from '@/lib/query-client';

const failToast = (title: string) => (err: unknown) => toast({ title, description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' });

function AdminTopicsPage() {
  const modulesQ = useQuery({ queryKey: ['admin-modules'], queryFn: moduleAdminApi.listAll });
  const subjectsQ = useQuery({ queryKey: ['admin-subjects-all'], queryFn: () => subjectAdminApi.list() });
  const topicsQ = useQuery({ queryKey: ['admin-topics-all'], queryFn: () => topicAdminApi.list() });
  const modules = modulesQ.data ?? [];
  const subjects = [...(subjectsQ.data ?? [])].sort(byOrder);
  const topics = topicsQ.data ?? [];
  const moduleOf = (id: number) => modules.find((m) => m.id === id);

  const [search, setSearch] = useState('');
  const [emptyOnly, setEmptyOnly] = useState(false);
  const [subjectFilter, setSubjectFilter] = useState<'all' | number>('all');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkSubjectId, setBulkSubjectId] = useState<number | ''>('');
  const [bulkText, setBulkText] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const invalidate = () => { queryClient.invalidateQueries({ queryKey: ['admin-topics-all'] }); queryClient.invalidateQueries({ queryKey: ['admin-topics'] }); queryClient.invalidateQueries({ queryKey: ['admin-subjects-all'] }); queryClient.invalidateQueries({ queryKey: ['admin-subjects'] }); queryClient.invalidateQueries({ queryKey: ['admin-modules'] }); };
  const createTopic = useMutation({ mutationFn: topicAdminApi.create, onSuccess: invalidate, onError: failToast('Could not create topic') });
  const updateTopic = useMutation({ mutationFn: ({ id, body }: { id: number; body: Parameters<typeof topicAdminApi.update>[1] }) => topicAdminApi.update(id, body), onSuccess: () => { invalidate(); setEditingId(null); }, onError: failToast('Could not update topic') });
  const removeTopic = useMutation({ mutationFn: topicAdminApi.remove, onSuccess: () => { invalidate(); setDeletingId(null); }, onError: failToast('Could not delete topic') });
  const reorderTopics = useMutation({ mutationFn: (rows: { id: number; displayOrder: number }[]) => Promise.all(rows.map((r) => topicAdminApi.update(r.id, { displayOrder: r.displayOrder }))), onSuccess: invalidate, onError: failToast('Could not reorder topics') });
  // Sequential on purpose so the pasted order is the saved order.
  const bulkCreate = useMutation({
    mutationFn: async ({ subjectId, names, startOrder }: { subjectId: number; names: string[]; startOrder: number }) => {
      let created = 0;
      for (const [i, name] of names.entries()) { await topicAdminApi.create({ subjectId, name, active: true, displayOrder: startOrder + i }); created += 1; }
      return created;
    },
    onSuccess: (n) => { invalidate(); setBulkText(''); toast({ title: `${n} topic${n === 1 ? '' : 's'} added` }); },
    onError: (err) => { invalidate(); failToast('Bulk add stopped part-way')(err); },
  });

  const q = search.trim().toLowerCase();
  const filtering = !!q || emptyOnly || subjectFilter !== 'all';
  const bySubject = new Map<number, AdminTopic[]>();
  for (const t of topics) { if (!bySubject.has(t.subjectId)) bySubject.set(t.subjectId, []); bySubject.get(t.subjectId)!.push(t); }
  for (const list of bySubject.values()) list.sort(byOrder);
  const visibleIn = (subjectId: number, subjectName: string) => (bySubject.get(subjectId) ?? []).filter((t) => (!emptyOnly || t.questionCount === 0) && (!q || t.name.toLowerCase().includes(q) || subjectName.toLowerCase().includes(q)));

  const shownSubjects = subjects.filter((s) => (subjectFilter === 'all' || s.id === subjectFilter) && (!(q || emptyOnly) || visibleIn(s.id, s.name).length > 0));
  const yearGroups = groupByProgramYear(shownSubjects.map((s) => ({ key: s.id, program: moduleOf(s.moduleId)?.programTargetKind ?? null, year: moduleOf(s.moduleId)?.yearTargetNumber ?? null })));
  const toggle = (key: string) => setOpen((set) => { const next = new Set(set); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const allKeys = [...yearGroups.map((g) => `y-${g.programLabel}-${g.yearLabel}`), ...shownSubjects.map((s) => `s-${s.id}`)];

  const move = (subjectId: number, id: number, dir: -1 | 1) => {
    const list = bySubject.get(subjectId) ?? [];
    const plan = planReorder(list, list, id, dir);
    if (plan.length && !reorderTopics.isPending) reorderTopics.mutate(plan);
  };

  const bulkNames = [...new Set(bulkText.split('\n').map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter(Boolean))];
  const existingNames = new Set((bySubject.get(Number(bulkSubjectId)) ?? []).map((t) => t.name.toLowerCase()));
  const bulkFresh = bulkNames.filter((n) => !existingNames.has(n.toLowerCase()));
  const bulkSkipped = bulkNames.length - bulkFresh.length;

  const emptyTopics = topics.filter((t) => t.questionCount === 0).length;
  const totalMcqs = topics.reduce((n, t) => n + t.questionCount, 0);
  const subjectsWithTopics = new Set(topics.map((t) => t.subjectId)).size;

  if (modulesQ.isLoading || subjectsQ.isLoading || topicsQ.isLoading) return <div><SectionHeader eyebrow="Curriculum operations" title="Topics" /><SkeletonPage /></div>;

  return <div>
    <SectionHeader eyebrow="Curriculum operations" title="Topics" action={<button onClick={() => setBulkOpen((v) => !v)} className="btn-pop inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-foreground" data-testid="button-toggle-bulk-topics"><ListPlus size={15} /> {bulkOpen ? 'Close bulk add' : 'Bulk add topics'}</button>} />
    <StatTiles items={[
      { label: 'Topics', value: topics.length, icon: ListTree, tone: 'green', testId: 'stat-topics' },
      { label: 'Subjects with topics', value: `${subjectsWithTopics}/${subjects.length}`, icon: Layers, tone: 'blue' },
      { label: 'MCQs tagged', value: totalMcqs.toLocaleString(), icon: ListChecks, tone: 'violet' },
      { label: 'Empty topics', value: emptyTopics, icon: CircleSlash, tone: emptyTopics ? 'amber' : 'neutral', hint: 'Topics no MCQ is filed under yet' },
    ]} />

    {bulkOpen && <form onSubmit={(e) => { e.preventDefault(); if (bulkSubjectId && bulkFresh.length) bulkCreate.mutate({ subjectId: Number(bulkSubjectId), names: bulkFresh, startOrder: (bySubject.get(Number(bulkSubjectId)) ?? []).length }); }} className="mb-5 space-y-3 rounded-2xl border border-primary/30 bg-primary/5 p-4 sm:p-5">
      <div><div className="text-xs font-extrabold">Bulk add topics</div><p className="mt-0.5 text-[11px] text-muted-foreground">Paste one topic per line — bullets and numbering are stripped, duplicates and topics the subject already has are skipped.</p></div>
      <select required value={bulkSubjectId} onChange={(e: { target: { value: string } }) => setBulkSubjectId(e.target.value ? Number(e.target.value) : '')} className={inputClass} data-testid="select-bulk-topic-subject"><option value="">Choose a subject…</option>{subjects.map((s) => <option key={s.id} value={s.id}>{moduleOf(s.moduleId)?.name ? `${moduleOf(s.moduleId)!.name} — ` : ''}{s.name}</option>)}</select>
      <textarea value={bulkText} onChange={(e: { target: { value: string } }) => setBulkText(e.target.value)} rows={6} placeholder={'Brachial plexus\nCarpal tunnel\nCubital fossa'} className={`${inputClass} h-auto py-2.5 font-mono-app`} data-testid="input-bulk-topics" />
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={bulkCreate.isPending || !bulkSubjectId || !bulkFresh.length} className="btn-pop rounded-xl bg-primary px-4 py-2 text-xs font-extrabold text-primary-foreground disabled:opacity-50" data-testid="button-bulk-add-topics">{bulkCreate.isPending ? 'Adding…' : `Add ${bulkFresh.length || ''} topic${bulkFresh.length === 1 ? '' : 's'}`}</button>
        {bulkNames.length > 0 && <span className="text-[11px] text-muted-foreground">{bulkFresh.length} new{bulkSkipped ? ` · ${bulkSkipped} skipped (already exist)` : ''}</span>}
      </div>
    </form>}

    <div className="mb-4 flex flex-wrap items-center gap-2.5 rounded-2xl border border-border bg-card p-3">
      <SearchBox value={search} onChange={setSearch} placeholder="Search topics or subjects…" testId="input-search-topics" className="min-w-[14rem] flex-1 sm:max-w-xs" />
      <select value={subjectFilter} onChange={(e: { target: { value: string } }) => setSubjectFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))} className={`${inputClass} w-auto max-w-[16rem]`} data-testid="select-topics-subject-filter"><option value="all">All subjects</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
      <Chip active={emptyOnly} onClick={() => setEmptyOnly((v) => !v)} icon={CircleSlash} testId="chip-empty-topics">Empty only</Chip>
      <div className="ml-auto flex gap-1.5">
        <button onClick={() => setOpen(new Set(allKeys))} className="rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-muted-foreground hover:bg-muted" data-testid="button-expand-all">Expand all</button>
        <button onClick={() => setOpen(new Set())} className="rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-muted-foreground hover:bg-muted" data-testid="button-collapse-all">Collapse all</button>
      </div>
      {filtering && <p className="basis-full text-[11px] text-muted-foreground">Filtered view — reordering is switched off until you clear the search/filters.</p>}
    </div>

    {!yearGroups.length && <EmptyState icon={ListTree} title={filtering ? 'Nothing matches' : 'No subjects yet'} body={filtering ? 'No topics fit those filters. Clear them to see everything.' : 'Add a subject first — every topic belongs to a subject.'} />}
    <div className="space-y-4">{yearGroups.map(({ programLabel, yearLabel, groups }) => {
      const yKey = `y-${programLabel}-${yearLabel}`;
      const yearCount = groups.reduce((n, g) => n + (bySubject.get(g.key as number)?.length ?? 0), 0);
      return <Group key={yKey} open={filtering || open.has(yKey)} onToggle={() => toggle(yKey)} icon={<GraduationCap size={15} className="shrink-0 text-primary" />} title={<>{programLabel} <span className="font-normal text-muted-foreground">· {yearLabel}</span></>} count={`${yearCount} topic${yearCount === 1 ? '' : 's'}`} testId={`topics-year-${programLabel}-${yearLabel}`}>
        <div className="space-y-3">{groups.map(({ key }) => {
          const subject = subjects.find((s) => s.id === key)!;
          const all = bySubject.get(subject.id) ?? [];
          const list = visibleIn(subject.id, subject.name);
          const sKey = `s-${subject.id}`;
          return <Group nested key={subject.id} open={filtering || open.has(sKey)} onToggle={() => toggle(sKey)} title={<>{subject.name} <span className="font-normal text-muted-foreground">· {moduleOf(subject.moduleId)?.name ?? ''}</span></>} count={all.length} testId={`topics-subject-${subject.id}`}>
            <div className="space-y-1.5">{list.map((t) => {
              const i = all.findIndex((x) => x.id === t.id);
              return <div key={t.id} className="rounded-xl border border-border bg-card" data-testid={`row-topic-${t.id}`}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5">
                  <MoveButtons canUp={!filtering && i > 0 && !reorderTopics.isPending} canDown={!filtering && i >= 0 && i < all.length - 1 && !reorderTopics.isPending} onUp={() => move(subject.id, t.id, -1)} onDown={() => move(subject.id, t.id, 1)} testIdSuffix={`topic-${t.id}`} />
                  <span className="min-w-[8rem] flex-1 text-xs font-bold">{t.name}</span>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${t.questionCount ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}>{t.questionCount} MCQ{t.questionCount === 1 ? '' : 's'}</span>
                  <button onClick={() => { setEditingId(t.id); setEditName(t.name); }} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted" aria-label="Rename topic" data-testid={`button-edit-topic-${t.id}`}><Pencil size={14} /></button>
                  <button onClick={() => setDeletingId(t.id)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Delete topic" data-testid={`button-delete-topic-${t.id}`}><Trash2 size={14} /></button>
                </div>
                {editingId === t.id && <form onSubmit={(e) => { e.preventDefault(); if (editName.trim()) updateTopic.mutate({ id: t.id, body: { name: editName.trim() } }); }} className="flex gap-2 border-t border-border p-3">
                  <input autoFocus value={editName} onChange={(e: { target: { value: string } }) => setEditName(e.target.value)} className={`${inputClass} h-9 flex-1`} data-testid={`input-rename-topic-${t.id}`} />
                  <button type="submit" disabled={updateTopic.isPending} className="btn-pop rounded-lg bg-primary px-3 text-[11px] font-extrabold text-primary-foreground disabled:opacity-50" data-testid={`button-save-topic-${t.id}`}>Save</button>
                  <button type="button" onClick={() => setEditingId(null)} className="rounded-lg border border-border px-3 text-[11px] font-bold text-muted-foreground" data-testid={`button-cancel-edit-topic-${t.id}`}>Cancel</button>
                </form>}
              </div>;
            })}{!list.length && <p className="text-xs text-muted-foreground">{all.length ? 'No topics match the filters.' : 'No topics yet — add the first one below.'}</p>}</div>
            {!filtering && <QuickAdd placeholder={`Add a topic to ${subject.name}…`} pending={createTopic.isPending} testId={`input-quick-add-topic-${subject.id}`} onAdd={(name) => createTopic.mutate({ subjectId: subject.id, name, active: true, displayOrder: all.length })} />}
          </Group>;
        })}</div>
      </Group>;
    })}</div>
    {deletingId !== null && <ConfirmDialog title="Delete this topic?" body="MCQs filed under it are kept but will no longer have a topic." onCancel={() => setDeletingId(null)} onConfirm={() => removeTopic.mutate(deletingId)} pending={removeTopic.isPending} />}
  </div>;
}

export default AdminTopicsPage;
