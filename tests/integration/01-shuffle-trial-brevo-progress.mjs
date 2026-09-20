import { execSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire('/home/claude/proj/artifacts/api-server/package.json');
const bcrypt = require('bcryptjs');
const BASE = 'http://localhost:3001/api';
const sql = (q) => execSync('PGPASSWORD=app psql -h localhost -U app msp -At -c ' + JSON.stringify(q).replace(/\$/g, '\\$')).toString().trim();
function client() {
  let cookie = '';
  return {
    async req(method, path, body) {
      const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined });
      const sc = r.headers.getSetCookie?.() ?? [];
      if (sc.length) cookie = sc.map((c) => c.split(';')[0]).join('; ');
      let json = null; try { json = await r.json(); } catch {}
      return { status: r.status, json };
    },
  };
}
const ok = (name) => console.log('  ✓', name);

const admin = client();
let r = await admin.req('POST', '/auth/login', { email: 'admin@test.com', password: 'Admin12345!' });
assert.equal(r.status, 200, JSON.stringify(r.json)); ok('admin login');

// ---- content
const mod = (await admin.req('POST', '/modules', { name: 'Cardio', subtitle: 's' })).json;
const subj = (await admin.req('POST', '/subjects', { moduleId: mod.id, name: 'Physiology', description: '' })).json;
const topic = (await admin.req('POST', '/topics', { subjectId: subj.id, name: 'Cardiac output' })).json;
assert.ok(mod?.id && subj?.id && topic?.id, JSON.stringify({ mod, subj, topic })); ok('module/subject/topic');
const mk = async (q, opts, ans, ex) => (await admin.req('POST', '/mcqs', { question: q, options: opts, correctAnswer: ans, explanation: 'why', optionExplanations: ex, difficulty: 'moderate', moduleId: mod.id, subjectId: subj.id, topicId: topic.id })).json;
const m1 = await mk('Q1', ['Alpha', 'Beta', 'Gamma', 'Delta'], 'Gamma', ['ex-Alpha', 'ex-Beta', 'ex-Gamma', 'ex-Delta']);
const m2 = await mk('Q2', ['One', 'Two', 'Three', 'Four'], 'One', ['ex-One', null, 'ex-Three', 'ex-Four']);
assert.ok(m1?.id && m2?.id, JSON.stringify(m1));
sql(`update med_mcqs set status='published'`);

// ---- SHUFFLE BUG
let reordered = 0;
for (let i = 0; i < 6; i++) {
  r = await admin.req('POST', '/admin/mcqs/shuffle-options', { ids: [m1.id, m2.id] });
  assert.equal(r.json.shuffled, 2);
  const list = (await admin.req('GET', '/admin/mcqs')).json;
  for (const q of list) {
    assert.ok(q.optionExplanations, `optionExplanations wiped on ${q.question} after shuffle #${i + 1}`);
    q.options.forEach((opt, idx) => {
      const expected = q.question === 'Q2' && opt === 'Two' ? null : `ex-${opt}`;
      assert.equal(q.optionExplanations[idx], expected, `${q.question}: explanation for "${opt}" mispaired`);
    });
    if (q.question === 'Q1' && q.options[0] !== 'Alpha') reordered++;
    assert.equal(q.correctAnswer, q.question === 'Q1' ? 'Gamma' : 'One');
  }
}
assert.ok(reordered > 0); ok('shuffle keeps per-option explanations paired (6 rounds, both questions)');
r = await admin.req('POST', '/admin/mcqs/shuffle-options', { all: true });
assert.equal(r.status, 200);
assert.ok((await admin.req('GET', '/admin/mcqs')).json.every((q) => q.optionExplanations?.length === 4)); ok('shuffle "all" mode also keeps them');

