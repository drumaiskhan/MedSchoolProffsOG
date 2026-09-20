import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const BASE = 'http://localhost:3001/api';
const sql = (q) => execSync('PGPASSWORD=app psql -h localhost -U app msp -At -c ' + JSON.stringify(q).replace(/\$/g, '\\$')).toString().trim();
function client() { let cookie = ''; return { async req(method, path, body, raw) {
  const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined });
  const sc = r.headers.getSetCookie?.() ?? []; if (sc.length) cookie = sc.map((c) => c.split(';')[0]).join('; ');
  if (raw) return { status: r.status, headers: r.headers, buf: Buffer.from(await r.arrayBuffer()) };
  let json = null, text = ''; try { text = await r.text(); json = JSON.parse(text); } catch {} return { status: r.status, json, text, headers: r.headers }; } }; }
const ok = (n) => console.log('  ✓', n);
const admin = client(), s2 = client(), s4 = client();
await admin.req('POST', '/auth/login', { email: 'admin@test.com', password: 'Admin12345!' });
await s2.req('POST', '/auth/login', { email: 's2@t.com', password: 'Student123!' });
await s4.req('POST', '/auth/login', { email: 's4@t.com', password: 'Student123!' });
sql(`delete from med_books where title like 'SR-%'`);
sql(`insert into med_books(title,author,storage_path,is_free,price,currency,active) values ('SR-Paid','A','http://localhost:8099/test.pdf',false,100,'PKR',true),('SR-Free','A','http://localhost:8099/test.pdf',true,null,null,true),('SR-NotPdf','A','http://localhost:8099/notpdf.pdf',false,100,'PKR',true)`);
const bid = (t) => Number(sql(`select id from med_books where title='${t}'`));
const paid = bid('SR-Paid'), free = bid('SR-Free'), notpdf = bid('SR-NotPdf');
const uid = (e) => sql(`select id from med_users where email='${e}'`);
await admin.req('PATCH', '/admin/settings', { GLOBAL_TRIAL_MODE: 'false' });

// locked
let list = (await s2.req('GET', '/books')).json; let b = list.find((x) => x.id === paid);
assert.equal(b.locked, true); assert.equal(b.storagePath, null); assert.equal(b.secureReader, false);
assert.equal((await s2.req('GET', `/books/${paid}/reader`)).status, 403);
assert.equal((await s2.req('GET', `/books/${paid}/pages/1/image`, null, true)).status, 403);
assert.equal((await s2.req('GET', `/books/${paid}/pages/1/words`)).status, 403); ok('locked paid book: no URL, reader/image/words all 403');

// purchase approved
sql(`insert into med_book_purchases(user_id,book_id,book_title,amount,currency,method,reference,payment_date,status) values (${uid('s2@t.com')},${paid},'t',100,'PKR','x','r','2026-01-01','approved')`);
list = (await s2.req('GET', '/books')).json; b = list.find((x) => x.id === paid);
assert.equal(b.locked, false); assert.equal(b.storagePath, null, 'paid unlocked book must not expose a file URL'); assert.equal(b.secureReader, true);
assert.ok(!JSON.stringify(list).includes('test.pdf') || list.find((x) => x.id === free).storagePath, 'only the free book may carry the file link');
assert.ok(!JSON.stringify(list.find((x) => x.id === paid)).includes('8099')); ok('purchased paid book: secureReader=true, file URL never sent');
assert.match(list.find((x) => x.id === free).storagePath, /8099/); ok('free book keeps its direct link');

let r = await s2.req('GET', `/books/${paid}/reader`); assert.equal(r.status, 200, r.text);
assert.equal(r.json.pageCount, 3); assert.equal(r.json.pages.length, 3); assert.ok(r.json.pages[0].h > r.json.pages[0].w);
assert.ok(!r.text.includes('8099') && !r.text.includes('test.pdf')); assert.match(r.headers.get('cache-control'), /no-store/); ok('reader info: 3 pages, sizes, no file URL, no-store');

let img = await s2.req('GET', `/books/${paid}/pages/1/image?w=900`, null, true);
assert.equal(img.status, 200); assert.equal(img.headers.get('content-type'), 'image/jpeg'); assert.match(img.headers.get('cache-control'), /no-store/);
assert.equal(img.buf[0], 0xff); assert.equal(img.buf[1], 0xd8); assert.ok(img.buf.length > 5000); writeFileSync('/tmp/page1-s2.jpg', img.buf); ok(`page image is a JPEG (${img.buf.length} bytes)`);
// admin (other identity) gets a different (watermarked with their own id) image
const adm = await admin.req('GET', `/books/${paid}/pages/1/image?w=900`, null, true); assert.equal(adm.status, 200); assert.notDeepEqual(adm.buf, img.buf); writeFileSync('/tmp/page1-admin.jpg', adm.buf); ok('different reader → different watermarked pixels');
assert.equal((await s2.req('GET', `/books/${paid}/pages/9/image`, null, true)).status, 404); ok('out-of-range page → 404');

