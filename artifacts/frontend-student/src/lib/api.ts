// Hand-written fetch helpers for endpoints added on top of the generated
// api-client-react hooks (register/login flows, academic structure CRUD,
// platform settings, uploads, audit logs). Kept separate from the generated
// client so regenerating it later won't clobber these.

// Same-origin deployments (frontend + backend served from one host) work
// with the default relative "/api" path. Split deployments (e.g. frontend
// on Vercel/Netlify, backend on Railway/Render) need VITE_API_BASE_URL set
// to the backend's origin (e.g. https://your-api.up.railway.app — no /api
// suffix; it's added automatically, matching setBaseUrl() in main.tsx).
const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') || '';
const API_BASE = `${API_ORIGIN}/api`;

// Split deployments (frontend and API on different origins) need any
// uploaded-file path resolved against the API's own origin, not the
// student app's — a bare relative path resolves against whatever origin
// this app happens to be served from otherwise, and 404s. Mirrors
// resolveUploadUrl() in frontend-admin/src/lib/api.ts.
export function resolveUploadUrl(pathOrUrl: string | null | undefined): string | null {
  if (!pathOrUrl) return null;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${API_ORIGIN}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
}

export class ApiRequestError extends Error {
  status: number;
  data: unknown;
  constructor(status: number, message: string, data: unknown) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json().catch(() => null) : null;
  if (!res.ok) {
    // A non-JSON error body on a 502/503/504 means the request never made
    // it to our API at all — it was killed by a proxy/gateway in front of
    // it (e.g. a slow AI generation call outliving the reverse-proxy
    // timeout). "Request failed (504)" is technically true but useless to
    // a student staring at a spinner; this is the actionable version.
    const gatewayMessage = !isJson && [502, 503, 504].includes(res.status) ? 'This is taking longer than expected. Try again — if it keeps happening, try a shorter or simpler request.' : null;
    throw new ApiRequestError(res.status, (data && (data.error || data.message)) || gatewayMessage || `Request failed (${res.status})`, data);
  }
  return data as T;
}

