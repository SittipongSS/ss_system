// เทสต์ทะเบียนสิทธิ์เสริม (mig 0440 · รื้อระบบสิทธิ์งวด 2) — ฐานจำลองในหน่วยความจำ ไม่ต่อฐานจริง (กฎ AGENTS.md)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  GRANT_EXPIRED_KIND, GRANT_EXPIRING_KIND, GRANT_WARN_DAYS,
  activeCapsFromRows, expiryActions, grantCaps, grantNotice, normalizeExpiry, revokeGrant, runGrantExpiry,
  syncExtraCaps, validateGrantRequest,
} from '@/lib/capabilityGrants';
import { GRANT_BELL_KINDS, NOTIFICATION_BOXES } from '@/lib/notifications';

// ── ฐานจำลอง: ตารางเดียว + auth.admin ─────────────────────────────────────────
function fakeDb({ rows = [], users = {} } = {}) {
  const table = rows.map((r) => ({ ...r }));
  const meta = Object.fromEntries(Object.entries(users).map(([id, u]) => [id, structuredClone(u)]));
  const log = { inserts: [], updates: [], metaWrites: [] };
  let seq = 0;
  const query = (mode, payload) => {
    const filters = [];
    let single = false;
    const match = (r) => filters.every((f) => f(r));
    const run = () => {
      if (mode === 'insert') {
        const list = (Array.isArray(payload) ? payload : [payload]).map((r) => ({ id: `UCG-${++seq}`, revokedAt: null, warnedAt: null, ...r }));
        for (const r of list) {
          if (table.some((t) => t.userId === r.userId && t.cap === r.cap && !t.revokedAt)) {
            return { data: null, error: { code: '23505', message: 'duplicate' } };
          }
        }
        table.push(...list);
        log.inserts.push(...list);
        return { data: list, error: null };
      }
      const hit = table.filter(match);
      if (mode === 'update') {
        for (const r of hit) Object.assign(r, payload);
        log.updates.push(...hit.map((r) => ({ id: r.id, ...payload })));
      }
      const data = hit.map((r) => ({ ...r }));
      return { data: single ? (data[0] || null) : data, error: null };
    };
    const q = {
      select: () => q, order: () => q, limit: () => q,
      eq: (k, v) => { filters.push((r) => r[k] === v); return q; },
      is: (k, v) => { filters.push((r) => (r[k] ?? null) === v); return q; },
      not: (k, op, v) => { filters.push((r) => (r[k] ?? null) !== v); return q; },
      lte: (k, v) => { filters.push((r) => r[k] != null && r[k] <= v); return q; },
      maybeSingle: () => { single = true; return q; },
      then: (res, rej) => Promise.resolve(run()).then(res, rej),
    };
    return q;
  };
  return {
    table, meta, log,
    from: () => ({
      select: () => query('select'),
      insert: (p) => query('insert', p),
      update: (p) => query('update', p),
    }),
    auth: { admin: {
      getUserById: async (id) => (meta[id] ? { data: { user: { id, ...meta[id] } }, error: null } : { data: null, error: { message: 'nf' } }),
      updateUserById: async (id, { app_metadata }) => { meta[id].app_metadata = app_metadata; log.metaWrites.push({ id, app_metadata }); return { error: null }; },
    } },
  };
}
const person = (role, extraCaps = [], name = 'คนทดสอบ') => ({
  email: `${name}@x`, user_metadata: { firstName: name }, app_metadata: { role, team: 'KA', extraCaps },
});
const NOW = new Date('2026-11-25T03:00:00Z'); // 10:00 วันที่ 25/11 เวลาไทย
const TODAY = '2026-11-25';

// ── กติกาล้วน ──────────────────────────────────────────────────────────────────

