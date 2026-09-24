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

export class ApiRequestError extends Error {
  status: number;
  data: unknown;
  constructor(status: number, message: string, data: unknown) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

// Uploaded-file paths returned by the API (payment proofs, favicons, team
// photos, resources) are relative ("/api/uploads/...") for local disk
// storage. That works fine same-origin, but on a split deployment (admin
// frontend and API on different hosts/ports — e.g. local dev with the admin
// app on :5174 and the API on a different port with no proxy configured)
// a bare <img src="/api/uploads/..."> resolves against the ADMIN app's own
// origin, not the API's, and 404s. Always route uploaded-file URLs through
// this so they resolve against the configured API origin.
export function resolveUploadUrl(pathOrUrl: string | null | undefined): string | null {
  if (!pathOrUrl) return null;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl; // already absolute (e.g. Supabase Storage URL)
  return `${API_ORIGIN}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
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
    // A non-JSON 404/error response here almost always means this request
    // never reached the Express API at all — e.g. VITE_API_BASE_URL isn't
    // set (or points at the wrong host) on a split deploy, so the fetch hit
    // a static host (Netlify/Vercel) with no route for /api/*, or a
    // same-origin deploy with no backend behind it. A real API error from
    // our own server always comes back as JSON (see app.ts's catch-all and
    // error handler), so surface that distinction instead of a bare status
    // code that looks like an app bug.
    const fallback = !isJson
      ? ([502, 503, 504].includes(res.status)
          ? 'This is taking longer than expected. Try again — if it keeps happening, try a shorter or simpler request.'
          : `Can't reach the API (HTTP ${res.status}). Check that VITE_API_BASE_URL is set correctly for this deployment and that the backend is running.`)
      : `Request failed (${res.status})`;
    throw new ApiRequestError(res.status, (data && (data.error || data.message)) || fallback, data);
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
  institutionId: number | null; programId: number | null; academicYearId: number | null; batchId: number | null;
  rollNumber: string | null; phone: string | null;
}

export interface PlatformSettings {
  [key: string]: string;
  ADMIN_SIGNUP_CODE: string; SUPPORT_WHATSAPP: string; PLATFORM_NAME: string; PLATFORM_TAGLINE: string;
  DEFAULT_CURRENCY: string; PAYMENT_INSTRUCTIONS: string; ANNOUNCEMENT_BANNER: string; REGISTRATION_ENABLED: string; AI_VISUALIZER_ENABLED: string; AI_EXPLAIN_ENABLED: string; GLOBAL_TRIAL_MODE: string; GLOBAL_TRIAL_PROGRAM: string; GLOBAL_TRIAL_YEAR: string; GLOBAL_TRIAL_YEARS: string; GLOBAL_TRIAL_FEATURES: string; GLOBAL_TRIAL_ENDS_AT: string;
  // Read-only extras the server adds to GET/PATCH /admin/settings — JSON
  // (TrialFeatureOption[]) and a number, both as strings like everything else here.
  TRIAL_FEATURE_OPTIONS: string; BREVO_MAX_SLOTS: string;
  PAYMENT_ACCOUNT_HOLDER: string; PAYMENT_ACCOUNT_NUMBER: string; PAYMENT_BANK_NAME: string; PAYMENT_IFSC_OR_ROUTING: string; PAYMENT_UPI_ID: string; PAYMENT_QR_CODE_PATH: string;
  PAYMENT_RAAST_ID: string; PAYMENT_WALLET_PROVIDER: string; PAYMENT_WALLET_NUMBER: string; PAYMENT_WALLET_ACCOUNT_NAME: string;
  PAYMENT_BANK_ACCOUNTS: string; PAYMENT_METHODS_CONFIG: string; PAYMENT_LATE_FEE_NOTE: string; PAYMENT_REFUND_POLICY: string;
  SITE_FAVICON_PATH: string; SITE_FAVICON_URL: string; PAYMENT_QR_CODE_URL: string;
  PLATFORM_DESCRIPTION: string; SOCIAL_FACEBOOK: string; SOCIAL_YOUTUBE: string; SOCIAL_LINKEDIN: string; SOCIAL_INSTAGRAM: string;
  CONTACT_EMAIL: string; CONTACT_LOCATION: string; SUPPORT_HOURS: string; COPYRIGHT_NOTICE: string; FEATURES_LIST: string; QUICK_LINKS: string;
  AI_PROVIDER: string; AI_API_KEY_SET: string; AI_API_KEY_MASKED: string; AI_API_KEY: string;
  CLOUDINARY_CLOUD_NAME: string; CLOUDINARY_API_KEY: string; CLOUDINARY_API_SECRET: string; CLOUDINARY_API_SECRET_SET: string; CLOUDINARY_API_SECRET_MASKED: string;
  CLOUDINARY_CONFIGURED: string;
  EMAIL_PROVIDER: string; MAIL_FROM: string; MAIL_FROM_NAME: string;
  BREVO_API_KEY: string; BREVO_API_KEY_SET: string; BREVO_API_KEY_MASKED: string;
  BREVO_SLOT_STRATEGY: string;
  SMTP_HOST: string; SMTP_PORT: string; SMTP_USER: string; SMTP_PASS: string; SMTP_PASS_SET: string; SMTP_PASS_MASKED: string;
  CUSTOM_EMAIL_API_URL: string; CUSTOM_EMAIL_API_KEY: string; CUSTOM_EMAIL_API_KEY_SET: string; CUSTOM_EMAIL_API_KEY_MASKED: string;
  CUSTOM_EMAIL_API_KEY_HEADER: string; CUSTOM_EMAIL_API_KEY_PREFIX: string;
  EMAIL_CONFIGURED: string;
  THEME_PRIMARY: string; THEME_SECONDARY: string; THEME_ACCENT: string;
  THEME_BACKGROUND: string; THEME_CARD: string; THEME_TEXT: string; THEME_MODE: string;
}

export interface BankAccount { id: string; label: string; accountHolder: string; bankName: string; accountNumber: string; ifsc: string; branch: string; isPrimary: boolean }
export interface PaymentMethodConfig { key: string; label: string; type: 'bank' | 'wallet' | 'card' | 'cash'; enabled: boolean; instructions: string; accountNumber?: string; accountName?: string }

export interface AuditLogEntry { id: number; actorId: number | null; actorName: string; action: string; entity: string; entityId: number | null; metadata: string | null; createdAt: string }

export interface StudentSummary { id: number; name: string; email: string; institution: string; program: string; status: string; joinedAt: string; progress: number }
export interface StudentDetail {
  id: number; name: string; email: string; phone: string | null; rollNumber: string | null; status: string; statusMessage: string | null; emailVerified: boolean;
  institution: string | null; program: string | null; academicYear: string | null; batch: string | null;
  currentStreak: number; longestStreak: number; lastLoginAt: string | null; joinedAt: string;
  payments: PaymentRow[]; activeMembership: { expiresAt: string; isTrial: boolean } | null;
}
export interface StudentChallengeRow {
  id: number; role: 'challenger' | 'opponent'; opponent: { id: number; name: string } | null;
  totalQuestions: number; status: 'PENDING' | 'DECLINED' | 'COMPLETED' | 'EXPIRED'; createdAt: string;
  myScorePercent: number | null; opponentScorePercent: number | null; iHavePlayed: boolean;
}
export interface PaymentRow { id: number; studentName: string; institution: string; program: string; academicYear: string; batch: string; rollNumber: string; planName: string; amount: number; currency: string; method: string; reference: string; paymentDate: string; proofPath: string | null; status: string; submittedAt: string }
export interface StudentDevice { id: number; label: string; ip: string | null; signedInAt: string; lastSeenAt: string }
// limit = what applies now (0 = unlimited); override = this student's own setting (null = follows the platform default).
export interface StudentDevices { limit: number; override: number | null; defaultLimit: number; devices: StudentDevice[] }
export const STUDENT_STATUSES = ['UNVERIFIED', 'VERIFIED', 'PAYMENT_PENDING_REVIEW', 'ACTIVE', 'EXPIRED', 'SUSPENDED', 'REJECTED', 'DELETED'] as const;

export interface McqImportProfile { id: number; name: string; questionPattern: string; optionPattern: string; answerPattern: string; explanationPattern: string; hintPattern?: string | null; referencePattern?: string | null; isDefault: boolean }
// suggestedPath: only populated for tabular sources with recognizable
// Block/Module/Subject/Topic-ish columns (an "enriched" export tagging
// every question with its place in the curriculum) — see mcqParser.ts.
// It's a suggestion only; no review UI reads/edits it yet and commit
// doesn't act on it (no module/subject/topic gets created or matched from
// it) — see AI_HANDOFF_ENRICHED_IMPORT.md for wiring this up.
export interface McqCandidate { question: string; options: string[]; correctAnswer: string | null; explanation: string | null; optionExplanations: (string | null)[] | null; reference: string | null; hint: string | null; needsReview: boolean; rawBlock?: string; difficulty: 'easy' | 'moderate' | 'hard'; suggestedPath?: { block: string | null; module: string | null; subject: string | null; topic: string | null } | null }
export interface McqParseResult { fileName: string; totalFound: number; needsReviewCount: number; candidates: McqCandidate[] }

export interface FlashcardCandidate { front: string; back: string; needsReview: boolean; rawBlock?: string }
export interface FlashcardParseResult { fileName: string; totalFound: number; needsReviewCount: number; candidates: FlashcardCandidate[] }

// File-based flashcard import — same "upload, parse, review, commit" shape
// as mcqImportApi, minus the configurable regex profiles (flashcards only
// ever have a front/back, so there's nothing to customize a pattern for).
export const flashcardImportApi = {
  parse: async (file: File): Promise<FlashcardParseResult> => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${API_ORIGIN}/api/admin/flashcard-import/parse`, { method: 'POST', credentials: 'include', body: form });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new ApiRequestError(res.status, (data && data.error) || 'Could not parse this file', data);
    return data;
  },
  commit: (body: { moduleId: number; subjectId: number; topicId: number; module: string; topic: string; cards: FlashcardCandidate[] }) =>
    request<{ imported: number; ids: number[] }>('/admin/flashcard-import/commit', { method: 'POST', body: JSON.stringify(body) }),
};

// Whole-bank backup/restore — the flashcard-side counterpart to
// mcqBackupApi below. Export downloads every flashcard (every field) as
// one JSON file, or (given a scope) just the cards under one
// Year/Block/Module/Subject/Topic branch; import restores a file like it,
// either alongside the existing bank or replacing it (a scoped backup's
// "replace" only wipes that same branch first).
export const flashcardBackupApi = {
  exportUrl: () => `${API_BASE}/admin/flashcard-backup/export`,
  // Not a plain <a href> download — same reasoning as mcqBackupApi's
  // downloadBackup: needs the admin's session cookie and a real error
  // message instead of a bare failed navigation if it fails.
  downloadBackup: async (scope?: BackupScope | null): Promise<void> => {
    const res = await fetch(`${API_BASE}/admin/flashcard-backup/export?${backupScopeQuery(scope)}`, { credentials: 'include' });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new ApiRequestError(res.status, (data && data.error) || 'Could not download the backup', data);
    }
    const disposition = res.headers.get('content-disposition') || '';
    const filenameMatch = disposition.match(/filename="([^"]+)"/);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filenameMatch?.[1] || 'flashcard-bank-backup.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
  importBackup: async (file: File, mode: 'append' | 'replace'): Promise<{ restored: number; mode: 'append' | 'replace'; deletedFirst: number; scope: BackupScope | null }> => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${API_BASE}/admin/flashcard-backup/import?mode=${mode}`, { method: 'POST', credentials: 'include', body: form });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new ApiRequestError(res.status, (data && data.error) || 'Could not restore this backup', data);
    return data;
  },
};

