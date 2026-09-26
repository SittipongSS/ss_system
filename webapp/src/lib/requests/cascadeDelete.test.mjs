// คำร้องที่หายพ่วงการลบดีล/โครงการ — ด่าน + audit ทีละใบ (ของจริง 2026-09-25: หายเงียบ 11 ใบ)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  isUnsentDraft, isSentRequest, sentRequestsBlockMessage, sentRequestsForceNote,
  requestsLinkedTo, snapshotRequestsForAudit, requestCascadeSummary,
} from './cascadeDelete.js';
import { cleanupDealOrphans } from '../forceDelete.js';
import { deleteProjectDeep } from '../pm/projectsRepo.js';

const SENT_AT = '2026-09-03T05:03:25Z';

test('isSentRequest: เงื่อนไขเดียวกับ trigger guard_dept_request — ร่างที่ไม่เคยส่งเท่านั้นที่ลบพ่วงได้', () => {
  assert.equal(isUnsentDraft({ status: 'draft', submittedAt: null }), true);
  assert.equal(isSentRequest({ status: 'draft', submittedAt: null }), false);
  // ตีกลับแล้วกลับเป็นร่าง แต่เคยถึงมือฝ่ายนั้นแล้ว — trigger ก็ไม่ยอมให้ลบตรง
  assert.equal(isSentRequest({ status: 'draft', submittedAt: SENT_AT }), true);
  for (const status of ['pending', 'acknowledged', 'answered', 'closed', 'cancelled']) {
    assert.equal(isSentRequest({ status, submittedAt: SENT_AT }), true, status);
  }
  assert.equal(isSentRequest(null), false);
});

test('sentRequestsBlockMessage: ร่างล้วน = ไม่บล็อก', () => {
  assert.equal(sentRequestsBlockMessage([{ id: 'DR-1', status: 'draft' }], 'ดีล'), null);
  assert.equal(sentRequestsBlockMessage([], 'ดีล'), null);
  assert.equal(sentRequestsBlockMessage(null, 'ดีล'), null);
});

test('sentRequestsBlockMessage: บอกเลขที่ที่ติด เหตุผล และทางออก (ดีล = ปิด Lost)', () => {
  const msg = sentRequestsBlockMessage([
    { id: 'DR-1', docNo: 'RQ-IQ-26090026', status: 'closed', submittedAt: SENT_AT },
    { id: 'DR-2', status: 'draft' },
  ], 'ดีล');
  assert.match(msg, /ดีลนี้มีคำร้องที่ส่งถึงฝ่ายอื่นแล้ว 1 ใบ \(RQ-IQ-26090026\)/);
  assert.match(msg, /ลบดีลไม่ได้/);
  assert.match(msg, /กู้คืนไม่ได้/);
  assert.match(msg, /ปิดเป็น Lost/);
  assert.match(msg, /ผู้ดูแลระบบ/);
});

test('sentRequestsBlockMessage: โครงการไม่ชวนปิด Lost · เกิน 5 ใบย่อเป็น "อีก N ใบ"', () => {
  const rows = Array.from({ length: 7 }, (_, i) => ({ id: `DR-${i}`, docNo: `RQ-${i}`, status: 'pending' }));
  const msg = sentRequestsBlockMessage(rows, 'โครงการ');
  assert.match(msg, /^โครงการนี้มีคำร้องที่ส่งถึงฝ่ายอื่นแล้ว 7 ใบ/);
  assert.match(msg, /RQ-0 · RQ-1 · RQ-2 · RQ-3 · RQ-4 และอีก 2 ใบ/);
  assert.doesNotMatch(msg, /RQ-5/);
  assert.doesNotMatch(msg, /Lost/);
});

test('sentRequestsForceNote: พรีวิวแอดมินขึ้นเลขที่ + บอกว่ากู้ได้จาก audit เท่านั้น', () => {
  assert.equal(sentRequestsForceNote([{ status: 'draft' }]), null);
  const note = sentRequestsForceNote([{ id: 'DR-1', docNo: 'RQ-IQ-26090079', status: 'acknowledged' }]);
  assert.match(note, /1 ใบ \(RQ-IQ-26090079\)/);
  assert.match(note, /audit/);
});