test('normalizeExpiry: ต้องเลือกทุกครั้ง · ไม่มีกำหนด = null · วันที่ต้องไม่ย้อนหลัง', () => {
  assert.match(normalizeExpiry(undefined, TODAY).error, /ต้องเลือกวันหมดอายุ/);
  assert.match(normalizeExpiry({ kind: 'x' }, TODAY).error, /ต้องเลือกวันหมดอายุ/);
  assert.deepEqual(normalizeExpiry({ kind: 'none' }, TODAY), { expiresOn: null });
  assert.match(normalizeExpiry({ kind: 'date' }, TODAY).error, /ต้องระบุวันที่/);
  assert.match(normalizeExpiry({ kind: 'date', date: '2026-11-24' }, TODAY).error, /วันนี้หรือหลังจากนี้/);
  assert.deepEqual(normalizeExpiry({ kind: 'date', date: TODAY }, TODAY), { expiresOn: TODAY });
});

test('validateGrantRequest: รวมทุกข้อที่ขาดเป็นข้อความเดียว · ผ่านเมื่อครบ', () => {
  const empty = validateGrantRequest({}, { role: 'ae', today: TODAY });
  assert.equal(empty.errors.length, 3, empty.errors.join(' | ')); // สิทธิ์ · เหตุผล · หมดอายุ
  const okReq = validateGrantRequest(
    { caps: ['ra:view'], reason: '  ช่วยงาน RA  ', expiry: { kind: 'none' } }, { role: 'ae', today: TODAY });
  assert.deepEqual(okReq.errors, []);
  assert.equal(okReq.reason, 'ช่วยงาน RA');
  assert.equal(okReq.expiresOn, null);
});

test('validateGrantRequest: ปฏิเสธ ระบบปิด · ตำแหน่งมีแล้ว · ถืออยู่แล้ว · นอกรายการ · เหตุผลเป็นช่องว่าง', () => {
  const base = { reason: 'x', expiry: { kind: 'none' } };
  assert.match(validateGrantRequest({ ...base, caps: ['mgmt:view'] }, { role: 'ac', today: TODAY }).errors[0], /ปิดอยู่ทั้งระบบ/);
  assert.match(validateGrantRequest({ ...base, caps: ['products:margin'] }, { role: 'admin', today: TODAY }).errors[0], /ตำแหน่งนี้มีอยู่แล้ว/);
  assert.match(validateGrantRequest({ ...base, caps: ['ra:view'] }, { role: 'ae', activeCaps: ['ra:view'], today: TODAY }).errors[0], /ถืออยู่แล้ว/);
  assert.match(validateGrantRequest({ ...base, caps: ['users:manage'] }, { role: 'ae', today: TODAY }).errors[0], /แจกรายคนไม่ได้/);
  assert.match(validateGrantRequest({ caps: ['ra:view'], reason: '   ', expiry: { kind: 'none' } }, { role: 'ae', today: TODAY }).errors[0], /ต้องกรอกเหตุผล/);
});

test('activeCapsFromRows: เฉพาะแถวที่ยังไม่ถอน · ลำดับตามรายการแจกได้ (สำเนาไม่สลับไปมา)', () => {
  assert.deepEqual(activeCapsFromRows([
    { cap: 'team:manage' }, { cap: 'ra:view' }, { cap: 'audit:view', revokedAt: '2026-11-01' },
  ]), ['ra:view', 'team:manage']);
});

test('expiryActions: เลยวัน = ถอด · เหลือ ≤ 3 วัน = เตือนครั้งเดียว · วันสุดท้ายยังใช้ได้ (เตือน ไม่ถอด)', () => {
  assert.equal(GRANT_WARN_DAYS, 3);
  const rows = [
    { id: 'past', expiresOn: '2026-11-24' },
    { id: 'today', expiresOn: TODAY },
    { id: 'in3', expiresOn: '2026-11-28' },
    { id: 'in4', expiresOn: '2026-11-29' },
    { id: 'warned', expiresOn: '2026-11-26', warnedAt: '2026-11-24T02:00:00Z' },
    { id: 'none', expiresOn: null },
    { id: 'gone', expiresOn: '2026-11-01', revokedAt: '2026-11-02' },
  ];
  const { expire, warn } = expiryActions(rows, TODAY);
  assert.deepEqual(expire.map((r) => r.id), ['past']);
  assert.deepEqual(warn.map((r) => r.id), ['today', 'in3']);
});