export const DEFAULT_IMPORT_PATTERNS = {
  questionPattern: "^\\s*(?:Q\\.?\\s*)?(\\d{1,3})[\\.\\):]\\s+(.+)$",
  optionPattern: "^\\s*\\(?([A-Da-d])\\)?[\\.\\):]\\s+(.+)$",
  answerPattern: "^\\s*(?:Answer|Ans|Correct\\s*Answer|Key)\\s*[:\\-]\\s*\\(?([A-Da-d])\\)?",
  explanationPattern: "^\\s*(?:Explanation|Rationale|Explain)\\s*[:\\-]\\s*(.+)$",
  hintPattern: "^\\s*(?:Hint|Tip|Clue)\\s*[:\\-]\\s*(.+)$",
  referencePattern: "^\\s*(?:Reference|Ref|Source|Citation)\\s*[:\\-]\\s*(.+)$",
};

export const TEAM_CATEGORIES = ['ownership', 'reviewer', 'question_setter'] as const;
export type TeamCategory = typeof TEAM_CATEGORIES[number];
export const TEAM_CATEGORY_LABELS: Record<TeamCategory, string> = { reviewer: 'Reviewers', question_setter: 'Question setters', ownership: 'Ownership' };
export interface TeamMember { id: number; name: string; role: string; category: TeamCategory; bio: string; achievementBadge: string; photoPath: string | null; linkedinUrl: string; instagramUrl: string; email: string; active: boolean; displayOrder: number }
export interface TrialFeatureOption { key: string; label: string; description: string; defaultOn: boolean }
export interface TrialStatus { active: boolean; program: string; years: number[]; features: string[]; endsAt: string | null }
export interface SiteContent {
  // Resolved General Trial Mode state (defaults applied, end date honoured).
  trial?: TrialStatus;
  PLATFORM_NAME: string; PLATFORM_TAGLINE: string; PLATFORM_DESCRIPTION: string;
  SEO_TITLE: string; SEO_DESCRIPTION: string;
  SOCIAL_FACEBOOK: string; SOCIAL_YOUTUBE: string; SOCIAL_LINKEDIN: string; SOCIAL_INSTAGRAM: string;
  CONTACT_EMAIL: string; CONTACT_LOCATION: string; SUPPORT_HOURS: string; COPYRIGHT_NOTICE: string;
  features: string[]; quickLinks: Array<{ label: string; url: string }>; team: TeamMember[];
  faviconUrl: string | null;
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
  removePermanent: (id: number) => request<{ ok: true }>(`/admin/team-members/${id}/permanent`, { method: 'DELETE' }),
};

