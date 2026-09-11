// ── นัดถอนเครื่องปิดแล้ว ทะเบียนต้องขยับตาม (G) ─────────────────────────────
//
// ของเดิม: ปิดนัด `remove` แล้วเครื่องยังเป็น "ใช้งานอยู่" ที่ไซต์ลูกค้าต่อไป ⇒ ทะเบียนเพี้ยน
// ตั้งแต่การใช้จริงครั้งแรก และเงียบที่สุด เพราะไม่มีจอไหนพังให้เห็น
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  retrievalApplies, retrievalBlockedMessage, retrievalCandidateIds, retrievalInput,
  retrievalKindSwitchError, retrievalMark, retrievalPlan, retrievalStatusLockError, retrievedByVisit,
} from './visitRetrieval.js';
import {
  ASSET_OUTCOMES, REMOVE_VISIT_KIND, assetOutcomeLabel, assetOutcomesFor, frozenResultRows,
  sameAssetResult,
} from './visitAssets.js';
import { assetMovePatch, assetMoveRow } from './assetMoves.js';
import { RETRIEVE_VISIT_KIND } from './renewalRetrieveVisit.js';
import { commitAssetMove } from './assetMoveCommit.js';
import { assetTimeline } from './assetHistory.js';
import { buildVisitReport } from './visitReport.js';

