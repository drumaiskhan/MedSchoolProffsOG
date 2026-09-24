// Auto-extracted route page — code-split via React.lazy() in App.tsx.
import { type ReactNode, type ComponentProps, useState, useEffect, useRef } from 'react';
import { QueryClient, QueryClientProvider, useMutation, useQuery } from '@tanstack/react-query';
import { Link, Route, Switch, useLocation, useSearch, useParams, Router as WouterRouter } from 'wouter';
import {
  ArrowLeft, ArrowRight, BookOpen, Check, CheckCircle2, ChevronRight, ChevronUp, ChevronDown,
  CircleHelp, Clock3, CreditCard, FileText, Flame, FolderOpen,
  LayoutDashboard, Library, LockKeyhole, LogOut, Menu, MoreHorizontal, Pencil, Plus,
  ReceiptText, Search, Settings, ShieldCheck, Sparkles, Stethoscope, Target, Trash2,
  TrendingUp, Users, X, Zap, Bell, SlidersHorizontal, FileStack, NotebookPen, Bookmark,
  Flag, Trophy, MessageSquare, Landmark, Copy, QrCode, User as UserIcon, Mail, Phone, Hash,
  GraduationCap, CalendarDays, Eye, EyeOff, Smartphone, UploadCloud, ImageOff,
  RotateCcw, ThumbsUp, ThumbsDown, CheckCheck, ClipboardCheck, AlertTriangle, Wand2, Layers, BarChart3, ToggleLeft,
  Download, Database, Loader2, Image as ImageIcon, Paperclip, Link2, ListChecks, MapPin,
} from 'lucide-react';
import {
  ospeAdminApi, uploadFile, resolveUploadUrl, ApiRequestError,
  type OspeBlock, type OspeModule, type OspeLearningMaterial, type OspeStation, type OspeLabelPoint, type OspeAdminExam, type OspeExamAttemptRow, type OspeExamType,
} from '@/lib/api';
import { CollapsibleGroup, ConfirmDialog, EmptyState, SectionHeader, DEGREE_OPTIONS, DEGREE_YEAR_OPTIONS, studyYearToNumber, groupByDegreeYear, cn } from '@/lib/shared';
import { queryClient } from '@/lib/query-client';
import { toast } from '@/hooks/use-toast';

type Tab = 'blocks' | 'materials' | 'stations' | 'exams';

function errMsg(err: unknown): string { return err instanceof ApiRequestError ? err.message : 'Something went wrong.'; }

// Degree/Year grouping — same groupByDegreeYear + CollapsibleGroup pattern
// Books/Past papers use, so long banks here (blocks, modules, stations,
// exams) read the same way: MBBS/BDS colleges, collapsible per year, with
// "Unspecified degree" / "No year set" catch-alls for untargeted items.
type Targetable = { programTargetKind: string | null; yearTargetNumber: number | null };
function targetDegree(item: Targetable): string { return item.programTargetKind || ''; }
function targetYearLabel(item: Targetable): string {
  if (!item.yearTargetNumber) return '';
  return (DEGREE_YEAR_OPTIONS[item.programTargetKind || ''] || DEGREE_YEAR_OPTIONS.MBBS)[item.yearTargetNumber - 1] || '';
}
function groupTargetable<T extends Targetable>(items: T[]) { return groupByDegreeYear(items, targetDegree, targetYearLabel, (i) => i.yearTargetNumber ?? undefined); }

