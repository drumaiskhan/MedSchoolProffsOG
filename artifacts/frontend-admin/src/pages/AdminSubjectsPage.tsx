// Subjects (v37 rebuild): every subject across every module, grouped
// Program/Year → Module, with summary tiles, search, module filter, in-place
// "add subject", thumbnail preview that works across domains, and a reorder that
// renumbers the whole module list. The single "Add subject" form (module +
// name + thumbnail) is kept; data-testid hooks are unchanged.
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { BookOpen, Image as ImageIcon, Layers, ListTree, Pencil, Plus, Trash2, GraduationCap } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { ApiRequestError, moduleAdminApi, subjectAdminApi, type AdminSubject } from '@/lib/api';
import { AdminImageUpload, ConfirmDialog, EmptyState, SectionHeader, SkeletonPage, groupByProgramYear } from '@/lib/shared';
import { Group, MoveButtons, QuickAdd, SearchBox, StatTiles, Thumb, byOrder, planReorder, inputClass } from '@/lib/admin-ui';
import { queryClient } from '@/lib/query-client';

const failToast = (title: string) => (err: unknown) => toast({ title, description: err instanceof ApiRequestError ? err.message : 'Something went wrong.', variant: 'destructive' });

function AdminSubjectsPage() {
  const modulesQ = useQuery({ queryKey: ['admin-modules'], queryFn: moduleAdminApi.listAll });
  const subjectsQ = useQuery({ queryKey: ['admin-subjects-all'], queryFn: () => subjectAdminApi.list() });
  const modules = [...(modulesQ.data ?? [])].sort(byOrder);
  const moduleName = (id: number) => modules.find((m) => m.id === id)?.name ?? `Module #${id}`;

  const [moduleFilter, setModuleFilter] = useState<'all' | number>('all');
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [newModuleId, setNewModuleId] = useState<number | ''>('');
  const [newSubjectName, setNewSubjectName] = useState('');
  const [newSubjectIcon, setNewSubjectIcon] = useState<string | null>(null);
  const [newSubjectIconPreview, setNewSubjectIconPreview] = useState<string | null>(null);
  const [deletingSubjectId, setDeletingSubjectId] = useState<number | null>(null);
  const [editingSubjectId, setEditingSubjectId] = useState<number | null>(null);
  const [editSubjectName, setEditSubjectName] = useState('');
  const [editSubjectIcon, setEditSubjectIcon] = useState<string | null | undefined>(undefined);
  const [editSubjectIconPreview, setEditSubjectIconPreview] = useState<string | null>(null);

  // Also refreshes the per-module ['admin-subjects', moduleId] cache that
  // Academic content's nested manager uses.
  const invalidate = () => { queryClient.invalidateQueries({ queryKey: ['admin-subjects-all'] }); queryClient.invalidateQueries({ queryKey: ['admin-subjects'] }); queryClient.invalidateQueries({ queryKey: ['admin-modules'] }); };
  const createSubject = useMutation({ mutationFn: subjectAdminApi.create, onSuccess: () => { invalidate(); setNewSubjectName(''); setNewSubjectIcon(null); setNewSubjectIconPreview(null); }, onError: failToast('Could not create subject') });
  const quickCreate = useMutation({ mutationFn: subjectAdminApi.create, onSuccess: invalidate, onError: failToast('Could not create subject') });
  const updateSubject = useMutation({ mutationFn: ({ id, body }: { id: number; body: Parameters<typeof subjectAdminApi.update>[1] }) => subjectAdminApi.update(id, body), onSuccess: () => { invalidate(); setEditingSubjectId(null); }, onError: failToast('Could not update subject') });
  const removeSubject = useMutation({ mutationFn: subjectAdminApi.remove, onSuccess: () => { invalidate(); setDeletingSubjectId(null); }, onError: failToast('Could not delete subject') });
  const reorderSubjects = useMutation({ mutationFn: (rows: { id: number; displayOrder: number }[]) => Promise.all(rows.map((r) => subjectAdminApi.update(r.id, { displayOrder: r.displayOrder }))), onSuccess: invalidate, onError: failToast('Could not reorder subjects') });
  const startEditSubject = (s: AdminSubject) => { setEditingSubjectId(s.id); setEditSubjectName(s.name); setEditSubjectIcon(undefined); setEditSubjectIconPreview(s.iconUrl ?? null); };

  const q = search.trim().toLowerCase();
  const filtering = !!q || moduleFilter !== 'all';
  const allSubjects = subjectsQ.data ?? [];
  const byModule = new Map<number, AdminSubject[]>();
  for (const s of allSubjects) { if (!byModule.has(s.moduleId)) byModule.set(s.moduleId, []); byModule.get(s.moduleId)!.push(s); }
  for (const list of byModule.values()) list.sort(byOrder);
  const visibleIn = (moduleId: number) => (byModule.get(moduleId) ?? []).filter((s) => !q || s.name.toLowerCase().includes(q) || moduleName(moduleId).toLowerCase().includes(q));

  // Every module is listed (even with no subjects yet) so "add the first
  // subject" is possible in place; filters hide the ones that don't match.
  const shownModules = modules.filter((m) => (moduleFilter === 'all' || m.id === moduleFilter) && (!q || visibleIn(m.id).length > 0));
  const yearGroups = groupByProgramYear(shownModules.map((m) => ({ key: m.id, program: m.programTargetKind ?? null, year: m.yearTargetNumber ?? null })));
  const toggle = (key: string) => setOpen((s) => { const next = new Set(s); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const allKeys = [...yearGroups.map((g) => `y-${g.programLabel}-${g.yearLabel}`), ...shownModules.map((m) => `m-${m.id}`)];

  const move = (moduleId: number, id: number, dir: -1 | 1) => {
    const list = byModule.get(moduleId) ?? [];
    const plan = planReorder(list, list, id, dir);
    if (plan.length && !reorderSubjects.isPending) reorderSubjects.mutate(plan);
  };

  const withThumb = allSubjects.filter((s) => !!s.iconUrl).length;
  const totalTopics = allSubjects.reduce((n, s) => n + (s.topicCount ?? 0), 0);
  const modulesWithSubjects = new Set(allSubjects.map((s) => s.moduleId)).size;

  if (modulesQ.isLoading || subjectsQ.isLoading) return <div><SectionHeader eyebrow="Curriculum operations" title="Subjects" /><SkeletonPage /></div>;

  return <div>
    <SectionHeader eyebrow="Curriculum operations" title="Subjects" action={<button onClick={() => setAddOpen((v) => !v)} className="btn-pop inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-foreground" data-testid="button-toggle-add-subject"><Plus size={15} /> {addOpen ? 'Close form' : 'Add subject'}</button>} />
    <StatTiles items={[
      { label: 'Subjects', value: allSubjects.length, icon: Layers, tone: 'green', testId: 'stat-subjects' },
      { label: 'Modules covered', value: `${modulesWithSubjects}/${modules.length}`, icon: BookOpen, tone: 'blue' },
      { label: 'Topics', value: totalTopics, icon: ListTree, tone: 'violet' },
      { label: 'With thumbnail', value: `${withThumb}/${allSubjects.length}`, icon: ImageIcon, tone: 'amber', hint: 'Subjects without one get an automatic icon on the student app' },
    ]} />

    {addOpen && <form onSubmit={(e) => { e.preventDefault(); if (newModuleId && newSubjectName.trim()) createSubject.mutate({ moduleId: Number(newModuleId), name: newSubjectName.trim(), active: true, iconPath: newSubjectIcon ?? undefined }); }} className="mb-5 space-y-3 rounded-2xl border border-primary/30 bg-primary/5 p-4 sm:p-5">
      <div className="text-xs font-extrabold">Add subject</div>
      <div className="grid gap-2 sm:grid-cols-2">
        <select required value={newModuleId} onChange={(e: { target: { value: string } }) => setNewModuleId(e.target.value ? Number(e.target.value) : '')} className={inputClass} data-testid="select-new-subject-module"><option value="">Choose a module…</option>{modules.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
        <input value={newSubjectName} onChange={(e: { target: { value: string } }) => setNewSubjectName(e.target.value)} placeholder="Subject name, e.g. Anatomy" className={inputClass} data-testid="input-add-subject" />
      </div>
      <AdminImageUpload currentUrl={newSubjectIconPreview || ''} kind="resource" accept="image/png,image/jpeg,image/webp" hint="Optional thumbnail · PNG, JPEG, or WEBP." testId="input-new-subject-icon-upload" onUploaded={(storagePath, previewUrl) => { setNewSubjectIcon(storagePath); setNewSubjectIconPreview(previewUrl); }} />
      <button type="submit" disabled={createSubject.isPending || !newModuleId || !newSubjectName.trim()} className="btn-pop rounded-xl bg-primary px-4 py-2 text-xs font-extrabold text-primary-foreground disabled:opacity-50" data-testid="button-add-subject">{createSubject.isPending ? 'Adding…' : 'Add subject'}</button>
    </form>}

    <div className="mb-4 flex flex-wrap items-center gap-2.5 rounded-2xl border border-border bg-card p-3">
      <SearchBox value={search} onChange={setSearch} placeholder="Search subjects or modules…" testId="input-search-subjects" className="min-w-[14rem] flex-1 sm:max-w-xs" />
      <select value={moduleFilter} onChange={(e: { target: { value: string } }) => setModuleFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))} className={`${inputClass} w-auto max-w-[16rem]`} data-testid="select-subjects-module-filter"><option value="all">All modules</option>{modules.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
      <div className="ml-auto flex gap-1.5">
        <button onClick={() => setOpen(new Set(allKeys))} className="rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-muted-foreground hover:bg-muted" data-testid="button-expand-all">Expand all</button>
        <button onClick={() => setOpen(new Set())} className="rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-muted-foreground hover:bg-muted" data-testid="button-collapse-all">Collapse all</button>
      </div>
      {filtering && <p className="basis-full text-[11px] text-muted-foreground">Filtered view — reordering is switched off until you clear the search/filter.</p>}
    </div>

    {!yearGroups.length && <EmptyState icon={BookOpen} title={filtering ? 'Nothing matches' : 'No modules yet'} body={filtering ? 'No subjects fit that search. Clear it to see everything.' : 'Create a module in Academic content first — every subject belongs to a module.'} />}
    <div className="space-y-4">{yearGroups.map(({ programLabel, yearLabel, groups }) => {
      const yKey = `y-${programLabel}-${yearLabel}`;
      const yearCount = groups.reduce((n, g) => n + (byModule.get(g.key as number)?.length ?? 0), 0);
      return <Group key={yKey} open={filtering || open.has(yKey)} onToggle={() => toggle(yKey)} icon={<GraduationCap size={15} className="shrink-0 text-primary" />} title={<>{programLabel} <span className="font-normal text-muted-foreground">· {yearLabel}</span></>} count={`${yearCount} subject${yearCount === 1 ? '' : 's'}`} testId={`subjects-year-${programLabel}-${yearLabel}`}>
        <div className="space-y-3">{groups.map(({ key }) => {
          const moduleId = key as number;
          const all = byModule.get(moduleId) ?? [];
          const list = visibleIn(moduleId);
          const mKey = `m-${moduleId}`;
          return <Group nested key={moduleId} open={filtering || open.has(mKey)} onToggle={() => toggle(mKey)} title={moduleName(moduleId)} count={all.length} testId={`subjects-module-${moduleId}`}>
            <div className="space-y-2">{list.map((s) => {
              const i = all.findIndex((x) => x.id === s.id);
              return <div key={s.id} className="rounded-xl border border-border bg-card shadow-[var(--shadow-2xs)]" data-testid={`row-subject-${s.id}`}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
                  <MoveButtons canUp={!filtering && i > 0 && !reorderSubjects.isPending} canDown={!filtering && i >= 0 && i < all.length - 1 && !reorderSubjects.isPending} onUp={() => move(moduleId, s.id, -1)} onDown={() => move(moduleId, s.id, 1)} testIdSuffix={`subject-${s.id}`} />
                  <Thumb url={s.iconUrl} icon={BookOpen} size={36} />
                  <div className="min-w-[8rem] flex-1"><div className="text-xs font-extrabold">{s.name}</div><div className="text-[11px] text-muted-foreground">{s.topicCount} topic{s.topicCount === 1 ? '' : 's'}{!s.iconUrl && ' · no thumbnail'}</div></div>
                  <button onClick={() => startEditSubject(s)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted" aria-label="Edit subject" data-testid={`button-edit-subject-${s.id}`}><Pencil size={14} /></button>
                  <button onClick={() => setDeletingSubjectId(s.id)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Delete subject" data-testid={`button-delete-subject-${s.id}`}><Trash2 size={14} /></button>
                </div>
                {editingSubjectId === s.id && <form onSubmit={(e) => { e.preventDefault(); if (!editSubjectName.trim()) return; updateSubject.mutate({ id: s.id, body: { name: editSubjectName.trim(), ...(editSubjectIcon !== undefined ? { iconPath: editSubjectIcon } : {}) } }); }} className="space-y-2 border-t border-border p-3">
                  <input autoFocus value={editSubjectName} onChange={(e: { target: { value: string } }) => setEditSubjectName(e.target.value)} className={inputClass} data-testid={`input-rename-subject-${s.id}`} />
                  <AdminImageUpload currentUrl={editSubjectIconPreview || ''} kind="resource" accept="image/png,image/jpeg,image/webp" hint="Optional thumbnail · PNG, JPEG, or WEBP." testId={`input-subject-icon-upload-${s.id}`} onUploaded={(storagePath, previewUrl) => { setEditSubjectIcon(storagePath); setEditSubjectIconPreview(previewUrl); }} />
                  <div className="flex gap-2"><button type="submit" disabled={updateSubject.isPending} className="btn-pop rounded-lg bg-primary px-3 py-1.5 text-[11px] font-extrabold text-primary-foreground disabled:opacity-50" data-testid={`button-save-subject-${s.id}`}>Save</button><button type="button" onClick={() => setEditingSubjectId(null)} className="rounded-lg border border-border px-3 py-1.5 text-[11px] font-bold text-muted-foreground" data-testid={`button-cancel-edit-subject-${s.id}`}>Cancel</button></div>
                </form>}
              </div>;
            })}{!list.length && <p className="text-xs text-muted-foreground">{all.length ? 'No subjects match the search.' : 'No subjects yet — add the first one below.'}</p>}</div>
            {!q && <QuickAdd placeholder={`Add a subject to ${moduleName(moduleId)}…`} pending={quickCreate.isPending} testId={`input-quick-add-subject-${moduleId}`} onAdd={(name) => quickCreate.mutate({ moduleId, name, active: true, displayOrder: all.length })} />}
          </Group>;
        })}</div>
      </Group>;
    })}</div>
    {deletingSubjectId !== null && <ConfirmDialog title="Delete this subject?" body="Its topics go with it. MCQs already tagged to it are kept but will need a new home." onCancel={() => setDeletingSubjectId(null)} onConfirm={() => removeSubject.mutate(deletingSubjectId)} pending={removeSubject.isPending} />}
  </div>;
}

export default AdminSubjectsPage;
