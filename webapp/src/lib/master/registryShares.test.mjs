// ── ม-150 · แชร์กลิ่น/สูตรให้ลูกค้ารายอื่น (มติผู้ใช้ 2026-09-22) ─────────────────────────────
//
// ล็อกกติกา:
//   1) เจ้าของยังมีรายเดียว · ลูกค้าที่ได้รับแชร์ "ใช้ได้เหมือนเป็นของตัวเอง" — ทุกด่าน "ของลูกค้ารายนี้ไหม" ยอมรับ
//      (สายพันธุ์กลิ่น/สูตร · สูตรใช้กลิ่น · PDR · NPD · บรรทัดพัฒนาสูตร · ปิดบรีฟแบบผูกกลิ่น)
//   2) ลูกค้าที่ไม่ได้รับแชร์ยังถูกกันเหมือนเดิม (มติ 9 ยังอยู่สำหรับคนนอก)
//   3) ตั้งรายชื่อแชร์: ตัดเจ้าของ · ลูกค้าต้องมีจริง · เลิกแชร์คนที่ใช้อยู่ไม่ได้ · RD + หัวหน้าฝ่ายขาย Sup ขึ้นไป (มติ 05/10)
//   4) ส่งงานผูกสูตรของลูกค้าอื่น = แชร์ให้อัตโนมัติ · รอบแก้ทับสูตรของลูกค้าอื่นไม่ได้
//   5) ช่อง "ลูกค้าอื่นที่ใช้ได้" ในฟอร์มสร้าง/แก้ (มติ 05/10) — ตรวจก่อนเขียนตัวกลิ่น/สูตร · ไม่มีสิทธิ์ = ไม่ส่งคีย์
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  canManageRegistryShares, diffShares, formulaUsableByCustomer, normalizeShareInput, requestedShareIds,
  scentUsableByCustomer, shareChangeSummary, unshareError,
} from './registryShares.js';
import { derivedFromError, scentFormPayload } from './scents.js';
import { derivedFromFormulaError, formulaFormPayload, formulaScentCustomerError } from './formulas.js';
import { pdrTargetScentError } from '../requests/pdrTargets.js';
import { npdWorkRowsScentError } from '../requests/npdWorkRows.js';
import { attachShares, planRegistryShares, saveRegistryShares } from './registrySharesAdmin.js';
import { formulaDeliveryPreview, planFormulaDelivery } from '../requests/formulaRework.js';

const read = (rel) => readFileSync(rel, 'utf8');
const scentA = { id: 'S-A', code: 'PF-A', name: 'กลิ่น A', status: 'active', customerId: 'CUS-A', sharedCustomerIds: ['CUS-B'] };
const formulaA = { id: 'F-A', code: 'PF-A-P1', name: 'สูตร A', status: 'active', customerId: 'CUS-A', sharedCustomerIds: ['CUS-B'] };

test('ใช้ได้ = เจ้าของ หรือได้รับแชร์ · สูตรฐานใช้ได้ทุกลูกค้า · ไม่ติดรายชื่อ = ไม่ได้แชร์', () => {
  assert.equal(scentUsableByCustomer(scentA, 'CUS-A'), true);
  assert.equal(scentUsableByCustomer(scentA, 'CUS-B'), true);
  assert.equal(scentUsableByCustomer(scentA, 'CUS-C'), false);
  assert.equal(scentUsableByCustomer({ ...scentA, sharedCustomerIds: undefined }, 'CUS-B'), false);
  assert.equal(scentUsableByCustomer(null, 'CUS-A'), false);
  assert.equal(formulaUsableByCustomer(formulaA, 'CUS-B'), true);
  assert.equal(formulaUsableByCustomer(formulaA, 'CUS-C'), false);
  assert.equal(formulaUsableByCustomer({ id: 'F0', customerId: null }, 'CUS-C'), true);
});