// Small helper for building "?a=1&b=2" query strings from a params object,
// skipping any key whose value is undefined/empty — used by list endpoints
// that take more than one optional filter (e.g. institutions active+kind).
function qs(params: Record<string, string | number | boolean | undefined>): string {
  const parts = Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Institution { id: number; name: string; city: string; kind: string; active: boolean; displayOrder: number }
export interface Program { id: number; institutionId: number; name: string; kind: string; active: boolean; displayOrder: number }
export interface AcademicYear { id: number; programId: number; label: string; yearNumber: number | null; active: boolean; displayOrder: number }
export interface Batch { id: number; academicYearId: number; label: string; active: boolean; displayOrder: number }

export interface AuthUser {
  id: number; name: string; email: string; role: string; status: string; emailVerified: boolean;
  institution: string | null; program: string | null;
  // Resolved from institutionId/programId/academicYearId server-side (see
  // userPublicView in auth.ts) — programKind is "MBBS"/"BDS", academicYear
  // is the display label (e.g. "3rd Year"), yearNumber is its plain 1-5
  // number. `institution`/`program` above are also now resolved names, not
  // the old blank legacy text columns; these three are additionally broken
  // out since the page needs the year on its own.
  programKind: string | null; academicYear: string | null; yearNumber: number | null;
  institutionId: number | null; programId: number | null; academicYearId: number | null; batchId: number | null;
  rollNumber: string | null; phone: string | null;
  profilePicturePath: string | null; profilePictureUrl: string | null;
}

export interface PlatformSettings {
  ADMIN_SIGNUP_CODE: string; SUPPORT_EMAIL: string; PLATFORM_NAME: string; PLATFORM_TAGLINE: string;
  DEFAULT_CURRENCY: string; PAYMENT_INSTRUCTIONS: string; ANNOUNCEMENT_BANNER: string; REGISTRATION_ENABLED: string;
  PAYMENT_ACCOUNT_HOLDER: string; PAYMENT_ACCOUNT_NUMBER: string; PAYMENT_BANK_NAME: string; PAYMENT_IFSC_OR_ROUTING: string; PAYMENT_UPI_ID: string; PAYMENT_QR_CODE_PATH: string;
  PAYMENT_RAAST_ID: string; PAYMENT_WALLET_PROVIDER: string; PAYMENT_WALLET_NUMBER: string; PAYMENT_WALLET_ACCOUNT_NAME: string;
  PAYMENT_BANK_ACCOUNTS: string; PAYMENT_METHODS_CONFIG: string; PAYMENT_LATE_FEE_NOTE: string; PAYMENT_REFUND_POLICY: string;
  SITE_FAVICON_PATH: string; SITE_FAVICON_URL?: string; PAYMENT_QR_CODE_URL?: string;
  PLATFORM_DESCRIPTION: string; SOCIAL_FACEBOOK: string; SOCIAL_YOUTUBE: string; SOCIAL_LINKEDIN: string; SOCIAL_INSTAGRAM: string;
  CONTACT_EMAIL: string; CONTACT_LOCATION: string; SUPPORT_HOURS: string; COPYRIGHT_NOTICE: string; FEATURES_LIST: string; QUICK_LINKS: string;
}

export interface BankAccount { id: string; label: string; accountHolder: string; bankName: string; accountNumber: string; ifsc: string; branch: string; isPrimary: boolean }
export interface PaymentMethodConfig { key: string; label: string; type: 'bank' | 'wallet' | 'card' | 'cash'; enabled: boolean; instructions: string; accountNumber?: string; accountName?: string }

export interface AuditLogEntry { id: number; actorId: number | null; actorName: string; action: string; entity: string; entityId: number | null; metadata: string | null; createdAt: string }

export interface StudentSummary { id: number; name: string; email: string; institution: string; program: string; status: string; joinedAt: string; progress: number }
export interface StudentDetail {
  id: number; name: string; email: string; phone: string | null; rollNumber: string | null; status: string; emailVerified: boolean;
  institution: string | null; program: string | null; academicYear: string | null; batch: string | null;
  currentStreak: number; longestStreak: number; lastLoginAt: string | null; joinedAt: string;
  payments: PaymentRow[]; activeMembership: { expiresAt: string } | null;
}
export interface PaymentRow { id: number; studentName: string; institution: string; program: string; academicYear: string; batch: string; rollNumber: string; planName: string; amount: number; currency: string; method: string; reference: string; paymentDate: string; proofPath: string | null; status: string; submittedAt: string }
export const STUDENT_STATUSES = ['UNVERIFIED', 'VERIFIED', 'PAYMENT_PENDING_REVIEW', 'ACTIVE', 'EXPIRED', 'SUSPENDED', 'REJECTED'] as const;

export interface McqImportProfile { id: number; name: string; questionPattern: string; optionPattern: string; answerPattern: string; explanationPattern: string; isDefault: boolean }
export interface McqCandidate { question: string; options: string[]; correctAnswer: string | null; explanation: string | null; reference: string | null; needsReview: boolean; rawBlock?: string }
export interface McqParseResult { fileName: string; totalFound: number; needsReviewCount: number; candidates: McqCandidate[] }

export const DEFAULT_IMPORT_PATTERNS = {
  questionPattern: "^\\s*(?:Q\\.?\\s*)?(\\d{1,3})[\\.\\):]\\s+(.+)$",
  optionPattern: "^\\s*\\(?([A-Da-d])\\)?[\\.\\):]\\s+(.+)$",
  answerPattern: "^\\s*(?:Answer|Ans|Correct\\s*Answer|Key)\\s*[:\\-]\\s*\\(?([A-Da-d])\\)?",
  explanationPattern: "^\\s*(?:Explanation|Rationale|Explain)\\s*[:\\-]\\s*(.+)$",
};

export const TEAM_CATEGORIES = ['ownership', 'reviewer', 'question_setter'] as const;
export type TeamCategory = typeof TEAM_CATEGORIES[number];
export const TEAM_CATEGORY_LABELS: Record<TeamCategory, string> = { reviewer: 'Reviewers', question_setter: 'Question setters', ownership: 'Ownership' };
export interface TeamMember { id: number; name: string; role: string; category: TeamCategory; bio: string; achievementBadge: string; photoPath: string | null; linkedinUrl: string; instagramUrl: string; email: string; active: boolean; displayOrder: number }
// Resolved General Trial Mode state from GET /site-content (server applies the
// defaults and honours the end date) — read this, not the raw GLOBAL_TRIAL_*
// strings below, which are only what an admin last saved.
export interface TrialStatus { active: boolean; program: string; years: number[]; features: string[]; endsAt: string | null }
export interface SiteContent {
  trial?: TrialStatus;
  PLATFORM_NAME: string; PLATFORM_TAGLINE: string; PLATFORM_DESCRIPTION: string;
  // SEO — browser tab title, Google listing, and link-preview title/
  // description; blank means the site falls back to index.html's static
  // defaults. See useSeoSync in lib/shared.tsx.
  SEO_TITLE: string; SEO_DESCRIPTION: string;
  SOCIAL_FACEBOOK: string; SOCIAL_YOUTUBE: string; SOCIAL_LINKEDIN: string; SOCIAL_INSTAGRAM: string;
  CONTACT_EMAIL: string; CONTACT_LOCATION: string; SUPPORT_HOURS: string; COPYRIGHT_NOTICE: string; SUPPORT_WHATSAPP: string;
  AI_VISUALIZER_ENABLED: string;
  // Controls the "Ask AI to explain differently" button on Practice.tsx
  // (MCQs, incl. past papers, which practice through the same screen) and
  // Flashcards.tsx. "false" = hidden; anything else = shown. Same
  // convention as AI_VISUALIZER_ENABLED above.
  AI_EXPLAIN_ENABLED: string;
  // Admin-wide switch that grants every signed-in student full access
  // regardless of their own membership status — see requireActiveMembership
  // (api-server middlewares/auth.ts). Exact string "true" means on; anything
  // else (including missing/unset) means off. Used here just to show a
  // banner — the student app never needs to enforce this itself, the API
  // already grants/denies access based on the same flag server-side.
  GLOBAL_TRIAL_MODE: string;
  // Optional scoping for GLOBAL_TRIAL_MODE — "" means no restriction on
  // that axis (matches everyone). See routes/settings.ts's comment on
  // these two keys. Used here only to word the trial banner correctly
  // ("for MBBS · 3rd Year" vs "for every student") — the actual grant is
  // still enforced server-side.
  GLOBAL_TRIAL_PROGRAM: string;
  GLOBAL_TRIAL_YEAR: string;
  // Bug fix: admin's "Announcement banner (blank to hide)" field existed
  // in Settings but was never exposed on this public bundle nor rendered
  // anywhere in the student app. Now surfaced here and rendered as a
  // dismissible banner in Shell (shared.tsx), same place GLOBAL_TRIAL_MODE
  // renders its banner. Empty string means "no announcement" — hidden.
  ANNOUNCEMENT_BANNER: string;
  features: string[]; quickLinks: Array<{ label: string; url: string }>; team: TeamMember[];
  faviconUrl: string | null;
  dashboardHeroImageUrl: string | null;
  // src/lib/theme.ts. Public (not admin-gated) so signed-out pages like
  // /login and /register pick up the same brand colors.
  THEME_PRIMARY: string; THEME_SECONDARY: string; THEME_ACCENT: string;
  THEME_BACKGROUND: string; THEME_CARD: string; THEME_TEXT: string; THEME_MODE: string;
}

export const siteContentApi = {
  get: () => request<SiteContent>('/site-content'),
};

export const teamApi = {
  listAll: () => request<TeamMember[]>('/admin/team-members'),
  create: (body: Partial<TeamMember>) => request<TeamMember>('/admin/team-members', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: number, body: Partial<TeamMember>) => request<TeamMember>(`/admin/team-members/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  remove: (id: number) => request<{ ok: true }>(`/admin/team-members/${id}`, { method: 'DELETE' }),
};

export interface AdminBookStudent { id: number; title: string; author: string | null; moduleId: number | null; subjectId: number | null; topicId: number | null; storagePath: string | null; coverImagePath: string | null; isFree: boolean; price: number | null; currency: string | null; locked: boolean; secureReader?: boolean; purchasePending: boolean }
export interface BookPurchase { id: number; bookId: number; bookTitle: string; amount: number; currency: string; method: string; reference: string; paymentDate: string; proofPath: string | null; status: 'PAYMENT_PENDING_REVIEW' | 'approved' | 'rejected'; rejectionReason: string | null; submittedAt: string; reviewedAt: string | null }
// Secure book reader (GET /books/:id/reader …). The reader never receives the
// PDF: pages arrive as watermarked images, and the word "boxes" carry no text.
export interface BookReaderInfo { id: number; title: string; author: string | null; pageCount: number; pages: Array<{ w: number; h: number }>; resumePage: number; fileKey: string }
export type WordBox = [number, number, number, number];
export type HighlightColor = 'yellow' | 'green' | 'pink' | 'blue';
export interface BookHighlight { id: number; page: number; kind: 'words' | 'area'; startWord: number | null; endWord: number | null; rect: { x: number; y: number; w: number; h: number } | null; color: HighlightColor; note: string | null; createdAt: string }
export type NewBookHighlight =
  | { kind: 'words'; page: number; startWord: number; endWord: number; color?: HighlightColor; note?: string | null }
  | { kind: 'area'; page: number; rect: { x: number; y: number; w: number; h: number }; color?: HighlightColor; note?: string | null };

export const booksApi = {
  readerInfo: (id: number) => request<BookReaderInfo>(`/books/${id}/reader`),
  pageWords: (id: number, page: number) => request<{ page: number; words: WordBox[] }>(`/books/${id}/pages/${page}/words`),
  // Fetched with the session cookie and drawn straight onto a <canvas>; no
  // object URL is kept, so there's nothing to "save image as".
  pageImage: async (id: number, page: number, width: number): Promise<Blob> => {
    const res = await fetch(`${API_BASE}/books/${id}/pages/${page}/image?w=${width}`, { credentials: 'include', cache: 'no-store' });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new ApiRequestError(res.status, (data && data.error) || `Request failed (${res.status})`, data);
    }
    return res.blob();
  },
  highlights: (id: number) => request<BookHighlight[]>(`/books/${id}/highlights`),
  addHighlight: (id: number, body: NewBookHighlight) => request<BookHighlight>(`/books/${id}/highlights`, { method: 'POST', body: JSON.stringify(body) }),
  updateHighlight: (id: number, hid: number, body: { color?: HighlightColor; note?: string | null }) => request<BookHighlight>(`/books/${id}/highlights/${hid}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteHighlight: (id: number, hid: number) => request<{ ok: true }>(`/books/${id}/highlights/${hid}`, { method: 'DELETE' }),
  saveProgress: (id: number, page: number) => request<{ ok: true }>(`/books/${id}/progress`, { method: 'PUT', body: JSON.stringify({ page }) }),
  // Same call, but with `keepalive: true` so the browser lets it finish even
  // though the page is being hidden/closed right now — the normal debounced
  // save (above) can otherwise lose the last page if the tab is closed
  // before its 1.2s timer fires. Fire-and-forget on purpose: there's no tab
  // left to show an error to.
  saveProgressOnExit: (id: number, page: number): void => {
    try { void fetch(`${API_BASE}/books/${id}/progress`, { method: 'PUT', credentials: 'include', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ page }) }); } catch { /* best effort */ }
  },
  list: () => request<AdminBookStudent[]>('/books'),
  purchase: (bookId: number, body: { method: string; reference: string; paymentDate: string; proofPath?: string | null }) => request<BookPurchase>(`/books/${bookId}/purchases`, { method: 'POST', body: JSON.stringify(body) }),
  myPurchases: () => request<BookPurchase[]>('/books/purchases/mine'),
};