export interface AdminModule { id: number; name: string; subtitle: string; subjectCount: number; topicCount: number; progress: number; active: boolean; blockId?: number | null; blockName?: string | null; displayOrder?: number; iconUrl?: string | null; programTargetKind?: string | null; yearTargetNumber?: number | null; targetingLabel?: string }

export const moduleAdminApi = {
  listAll: () => request<AdminModule[]>('/modules'),
  create: (body: { name: string; subtitle: string; active?: boolean; blockId?: number | null; iconPath?: string | null; displayOrder?: number; programTargetKind?: string | null; yearTargetNumber?: number | null }) =>
    request<AdminModule>('/modules', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: number, body: Partial<{ name: string; subtitle: string; active: boolean; blockId: number | null; iconPath: string | null; displayOrder: number; programTargetKind: string | null; yearTargetNumber: number | null }>) =>
    request<AdminModule>(`/modules/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  remove: (id: number) => request<{ ok: true }>(`/modules/${id}`, { method: 'DELETE' }),
  removePermanent: (id: number) => request<{ ok: true }>(`/modules/${id}/permanent`, { method: 'DELETE' }),
};

export interface AdminBlock { id: number; name: string; subtitle: string; iconUrl: string | null; displayOrder: number; active: boolean; programTargetKind?: string | null; yearTargetNumber?: number | null; targetingLabel?: string }

export const blockAdminApi = {
  listAll: () => request<AdminBlock[]>('/blocks'),
  create: (body: { name: string; subtitle?: string; active?: boolean; iconPath?: string | null; displayOrder?: number; programTargetKind?: string | null; yearTargetNumber?: number | null }) =>
    request<AdminBlock>('/blocks', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: number, body: Partial<{ name: string; subtitle: string; active: boolean; iconPath: string | null; displayOrder: number; programTargetKind: string | null; yearTargetNumber: number | null }>) =>
    request<AdminBlock>(`/blocks/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  remove: (id: number) => request<{ ok: true }>(`/blocks/${id}`, { method: 'DELETE' }),
  removePermanent: (id: number) => request<{ ok: true }>(`/blocks/${id}/permanent`, { method: 'DELETE' }),
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
  breakdown?: Array<{ mcqId: number; question: string; options: string[]; selectedAnswer: string | null; correctAnswer: string | null; explanation: string | null; correct: boolean | null }>;
}

// ---------------------------------------------------------------------------
// OSPE / OSCE practical exams
// ---------------------------------------------------------------------------

export type OspeExamType = 'OSPE' | 'OSCE';
export interface OspeBlock {
  id: number; name: string; subtitle: string; examType: OspeExamType; iconPath: string | null; active: boolean;
  archived: boolean; displayOrder: number; programTargetKind: string | null; yearTargetNumber: number | null; targetingLabel: string;
}
export interface OspeModule extends OspeBlock { blockId: number | null; blockName: string | null }
export interface OspeLearningMaterial {
  id: number; moduleId: number | null; blockId: number | null; examType: OspeExamType; title: string; description: string; bodyText: string;
  imagePath: string | null; attachmentPath: string | null; externalUrl: string | null; active: boolean; archived: boolean;
  displayOrder: number; programTargetKind: string | null; yearTargetNumber: number | null; targetingLabel: string;
}
export interface OspeLabelPoint { id: string; x: number; y: number; label: string; marks?: number | null }
export interface OspeStation {
  id: number; moduleId: number | null; blockId: number | null; examType: OspeExamType; title: string; instructions: string; imagePath: string | null;
  attachmentPath: string | null; answerType: 'MCQ' | 'WRITTEN' | 'LABELING'; options: string[] | null; correctAnswer: string | null;
  modelAnswer: string | null; labelPoints: OspeLabelPoint[] | null; marks: number; timeLimitSeconds: number | null; active: boolean; archived: boolean;
  displayOrder: number; programTargetKind: string | null; yearTargetNumber: number | null; targetingLabel: string;
}
export interface OspeExam {
  id: number; title: string; description: string; examType: OspeExamType; programTargetKind: string | null; yearTargetNumber: number | null;
  durationMinutes: number; startAt: string; endAt: string; maxAttempts: number; passingPercent: number | null;
  resultReleaseMode: 'immediate' | 'after_end' | 'manual'; showMarks: boolean; showPercentage: boolean; showCorrectAnswers: boolean;
  status: 'draft' | 'published' | 'archived';
}
export interface OspeAdminExam extends OspeExam { stationCount: number; attemptCount: number }
export interface OspeStudentExam extends OspeExam { attemptsUsed: number; canStart: boolean; inProgressAttemptId: number | null; windowStatus: 'upcoming' | 'open' | 'closed' }
export interface OspeExamStation { id: number; title: string; instructions: string; imagePath: string | null; attachmentPath: string | null; answerType: 'MCQ' | 'WRITTEN' | 'LABELING'; options: string[] | null; labelPoints: Array<{ id: string; x: number; y: number }> | null; marks: number; timeLimitSeconds: number | null }
export interface OspeExamStartResponse { attemptId: number; startedAt: string; durationMinutes: number; stations: OspeExamStation[] }
export interface OspeExamAttemptRow { id: number; examId: number; userId: number; studentName: string; institution: string; attemptNumber: number; startedAt: string; submittedAt: string | null; totalStations: number; totalMarks: number; obtainedMarks: number; percentage: number; passed: boolean | null; status: string; resultsReleasedAt: string | null }
export interface OspeExamResult {
  released: boolean; status?: string; totalStations?: number; fullyGraded?: boolean;
  totalMarks?: number; obtainedMarks?: number | null; percentage?: number | null; passed?: boolean | null;
  breakdown?: Array<{
    stationId: number; title: string; instructions: string; imagePath: string | null; answerType: 'MCQ' | 'WRITTEN' | 'LABELING'; options: string[] | null;
    selectedAnswer: string | null; writtenAnswer: string | null; correctAnswer: string | null; modelAnswer: string | null;
    labelPoints: OspeLabelPoint[] | null; labelAnswers: Record<string, string> | null;
    marks: number; marksObtained: number | null; correct: boolean | null; aiVerdict: 'correct' | 'partial' | 'incorrect' | null; aiFeedback: string | null;
  }>;
}

function ospeQuery(examType?: OspeExamType) { return examType ? `?examType=${examType}` : ''; }

export const ospeAdminApi = {
  blocks: {
    list: (examType?: OspeExamType) => request<OspeBlock[]>(`/admin/ospe/blocks${ospeQuery(examType)}`),
    create: (body: Partial<OspeBlock>) => request<OspeBlock>('/admin/ospe/blocks', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: number, body: Partial<OspeBlock>) => request<OspeBlock>(`/admin/ospe/blocks/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    archive: (id: number) => request<{ ok: true }>(`/admin/ospe/blocks/${id}`, { method: 'DELETE' }),
    removePermanent: (id: number) => request<{ ok: true }>(`/admin/ospe/blocks/${id}/permanent`, { method: 'DELETE' }),
  },
  modules: {
    list: (examType?: OspeExamType) => request<OspeModule[]>(`/admin/ospe/modules${ospeQuery(examType)}`),
    create: (body: Partial<OspeModule>) => request<OspeModule>('/admin/ospe/modules', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: number, body: Partial<OspeModule>) => request<OspeModule>(`/admin/ospe/modules/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    archive: (id: number) => request<{ ok: true }>(`/admin/ospe/modules/${id}`, { method: 'DELETE' }),
    removePermanent: (id: number) => request<{ ok: true }>(`/admin/ospe/modules/${id}/permanent`, { method: 'DELETE' }),
  },
  learningMaterials: {
    list: (examType?: OspeExamType) => request<OspeLearningMaterial[]>(`/admin/ospe/learning-materials${ospeQuery(examType)}`),
    create: (body: Partial<OspeLearningMaterial>) => request<OspeLearningMaterial>('/admin/ospe/learning-materials', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: number, body: Partial<OspeLearningMaterial>) => request<OspeLearningMaterial>(`/admin/ospe/learning-materials/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    archive: (id: number) => request<{ ok: true }>(`/admin/ospe/learning-materials/${id}`, { method: 'DELETE' }),
    removePermanent: (id: number) => request<{ ok: true }>(`/admin/ospe/learning-materials/${id}/permanent`, { method: 'DELETE' }),
  },
  stations: {
    list: (examType?: OspeExamType) => request<OspeStation[]>(`/admin/ospe/stations${ospeQuery(examType)}`),
    create: (body: Partial<OspeStation>) => request<OspeStation>('/admin/ospe/stations', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: number, body: Partial<OspeStation>) => request<OspeStation>(`/admin/ospe/stations/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    archive: (id: number) => request<{ ok: true }>(`/admin/ospe/stations/${id}`, { method: 'DELETE' }),
    removePermanent: (id: number) => request<{ ok: true }>(`/admin/ospe/stations/${id}/permanent`, { method: 'DELETE' }),
  },
  exams: {
    list: (examType?: OspeExamType) => request<OspeAdminExam[]>(`/admin/ospe/exams${ospeQuery(examType)}`),
    create: (body: Partial<OspeExam>) => request<OspeExam>('/admin/ospe/exams', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: number, body: Partial<OspeExam>) => request<OspeExam>(`/admin/ospe/exams/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    archive: (id: number) => request<{ ok: true }>(`/admin/ospe/exams/${id}`, { method: 'DELETE' }),
    removePermanent: (id: number, force?: boolean) => request<{ ok: true }>(`/admin/ospe/exams/${id}/permanent${force ? '?force=true' : ''}`, { method: 'DELETE' }),
    setStations: (id: number, stationIds: number[]) => request<{ ok: true; count: number }>(`/admin/ospe/exams/${id}/stations`, { method: 'POST', body: JSON.stringify({ stationIds }) }),
    getStations: (id: number) => request<Array<OspeStation & { examStationOrder: number }>>(`/admin/ospe/exams/${id}/stations`),
    attempts: (id: number) => request<OspeExamAttemptRow[]>(`/admin/ospe/exams/${id}/attempts`),
    releaseOne: (attemptId: number) => request<{ ok: true }>(`/admin/ospe/exam-attempts/${attemptId}/release`, { method: 'POST' }),
    releaseAll: (examId: number) => request<{ ok: true }>(`/admin/ospe/exams/${examId}/release-all`, { method: 'POST' }),
  },
};

export const ospeApi = {
  blocks: (examType?: OspeExamType) => request<Array<{ id: number; name: string; subtitle: string; examType: OspeExamType; displayOrder: number }>>(`/ospe/blocks${ospeQuery(examType)}`),
  modules: (examType?: OspeExamType, blockId?: number) => request<Array<{ id: number; name: string; subtitle: string; examType: OspeExamType; blockId: number | null; displayOrder: number }>>(`/ospe/modules${examType || blockId ? `?${[examType ? `examType=${examType}` : '', blockId ? `blockId=${blockId}` : ''].filter(Boolean).join('&')}` : ''}`),
  learningMaterials: (examType?: OspeExamType, moduleId?: number) => request<Array<Omit<OspeLearningMaterial, 'active' | 'archived' | 'displayOrder' | 'programTargetKind' | 'yearTargetNumber' | 'targetingLabel'>>>(`/ospe/learning-materials${examType || moduleId ? `?${[examType ? `examType=${examType}` : '', moduleId ? `moduleId=${moduleId}` : ''].filter(Boolean).join('&')}` : ''}`),
  exams: (examType?: OspeExamType) => request<OspeStudentExam[]>(`/ospe/exams${ospeQuery(examType)}`),
  start: (id: number) => request<OspeExamStartResponse>(`/ospe/exams/${id}/start`, { method: 'POST' }),
  answer: (attemptId: number, stationId: number, selectedAnswer: string | null, writtenAnswer: string | null) =>
    request<{ ok: true }>(`/ospe/exam-attempts/${attemptId}/answer`, { method: 'POST', body: JSON.stringify({ stationId, selectedAnswer, writtenAnswer }) }),
  submit: (attemptId: number) => request<{ attemptId: number; status: string; resultsReleased: boolean }>(`/ospe/exam-attempts/${attemptId}/submit`, { method: 'POST' }),
  // Retries AI grading for any WRITTEN stations still ungraded (e.g. the
  // first pass at submit time ran out of its time budget) — safe to call
  // repeatedly, already-graded stations are skipped server-side.
  grade: (attemptId: number) => request<{ ok: true; graded: number; pending: number; obtainedMarks: number; percentage: number }>(`/ospe/exam-attempts/${attemptId}/grade`, { method: 'POST' }),
  result: (attemptId: number) => request<OspeExamResult>(`/ospe/exam-attempts/${attemptId}/result`),
};

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
};

export interface GeneratedFlashcard { front: string; back: string }
export const flashcardsAiApi = {
  generate: (body: { topicId?: number; sourceText?: string; count?: number }) => request<{ drafts: GeneratedFlashcard[] }>('/admin/flashcards/generate', { method: 'POST', body: JSON.stringify(body) }),
};

export const examsAdminApi = {
  list: () => request<AdminExam[]>('/admin/exams'),
  create: (body: Partial<Exam>) => request<Exam>('/admin/exams', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: number, body: Partial<Exam>) => request<Exam>(`/admin/exams/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  archive: (id: number) => request<{ ok: true }>(`/admin/exams/${id}`, { method: 'DELETE' }),
  // `force` re-sends the delete after the backend's first refusal (an exam
  // with recorded attempts) to also wipe those attempts/results — see
  // AdminExams' two-step confirm dialog, which only sends force=true once
  // the admin has seen and accepted that extra warning.
  removePermanent: (id: number, force?: boolean) => request<{ ok: true }>(`/admin/exams/${id}/permanent${force ? '?force=true' : ''}`, { method: 'DELETE' }),
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

export const studentsAdminApi = {
  detail: (id: number) => request<StudentDetail>(`/students/${id}`),
  challenges: (id: number) => request<{ sent: StudentChallengeRow[]; received: StudentChallengeRow[] }>(`/students/${id}/challenges`),
  update: (id: number, body: Partial<{ name: string; phone: string; rollNumber: string }>) => request<{ ok: true }>(`/students/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  updateStatus: (id: number, status: string, emailVerified?: boolean, message?: string) => request<{ ok: true; status: string; emailVerified: boolean; statusMessage: string | null }>(`/students/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status, ...(emailVerified !== undefined ? { emailVerified } : {}), ...(message !== undefined ? { message } : {}) }) }),
  verifyEmail: (id: number) => request<{ ok: true; status: string; emailVerified: boolean }>(`/students/${id}/verify-email`, { method: 'POST' }),
  startTrial: (id: number, durationDays: number) => request<{ ok: true; expiresAt: string }>(`/students/${id}/trial`, { method: 'POST', body: JSON.stringify({ durationDays }) }),
  endTrial: (id: number) => request<{ ok: true }>(`/students/${id}/trial`, { method: 'DELETE' }),
  devices: (id: number) => request<StudentDevices>(`/students/${id}/devices`),
  setDeviceLimit: (id: number, maxDevices: number | null) => request<{ ok: true; limit: number; override: number | null }>(`/students/${id}/device-limit`, { method: 'PATCH', body: JSON.stringify({ maxDevices }) }),
  revokeDevice: (id: number, sessionId: number) => request<{ ok: true }>(`/students/${id}/devices/${sessionId}`, { method: 'DELETE' }),
  revokeAllDevices: (id: number) => request<{ ok: true; revoked: number }>(`/students/${id}/devices`, { method: 'DELETE' }),
  remove: (id: number) => request<{ ok: true }>(`/students/${id}`, { method: 'DELETE' }),
  removePermanent: (id: number) => request<{ ok: true }>(`/students/${id}/permanent`, { method: 'DELETE' }),
};

export interface AdminSearchResult { id: number; title: string; subtitle?: string; status?: string }
export interface AdminSearchResponse {
  students: AdminSearchResult[]; mcqs: AdminSearchResult[]; modules: AdminSearchResult[];
  subjects: AdminSearchResult[]; topics: AdminSearchResult[]; exams: AdminSearchResult[]; pastPapers: AdminSearchResult[];
}
export const adminSearchApi = {
  search: (q: string) => request<AdminSearchResponse>(`/admin/search?q=${encodeURIComponent(q)}`),
};

export const paymentsAdminApi = {
  remove: (id: number) => request<{ ok: true }>(`/payments/${id}`, { method: 'DELETE' }),
  removePermanent: (id: number) => request<{ ok: true }>(`/payments/${id}/permanent`, { method: 'DELETE' }),
};

export const membershipPlansAdminApi = {
  remove: (id: number) => request<{ ok: true }>(`/membership-plans/${id}`, { method: 'DELETE' }),
  removePermanent: (id: number) => request<{ ok: true }>(`/membership-plans/${id}/permanent`, { method: 'DELETE' }),
};

export interface AdminMcqRow {
  id: number; question: string; options: string[]; correctAnswer: string | null; explanation: string | null; optionExplanations: (string | null)[] | null;
  explanationStatus: ExplanationStatus; reference: string | null; difficulty: string; tags: string[]; imagePath: string | null;
  status: string; source: string; moduleId: number | null; subjectId: number | null; topicId: number | null; pastPaperId: number | null; examId: number | null;
  createdAt: string; updatedAt: string;
}
export const mcqAdminApi = {
  remove: (id: number) => request<{ ok: true }>(`/mcqs/${id}`, { method: 'DELETE' }),
  list: () => request<AdminMcqRow[]>('/admin/mcqs'),
  publish: (id: number) => request<AdminMcqRow>(`/mcqs/${id}/publish`, { method: 'POST' }),
  update: (id: number, body: Partial<{ question: string; options: string[]; correctAnswer: string | null; explanation: string | null; optionExplanations: (string | null)[] | null; reference: string | null; difficulty: string; status: string; moduleId: number; subjectId: number; topicId: number }>) =>
    request<AdminMcqRow>(`/mcqs/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  bulkRemove: (body: { ids: number[] } | { all: true; filters?: { search?: string; moduleId?: number; subjectId?: number; topicId?: number; difficulty?: string } }) =>
    request<{ ok: true; deleted: number }>('/admin/mcqs/bulk', { method: 'DELETE', body: JSON.stringify(body) }),
  bulkCreate: (mcqs: Array<Partial<AdminMcqRow> & { question: string; options: string[] }>) =>
    request<{ ok: true; created: number; mcqs: AdminMcqRow[] }>('/admin/mcqs/bulk', { method: 'POST', body: JSON.stringify({ mcqs }) }),
  generateAi: (topicId: number, count: number, difficulty?: 'easy' | 'moderate' | 'hard') =>
    request<{ drafts: Array<{ question: string; options: string[]; correctAnswer: string; explanation: string; optionExplanations?: (string | null)[]; difficulty?: string }>; topicLabel: string }>('/admin/mcqs/generate', { method: 'POST', body: JSON.stringify({ topicId, count, difficulty }) }),
  // AI-reclassifies difficulty for existing questions (easy/moderate/hard).
  // Each call is still capped server-side (see CLASSIFY_BATCH_CAP) so a
  // single request can't run long enough to hit a hosting gateway timeout
  // — pass {all:true, filters} for a scope, {ids} for an explicit batch.
  // Returns how many are still left in that scope; callers that want the
  // *whole* scope done should call this again while `remaining > 0` (the
  // AnalysisPanel button in shared.tsx does this loop automatically).
  classifyDifficulty: (body: { ids: number[] } | { all: true; filters?: { moduleId?: number; subjectId?: number; topicId?: number; pastPaperId?: number } }) =>
    request<{ classified: number; remaining: number; results: Array<{ id: number; difficulty: 'easy' | 'moderate' | 'hard' }> }>('/admin/mcqs/classify-difficulty', { method: 'POST', body: JSON.stringify(body) }),
  // AI-backfills optionExplanations for existing questions that are
  // missing them (or have an incomplete set). Same capped-per-call /
  // {ids} / {all, filters} shape as classifyDifficulty above — a bank of
  // 100+ questions is worked through by calling this repeatedly while
  // `remaining > 0` (handled automatically by the AnalysisPanel button in
  // shared.tsx). Skips questions that already have a full set of
  // per-option explanations rather than overwriting them.
  generateOptionExplanations: (body: { ids: number[] } | { all: true; filters?: { moduleId?: number; subjectId?: number; topicId?: number; pastPaperId?: number } }) =>
    request<{ generated: number; remaining: number; results: Array<{ id: number; optionExplanations: string[] }> }>('/admin/mcqs/generate-option-explanations', { method: 'POST', body: JSON.stringify(body) }),
  // One-click fix for the "imported 406, module only shows 380" gap — see
  // mcq-import.ts's CommitBody.status comment. Omit moduleId to publish
  // every draft in the whole bank.
  publishDrafts: (moduleId?: number) => request<{ ok: true; published: number }>('/admin/mcqs/publish-drafts', { method: 'PATCH', body: JSON.stringify({ moduleId }) }),
  // See POST /admin/mcqs/shuffle-options — randomly reorders each
  // question's options (and any per-option explanations, in lockstep)
  // without touching which option is marked correct. Fixes banks (e.g.
  // bulk-imported from an AI generator) where the correct answer is
  // always the same letter.
  shuffleOptions: (body: { ids: number[] } | { all: true; filters?: { search?: string; moduleId?: number; subjectId?: number; topicId?: number; difficulty?: string; pastPaperId?: number } }) =>
    request<{ ok: true; shuffled: number; skipped: number }>('/admin/mcqs/shuffle-options', { method: 'POST', body: JSON.stringify(body) }),
  // "AI Fix All" (Content Quality Center): rewrites the second question in
  // each near-duplicate pair so it's no longer a near-copy of the first,
  // keeping the same tested fact and correct answer. Capped at 8 pairs per
  // call (server enforces this too) so a bank with many duplicates is
  // cleared over several calls rather than one that risks a gateway timeout.
  dedupeBatch: (pairs: Array<{ id: number; otherId: number }>) =>
    request<{ fixed: number; results: Array<{ id: number; rewritten: boolean }> }>('/admin/mcqs/dedupe-batch', { method: 'POST', body: JSON.stringify({ pairs }) }),
  // "AI Fix" for the Invalid stat/list: repairs empty questions, too-few or
  // duplicate options, and missing/mismatched correct answers. Capped at 8
  // items per call (server enforces this too), same reasoning as dedupeBatch.
  repairInvalidBatch: (items: Array<{ id: number; reasons: string[] }>) =>
    request<{ fixed: number; results: Array<{ id: number; fixed: boolean }> }>('/admin/mcqs/repair-invalid-batch', { method: 'POST', body: JSON.stringify({ items }) }),
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
  commit: (body: { moduleId?: number; subjectId?: number; topicId?: number; pastPaperId?: number; examId?: number; status: 'draft' | 'published'; mcqs: McqCandidate[] }) =>
    request<{ imported: number; ids: number[] }>('/admin/mcq-import/commit', { method: 'POST', body: JSON.stringify(body) }),
};

// Narrows a whole-bank backup export down to one branch of the curriculum
// tree — mirrors the server's BackupScope (backupScope.ts). `id` is the
// block/module/subject/topic's row id, or the academic year number (1-5)
// itself for level 'year'. `label` is only for the filename/UI.
export interface BackupScope { level: 'year' | 'block' | 'module' | 'subject' | 'topic'; id: number; label: string }
function backupScopeQuery(scope?: BackupScope | null): string {
  if (!scope) return '';
  return `scopeLevel=${encodeURIComponent(scope.level)}&scopeId=${scope.id}&scopeLabel=${encodeURIComponent(scope.label)}`;
}

// Whole-bank backup/restore — separate from mcqImportApi's file parser
// above. Export downloads every MCQ (every field, across the main tree,
// past papers, and exams) as one JSON file, or (given a scope) just the
// questions under one Year/Block/Module/Subject/Topic branch; import
// restores a file like it, either alongside the existing bank or replacing
// it (a scoped backup's "replace" only wipes that same branch first).
export const mcqBackupApi = {
  exportUrl: () => `${API_BASE}/admin/mcq-backup/export`,
  // Not a plain <a href> download because it needs the admin's session
  // cookie (credentials: 'include') and a nicer error than a bare failed
  // navigation if the export fails — fetch it as a blob and trigger the
  // save ourselves.
  downloadBackup: async (scope?: BackupScope | null): Promise<void> => {
    const res = await fetch(`${API_BASE}/admin/mcq-backup/export?${backupScopeQuery(scope)}`, { credentials: 'include' });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new ApiRequestError(res.status, (data && data.error) || 'Could not download the backup', data);
    }
    const disposition = res.headers.get('content-disposition') || '';
    const filenameMatch = disposition.match(/filename="([^"]+)"/);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filenameMatch?.[1] || 'mcq-bank-backup.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
  importBackup: async (file: File, mode: 'append' | 'replace'): Promise<{ restored: number; mode: 'append' | 'replace'; deletedFirst: number; scope: BackupScope | null }> => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${API_BASE}/admin/mcq-backup/import?mode=${mode}`, { method: 'POST', credentials: 'include', body: form });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new ApiRequestError(res.status, (data && data.error) || 'Could not restore this backup', data);
    return data;
  },
};

export interface PastPaper { id: number; title: string; examBoard: string; year: string; level: string; active: boolean; archived?: boolean; displayOrder: number; mcqCount: number; programId: number | null; academicYearId: number | null; programTargetKind: string | null; yearTargetNumber: number | null }
export interface NotebookEntry { id: number; userId: number; mcqId: number | null; title: string; content: string; createdAt: string; updatedAt: string }
export interface SavedSession { id: number; userId: number; name: string; config: Record<string, unknown>; createdAt: string }
export interface FlaggedMcq { id: number; userId: number; mcqId: number; reason: string; status: 'open' | 'resolved'; createdAt: string; question: string | null; path: string | null; mcqDeleted: boolean }
export interface FeedbackEntry { id: number; userId: number | null; category: string; message: string; status: 'open' | 'replied' | 'reviewed'; rating: number | null; featured: boolean; createdAt: string; user: { name: string; email: string } | null }
export interface FeedbackReply { id: number; feedbackId: number; authorId: number; authorRole: 'admin' | 'student'; message: string; createdAt: string }
export interface Analytics { range: string; totalSessions: number; averageScore: number; questionsAnswered: number; timeSpentMinutes: number; currentStreak: number; longestStreak: number }
export interface LeaderboardRow { rank: number; userId: number; name: string; sessions: number; questionsAnswered: number; correct: number; accuracy: number; isYou: boolean }
export interface PaymentDetails { PAYMENT_INSTRUCTIONS: string; PAYMENT_ACCOUNT_HOLDER: string; PAYMENT_ACCOUNT_NUMBER: string; PAYMENT_BANK_NAME: string; PAYMENT_IFSC_OR_ROUTING: string; PAYMENT_UPI_ID: string; PAYMENT_QR_CODE_PATH: string; PAYMENT_QR_CODE_URL?: string; PAYMENT_RAAST_ID: string; PAYMENT_WALLET_PROVIDER: string; PAYMENT_WALLET_NUMBER: string; PAYMENT_WALLET_ACCOUNT_NAME: string; PAYMENT_BANK_ACCOUNTS: string; PAYMENT_METHODS_CONFIG: string; PAYMENT_LATE_FEE_NOTE: string; PAYMENT_REFUND_POLICY: string; DEFAULT_CURRENCY: string; bankAccounts: BankAccount[]; methods: PaymentMethodConfig[] }

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const authApi = {
  register: (body: { name: string; email: string; password: string; phone: string; rollNumber?: string; institutionId: number; programKind: 'MBBS' | 'BDS'; yearNumber: number; planId: number; method?: string; reference?: string; paymentDate?: string; proofPath?: string }) =>
    request<{ user: AuthUser; message: string }>('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  adminRegister: (body: { name: string; email: string; password: string; inviteCode: string }) =>
    request<{ token: string; user: AuthUser }>('/auth/admin/register', { method: 'POST', body: JSON.stringify(body) }),
  login: (body: { email: string; password: string }) =>
    request<{ token: string; user: AuthUser }>('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
  me: () => request<AuthUser>('/auth/me'),
  verifyEmail: (token: string) => request<{ message: string }>('/auth/verify-email', { method: 'POST', body: JSON.stringify({ token }) }),
  resendVerification: (email: string) => request<{ message: string }>('/auth/resend-verification', { method: 'POST', body: JSON.stringify({ email }) }),
  forgotPassword: (email: string) => request<{ message: string }>('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (token: string, password: string) => request<{ message: string }>('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) }),
  changePassword: (currentPassword: string, newPassword: string) => request<{ message: string }>('/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }),
  updateMe: (body: { name?: string; phone?: string; email?: string; currentPassword?: string }) => request<AuthUser>('/auth/me', { method: 'PATCH', body: JSON.stringify(body) }),
};

export interface BroadcastNotificationBody {
  title: string;
  body: string;
  type?: 'info' | 'success' | 'warning';
  programTargetKind?: string | null;
  yearTargetNumber?: number | null;
}
export interface BroadcastNotificationResponse { ok: true; targetedUsers: number | null }

export const notificationsApi = {
  markRead: (id: number) => request<{ ok: true }>(`/notifications/${id}/read`, { method: 'POST' }),
  // targetedUsers is null when sent to everyone (no program/year filter),
  // otherwise the count of students who matched the filter and got a row.
  broadcast: (body: BroadcastNotificationBody) => request<BroadcastNotificationResponse>('/admin/notifications/broadcast', { method: 'POST', body: JSON.stringify(body) }),
  // Clears just the signed-in admin's own notification list (their personal
  // rows deleted, any broadcasts hidden for them only) — same effect as a
  // student's "Clear all".
  clearMine: () => request<{ ok: true }>('/notifications/clear', { method: 'POST' }),
  // Admin-only: wipes every notification for every student and admin. This
  // is what makes "Clear all" on the admin page remove notifications from
  // students too, unlike clearMine above.
  clearAll: () => request<{ ok: true; deleted: number }>('/admin/notifications/clear-all', { method: 'DELETE' }),
};

// ---------------------------------------------------------------------------
// Academic structure
// ---------------------------------------------------------------------------

export const academicApi = {
  institutions: (active?: boolean, kind?: string) => request<Institution[]>(`/institutions${qs({ active, kind })}`),
  createInstitution: (body: Partial<Institution>) => request<Institution>('/institutions', { method: 'POST', body: JSON.stringify(body) }),
  updateInstitution: (id: number, body: Partial<Institution>) => request<Institution>(`/institutions/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  archiveInstitution: (id: number) => request<Institution>(`/institutions/${id}`, { method: 'DELETE' }),
  removeInstitutionPermanent: (id: number) => request<{ ok: true }>(`/institutions/${id}/permanent`, { method: 'DELETE' }),

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
// Subjects & topics (nested under a module — created inline from the
// Academic content screen so admins don't need to leave the module list to
// build out its curriculum)
// ---------------------------------------------------------------------------

export interface AdminSubject { id: number; moduleId: number; name: string; active?: boolean; topicCount: number; iconUrl?: string | null; displayOrder?: number }
export interface AdminTopic { id: number; subjectId: number; name: string; active?: boolean; questionCount: number; completed?: boolean; displayOrder?: number }

export const subjectAdminApi = {
  list: (moduleId?: number) => request<AdminSubject[]>(`/subjects${moduleId ? `?moduleId=${moduleId}` : ''}`),
  create: (body: { moduleId: number; name: string; active?: boolean; iconPath?: string | null; displayOrder?: number }) => request<AdminSubject>('/subjects', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: number, body: Partial<{ name: string; active: boolean; iconPath: string | null; displayOrder: number }>) => request<AdminSubject>(`/subjects/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  remove: (id: number) => request<{ ok: true }>(`/subjects/${id}`, { method: 'DELETE' }),
};

export const topicAdminApi = {
  list: (subjectId?: number) => request<AdminTopic[]>(`/topics${subjectId ? `?subjectId=${subjectId}` : ''}`),
  create: (body: { subjectId: number; name: string; active?: boolean; displayOrder?: number }) => request<AdminTopic>('/topics', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: number, body: Partial<{ name: string; active: boolean; displayOrder: number }>) => request<AdminTopic>(`/topics/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  remove: (id: number) => request<{ ok: true }>(`/topics/${id}`, { method: 'DELETE' }),
};

// ---------------------------------------------------------------------------
// Flashcards (admin CRUD — students get them read-only via the generated
// useListFlashcards hook)
// ---------------------------------------------------------------------------

export interface AdminFlashcard { id: number; front: string; back: string; module: string; topic: string; moduleId?: number | null; subjectId?: number | null; topicId?: number | null; active: boolean }

export const flashcardsAdminApi = {
  create: (body: { front: string; back: string; module: string; topic: string; moduleId?: number; subjectId?: number; topicId?: number }) =>
    request<AdminFlashcard>('/flashcards', { method: 'POST', body: JSON.stringify(body) }),
  // Admin-only listing that keeps moduleId/subjectId/topicId on the wire (see
  // GET /admin/flashcards) — used for the Module > Subject > Topic bank tree,
  // same pattern as mcqAdminApi.list().
  list: (filters?: { moduleId?: number; subjectId?: number; topicId?: number; search?: string }) => {
    const q = new URLSearchParams();
    if (filters?.moduleId) q.set('moduleId', String(filters.moduleId));
    if (filters?.subjectId) q.set('subjectId', String(filters.subjectId));
    if (filters?.topicId) q.set('topicId', String(filters.topicId));
    if (filters?.search) q.set('search', filters.search);
    const qs = q.toString();
    return request<AdminFlashcard[]>(`/admin/flashcards${qs ? `?${qs}` : ''}`);
  },
  update: (id: number, body: Partial<{ front: string; back: string; module: string; topic: string; moduleId: number | null; subjectId: number | null; topicId: number | null }>) =>
    request<AdminFlashcard>(`/flashcards/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  remove: (id: number) => request<{ ok: true }>(`/flashcards/${id}`, { method: 'DELETE' }),
  bulkRemove: (body: { ids: number[] } | { all: true; filters?: { moduleId?: number; subjectId?: number; topicId?: number } }) =>
    request<{ ok: true; deleted: number }>('/admin/flashcards/bulk', { method: 'DELETE', body: JSON.stringify(body) }),
};

// ---------------------------------------------------------------------------
// Admin settings / audit logs / uploads
// ---------------------------------------------------------------------------

export const settingsApi = {
  get: () => request<PlatformSettings>('/admin/settings'),
  update: (body: Partial<PlatformSettings>) => request<PlatformSettings>('/admin/settings', { method: 'PATCH', body: JSON.stringify(body) }),
  rotateAdminCode: () => request<{ ADMIN_SIGNUP_CODE: string }>('/admin/settings/rotate-admin-code', { method: 'POST' }),
  testStorage: () => request<{ cloudinary: { ok: boolean; error?: string }; cloudinaryBackup: { ok: boolean; error?: string } }>('/admin/settings/test-storage', { method: 'POST' }),
  // `slot` (Brevo only) tests one account on its own with no failover.
  testEmail: (to: string, slot?: number) => request<{ ok: boolean; error?: string }>('/admin/settings/test-email', { method: 'POST', body: JSON.stringify(slot ? { to, slot } : { to }) }),
};

export const auditApi = {
  list: (limit = 100) => request<AuditLogEntry[]>(`/admin/audit-logs?limit=${limit}`),
};

export interface AdminBook { id: number; title: string; author: string | null; moduleId: number | null; subjectId: number | null; topicId: number | null; programTargetKind: string | null; yearTargetNumber: number | null; storagePath: string | null; coverImagePath: string | null; active: boolean; isFree: boolean; price: number | null; currency: string | null }
export interface AdminCoupon { id: number; code: string; discountType: 'percent' | 'fixed'; discountValue: number; active: boolean; maxUses: number | null; usedCount: number; expiresAt: string | null; createdAt: string }
export const couponsAdminApi = {
  list: () => request<AdminCoupon[]>('/coupons'),
  create: (body: { code: string; discountType: 'percent' | 'fixed'; discountValue: number; maxUses?: number | null; expiresAt?: string | null }) => request<AdminCoupon>('/coupons', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: number, body: { active?: boolean; discountValue?: number; maxUses?: number | null; expiresAt?: string | null }) => request<AdminCoupon>(`/coupons/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  remove: (id: number) => request<{ ok: true }>(`/coupons/${id}`, { method: 'DELETE' }),
};

export interface AdminBookPurchase { id: number; bookId: number; bookTitle: string; amount: number; currency: string; method: string; reference: string; paymentDate: string; proofPath: string | null; status: 'PAYMENT_PENDING_REVIEW' | 'approved' | 'rejected' | 'suspended'; rejectionReason: string | null; submittedAt: string; reviewedAt: string | null; user?: { name: string; email: string } }
export const bookPurchasesAdminApi = {
  list: () => request<AdminBookPurchase[]>('/admin/book-purchases'),
  approve: (id: number) => request<AdminBookPurchase>(`/admin/book-purchases/${id}/approve`, { method: 'POST' }),
  reject: (id: number, reason?: string) => request<AdminBookPurchase>(`/admin/book-purchases/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),
  suspend: (id: number, reason?: string) => request<AdminBookPurchase>(`/admin/book-purchases/${id}/suspend`, { method: 'POST', body: JSON.stringify({ reason }) }),
  reactivate: (id: number) => request<AdminBookPurchase>(`/admin/book-purchases/${id}/reactivate`, { method: 'POST' }),
  remove: (id: number) => request<{ ok: true }>(`/admin/book-purchases/${id}`, { method: 'DELETE' }),
};

export const booksAdminApi = {
  list: () => request<AdminBook[]>('/admin/books'),
  create: (body: { title: string; author?: string; programTargetKind?: string | null; yearTargetNumber?: number | null; storagePath: string; coverImagePath?: string; isFree?: boolean; price?: number | null; currency?: string | null }) => request<AdminBook>('/books', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: number, body: { title?: string; author?: string | null; programTargetKind?: string | null; yearTargetNumber?: number | null; isFree?: boolean; price?: number | null; currency?: string | null }) => request<AdminBook>(`/books/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  remove: (id: number) => request<{ ok: true }>(`/books/${id}`, { method: 'DELETE' }),
  removePermanent: (id: number) => request<{ ok: true; warning?: string }>(`/admin/books/${id}/permanent`, { method: 'DELETE' }),
  backfillLinks: () => request<{ fixed: number; skipped: number; failed: number }>('/admin/books/backfill-links', { method: 'POST' }),
};

export async function uploadFile(file: File, kind: 'payment-proof' | 'profile-picture' | 'resource' | 'favicon' | 'book'): Promise<{ storagePath: string; url: string | null }> {
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
  removePermanent: (id: number) => request<{ ok: true }>(`/past-papers/${id}/permanent`, { method: 'DELETE' }),
  attachMcqs: (id: number, mcqIds: number[]) => request<{ ok: true }>(`/past-papers/${id}/mcqs`, { method: 'POST', body: JSON.stringify({ mcqIds }) }),
  backfillYearTargeting: () => request<{ fixed: number; skipped: number }>('/past-papers/backfill-year-targeting', { method: 'POST' }),
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
  // One-click "resolve everything reported" for the Content Quality
  // Center's "AI Fix All" action — a single bulk update server-side.
  resolveAll: () => request<{ ok: true; resolved: number }>('/admin/flagged-mcqs/resolve-all', { method: 'POST' }),
};

export const feedbackApi = {
  listAll: () => request<FeedbackEntry[]>('/feedback'),
  create: (body: { category?: string; message: string }) => request<FeedbackEntry>('/feedback', { method: 'POST', body: JSON.stringify(body) }),
  updateStatus: (id: number, status: 'open' | 'replied' | 'reviewed') => request<FeedbackEntry>(`/feedback/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  setFeatured: (id: number, featured: boolean) => request<FeedbackEntry>(`/feedback/${id}`, { method: 'PATCH', body: JSON.stringify({ featured }) }),
  remove: (id: number) => request<{ ok: true }>(`/feedback/${id}`, { method: 'DELETE' }),
  listReplies: (id: number) => request<FeedbackReply[]>(`/feedback/${id}/replies`),
  reply: (id: number, message: string) => request<FeedbackReply>(`/feedback/${id}/replies`, { method: 'POST', body: JSON.stringify({ message }) }),
};

export const analyticsApi = {
  get: (range: string) => request<Analytics>(`/student/analytics?range=${range}`),
  leaderboard: (range = '30d') => request<LeaderboardRow[]>(`/leaderboard?range=${range}`),
  submitSession: (body: { moduleId?: number; subjectId?: number; topicId?: number; mode?: 'timed' | 'untimed'; answers: { mcqId: number; selectedAnswer: string | null }[] }) =>
    request<{ id: number; scorePercent: number; correctCount: number; totalQuestions: number }>('/practice-sessions', { method: 'POST', body: JSON.stringify(body) }),
};

// ---------------------------------------------------------------------------
// AI Visualizer activity log (admin, read-only) — students generate
// visualizations from frontend-student; this app only ever lists what they
// generated for moderation/visibility purposes.
// ---------------------------------------------------------------------------

export interface AiVisualizerLogEntry {
  id: number;
  prompt: string;
  status: 'success' | 'error';
  visualizationType: string | null;
  errorMessage: string | null;
  rawResponse: string | null;
  createdAt: string;
  student: { name: string; email: string };
}
export const aiVisualizerAdminApi = {
  list: (limit = 100) => request<AiVisualizerLogEntry[]>(`/admin/ai-visualizer-logs?limit=${limit}`),
};