test('grantNotice: คนถืออ่าน "ของคุณ" · คนให้อ่านชื่อคนถือ · วันที่แบบ DD/MM/YYYY', () => {
  const row = { cap: 'ra:view', expiresOn: '2026-11-30' };
  const mine = grantNotice(row, { kind: GRANT_EXPIRING_KIND, forHolder: true });
  assert.match(mine.body, /ของคุณ ใช้ได้ถึงวันที่ 30\/11\/2026/);
  const theirs = grantNotice(row, { kind: GRANT_EXPIRED_KIND, holderName: 'สมชาย', forHolder: false });
  assert.match(theirs.title, /หมดอายุแล้ว/);
  assert.match(theirs.body, /ของ สมชาย ครบกำหนดวันที่ 30\/11\/2026/);
});

test('⭐ kind ของกระดิ่งสิทธิ์เสริมอยู่ในกล่องกระดิ่ง — ไม่งั้นเขียนลงตารางแต่ไม่ขึ้นกระดิ่ง', () => {
  assert.deepEqual([...GRANT_BELL_KINDS].sort(), [GRANT_EXPIRED_KIND, GRANT_EXPIRING_KIND].sort());
  for (const kind of GRANT_BELL_KINDS) assert.ok(NOTIFICATION_BOXES.bell.kinds.includes(kind), kind);
});

// ── เขียนฐาน (ฐานจำลอง) ───────────────────────────────────────────────────────

test('grantCaps: เขียนแถวพร้อมเหตุผล/หมดอายุ/คนให้ → สำเนา app_metadata → audit', async () => {
  const db = fakeDb({ users: { u1: person('rd_coordinator', [], 'Nicha') } });
  const audits = [];
  const res = await grantCaps(db, {
    targetId: 'u1', actor: { id: 'admin-1', name: 'แอดมิน' }, caps: ['products:margin', 'ra:view'],
    reason: 'ทำรายงานผู้บริหาร', expiry: { kind: 'date', date: '2026-12-31' }, now: NOW,
  }, { audit: (e) => audits.push(e) });
  assert.equal(res.errors, undefined);
  assert.deepEqual(res.extraCaps, ['ra:view', 'products:margin']);
  assert.equal(db.table.length, 2);
  for (const r of db.table) {
    assert.equal(r.reason, 'ทำรายงานผู้บริหาร');
    assert.equal(r.expiresOn, '2026-12-31');
    assert.equal(r.grantedById, 'admin-1');
    assert.equal(r.grantedByName, 'แอดมิน');
  }
  assert.deepEqual(db.meta.u1.app_metadata.extraCaps, ['ra:view', 'products:margin']);
  assert.equal(db.meta.u1.app_metadata.role, 'rd_coordinator', 'คีย์อื่นของ app_metadata ต้องอยู่ครบ');
  assert.equal(db.meta.u1.app_metadata.team, 'KA');
  assert.equal(audits.length, 1);
  assert.deepEqual(audits[0].after.extraCaps, ['ra:view', 'products:margin']);
  assert.match(audits[0].summary, /ถึง 31\/12\/2026 · เหตุผล: ทำรายงานผู้บริหาร/);
});

test('grantCaps: ไม่ผ่านด่าน = ไม่เขียนอะไรเลย (ทั้งตาราง สำเนา และ audit)', async () => {
  const db = fakeDb({ users: { u1: person('admin') } });
  const audits = [];
  const res = await grantCaps(db, { targetId: 'u1', actor: { id: 'a' }, caps: ['products:margin'], reason: 'x', expiry: { kind: 'none' }, now: NOW },
    { audit: (e) => audits.push(e) });
  assert.equal(res.status, 400);
  assert.equal(db.table.length, 0);
  assert.equal(db.log.metaWrites.length, 0);
  assert.equal(audits.length, 0);
});

