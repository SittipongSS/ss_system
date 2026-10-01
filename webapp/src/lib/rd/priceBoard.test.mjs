// ม-153 · หน้า "รอใส่ราคา" ของ RD (มติผู้ใช้ 2026-10-01)
//   *"ขั้นแจ้งราคา F/FB อยากให้รวมตาราง … ให้ RD ได้เห็นว่าต้องไปใส่ราคาต่อ"*
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  awaitingPriceCount, awaitingPriceItems, compareBoardRows, priceBoardGroups, priceBoardRows, priceBoardTotals,
  waitingDays,
} from './priceBoard.js';
import { rowsSlotPricesLive } from '../master/scentFormulaAdmin.js';

const TODAY = '2026-10-01';

// แถวที่ลูกค้าคอนเฟิร์มแล้ว — เท่าที่ `rowStage` ต้องใช้
const confirmed = (over = {}) => ({
  id: 'IT-1', requestId: 'RQ-1', lineKind: 'product_dev', label: 'EDP กลิ่น A → PF1', sortOrder: 0,
  ackAt: '2026-09-01', readyAt: '2026-09-02', pickedUpAt: '2026-09-03', sentAt: '2026-09-04',
  outcome: 'confirmed', outcomeAt: '2026-09-23', confirmedQty: 3, unit: 'ชิ้น', answerStatus: 'pending',
  producedFormulaId: 'FML-1',
  ...over,
});
const request = (over = {}) => ({
  id: 'RQ-1', docNo: 'RQ-FD-26090093', dept: 'RD', status: 'acknowledged', kind: 'formula_dev',
  customerName: 'บริษัท ก', items: [confirmed()], ...over,
});

test('🔴 ตัวกรองแถว = ด่านเดียวกับ POST ใส่ราคา (ใบเปิดอยู่ + canPriceRow + ฝ่าย RD)', () => {
  const reqs = [
    request(),
    // ใบที่ยกเลิก/ปิดไปแล้วยังมีแถวคอนเฟิร์มค้างได้จริง — กดแล้ว 409 ⇒ ต้องไม่ขึ้นบนหน้า
    request({ id: 'RQ-2', status: 'cancelled', items: [confirmed({ id: 'IT-2', requestId: 'RQ-2' })] }),
    request({ id: 'RQ-3', status: 'answered', items: [confirmed({ id: 'IT-3', requestId: 'RQ-3' })] }),
    // ฝ่ายอื่นไม่ใช่งานของ RD
    request({ id: 'RQ-4', dept: 'PC', items: [confirmed({ id: 'IT-4', requestId: 'RQ-4' })] }),
    request({
      id: 'RQ-5',
      items: [
        confirmed({ id: 'IT-5a', requestId: 'RQ-5', answerStatus: 'done' }),     // ใส่ราคาแล้ว
        confirmed({ id: 'IT-5b', requestId: 'RQ-5', outcome: 'rejected' }),      // ลูกค้าไม่เอา
        confirmed({ id: 'IT-5c', requestId: 'RQ-5', outcome: null }),            // ยังรอลูกค้าตอบ
        confirmed({ id: 'IT-5d', requestId: 'RQ-5' }),                           // รอราคา ✓
      ],
    }),
  ];
  assert.deepEqual(awaitingPriceItems(reqs).map((p) => p.item.id), ['IT-1', 'IT-5d']);
  // ป้ายตัวเลขบนเมนูนับด้วยตัวเดียวกัน — หน่วยเป็นรายการ ไม่ใช่ใบ
  assert.equal(awaitingPriceCount(reqs), 2);
  assert.equal(awaitingPriceCount([]), 0);
  assert.equal(awaitingPriceCount(null), 0);
});

const ready = (key, unitPrice) => ({
  key, short: key, text: `ราคา ${key}`, kind: `RM_${key}`, source: { id: 'FML-1', code: 'PF1', name: 'สูตร A' },
  price: { state: 'ready', unitPrice, revisionId: `REV-${key}`, revisionNo: 2, validThrough: '2026-12-15' },
});
const liveCtx = (over = {}) => ({
  slots: [{ key: 'F' }, { key: 'B' }, { key: 'FB' }],
  formula: { id: 'FML-1', code: 'PF1', name: 'สูตร A', categoryCode: '01-002' },
  scent: null,
  current: [{ key: 'F', price: null }, { key: 'B', price: null }, ready('FB', 436)],
  ...over,
});