export interface AdminModule { id: number; name: string; subtitle: string; subjectCount: number; topicCount: number; progress: number; active: boolean; blockId?: number | null; blockName?: string | null; displayOrder?: number; programTargetKind?: string | null; yearTargetNumber?: number | null; targetingLabel?: string }

export const moduleAdminApi = {
  listAll: () => request<AdminModule[]>('/modules'),
  create: (body: { name: string; subtitle: string; active?: boolean; programTargetKind?: string | null; yearTargetNumber?: number | null }) =>
    request<AdminModule>('/modules', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: number, body: Partial<{ name: string; subtitle: string; active: boolean; programTargetKind: string | null; yearTargetNumber: number | null }>) =>
    request<AdminModule>(`/modules/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  remove: (id: number) => request<{ ok: true }>(`/modules/${id}`, { method: 'DELETE' }),
};

export interface Block { id: number; name: string; subtitle: string; iconUrl: string | null; displayOrder: number; active: boolean }
export const blocksApi = {
  list: () => request<Block[]>('/blocks'),
};

export interface Exam {
  id: number; title: string; description: string; programTargetKind: string | null; yearTargetNumber: number | null;
  durationMinutes: number; startAt: string; endAt: string; maxAttempts: number; negativeMarkingEnabled: boolean;
  negativeMarkPerWrong: number; passingPercent: number | null; resultReleaseMode: 'immediate' | 'after_end' | 'manual';
  showMarks: boolean; showPercentage: boolean; showCorrectAnswers: boolean; status: 'draft' | 'published' | 'archived';
}
export interface AdminExam extends Exam { questionCount: number; attemptCount: number }
export interface StudentExam extends Exam { attemptsUsed: number; canStart: boolean; inProgressAttemptId: number | null; windowStatus: 'upcoming' | 'open' | 'closed' }
export interface ExamQuestion { id: number; question: string; options: string[]; difficulty: string }
export interface ExamStartResponse { attemptId: number; startedAt: string; durationMinutes: number; questions: ExamQuestion[] }
export interface ExamAttemptRow { id: number; examId: number; userId: number; studentName: string; institution: string; attemptNumber: number; startedAt: string; submittedAt: string | null; totalQuestions: number; correctCount: number; wrongCount: number; unansweredCount: number; score: number; percentage: number; passed: boolean | null; status: string; resultsReleasedAt: string | null }
export interface ExamResult {
  released: boolean; status?: string; totalQuestions?: number; correctCount?: number; wrongCount?: number; unansweredCount?: number;
  score?: number | null; percentage?: number | null; passed?: boolean | null;
  breakdown?: Array<{ mcqId: number; question: string; options: string[]; selectedAnswer: string | null; correctAnswer: string | null; explanation: string | null; optionExplanations: (string | null)[] | null; correct: boolean | null }>;
}

export type ExplanationStatus = 'PENDING' | 'AI_GENERATED' | 'REVIEWED' | 'APPROVED';
export interface ExplanationSummary { PENDING: number; AI_GENERATED: number; REVIEWED: number; APPROVED: number }

export const explanationsApi = {
  summary: () => request<ExplanationSummary>('/admin/mcqs/explanations/summary'),
  listByStatus: (status: ExplanationStatus) => request<Array<{ id: number; question: string; explanation: string | null; explanationStatus: ExplanationStatus; moduleId: number }>>(`/admin/mcqs/explanations?status=${status}`),
  setStatus: (id: number, status: ExplanationStatus) => request<{ id: number }>(`/admin/mcqs/${id}/explanation-status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  reject: (id: number) => request<{ id: number }>(`/admin/mcqs/${id}/reject-explanation`, { method: 'POST' }),
  generate: (id: number) => request<{ id: number; explanation: string }>(`/admin/mcqs/${id}/generate-explanation`, { method: 'POST' }),
  bulkGenerate: (body: { moduleId?: number; mcqIds?: number[]; limit?: number }) => request<{ generated: number; failed: number; errors: Array<{ id: number; error: string }> }>('/admin/mcqs/bulk-generate-explanations', { method: 'POST', body: JSON.stringify(body) }),
  askAi: (mcqId: number) => request<{ explanation: string }>(`/mcqs/${mcqId}/ask-ai`, { method: 'POST' }),
  askAiFlashcard: (flashcardId: number) => request<{ explanation: string }>(`/flashcards/${flashcardId}/ask-ai`, { method: 'POST' }),
};

export const examsAdminApi = {
  list: () => request<AdminExam[]>('/admin/exams'),
  create: (body: Partial<Exam>) => request<Exam>('/admin/exams', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: number, body: Partial<Exam>) => request<Exam>(`/admin/exams/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  archive: (id: number) => request<{ ok: true }>(`/admin/exams/${id}`, { method: 'DELETE' }),
  setQuestions: (id: number, mcqIds: number[]) => request<{ ok: true; count: number }>(`/admin/exams/${id}/questions`, { method: 'POST', body: JSON.stringify({ mcqIds }) }),
  getQuestions: (id: number) => request<Array<{ id: number; question: string; options: string[]; correctAnswer: string | null; module: string; subject: string; topic: string }>>(`/admin/exams/${id}/questions`),
  attempts: (id: number) => request<ExamAttemptRow[]>(`/admin/exams/${id}/attempts`),
  releaseOne: (attemptId: number) => request<{ ok: true }>(`/admin/exam-attempts/${attemptId}/release`, { method: 'POST' }),
  releaseAll: (examId: number) => request<{ ok: true }>(`/admin/exams/${examId}/release-all`, { method: 'POST' }),
};

export const examsApi = {
  list: () => request<StudentExam[]>('/exams'),
  start: (id: number) => request<ExamStartResponse>(`/exams/${id}/start`, { method: 'POST' }),
  answer: (attemptId: number, mcqId: number, selectedAnswer: string | null) => request<{ ok: true }>(`/exam-attempts/${attemptId}/answer`, { method: 'POST', body: JSON.stringify({ mcqId, selectedAnswer }) }),
  submit: (attemptId: number) => request<{ attemptId: number; status: string; resultsReleased: boolean }>(`/exam-attempts/${attemptId}/submit`, { method: 'POST' }),
  result: (attemptId: number) => request<ExamResult>(`/exam-attempts/${attemptId}/result`),
};

// ---------------------------------------------------------------------------
// OSPE / OSCE practical exams
// ---------------------------------------------------------------------------

export type OspeExamType = 'OSPE' | 'OSCE';
export interface OspeLearningMaterial { id: number; moduleId: number | null; examType: OspeExamType; title: string; description: string; bodyText: string; imagePath: string | null; attachmentPath: string | null; externalUrl: string | null }
export interface OspeExam {
  id: number; title: string; description: string; examType: OspeExamType; programTargetKind: string | null; yearTargetNumber: number | null;
  durationMinutes: number; startAt: string; endAt: string; maxAttempts: number; passingPercent: number | null;
  resultReleaseMode: 'immediate' | 'after_end' | 'manual'; showMarks: boolean; showPercentage: boolean; showCorrectAnswers: boolean;
  status: 'draft' | 'published' | 'archived';
}
export interface OspeStudentExam extends OspeExam { attemptsUsed: number; canStart: boolean; inProgressAttemptId: number | null; windowStatus: 'upcoming' | 'open' | 'closed' }
// Student-facing identification point — just where the pin sits, never the
// correct label (that stays server-side until results are released).
export interface OspeExamLabelPoint { id: string; x: number; y: number }
export interface OspeExamStation { id: number; title: string; instructions: string; imagePath: string | null; attachmentPath: string | null; answerType: 'MCQ' | 'WRITTEN' | 'LABELING'; options: string[] | null; labelPoints: OspeExamLabelPoint[] | null; marks: number; timeLimitSeconds: number | null }
export interface OspeExamStartResponse { attemptId: number; startedAt: string; durationMinutes: number; stations: OspeExamStation[] }
export interface OspeExamResult {
  released: boolean; status?: string; totalStations?: number; fullyGraded?: boolean;
  totalMarks?: number; obtainedMarks?: number | null; percentage?: number | null; passed?: boolean | null;
  breakdown?: Array<{
    stationId: number; title: string; instructions: string; imagePath: string | null; answerType: 'MCQ' | 'WRITTEN' | 'LABELING'; options: string[] | null;
    selectedAnswer: string | null; writtenAnswer: string | null; correctAnswer: string | null; modelAnswer: string | null;
    labelPoints: Array<{ id: string; x: number; y: number; label: string }> | null; labelAnswers: Record<string, string> | null;
    marks: number; marksObtained: number | null; correct: boolean | null; aiVerdict: 'correct' | 'partial' | 'incorrect' | null; aiFeedback: string | null;
  }>;
}

function ospeQuery(examType?: OspeExamType) { return examType ? `?examType=${examType}` : ''; }

export const ospeApi = {
  blocks: (examType?: OspeExamType) => request<Array<{ id: number; name: string; subtitle: string; examType: OspeExamType; displayOrder: number }>>(`/ospe/blocks${ospeQuery(examType)}`),
  modules: (examType?: OspeExamType, blockId?: number) => request<Array<{ id: number; name: string; subtitle: string; examType: OspeExamType; blockId: number | null; displayOrder: number }>>(`/ospe/modules${examType || blockId ? `?${[examType ? `examType=${examType}` : '', blockId ? `blockId=${blockId}` : ''].filter(Boolean).join('&')}` : ''}`),
  learningMaterials: (examType?: OspeExamType, moduleId?: number) => request<OspeLearningMaterial[]>(`/ospe/learning-materials${examType || moduleId ? `?${[examType ? `examType=${examType}` : '', moduleId ? `moduleId=${moduleId}` : ''].filter(Boolean).join('&')}` : ''}`),
  exams: (examType?: OspeExamType) => request<OspeStudentExam[]>(`/ospe/exams${ospeQuery(examType)}`),
  start: (id: number) => request<OspeExamStartResponse>(`/ospe/exams/${id}/start`, { method: 'POST' }),
  answer: (attemptId: number, stationId: number, selectedAnswer: string | null, writtenAnswer: string | null, labelAnswers?: Record<string, string> | null) =>
    request<{ ok: true }>(`/ospe/exam-attempts/${attemptId}/answer`, { method: 'POST', body: JSON.stringify({ stationId, selectedAnswer, writtenAnswer, labelAnswers: labelAnswers ?? null }) }),
  submit: (attemptId: number) => request<{ attemptId: number; status: string; resultsReleased: boolean }>(`/ospe/exam-attempts/${attemptId}/submit`, { method: 'POST' }),
  // Retries AI grading for any WRITTEN stations still ungraded (e.g. the
  // submit-time grading pass ran out of its time budget) — safe to call
  // repeatedly, already-graded stations are skipped server-side.
  grade: (attemptId: number) => request<{ ok: true; graded: number; pending: number; obtainedMarks: number; percentage: number }>(`/ospe/exam-attempts/${attemptId}/grade`, { method: 'POST' }),
  result: (attemptId: number) => request<OspeExamResult>(`/ospe/exam-attempts/${attemptId}/result`),
};

export const studentsAdminApi = {
  detail: (id: number) => request<StudentDetail>(`/students/${id}`),
  update: (id: number, body: Partial<{ name: string; phone: string; rollNumber: string }>) => request<{ ok: true }>(`/students/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  updateStatus: (id: number, status: string) => request<{ ok: true; status: string }>(`/students/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  remove: (id: number) => request<{ ok: true }>(`/students/${id}`, { method: 'DELETE' }),
};

export const paymentsAdminApi = {
  remove: (id: number) => request<{ ok: true }>(`/payments/${id}`, { method: 'DELETE' }),
};

export const membershipPlansAdminApi = {
  remove: (id: number) => request<{ ok: true }>(`/membership-plans/${id}`, { method: 'DELETE' }),
};

export const mcqAdminApi = {
  remove: (id: number) => request<{ ok: true }>(`/mcqs/${id}`, { method: 'DELETE' }),
};

export const mcqImportApi = {
  profiles: () => request<McqImportProfile[]>('/admin/mcq-import-profiles'),
  createProfile: (body: Omit<McqImportProfile, 'id'>) => request<McqImportProfile>('/admin/mcq-import-profiles', { method: 'POST', body: JSON.stringify(body) }),
  updateProfile: (id: number, body: Partial<Omit<McqImportProfile, 'id'>>) => request<McqImportProfile>(`/admin/mcq-import-profiles/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteProfile: (id: number) => request<{ ok: true }>(`/admin/mcq-import-profiles/${id}`, { method: 'DELETE' }),
  parse: async (file: File, profileId?: number): Promise<McqParseResult> => {
    const form = new FormData();
    form.append('file', file);
    if (profileId) form.append('profileId', String(profileId));
    const res = await fetch('/api/admin/mcq-import/parse', { method: 'POST', credentials: 'include', body: form });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new ApiRequestError(res.status, (data && data.error) || 'Could not parse this file', data);
    return data;
  },
  commit: (body: { moduleId: number; subjectId: number; topicId: number; pastPaperId?: number; status: 'draft' | 'published'; mcqs: McqCandidate[] }) =>
    request<{ imported: number; ids: number[] }>('/admin/mcq-import/commit', { method: 'POST', body: JSON.stringify(body) }),
};

export interface PastPaper { id: number; title: string; examBoard: string; year: string; level: string; active: boolean; displayOrder: number; mcqCount: number }
export interface NotebookEntry { id: number; userId: number; mcqId: number | null; title: string; content: string; createdAt: string; updatedAt: string }
export interface SavedSession { id: number; userId: number; name: string; config: Record<string, unknown>; createdAt: string }
export interface FlaggedMcq { id: number; userId: number; mcqId: number; reason: string; status: 'open' | 'resolved'; createdAt: string; question: string | null; path: string | null; mcqDeleted: boolean }
export interface FeedbackEntry { id: number; userId: number | null; category: string; message: string; status: 'open' | 'replied' | 'reviewed'; rating: number | null; featured: boolean; createdAt: string; user: { name: string; email: string } | null }
export interface FeedbackReply { id: number; feedbackId: number; authorId: number; authorRole: 'admin' | 'student'; message: string; createdAt: string }
export interface MyFeedbackEntry extends FeedbackEntry { replies: FeedbackReply[] }
// Public, trimmed-down shape returned by GET /feedback/featured — no
// userId/email, just what's safe to show a signed-out visitor. See
// api-server routes/student-tools.ts for what's deliberately left out.
export interface FeaturedTestimonial { id: number; rating: number; message: string; createdAt: string; name: string }
export interface Analytics { range: string; totalSessions: number; averageScore: number; questionsAnswered: number; timeSpentMinutes: number; currentStreak: number; longestStreak: number }
export interface LeaderboardRow { rank: number; userId: number; name: string; institution: string | null; sessions: number; questionsAnswered: number; correct: number; points: number; accuracy: number; isYou: boolean;
  // Live streak fields (server-computed, 0 once a full day is missed). Optional so an older API build still typechecks/renders.
  currentStreak?: number; longestStreak?: number; practicedToday?: boolean }
/** The signed-in student's own streak + last 14 days of activity (oldest -> newest). */
export interface StreakCard { currentStreak: number; longestStreak: number; practicedToday: boolean; atRisk: boolean; days: Array<{ date: string; sessions: number; questions: number }> }
export interface PaymentDetails { PAYMENT_INSTRUCTIONS: string; PAYMENT_ACCOUNT_HOLDER: string; PAYMENT_ACCOUNT_NUMBER: string; PAYMENT_BANK_NAME: string; PAYMENT_IFSC_OR_ROUTING: string; PAYMENT_UPI_ID: string; PAYMENT_QR_CODE_PATH: string; PAYMENT_QR_CODE_URL?: string; PAYMENT_RAAST_ID: string; PAYMENT_WALLET_PROVIDER: string; PAYMENT_WALLET_NUMBER: string; PAYMENT_WALLET_ACCOUNT_NAME: string; PAYMENT_BANK_ACCOUNTS: string; PAYMENT_METHODS_CONFIG: string; PAYMENT_LATE_FEE_NOTE: string; PAYMENT_REFUND_POLICY: string; DEFAULT_CURRENCY: string; bankAccounts: BankAccount[]; methods: PaymentMethodConfig[] }

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const couponsApi = {
  // Public — see routes/coupons.ts's comment for why (registration calls
  // this before an account even exists).
  validate: (code: string, planId: number) => request<{ valid: true; discountedAmount: number; discountAmount: number; currency: string }>('/coupons/validate', { method: 'POST', body: JSON.stringify({ code, planId }) }),
};

export const authApi = {
  register: (body: { name: string; email: string; password: string; phone: string; rollNumber?: string; institutionId: number; programKind: 'MBBS' | 'BDS'; yearNumber: number; planId: number; method?: string; reference?: string; paymentDate?: string; proofPath?: string; couponCode?: string }) =>
    request<{ user: AuthUser; message: string }>('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  adminRegister: (body: { name: string; email: string; password: string; inviteCode: string }) =>
    request<{ token: string; user: AuthUser }>('/auth/admin/register', { method: 'POST', body: JSON.stringify(body) }),
  login: (body: { email: string; password: string }) =>
    request<{ token: string; user: AuthUser }>('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
  me: () => request<AuthUser>('/auth/me'),
  verifyOtp: (email: string, otp: string) => request<{ message: string }>('/auth/verify-otp', { method: 'POST', body: JSON.stringify({ email, otp }) }),
  resendVerification: (email: string) => request<{ message: string }>('/auth/resend-verification', { method: 'POST', body: JSON.stringify({ email }) }),
  forgotPassword: (email: string) => request<{ message: string }>('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (token: string, password: string) => request<{ message: string }>('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) }),
  changePassword: (currentPassword: string, newPassword: string) => request<{ message: string }>('/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }),
  updateMe: (body: { name?: string; phone?: string; email?: string; currentPassword?: string; profilePicturePath?: string | null }) => request<AuthUser>('/auth/me', { method: 'PATCH', body: JSON.stringify(body) }),
};

export const notificationsApi = {
  markRead: (id: number) => request<{ ok: true }>(`/notifications/${id}/read`, { method: 'POST' }),
  // Clears this student's own notification list: their personal
  // notifications are deleted outright, and any broadcast announcements are
  // hidden from just their view (other students still see them).
  clearMine: () => request<{ ok: true }>('/notifications/clear', { method: 'POST' }),
};

// ---------------------------------------------------------------------------
// Academic structure
// ---------------------------------------------------------------------------

export const academicApi = {
  institutions: (active?: boolean, kind?: string) => request<Institution[]>(`/institutions${qs({ active, kind })}`),
  createInstitution: (body: Partial<Institution>) => request<Institution>('/institutions', { method: 'POST', body: JSON.stringify(body) }),
  updateInstitution: (id: number, body: Partial<Institution>) => request<Institution>(`/institutions/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  archiveInstitution: (id: number) => request<Institution>(`/institutions/${id}`, { method: 'DELETE' }),

  programs: (institutionId?: number, active?: boolean) => request<Program[]>(`/programs?${institutionId ? `institutionId=${institutionId}&` : ''}${active === undefined ? '' : `active=${active}`}`),
  createProgram: (body: Partial<Program>) => request<Program>('/programs', { method: 'POST', body: JSON.stringify(body) }),
  updateProgram: (id: number, body: Partial<Program>) => request<Program>(`/programs/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  archiveProgram: (id: number) => request<Program>(`/programs/${id}`, { method: 'DELETE' }),

  academicYears: (programId?: number, active?: boolean) => request<AcademicYear[]>(`/academic-years?${programId ? `programId=${programId}&` : ''}${active === undefined ? '' : `active=${active}`}`),
  createAcademicYear: (body: Partial<AcademicYear>) => request<AcademicYear>('/academic-years', { method: 'POST', body: JSON.stringify(body) }),
  updateAcademicYear: (id: number, body: Partial<AcademicYear>) => request<AcademicYear>(`/academic-years/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  archiveAcademicYear: (id: number) => request<AcademicYear>(`/academic-years/${id}`, { method: 'DELETE' }),

  batches: (academicYearId?: number, active?: boolean) => request<Batch[]>(`/batches?${academicYearId ? `academicYearId=${academicYearId}&` : ''}${active === undefined ? '' : `active=${active}`}`),
  createBatch: (body: Partial<Batch>) => request<Batch>('/batches', { method: 'POST', body: JSON.stringify(body) }),
  updateBatch: (id: number, body: Partial<Batch>) => request<Batch>(`/batches/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  archiveBatch: (id: number) => request<Batch>(`/batches/${id}`, { method: 'DELETE' }),
};

// ---------------------------------------------------------------------------
// Admin settings / audit logs / uploads
// ---------------------------------------------------------------------------

export const settingsApi = {
  get: () => request<PlatformSettings>('/admin/settings'),
  update: (body: Partial<PlatformSettings>) => request<PlatformSettings>('/admin/settings', { method: 'PATCH', body: JSON.stringify(body) }),
  rotateAdminCode: () => request<{ ADMIN_SIGNUP_CODE: string }>('/admin/settings/rotate-admin-code', { method: 'POST' }),
};

export const auditApi = {
  list: (limit = 100) => request<AuditLogEntry[]>(`/admin/audit-logs?limit=${limit}`),
};

export async function uploadFile(file: File, kind: 'payment-proof' | 'payment-proof-signup' | 'profile-picture' | 'resource' | 'favicon'): Promise<{ storagePath: string; url: string | null }> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_ORIGIN}/api/uploads/${kind}`, { method: 'POST', credentials: 'include', body: form });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiRequestError(res.status, (data && data.error) || 'Upload failed', data);
  return data;
}

export const publicApi = {
  paymentDetails: () => request<PaymentDetails>('/payment-details'),
};

export const pastPapersApi = {
  list: (level?: string) => request<PastPaper[]>(`/past-papers${level ? `?level=${encodeURIComponent(level)}` : ''}`),
  mcqs: (id: number) => request<unknown[]>(`/past-papers/${id}/mcqs`),
  create: (body: Partial<PastPaper>) => request<PastPaper>('/past-papers', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: number, body: Partial<PastPaper>) => request<PastPaper>(`/past-papers/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  archive: (id: number) => request<{ ok: true }>(`/past-papers/${id}`, { method: 'DELETE' }),
  attachMcqs: (id: number, mcqIds: number[]) => request<{ ok: true }>(`/past-papers/${id}/mcqs`, { method: 'POST', body: JSON.stringify({ mcqIds }) }),
};

export const notebookApi = {
  list: () => request<NotebookEntry[]>('/notebook'),
  create: (body: { title?: string; content: string; mcqId?: number }) => request<NotebookEntry>('/notebook', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: number, body: Partial<{ title: string; content: string }>) => request<NotebookEntry>(`/notebook/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  remove: (id: number) => request<{ ok: true }>(`/notebook/${id}`, { method: 'DELETE' }),
};

export const savedSessionsApi = {
  list: () => request<SavedSession[]>('/saved-sessions'),
  create: (body: { name: string; config: Record<string, unknown> }) => request<SavedSession>('/saved-sessions', { method: 'POST', body: JSON.stringify(body) }),
  remove: (id: number) => request<{ ok: true }>(`/saved-sessions/${id}`, { method: 'DELETE' }),
};

export const flaggedMcqsApi = {
  list: () => request<FlaggedMcq[]>('/flagged-mcqs'),
  create: (body: { mcqId: number; reason?: string }) => request<FlaggedMcq>('/flagged-mcqs', { method: 'POST', body: JSON.stringify(body) }),
  updateStatus: (id: number, status: 'open' | 'resolved') => request<FlaggedMcq>(`/flagged-mcqs/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  remove: (id: number) => request<{ ok: true }>(`/flagged-mcqs/${id}`, { method: 'DELETE' }),
};

export const feedbackApi = {
  listAll: () => request<FeedbackEntry[]>('/feedback'),
  mine: () => request<MyFeedbackEntry[]>('/feedback/mine'),
  create: (body: { category?: string; message: string; rating?: number }) => request<FeedbackEntry>('/feedback', { method: 'POST', body: JSON.stringify(body) }),
  updateStatus: (id: number, status: 'open' | 'replied' | 'reviewed') => request<FeedbackEntry>(`/feedback/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  setFeatured: (id: number, featured: boolean) => request<FeedbackEntry>(`/feedback/${id}`, { method: 'PATCH', body: JSON.stringify({ featured }) }),
  // Public — no auth required, powers the homepage testimonials section.
  featured: () => request<FeaturedTestimonial[]>('/feedback/featured'),
  reply: (id: number, message: string) => request<FeedbackReply>(`/feedback/${id}/replies`, { method: 'POST', body: JSON.stringify({ message }) }),
};

/** One row in the header search palette (GET /student/search). Only content this student may open. */
export interface SearchHit { id: number; title: string; subtitle?: string; moduleId?: number; subjectId?: number }
export interface SearchResults { blocks: SearchHit[]; modules: SearchHit[]; subjects: SearchHit[]; topics: SearchHit[]; exams: SearchHit[]; pastPapers: SearchHit[] }
export interface ProgressDay { date: string; sessions: number; questions: number; scorePercent: number | null }
export interface ProgressTrend { recentAverage: number | null; priorAverage: number | null; trend: 'up' | 'down' | 'flat' | 'new'; trendDelta: number; recentSessions: number; history: Array<{ date: string; scorePercent: number }>;
  /** Last 7 calendar days in the student's local time, oldest -> today. Optional so an older API build still renders. */
  daily?: ProgressDay[]; currentStreak: number; longestStreak: number }
/** One module as the dashboard's "continue learning" cards show it (GET /student/continue-learning). */
export interface ContinueModule { id: number; name: string; subtitle: string; iconUrl: string | null; subjectCount: number; mcqCount: number; attempted: number; progress: number }
export interface ContinueResume extends ContinueModule {
  lastPracticedAt: string; lastScorePercent: number; sessionsInModule: number;
  subject: { id: number; name: string } | null;
  /** The topic to carry on with: 'continue' = last one, still unfinished; 'next' = next unfinished one; 'review' = everything in the subject is done. */
  topic: { id: number; name: string; questionCount: number; attempted: number; state: 'continue' | 'next' | 'review' } | null;
}
export interface ContinueLearning { resume: ContinueResume | null; upNext: ContinueModule[] }
// GET /student/progress-overview — everything the "My Progress" page shows.
export interface ProgressOverview {
  summary: { sessions: number; questionsAnswered: number; uniqueMcqsAttempted: number; accuracy: number | null; timeSpentMinutes: number; activeDaysLast30: number; currentStreak: number; longestStreak: number };
  recentSessions: Array<{ id: number; date: string; scope: string; mode: string; totalQuestions: number; correctCount: number; scorePercent: number; durationMinutes: number | null }>;
  bySubject: Array<{ id: number; name: string; answered: number; accuracy: number | null; delta: number | null }>;
  pastPapers: Array<{ id: number; title: string; year: string; examBoard: string; attemptedQuestions: number; totalQuestions: number; coveragePercent: number; accuracy: number | null; sessions: number; lastAttemptAt: string }>;
  improvement: {
    weekly: Array<{ weekStart: string; sessions: number; questions: number; accuracy: number | null }>;
    trend: 'up' | 'down' | 'flat' | 'new'; deltaPoints: number | null; firstAccuracy: number | null; latestAccuracy: number | null;
    improvedTopics: ProgressTopic[]; needsWork: ProgressTopic[]; strongest: ProgressTopic[];
  };
  exams: Array<{ attemptId: number; examId: number; title: string; attemptNumber: number; submittedAt: string; released: boolean; totalQuestions: number; correctCount: number | null; percentage: number | null; score: number | null; passed: boolean | null }>;
}
export interface ProgressTopic { id: number; name: string; subject: string | null; answered: number; accuracy: number | null; delta: number | null }

export const analyticsApi = {
  overview: () => request<ProgressOverview>('/student/progress-overview'),
  get: (range: string) => request<Analytics>(`/student/analytics?range=${range}`),
  // `tz` = the browser's own UTC offset so the server can bucket sessions into the student's LOCAL days.
  progress: () => request<ProgressTrend>(`/student/progress?tz=${new Date().getTimezoneOffset()}`),
  continueLearning: () => request<ContinueLearning>('/student/continue-learning'),
  leaderboard: (range = '30d') => request<LeaderboardRow[]>(`/leaderboard?range=${range}`),
  streak: () => request<StreakCard>('/leaderboard/streak'),
  submitSession: (body: { moduleId?: number; subjectId?: number; topicId?: number; mode?: 'timed' | 'untimed'; durationSeconds?: number; answers: { mcqId: number; selectedAnswer: string | null }[] }) =>
    request<{ id: number; scorePercent: number; correctCount: number; totalQuestions: number }>('/practice-sessions', { method: 'POST', body: JSON.stringify(body) }),
  practiceOverview: () => request<{ totalTopics: number; totalQuestions: number; avgQuestions: number; avgDurationMinutes: number; moduleCount: number }>('/student/practice-overview'),
  // Trial-only students are capped at TRIAL_DAILY_MCQ_LIMIT MCQs/day (admin
  // setting, Settings → Access & trial). `limited: false` for a paying
  // student or an unlimited (0) cap — nothing for the Practice page to show.
  trialMcqUsage: () => request<{ limited: boolean; limit: number; used: number; remaining: number | null }>('/student/trial-mcq-usage'),
};

// ---------------------------------------------------------------------------
// AI Visualizer (student-only) — hand-written fetches, same pattern as
// explanationsApi. Not part of the generated api-zod/api-client-react
// pipeline (none of the existing AI routes are either).
// ---------------------------------------------------------------------------

export type VizPoint = { x: number; y: number };
export type VizElement =
  | { kind: 'shape'; id: string; shapeType: 'circle' | 'rect' | 'ellipse'; x: number; y: number; width?: number; height?: number; radius?: number; color?: string; label?: string }
  | { kind: 'label'; id: string; text: string; x: number; y: number }
  | { kind: 'arrow'; id: string; fromId: string; toId: string; label?: string; style?: 'solid' | 'dashed' }
  | { kind: 'particle'; id: string; text?: string; color?: string; fromId: string; toId: string };

export type VizStep = { title: string; description: string; elements: VizElement[]; highlightIds?: string[] };

export type FormulaNode = { op: 'add' | 'subtract' | 'multiply' | 'divide'; left: FormulaNode; right: FormulaNode } | { var: string } | { const: number };

export type VisualizationSpec =
  | { type: 'process' | 'cycle'; title: string; description: string; loop?: boolean; steps: VizStep[] }
  | { type: 'flowchart'; title: string; description: string; nodes: Array<{ id: string; label: string; x: number; y: number }>; edges: Array<{ fromId: string; toId: string; label?: string }> }
  | { type: 'timeline'; title: string; description: string; events: Array<{ label: string; time: string; description: string }> }
  | { type: 'equation'; title: string; description: string; displayFormula: string; variables: Array<{ name: string; label: string; unit?: string; min: number; max: number; default: number; step?: number }>; resultLabel: string; resultUnit?: string; formula: FormulaNode }
  | { type: 'comparison'; title: string; description: string; items: Array<{ name: string; attributes: Array<{ label: string; value: string }> }> }
  | { type: 'graph'; title: string; description: string; chartType: 'line' | 'bar'; xLabel: string; yLabel: string; series: Array<{ name: string; points: Array<{ x: string | number; y: number }> }> }
  | { type: 'anatomy'; title: string; description: string; elements: VizElement[] };

// ---------------------------------------------------------------------------
// Challenge a friend — search for another student and race them on the
// same set of MCQs.
// ---------------------------------------------------------------------------

export interface ChallengeOpponent { id: number; name: string; email: string; phone: string | null; rollNumber: string | null; institution: string | null }
export interface ChallengeSummary {
  id: number; role: 'challenger' | 'opponent'; opponent: ChallengeOpponent | null;
  totalQuestions: number; status: 'PENDING' | 'DECLINED' | 'COMPLETED' | 'EXPIRED'; expiresAt: string; createdAt: string;
  myScorePercent: number | null; myCorrectCount: number | null; opponentScorePercent: number | null; opponentCorrectCount: number | null;
  iHavePlayed: boolean; opponentHasPlayed: boolean;
}
export interface ChallengeMcq { id: number; question: string; options: string[]; correctAnswer: string | null; explanation: string | null }
export interface ChallengeDetail {
  id: number; status: ChallengeSummary['status']; opponent: ChallengeOpponent | null;
  myAttempt: { correctCount: number; totalQuestions: number; scorePercent: number } | null;
  mcqs: ChallengeMcq[];
}

export const challengesApi = {
  findStudents: (q: string) => request<ChallengeOpponent[]>(`/students/find?q=${encodeURIComponent(q)}`),
  create: (body: { opponentId: number; blockId?: number; moduleId?: number; subjectId?: number; topicId?: number; totalQuestions?: number }) =>
    request<{ id: number; opponent: ChallengeOpponent; totalQuestions: number; status: string }>('/challenges', { method: 'POST', body: JSON.stringify(body) }),
  mine: () => request<{ sent: ChallengeSummary[]; received: ChallengeSummary[] }>('/challenges/mine'),
  get: (id: number) => request<ChallengeDetail>(`/challenges/${id}`),
  decline: (id: number) => request<{ id: number; status: string }>(`/challenges/${id}/decline`, { method: 'POST' }),
  submit: (id: number, body: { answers: { mcqId: number; selectedAnswer: string | null }[]; durationSeconds?: number }) =>
    request<{ correctCount: number; totalQuestions: number; scorePercent: number; opponentHasPlayed: boolean; opponentScorePercent: number | null }>(`/challenges/${id}/submit`, { method: 'POST', body: JSON.stringify(body) }),
};

export const aiVisualizerApi = {
  generate: (prompt: string) => request<{ visualization: VisualizationSpec }>('/ai/visualizer', { method: 'POST', body: JSON.stringify({ prompt }) }),
  explainStep: (overallTitle: string, stepTitle: string, stepDescription: string) =>
    request<{ explanation: string }>('/ai/visualizer/explain-step', { method: 'POST', body: JSON.stringify({ overallTitle, stepTitle, stepDescription }) }),
};

/** Header search palette. */
export const searchApi = { query: (q: string) => request<SearchResults>(`/student/search?q=${encodeURIComponent(q)}`) };