test('grantCaps: ชน unique index (ให้พร้อมกันพอดี) = 409 ภาษาคน ไม่ใช่ error ดิบ', async () => {
  const db = fakeDb({ users: { u1: person('ae') } });
  // แถวที่ "เพิ่งเข้ามา" หลังเราอ่านรายการถืออยู่ — จำลองด้วยการใส่ตรงก่อน insert
  const realFrom = db.from;
  let first = true;
  db.from = (t) => {
    const api = realFrom(t);
    return { ...api, insert: (p) => { if (first) { first = false; db.table.push({ id: 'race', userId: 'u1', cap: 'ra:view', revokedAt: null }); } return api.insert(p); } };
  };
  const res = await grantCaps(db, { targetId: 'u1', actor: { id: 'a' }, caps: ['ra:view'], reason: 'x', expiry: { kind: 'none' }, now: NOW });
  assert.equal(res.status, 409);
  assert.match(res.errors[0], /มีคนให้สิทธิ์นี้ไปแล้ว/);
});

test('revokeGrant: ติดตราถอน (ไม่ลบแถว) → สำเนาเหลือของที่ยังถือ · แถวที่ถอนแล้ว = 404', async () => {
  const db = fakeDb({
    rows: [
      { id: 'g1', userId: 'u1', cap: 'ra:view', revokedAt: null },
      { id: 'g2', userId: 'u1', cap: 'products:margin', revokedAt: null },
    ],
    users: { u1: person('senior_ae', ['ra:view', 'products:margin']) },
  });
  const res = await revokeGrant(db, { targetId: 'u1', grantId: 'g1', actor: { id: 'a', name: 'แอดมิน' }, note: 'จบงาน', now: NOW });
  assert.deepEqual(res.extraCaps, ['products:margin']);
  const g1 = db.table.find((r) => r.id === 'g1');
  assert.equal(g1.revokeKind, 'manual');
  assert.equal(g1.revokedByName, 'แอดมิน');
  assert.equal(g1.revokeNote, 'จบงาน');
  assert.equal(db.table.length, 2, 'ประวัติต้องอยู่ครบ — ไม่ลบแถว');
  const again = await revokeGrant(db, { targetId: 'u1', grantId: 'g1', actor: { id: 'a' }, now: NOW });
  assert.equal(again.status, 404);
  // แถวของคนอื่นถอนผ่าน id ของคนนี้ไม่ได้
  const wrongUser = await revokeGrant(db, { targetId: 'u2', grantId: 'g2', actor: { id: 'a' }, now: NOW });
  assert.equal(wrongUser.status, 404);
});

test('syncExtraCaps: สำเนาตามตารางเสมอ — ของที่แก้มือใน app_metadata ถูกเขียนทับ', async () => {
  const db = fakeDb({ rows: [{ id: 'g1', userId: 'u1', cap: 'ra:view', revokedAt: null }], users: { u1: person('ae', ['audit:view']) } });
  const out = await syncExtraCaps(db, 'u1');
  assert.deepEqual(out.before, ['audit:view']);
  assert.deepEqual(db.meta.u1.app_metadata.extraCaps, ['ra:view']);
});

test('⭐ runGrantExpiry: ถอดแถวที่เลยวัน + เตือนแถวใกล้ครบ · กระดิ่งคนถือ (/account) + คนให้ (/users) · รันซ้ำไม่ซ้ำ', async () => {
  const db = fakeDb({
    rows: [
      { id: 'old', userId: 'u1', cap: 'ra:view', expiresOn: '2026-11-24', grantedById: 'admin-1', revokedAt: null },
      { id: 'keep', userId: 'u1', cap: 'products:margin', expiresOn: null, revokedAt: null },
      { id: 'soon', userId: 'u2', cap: 'audit:view', expiresOn: '2026-11-27', grantedById: 'admin-1', revokedAt: null },
    ],
    users: { u1: person('senior_ae', ['ra:view', 'products:margin'], 'Sittipong'), u2: person('ae', ['audit:view'], 'Nicha') },
  });
  const bells = [];
  const audits = [];
  const out = await runGrantExpiry(db, { now: NOW, notify: (a) => bells.push(a), audit: (e) => audits.push(e) });
  assert.deepEqual(out, { today: TODAY, expired: 1, warned: 1 });

  const old = db.table.find((r) => r.id === 'old');
  assert.equal(old.revokeKind, 'expired');
  assert.deepEqual(db.meta.u1.app_metadata.extraCaps, ['products:margin'], 'สำเนาต้องตามตาราง');
  assert.deepEqual(db.meta.u2.app_metadata.extraCaps, ['audit:view'], 'แถวที่แค่เตือน สำเนาไม่ขยับ');
  assert.equal(audits.length, 1);
  assert.match(audits[0].summary, /ครบกำหนด/);

  const byKind = (kind) => bells.filter((b) => b.kind === kind);
  assert.deepEqual(byKind(GRANT_EXPIRED_KIND).map((b) => [b.userIds[0], b.href]), [['u1', '/account'], ['admin-1', '/users']]);
  assert.deepEqual(byKind(GRANT_EXPIRING_KIND).map((b) => [b.userIds[0], b.href]), [['u2', '/account'], ['admin-1', '/users']]);
  assert.match(byKind(GRANT_EXPIRING_KIND)[1].body, /ของ Nicha/);
  assert.ok(bells.every((b) => b.entityType === 'user_grant' && b.dedupeKey), 'ทุกกระดิ่งมี dedupeKey');

  // รันซ้ำวันเดียวกัน (แอดมินเปิดทดสอบเอง) — ไม่ถอดซ้ำ ไม่เตือนซ้ำ
  bells.length = 0;
  const again = await runGrantExpiry(db, { now: NOW, notify: (a) => bells.push(a), audit: () => {} });
  assert.deepEqual([again.expired, again.warned], [0, 0]);
  assert.equal(bells.length, 0);
});

