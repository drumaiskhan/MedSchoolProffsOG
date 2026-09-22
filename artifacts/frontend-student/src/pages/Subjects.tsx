// Subjects (module → subjects) and Topics (subject → topics).
// One route component, two views. v43: rebuilt on components/curriculum —
// tilting 3D subject cards, a hero stage with progress, a learning-path topic
// list, search/filter, and proper loading placeholders.
import { useDeferredValue, useMemo, useState } from 'react';
import { Link, useParams } from 'wouter';
import { ArrowLeft, BookOpen, SearchX, Target } from 'lucide-react';
import {
  getListModulesQueryKey, getListSubjectsQueryKey, useListModules, useListSubjects, useListTopics,
} from '@workspace/api-client-react';
import { EmptyState, SectionHeader, usePageTitle } from '@/lib/shared';
import {
  CardsSkeleton, FilterBar, RowsSkeleton, SubjectCard, SubjectsHero, TopicRow, TopicSeg, TopicsHero,
  type SubjectRow, type TopicFilter, type TopicItem,
} from '@/components/curriculum/Curriculum';

const norm = (v: string) => v.trim().toLowerCase();
/** Filters only kick in when a list is long enough for them to be useful. */
const FILTER_MIN = 6;

function TopicsView({ subjectId }: { subjectId?: number }) {
  const topicQ = useListTopics(subjectId ? { subjectId } : undefined);
  const topicsList: TopicItem[] = topicQ.data ?? [];
  // The subject's name/icon isn't in the topics response — fetch the list
  // (shares its cache with other pages) and look it up by id.
  const allSubjectsQ = useListSubjects(undefined, { query: { enabled: subjectId != null, queryKey: getListSubjectsQueryKey() } });
  const subjectRow = allSubjectsQ.data?.find((s) => s.id === subjectId) as SubjectRow | undefined;
  const subjectName = subjectRow?.name;
  usePageTitle(subjectId != null ? `Subjects / ${subjectName ?? '…'}` : undefined);

  const [query, setQuery] = useState('');
  const [seg, setSeg] = useState<TopicFilter>('all');
  const deferredQuery = useDeferredValue(query);

  const done = useMemo(() => topicsList.filter((t) => t.completed).length, [topicsList]);
  const questions = useMemo(() => topicsList.reduce((sum, t) => sum + (t.questionCount || 0), 0), [topicsList]);
  const next = useMemo(() => topicsList.find((t) => !t.completed) ?? null, [topicsList]);
  const visible = useMemo(() => {
    const q = norm(deferredQuery);
    return topicsList.filter((t) => (seg === 'all' || (seg === 'done') === t.completed) && (!q || t.name.toLowerCase().includes(q)));
  }, [topicsList, deferredQuery, seg]);
  const loading = topicQ.isLoading;

  return <div className="cu-page">
    <SectionHeader eyebrow="Choose a topic" title="Topics" action={<Link href="/blocks" className="text-xs font-bold text-primary" data-testid="link-back-modules"><ArrowLeft size={13} className="mr-1 inline" /> Blocks</Link>} />
    {subjectName
      ? <TopicsHero name={subjectName} iconUrl={subjectRow?.iconUrl} total={topicsList.length} done={done} questions={questions} next={next} />
      : subjectId != null && <div className="skeleton cu-skel-hero" aria-hidden="true" />}
    {loading ? <RowsSkeleton /> : <>
      {topicsList.length >= FILTER_MIN && <FilterBar query={query} onQuery={setQuery} placeholder="Search topics">
        <TopicSeg value={seg} onChange={setSeg} counts={{ all: topicsList.length, todo: topicsList.length - done, done }} />
      </FilterBar>}
      {topicsList.length > 0 && visible.length > 0 && <ul className="cu-path" data-testid="list-topics">
        {visible.map((t, i) => <TopicRow key={t.id} topic={t} index={i} isNext={t.id === next?.id} />)}
      </ul>}
      {topicsList.length > 0 && visible.length === 0 && <EmptyState icon={SearchX} title="No matching topics" body="Try a different word, or switch back to All." />}
      {!topicsList.length && <EmptyState icon={Target} title="No topics yet" body="Your academic team hasn't published topics for this subject yet." />}
    </>}
  </div>;
}

function SubjectsView({ moduleId }: { moduleId?: number }) {
  const subjectQ = useListSubjects(moduleId ? { moduleId } : undefined);
  const subjects: SubjectRow[] = (subjectQ.data as SubjectRow[] | undefined) ?? [];
  const modulesQ = useListModules(undefined, { query: { enabled: moduleId != null, queryKey: getListModulesQueryKey() } });
  const moduleName = modulesQ.data?.find((m) => m.id === moduleId)?.name;
  usePageTitle(moduleId != null ? `Modules / ${moduleName ?? '…'}` : undefined);

  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const totalTopics = useMemo(() => subjects.reduce((sum, s) => sum + (s.topicCount || 0), 0), [subjects]);
  const visible = useMemo(() => {
    const q = norm(deferredQuery);
    return q ? subjects.filter((s) => s.name.toLowerCase().includes(q)) : subjects;
  }, [subjects, deferredQuery]);
  const loading = subjectQ.isLoading;

  return <div className="cu-page">
    <SectionHeader eyebrow="Curriculum map" title="Subjects" action={<Link href="/blocks" className="text-xs font-bold text-primary" data-testid="link-subjects-back"><ArrowLeft size={13} className="mr-1 inline" /> Blocks</Link>} />
    {!loading && subjects.length > 0 && <SubjectsHero title={moduleName ?? (moduleId != null ? 'This module' : 'All subjects')} subjects={subjects} totalTopics={totalTopics} />}
    {loading ? <CardsSkeleton /> : <>
      {subjects.length >= FILTER_MIN && <FilterBar query={query} onQuery={setQuery} placeholder="Search subjects" />}
      {visible.length > 0 && <div className="cu-grid-cards" data-testid="grid-subjects">
        {visible.map((s, i) => <SubjectCard key={s.id} subject={s} index={i} />)}
      </div>}
      {subjects.length > 0 && visible.length === 0 && <EmptyState icon={SearchX} title="No matching subjects" body="Try a different word." />}
      {!subjects.length && <EmptyState icon={BookOpen} title="No subjects yet" body="Your academic team hasn't published subjects for this module yet." />}
    </>}
  </div>;
}

function Subjects({ topics = false }: { topics?: boolean }) {
  const params = useParams<{ id?: string }>();
  // On /subjects/:id the :id is a subject id (topics view); on /modules/:id
  // it's a module id (subjects view). The same route element is reused by the
  // router, so each view is keyed — its filter/search state must not leak from
  // one subject (or from Subjects into Topics) into the next.
  const routeId = Number(params.id) || undefined;
  return topics
    ? <TopicsView key={`topics-${routeId ?? 'all'}`} subjectId={routeId} />
    : <SubjectsView key={`subjects-${routeId ?? 'all'}`} moduleId={routeId} />;
}

export default Subjects;
