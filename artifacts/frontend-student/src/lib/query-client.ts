import { QueryClient } from '@tanstack/react-query';

// Single shared QueryClient instance. Several files (Shell's signed-out
// redirect, mutation onSuccess/onError handlers across the split-out page
// files) call queryClient.clear()/invalidateQueries()/setQueryData() —
// they all need the *same* instance App.tsx hands to QueryClientProvider,
// not one of their own, or cache reads/writes silently no-op against the
// wrong client. Previously each of those files referenced a bare
// `queryClient` global that only ever existed as a local const inside
// App.tsx — a ReferenceError everywhere else it was used.
export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
});

/** Query keys whose data changes when a practice session is saved. */
export const PRACTICE_DEPENDENT_QUERY_KEYS: ReadonlyArray<readonly string[]> = [
  ['continue-learning'], ['analytics'], ['progress-trend'], ['streak-card'], ['leaderboard-streak'], ['leaderboard'],
];

/**
 * Call after a practice session is saved. Without it the dashboard kept showing
 * the numbers from before the session for up to 30 s (the default staleTime) —
 * including "continue where you left off", which must point at the module the
 * student has JUST been working in. The generated dashboard hook keys itself by
 * URL, so it is matched by its path instead of a name.
 */
export function invalidatePracticeQueries(): void {
  for (const queryKey of PRACTICE_DEPENDENT_QUERY_KEYS) void queryClient.invalidateQueries({ queryKey: [...queryKey] });
  void queryClient.invalidateQueries({ predicate: (query) => typeof query.queryKey[0] === 'string' && (query.queryKey[0] as string).startsWith('/api/student/') });
}
