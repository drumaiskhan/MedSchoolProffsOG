// Device limit: 2 devices per student by default, admin can raise/lower it
// per student or change the platform default. Run against a scratch DB with
// a running API (see README). Independent of 01/02: creates its own student.
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(new URL('../../artifacts/api-server/package.json', import.meta.url));
const bcrypt = require('bcryptjs');
const BASE = 'http://localhost:3001/api';
const sql = (q) => execSync('PGPASSWORD=app psql -h localhost -U app msp -At -c ' + JSON.stringify(q).replace(/\$/g, '\\$')).toString().trim();
function client(ua = 'Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537.36') { let cookie = ''; return { get cookie() { return cookie; }, async req(method, path, body) {
  const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', 'user-agent': ua, cookie }, body: body ? JSON.stringify(body) : undefined });
  const sc = r.headers.getSetCookie?.() ?? []; if (sc.length) cookie = sc.map((c) => c.split(';')[0]).join('; ');
  let json = null, text = ''; try { text = await r.text(); json = JSON.parse(text); } catch {} return { status: r.status, json, text }; } }; }
const ok = (n) => console.log('  ✓', n);
const EMAIL = 'dev@t.com', PW = 'Student123!';
const login = (c) => c.req('POST', '/auth/login', { email: EMAIL, password: PW });

sql(`delete from med_user_sessions where user_id in (select id from med_users where email='${EMAIL}')`);
sql(`delete from med_users where email='${EMAIL}'`);
sql(`delete from med_platform_settings where key='DEFAULT_MAX_DEVICES'`);
const hash = await bcrypt.hash(PW, 4);
sql(`insert into med_users(name,email,password_hash,role,status,email_verified) values ('Dev Student','${EMAIL}','${hash}','student','ACTIVE',true)`);
const uid = Number(sql(`select id from med_users where email='${EMAIL}'`));
const admin = client(); assert.equal((await admin.req('POST', '/auth/login', { email: 'admin@test.com', password: 'Admin12345!' })).status, 200);

// default = 2
const a = client(), b = client('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/604.1'), c = client();
assert.equal((await login(a)).status, 200); assert.equal((await login(b)).status, 200);
let r = await login(c); assert.equal(r.status, 403); assert.equal(r.json.code, 'DEVICE_LIMIT_REACHED'); assert.match(r.json.error, /2 devices/);
assert.equal((await c.req('GET', '/auth/me')).status, 401); ok('default: 2 devices sign in, the 3rd is refused with DEVICE_LIMIT_REACHED');

// same browser signing in again does not take a second slot
assert.equal((await login(a)).status, 200); assert.equal((await a.req('GET', '/auth/me')).status, 200);
assert.equal(Number(sql(`select count(*) from med_user_sessions where user_id=${uid} and revoked_at is null`)), 2); ok('re-login from the same browser replaces its session (still 2 active)');

// logout frees a slot
assert.equal((await b.req('POST', '/auth/logout')).status, 204); assert.equal((await b.req('GET', '/auth/me')).status, 401);
assert.equal((await login(c)).status, 200); ok('logging out frees a slot for another device');

// admin view
r = await admin.req('GET', `/students/${uid}/devices`); assert.equal(r.status, 200);
assert.equal(r.json.limit, 2); assert.equal(r.json.override, null); assert.equal(r.json.defaultLimit, 2); assert.equal(r.json.devices.length, 2);
assert.ok(r.json.devices.some((d) => /Chrome on Windows/.test(d.label))); ok('admin sees the limit, default and each signed-in device');

// raise per student → third device now fits
assert.equal((await admin.req('PATCH', `/students/${uid}/device-limit`, { maxDevices: 3 })).status, 200);
const d = client(); assert.equal((await login(d)).status, 200);
const e = client(); assert.equal((await login(e)).status, 403); ok('admin raised this student to 3: 3rd device allowed, 4th refused');

