import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isForceRequest, isDryRun, canForceDelete,
  dealForcePreview, cleanupDealOrphans, quotationForcePreview, salesOrderForcePreview,
  exciseFilingBlockMessage, exciseFilingsOfSalesOrder,
  scentForcePreview, formulaForcePreview, requestForcePreview,
} from './forceDelete.js';

test('isForceRequest / isDryRun: อ่าน query flag', () => {
  const req = (u) => ({ url: u });
  assert.equal(isForceRequest(req('https://x/api/deals/1?force=1')), true);
  assert.equal(isForceRequest(req('https://x/api/deals/1?force=true')), true);
  assert.equal(isForceRequest(req('https://x/api/deals/1')), false);
  assert.equal(isForceRequest(req('https://x/api/deals/1?force=0')), false);
  assert.equal(isDryRun(req('https://x/api/deals/1?dryRun=1')), true);
  assert.equal(isDryRun(req('https://x/api/deals/1')), false);
  // URL พังไม่ควร throw
  assert.equal(isForceRequest({ url: 'not a url' }), false);
});

test('canForceDelete: admin เท่านั้น (superuser อื่นไม่ได้)', () => {
  assert.equal(canForceDelete({ role: 'admin' }), true);
  assert.equal(canForceDelete({ role: 'ae_supervisor' }), false);
  assert.equal(canForceDelete({ role: 'senior_ae' }), false);
  assert.equal(canForceDelete(null), false);
});

// stub supabase: ตอบ count ตาม (table, column) ที่ map ไว้
function stubCount(map) {
  return {
    from(table) {
      const ctx = { table, col: null, val: null, extra: false };
      const builder = {
        select() { return builder; },
        eq(col, val) {
          if (ctx.col === null) { ctx.col = col; ctx.val = val; }
          else { ctx.extra = true; } // เงื่อนไขที่สอง เช่น status='accepted'
          return builder;
        },
        // ใบยื่นภาษีของใบเสนอราคาอ่านด้วย .in('salesOrderId', [...]) — คีย์เดียวกับ .eq
        in(col, vals) {
          if (ctx.col === null) { ctx.col = col; ctx.val = vals; }
          else { ctx.extra = true; }
          return builder;
        },
        then(resolve) {
          const key = ctx.extra ? `${table}:${ctx.col}:extra` : `${table}:${ctx.col}`;
          // preview เดิมอ่านแต่ count; ตัวที่อ่านแถวจริง (ใบยื่นภาษี) อ่าน data
          resolve({ count: map[key] ?? 0, data: map[`${key}:rows`] ?? [] });
        },
      };
      return builder;
    },
  };
}

test('dealForcePreview: cascade เฉพาะลูกของดีล + โครงการไม่ถูกลบ (เป็น note)', async () => {
  const supabase = stubCount({
    'quotations:dealId:extra': 1,   // accepted
    'sales_orders:dealId': 1,
    'quotations:dealId': 2,
    'dept_requests:dealId': 3,
    'personal_tasks:dealId': 0,
    'project_tasks:dealId': 5,       // timeline segment ของดีลนี้
  });
  const deal = { id: 'D1', stage: 'won', metadata: { sahamitPoId: 'PO1' } };
  const project = { id: 'P1', code: 'PJ-1' };
  const { cascade, notes } = await dealForcePreview(supabase, deal, { project });
  const labels = cascade.map((c) => c.label);
  // ลบเฉพาะลูกของดีล: accepted/SO + quotations + งานผลิตของดีล + คำร้อง (ไม่มี personal_tasks=0)
  assert.ok(labels.some((l) => l.includes('Actual')));
  assert.ok(labels.some((l) => l.includes('ขั้นตอนงานผลิต')));
  assert.ok(!labels.some((l) => l.includes('งานส่วนตัว')));
  // โครงการ/ทะเบียนสรรพสามิต "ไม่ถูกลบ" → ต้องไม่โผล่ใน cascade
  assert.ok(!labels.some((l) => l.includes('ทะเบียนสรรพสามิต')));
  assert.ok(!labels.some((l) => l.includes('โครงการผลิต')));
  // คำร้องเฉพาะของดีล = 3
  const inq = cascade.find((c) => c.label.includes('คำร้องข้ามฝ่าย'));
  assert.equal(inq.count, 3);
  // note 3 รายการ: โครงการยังอยู่ + Won + PO สหมิตร
  assert.equal(notes.length, 3);
  assert.ok(notes.some((n) => n.includes('โครงการผลิต PJ-1') && n.includes('ยังอยู่')));
});