/** ตัดคอมเมนต์ก่อนค้นซอร์ส — ยามต้องไม่ไปเจอคำในคำอธิบายของไฟล์เอง */
const code = (url) => readFileSync(new URL(url, import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const visit = (over = {}) => ({
  id: 'SVV1', code: 'SV-26090001', siteId: 'ST1', kind: 'remove', status: 'done',
  actualDate: '2026-09-11', note: 'ลูกค้าไม่ต่อสัญญาบริการ — ปิดสาขา', ...over,
});
const asset = (over = {}) => ({
  id: 'A1', label: 'เครื่องล็อบบี้', siteId: 'ST1', zoneId: 'Z1', status: 'active',
  condition: 'ok', installedAt: '2026-01-05', ...over,
});

/* ══ เมื่อไรต้องถอน ════════════════════════════════════════════════════ */

test('🔴 นัดถอนที่ปิดแล้ว (เข้าแล้ว/ทำไม่ครบ) ต้องขยับทะเบียน', () => {
  for (const status of ['done', 'partial']) {
    assert.equal(retrievalApplies(visit({ status: 'in_progress' }), visit({ status })), true, status);
  }
});

test('ไม่ถอน: ยังไม่ปิด · ไปแล้วเข้าไม่ได้ · ไม่ใช่นัดถอน', () => {
  assert.equal(retrievalApplies(visit(), visit({ status: 'in_progress' })), false);
  // ชิป "ไปแล้วเข้าไม่ได้" ข้ามการบันทึกผลรายเครื่อง ⇒ แถว "ถอนแล้ว" ที่ค้างอยู่ไม่ใช่ความจริงของรอบนี้
  assert.equal(retrievalApplies(visit(), visit({ status: 'unable' })), false);
  assert.equal(retrievalApplies(visit({ kind: 'refill' }), visit({ kind: 'refill' })), false);
  // ⚠️ ต้องเป็นนัดถอน **ทั้งก่อนและหลัง** — ดูด่านเปลี่ยนชนิดข้างล่าง
  assert.equal(retrievalApplies(visit({ kind: 'refill' }), visit()), false);
});

/* ══ แผนถอน ════════════════════════════════════════════════════════════ */

test('🔴 ถอนเฉพาะเครื่องที่ติ๊ก "ถอนแล้ว" และยังติดตั้งอยู่ที่ไซต์นี้', () => {
  const siteAssets = [asset({ id: 'A1' }), asset({ id: 'A2' }), asset({ id: 'A3' })];
  const results = [
    { assetId: 'A1', outcome: 'done' },
    { assetId: 'A2', outcome: 'unable' },     // ถอนไม่ได้ = ยังอยู่ที่เดิม
  ];                                          // A3 ไม่มีผล = ไม่แตะ
  const plan = retrievalPlan({ visit: visit(), results, siteAssets });
  assert.deepEqual(plan.moves.map((m) => m.asset.id), ['A1']);
  assert.deepEqual(plan.blocked, []);
});

test('🔑 บันทึกซ้ำกี่รอบก็ได้ผลเท่าเดิม — เครื่องที่ถอนแล้วไม่อยู่ในเงื่อนไขอีก', () => {
  const results = [{ assetId: 'A1', outcome: 'done' }];
  // หลังถอน: เครื่องเป็น "ว่าง" ไม่มีไซต์ ⇒ loadAssets(ไซต์) ไม่เห็นมันด้วยซ้ำ
  assert.deepEqual(retrievalPlan({ visit: visit(), results, siteAssets: [] }).moves, []);
  // หรือถูกย้ายไปไซต์อื่นแล้ว (กันไว้อีกชั้น ต่อให้ส่งมาในรายการ)
  const moved = asset({ siteId: 'ST9' });
  assert.deepEqual(retrievalPlan({ visit: visit(), results, siteAssets: [moved] }).moves, []);
  // ส่งซ่อม/ปลดระวางอยู่ ไม่ใช่เครื่องที่ติดตั้งอยู่ = ไม่ถอน
  for (const status of ['repair', 'removed', 'in_stock']) {
    assert.deepEqual(retrievalPlan({ visit: visit(), results, siteAssets: [asset({ status })] }).moves, [], status);
  }
});

/* 🔴 ทางแก้ที่จอบอกเอง ("ถอนผิด ให้ผู้จัดคิวสั่งติดตั้งเข้าไซต์") ต้องไม่ถูกนัดเดิมถอนทับ
   — เครื่องที่ติดตั้งคืน "ใช้งานอยู่ที่ไซต์นี้" และผลยังเป็น "ถอนแล้ว" ⇒ ดูแค่สภาพปัจจุบัน
   จะถอนซ้ำทุกครั้งที่ใครบันทึกนัดใบนี้ (แก้สรุป/แนบรูป) และด่านวันที่จับไม่ได้ถ้าคืนวันเดียวกัน */
test('🔴 นัดหนึ่งใบถอนเครื่องหนึ่งตัวได้ครั้งเดียว — ติดตั้งคืนแล้วบันทึกนัดซ้ำต้องไม่ถอนทับ', () => {
  const reinstalled = asset({ installedAt: '2026-09-11' });           // คืนวันเดียวกับที่ถอน
  const results = [{ assetId: 'A1', outcome: 'done' }];
  const priorMoves = [
    { assetId: 'A1', kind: 'return', note: retrievalInput(visit()).note, createdAt: '2026-09-11T03:00:00Z' },
    { assetId: 'A1', kind: 'install', note: null, createdAt: '2026-09-11T05:00:00Z' },
  ];
  const plan = retrievalPlan({ visit: visit(), results, siteAssets: [reinstalled], priorMoves });
  assert.deepEqual(plan.moves, []);
  assert.deepEqual(plan.blocked, []);
  assert.equal(plan.skipped.length, 1);
  assert.match(plan.skipped[0].error, /ติดตั้งคืน/);
});

/* 🐞 รีวิวจับได้ — `commitAssetMove` คงแถวประวัติไว้เมื่อ update ล้มแบบไม่รู้ผล ⇒ ถ้านับแค่
   "มีแถว return ที่มีตรา" การลองใหม่ที่จอบอกให้ทำจะข้ามเครื่องนั้นตลอดไป (ค้างที่ไซต์ถาวร) */
test('🔴 แถว return ค้างจากคำสั่งที่ไม่เกิดจริง (ไม่มีการติดตั้งคืนตามมา) ต้องไม่กันการลองใหม่', () => {
  const stuck = [{ assetId: 'A1', kind: 'return', note: retrievalInput(visit()).note, createdAt: '2026-09-11T03:00:00Z' }];
  assert.equal(retrievedByVisit(stuck, visit()).size, 0);
  const plan = retrievalPlan({ visit: visit(), results: [{ assetId: 'A1', outcome: 'done' }], siteAssets: [asset()], priorMoves: stuck });
  assert.deepEqual(plan.moves.map((m) => m.asset.id), ['A1'], 'ต้องลองถอนใหม่');
  // ติดตั้งคืน *ก่อน* แถว return (ลำดับกลับ) ไม่ใช่การแก้การถอน
  const before = [
    { assetId: 'A1', kind: 'install', createdAt: '2026-09-10T03:00:00Z' },
    ...stuck,
  ];
  assert.equal(retrievedByVisit(before, visit()).size, 0);
});

test('ตราเป็นของนัดใบนั้นเท่านั้น — ถอนด้วยนัดอื่น/มือ ไม่นับว่าใบนี้ถอนแล้ว', () => {
  const results = [{ assetId: 'A1', outcome: 'done' }];
  const other = [
    { assetId: 'A1', kind: 'return', note: retrievalInput(visit({ id: 'SVV9', code: 'SV-9' })).note },
    { assetId: 'A1', kind: 'return', note: null },                    // ผู้จัดคิวกดเองที่หน้าเครื่อง
    { assetId: 'A1', kind: 'install', note: `x ${retrievalMark(visit())}` }, // ไม่ใช่ return
  ];
  assert.equal(retrievedByVisit(other, visit()).size, 0);
  const plan = retrievalPlan({ visit: visit(), results, siteAssets: [asset()], priorMoves: other });
  assert.deepEqual(plan.moves.map((m) => m.asset.id), ['A1']);
  // ตราใช้ id ของนัด (ไม่เปลี่ยน) ไม่ใช่รหัส SV
  assert.match(retrievalInput(visit()).note, /\(SVV1\)/);
  assert.ok(retrievalInput(visit()).note.length <= 1000, 'เพดาน CHECK ของ note');
});

test('โหลดประวัติมาเช็คตราเฉพาะเครื่องที่ผลบอกว่าถอนแล้ว', () => {
  assert.deepEqual(retrievalCandidateIds([
    { assetId: 'A1', outcome: 'done' }, { assetId: 'A2', outcome: 'unable' },
    { assetId: 'A1', outcome: 'done' }, { assetId: null, outcome: 'done' },
  ]), ['A1']);
});

/* 🐞 รีวิวจับได้ — รุ่นแรกแยก "ปิดครั้งแรก = ตีกลับ / บันทึกซ้ำ = ข้าม" ⇒ ใบที่เคยปิดว่าเข้าไม่ได้
   แล้วมาแก้เป็นถอนแล้ว (ยังไม่เคยถอนอะไร) ติดด่านวันที่แบบเงียบ เครื่องค้างที่ไซต์ทั้งที่ใบบอกถอนแล้ว
   ⇒ ตัดสินรายเครื่อง: ยังไม่เคยถอนแล้วติดด่าน = ตีกลับเสมอ */
test('🔴 วันที่ถอนก่อนวันติดตั้ง = ตีกลับทุกครั้ง (ไม่ใช่ข้ามเงียบตอนบันทึกซ้ำ)', () => {
  const late = asset({ installedAt: '2026-10-01' });           // วันติดตั้งเลยวันที่ไปถอนจริง
  const results = [{ assetId: 'A1', outcome: 'done' }];
  const plan = retrievalPlan({ visit: visit(), results, siteAssets: [late] });
  assert.equal(plan.moves.length, 0);
  assert.equal(plan.blocked.length, 1);
  assert.equal(plan.skipped.length, 0);
  assert.match(plan.blocked[0].error, /วันติดตั้ง/);
  assert.match(retrievalBlockedMessage(plan.blocked), /เครื่องล็อบบี้/, 'ต้องบอกว่าเครื่องไหน');
  assert.match(retrievalBlockedMessage(plan.blocked), /ผู้จัดคิว/, 'ต้องบอกว่าใครแก้ได้');
  assert.equal(retrievalBlockedMessage([]), null);
});

test('⭐ ถอน = คำสั่ง "ถอดออกจากไซต์" — เครื่องกลับเป็น "ว่าง" ไม่ใช่ปลดระวาง', () => {
  const [{ asset: a, input }] = retrievalPlan({
    visit: visit(), results: [{ assetId: 'A1', outcome: 'done' }], siteAssets: [asset()],
  }).moves;
  const patch = assetMovePatch(a, 'return', input);
  assert.equal(patch.status, 'in_stock');
  assert.equal(patch.siteId, null, 'CHECK ของ mig 0344: ว่าง ⇒ ต้องไม่มีไซต์');
  assert.equal(patch.zoneId, null);
  assert.equal(patch.removedAt, '2026-09-11', 'วันที่ถอด = วันที่เข้าจริงของนัด');
  assert.notEqual(patch.status, 'removed', 'removed = ปลดระวาง (จบชีวิตเครื่อง) ตั้งแต่ 0332');

  const row = assetMoveRow(a, 'return', input, { fromSite: { name: 'ไซต์ A' } });
  assert.equal(row.kind, 'return');
  assert.equal(row.fromSiteId, 'ST1');
  assert.equal(row.toSiteId, null);
  // CHECK service_asset_moves_needs_reason: return ต้องมีเหตุผล ≥3 ตัวอักษร
  assert.ok(row.reason.trim().length >= 3);
});

test('เหตุผลในประวัติบอกที่มา — รหัสนัด + โน้ตของนัด (เช่น "ลูกค้าไม่ต่อสัญญา")', () => {
  const input = retrievalInput(visit());
  assert.match(input.reason, /SV-26090001/);
  assert.match(input.reason, /ลูกค้าไม่ต่อสัญญาบริการ/);
  assert.equal(input.movedAt, '2026-09-11');
  // ไม่มีโน้ตก็ยังผ่าน CHECK
  assert.ok(retrievalInput(visit({ note: null })).reason.length >= 3);
  // เพดาน 500 ของ CHECK
  assert.ok(retrievalInput(visit({ note: 'ก'.repeat(900) })).reason.length <= 500);
});

/* ══ ด่านที่กันทะเบียนหลุด ═════════════════════════════════════════════ */

test('🔴 เปลี่ยนนัดที่ปิดแล้วเป็น "ถอนเครื่อง" ไม่ได้ — ผลเดิมจะกลายเป็นถอนทั้งไซต์', () => {
  assert.match(retrievalKindSwitchError({ kind: 'refill', status: 'done' }, { kind: 'remove' }), /สร้างนัดถอนเครื่องใบใหม่/);
  assert.match(retrievalKindSwitchError({ kind: 'remove', status: 'partial' }, { kind: 'refill' }), /ไม่ได้/);
  // ยังไม่ปิดและยังไม่มีผล = เปลี่ยนได้ตามปกติ · ชนิดอื่นสลับกันเองได้ · ไม่เปลี่ยน = ผ่าน
  assert.equal(retrievalKindSwitchError({ kind: 'refill', status: 'scheduled' }, { kind: 'remove' }), null);
  assert.equal(retrievalKindSwitchError({ kind: 'refill', status: 'done' }, { kind: 'inspect' }), null);
  assert.equal(retrievalKindSwitchError({ kind: 'remove', status: 'done' }, { kind: 'remove' }), null);
});

/* 🐞 รีวิวจับได้ — เปิดใบกลับเป็น "กำลังทำ" ก่อน (สถานะไม่ใช่ช่องของแผน) แล้วค่อยเปลี่ยนชนิด = ข้ามด่าน */
test('🔴 เปิดใบกลับก่อนแล้วค่อยเปลี่ยนชนิด ก็ข้ามด่านไม่ได้ — ดูผลรายเครื่องที่มีอยู่ด้วย', () => {
  assert.match(retrievalKindSwitchError({ kind: 'refill', status: 'in_progress' }, { kind: 'remove' }, { hasResults: true }), /ไม่ได้/);
  assert.match(retrievalKindSwitchError({ kind: 'remove', status: 'in_progress' }, { kind: 'refill' }, { hasResults: true }), /ไม่ได้/);
});

/* 🐞 รีวิวจับได้ — รุ่นแรกกันแค่ "ไปแล้วเข้าไม่ได้" ⇒ เปลี่ยนเป็นยกเลิกได้ แล้วนัดที่ยกเลิกลบทิ้งได้
   (แถวผลรายเครื่องหายตาม CASCADE ทั้งที่แช่แข็งไว้ว่าลบไม่ได้) */
test('🔴 ถอนออกไปแล้ว ใบต้องปิดเป็น เข้าแล้ว/ทำไม่ครบ ตลอดไป — ห้ามเข้าไม่ได้ · ยกเลิก · เปิดกลับ', () => {
  const results = [{ assetId: 'A1', outcome: 'done' }];
  for (const status of ['unable', 'cancelled', 'in_progress', 'scheduled', 'rescheduled']) {
    assert.match(retrievalStatusLockError(visit({ status }), results, []), /ถอนเครื่องออกจากไซต์ไปแล้ว 1 เครื่อง/, status);
  }
  for (const status of ['done', 'partial']) {
    assert.equal(retrievalStatusLockError(visit({ status }), results, []), null, status);
  }
  // ยังไม่ได้ถอนจริง (เครื่องยังติดตั้งอยู่) = เปลี่ยนสถานะได้ตามปกติ
  assert.equal(retrievalStatusLockError(visit({ status: 'unable' }), results, [asset()]), null);
  assert.equal(retrievalStatusLockError(visit({ kind: 'refill', status: 'cancelled' }), results, []), null);
});

/* ══ ผลรายเครื่องของนัดถอน ════════════════════════════════════════════ */

test('นัดถอนไม่มี "เปลี่ยนเครื่อง" และพูดว่า ถอนแล้ว/ถอนไม่ได้', () => {
  assert.deepEqual(assetOutcomesFor('remove'), ['done', 'unable']);
  assert.deepEqual(assetOutcomesFor('refill'), ASSET_OUTCOMES);
  assert.equal(assetOutcomeLabel('done', 'remove'), 'ถอนแล้ว');
  assert.equal(assetOutcomeLabel('unable', 'remove'), 'ถอนไม่ได้');
  assert.equal(assetOutcomeLabel('done', 'refill'), 'ทำแล้ว');
  assert.equal(assetOutcomeLabel('swapped', 'refill'), 'เปลี่ยนเครื่อง');
});

test('ค่าชนิดนัดถอนชี้ที่เดียวกันทั้งตัวสร้างนัดและตัวถอน', () => {
  assert.equal(REMOVE_VISIT_KIND, 'remove');
  assert.equal(RETRIEVE_VISIT_KIND, REMOVE_VISIT_KIND);
});

/* ══ ผลที่แช่แข็ง — บันทึกซ้ำต้องไม่ลบประวัติ ═══════════════════════════ */

test('🔴 ผลของเครื่องที่ไม่ได้ติดตั้งอยู่ที่ไซต์นี้แล้ว = แช่แข็ง (ถอนออก · ถูกเปลี่ยน · ส่งซ่อม)', () => {
  const before = [
    { id: 'R1', assetId: 'A1', outcome: 'done' },      // ถอนออกแล้ว — ไม่อยู่ใน loadAssets
    { id: 'R2', assetId: 'A2', outcome: 'swapped', replacedByAssetId: 'A9' }, // ปลดระวาง ยังชี้ไซต์
    { id: 'R3', assetId: 'A3', outcome: 'unable' },    // ส่งซ่อมทีหลัง
    { id: 'R4', assetId: 'A4', outcome: 'done' },      // ยังใช้งานอยู่ = แก้ได้
  ];
  const siteAssets = [
    asset({ id: 'A2', status: 'removed' }), asset({ id: 'A3', status: 'repair' }),
    asset({ id: 'A4' }), asset({ id: 'A9' }),
  ];
  assert.deepEqual(frozenResultRows(before, siteAssets).map((r) => r.id), ['R1', 'R2', 'R3']);
});

test('ส่งแถวแช่แข็งกลับมาเหมือนเดิมทุกช่อง = ไม่ใช่การแก้ (ค่าว่างนับเท่ากัน)', () => {
  assert.equal(sameAssetResult({ outcome: 'done', reason: null }, { outcome: 'done', reason: '' }), true);
  assert.equal(sameAssetResult({ outcome: 'done' }, { outcome: 'unable', reason: 'ลูกค้าไม่ให้ถอด' }), false);
  assert.equal(sameAssetResult({ outcome: 'swapped', replacedByAssetId: 'A9' }, { outcome: 'swapped', replacedByAssetId: 'A8' }), false);
});

/* ══ ตัวเขียนกลาง: ลำดับ + ลบประวัติทิ้งเมื่อไม่ได้เขียนจริง ═══════════════ */

function recorder({ updated = true, updateError = null, reread = null } = {}) {
  const calls = [];
  const builder = (table, op, payload) => {
    const filters = [];
    const b = {
      eq: (col, val) => { filters.push([col, val]); return b; },
      select: () => b,
      maybeSingle: () => {
        calls.push({ table, op, payload, filters });
        if (op === 'insert') return Promise.resolve({ data: { id: payload.id, ...payload }, error: null });
        if (op === 'update') {
          return Promise.resolve(updateError
            ? { data: null, error: { message: updateError } }
            : { data: updated ? { id: 'A1', ...payload } : null, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
      then: (resolve) => { calls.push({ table, op, payload, filters }); resolve({ data: null, error: null }); },
    };
    return b;
  };
  const readBack = (table) => {
    const r = {
      eq: () => r,
      maybeSingle: () => {
        calls.push({ table, op: 'select' });
        return Promise.resolve(reread === 'error'
          ? { data: null, error: { message: 'fetch failed' } }
          : { data: reread, error: null });
      },
    };
    return r;
  };
  return {
    calls,
    from: (table) => ({
      insert: (payload) => builder(table, 'insert', payload),
      update: (payload) => builder(table, 'update', payload),
      delete: () => builder(table, 'delete', null),
      select: () => readBack(table),
    }),
  };
}

test('🔑 เขียนประวัติก่อน แล้วค่อยตอกค่าลงเครื่อง (guard สถานะเดิม + ไซต์)', async () => {
  const db = recorder();
  const input = retrievalInput(visit());
  const result = await commitAssetMove(db, {
    asset: asset(), kind: 'return', input, fromSite: { name: 'ไซต์ A' },
    user: { id: 'u-ts', name: 'ช่างต้า' }, guard: { siteId: 'ST1' },
  });
  assert.equal(result.error, undefined);
  assert.deepEqual(db.calls.map((c) => `${c.table}:${c.op}`), ['service_asset_moves:insert', 'service_assets:update']);
  const [ins, upd] = db.calls;
  assert.equal(ins.payload.kind, 'return');
  assert.equal(ins.payload.createdByName, 'ช่างต้า', 'ประวัติต้องบอกว่าใครถอน');
  assert.deepEqual(upd.filters, [['id', 'A1'], ['status', 'active'], ['siteId', 'ST1']]);
  assert.equal(upd.payload.status, 'in_stock');
});

test('ไม่มีแถวถูกเขียน (สถานะเปลี่ยนไประหว่างทาง) = ลบประวัติทิ้ง แล้วตอบ 409', async () => {
  const db = recorder({ updated: false });
  const result = await commitAssetMove(db, { asset: asset(), kind: 'return', input: retrievalInput(visit()) });
  assert.equal(result.status, 409);
  assert.deepEqual(db.calls.map((c) => `${c.table}:${c.op}`),
    ['service_asset_moves:insert', 'service_assets:update', 'service_asset_moves:delete']);
});

/* ⚠️ error ของ update อาจเกิดหลังฐานเขียนไปแล้ว (คำตอบหายระหว่างทาง) — ลบประวัติทิ้ง
   ตอนนั้นได้เครื่องที่ย้ายแล้วแต่ไม่มีประวัติ ซึ่งเงียบสนิท ⇒ ลบเฉพาะเมื่อ **รู้แน่** ว่าไม่ได้เขียน */
test('update ล้ม + อ่านกลับแล้วเครื่องยังเป็นค่าเดิม = รู้แน่ว่าไม่ได้เขียน ⇒ ลบประวัติทิ้ง', async () => {
  const db = recorder({ updateError: 'boom', reread: asset() });
  const result = await commitAssetMove(db, { asset: asset(), kind: 'return', input: retrievalInput(visit()) });
  assert.equal(result.status, 500);
  assert.equal(db.calls.filter((c) => c.op === 'delete').length, 1);
});

test('update ล้ม + อ่านกลับไม่ได้ / เครื่องเปลี่ยนไปแล้ว = ไม่รู้ ⇒ คงประวัติไว้ (ขัดกันที่อ่านออก ดีกว่าย้ายเงียบ)', async () => {
  for (const reread of ['error', asset({ status: 'in_stock', siteId: null, zoneId: null, removedAt: '2026-09-11' })]) {
    const db = recorder({ updateError: 'boom', reread });
    const result = await commitAssetMove(db, { asset: asset(), kind: 'return', input: retrievalInput(visit()) });
    assert.equal(result.status, 500);
    assert.equal(db.calls.filter((c) => c.op === 'delete').length, 0, JSON.stringify(reread));
  }
});

/* ══ ประวัติของเครื่องหลังถอน ══════════════════════════════════════════ */

test('🐞 เครื่องเก่าที่ถูกถอน: วันติดตั้งเดิมยังอยู่ในประวัติ (ของเดิมหายทันทีที่มี move)', () => {
  const retrieved = asset({ status: 'in_stock', siteId: null, installedAt: '2025-03-01', removedAt: '2026-09-11' });
  const moves = [{ id: 'M1', kind: 'return', movedAt: '2026-09-11', fromSiteName: 'ไซต์ A', reason: 'ถอนตามนัด SV-1' }];
  const rows = assetTimeline({ asset: retrieved, moves });
  assert.ok(rows.some((r) => r.kind === 'installed'), 'วันติดตั้งเดิมไม่มี move เล่าแทน ต้องยังอยู่');
  assert.ok(!rows.some((r) => r.kind === 'removed'), 'วันถอดมี move "ถอดออกจากไซต์" เล่าแล้ว ห้ามขึ้นซ้ำ');
  // ติดตั้งผ่านคำสั่งแล้ว ⇒ แถวติดตั้งแบบเก่าไม่ต้องขึ้นซ้ำ
  const installed = assetTimeline({
    asset: asset({ installedAt: '2026-09-12' }),
    moves: [{ id: 'M2', kind: 'install', movedAt: '2026-09-12', toSiteName: 'ไซต์ B' }],
  });
  assert.ok(!installed.some((r) => r.kind === 'installed'));
});

test('ผลของนัดถอนบนประวัติเครื่องพูดว่า "ถอนแล้ว"', () => {
  const rows = assetTimeline({
    asset: asset({ status: 'in_stock', siteId: null }),
    results: [{ id: 'R1', visitId: 'SVV1', assetId: 'A1', outcome: 'done' }],
    visits: [visit()],
  });
  assert.equal(rows.find((r) => r.key === 'R1').label, 'ถอนแล้ว');
});

test('🐞 ใบส่งงานของนัดถอน: เครื่องที่ถอนแล้ว (ไม่มีไซต์) ยังอยู่บนใบ เมื่อหน้าส่ง resultAssets มาด้วย', () => {
  const retrieved = asset({ status: 'in_stock', siteId: null, zoneId: null });
  const report = buildVisitReport({
    visit: visit(), site: { name: 'ไซต์ A' }, zones: [], assets: [retrieved],
    results: [{ assetId: 'A1', outcome: 'done' }], items: [], zoneGates: [],
  });
  assert.equal(report.lines.length, 1);
  assert.equal(report.lines[0].outcomeLabel, 'ถอนแล้ว');
});

/* ══ ยามซอร์ส ═══════════════════════════════════════════════════════════ */

test('🔑 route ปิดนัด: ตรวจก่อนเขียนใบ · ถอนหลังเขียนใบ · ผ่านตัวเขียนกลางพร้อม guard ไซต์', () => {
  const route = code('../../app/api/service/visits/[id]/route.js');
  const switchAt = route.indexOf('retrievalKindSwitchError(before, value, { hasResults');
  const planAt = route.indexOf('retrievalPlan({');
  const blockedAt = route.indexOf('retrievalBlockedMessage(retrieval.blocked)');
  const updateAt = route.indexOf('.update({ ...patch, updatedAt: nowIso })');
  const commitAt = route.indexOf('commitAssetMove(supabase, {');
  assert.ok(switchAt > 0 && planAt > switchAt && blockedAt > planAt, 'ด่านต้องมาก่อน');
  assert.ok(updateAt > blockedAt, 'ตีกลับเครื่องที่ติดด่านก่อนเขียนใบ ไม่ใช่ปิดใบแล้วค่อยบอก');
  assert.ok(commitAt > updateAt, 'ถอนหลังเขียนใบสำเร็จเท่านั้น');
  assert.match(route, /kind: 'return', input, fromSite: retrievalFromSite, user, guard: \{ siteId: data\.siteId \}/);
  assert.match(route, /retrievalStatusLockError\(nextVisit/);
  // บันทึกซ้ำใช้วันที่เข้าจริงเดิม — ช่างเลื่อนวันเพื่อข้ามด่านวันที่ไม่ได้
  assert.match(route, /isClosedVisit\(before\) && before\.actualDate\s*\? \{ \.\.\.nextVisit, actualDate: before\.actualDate \}/);
  // โหลดไซต์ก่อนเขียนใบ ไม่ใช่หลัง
  assert.ok(route.indexOf('retrievalFromSite = await findSite') < updateAt);
  // ตราประจำนัด: ต้องโหลดประวัติ return มาส่งให้แผน ไม่งั้นติดตั้งคืนแล้วโดนถอนทับ
  assert.match(route, /retrievalCandidateIds\(retrievalRows/);
  assert.match(route, /priorMoves: priorMoves \|\| \[\]/);
});

test('🔴 PUT ผลรายเครื่อง: ไม่ลบทั้งใบอีก · แช่แข็งผลของเครื่องที่ออกไปแล้ว · เปลี่ยนเครื่องเฉพาะแถวใหม่', () => {
  const route = code('../../app/api/service/visits/[id]/assets/route.js');
  assert.doesNotMatch(route, /\.delete\(\)\.eq\('visitId', id\);/, 'ลบทั้งใบ = ผลของเครื่องที่ถอนแล้วหาย');
  assert.match(route, /frozenResultRows\(before, siteAssets\)/);
  assert.match(route, /\.in\('id', editableIds\.slice/);
  assert.match(route, /const swaps = incoming\.filter/);
  assert.match(route, /visit\.kind === REMOVE_VISIT_KIND && values\.some\(\(v\) => v\.outcome === 'swapped'\)/);
  // นัดถอนรับเครื่องที่ติดตั้งหลังวันที่ของนัดไม่ได้ — ตัดสินด้วยวันติดตั้ง ไม่ใช่ "เคยมีผลไหม"
  // (รุ่นนั้นทำให้นัดที่ปิดว่าเข้าไม่ได้ กลับไปบันทึกการถอนทีหลังไม่ได้เลย — UAT จับได้)
  assert.match(route, /visit\.kind === REMOVE_VISIT_KIND && visit\.actualDate/);
  assert.match(route, /String\(a\.installedAt\) > String\(visit\.actualDate\)/);
  assert.match(route, /v\.outcome === 'done' && !inVisit\.has\(v\.assetId\)/);
});

test('🔴 ช่างเลื่อนวันที่เข้าจริงของนัดถอนที่ปิดแล้วไม่ได้ (วันนี้ตัดสินว่าเครื่องไหนอยู่ตอนไปถอน)', () => {
  const route = code('../../app/api/service/visits/[id]/route.js');
  assert.match(route, /access\.ownWorkOnly && before\.kind === REMOVE_VISIT_KIND && isClosedVisit\(before\)/);
  assert.match(route, /String\(value\.actualDate \?\? ''\) !== String\(before\.actualDate \?\? ''\)/);
});

test('ทั้งสองเส้นของนัดไม่ใช้สิทธิ์แก้ทะเบียน — ช่างถอนได้เพราะเป็นนัดของเขา ไม่ใช่เพราะมีสิทธิ์ย้ายเครื่อง', () => {
  for (const url of ['../../app/api/service/visits/[id]/route.js', '../../app/api/service/visits/[id]/assets/route.js']) {
    assert.doesNotMatch(code(url), /canEditService/, url);
  }
});

test('🔑 แถวประวัติของเครื่องเกิดจากตัวเขียนกลางที่เดียว', () => {
  const moves = code('../../app/api/service/assets/[id]/moves/route.js');
  assert.match(moves, /commitAssetMove\(supabase, \{/);
  assert.doesNotMatch(moves, /from\('service_asset_moves'\)/, 'route เขียนตรงเมื่อไร สองทางจะเพี้ยนหากัน');
});

test('แผ่นปิดงาน: ตัวเลือกตามชนิดนัด · สรุปสถานะนับผลที่แช่แข็ง · บอก server ให้สรุปจากฐาน', () => {
  const sheet = code('../../components/service/CloseVisitSheet.js');
  // นัดถอนที่ปิดแล้วถามเฉพาะเครื่องที่อยู่ตอนวันที่ของนัด + เครื่องที่มีผลในนัดอยู่แล้ว (ต้องโชว์เสมอ
  // ไม่งั้น PUT เขียนทับทั้งชุดลบผลของมันทิ้ง) · ถามจากชุดที่กางจริง ไม่ใช่ทุกเครื่องของไซต์
  assert.match(sheet, /const belongs = \(a\) => seededIds\.has\(a\.id\) \|\| !a\.installedAt/);
  assert.match(sheet, /\(!closedRemove \|\| belongs\(a\)\)/);
  assert.match(sheet, /pendingAssets\(activeAssets, resultRows\)/);
  // บันทึกผลสำเร็จแต่ปิดใบล้ม ⇒ โหลดใหม่ ไม่ปล่อยแถวที่แช่แข็งแล้วให้แก้ต่อ
  assert.match(sheet, /if \(resultsSaved\) setReloadKey/);
  assert.match(sheet, /assetOutcomesFor\(visit\.kind\)/);
  assert.match(sheet, /deriveVisitStatus\(\[\.\.\.resultRows, \.\.\.frozenRows\]\)/);
  assert.match(sheet, /closeFromAssets: \(activeAssets\.length > 0 \|\| frozenRows\.length > 0\) && !unable/);
  assert.match(sheet, /setResultAssets\(/);
});

test('ใบส่งงานรวมเครื่องที่ย้ายออกไปแล้ว · GET แยกคีย์ resultAssets ไม่รวมเข้า assets', () => {
  const page = code('../../app/service/visits/[id]/page.js');
  assert.match(page, /assets: \[\.\.\.\(data\.assets \|\| \[\]\), \.\.\.\(data\.resultAssets \|\| \[\]\)\]/);
  const route = code('../../app/api/service/visits/[id]/route.js');
  assert.match(route, /visit: access\.visit, items, assets, zones, results, resultAssets,/);
});