// ---- students
const hash = await bcrypt.hash('Student123!', 4);
sql(`insert into med_institutions(name) values ('Inst') on conflict do nothing`);
const inst = sql(`select id from med_institutions limit 1`);
sql(`insert into med_programs(institution_id,name,kind) values (${inst},'MBBS','MBBS')`);
const prog = sql(`select id from med_programs where kind='MBBS' limit 1`);
for (const y of [1, 2, 4]) sql(`insert into med_academic_years(program_id,label,year_number) values (${prog},'Y${y}',${y})`);
const yr = (n) => sql(`select id from med_academic_years where year_number=${n}`);
for (const [email, y] of [['s2@t.com', 2], ['s4@t.com', 4]]) sql(`insert into med_users(name,email,password_hash,role,status,email_verified,institution_id,program_id,academic_year_id) values ('Stu ${y}','${email}','${hash}','student','VERIFIED',true,${inst},${prog},${yr(y)})`);
const s2 = client(), s4 = client();
assert.equal((await s2.req('POST', '/auth/login', { email: 's2@t.com', password: 'Student123!' })).status, 200);
assert.equal((await s4.req('POST', '/auth/login', { email: 's4@t.com', password: 'Student123!' })).status, 200); ok('student logins');

// ---- TRIAL gating
const status = async (c, p) => (await c.req('GET', p)).status;
assert.equal(await status(s2, '/mcqs'), 403); ok('no trial → 403');
const set = (o) => admin.req('PATCH', '/admin/settings', o);
r = await set({ GLOBAL_TRIAL_MODE: 'true', GLOBAL_TRIAL_PROGRAM: 'MBBS', GLOBAL_TRIAL_YEARS: '1,2,3', GLOBAL_TRIAL_FEATURES: JSON.stringify(['mcqs']) });
assert.equal(r.status, 200);
assert.ok(JSON.parse(r.json.TRIAL_FEATURE_OPTIONS).length >= 9); ok('admin settings PATCH ok + TRIAL_FEATURE_OPTIONS returned');
assert.equal(await status(s2, '/mcqs'), 200); ok('year 2 in trial: MCQs open');
assert.equal(await status(s2, '/flashcards'), 403); ok('flashcards off in trial → 403');
assert.equal(await status(s2, '/exams'), 403); ok('exams off → 403');
assert.equal(await status(s2, '/mcqs?pastPaperId=1'), 403); ok('past-paper practice follows past_papers toggle');
assert.equal(await status(s4, '/mcqs'), 403); ok('year 4 outside years 1-3 → 403');
let sc = (await s2.req('GET', '/site-content')).json.trial;
assert.deepEqual(sc, { active: true, program: 'MBBS', years: [1, 2, 3], features: ['mcqs'], endsAt: null }); ok('/site-content trial view');
await set({ GLOBAL_TRIAL_FEATURES: JSON.stringify(['mcqs', 'past_papers', 'exams']), GLOBAL_TRIAL_YEARS: '1,2,3,4' });
assert.equal(await status(s4, '/exams'), 200); assert.equal(await status(s2, '/mcqs?pastPaperId=1'), 200); ok('multi-year + feature list updated live');
await set({ GLOBAL_TRIAL_ENDS_AT: '2000-01-01' });
assert.equal(await status(s2, '/mcqs'), 403); assert.equal((await s2.req('GET', '/site-content')).json.trial.active, false); ok('expired end date turns trial off');
await set({ GLOBAL_TRIAL_ENDS_AT: '', GLOBAL_TRIAL_FEATURES: JSON.stringify(['mcqs', 'books']), GLOBAL_TRIAL_YEARS: '' });
// books
sql(`insert into med_books(title,author,storage_path,is_free,price,currency,active) values ('Paid book','A','cloudinary:x.pdf',false,100,'PKR',true)`);
let books = (await s2.req('GET', '/books')).json;
assert.equal(books[0].locked, false); ok('books trial on → paid book unlocked');
await set({ GLOBAL_TRIAL_FEATURES: JSON.stringify(['mcqs']) });
await new Promise((r) => setTimeout(r, 100));
books = (await s2.req('GET', '/books')).json; assert.equal(books[0].locked, true); ok('books trial off → locked');