test('ด่านสายพันธุ์/สูตรใช้กลิ่น ยอมรับของที่แชร์มา · คนนอกยังโดนกัน', () => {
  assert.equal(derivedFromError(scentA, { customerId: 'CUS-B' }), null);
  assert.match(derivedFromError(scentA, { customerId: 'CUS-C' }), /ลูกค้าคนละราย/);
  assert.equal(formulaScentCustomerError(scentA, { customerId: 'CUS-B' }), null);
  assert.match(formulaScentCustomerError(scentA, { customerId: 'CUS-C' }), /ลูกค้าคนละราย/);
  assert.match(formulaScentCustomerError(scentA, { customerId: null }), /สูตรฐาน/);
  assert.equal(derivedFromFormulaError(formulaA, { customerId: 'CUS-B' }), null);
  assert.match(derivedFromFormulaError(formulaA, { customerId: 'CUS-C' }), /ลูกค้าคนละราย/);
});

test('ด่านคำร้อง: PDR · NPD ยอมรับกลิ่นที่แชร์ให้ลูกค้าของใบ', () => {
  const rows = [{ scentId: 'S-A' }];
  assert.equal(pdrTargetScentError(rows, [scentA], { customerId: 'CUS-B' }), null);
  assert.match(pdrTargetScentError(rows, [scentA], { customerId: 'CUS-C' }), /ลูกค้ารายอื่น/);
  const plan = { insert: [{ scentId: 'S-A', categoryCode: '01-002' }] };
  const targets = [{ scentId: 'S-A', categoryCode: '01-002' }];
  assert.equal(npdWorkRowsScentError(plan, targets, [scentA], { customerId: 'CUS-B' }), null);
  assert.match(npdWorkRowsScentError(plan, targets, [scentA], { customerId: 'CUS-C' }), /ลูกค้ารายอื่น/);
});

test('รายชื่อแชร์: ตัดซ้ำ/ช่องว่าง/เจ้าของ · สูตรฐานแชร์ไม่ได้ · diff · ด่านเลิกแชร์คนที่ใช้อยู่', () => {
  assert.deepEqual(normalizeShareInput([' CUS-B ', 'CUS-B', '', 'CUS-A', 'CUS-C'], { ownerId: 'CUS-A' }).customerIds, ['CUS-B', 'CUS-C']);
  assert.match(normalizeShareInput('CUS-B', { ownerId: 'CUS-A' }).error, /ไม่ถูกต้อง/);
  assert.match(normalizeShareInput(['CUS-B'], { ownerId: null, kind: 'formula' }).error, /สูตรฐาน/);
  // ฟอร์มสร้าง/แก้สูตรฐานส่ง [] มาทุกครั้ง — ต้องผ่าน ไม่งั้นสร้างสูตรฐานจากฟอร์มไม่ได้อีกเลย
  assert.deepEqual(normalizeShareInput([], { ownerId: null, kind: 'formula' }), { customerIds: [], error: null });
  assert.deepEqual(normalizeShareInput(['', ' '], { ownerId: null, kind: 'formula' }), { customerIds: [], error: null });
  assert.deepEqual(diffShares(['CUS-B', 'CUS-C'], ['CUS-C', 'CUS-D']), { add: ['CUS-D'], remove: ['CUS-B'] });
  assert.equal(unshareError(['CUS-B'], { 'CUS-B': { formulas: 0, requests: 0, products: 0 } }), null);
  assert.match(unshareError(['CUS-B'], { 'CUS-B': { formulas: 1, requests: 2 } }, () => 'บริษัท บี'),
    /เลิกแชร์ บริษัท บี ไม่ได้ — ลูกค้ารายนี้ใช้อยู่ \(สูตร 1 ตัว · คำร้อง 2 ใบ\)/);
});