test('runGrantExpiry: คนให้ = คนถือ (ให้ตัวเอง) ไม่ยิงกระดิ่งซ้ำสองใบ · ไม่มีคนให้ (ย้ายของเดิม) ยิงแค่คนถือ', async () => {
  const db = fakeDb({
    rows: [
      { id: 'self', userId: 'u1', cap: 'ra:view', expiresOn: '2026-11-20', grantedById: 'u1', revokedAt: null },
      { id: 'legacy', userId: 'u2', cap: 'ra:view', expiresOn: '2026-11-20', grantedById: null, revokedAt: null },
    ],
    users: { u1: person('admin'), u2: person('ae', ['ra:view']) },
  });
  const bells = [];
  await runGrantExpiry(db, { now: NOW, notify: (a) => bells.push(a), audit: () => {} });
  assert.deepEqual(bells.map((b) => b.userIds[0]).sort(), ['u1', 'u2']);
});

// ── รูปโค้ดที่ต้องคงไว้ ─────────────────────────────────────────────────────────

const src = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

test('cron รายวันเรียก runGrantExpiry พร้อมตัวยิงกระดิ่ง/audit จริง — และพลาดแล้วงานอื่นไม่ล้ม', () => {
  const cron = src('../app/api/cron/close-resolved-issues/route.js');
  assert.match(cron, /grants = await runGrantExpiry\(supabase, \{\s*now, notify: \(args\) => notifyUsers\(supabase, args\), audit: \(entry\) => recordAudit\(entry\),\s*\}\);/);
  assert.match(cron, /catch \(grantError\) \{/);
  const vercel = JSON.parse(readFileSync(fileURLToPath(new URL('../../vercel.json', import.meta.url)), 'utf8'));
  assert.ok(vercel.crons.some((c) => c.path === '/api/cron/close-resolved-issues' && c.schedule === '0 2 * * *'),
    'cron ตัวนี้ต้องรันทุกวัน (ไม่ใช่แค่วันทำการ) — สิทธิ์ที่ครบวันศุกร์ต้องไม่ค้างถึงวันจันทร์');
});

test('API สิทธิ์เสริม: อ่าน = users:manage หรือ users:view (canUser) · ให้/ถอน = users:manage', () => {
  const list = src('../app/api/users/[id]/grants/route.js');
  assert.match(list, /if \(!canUser\(user, 'users:manage'\) && !canUser\(user, 'users:view'\)\) return forbidden\(\);/);
  const post = list.slice(list.indexOf('export const POST'));
  assert.match(post, /if \(!canUser\(user, 'users:manage'\)\) return forbidden\(\);/);
  const del = src('../app/api/users/[id]/grants/[grantId]/route.js');
  assert.match(del, /if \(!canUser\(user, 'users:manage'\)\) return forbidden\(\);/);
});