test('แถวพกบริบทของใบ + ป้ายตัดหางรหัส + ของในทะเบียน + "ใช้ราคานี้" ที่ server ตัดสินแล้ว', () => {
  const [row] = priceBoardRows(awaitingPriceItems([request()]), [liveCtx()]);
  assert.equal(row.docNo, 'RQ-FD-26090093');
  assert.equal(row.customerName, 'บริษัท ก');
  assert.equal(row.label, 'EDP กลิ่น A', 'ป้ายพัฒนาสูตรตัดหาง "→ รหัส" เหมือนหัวโมดัลบนหน้าใบ');
  assert.equal(row.name, 'PF1 สูตร A', 'บรรทัดหลัก = ของในทะเบียน');
  assert.deepEqual(row.registry, { kind: 'formula', id: 'FML-1', code: 'PF1', name: 'สูตร A', categoryCode: '01-002' });
  assert.equal(row.confirmedAt, '2026-09-23');
  assert.equal(row.useCurrent.key, 'FB');
  assert.equal(row.useCurrent.revisionId, 'REV-FB', 'POST เทียบ rev นี้กับตัวล่าสุดก่อนผูก');
  assert.equal(row.useCurrentBlocker, '');
  assert.equal(row.priceBlocker, '');
});

test('ไม่มีราคาในทะเบียน = ไม่มีปุ่มใช้ราคา · หมดอายุ = มีปุ่มแต่บอกเหตุ · ไม่มีช่อง = ใส่ราคาไม่ได้พร้อมเหตุ', () => {
  const pairs = awaitingPriceItems([request()]);
  const [none] = priceBoardRows(pairs, [liveCtx({ current: [{ key: 'FB', price: null }] })]);
  assert.equal(none.useCurrent, null);
  const expired = liveCtx({ current: [{ ...ready('FB', 436), price: { ...ready('FB', 436).price, state: 'expired' } }] });
  const [old] = priceBoardRows(pairs, [expired]);
  assert.equal(old.useCurrent.key, 'FB');
  assert.match(old.useCurrentBlocker, /หมดอายุ/);
  // ไม่รู้ช่องสด (ไม่มี live) = ไม่มีช่อง ⇒ ปุ่มใส่ราคาบอกเหตุแทน 400 จาก server
  const [blind] = priceBoardRows(pairs, []);
  assert.match(blind.priceBlocker, /ยังไม่ผูกกลิ่นหรือสูตร/);
  assert.equal(blind.useCurrent, null);
});

test('แถวกลิ่นล้วน: ของในทะเบียน = กลิ่นของช่อง F', () => {
  const pairs = awaitingPriceItems([request({ items: [confirmed({ lineKind: 'scent_dev', label: 'Rose', producedFormulaId: null, producedScentId: 'SCT-1' })] })]);
  const [row] = priceBoardRows(pairs, [{
    slots: [{ key: 'F' }], formula: null, scent: null,
    current: [{ key: 'F', price: null, source: { id: 'SCT-1', code: 'SC-1', name: 'Rose' } }],
  }]);
  assert.equal(row.label, 'Rose');
  assert.deepEqual(row.registry, { kind: 'scent', id: 'SCT-1', code: 'SC-1', name: 'Rose', categoryCode: null });
});

test('จัดกลุ่มตามใบ — ใบที่รอนานสุดขึ้นก่อน · ในใบเรียงวันคอนเฟิร์ม · ยอดรวมนับเป็นรายการ', () => {
  const reqs = [
    request({
      id: 'RQ-B', docNo: 'RQ-FD-B',
      items: [
        confirmed({ id: 'B2', requestId: 'RQ-B', outcomeAt: '2026-09-25', sortOrder: 1 }),
        confirmed({ id: 'B1', requestId: 'RQ-B', outcomeAt: '2026-09-23', sortOrder: 2 }),
      ],
    }),
    request({ id: 'RQ-A', docNo: 'RQ-FD-A', items: [confirmed({ id: 'A1', requestId: 'RQ-A', outcomeAt: '2026-09-02' })] }),
  ];
  const pairs = awaitingPriceItems(reqs);
  const rows = priceBoardRows(pairs, pairs.map(() => liveCtx()));
  const groups = priceBoardGroups(rows, { todayIso: TODAY });
  assert.deepEqual(groups.map((g) => g.docNo), ['RQ-FD-A', 'RQ-FD-B']);
  assert.deepEqual(groups[1].rows.map((r) => r.itemId), ['B1', 'B2']);
  assert.equal(groups[0].maxDays, 29);
  assert.equal(groups[1].total, 2);
  const totals = priceBoardTotals(rows, { todayIso: TODAY });
  assert.deepEqual(totals, { rows: 3, requests: 2, maxDays: 29, usable: 3 });
});