// ── fake supabase สำหรับตัวอ่าน/เขียนตารางแชร์ ────────────────────────────────────
function fake(tables) {
  const log = [];
  const from = (table) => {
    const filters = [];
    let op = 'select'; let payload = null; let window = null; let limit = null;
    const chain = {
      select() { return chain; },
      insert(rows) { op = 'insert'; payload = Array.isArray(rows) ? rows : [rows]; return chain; },
      upsert(rows) { op = 'insert'; payload = Array.isArray(rows) ? rows : [rows]; return chain; },
      maybeSingle() { op = 'single'; return chain; },
      delete() { op = 'delete'; return chain; },
      eq(c, v) { filters.push((r) => r[c] === v); return chain; },
      in(c, vs) { filters.push((r) => vs.includes(r[c])); return chain; },
      order() { return chain; },
      range(a, b) { window = [a, b + 1]; return chain; },
      limit(n) { limit = n; return chain; },
      then(resolve, reject) {
        const rows = tables[table] || (tables[table] = []);
        if (op === 'insert') { rows.push(...payload); log.push(['insert', table, payload]); return Promise.resolve({ data: payload, error: null }).then(resolve, reject); }
        if (op === 'delete') {
          const keep = rows.filter((r) => !filters.every((f) => f(r)));
          log.push(['delete', table, rows.length - keep.length]);
          tables[table] = keep;
          return Promise.resolve({ data: null, error: null }).then(resolve, reject);
        }
        let data = rows.filter((r) => filters.every((f) => f(r)));
        if (op === 'single') return Promise.resolve({ data: data[0] || null, error: null }).then(resolve, reject);
        if (window) data = data.slice(...window);
        if (limit) data = data.slice(0, limit);
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    };
    return chain;
  };
  return { from, log, tables };
}

test('attachShares ติดรายชื่อให้แถว · ไม่มีแถวแชร์ = อาเรย์ว่าง', async () => {
  const sb = fake({ scent_customer_shares: [{ scentId: 'S-A', customerId: 'CUS-B', customerName: 'บี' }] });
  const [a, b] = await attachShares(sb, [{ id: 'S-A' }, { id: 'S-Z' }], 'scent');
  assert.deepEqual(a.sharedCustomerIds, ['CUS-B']);
  assert.deepEqual(a.sharedCustomers, [{ customerId: 'CUS-B', customerName: 'บี' }]);
  assert.deepEqual(b.sharedCustomerIds, []);
});

test('saveRegistryShares: เพิ่ม/ลบตามชุดใหม่ · ลูกค้าต้องมีจริง · เลิกแชร์คนที่ใช้อยู่ = 409', async () => {
  const base = () => ({
    customers: [{ id: 'CUS-B', name: 'บี' }, { id: 'CUS-C', name: 'ซี' }],
    scent_customer_shares: [{ scentId: 'S-A', customerId: 'CUS-B', customerName: 'บี' }],
    dept_requests: [], dept_request_items: [], dept_request_pdr_targets: [], products: [], formulas: [],
  });
  const entity = { id: 'S-A', code: 'PF-A', name: 'กลิ่น A', customerId: 'CUS-A' };
  const sb = fake(base());
  const out = await saveRegistryShares(sb, 'scent', entity, ['CUS-C', 'CUS-A'], { id: 'U1', name: 'RD' });
  assert.deepEqual(out.add, ['CUS-C']);
  assert.deepEqual(out.remove, ['CUS-B']);
  assert.deepEqual(sb.tables.scent_customer_shares.map((r) => r.customerId), ['CUS-C']);
  assert.equal(sb.tables.scent_customer_shares[0].customerName, 'ซี');

  await assert.rejects(saveRegistryShares(fake(base()), 'scent', entity, ['CUS-X']),
    (e) => e.status === 400 && /ไม่พบลูกค้า CUS-X/.test(e.message));

  const used = base();
  used.formulas = [{ id: 'F-B', customerId: 'CUS-B', scentId: 'S-A' }];
  const sbUsed = fake(used);
  await assert.rejects(saveRegistryShares(sbUsed, 'scent', entity, []),
    (e) => e.status === 409 && /เลิกแชร์ บี ไม่ได้/.test(e.message));
  assert.equal(sbUsed.tables.scent_customer_shares.length, 1, 'ตีกลับก่อนเขียน');
});

test('ต่อสาย: API แชร์ = canManageRegistryShares · ลูกค้าของสูตรจากกลิ่นที่แชร์มา = ลูกค้าที่เลือก · ส่งงานผูกสูตรต่างลูกค้า = แชร์อัตโนมัติ', () => {
  for (const [path, gate] of [
    ['src/app/api/master/scents/[id]/route.js', 'canManageRegistryShares'],
    ['src/app/api/master/formulas/[id]/route.js', 'canManageRegistryShares'],
  ]) {
    const src = read(path);
    const block = src.slice(src.indexOf("if (action === 'shares')"));
    assert.match(block.slice(0, 300), new RegExp(`if \\(!${gate}\\(user\\)\\) return forbidden`));
    assert.match(block, /saveRegistryShares\(supabase/);
  }
  const admin = read('src/lib/master/scentFormulaAdmin.js');
  const cff = admin.slice(admin.indexOf('async function customerForFormula'));
  assert.match(cff.slice(0, 900), /if \(scent\.customerId === customerId\) \{/);
  assert.match(admin, /findScentShared\(supabase, derivedFromScentId\)/);
  assert.match(admin, /findFormulaShared\(supabase, derivedFromFormulaId\)/);
  const item = read('src/app/api/sa/requests/[id]/items/[itemId]/route.js');
  assert.match(item, /customerId: before\.customerId \|\| null,\n      \}\);/);
  assert.match(item, /ensureShared\(supabase, 'formula', existing, before\.customerId/);
  // ตัวเลือกบนจอถามตัวเดียวกับ server
  for (const f of ['src/components/database/FormulaForm.js', 'src/components/database/ScentForm.js',
    'src/components/requests/PdrForm.js', 'src/components/requests/ProductDevLines.js']) {
    assert.match(read(f), /scentUsableByCustomer\(/, f);
  }
  // ลบลูกค้าต้องนับแถวแชร์
  assert.match(read('src/lib/master/entityReferences.js'), /scent_customer_shares/);
  assert.match(read('src/lib/master/entityReferences.js'), /formula_customer_shares/);
});

test('รีวิวรอบหนึ่ง: แถวของเจ้าของปัจจุบันไม่นับเป็นแชร์ · แชร์สูตร = แชร์กลิ่นของสูตรให้รายใหม่ด้วย · กลิ่นรอบแก้นับเป็นการใช้งาน', async () => {
  // เปลี่ยนเจ้าของเป็น CUS-B ทีหลัง ขณะที่ CUS-B ยังมีแถวแชร์ค้าง
  const sb = fake({ scent_customer_shares: [{ scentId: 'S-A', customerId: 'CUS-B' }, { scentId: 'S-A', customerId: 'CUS-C' }] });
  const [row] = await attachShares(sb, [{ id: 'S-A', customerId: 'CUS-B' }], 'scent');
  assert.deepEqual(row.sharedCustomerIds, ['CUS-C']);

  const tables = {
    customers: [{ id: 'CUS-B', name: 'บี' }],
    scents: [{ id: 'S-A', customerId: 'CUS-A' }],
    formula_customer_shares: [], scent_customer_shares: [],
    dept_requests: [], dept_request_items: [], products: [], formulas: [],
  };
  const sb2 = fake(tables);
  const out = await saveRegistryShares(sb2, 'formula', { id: 'F-A', customerId: 'CUS-A', scentId: 'S-A' }, ['CUS-B']);
  assert.deepEqual(out.scentSharedWith, ['CUS-B']);
  assert.deepEqual(sb2.tables.scent_customer_shares.map((r) => [r.scentId, r.customerId]), [['S-A', 'CUS-B']]);

  const used = fake({
    customers: [], scent_customer_shares: [{ scentId: 'S-A', customerId: 'CUS-B', customerName: 'บี' }],
    dept_requests: [], dept_request_items: [], dept_request_pdr_targets: [], products: [], formulas: [],
    scents: [{ id: 'S-B1', customerId: 'CUS-B', derivedFromScentId: 'S-A' }],
  });
  await assert.rejects(saveRegistryShares(used, 'scent', { id: 'S-A', customerId: 'CUS-A' }, []),
    (e) => e.status === 409 && /กลิ่นรอบแก้ 1 ตัว/.test(e.message));
});

test('รอบแก้ทับสูตรของลูกค้าอื่น = blocked ตั้งแต่พรีวิว (ตัวเดียวกับ server)', () => {
  const parent = { id: 'F-A', code: 'PF-A-P1', name: 'สูตร A', status: 'active', customerId: 'CUS-A', customerName: 'บริษัท เอ', categoryCode: '01-002', scentId: 'S-A' };
  const source = { id: 'I1', requestId: 'R1', lineKind: 'product_dev', categoryCode: '01-002', scentId: 'S-A', producedFormulaId: 'F-A', outcome: 'revise' };
  const row = { id: 'I2', requestId: 'R1', lineKind: 'product_dev', categoryCode: '01-002', scentId: 'S-A', derivedFromItemId: 'I1' };
  const plan = planFormulaDelivery({ row, items: [source, row], existing: parent, customerId: 'CUS-B' });
  assert.equal(plan.kind, 'blocked');
  assert.match(plan.error, /เป็นของ บริษัท เอ \(แชร์มา\)/);
  // ใบของเจ้าของเอง = รอบแก้ปกติ
  assert.equal(planFormulaDelivery({ row, items: [source, row], existing: parent, customerId: 'CUS-A' }).kind, 'revise');
  const preview = formulaDeliveryPreview({ row, items: [source, row], formulas: [parent], customerId: 'CUS-B' });
  assert.equal(preview.plan.kind, 'blocked');
});


/* ── มติผู้ใช้ 2026-10-05: เปิดให้ฝ่ายขาย Sup ขึ้นไปแชร์ได้ + กรอกในฟอร์มสร้าง/แก้ ───────────────────── */

test('ใครแชร์ได้: RD ทุกตำแหน่ง + admin + CD/CM/AE Sup/AC Sup · ตำแหน่งในทีมและผู้ดูอย่างเดียวไม่ได้', () => {
  for (const role of ['rd', 'rd_perfumer', 'rd_chemist', 'rd_coordinator', 'rd_supervisor',
    'admin', 'commercial_director', 'commercial_manager', 'ae_supervisor', 'ac_supervisor']) {
    assert.equal(canManageRegistryShares({ role }), true, role);
  }
  for (const role of ['ae', 'ac', 'senior_ae', 'senior_ac', 'viewer', 'executive', 'mkt', 'ra', 'fn', undefined]) {
    assert.equal(canManageRegistryShares({ role }), false, String(role));
  }
  assert.equal(canManageRegistryShares(null), false);
});

test('คีย์แชร์ในคำขอ: ไม่ส่ง = ไม่แตะ · ส่งอาเรย์ = ตั้งทั้งชุด · สรุป audit ว่างเมื่อไม่มีอะไรเปลี่ยน', () => {
  assert.equal(requestedShareIds({ name: 'x' }), undefined);
  assert.equal(requestedShareIds({ sharedCustomerIds: 'CUS-B' }), undefined);
  assert.deepEqual(requestedShareIds({ sharedCustomerIds: [] }), []);
  assert.deepEqual(requestedShareIds({ sharedCustomerIds: ['CUS-B'] }), ['CUS-B']);
  assert.equal(shareChangeSummary('scent', { code: 'PF-A' }, { add: [], remove: [] }), null);
  assert.equal(shareChangeSummary('formula', { code: 'PF-A-P1' }, { add: ['B', 'C'], remove: ['D'] }),
    'แชร์สูตร PF-A-P1: เพิ่ม 2 ลูกค้า · เลิกแชร์ 1 ลูกค้า');
});

test('payload ฟอร์ม: มีสิทธิ์ = ส่งรายชื่อทั้งชุด · ไม่มีสิทธิ์/แถวไม่ได้ติดรายชื่อ = ไม่ส่งคีย์ · สูตรฐาน = ชุดว่าง', () => {
  const shared = [{ customerId: 'CUS-B', customerName: 'บี' }, { customerId: 'CUS-C', customerName: 'ซี' }];
  const scent = { name: 'กลิ่น', customerId: 'CUS-A', sharedCustomers: shared };
  assert.deepEqual(scentFormPayload(scent, { canShare: true }).sharedCustomerIds, ['CUS-B', 'CUS-C']);
  assert.deepEqual(scentFormPayload({ ...scent, sharedCustomers: [] }, { canShare: true, mode: 'edit' }).sharedCustomerIds, []);
  assert.equal('sharedCustomerIds' in scentFormPayload(scent, { canShare: false }), false);
  // null = แถวที่โหลดมาไม่ได้ติดรายชื่อแชร์ — ส่ง [] ไปเมื่อไร = เลิกแชร์ทุกรายเงียบ ๆ
  assert.equal('sharedCustomerIds' in scentFormPayload({ ...scent, sharedCustomers: null }, { canShare: true }), false);

  const formula = { name: 'สูตร', customerId: 'CUS-A', sharedCustomers: shared };
  assert.deepEqual(formulaFormPayload(formula, { canShare: true }).sharedCustomerIds, ['CUS-B', 'CUS-C']);
  assert.deepEqual(formulaFormPayload({ ...formula, customerId: '' }, { canShare: true }).sharedCustomerIds, []);
  assert.equal('sharedCustomerIds' in formulaFormPayload(formula, {}), false);
  assert.equal('sharedCustomerIds' in formulaFormPayload({ ...formula, sharedCustomers: null }, { canShare: true }), false);
});

test('planRegistryShares ตรวจโดยไม่เขียน — ของที่ยังไม่สร้างตรวจแค่ลูกค้ามีจริง · ของเดิมตีกลับเลิกแชร์คนที่ใช้อยู่', async () => {
  const tables = () => ({
    customers: [{ id: 'CUS-B', name: 'บี' }],
    scent_customer_shares: [{ scentId: 'S-A', customerId: 'CUS-B', customerName: 'บี' }],
    dept_requests: [], dept_request_items: [], dept_request_pdr_targets: [], products: [],
    formulas: [{ id: 'F-B', customerId: 'CUS-B', scentId: 'S-A' }], scents: [],
  });
  const fresh = await planRegistryShares(fake(tables()), 'scent', { id: null, customerId: 'CUS-A' }, ['CUS-B', 'CUS-A']);
  assert.deepEqual(fresh.add, ['CUS-B']);
  assert.deepEqual(fresh.remove, []);
  await assert.rejects(planRegistryShares(fake(tables()), 'scent', { id: null, customerId: 'CUS-A' }, ['CUS-X']),
    (e) => e.status === 400 && /ไม่พบลูกค้า CUS-X/.test(e.message));

  const sb = fake(tables());
  await assert.rejects(planRegistryShares(sb, 'scent', { id: 'S-A', customerId: 'CUS-A' }, []),
    (e) => e.status === 409 && /เลิกแชร์ บี ไม่ได้/.test(e.message));
  assert.equal(sb.tables.scent_customer_shares.length, 1, 'ตรวจอย่างเดียว ไม่ลบอะไร');
  // สูตรฐานส่งชุดว่าง = ไม่มีอะไรต้องทำ
  const base = await planRegistryShares(fake(tables()), 'formula', { id: null, customerId: null }, []);
  assert.deepEqual([base.add, base.remove], [[], []]);
});

test('ต่อสาย: ฟอร์มสร้าง/แก้ส่งรายชื่อแชร์ — ตรวจก่อนเขียน · ด่านสิทธิ์ตัวเดียวกับ action แชร์ · จอถามตัวเดียวกับ API', () => {
  for (const [path, anchor] of [
    ['src/app/api/master/scents/route.js', 'export const POST'],
    ['src/app/api/master/formulas/route.js', 'export const POST'],
    ['src/app/api/master/scents/[id]/route.js', "if (action === 'edit')"],
    ['src/app/api/master/formulas/[id]/route.js', "if (action === 'edit')"],
  ]) {
    const block = read(path).slice(read(path).indexOf(anchor));
    assert.match(block, /requestedShareIds\(body\)/, path);
    assert.match(block, /if \(shareIds && !canManageRegistryShares\(user\)\) return forbidden/, path);
    const plan = block.indexOf('planRegistryShares(');
    const save = block.indexOf('saveRegistryShares(');
    const write = Math.min(...['createScent(', 'createFormula(', 'updateScent(', 'editFormula(']
      .map((w) => block.indexOf(w)).filter((i) => i >= 0));
    assert.ok(plan > 0 && plan < write && write < save, `${path}: ตรวจ → เขียนตัวของ → เขียนแชร์`);
  }
  for (const page of ['src/app/database/scents/page.js', 'src/app/database/formulas/page.js',
    'src/app/database/scents/[id]/page.js', 'src/app/database/formulas/[id]/page.js']) {
    const src = read(page);
    assert.match(src, /const canShare = canManageRegistryShares\(me\)/, page);
    assert.match(src, /canShare=\{canShare\}/, page);
  }
  for (const f of ['src/components/database/ScentForm.js', 'src/components/database/FormulaForm.js',
    'src/components/database/RegistryShareCard.js']) {
    assert.match(read(f), /<RegistryShareField/, f);
  }
});
