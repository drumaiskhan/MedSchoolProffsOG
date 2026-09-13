# Handoff note — v11 changes (for the next AI/dev)

Scope: 4 requested fixes/features, done as targeted edits (no schema
migrations — no new columns, no new tables). Not build-tested (no network
access to `pnpm install`) — only syntax-checked with `tsc --noEmit` on each
touched file in isolation (workspace-package import errors and pre-existing
implicit-`any`/lib-target noise are expected and ignored, same as the v10
note). **Run `pnpm dev` / a full build before trusting this in prod.**

## 1. Deleting a past paper now deletes its MCQs everywhere, not just the tag

The bug: `DELETE /past-papers/:id/permanent` (the route the admin "Delete"
button actually calls) used to just set `pastPaperId = null` on any MCQs
under that paper — they stayed in the question bank forever, untagged.
That's exactly what the screenshots showed: an "Mcqs" bank page listing
questions "with no module/subject/topic, exam, or past paper".

Fix:
- New shared helper `artifacts/api-server/src/lib/mcqCascade.ts` —
  `deleteMcqsEverywhere(mcqIds)` hard-deletes a set of MCQs plus every row
  anywhere else that references them: `med_practice_answers`,
  `med_exam_answers`, `med_exam_questions`, `med_notebook_entries`,
  `med_flagged_mcqs`, then the MCQs themselves. Order matters (dependents
  first) since there are no DB-level FK constraints to enforce it.
- `artifacts/api-server/src/routes/past-papers.ts`'s permanent-delete route
  now looks up every MCQ with that `pastPaperId`, calls the helper, then
  deletes the paper row. Response now includes `mcqsDeleted` count.
- Admin confirm-dialog copy updated in `frontend-admin/src/App.tsx` to say
  MCQs are removed for good, not just untagged.

## 2. Same for Pre-Proffs exams

`DELETE /admin/exams/:id/permanent` (`artifacts/api-server/src/routes/exams.ts`)
now also hard-deletes MCQs, using the same `deleteMcqsEverywhere` helper —
but only MCQs that have `examId` set to that exam (i.e. ones bulk-uploaded
specifically for it via mcq-import.ts, same convention as a past paper's
`pastPaperId`). MCQs that were merely *attached* to the exam from the
general question bank (via `POST /admin/exams/:id/questions`, which only
touches the `med_exam_questions` join table and never sets `mcqsTable.examId`)
are left alone in the bank — they may be tagged to a module/subject/topic
and reused elsewhere, so deleting the exam only removes their attachment
(the existing `examQuestionsTable` delete), not the MCQ itself.

If you actually want ALL attached MCQs gone regardless of origin, change
the `eq(mcqsTable.examId, id)` lookup in exams.ts to instead select via
`examQuestionsTable` — noted here so the ambiguity is visible, not silently
decided.

Admin confirm-dialog copy updated to match.

## 3. Practice / past-paper results: red/green feedback + full breakdown + wrong-answer review

Both live in `artifacts/frontend-student/src/App.tsx`. Past papers reuse
the exact same `Practice()` component (via `?pastPaperId=` in the URL), so
one set of changes covers both, per the ask ("same for past papers").

- **While answering** (option buttons, inside `Practice()`): once a
  question has an answer selected, the picked option turns green if
  correct / red if wrong (with a check/✕ icon), and if the pick was wrong
  the actual correct option is also outlined green so the student sees it
  immediately rather than only at the end. Before any pick, options are
  unstyled/neutral as before.
- **Result card** (`PracticeResultCard`, same file): rewritten to take
  `mcqs` + `answers` instead of just a `correct`/`total` pair. Now shows:
  - the existing score-%/verdict header (now correct-of-*attempted*, not
    correct-of-total, since skipped questions shouldn't drag the % down),
  - a 4-up Attempted / Correct / Wrong / Skipped count row,
  - every question in original order with a Correct/Wrong/Skipped badge,
    the student's answer, and the correct answer,
  - a dedicated "Review wrong answers" section at the very end listing
    just the wrong ones again (question, their answer, correct answer,
    explanation if present) — a quick-scan review list without re-reading
    the full breakdown above it.
- `TakeExam`/`ExamResult` (the Pre-Proffs exam flow) were **not** touched
  for this — exams intentionally don't reveal correctness mid-attempt
  (there's already a `showCorrectAnswers` admin setting gating that on the
  results page), so live red/green feedback during an exam would leak
  answers before submission. Only Practice/past-papers got it, matching
  what was asked.

## 4. Pre-Proffs exam is now "strict" — can't exit until submitted

`TakeExam` (same file) previously reused the generic `useFocusMode(true)`
(hides the sidebar) but still showed a header "Exit" button that did an
unconfirmed `setLocation('/')` straight out of the exam — plus nothing
stopped the browser back button or an accidental refresh.

- `FocusModeContext` gained a second flag, `strictFocusMode`. `useFocusMode`
  now takes an optional second `strict` param.
- `Shell`'s focus-mode header: when `strictFocusMode` is on, it renders a
  plain "Exam in progress" (lock icon) label instead of the Exit button —
  there is now no click-to-leave affordance in the UI at all during an
  exam.
- New `useExamLock(active)` hook: while active, (a) immediately re-pushes
  the current URL on every `popstate`, trapping the browser back/forward
  button on the exam screen, and (b) adds a `beforeunload` handler so
  refreshing or closing the tab shows the browser's native "leave site?"
  confirmation. Neither blocks in-app programmatic navigation, so
  submitting (or the timer hitting zero, which already auto-submits) still
  correctly redirects to the result page.
- `TakeExam` now calls `useFocusMode(true, true)` + `useExamLock(true)`.
  `Practice()`'s own `useFocusMode(mode !== null && !finished)` call is
  unchanged (not strict) — practice sessions can still be exited freely via
  "Exit & submit" in the side panel, only the Pre-Proffs exam is locked
  down.

## Verification done
- `tsc --noEmit` against each touched file in isolation (same caveats as
  v10: workspace-package imports and pre-existing implicit-`any`/lib-target
  noise are expected here and won't occur in the real project build).
  No new errors traced back to any of this changeset's lines.
- **Not done**: `pnpm install` / `pnpm dev` / production build, and no
  actual DB was available to test the cascade-delete queries against real
  data. Please smoke-test deleting a past paper/exam that has MCQs with
  practice history before trusting this in prod.

## Files touched (full list)
- `artifacts/api-server/src/lib/mcqCascade.ts` — new
- `artifacts/api-server/src/routes/past-papers.ts`
- `artifacts/api-server/src/routes/exams.ts`
- `artifacts/frontend-admin/src/App.tsx` (confirm-dialog copy only, 2 lines)
- `artifacts/frontend-student/src/App.tsx`
- this file (`AI_HANDOFF_NOTE.md`), replaced