test('requestCascadeSummary: เลขที่ + เรื่อง + ต้นเหตุ · ร่างไม่มีเลข', () => {
  assert.equal(
    requestCascadeSummary({ docNo: 'RQ-IQ-26090026', title: 'ขอ Mock up' }, 'การลบดีล DL-260900432'),
    'ลบคำร้อง RQ-IQ-26090026 ขอ Mock up พ่วงการลบดีล DL-260900432',
  );
  assert.match(requestCascadeSummary({ id: 'DR-9' }, 'การลบดีล DL-1'), /^ลบคำร้อง DR-9 พ่วง/);
});

// fake ตาราง: select → eq/in แล้ว await ได้ · เก็บลำดับการเรียกไว้ตรวจ
function fakeDb({ tables = {}, errors = {}, log = [] } = {}) {
  const db = {
    from(table) {
      const q = { table, op: 'select', filters: [] };
      const result = () => {
        if (errors[table]) return { data: null, error: { message: errors[table] } };
        let rows = tables[table] || [];
        for (const [kind, col, val] of q.filters) {
          rows = rows.filter((r) => (kind === 'eq' ? r[col] === val : val.includes(r[col])));
        }
        return { data: rows, error: null };
      };
      const chain = {
        select() { return chain; },
        delete() { q.op = 'delete'; log.push(`delete:${table}`); return chain; },
        update() { q.op = 'update'; log.push(`update:${table}`); return chain; },
        eq(col, val) { q.filters.push(['eq', col, val]); return chain; },
        in(col, val) { q.filters.push(['in', col, val]); return chain; },
        order() { return chain; },
        range() { return Promise.resolve(result()); },
        then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
      };
      return chain;
    },
    rpc(fn, args) { log.push(`rpc:${fn}:${args.p_id}`); return Promise.resolve({ data: null, error: null }); },
  };
  return db;
}

test('requestsLinkedTo: อ่านไม่ขึ้นต้องโยน (ไม่ใช่ได้ [] แล้วด่านเปิดเอง)', async () => {
  const db = fakeDb({ errors: { dept_requests: 'permission denied' } });
  await assert.rejects(() => requestsLinkedTo(db, 'dealId', 'D1'), /อ่านคำร้องที่ผูกดีลไม่สำเร็จ: permission denied/);
});

test('snapshotRequestsForAudit: แถวเต็ม + เธรดของแต่ละใบ · อ่านไม่ขึ้นต้องโยน', async () => {
  const db = fakeDb({
    tables: {
      dept_requests: [{ id: 'DR-1', docNo: 'RQ-IQ-26090026', body: 'ขอราคา FG' }, { id: 'DR-2' }],
      entity_updates: [
        { id: 'U1', entityType: 'dept_request', entityId: 'DR-1', body: 'FB = 987.02 BAHT/KG' },
        { id: 'U2', entityType: 'deal', entityId: 'DR-1', body: 'ไม่ใช่เธรดคำร้อง' },
      ],
    },
  });
  const rows = await snapshotRequestsForAudit(db, ['DR-1', 'DR-2']);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].body, 'ขอราคา FG');
  assert.deepEqual(rows[0].thread.map((p) => p.id), ['U1']);
  assert.deepEqual(rows[1].thread, []);
  assert.deepEqual(await snapshotRequestsForAudit(db, []), []);
  await assert.rejects(
    () => snapshotRequestsForAudit(fakeDb({ errors: { entity_updates: 'boom' } }), ['DR-1']),
    /อ่านเธรดคำร้องก่อนลบไม่สำเร็จ/,
  );
});

const REQUEST = { id: 'DR-1', docNo: 'RQ-IQ-26090026', dealId: 'D1', projectId: 'P1', status: 'closed' };
const THREAD = { id: 'U1', entityType: 'dept_request', entityId: 'DR-1', body: 'คำตอบ RD' };