// lower per student → nobody is kicked, but new logins are blocked
assert.equal((await admin.req('PATCH', `/students/${uid}/device-limit`, { maxDevices: 1 })).status, 200);
assert.equal((await a.req('GET', '/auth/me')).status, 200); assert.equal((await login(e)).status, 403); ok('lowering the limit keeps existing sessions but blocks new sign-ins');

// validation
for (const bad of [-1, 51, 1.5, 'x']) assert.equal((await admin.req('PATCH', `/students/${uid}/device-limit`, { maxDevices: bad })).status, 400);
assert.equal((await client().req('PATCH', `/students/${uid}/device-limit`, { maxDevices: 5 })).status, 401);
assert.equal((await a.req('PATCH', `/students/${uid}/device-limit`, { maxDevices: 5 })).status, 403); ok('limit validated; only admins may change it');

// revoke one device
r = await admin.req('GET', `/students/${uid}/devices`); const victim = r.json.devices[0];
assert.equal((await admin.req('DELETE', `/students/${uid}/devices/${victim.id}`)).status, 200);
assert.equal((await admin.req('DELETE', `/students/${uid}/devices/${victim.id}`)).status, 404);
const meStatuses = await Promise.all([a, c, d].map(async (x) => (await x.req('GET', '/auth/me')).status));
assert.equal(meStatuses.filter((s) => s === 401).length, 1); ok('admin signed exactly one device out');

// reset everything, unlimited, then platform default
r = await admin.req('DELETE', `/students/${uid}/devices`); assert.equal(r.status, 200);
for (const x of [a, c, d]) assert.equal((await x.req('GET', '/auth/me')).status, 401); ok('"sign out of all devices" logs every device out');
assert.equal((await admin.req('PATCH', `/students/${uid}/device-limit`, { maxDevices: 0 })).status, 200);
for (let i = 0; i < 5; i++) assert.equal((await login(client())).status, 200); ok('0 = unlimited');
assert.equal((await admin.req('PATCH', `/students/${uid}/device-limit`, { maxDevices: null })).status, 200);
await admin.req('DELETE', `/students/${uid}/devices`);
assert.equal((await admin.req('PATCH', '/admin/settings', { DEFAULT_MAX_DEVICES: '3' })).status, 200);
const many = [client(), client(), client(), client()]; const codes = []; for (const m of many) codes.push((await login(m)).status);
assert.deepEqual(codes, [200, 200, 200, 403]); ok('null override follows the platform default (changed to 3)');
assert.equal((await admin.req('PATCH', '/admin/settings', { DEFAULT_MAX_DEVICES: 'abc' })).status, 400);
assert.equal((await admin.req('PATCH', '/admin/settings', { DEFAULT_MAX_DEVICES: '' })).status, 200); ok('default setting validated; blank falls back to 2');

// password change voids tokens and frees slots
await admin.req('DELETE', `/students/${uid}/devices`);
const p1 = client(), p2 = client(); await login(p1); await login(p2);
assert.equal((await p1.req('POST', '/auth/change-password', { currentPassword: PW, newPassword: 'NewPass12345!' })).status, 200);
assert.equal(Number(sql(`select count(*) from med_user_sessions where user_id=${uid} and revoked_at is null`)), 0);
assert.equal((await p2.req('GET', '/auth/me')).status, 401);
assert.equal((await client().req('POST', '/auth/login', { email: EMAIL, password: 'NewPass12345!' })).status, 200); ok('password change signs everything out and frees the slots');

// admins are never limited
sql(`update med_platform_settings set value='1' where key='DEFAULT_MAX_DEVICES'`);
await admin.req('PATCH', '/admin/settings', { DEFAULT_MAX_DEVICES: '1' });
for (let i = 0; i < 3; i++) assert.equal((await client().req('POST', '/auth/login', { email: 'admin@test.com', password: 'Admin12345!' })).status, 200); ok('admin accounts are exempt from the limit');
await admin.req('PATCH', '/admin/settings', { DEFAULT_MAX_DEVICES: '' });
console.log('device-limit tests passed');