test('วันรอ: นับจากวันที่ลูกค้าคอนเฟิร์ม · ไม่มีวัน = null (ไม่ใช่ 0) · วันอนาคตไม่ติดลบ', () => {
  assert.equal(waitingDays({ confirmedAt: '2026-09-02' }, TODAY), 29);
  assert.equal(waitingDays({ confirmedAt: null }, TODAY), null);
  assert.equal(waitingDays({ confirmedAt: '2026-10-05' }, TODAY), 0);
  // ไม่มีวันไปท้ายกลุ่ม · ลำดับนิ่งเมื่อค่าเท่ากัน
  const rows = [{ itemId: 'b', confirmedAt: null, sortOrder: 0 }, { itemId: 'a', confirmedAt: '2026-09-01', sortOrder: 0 }];
  assert.deepEqual([...rows].sort(compareBoardRows).map((r) => r.itemId), ['a', 'b']);
});

/* ── ตัวอ่านราคาสดจากทะเบียน (`rowsSlotPricesLive`) — fake ที่ **กรองจริง** ตาม eq/in
   (บทเรียน ม-148: fake ที่ไม่กรองทำให้ B กับ FB ของสูตรเดียวกันปนกันในเทสต์) ── */
function fakeSupabase(tables) {
  return {
    from(table) {
      const filters = [];
      const rows = () => (tables[table] || []).filter((r) => filters.every((f) => f(r)));
      const c = {
        select: () => c,
        eq: (col, val) => { filters.push((r) => r[col] === val); return c; },
        in: (col, vals) => { filters.push((r) => vals.includes(r[col])); return c; },
        is: (col, val) => { filters.push((r) => (r[col] ?? null) === val); return c; },
        order: () => c,
        maybeSingle: async () => ({ data: rows()[0] || null, error: null }),
        then: (resolve) => resolve({ data: rows(), error: null }),
      };
      return c;
    },
  };
}

test('ราคาสด: แต่ละช่องอ่านวัสดุของชนิดตัวเอง · ช่อง F ของสูตรไปอ่านที่กลิ่นของสูตร · rev ล่าสุด + id ติดมา', async () => {
  const supabase = fakeSupabase({
    formulas: [{ id: 'FML-1', code: 'PF1', name: 'สูตร A', scentId: 'SCT-1', categoryCode: '01-002' }],
    scents: [{ id: 'SCT-1', code: 'SC-1', name: 'Rose', status: 'active' }],
    material_prices: [
      { id: 'M-FB', kind: 'RM_FB', label: 'สูตร A', formulaId: 'FML-1', status: 'active' },
      { id: 'M-F', kind: 'RM_F', label: 'Rose', scentId: 'SCT-1', status: 'active' },
    ],
    material_price_revisions: [
      { id: 'R-FB-1', materialId: 'M-FB', revisionNo: 1, unitBasis: 'per_kg', quotedAt: '2026-09-16T03:00:00Z', validUntil: null },
      { id: 'R-FB-2', materialId: 'M-FB', revisionNo: 2, unitBasis: 'per_kg', quotedAt: '2026-09-18T03:00:00Z', validUntil: '2026-12-15' },
      { id: 'R-F-1', materialId: 'M-F', revisionNo: 1, unitBasis: 'per_kg', quotedAt: '2026-01-01T03:00:00Z', validUntil: '2026-03-31' },
    ],
    material_price_revision_tiers: [
      { revisionId: 'R-FB-1', qty: null, pricePerKg: 400, pricePerUnit: null },
      { revisionId: 'R-FB-2', qty: null, pricePerKg: 436, pricePerUnit: null },
      { revisionId: 'R-F-1', qty: null, pricePerKg: 2800, pricePerUnit: null },
    ],
  });
  const [ctx] = await rowsSlotPricesLive(supabase, [confirmed()], { today: TODAY });
  assert.deepEqual(ctx.slots.map((s) => s.key), ['F', 'B', 'FB']);
  const by = Object.fromEntries(ctx.current.map((c) => [c.key, c]));
  assert.equal(by.FB.price.unitPrice, 436);
  assert.equal(by.FB.price.revisionId, 'R-FB-2', 'rev ล่าสุด ไม่ใช่ตัวแรกที่เจอ');
  assert.equal(by.FB.price.state, 'ready');
  assert.equal(by.FB.price.validThrough, '2026-12-15');
  assert.equal(by.B.price, null, 'B ยังไม่เคยผูกวัสดุ — ไม่ปนกับ FB ของสูตรเดียวกัน');
  assert.equal(by.F.price.state, 'expired');
  assert.equal(by.F.source.name, 'Rose', 'ช่อง F ลงกลิ่นของสูตร');
  assert.equal(by.FB.source.code, 'PF1');
});