test('cleanupDealOrphans: audit ของคำร้องต้องเขียนก่อนกวาดเธรดและก่อนลบคำร้อง', async () => {
  const log = [];
  const db = fakeDb({ tables: { dept_requests: [REQUEST], entity_updates: [THREAD] }, log });
  let audited = null;
  await cleanupDealOrphans(db, 'D1', {
    auditRequests: async (rows) => { log.push('audit'); audited = rows; },
  });
  assert.equal(audited.length, 1);
  assert.equal(audited[0].docNo, 'RQ-IQ-26090026');
  assert.deepEqual(audited[0].thread.map((p) => p.body), ['คำตอบ RD'], 'snapshot ต้องได้เธรดก่อนถูกกวาด');
  const at = (entry) => log.indexOf(entry);
  assert.ok(at('audit') >= 0);
  assert.ok(at('audit') < at('delete:entity_updates'), log.join(' → '));
  assert.ok(at('audit') < at('rpc:force_delete_dept_request:DR-1'), log.join(' → '));
});

test('cleanupDealOrphans: snapshot อ่านไม่ขึ้น = หยุดก่อนลบคำร้อง', async () => {
  const log = [];
  const base = fakeDb({ tables: { dept_requests: [REQUEST] }, log });
  const db = {
    ...base,
    from(table) {
      if (table === 'entity_updates') return fakeDb({ errors: { entity_updates: 'timeout' } }).from(table);
      return base.from(table);
    },
  };
  await assert.rejects(
    () => cleanupDealOrphans(db, 'D1', { auditRequests: async () => {} }),
    /อ่านเธรดคำร้องก่อนลบไม่สำเร็จ/,
  );
  assert.ok(!log.some((l) => l.startsWith('rpc:')), 'ห้ามลบคำร้องเมื่อไม่มี snapshot');
});

test('deleteProjectDeep: audit ของคำร้องต้องเขียนก่อนกวาดเธรดและก่อนลบคำร้อง', async () => {
  const log = [];
  const db = fakeDb({ tables: { dept_requests: [REQUEST], entity_updates: [THREAD] }, log });
  let audited = null;
  await deleteProjectDeep(db, 'P1', {
    auditRequests: async (rows) => { log.push('audit'); audited = rows; },
  });
  assert.equal(audited?.[0]?.id, 'DR-1');
  assert.deepEqual(audited[0].thread.map((p) => p.id), ['U1']);
  const at = (entry) => log.indexOf(entry);
  assert.ok(at('audit') < at('delete:entity_updates'), log.join(' → '));
  assert.ok(at('audit') < at('rpc:force_delete_dept_request:DR-1'), log.join(' → '));
});

// ── ratchet: route ต้องต่อด่าน + audit ไว้จริง (ตัดคอมเมนต์ก่อน ไม่งั้นจับคำในคำอธิบาย) ──
const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const codeOnly = (rel) => readFileSync(join(SRC, rel), 'utf8')
  .split(/\r?\n/).map((l) => l.replace(/\/\/.*$/, '')).join('\n')
  .replace(/\/\*[\s\S]*?\*\//g, '');

for (const [rel, column, owner, cleanup] of [
  ['app/api/sales-planning/deals/[id]/route.js', 'dealId', 'ดีล', 'cleanupDealOrphans'],
  ['app/api/pm/projects/[id]/route.js', 'projectId', 'โครงการ', 'deleteProjectDeep'],
]) {
  test(`${rel}: ด่านคำร้องที่ส่งแล้วต้องอยู่ก่อน ${cleanup} และ ${cleanup} ต้องได้ auditRequests`, () => {
    const src = codeOnly(rel);
    const gate = src.indexOf(`sentRequestsBlockMessage(linkedRequests, '${owner}')`);
    const read = src.indexOf(`requestsLinkedTo(supabase, '${column}', id)`);
    const call = src.indexOf(`await ${cleanup}(`);
    assert.ok(read >= 0 && gate >= 0, 'ต้องอ่านคำร้องแล้วผ่านด่าน');
    assert.ok(read < gate && gate < call, 'ด่านต้องมาก่อนเส้นลบ');
    assert.match(src.slice(call, call + 200), /auditRequests: requestCascadeAuditor\(/);
  });
}
