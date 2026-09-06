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
    throw new ApiRequestError(res.status, (data && (data.error || data.message)) || `Request failed (${res.status})`, data);
  }
  return data as T;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Institution { id: number; name: string; city: string; active: boolean; displayOrder: number }
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
export interface PaymentMethodConfig { key: string; label: string; type: 'bank' | 'wallet' | 'card' | 'cash'; enabled: boolean; instructions: string }

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

export interface TeamMember { id: number; name: string; role: string; bio: string; achievementBadge: string; photoPath: string | null; linkedinUrl: string; instagramUrl: string; email: string; active: boolean; displayOrder: number }
export interface SiteContent {
  PLATFORM_NAME: string; PLATFORM_TAGLINE: string; PLATFORM_DESCRIPTION: string;
  SOCIAL_FACEBOOK: string; SOCIAL_YOUTUBE: string; SOCIAL_LINKEDIN: string; SOCIAL_INSTAGRAM: string;
  CONTACT_EMAIL: string; CONTACT_LOCATION: string; SUPPORT_HOURS: string; COPYRIGHT_NOTICE: string; SUPPORT_WHATSAPP: string;
  features: string[]; quickLinks: Array<{ label: string; url: string }>; team: TeamMember[];
  faviconUrl: string | null;
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

export interface AdminBookStudent { id: number; title: string; author: string | null; moduleId: number | null; subjectId: number | null; topicId: number | null; storagePath: string; coverImagePath: string | null }
export const booksApi = {
  list: () => request<AdminBookStudent[]>('/books'),
};

export interface AdminModule { id: number; name: string; subtitle: string; subjectCount: number; topicCount: number; progress: number; active: boolean; programTargetKind?: string | null; yearTargetNumber?: number | null; targetingLabel?: string }

export const moduleAdminApi = {
  listAll: () => request<AdminModule[]>('/modules'),
  create: (body: { name: string; subtitle: string; active?: boolean; programTargetKind?: string | null; yearTargetNumber?: number | null }) =>
    request<AdminModule>('/modules', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: number, body: Partial<{ name: string; subtitle: string; active: boolean; programTargetKind: string | null; yearTargetNumber: number | null }>) =>
    request<AdminModule>(`/modules/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  remove: (id: number) => request<{ ok: true }>(`/modules/${id}`, { method: 'DELETE' }),
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
export interface FlaggedMcq { id: number; userId: number; mcqId: number; reason: string; status: 'open' | 'resolved'; createdAt: string }
export interface FeedbackEntry { id: number; userId: number | null; category: string; message: string; status: 'open' | 'replied' | 'reviewed'; createdAt: string; user: { name: string; email: string } | null }
export interface FeedbackReply { id: number; feedbackId: number; authorId: number; authorRole: 'admin' | 'student'; message: string; createdAt: string }
export interface MyFeedbackEntry extends FeedbackEntry { replies: FeedbackReply[] }
export interface Analytics { range: string; totalSessions: number; averageScore: number; questionsAnswered: number; timeSpentMinutes: number; currentStreak: number; longestStreak: number }
export interface LeaderboardRow { rank: number; userId: number; name: string; sessions: number; questionsAnswered: number; correct: number; points: number; accuracy: number; isYou: boolean }
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

export const notificationsApi = {
  markRead: (id: number) => request<{ ok: true }>(`/notifications/${id}/read`, { method: 'POST' }),
};

// ---------------------------------------------------------------------------
// Academic structure
// ---------------------------------------------------------------------------

export const academicApi = {
  institutions: (active?: boolean) => request<Institution[]>(`/institutions${active === undefined ? '' : `?active=${active}`}`),
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
  create: (body: { category?: string; message: string }) => request<FeedbackEntry>('/feedback', { method: 'POST', body: JSON.stringify(body) }),
  updateStatus: (id: number, status: 'open' | 'replied' | 'reviewed') => request<FeedbackEntry>(`/feedback/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  reply: (id: number, message: string) => request<FeedbackReply>(`/feedback/${id}/replies`, { method: 'POST', body: JSON.stringify({ message }) }),
};

export interface ProgressTrend { recentAverage: number | null; priorAverage: number | null; trend: 'up' | 'down' | 'flat' | 'new'; trendDelta: number; recentSessions: number; history: Array<{ date: string; scorePercent: number }>; currentStreak: number; longestStreak: number }
export const analyticsApi = {
  get: (range: string) => request<Analytics>(`/student/analytics?range=${range}`),
  progress: () => request<ProgressTrend>('/student/progress'),
  leaderboard: (range = '30d') => request<LeaderboardRow[]>(`/leaderboard?range=${range}`),
  submitSession: (body: { moduleId?: number; subjectId?: number; topicId?: number; mode?: 'timed' | 'untimed'; durationSeconds?: number; answers: { mcqId: number; selectedAnswer: string | null }[] }) =>
    request<{ id: number; scorePercent: number; correctCount: number; totalQuestions: number }>('/practice-sessions', { method: 'POST', body: JSON.stringify(body) }),
  practiceOverview: () => request<{ totalTopics: number; totalQuestions: number; avgQuestions: number; avgDurationMinutes: number; moduleCount: number }>('/student/practice-overview'),
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

export const aiVisualizerApi = {
  generate: (prompt: string) => request<{ visualization: VisualizationSpec }>('/ai/visualizer', { method: 'POST', body: JSON.stringify({ prompt }) }),
  explainStep: (overallTitle: string, stepTitle: string, stepDescription: string) =>
    request<{ explanation: string }>('/ai/visualizer/explain-step', { method: 'POST', body: JSON.stringify({ overallTitle, stepTitle, stepDescription }) }),
};
