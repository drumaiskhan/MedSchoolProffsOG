// Auto-extracted route page — code-split via React.lazy() in App.tsx.
//
// Perf fix: this file's import list used to pull in almost the entire admin
// app by mistake — payments, exams, MCQ import, the AI visualizer and its
// step controls, every admin API hook, etc. — none of which this page
// (a grid of block/module cards) ever uses. Because this route is its own
// lazy chunk, all of that unused code still had to be downloaded, parsed
// and evaluated every time a student opened Blocks, which is exactly what
// showed up as lag/stutter on first open. Trimmed to only what's actually
// referenced below.
import { BookOpen, Library, Search } from 'lucide-react';
import { EmptyState, ModuleCard, SectionHeader, SkeletonPage, useModulesGrouping } from '@/lib/shared';
import { BlockPoster, CurriculumBanner, weightedProgress } from '@/components/blocks/BlockCards';

function Blocks() {
  const { isLoading, modules, blocks, filtered, modulesByBlock, unassigned, search, setSearch } = useModulesGrouping();
  const hasBlocks = blocks.length > 0;
  // No blocks configured at all yet — fall back to the plain modules grid, so a
  // deployment that hasn't set up Blocks isn't left with an empty landing page.
  if (!isLoading && !hasBlocks) return <div><SectionHeader eyebrow="Curriculum map" title="Learning modules" action={<div className="relative"><Search className="absolute left-3 top-2.5 text-muted-foreground" size={15} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a module" className="h-9 w-40 rounded-xl border border-border bg-card pl-9 pr-3 text-xs outline-none focus:ring-2 focus:ring-primary/20" data-testid="input-search-modules" /></div>} />
    <div className="bk-grid">{filtered.map((m, i) => <ModuleCard key={m.id} m={m} i={i} />)}</div>
    {!filtered.length && <EmptyState icon={BookOpen} title="No modules yet" body="Your academic team hasn't published any modules yet." />}
  </div>;
  if (isLoading) return <SkeletonPage />;
  const totalQuestions = modules.reduce((sum, m) => sum + m.mcqCount, 0);
  const blockCount = blocks.length + (unassigned.length > 0 ? 1 : 0);
  return <div className="bk-page" data-testid="page-blocks">
    <CurriculumBanner eyebrow="Curriculum map" title="Blocks" description="Pick a block to see its modules, subjects and practice questions."
      stats={[{ label: blockCount === 1 ? 'Block' : 'Blocks', value: blockCount }, { label: modules.length === 1 ? 'Module' : 'Modules', value: modules.length }, { label: 'Questions', value: totalQuestions }]} />
    <div className="bk-grid">
      {blocks.map((b, i) => {
        const list = modulesByBlock.get(b.id) ?? [];
        return <BlockPoster key={b.id} index={i} href={`/blocks/${b.id}`} name={b.name} iconUrl={b.iconUrl} subtitle={b.subtitle || undefined}
          moduleCount={list.length} subjectCount={list.reduce((n, m) => n + m.subjectCount, 0)} questionCount={list.reduce((n, m) => n + m.mcqCount, 0)} progress={weightedProgress(list)} />;
      })}
      {unassigned.length > 0 && <BlockPoster index={blocks.length} href="/blocks/other" name="Other modules" muted moduleCount={unassigned.length}
        subjectCount={unassigned.reduce((n, m) => n + m.subjectCount, 0)} questionCount={unassigned.reduce((n, m) => n + m.mcqCount, 0)} progress={weightedProgress(unassigned)} />}
    </div>
    {!blocks.length && !unassigned.length && <EmptyState icon={Library} title="No blocks yet" body="Your academic team hasn't published any blocks yet." />}
  </div>;
}

export default Blocks;