test('ราคาสด: แถวกลิ่นล้วนโหลดกลิ่นมาเอง (ชื่อใช้เลือกวัสดุ + โชว์บนจอ)', async () => {
  const supabase = fakeSupabase({
    scents: [{ id: 'SCT-9', code: 'SC-9', name: 'Lily', status: 'active' }],
    material_prices: [], material_price_revisions: [], material_price_revision_tiers: [],
  });
  const [ctx] = await rowsSlotPricesLive(supabase, [confirmed({ lineKind: 'scent_dev', producedFormulaId: null, producedScentId: 'SCT-9' })], { today: TODAY });
  assert.deepEqual(ctx.current.map((c) => c.key), ['F']);
  assert.equal(ctx.current[0].source.name, 'Lily');
  assert.equal(ctx.current[0].price, null);
});

/* ── การเดินสาย (ด่านซอร์ส) — สามที่ต้องพูดตรงกัน: หน้า · ป้ายเมนู · POST ── */
const src = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('🔴 เส้นหน้า: อ่านอย่างเดียว · ด่าน canAccessRd · ตัวโหลดเดิมกรองใบเปิด · ประกอบแถวที่ lib', () => {
  const route = src('../../app/api/rd/price-board/route.js');
  assert.match(route, /export const GET/);
  assert.doesNotMatch(route, /export const (POST|PATCH|PUT|DELETE)/);
  assert.match(route, /if \(!canAccessRd\(user\)\) return forbidden/);
  assert.match(route, /loadRequests\(supabase, \{ dept: DEPT, status: REQUEST_OPEN_STATUSES \}\)/);
  assert.match(route, /priceBoardRows\(pairs, live\)/);
});

test('🔴 ป้ายเมนูนับด้วยตัวเดียวกับหน้า และใช้โหลดของฝ่ายร่วมกับคิว (ไม่อ่านประวัติ RD สองรอบ)', () => {
  const route = src('../../app/api/nav/counts/route.js');
  assert.match(route, /attempt\('rdPricing', async \(\) => awaitingPriceCount\(await loadDept\(dept\)\)\)/);
  assert.match(route, /deptRequestsTodoCount\(await loadDept\(dept\), dept\)/);
  assert.equal((route.match(/loadRequests\(supabase, \{ dept, lean: true \}\)/g) || []).length, 1);
});

test('🔴 POST "ใช้ราคานี้": ผ่านด่านเดิมทั้งชุดก่อน · ตัวตัดสินเดียวกับหน้า · เทียบ rev ที่จอเห็น · จบแถวแบบเดียวกับใส่ราคา', () => {
  const route = src('../../app/api/sa/requests/[id]/items/[itemId]/price/route.js');
  const branch = route.indexOf('if (body?.useCurrent)');
  assert.ok(branch > 0);
  for (const gate of ['canAnswerRequest(user, before)', 'REQUEST_OPEN_STATUSES.includes(before.status)', 'canPriceRow(row)']) {
    assert.ok(route.indexOf(gate) > 0 && route.indexOf(gate) < branch, `ด่าน ${gate} ต้องมาก่อนทาง useCurrent`);
  }
  assert.match(route, /currentPriceToUse\(live\?\.current \|\| \[\]\)/);
  assert.match(route, /expected !== entry\.price\.revisionId/);
  // ทั้งสองทางจบแถวด้วยตัวเดียวกัน (ตราปิดฝั่ง + actorSide) — ไม่มีก้อน update ซ้ำ
  assert.equal((route.match(/await settleRow\(supabase,/g) || []).length, 2);
  assert.equal((route.match(/from\('dept_request_items'\)\.update/g) || []).length, 1);
  // ไม่แตะทะเบียนวัสดุ — rev เป็น immutable
  const useFn = route.slice(route.indexOf('async function linkCurrentPrice'));
  assert.doesNotMatch(useFn, /priceRegistrySlots|appendMaterialRevision|material_prices/);
});

test('หน้าจอ: ด่านปุ่ม = canAnswerRequest ตัวเดียวกับ API · ส่ง rev ที่เห็นไปกับ "ใช้ราคานี้" · โมดัลกลางตัวเดิม', () => {
  const page = src('../../app/rd/prices/page.js');
  assert.match(page, /canAnswerRequest\(\{ \.\.\.me, department \}, \{ dept: "RD" \}\)/);
  assert.match(page, /json: \{ useCurrent: \{ revisionId: use\.revisionId \} \}/);
  assert.match(page, /<RegistryPriceModal/);
  assert.match(page, /confirmAction\(/, 'ปิดงานต้องมีกล่องยืนยันบอกผล');
});