test('quotationForcePreview: โชว์ Sale Order ที่จะ cascade + note accepted', async () => {
  const supabase = stubCount({ 'sales_orders:quotationId': 1 });
  const { cascade, notes } = await quotationForcePreview(supabase, { id: 'Q1', status: 'accepted' });
  assert.equal(cascade.length, 1);
  assert.ok(cascade[0].label.includes('Sale Order'));
  // ใบ accepted ได้ 2 note: เป็นแหล่งยอด Actual + ระบบจะถอยดีลออกจาก Won ให้ (mig 0168)
  assert.equal(notes.length, 2);
  assert.ok(notes.some((n) => n.includes('ถอยดีลออกจาก Won')));
});

test('quotationForcePreview: ใบที่มีหลักฐาน/ฉบับตรึงไม่ blocked แล้ว แต่ต้องเตือนว่าทำลายถาวร', async () => {
  const supabase = stubCount({
    'document_signature_evidence:quotationId': 2,
    'issued_documents:quotationId': 1,
  });
  const { cascade, notes, blocked } = await quotationForcePreview(supabase, { id: 'Q1', status: 'sent' });
  // mig 0152 เปิดทาง break-glass → พรีวิวต้องไม่บอกว่าลบไม่ได้
  assert.equal(blocked, false);
  assert.ok(cascade.some((c) => c.label.includes('หลักฐานลายเซ็น') && c.count === 2));
  assert.ok(cascade.some((c) => c.label.includes('ฉบับตรึง') && c.count === 1));
  assert.ok(notes.some((n) => n.includes('ทำลายหลักฐานถาวร')));
});

test('salesOrderForcePreview: นับหลักฐาน+ฉบับตรึง และเตือนใบที่อนุมัติแล้ว', async () => {
  const supabase = stubCount({
    'document_signature_evidence:salesOrderId': 1,
    'issued_documents:salesOrderId': 1,
  });
  const { cascade, notes, blocked } = await salesOrderForcePreview(supabase, { id: 'SO1', status: 'approved' });
  assert.equal(blocked, false);
  assert.equal(cascade.length, 2);
  assert.ok(notes.some((n) => n.includes('ทำลายหลักฐานถาวร')));
  assert.ok(notes.some((n) => n.includes('Actual')));
});

test('cleanupDealOrphans: ลบเธรด+งาน+คำร้องของดีล และปลด parentDealId', async () => {
  const calls = [];
  const rpcCalls = [];
  const supabase = {
    from(table) {
      const b = {
        _table: table, _op: null, _col: null,
        select() {
          return {
            eq: (c, v) => ({ then: (r) => { b._col = c; r({ data: [{ id: 'IQ1' }] }); } }),
            // purgeTaskThreads หา id ของงานที่จะถูกลบก่อน เพื่อกวาดเธรดของมัน (mig 0163)
            in: (c, v) => ({ then: (r) => { b._col = c; r({ data: [{ id: 'T1' }] }); } }),
          };
        },
        delete() { b._op = 'delete'; return b; },
        update(patch) { b._op = 'update'; b._patch = patch; return b; },
        in(col, vals) { calls.push({ table, op: b._op, in: col, vals }); return b; },
        eq(col, val) { calls.push({ table, op: b._op, eq: col, val, patch: b._patch }); return b; },
      };
      return b;
    },
  };
  supabase.rpc = (fn, args) => { rpcCalls.push({ fn, args }); return Promise.resolve({ data: null, error: null }); };
  await cleanupDealOrphans(supabase, 'D1');
  // ต้องกวาดเธรดคำร้อง (entity_updates) + งานที่ผูกคำร้อง แล้วลบคำร้องผ่าน RPC
  // ⚠️ ลบคำร้องตรง ๆ ไม่ได้ — guard_dept_request (0173) บล็อกใบที่ส่งแล้วทุกใบ
  assert.ok(calls.some((c) => c.table === 'entity_updates' && c.op === 'delete' && c.in === 'entityId'));
  assert.ok(calls.some((c) => c.table === 'personal_tasks' && c.op === 'delete' && c.in === 'inquiryId'));
  assert.ok(rpcCalls.some((c) => c.fn === 'force_delete_dept_request'));
  assert.ok(calls.some((c) => c.table === 'personal_tasks' && c.op === 'delete' && c.eq === 'dealId' && c.val === 'D1'));
  assert.ok(calls.some((c) => c.table === 'sales_deals' && c.op === 'update' && c.eq === 'parentDealId' && c.patch?.parentDealId === null));
  // เธรดอัปเดตของงาน (entity_updates, mig 0163) ไม่มี FK — ต้องถูกกวาดด้วย
  // ไม่งั้นเหลือเธรดกำพร้าที่ไม่มีทางเข้าถึงและไม่มีใครลบให้
  assert.ok(
    calls.some((c) => c.table === 'entity_updates' && c.op === 'delete' && c.in === 'entityId'),
    'ต้องลบ entity_updates ของงานที่ถูกกวาดไปด้วย',
  );
});