// Shared Degree + Year picker, mirroring the one every other content type
// (Books, Past papers, Pre-Proffs exams) uses — leaving both blank makes
// the item visible to every program/year.
function TargetingSelect({ programTargetKind, yearTargetNumber, onChange, idPrefix }: { programTargetKind: string | null; yearTargetNumber: number | null; onChange: (kind: string | null, year: number | null) => void; idPrefix: string }) {
  const [degree, setDegree] = useState(programTargetKind || '');
  const [studyYear, setStudyYear] = useState(programTargetKind && yearTargetNumber ? (DEGREE_YEAR_OPTIONS[programTargetKind] || [])[yearTargetNumber - 1] || '' : '');
  return <div className="grid gap-2 sm:grid-cols-2">
    <select value={degree} onChange={(e) => { const d = e.target.value; setDegree(d); setStudyYear(''); onChange(d || null, null); }} className="h-10 rounded-xl border border-border bg-background px-3 text-xs" data-testid={`select-${idPrefix}-degree`}>
      <option value="">All programs (MBBS &amp; BDS)</option>
      {DEGREE_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
    </select>
    <select value={studyYear} onChange={(e) => { const y = e.target.value; setStudyYear(y); onChange(degree || null, y ? studyYearToNumber(degree, y) ?? null : null); }} disabled={!degree} className="h-10 rounded-xl border border-border bg-background px-3 text-xs disabled:opacity-50" data-testid={`select-${idPrefix}-year`}>
      <option value="">{degree ? 'All years' : 'Pick a program first'}</option>
      {(DEGREE_YEAR_OPTIONS[degree] || []).map((y) => <option key={y} value={y}>{y}</option>)}
    </select>
  </div>;
}

function ExamTypeToggle({ value, onChange }: { value: OspeExamType; onChange: (v: OspeExamType) => void }) {
  return <div className="inline-flex rounded-xl border border-border bg-card p-1" data-testid="toggle-exam-type">
    {(['OSPE', 'OSCE'] as const).map((t) => <button key={t} onClick={() => onChange(t)} className={cn('rounded-lg px-4 py-1.5 text-xs font-extrabold transition-colors', value === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')} data-testid={`button-exam-type-${t}`}>{t}</button>)}
  </div>;
}

function FileField({ label, path, onUpload, accept, icon: Icon = UploadCloud, testId }: { label: string; path: string | null; onUpload: (path: string) => void; accept?: string; icon?: typeof UploadCloud; testId: string }) {
  const [uploading, setUploading] = useState(false);
  return <label className="flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-border px-3 text-xs font-bold text-muted-foreground hover:bg-muted/50">
    <Icon size={14} />{uploading ? 'Uploading…' : path ? `${label} attached — replace` : label}
    <input type="file" accept={accept} className="hidden" data-testid={testId} onChange={async (e) => {
      const file = e.target.files?.[0]; if (!file) return;
      setUploading(true);
      try { const res = await uploadFile(file, 'resource'); onUpload(res.storagePath); }
      catch (err) { toast({ title: 'Upload failed', description: errMsg(err), variant: 'destructive' }); }
      finally { setUploading(false); e.target.value = ''; }
    }} />
  </label>;
}

// ---------------------------------------------------------------------------
// Blocks & Modules
// ---------------------------------------------------------------------------

function BlockForm({ initial, onSave, onCancel, pending, examType }: { initial?: OspeBlock; onSave: (body: Partial<OspeBlock>) => void; onCancel: () => void; pending: boolean; examType: OspeExamType }) {
  const [name, setName] = useState(initial?.name || '');
  const [subtitle, setSubtitle] = useState(initial?.subtitle || '');
  const [kind, setKind] = useState<string | null>(initial?.programTargetKind ?? null);
  const [year, setYear] = useState<number | null>(initial?.yearTargetNumber ?? null);
  return <div className="mt-3 space-y-2 rounded-xl border border-border bg-background p-3">
    <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Block name" className="h-10 w-full rounded-xl border border-border bg-card px-3 text-xs" data-testid="input-block-name" />
    <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="Subtitle (optional)" className="h-10 w-full rounded-xl border border-border bg-card px-3 text-xs" data-testid="input-block-subtitle" />
    <TargetingSelect programTargetKind={kind} yearTargetNumber={year} onChange={(k, y) => { setKind(k); setYear(y); }} idPrefix="block" />
    <div className="flex justify-end gap-2">
      <button onClick={onCancel} className="rounded-lg px-3 py-1.5 text-[11px] font-bold text-muted-foreground hover:bg-muted" data-testid="button-cancel-block">Cancel</button>
      <button onClick={() => onSave({ name, subtitle, examType, programTargetKind: kind, yearTargetNumber: year })} disabled={pending || !name.trim()} className="rounded-lg bg-primary px-3 py-1.5 text-[11px] font-bold text-primary-foreground disabled:opacity-50" data-testid="button-save-block">{pending ? 'Saving…' : 'Save'}</button>
    </div>
  </div>;
}

function ModuleForm({ initial, onSave, onCancel, pending, examType, blocks }: { initial?: OspeModule; onSave: (body: Partial<OspeModule>) => void; onCancel: () => void; pending: boolean; examType: OspeExamType; blocks: OspeBlock[] }) {
  const [name, setName] = useState(initial?.name || '');
  const [subtitle, setSubtitle] = useState(initial?.subtitle || '');
  const [blockId, setBlockId] = useState<number | null>(initial?.blockId ?? null);
  const [kind, setKind] = useState<string | null>(initial?.programTargetKind ?? null);
  const [year, setYear] = useState<number | null>(initial?.yearTargetNumber ?? null);
  return <div className="mt-3 space-y-2 rounded-xl border border-border bg-background p-3">
    <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Module name" className="h-10 w-full rounded-xl border border-border bg-card px-3 text-xs" data-testid="input-module-name" />
    <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="Subtitle (optional)" className="h-10 w-full rounded-xl border border-border bg-card px-3 text-xs" data-testid="input-module-subtitle" />
    <select value={blockId ?? ''} onChange={(e) => setBlockId(e.target.value ? Number(e.target.value) : null)} className="h-10 w-full rounded-xl border border-border bg-card px-3 text-xs" data-testid="select-module-block">
      <option value="">No block (Unassigned)</option>
      {blocks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
    </select>
    <TargetingSelect programTargetKind={kind} yearTargetNumber={year} onChange={(k, y) => { setKind(k); setYear(y); }} idPrefix="module" />
    <div className="flex justify-end gap-2">
      <button onClick={onCancel} className="rounded-lg px-3 py-1.5 text-[11px] font-bold text-muted-foreground hover:bg-muted" data-testid="button-cancel-module">Cancel</button>
      <button onClick={() => onSave({ name, subtitle, blockId, examType, programTargetKind: kind, yearTargetNumber: year })} disabled={pending || !name.trim()} className="rounded-lg bg-primary px-3 py-1.5 text-[11px] font-bold text-primary-foreground disabled:opacity-50" data-testid="button-save-module">{pending ? 'Saving…' : 'Save'}</button>
    </div>
  </div>;
}

function BlocksModulesTab({ examType }: { examType: OspeExamType }) {
  const blocksQ = useQuery({ queryKey: ['ospe-admin-blocks', examType], queryFn: () => ospeAdminApi.blocks.list(examType) });
  const modulesQ = useQuery({ queryKey: ['ospe-admin-modules', examType], queryFn: () => ospeAdminApi.modules.list(examType) });
  const invalidate = () => { queryClient.invalidateQueries({ queryKey: ['ospe-admin-blocks'] }); queryClient.invalidateQueries({ queryKey: ['ospe-admin-modules'] }); };

  const createBlock = useMutation({ mutationFn: ospeAdminApi.blocks.create, onSuccess: () => { invalidate(); setAddingBlock(false); } });
  const updateBlock = useMutation({ mutationFn: ({ id, body }: { id: number; body: Partial<OspeBlock> }) => ospeAdminApi.blocks.update(id, body), onSuccess: () => { invalidate(); setEditingBlock(null); } });
  const removeBlock = useMutation({ mutationFn: ospeAdminApi.blocks.removePermanent, onSuccess: () => { invalidate(); setDeletingBlock(null); }, onError: (err: unknown) => toast({ title: 'Could not delete block', description: errMsg(err), variant: 'destructive' }) });

  const createModule = useMutation({ mutationFn: ospeAdminApi.modules.create, onSuccess: () => { invalidate(); setAddingModule(false); } });
  const updateModule = useMutation({ mutationFn: ({ id, body }: { id: number; body: Partial<OspeModule> }) => ospeAdminApi.modules.update(id, body), onSuccess: () => { invalidate(); setEditingModule(null); } });
  const removeModule = useMutation({ mutationFn: ospeAdminApi.modules.removePermanent, onSuccess: () => { invalidate(); setDeletingModule(null); }, onError: (err: unknown) => toast({ title: 'Could not delete module', description: errMsg(err), variant: 'destructive' }) });

  const [addingBlock, setAddingBlock] = useState(false);
  const [editingBlock, setEditingBlock] = useState<number | null>(null);
  const [deletingBlock, setDeletingBlock] = useState<number | null>(null);
  const [addingModule, setAddingModule] = useState(false);
  const [editingModule, setEditingModule] = useState<number | null>(null);
  const [deletingModule, setDeletingModule] = useState<number | null>(null);

  const blocks = blocksQ.data || [];
  const modules = modulesQ.data || [];
  const blockGroups = groupTargetable(blocks);
  const moduleGroups = groupTargetable(modules);

  const blockRow = (b: OspeBlock) => <div key={b.id} className="rounded-xl border border-border bg-card p-3" data-testid={`row-block-${b.id}`}>
    <div className="flex items-center justify-between gap-2">
      <div><p className="text-xs font-bold">{b.name}</p>{b.subtitle && <p className="text-[11px] text-muted-foreground">{b.subtitle}</p>}<p className="mt-0.5 text-[10px] font-semibold text-primary">{b.targetingLabel}</p></div>
      <div className="flex items-center gap-1">
        <button onClick={() => updateBlock.mutate({ id: b.id, body: { active: !b.active } })} className={cn('rounded-lg px-2 py-1 text-[10px] font-extrabold', b.active ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground')} data-testid={`button-toggle-block-${b.id}`}>{b.active ? 'Active' : 'Hidden'}</button>
        <button onClick={() => setEditingBlock(editingBlock === b.id ? null : b.id)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted" data-testid={`button-edit-block-${b.id}`}><Pencil size={13} /></button>
        <button onClick={() => setDeletingBlock(b.id)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" data-testid={`button-delete-block-${b.id}`}><Trash2 size={13} /></button>
      </div>
    </div>
    {editingBlock === b.id && <BlockForm initial={b} examType={examType} onCancel={() => setEditingBlock(null)} pending={updateBlock.isPending} onSave={(body) => updateBlock.mutate({ id: b.id, body })} />}
  </div>;

  const moduleRow = (m: OspeModule) => <div key={m.id} className="rounded-xl border border-border bg-card p-3" data-testid={`row-module-${m.id}`}>
    <div className="flex items-center justify-between gap-2">
      <div><p className="text-xs font-bold">{m.name}</p><p className="text-[11px] text-muted-foreground">{m.blockName || 'Unassigned'}{m.subtitle ? ` · ${m.subtitle}` : ''}</p><p className="mt-0.5 text-[10px] font-semibold text-primary">{m.targetingLabel}</p></div>
      <div className="flex items-center gap-1">
        <button onClick={() => updateModule.mutate({ id: m.id, body: { active: !m.active } })} className={cn('rounded-lg px-2 py-1 text-[10px] font-extrabold', m.active ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground')} data-testid={`button-toggle-module-${m.id}`}>{m.active ? 'Active' : 'Hidden'}</button>
        <button onClick={() => setEditingModule(editingModule === m.id ? null : m.id)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted" data-testid={`button-edit-module-${m.id}`}><Pencil size={13} /></button>
        <button onClick={() => setDeletingModule(m.id)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" data-testid={`button-delete-module-${m.id}`}><Trash2 size={13} /></button>
      </div>
    </div>
    {editingModule === m.id && <ModuleForm initial={m} examType={examType} blocks={blocks} onCancel={() => setEditingModule(null)} pending={updateModule.isPending} onSave={(body) => updateModule.mutate({ id: m.id, body })} />}
  </div>;

  return <div className="grid gap-6 lg:grid-cols-2">
    <div>
      <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-extrabold">Blocks</h3><button onClick={() => setAddingBlock((v) => !v)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[11px] font-bold hover:bg-muted" data-testid="button-toggle-add-block"><Plus size={13} /> Add block</button></div>
      {addingBlock && <BlockForm examType={examType} onCancel={() => setAddingBlock(false)} pending={createBlock.isPending} onSave={(body) => createBlock.mutate(body)} />}
      {!blocks.length && !addingBlock ? <EmptyState icon={Layers} title="No blocks yet" body="Blocks group modules together — add one to start organizing this bank." /> : <div className="mt-3">{blockGroups.map((g) => <CollapsibleGroup key={g.degree || 'unspecified'} defaultOpen icon={<GraduationCap size={13} />} title={g.degree === 'MBBS' || g.degree === 'BDS' ? `${g.degree} colleges` : 'Unspecified degree'} count={g.groups.reduce((sum, yg) => sum + yg.items.length, 0)} testId={`blocks-degree-${g.degree || 'unspecified'}`}>
        {g.groups.map((yg) => <CollapsibleGroup key={yg.year || 'no-year'} defaultOpen nested title={yg.year ? [yg.year, (g.degree === 'MBBS' || g.degree === 'BDS') ? g.degree : ''].filter(Boolean).join(' ') : 'No year set'} count={yg.items.length} testId={`blocks-year-${g.degree || 'unspecified'}-${yg.year || 'no-year'}`}>
          <div className="space-y-2">{yg.items.map(blockRow)}</div>
        </CollapsibleGroup>)}
      </CollapsibleGroup>)}</div>}
    </div>
    <div>
      <div className="mb-3 flex items-center justify-between"><div><h3 className="text-sm font-extrabold">Modules</h3><p className="text-[10px] text-muted-foreground">Optional — file stations &amp; material straight under a block if you don't need this extra layer.</p></div><button onClick={() => setAddingModule((v) => !v)} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[11px] font-bold hover:bg-muted" data-testid="button-toggle-add-module"><Plus size={13} /> Add module</button></div>
      {addingModule && <ModuleForm examType={examType} blocks={blocks} onCancel={() => setAddingModule(false)} pending={createModule.isPending} onSave={(body) => createModule.mutate(body)} />}
      {!modules.length && !addingModule ? <EmptyState icon={FolderOpen} title="No modules yet" body="Modules are optional — only add them if you want a finer layer than blocks. Stations and material can stay directly under a block." /> : <div className="mt-3">{moduleGroups.map((g) => <CollapsibleGroup key={g.degree || 'unspecified'} defaultOpen icon={<GraduationCap size={13} />} title={g.degree === 'MBBS' || g.degree === 'BDS' ? `${g.degree} colleges` : 'Unspecified degree'} count={g.groups.reduce((sum, yg) => sum + yg.items.length, 0)} testId={`modules-degree-${g.degree || 'unspecified'}`}>
        {g.groups.map((yg) => <CollapsibleGroup key={yg.year || 'no-year'} defaultOpen nested title={yg.year ? [yg.year, (g.degree === 'MBBS' || g.degree === 'BDS') ? g.degree : ''].filter(Boolean).join(' ') : 'No year set'} count={yg.items.length} testId={`modules-year-${g.degree || 'unspecified'}-${yg.year || 'no-year'}`}>
          <div className="space-y-2">{yg.items.map(moduleRow)}</div>
        </CollapsibleGroup>)}
      </CollapsibleGroup>)}</div>}
    </div>
    {deletingBlock !== null && <ConfirmDialog title="Permanently delete this block?" body="Any modules under it are moved to Unassigned, not deleted. There is no undo." confirmLabel="Delete forever" onCancel={() => setDeletingBlock(null)} onConfirm={() => removeBlock.mutate(deletingBlock)} pending={removeBlock.isPending} />}
    {deletingModule !== null && <ConfirmDialog title="Permanently delete this module?" body="Learning material and stations under it are moved to Unassigned, not deleted. There is no undo." confirmLabel="Delete forever" onCancel={() => setDeletingModule(null)} onConfirm={() => removeModule.mutate(deletingModule)} pending={removeModule.isPending} />}
  </div>;
}

// ---------------------------------------------------------------------------
// Learning materials
// ---------------------------------------------------------------------------

// Block + (optional) Module picker shared by the station and learning-material
// forms. A block is enough on its own — modules are an optional finer layer.
// Picking a module that belongs to a block also sets that block; changing the
// block clears a module that belongs to a different one.
function BlockModulePicker({ blocks, modules, blockId, moduleId, onChange, idPrefix }: {
  blocks: OspeBlock[]; modules: OspeModule[]; blockId: number | null; moduleId: number | null;
  onChange: (next: { blockId: number | null; moduleId: number | null }) => void; idPrefix: string;
}) {
  const visibleModules = blockId ? modules.filter((m) => m.blockId === blockId || m.id === moduleId) : modules;
  const selectCls = 'h-10 w-full rounded-xl border border-border bg-card px-3 text-xs';
  return <div className="grid gap-2 sm:grid-cols-2">
    <select value={blockId ?? ''} onChange={(e) => {
      const nextBlock = e.target.value ? Number(e.target.value) : null;
      const mod = modules.find((m) => m.id === moduleId);
      onChange({ blockId: nextBlock, moduleId: mod && nextBlock && mod.blockId !== nextBlock ? null : moduleId });
    }} className={selectCls} data-testid={`select-${idPrefix}-block`}>
      <option value="">No block (Unassigned)</option>
      {blocks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
    </select>
    <select value={moduleId ?? ''} onChange={(e) => {
      const nextModule = e.target.value ? Number(e.target.value) : null;
      const mod = modules.find((m) => m.id === nextModule);
      onChange({ blockId: mod?.blockId ?? blockId, moduleId: nextModule });
    }} className={selectCls} data-testid={`select-${idPrefix}-module`}>
      <option value="">No module (optional)</option>
      {visibleModules.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
    </select>
  </div>;
}

function LearningMaterialForm({ initial, onSave, onCancel, pending, examType, modules, blocks }: { initial?: OspeLearningMaterial; onSave: (body: Partial<OspeLearningMaterial>) => void; onCancel: () => void; pending: boolean; examType: OspeExamType; modules: OspeModule[]; blocks: OspeBlock[] }) {
  const [title, setTitle] = useState(initial?.title || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [bodyText, setBodyText] = useState(initial?.bodyText || '');
  const [moduleId, setModuleId] = useState<number | null>(initial?.moduleId ?? null);
  const [blockId, setBlockId] = useState<number | null>(initial?.blockId ?? null);
  const [imagePath, setImagePath] = useState<string | null>(initial?.imagePath ?? null);
  const [attachmentPath, setAttachmentPath] = useState<string | null>(initial?.attachmentPath ?? null);
  const [externalUrl, setExternalUrl] = useState(initial?.externalUrl || '');
  const [kind, setKind] = useState<string | null>(initial?.programTargetKind ?? null);
  const [year, setYear] = useState<number | null>(initial?.yearTargetNumber ?? null);
  return <div className="mt-3 space-y-2 rounded-xl border border-border bg-background p-3">
    <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="h-10 w-full rounded-xl border border-border bg-card px-3 text-xs" data-testid="input-material-title" />
    <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short description (optional)" className="h-10 w-full rounded-xl border border-border bg-card px-3 text-xs" data-testid="input-material-description" />
    <textarea value={bodyText} onChange={(e) => setBodyText(e.target.value)} placeholder="Full text / notes students will read (optional)" rows={4} className="w-full rounded-xl border border-border bg-card p-3 text-xs" data-testid="textarea-material-body" />
    <BlockModulePicker blocks={blocks} modules={modules} blockId={blockId} moduleId={moduleId} onChange={(n) => { setBlockId(n.blockId); setModuleId(n.moduleId); }} idPrefix="material" />
    <div className="grid gap-2 sm:grid-cols-2">
      <FileField label="Photo" icon={ImageIcon} accept="image/*" path={imagePath} onUpload={setImagePath} testId="input-material-image" />
      <FileField label="File (PDF, doc, whatever)" icon={Paperclip} path={attachmentPath} onUpload={setAttachmentPath} testId="input-material-attachment" />
    </div>
    {imagePath && <img src={resolveUploadUrl(imagePath) ?? undefined} alt="" className="h-28 w-full rounded-lg object-cover" />}
    <input value={externalUrl} onChange={(e) => setExternalUrl(e.target.value)} placeholder="External link (optional, e.g. a YouTube video)" className="h-10 w-full rounded-xl border border-border bg-card px-3 text-xs" data-testid="input-material-url" />
    <TargetingSelect programTargetKind={kind} yearTargetNumber={year} onChange={(k, y) => { setKind(k); setYear(y); }} idPrefix="material" />
    <div className="flex justify-end gap-2">
      <button onClick={onCancel} className="rounded-lg px-3 py-1.5 text-[11px] font-bold text-muted-foreground hover:bg-muted" data-testid="button-cancel-material">Cancel</button>
      <button onClick={() => onSave({ title, description, bodyText, moduleId, blockId, examType, imagePath, attachmentPath, externalUrl: externalUrl || null, programTargetKind: kind, yearTargetNumber: year })} disabled={pending || !title.trim()} className="rounded-lg bg-primary px-3 py-1.5 text-[11px] font-bold text-primary-foreground disabled:opacity-50" data-testid="button-save-material">{pending ? 'Saving…' : 'Save'}</button>
    </div>
  </div>;
}

function LearningMaterialsTab({ examType }: { examType: OspeExamType }) {
  const materialsQ = useQuery({ queryKey: ['ospe-admin-materials', examType], queryFn: () => ospeAdminApi.learningMaterials.list(examType) });
  const modulesQ = useQuery({ queryKey: ['ospe-admin-modules', examType], queryFn: () => ospeAdminApi.modules.list(examType) });
  const blocksQ = useQuery({ queryKey: ['ospe-admin-blocks', examType], queryFn: () => ospeAdminApi.blocks.list(examType) });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['ospe-admin-materials'] });
  const create = useMutation({ mutationFn: ospeAdminApi.learningMaterials.create, onSuccess: () => { invalidate(); setAdding(false); } });
  const update = useMutation({ mutationFn: ({ id, body }: { id: number; body: Partial<OspeLearningMaterial> }) => ospeAdminApi.learningMaterials.update(id, body), onSuccess: () => { invalidate(); setEditingId(null); } });
  const remove = useMutation({ mutationFn: ospeAdminApi.learningMaterials.removePermanent, onSuccess: () => { invalidate(); setDeletingId(null); }, onError: (err: unknown) => toast({ title: 'Could not delete', description: errMsg(err), variant: 'destructive' }) });

  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const materials = materialsQ.data || [];
  const modules = modulesQ.data || [];
  const blocks = blocksQ.data || [];

  return <div>
    <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-extrabold">Learning material</h3><button onClick={() => setAdding((v) => !v)} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-foreground" data-testid="button-toggle-add-material"><Plus size={15} /> {adding ? 'Close' : 'Add material'}</button></div>
    {adding && <LearningMaterialForm examType={examType} modules={modules} blocks={blocks} onCancel={() => setAdding(false)} pending={create.isPending} onSave={(body) => create.mutate(body)} />}
    {!materials.length && !adding ? <EmptyState icon={BookOpen} title="No learning material yet" body="Upload a photo, notes, a file, or a link — students see it before they attempt the exam." /> : <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{materials.map((m) => <div key={m.id} className="rounded-2xl border border-border bg-card p-4" data-testid={`card-material-${m.id}`}>
      {m.imagePath && <img src={resolveUploadUrl(m.imagePath) ?? undefined} alt="" loading="lazy" className="mb-3 h-28 w-full rounded-lg object-cover" />}
      <div className="flex items-start justify-between gap-2"><p className="text-sm font-bold leading-5">{m.title}</p><span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-extrabold text-muted-foreground">{m.examType}</span></div>
      {m.description && <p className="mt-1 text-xs text-muted-foreground">{m.description}</p>}
      <p className="mt-1 text-[10px] font-semibold text-primary">{m.targetingLabel}{(m.blockId || m.moduleId) ? ` · ${[blocks.find((b) => b.id === m.blockId)?.name, modules.find((mod) => mod.id === m.moduleId)?.name].filter(Boolean).join(' › ')}` : ''}</p>
      <div className="mt-2 flex flex-wrap gap-2 text-[10px]">
        {m.attachmentPath && <a href={resolveUploadUrl(m.attachmentPath)!} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-bold text-primary"><Paperclip size={10} /> File</a>}
        {m.externalUrl && <a href={m.externalUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-bold text-primary"><Link2 size={10} /> Link</a>}
      </div>
      {editingId === m.id ? <LearningMaterialForm initial={m} examType={examType} modules={modules} blocks={blocks} onCancel={() => setEditingId(null)} pending={update.isPending} onSave={(body) => update.mutate({ id: m.id, body })} /> : <div className="mt-3 flex items-center justify-between">
        <button onClick={() => update.mutate({ id: m.id, body: { active: !m.active } })} className={cn('rounded-lg px-2 py-1 text-[10px] font-extrabold', m.active ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground')} data-testid={`button-toggle-material-${m.id}`}>{m.active ? 'Published' : 'Hidden'}</button>
        <div className="flex items-center gap-1">
          <button onClick={() => setEditingId(m.id)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted" data-testid={`button-edit-material-${m.id}`}><Pencil size={14} /></button>
          <button onClick={() => setDeletingId(m.id)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" data-testid={`button-delete-material-${m.id}`}><Trash2 size={14} /></button>
        </div>
      </div>}
    </div>)}</div>}
    {deletingId !== null && <ConfirmDialog title="Permanently delete this material?" body="It will be removed for good. There is no undo." confirmLabel="Delete forever" onCancel={() => setDeletingId(null)} onConfirm={() => remove.mutate(deletingId)} pending={remove.isPending} />}
  </div>;
}

// ---------------------------------------------------------------------------
// Stations (question bank)
// ---------------------------------------------------------------------------

// Click-to-pin image annotator for LABELING (identification) stations: the
// admin clicks anywhere on the image to drop a numbered arrow/pin, types the
// correct label for it, and can drag a pin to nudge it. Coordinates are
// stored as x/y percentages of the image's own box (not pixels), so a pin
// stays put over the same structure however large the image renders later —
// this is also what lets the student view stay correct on a small screen.
function IdentificationEditor({ imagePath, points, onChange }: { imagePath: string | null; points: OspeLabelPoint[]; onChange: (points: OspeLabelPoint[]) => void }) {
  const imgWrapRef = useRef<HTMLDivElement | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const pctFromEvent = (e: { clientX: number; clientY: number }): { x: number; y: number } | null => {
    const el = imgWrapRef.current; if (!el) return null;
    const rect = el.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100));
    return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
  };

  const addPoint = (e: { clientX: number; clientY: number }) => {
    if (dragId) return; // just finished a drag — the click that follows shouldn't drop a new pin
    const p = pctFromEvent(e); if (!p) return;
    const id = `pt${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    onChange([...points, { id, x: p.x, y: p.y, label: '' }]);
  };

  if (!imagePath) return <p className="mt-3 rounded-xl border border-dashed border-border p-4 text-center text-[11px] text-muted-foreground">Upload a photo above first, then click on it here to drop identification pins.</p>;

  return <div className="mt-3">
    <p className="mb-2 text-[11px] text-muted-foreground">Click anywhere on the image to drop a numbered pin. Drag a pin to reposition it; type its answer below.</p>
    <div
      ref={imgWrapRef}
      onClick={addPoint}
      onMouseMove={(e) => {
        if (!dragId) return;
        const p = pctFromEvent(e); if (!p) return;
        onChange(points.map((pt) => pt.id === dragId ? { ...pt, x: p.x, y: p.y } : pt));
      }}
      onMouseUp={() => setDragId(null)}
      onMouseLeave={() => setDragId(null)}
      className="relative w-full cursor-crosshair select-none overflow-hidden rounded-xl border border-border bg-muted"
      data-testid="editor-identification-image"
    >
      <img src={resolveUploadUrl(imagePath) ?? undefined} alt="" className="pointer-events-none block w-full" draggable={false} />
      {points.map((p, i) => <div
        key={p.id}
        onMouseDown={(e) => { e.stopPropagation(); setDragId(p.id); }}
        style={{ left: `${p.x}%`, top: `${p.y}%` }}
        className="absolute grid size-6 -translate-x-1/2 -translate-y-1/2 cursor-move place-items-center rounded-full bg-primary text-[11px] font-extrabold text-primary-foreground shadow-md ring-2 ring-white"
        data-testid={`pin-${i}`}
      >{i + 1}</div>)}
    </div>
    <div className="mt-3 space-y-2">
      {points.map((p, i) => <div key={p.id} className="flex items-center gap-2">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-[11px] font-extrabold text-primary-foreground">{i + 1}</span>
        <input value={p.label} onChange={(e) => onChange(points.map((pt) => pt.id === p.id ? { ...pt, label: e.target.value } : pt))} placeholder={`Correct answer for pin ${i + 1}`} className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-xs" data-testid={`input-pin-label-${i}`} />
        <input value={p.marks ?? ''} onChange={(e) => onChange(points.map((pt) => pt.id === p.id ? { ...pt, marks: e.target.value ? Number(e.target.value) : null } : pt))} type="number" min="0" step="0.5" placeholder="Marks" className="h-9 w-20 rounded-lg border border-border bg-background px-2 text-xs" data-testid={`input-pin-marks-${i}`} />
        <button onClick={() => onChange(points.filter((pt) => pt.id !== p.id))} className="rounded-lg p-1.5 text-muted-foreground hover:text-destructive" data-testid={`button-remove-pin-${i}`}><X size={13} /></button>
      </div>)}
      {!points.length && <p className="text-[11px] text-muted-foreground">No pins yet — click the image above to add one.</p>}
      <p className="text-[10px] text-muted-foreground">Leave marks blank per pin to split the station's total marks evenly across all pins.</p>
    </div>
  </div>;
}

function StationForm({ initial, onSave, onCancel, pending, examType, modules, blocks }: { initial?: OspeStation; onSave: (body: Partial<OspeStation>) => void; onCancel: () => void; pending: boolean; examType: OspeExamType; modules: OspeModule[]; blocks: OspeBlock[] }) {
  const [title, setTitle] = useState(initial?.title || '');
  const [instructions, setInstructions] = useState(initial?.instructions || '');
  const [moduleId, setModuleId] = useState<number | null>(initial?.moduleId ?? null);
  const [blockId, setBlockId] = useState<number | null>(initial?.blockId ?? null);
  const [imagePath, setImagePath] = useState<string | null>(initial?.imagePath ?? null);
  const [attachmentPath, setAttachmentPath] = useState<string | null>(initial?.attachmentPath ?? null);
  const [answerType, setAnswerType] = useState<'MCQ' | 'WRITTEN' | 'LABELING'>(initial?.answerType || 'WRITTEN');
  const [options, setOptions] = useState<string[]>(initial?.options && initial.options.length ? initial.options : ['', '']);
  const [correctAnswer, setCorrectAnswer] = useState(initial?.correctAnswer || '');
  const [modelAnswer, setModelAnswer] = useState(initial?.modelAnswer || '');
  const [labelPoints, setLabelPoints] = useState<OspeLabelPoint[]>(initial?.labelPoints || []);
  const [marks, setMarks] = useState(String(initial?.marks ?? 1));
  const [timeLimitSeconds, setTimeLimitSeconds] = useState(initial?.timeLimitSeconds ? String(initial.timeLimitSeconds) : '');
  const [kind, setKind] = useState<string | null>(initial?.programTargetKind ?? null);
  const [year, setYear] = useState<number | null>(initial?.yearTargetNumber ?? null);

  return <div className="mt-3 space-y-2 rounded-xl border border-border bg-background p-3">
    <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={'Station title (e.g. "Specimen 4 — identify this bone")'} className="h-10 w-full rounded-xl border border-border bg-card px-3 text-xs" data-testid="input-station-title" />
    <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Instructions / scenario shown to the student" rows={3} className="w-full rounded-xl border border-border bg-card p-3 text-xs" data-testid="textarea-station-instructions" />
    <BlockModulePicker blocks={blocks} modules={modules} blockId={blockId} moduleId={moduleId} onChange={(n) => { setBlockId(n.blockId); setModuleId(n.moduleId); }} idPrefix="station" />
    <div className="grid gap-2 sm:grid-cols-2">
      <FileField label="Photo / specimen image" icon={ImageIcon} accept="image/*" path={imagePath} onUpload={setImagePath} testId="input-station-image" />
      <FileField label="Attachment (optional)" icon={Paperclip} path={attachmentPath} onUpload={setAttachmentPath} testId="input-station-attachment" />
    </div>
    {imagePath && answerType !== 'LABELING' && <img src={resolveUploadUrl(imagePath) ?? undefined} alt="" className="h-28 w-full rounded-lg object-cover" />}

    <div className="rounded-xl border border-border bg-card p-3">
      <div className="mb-2 flex items-center gap-2 text-[11px] font-bold text-muted-foreground"><ListChecks size={13} /> How the student answers</div>
      <div className="inline-flex rounded-xl border border-border p-1">
        {(['WRITTEN', 'MCQ', 'LABELING'] as const).map((t) => <button key={t} onClick={() => setAnswerType(t)} className={cn('rounded-lg px-3 py-1.5 text-[11px] font-extrabold', answerType === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')} data-testid={`button-answer-type-${t}`}>{t === 'MCQ' ? 'Select correct answer' : t === 'LABELING' ? 'Identification (pin the label)' : 'Write an answer'}</button>)}
      </div>
      {answerType === 'MCQ' ? <div className="mt-3 space-y-2">
        {options.map((opt, i) => <div key={i} className="flex items-center gap-2">
          <input type="radio" name="correct-option" checked={correctAnswer === opt && !!opt} onChange={() => setCorrectAnswer(opt)} data-testid={`radio-station-correct-${i}`} />
          <input value={opt} onChange={(e) => { const next = [...options]; next[i] = e.target.value; setOptions(next); if (correctAnswer === opt) setCorrectAnswer(e.target.value); }} placeholder={`Option ${i + 1}`} className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-xs" data-testid={`input-station-option-${i}`} />
          {options.length > 2 && <button onClick={() => setOptions(options.filter((_, j) => j !== i))} className="rounded-lg p-1.5 text-muted-foreground hover:text-destructive" data-testid={`button-remove-option-${i}`}><X size={13} /></button>}
        </div>)}
        <button onClick={() => setOptions([...options, ''])} className="text-[11px] font-bold text-primary" data-testid="button-add-option">+ Add option</button>
        <p className="text-[10px] text-muted-foreground">Select the radio button next to the correct option.</p>
      </div> : answerType === 'LABELING' ? <IdentificationEditor imagePath={imagePath} points={labelPoints} onChange={setLabelPoints} />
        : <textarea value={modelAnswer} onChange={(e) => setModelAnswer(e.target.value)} placeholder="Model answer / marking scheme — the student's written answer is graded by AI against this" rows={3} className="mt-3 w-full rounded-lg border border-border bg-background p-3 text-xs" data-testid="textarea-station-model-answer" />}
    </div>

    <div className="grid gap-2 sm:grid-cols-2">
      <input value={marks} onChange={(e) => setMarks(e.target.value)} type="number" min="0" step="0.5" placeholder="Marks" className="h-10 rounded-xl border border-border bg-card px-3 text-xs" data-testid="input-station-marks" />
      <input value={timeLimitSeconds} onChange={(e) => setTimeLimitSeconds(e.target.value)} type="number" min="0" placeholder="Time limit at this station, seconds (optional)" className="h-10 rounded-xl border border-border bg-card px-3 text-xs" data-testid="input-station-time-limit" />
    </div>
    <TargetingSelect programTargetKind={kind} yearTargetNumber={year} onChange={(k, y) => { setKind(k); setYear(y); }} idPrefix="station" />
    <div className="flex justify-end gap-2">
      <button onClick={onCancel} className="rounded-lg px-3 py-1.5 text-[11px] font-bold text-muted-foreground hover:bg-muted" data-testid="button-cancel-station">Cancel</button>
      <button
        onClick={() => onSave({
          title, instructions, moduleId, blockId, examType, imagePath, attachmentPath, answerType,
          options: answerType === 'MCQ' ? options.filter((o) => o.trim()) : null,
          correctAnswer: answerType === 'MCQ' ? correctAnswer || null : null,
          modelAnswer: answerType === 'WRITTEN' ? modelAnswer || null : null,
          labelPoints: answerType === 'LABELING' ? labelPoints.filter((p) => p.label.trim()) : null,
          marks: Number(marks) || 1, timeLimitSeconds: timeLimitSeconds ? Number(timeLimitSeconds) : null,
          programTargetKind: kind, yearTargetNumber: year,
        })}
        disabled={pending || !title.trim()
          || (answerType === 'MCQ' && (!correctAnswer || options.filter((o) => o.trim()).length < 2))
          || (answerType === 'LABELING' && (!imagePath || labelPoints.filter((p) => p.label.trim()).length < 1))}
        className="rounded-lg bg-primary px-3 py-1.5 text-[11px] font-bold text-primary-foreground disabled:opacity-50" data-testid="button-save-station"
      >{pending ? 'Saving…' : 'Save'}</button>
    </div>
  </div>;
}

function StationsTab({ examType }: { examType: OspeExamType }) {
  const stationsQ = useQuery({ queryKey: ['ospe-admin-stations', examType], queryFn: () => ospeAdminApi.stations.list(examType) });
  const modulesQ = useQuery({ queryKey: ['ospe-admin-modules', examType], queryFn: () => ospeAdminApi.modules.list(examType) });
  const blocksQ = useQuery({ queryKey: ['ospe-admin-blocks', examType], queryFn: () => ospeAdminApi.blocks.list(examType) });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['ospe-admin-stations'] });
  const create = useMutation({ mutationFn: ospeAdminApi.stations.create, onSuccess: () => { invalidate(); setAdding(false); } });
  const update = useMutation({ mutationFn: ({ id, body }: { id: number; body: Partial<OspeStation> }) => ospeAdminApi.stations.update(id, body), onSuccess: () => { invalidate(); setEditingId(null); } });
  const remove = useMutation({ mutationFn: ospeAdminApi.stations.removePermanent, onSuccess: () => { invalidate(); setDeletingId(null); }, onError: (err: unknown) => toast({ title: 'Could not delete station', description: errMsg(err), variant: 'destructive' }) });

  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const stations = stationsQ.data || [];
  const modules = modulesQ.data || [];
  const blocks = blocksQ.data || [];
  const stationGroups = groupTargetable(stations);

  const stationRow = (s: OspeStation) => <div key={s.id} className="border-b border-border p-4 last:border-0" data-testid={`row-station-${s.id}`}>
    <div className="flex flex-wrap items-center gap-3 sm:flex-nowrap">
      {s.imagePath ? <img src={resolveUploadUrl(s.imagePath) ?? undefined} alt="" className="size-12 shrink-0 rounded-lg object-cover" /> : <div className="grid size-12 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"><Stethoscope size={18} /></div>}
      <div className="min-w-[160px] flex-1"><p className="text-sm font-bold leading-5">{s.title}</p><p className="mt-1 text-xs text-muted-foreground">{s.answerType === 'MCQ' ? 'Multiple choice' : s.answerType === 'LABELING' ? `Identification · ${(s.labelPoints || []).length} pin${(s.labelPoints || []).length === 1 ? '' : 's'}` : 'Written (AI graded)'} · {s.marks} mark{s.marks === 1 ? '' : 's'} · {s.targetingLabel}</p>{(s.blockId || s.moduleId) && <p className="mt-0.5 text-[10px] font-semibold text-primary">{[blocks.find((b) => b.id === s.blockId)?.name, modules.find((m) => m.id === s.moduleId)?.name].filter(Boolean).join(' › ')}</p>}</div>
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => update.mutate({ id: s.id, body: { active: !s.active } })} className={cn('rounded-lg px-2 py-1 text-[10px] font-extrabold', s.active ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground')} data-testid={`button-toggle-station-${s.id}`}>{s.active ? 'Active' : 'Hidden'}</button>
        <button onClick={() => setEditingId(editingId === s.id ? null : s.id)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted" data-testid={`button-edit-station-${s.id}`}><Pencil size={14} /></button>
        <button onClick={() => setDeletingId(s.id)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" data-testid={`button-delete-station-${s.id}`}><Trash2 size={14} /></button>
      </div>
    </div>
    {editingId === s.id && <StationForm initial={s} examType={examType} modules={modules} blocks={blocks} onCancel={() => setEditingId(null)} pending={update.isPending} onSave={(body) => update.mutate({ id: s.id, body })} />}
  </div>;

  return <div>
    <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-extrabold">Station bank</h3><button onClick={() => setAdding((v) => !v)} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-foreground" data-testid="button-toggle-add-station"><Plus size={15} /> {adding ? 'Close' : 'Add station'}</button></div>
    {adding && <StationForm examType={examType} modules={modules} blocks={blocks} onCancel={() => setAdding(false)} pending={create.isPending} onSave={(body) => create.mutate(body)} />}
    {!stations.length && !adding ? <EmptyState icon={Stethoscope} title="No stations yet" body="Build up a bank of stations here, then attach a set of them to an exam under the Exams tab." /> : <div className="mt-3">{stationGroups.map((g) => <CollapsibleGroup key={g.degree || 'unspecified'} defaultOpen icon={<GraduationCap size={14} />} title={g.degree === 'MBBS' || g.degree === 'BDS' ? `${g.degree} colleges` : 'Unspecified degree'} count={g.groups.reduce((sum, yg) => sum + yg.items.length, 0)} testId={`stations-degree-${g.degree || 'unspecified'}`}>
      {g.groups.map((yg) => <CollapsibleGroup key={yg.year || 'no-year'} defaultOpen nested title={yg.year ? [yg.year, (g.degree === 'MBBS' || g.degree === 'BDS') ? g.degree : ''].filter(Boolean).join(' ') : 'No year set'} count={yg.items.length} testId={`stations-year-${g.degree || 'unspecified'}-${yg.year || 'no-year'}`}>
        <div className="rounded-2xl border border-border bg-card">{yg.items.map(stationRow)}</div>
      </CollapsibleGroup>)}
    </CollapsibleGroup>)}</div>}
    {deletingId !== null && <ConfirmDialog title="Permanently delete this station?" body="This can't be done while it's attached to an exam paper — remove it from any papers first. There is no undo." confirmLabel="Delete forever" onCancel={() => setDeletingId(null)} onConfirm={() => remove.mutate(deletingId)} pending={remove.isPending} />}
  </div>;
}

// ---------------------------------------------------------------------------
// Exams (papers built from stations)
// ---------------------------------------------------------------------------

function toLocalInput(iso?: string): string { if (!iso) return ''; const d = new Date(iso); const pad = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; }

function ExamForm({ initial, onSave, onCancel, pending, examType }: { initial?: OspeAdminExam; onSave: (body: Partial<OspeAdminExam> & { startAt: string; endAt: string }) => void; onCancel: () => void; pending: boolean; examType: OspeExamType }) {
  const [title, setTitle] = useState(initial?.title || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [durationMinutes, setDurationMinutes] = useState(String(initial?.durationMinutes ?? 60));
  const [startAt, setStartAt] = useState(toLocalInput(initial?.startAt));
  const [endAt, setEndAt] = useState(toLocalInput(initial?.endAt));
  const [maxAttempts, setMaxAttempts] = useState(String(initial?.maxAttempts ?? 1));
  const [passingPercent, setPassingPercent] = useState(initial?.passingPercent != null ? String(initial.passingPercent) : '');
  const [resultReleaseMode, setResultReleaseMode] = useState(initial?.resultReleaseMode || 'immediate');
  const [showMarks, setShowMarks] = useState(initial?.showMarks ?? true);
  const [showPercentage, setShowPercentage] = useState(initial?.showPercentage ?? true);
  const [showCorrectAnswers, setShowCorrectAnswers] = useState(initial?.showCorrectAnswers ?? true);
  const [kind, setKind] = useState<string | null>(initial?.programTargetKind ?? null);
  const [year, setYear] = useState<number | null>(initial?.yearTargetNumber ?? null);
  const [status, setStatus] = useState(initial?.status || 'draft');

  return <div className="mt-3 space-y-2 rounded-xl border border-border bg-background p-3">
    <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Exam title" className="h-10 w-full rounded-xl border border-border bg-card px-3 text-xs" data-testid="input-exam-title" />
    <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)" rows={2} className="w-full rounded-xl border border-border bg-card p-3 text-xs" data-testid="textarea-exam-description" />
    <div className="grid gap-2 sm:grid-cols-2">
      <label className="block"><span className="mb-1 block text-[10px] font-bold text-muted-foreground">Opens</span><input value={startAt} onChange={(e) => setStartAt(e.target.value)} type="datetime-local" className="h-10 w-full rounded-xl border border-border bg-card px-3 text-xs" data-testid="input-exam-start" /></label>
      <label className="block"><span className="mb-1 block text-[10px] font-bold text-muted-foreground">Closes</span><input value={endAt} onChange={(e) => setEndAt(e.target.value)} type="datetime-local" className="h-10 w-full rounded-xl border border-border bg-card px-3 text-xs" data-testid="input-exam-end" /></label>
    </div>
    <div className="grid gap-2 sm:grid-cols-3">
      <label className="block"><span className="mb-1 block text-[10px] font-bold text-muted-foreground">Duration (min)</span><input value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} type="number" min="1" className="h-10 w-full rounded-xl border border-border bg-card px-3 text-xs" data-testid="input-exam-duration" /></label>
      <label className="block"><span className="mb-1 block text-[10px] font-bold text-muted-foreground">Max attempts</span><input value={maxAttempts} onChange={(e) => setMaxAttempts(e.target.value)} type="number" min="1" className="h-10 w-full rounded-xl border border-border bg-card px-3 text-xs" data-testid="input-exam-max-attempts" /></label>
      <label className="block"><span className="mb-1 block text-[10px] font-bold text-muted-foreground">Passing % (optional)</span><input value={passingPercent} onChange={(e) => setPassingPercent(e.target.value)} type="number" min="0" max="100" className="h-10 w-full rounded-xl border border-border bg-card px-3 text-xs" data-testid="input-exam-passing-percent" /></label>
    </div>
    <div className="grid gap-2 sm:grid-cols-2">
      <select value={resultReleaseMode} onChange={(e) => setResultReleaseMode(e.target.value)} className="h-10 rounded-xl border border-border bg-card px-3 text-xs" data-testid="select-exam-release-mode">
        <option value="immediate">Release results immediately on submit</option>
        <option value="after_end">Release once the exam window closes</option>
        <option value="manual">Release manually (admin controlled)</option>
      </select>
      <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-10 rounded-xl border border-border bg-card px-3 text-xs" data-testid="select-exam-status">
        <option value="draft">Draft (not visible to students)</option>
        <option value="published">Published</option>
        <option value="archived">Archived</option>
      </select>
    </div>
    <div className="flex flex-wrap gap-4 rounded-xl border border-border bg-card px-3 py-2.5 text-[11px] font-bold">
      <label className="flex items-center gap-1.5"><input type="checkbox" checked={showMarks} onChange={(e) => setShowMarks(e.target.checked)} data-testid="checkbox-exam-show-marks" /> Show marks</label>
      <label className="flex items-center gap-1.5"><input type="checkbox" checked={showPercentage} onChange={(e) => setShowPercentage(e.target.checked)} data-testid="checkbox-exam-show-percentage" /> Show percentage</label>
      <label className="flex items-center gap-1.5"><input type="checkbox" checked={showCorrectAnswers} onChange={(e) => setShowCorrectAnswers(e.target.checked)} data-testid="checkbox-exam-show-answers" /> Show model answers after submit</label>
    </div>
    <TargetingSelect programTargetKind={kind} yearTargetNumber={year} onChange={(k, y) => { setKind(k); setYear(y); }} idPrefix="exam" />
    <div className="flex justify-end gap-2">
      <button onClick={onCancel} className="rounded-lg px-3 py-1.5 text-[11px] font-bold text-muted-foreground hover:bg-muted" data-testid="button-cancel-exam">Cancel</button>
      <button
        onClick={() => onSave({
          title, description, examType, durationMinutes: Number(durationMinutes) || 60,
          startAt: new Date(startAt).toISOString(), endAt: new Date(endAt).toISOString(),
          maxAttempts: Number(maxAttempts) || 1, passingPercent: passingPercent ? Number(passingPercent) : null,
          resultReleaseMode: resultReleaseMode as 'immediate' | 'after_end' | 'manual', showMarks, showPercentage, showCorrectAnswers,
          programTargetKind: kind, yearTargetNumber: year, status: status as 'draft' | 'published' | 'archived',
        })}
        disabled={pending || !title.trim() || !startAt || !endAt}
        className="rounded-lg bg-primary px-3 py-1.5 text-[11px] font-bold text-primary-foreground disabled:opacity-50" data-testid="button-save-exam"
      >{pending ? 'Saving…' : 'Save'}</button>
    </div>
  </div>;
}

function ExamStationsPanel({ exam, allStations }: { exam: OspeAdminExam; allStations: OspeStation[] }) {
  const currentQ = useQuery({ queryKey: ['ospe-admin-exam-stations', exam.id], queryFn: () => ospeAdminApi.exams.getStations(exam.id) });
  const [selected, setSelected] = useState<number[] | null>(null);
  useEffect(() => { if (currentQ.data) setSelected(currentQ.data.map((s) => s.id)); }, [currentQ.data]);
  const save = useMutation({
    mutationFn: () => ospeAdminApi.exams.setStations(exam.id, selected || []),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['ospe-admin-exam-stations', exam.id] }); queryClient.invalidateQueries({ queryKey: ['ospe-admin-exams'] }); toast({ title: 'Stations updated' }); },
    onError: (err: unknown) => toast({ title: 'Could not update stations', description: errMsg(err), variant: 'destructive' }),
  });
  if (!selected) return <p className="p-3 text-xs text-muted-foreground">Loading…</p>;
  return <div className="space-y-2 p-3">
    <p className="text-[11px] text-muted-foreground">Pick which stations from the bank belong to this paper.</p>
    <div className="max-h-72 space-y-1 overflow-y-auto rounded-xl border border-border bg-card p-2">
      {allStations.map((s) => <label key={s.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-muted" data-testid={`checkbox-exam-station-${s.id}`}>
        <input type="checkbox" checked={selected.includes(s.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, s.id] : selected.filter((id) => id !== s.id))} />
        {s.title} <span className="text-muted-foreground">· {s.marks} mark{s.marks === 1 ? '' : 's'} · {s.answerType}</span>
      </label>)}
      {!allStations.length && <p className="p-2 text-xs text-muted-foreground">No stations in the bank yet — add some under the Stations tab first.</p>}
    </div>
    <button onClick={() => save.mutate()} disabled={save.isPending || !selected.length} className="rounded-lg bg-primary px-3 py-1.5 text-[11px] font-bold text-primary-foreground disabled:opacity-50" data-testid="button-save-exam-stations">{save.isPending ? 'Saving…' : `Save (${selected.length} selected)`}</button>
  </div>;
}

function ExamAttemptsPanel({ exam }: { exam: OspeAdminExam }) {
  const attemptsQ = useQuery({ queryKey: ['ospe-admin-exam-attempts', exam.id], queryFn: () => ospeAdminApi.exams.attempts(exam.id) });
  const releaseOne = useMutation({ mutationFn: ospeAdminApi.exams.releaseOne, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ospe-admin-exam-attempts', exam.id] }) });
  const releaseAll = useMutation({ mutationFn: () => ospeAdminApi.exams.releaseAll(exam.id), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ospe-admin-exam-attempts', exam.id] }) });
  const attempts = attemptsQ.data || [];
  return <div className="space-y-2 p-3">
    {exam.resultReleaseMode === 'manual' && attempts.some((a) => a.status === 'submitted' && !a.resultsReleasedAt) && <button onClick={() => releaseAll.mutate()} disabled={releaseAll.isPending} className="rounded-lg border border-border px-3 py-1.5 text-[11px] font-bold hover:bg-muted" data-testid="button-release-all-attempts">{releaseAll.isPending ? 'Releasing…' : 'Release all submitted results'}</button>}
    {!attempts.length ? <p className="text-xs text-muted-foreground">No attempts yet.</p> : <div className="overflow-x-auto rounded-xl border border-border"><table className="w-full text-left text-xs"><thead className="bg-muted/50 text-[10px] font-bold uppercase text-muted-foreground"><tr><th className="px-3 py-2">Student</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Marks</th><th className="px-3 py-2">%</th><th className="px-3 py-2" /></tr></thead><tbody>
      {attempts.map((a) => <tr key={a.id} className="border-t border-border" data-testid={`row-attempt-${a.id}`}>
        <td className="px-3 py-2 font-semibold">{a.studentName}<div className="text-[10px] text-muted-foreground">{a.institution}</div></td>
        <td className="px-3 py-2">{a.status}</td>
        <td className="px-3 py-2">{a.obtainedMarks}/{a.totalMarks}</td>
        <td className="px-3 py-2">{a.percentage}%</td>
        <td className="px-3 py-2 text-right">{exam.resultReleaseMode === 'manual' && a.status === 'submitted' && !a.resultsReleasedAt && <button onClick={() => releaseOne.mutate(a.id)} disabled={releaseOne.isPending} className="rounded-lg border border-border px-2 py-1 text-[10px] font-bold hover:bg-muted" data-testid={`button-release-attempt-${a.id}`}>Release</button>}</td>
      </tr>)}
    </tbody></table></div>}
  </div>;
}

function ExamsTab({ examType }: { examType: OspeExamType }) {
  const examsQ = useQuery({ queryKey: ['ospe-admin-exams', examType], queryFn: () => ospeAdminApi.exams.list(examType) });
  const stationsQ = useQuery({ queryKey: ['ospe-admin-stations', examType], queryFn: () => ospeAdminApi.stations.list(examType) });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['ospe-admin-exams'] });
  const create = useMutation({ mutationFn: ospeAdminApi.exams.create, onSuccess: () => { invalidate(); setAdding(false); } });
  const update = useMutation({ mutationFn: ({ id, body }: { id: number; body: Partial<OspeAdminExam> }) => ospeAdminApi.exams.update(id, body), onSuccess: () => { invalidate(); setEditingId(null); } });
  const archive = useMutation({ mutationFn: ospeAdminApi.exams.archive, onSuccess: invalidate });
  const removePermanent = useMutation({
    mutationFn: ({ id, force }: { id: number; force?: boolean }) => ospeAdminApi.exams.removePermanent(id, force),
    onSuccess: () => { invalidate(); setDeletingId(null); setForceDeleteInfo(null); },
    onError: (err: unknown) => {
      if (err instanceof ApiRequestError && err.status === 409 && (err.data as { requiresForce?: boolean } | null)?.requiresForce) { setForceDeleteInfo(err.message); return; }
      toast({ title: 'Could not delete exam', description: errMsg(err), variant: 'destructive' });
    },
  });

  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [forceDeleteInfo, setForceDeleteInfo] = useState<string | null>(null);
  const [stationsPanelId, setStationsPanelId] = useState<number | null>(null);
  const [attemptsPanelId, setAttemptsPanelId] = useState<number | null>(null);

  const exams = examsQ.data || [];
  const stations = stationsQ.data || [];
  const examGroups = groupTargetable(exams);

  const examRow = (ex: OspeAdminExam) => <div key={ex.id} className="border-b border-border p-4 last:border-0" data-testid={`row-exam-${ex.id}`}>
    <div className="flex flex-wrap items-center gap-3 sm:flex-nowrap">
      <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-info/15 text-info"><ClipboardCheck size={17} /></div>
      <div className="min-w-[160px] flex-1"><p className="text-sm font-bold">{ex.title}</p><p className="mt-1 text-xs text-muted-foreground">{ex.stationCount} station{ex.stationCount === 1 ? '' : 's'} · {ex.attemptCount} attempt{ex.attemptCount === 1 ? '' : 's'} · {new Date(ex.startAt).toLocaleString()} – {new Date(ex.endAt).toLocaleString()}</p></div>
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-extrabold', ex.status === 'published' ? 'bg-primary/15 text-primary' : ex.status === 'archived' ? 'bg-muted text-muted-foreground' : 'bg-accent/15 text-accent-text')} data-testid={`text-exam-status-${ex.id}`}>{ex.status}</span>
        <button onClick={() => setStationsPanelId(stationsPanelId === ex.id ? null : ex.id)} className={cn('rounded-lg px-3 py-1.5 text-[11px] font-bold', stationsPanelId === ex.id ? 'bg-primary/10 text-primary' : 'border border-border text-muted-foreground hover:bg-muted')} data-testid={`button-manage-stations-${ex.id}`}>Stations</button>
        <button onClick={() => setAttemptsPanelId(attemptsPanelId === ex.id ? null : ex.id)} className={cn('rounded-lg px-3 py-1.5 text-[11px] font-bold', attemptsPanelId === ex.id ? 'bg-primary/10 text-primary' : 'border border-border text-muted-foreground hover:bg-muted')} data-testid={`button-view-attempts-${ex.id}`}>Attempts</button>
        <button onClick={() => setEditingId(editingId === ex.id ? null : ex.id)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted" data-testid={`button-edit-exam-${ex.id}`}><Pencil size={14} /></button>
        {ex.status !== 'archived' ? <button onClick={() => archive.mutate(ex.id)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted" title="Archive" data-testid={`button-archive-exam-${ex.id}`}><RotateCcw size={14} /></button> : null}
        <button onClick={() => setDeletingId(ex.id)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" title="Delete forever" data-testid={`button-delete-exam-${ex.id}`}><Trash2 size={14} /></button>
      </div>
    </div>
    {editingId === ex.id && <ExamForm initial={ex} examType={examType} onCancel={() => setEditingId(null)} pending={update.isPending} onSave={(body) => update.mutate({ id: ex.id, body })} />}
    {stationsPanelId === ex.id && <div className="mt-3 rounded-xl border border-border"><ExamStationsPanel exam={ex} allStations={stations} /></div>}
    {attemptsPanelId === ex.id && <div className="mt-3 rounded-xl border border-border"><ExamAttemptsPanel exam={ex} /></div>}
  </div>;

  return <div>
    <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-extrabold">Exam papers</h3><button onClick={() => setAdding((v) => !v)} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-foreground" data-testid="button-toggle-add-exam"><Plus size={15} /> {adding ? 'Close' : 'Add exam'}</button></div>
    {adding && <ExamForm examType={examType} onCancel={() => setAdding(false)} pending={create.isPending} onSave={(body) => create.mutate(body)} />}
    {!exams.length && !adding ? <EmptyState icon={ClipboardCheck} title="No exams yet" body="Create an exam, then attach stations from the bank to it." /> : <div className="mt-3">{examGroups.map((g) => <CollapsibleGroup key={g.degree || 'unspecified'} defaultOpen icon={<GraduationCap size={14} />} title={g.degree === 'MBBS' || g.degree === 'BDS' ? `${g.degree} colleges` : 'Unspecified degree'} count={g.groups.reduce((sum, yg) => sum + yg.items.length, 0)} testId={`exams-degree-${g.degree || 'unspecified'}`}>
      {g.groups.map((yg) => <CollapsibleGroup key={yg.year || 'no-year'} defaultOpen nested title={yg.year ? [yg.year, (g.degree === 'MBBS' || g.degree === 'BDS') ? g.degree : ''].filter(Boolean).join(' ') : 'No year set'} count={yg.items.length} testId={`exams-year-${g.degree || 'unspecified'}-${yg.year || 'no-year'}`}>
        <div className="rounded-2xl border border-border bg-card">{yg.items.map(examRow)}</div>
      </CollapsibleGroup>)}
    </CollapsibleGroup>)}</div>}
    {deletingId !== null && <ConfirmDialog title="Permanently delete this exam?" body={forceDeleteInfo || 'This erases the exam paper for good. There is no undo.'} confirmLabel={forceDeleteInfo ? 'Delete anyway' : 'Delete forever'} onCancel={() => { setDeletingId(null); setForceDeleteInfo(null); }} onConfirm={() => removePermanent.mutate({ id: deletingId, force: !!forceDeleteInfo })} pending={removePermanent.isPending} />}
  </div>;
}

// ---------------------------------------------------------------------------
// Top-level page
// ---------------------------------------------------------------------------

function AdminOspeOsce() {
  const [tab, setTab] = useState<Tab>('blocks');
  const [examType, setExamType] = useState<OspeExamType>('OSPE');
  const tabs: Array<{ key: Tab; label: string }> = [
    { key: 'blocks', label: 'Blocks & modules' },
    { key: 'materials', label: 'Learning material' },
    { key: 'stations', label: 'Stations (bank)' },
    { key: 'exams', label: 'Exams' },
  ];
  return <div>
    <SectionHeader eyebrow="Practical exams" title="OSPE / OSCE" action={<ExamTypeToggle value={examType} onChange={setExamType} />} />
    <div className="mb-5 inline-flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1">
      {tabs.map((t) => <button key={t.key} onClick={() => setTab(t.key)} className={cn('rounded-lg px-3.5 py-2 text-xs font-extrabold transition-colors', tab === t.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')} data-testid={`tab-${t.key}`}>{t.label}</button>)}
    </div>
    {tab === 'blocks' && <BlocksModulesTab examType={examType} />}
    {tab === 'materials' && <LearningMaterialsTab examType={examType} />}
    {tab === 'stations' && <StationsTab examType={examType} />}
    {tab === 'exams' && <ExamsTab examType={examType} />}
  </div>;
}

export default AdminOspeOsce;
