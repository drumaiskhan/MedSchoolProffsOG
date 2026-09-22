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