// ── ใบยื่นชำระภาษี: ด่านที่ break-glass ก็ข้ามไม่ได้ (2026-07-27) ──────────────
// orders."salesOrderId" เป็น FK RESTRICT แต่ RPC บังคับลบไม่ได้ล้างให้ → เดิมพรีวิว
// บอกว่าลบได้ แล้วไปพังตอนลบจริงด้วย error ดิบจาก Postgres
test('salesOrderForcePreview: มีใบยื่นภาษี = blocked พร้อมบอกทางออก', async () => {
  const supabase = stubCount({
    'orders:salesOrderId:rows': [{ id: 'TAX-1', status: 'received' }],
    'document_signature_evidence:salesOrderId': 1,
  });
  const { blocked, notes, cascade } = await salesOrderForcePreview(supabase, { id: 'SO1', status: 'approved' });
  assert.equal(blocked, true);
  assert.equal(cascade.length, 0); // ไม่โชว์ว่าจะลบอะไร เพราะจะไม่ลบเลย
  assert.match(notes[0], /TAX-1 \(received\)/);
  assert.match(notes[0], /ลบใบยื่น/);
});

test('quotationForcePreview: ใบยื่นภาษีของ SO ลูกก็บล็อกการลบ QT', async () => {
  const supabase = stubCount({
    'sales_orders:quotationId:rows': [{ id: 'SO1' }],
    'orders:salesOrderId:rows': [{ id: 'TAX-9', status: 'complete' }],
  });
  const { blocked, notes } = await quotationForcePreview(supabase, { id: 'Q1', status: 'accepted' });
  assert.equal(blocked, true);
  assert.match(notes[0], /TAX-9/);
});

test('ไม่มีใบยื่นภาษี = ไม่บล็อก (พฤติกรรมเดิมต้องไม่เปลี่ยน)', async () => {
  const supabase = stubCount({ 'sales_orders:quotationId': 1 });
  assert.equal((await quotationForcePreview(supabase, { id: 'Q1', status: 'sent' })).blocked, false);
  assert.equal((await salesOrderForcePreview(supabase, { id: 'SO1', status: 'draft' })).blocked, false);
});

test('exciseFilingBlockMessage: บอกเลขใบยื่นทุกใบ + ชี้หน้าไปจัดการ', () => {
  const msg = exciseFilingBlockMessage([{ id: 'TAX-1', status: 'draft' }, { id: 'TAX-2' }], 'Sale Order');
  assert.match(msg, /TAX-1 \(draft\)/);
  assert.match(msg, /TAX-2/);
  assert.match(msg, /ภาษี › การยื่นชำระ/);
  assert.match(msg, /Sale Order/);
});

test('อ่านตาราง orders ไม่ได้ (ยังไม่รัน mig 0160) = ไม่บล็อก', async () => {
  const supabase = {
    from() {
      const b = {
        select: () => b, eq: () => b, in: () => b,
        then: (resolve) => resolve({ error: { code: '42703', message: 'column "salesOrderId" does not exist' } }),
      };
      return b;
    },
  };
  assert.deepEqual(await exciseFilingsOfSalesOrder(supabase, 'SO1'), []);
});