const w = (await s2.req('GET', `/books/${paid}/pages/1/words`)).json;
assert.ok(w.words.length > 100, `words: ${w.words.length}`); assert.ok(w.words.every((x) => x.length === 4 && x.every((n) => typeof n === 'number' && n >= 0 && n <= 1.01)));
assert.ok(!JSON.stringify(w).includes('sinoatrial')); ok(`word boxes: ${w.words.length} boxes, all numbers, no text leaked`);

// no access for s4
for (const p of [`/books/${paid}/reader`, `/books/${paid}/highlights`]) assert.equal((await s4.req('GET', p)).status, 403);
assert.equal((await s4.req('GET', `/books/${paid}/pages/1/image`, null, true)).status, 403); ok('student without purchase: 403 everywhere');
assert.equal((await client().req('GET', `/books/${paid}/reader`)).status, 401); ok('signed out → 401');

// highlights
r = await s2.req('POST', `/books/${paid}/highlights`, { kind: 'words', page: 1, startWord: 9, endWord: 3, color: 'green', note: 'remember' }); assert.equal(r.status, 201, r.text);
assert.equal(r.json.startWord, 3); assert.equal(r.json.endWord, 9); const hid = r.json.id;
r = await s2.req('POST', `/books/${paid}/highlights`, { kind: 'area', page: 2, rect: { x: 0.1, y: 0.2, w: 0.3, h: 0.1 } }); assert.equal(r.status, 201); assert.equal(r.json.color, 'yellow');
assert.equal((await s2.req('POST', `/books/${paid}/highlights`, { kind: 'area', page: 2, rect: { x: 2, y: 0, w: 1, h: 1 } })).status, 400);
assert.equal((await s2.req('GET', `/books/${paid}/highlights`)).json.length, 2);
r = await s2.req('PATCH', `/books/${paid}/highlights/${hid}`, { color: 'pink' }); assert.equal(r.json.color, 'pink'); ok('highlights: create (word range normalised, area), validate, list, recolour');
sql(`insert into med_book_purchases(user_id,book_id,book_title,amount,currency,method,reference,payment_date,status) values (${uid('s4@t.com')},${paid},'t',100,'PKR','x','r','2026-01-01','approved')`);
assert.equal((await s4.req('GET', `/books/${paid}/highlights`)).json.length, 0);
assert.equal((await s4.req('DELETE', `/books/${paid}/highlights/${hid}`)).status, 404); ok("another student can't see or delete my highlights");
assert.equal((await s2.req('DELETE', `/books/${paid}/highlights/${hid}`)).status, 200); assert.equal((await s2.req('GET', `/books/${paid}/highlights`)).json.length, 1); ok('delete own highlight');
sql(`update med_book_highlights set file_key='old'`); assert.equal((await s2.req('GET', `/books/${paid}/highlights`)).json.length, 0); ok('highlights hidden when the book file changed');

// progress
assert.equal((await s2.req('PUT', `/books/${paid}/progress`, { page: 3 })).status, 200); assert.equal((await s2.req('GET', `/books/${paid}/reader`)).json.resumePage, 3);
await s2.req('PUT', `/books/${paid}/progress`, { page: 2 }); assert.equal((await s2.req('GET', `/books/${paid}/reader`)).json.resumePage, 2); ok('reading position saved & resumed');

// not a pdf
sql(`insert into med_book_purchases(user_id,book_id,book_title,amount,currency,method,reference,payment_date,status) values (${uid('s2@t.com')},${notpdf},'t',100,'PKR','x','r','2026-01-01','approved')`);
r = await s2.req('GET', `/books/${notpdf}/reader`); assert.equal(r.status, 415); assert.match(r.json.error, /isn't a PDF/); ok('non-PDF paid book → clear 415');
// trial books
sql(`delete from med_book_purchases where user_id=${uid('s4@t.com')}`);
assert.equal((await s4.req('GET', `/books/${paid}/reader`)).status, 403);
await admin.req('PATCH', '/admin/settings', { GLOBAL_TRIAL_MODE: 'true', GLOBAL_TRIAL_PROGRAM: '', GLOBAL_TRIAL_YEARS: '', GLOBAL_TRIAL_FEATURES: JSON.stringify(['books']) });
assert.equal((await s4.req('GET', `/books/${paid}/reader`)).status, 200); ok('trial "Paid books" toggle opens the reader (and only the reader)');
b = (await s4.req('GET', '/books')).json.find((x) => x.id === paid); assert.equal(b.storagePath, null); assert.equal(b.secureReader, true); ok('…still without a file URL');
await admin.req('PATCH', '/admin/settings', { GLOBAL_TRIAL_MODE: 'false' });
console.log('ALL READER TESTS PASSED');