// ---- BREVO slots settings
r = await set({ EMAIL_PROVIDER: 'brevo', BREVO_API_KEY: 'k1abcd', BREVO_API_KEY_2: 'k2wxyz', BREVO_SENDER_EMAIL_2: 'b@x.com', BREVO_SLOT_STRATEGY: 'round_robin' });
assert.equal(r.json.BREVO_API_KEY_2_SET, 'true'); assert.equal(r.json.BREVO_API_KEY_2_MASKED.slice(-4), 'wxyz'); assert.equal(r.json.BREVO_API_KEY_2, undefined); ok('slot 2 saved, masked, secret not echoed');
r = await set({ BREVO_API_KEY_2: '__CLEAR__' }); assert.equal(r.json.BREVO_API_KEY_2_SET, 'false'); ok('slot 2 cleared via __CLEAR__');
r = await set({ BREVO_API_KEY: '' }); assert.equal(r.json.BREVO_API_KEY_SET, 'true'); ok('blank secret leaves saved key alone');
r = await admin.req('POST', '/admin/settings/test-email', { to: 'x@y.com', slot: 4 }); assert.equal(r.json.ok, false); assert.match(r.json.error, /slot 4/); ok('per-slot test on empty slot → clear error');

// ---- PROGRESS
await set({ GLOBAL_TRIAL_MODE: 'true', GLOBAL_TRIAL_PROGRAM: '', GLOBAL_TRIAL_YEARS: '', GLOBAL_TRIAL_FEATURES: JSON.stringify(['mcqs', 'past_papers', 'exams']) });
const ids = (await admin.req('GET', '/admin/mcqs')).json.map((q) => [q.id, q.correctAnswer]);
const sub = (n, right) => s2.req('POST', '/practice-sessions', { topicId: topic.id, subjectId: subj.id, moduleId: mod.id, durationSeconds: 120, answers: ids.map(([id, ans], i) => ({ mcqId: id, selectedAnswer: i < right ? ans : 'wrong' })) });
assert.equal((await sub(1, 1)).status, 201); assert.equal((await sub(2, 2)).status, 201);
r = await s2.req('GET', '/student/progress-overview'); assert.equal(r.status, 200, JSON.stringify(r.json));
const p = r.json;
assert.equal(p.summary.sessions, 2); assert.equal(p.summary.questionsAnswered, 4); assert.equal(p.summary.uniqueMcqsAttempted, 2); assert.equal(p.summary.accuracy, 75);
assert.equal(p.recentSessions[0].scope, 'Cardiac output'); assert.equal(p.bySubject[0].name, 'Physiology'); assert.equal(p.improvement.weekly.length, 8);
assert.equal(p.improvement.weekly[7].sessions, 2); ok('progress-overview: summary/scope/subject/weekly correct');
// past paper + exam data
sql(`insert into med_past_papers(title,exam_board,year,level) values ('KMU 2024','KMU','2024','3rd')`);
const pp = sql(`select id from med_past_papers limit 1`);
sql(`update med_mcqs set past_paper_id=${pp}`);
await s2.req('POST', '/practice-sessions', { answers: ids.map(([id, ans]) => ({ mcqId: id, selectedAnswer: ans })) });
sql(`insert into med_exams(title,start_at,end_at,status,result_release_mode) values ('Pre-Proff 1', now()-interval '2 day', now()-interval '1 day','published','manual')`);
const ex = sql(`select id from med_exams limit 1`); const uid = sql(`select id from med_users where email='s2@t.com'`);
sql(`insert into med_exam_attempts(exam_id,user_id,total_questions,correct_count,percentage,score,status,submitted_at) values (${ex},${uid},10,8,80,8,'submitted',now())`);
let q = (await s2.req('GET', '/student/progress-overview')).json;
assert.equal(q.pastPapers.length, 1); assert.equal(q.pastPapers[0].attemptedQuestions, 2); assert.equal(q.pastPapers[0].coveragePercent, 100);
assert.equal(q.exams.length, 1); assert.equal(q.exams[0].released, false); assert.equal(q.exams[0].percentage, null); ok('unreleased Pre-Proff score is hidden');
sql(`update med_exam_attempts set results_released_at=now()`);
q = (await s2.req('GET', '/student/progress-overview')).json; assert.equal(q.exams[0].percentage, 80); assert.equal(q.exams[0].released, true); ok('released Pre-Proff score shown');
assert.equal((await s4.req('GET', '/student/progress-overview')).json.summary.sessions, 0); ok("other student's data isolated");
assert.equal((await client().req('GET', '/student/progress-overview')).status, 401); ok('signed-out → 401');
console.log('ALL INTEGRATION TESTS PASSED');