test('scentForcePreview: แยก "ลบพ่วง" ออกจาก "ปลดการเชื่อมโยง" ให้ชัด', async () => {
  const supabase = stubCount({
    'scent_revisions:scentId': 2,
    'formulas:scentId': 1,
    'products:scentId': 3,
    'material_prices:scentId': 0,
  });
  const { cascade, notes, blocked } = await scentForcePreview(supabase, { id: 'SCT-1', status: 'active' });
  assert.equal(blocked, false);
  // เรียงตามที่ประกาศ และตัดรายการที่ count = 0 ทิ้ง
  assert.deepEqual(cascade.map((c) => c.count), [2, 1, 3]);
  // ⚠️ ป้ายต้องบอกตรง ๆ ว่าอะไรหายจริง อะไรแค่ถูกปลด — ทั้งหมดเป็น FK จริงที่ตั้ง
  // SET NULL/CASCADE ไว้แล้ว ถ้าเขียนรวมว่า "จะลบ" ผู้ดูแลระบบจะนึกว่าสินค้าหายด้วย
  assert.match(cascade[0].label, /ลบพ่วง/);
  assert.match(cascade[1].label, /ปลดการเชื่อมโยง/);
  assert.match(cascade[2].label, /สินค้ายังอยู่/);
  assert.ok(notes.some((n) => n.includes('เก็บเข้ากรุ')));
});

test('scentForcePreview: กลิ่นที่ยังไม่เคยส่ง ไม่เตือนเรื่องประวัติ', async () => {
  const supabase = stubCount({});
  const { cascade, notes } = await scentForcePreview(supabase, { id: 'SCT-2', status: 'draft' });
  assert.deepEqual(cascade, []);
  assert.deepEqual(notes, []);
});

test('formulaForcePreview: เตือนว่าสินค้าจะกลับไปอยู่ "รอจัดระเบียบ"', async () => {
  const supabase = stubCount({ 'products:formulaId': 2, 'material_prices:formulaId': 1 });
  const { cascade, notes } = await formulaForcePreview(supabase, { id: 'FML-1', status: 'active' });
  assert.deepEqual(cascade.map((c) => c.count), [2, 1]);
  assert.ok(notes.some((n) => n.includes('รอจัดระเบียบ')));
});

test('requestForcePreview: บอกของที่ลบพ่วง และย้ำว่าราคาที่ตอบแล้วไม่หาย', async () => {
  const supabase = stubCount({
    'dept_request_items:requestId': 3,
    'entity_updates:entityId:extra': 7,   // .eq(entityId) แล้ว .eq(entityType)
    'personal_tasks:inquiryId': 2,
  });
  const { cascade, notes, blocked } = await requestForcePreview(supabase, {
    id: 'DR-1', docNo: 'RM-26080001', status: 'answered', dealId: 'D-1',
  });
  assert.equal(blocked, false);
  const labels = cascade.map((c) => c.label).join(' | ');
  assert.match(labels, /บรรทัดวัสดุ/);
  assert.match(labels, /เธรดคำร้อง/);
  assert.match(labels, /งานที่สร้างจากคำร้อง/);
  // ⭐ ข้อสำคัญที่สุดของพรีวิวนี้: ผู้ดูแลระบบต้องไม่กลัวว่ากำลังลบประวัติราคาทิ้ง
  // (ราคาอยู่ในทะเบียนวัสดุเป็น rev ของตัวเอง ไม่ได้อยู่ในคำร้อง)
  assert.ok(notes.some((n) => /ราคาที่ตอบแล้ว.*ยังอยู่/.test(n)), 'ต้องบอกว่าราคาไม่หาย');
  assert.ok(notes.some((n) => n.includes('RM-26080001')), 'ต้องอ้างเลขที่ที่ออกแล้ว');
  assert.ok(notes.some((n) => /เธรดของดีล/.test(n)), 'ต้องบอกว่าบรรทัดในเธรดดีลไม่ถูกลบตาม');
});

test('requestForcePreview: ร่างเปล่าที่ยังไม่ออกเลข ไม่ต้องเตือนอะไรเลย', async () => {
  const { cascade, notes } = await requestForcePreview(stubCount({}), {
    id: 'DR-2', docNo: null, status: 'draft', dealId: null,
  });
  assert.deepEqual(cascade, [], 'ไม่มีลูก = ไม่มีรายการลบพ่วง');
  assert.deepEqual(notes, [], 'ร่างเปล่า ๆ ไม่ต้องมี note');
});
