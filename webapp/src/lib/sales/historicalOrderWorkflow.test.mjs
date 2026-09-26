// ── ขั้นเดินงานของใบสั่งขายย้อนหลัง (0374): ส่งอนุมัติ · AE Sup อนุมัติ · ของเสริมหน้าใบ · ผลของ trigger ยกเลิกสัญญา ─────
// ยิงด้วย supabase ปลอม (แพตเทิร์น historicalOrderCommit.test.mjs) — ห้ามแตะฐานจริง (dev DB = prod DB)
// ข้อมูลชุดม็อก (mockups/legacy-so-service-flow) ย่อเหลือ 2 โซน: สัญญา 2026 ทั้งปี · ยกมา ม.ค.–ก.ย. + งวด ต.ค.–ธ.ค.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  approveHistoricalOrder, historicalContractVoided, loadHistoricalOrderExtras, submitHistoricalOrder,
  voidedContractLabel,
} from './historicalOrderWorkflow.js';
import { PRIVATE_EVIDENCE_BUCKET } from '../upload/privateEvidence.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const NOW = new Date('2026-09-22T10:00:00+07:00');
const ORDER_ID = 'SOR-H0123456789abcdef';
const UPDATED_AT = '2026-09-22T03:00:00.123456+00:00';
const FILE_ID = '8a6b5c4d-3e2f-4f0c-9d2e-1b7a4c1e9f3d';

const pim = { id: 'U-PIM', name: 'พิมพ์ชนก รัตนา', role: 'ae', team: 'SV', teams: ['SV'] };
const nat = { id: 'U-NAT', name: 'ณัฐ', role: 'senior_ae', team: 'SV', teams: ['SV'] };
const other = { id: 'U-OTH', name: 'อีกคน', role: 'ae', team: 'SV', teams: ['SV'] };
const sup = { id: 'U-SUP', name: 'หัวหน้าขาย', role: 'ae_supervisor', teams: [] };
const sup2 = { id: 'U-SUP2', name: 'หัวหน้าขายสอง', role: 'ae_supervisor', teams: [] };
const admin = { id: 'U-ADM', name: 'แอดมิน', role: 'admin', teams: [] };
const fn = { id: 'U-FN', name: 'บัญชี', role: 'finance', department: 'FN', teams: [] };

const deal = { id: 'DEAL-C', ownerId: 'U-PIM', ownerName: 'พิมพ์ชนก รัตนา', team: 'SV' };
const draftContract = {
  id: 'CTR-H1', kind: 'service', status: 'draft', source: 'external', contractNo: null,
  externalDocKind: 'customer_po', externalRef: 'PO-SPW-2026-0118', effectiveDate: '2026-01-01', expiryDate: '2026-12-31',
  signedFileId: null, metadata: { historicalSalesOrderId: ORDER_ID },
};
const order = (extra = {}) => ({
  id: ORDER_ID, orderNumber: 'SO-26090191-0', origin: 'historical', status: 'draft', dealId: 'DEAL-C',
  customerId: 'CUS-SPW', createdBy: 'U-PIM', submittedBy: null, approvedBy: null, updatedAt: UPDATED_AT,
  serviceContractId: 'CTR-H1', serviceContract: draftContract, deal, ...extra,
});
const pending = (extra = {}) => order({ status: 'pending_approval', submittedBy: 'U-PIM', ...extra });

const inIds = (q, column) => q.filters.find((f) => f[0] === 'in' && f[1] === column)?.[2] || [];

function fakeDb({ rpc = [], tables = {}, stored = null } = {}) {
  const calls = { from: [], rpc: [], storage: [] };
  const supabase = {
    from(table) {
      const q = { table, selected: '', filters: [], orders: [], limit: null };
      calls.from.push(q);
      const builder = {
        select(cols) { q.selected = String(cols); return builder; },
        eq(col, val) { q.filters.push(['eq', col, val]); return builder; },
        in(col, val) { q.filters.push(['in', col, val]); return builder; },
        order(col) { q.orders.push(col); return builder; },
        range() { return builder; },
        limit(n) { q.limit = n; return builder; },
        maybeSingle() { q.single = true; return builder; },
        then(resolve, reject) {
          try {
            const handler = tables[table];
            if (!handler) throw new Error(`unexpected table ${table}`);
            resolve(typeof handler === 'function' ? handler(q) : handler);
          } catch (error) { reject(error); }
        },
      };
      return builder;
    },
    rpc(name, args) {
      calls.rpc.push({ name, args });
      const next = rpc.length > 1 ? rpc.shift() : rpc[0];
      return Promise.resolve(typeof next === 'function' ? next(args) : next);
    },
    storage: {
      from(bucket) {
        return {
          list(folder, { search } = {}) {
            calls.storage.push({ bucket, folder, search });
            const hit = !stored || stored.has(`${folder}/${search}`);
            return Promise.resolve({ data: hit ? [{ name: search }] : [], error: null });
          },
        };
      },
    },
  };
  return { supabase, calls };
}

async function runSubmit(db, { user = pim, row = order(), body = { expectedUpdatedAt: UPDATED_AT } } = {}) {
  const audits = [];
  const threads = [];
  const res = await submitHistoricalOrder({
    supabase: db.supabase, user, order: row, body,
    audit: async (entry) => { audits.push(entry); },
    thread: async (action, opts) => { threads.push({ action, opts }); },
  });
  return { ...res, audits, threads };
}
async function runApprove(db, { user = sup, row = pending(), body = { expectedUpdatedAt: UPDATED_AT, signedFileId: FILE_ID } } = {}) {
  const audits = [];
  const threads = [];
  const res = await approveHistoricalOrder({
    supabase: db.supabase, user, order: row, body, now: NOW,
    audit: async (entry) => { audits.push(entry); },
    thread: async (action, opts) => { threads.push({ action, opts }); },
  });
  return { ...res, audits, threads };
}

const submitted = (extra = {}) => ({
  data: { replayed: false, order: { ...order(), status: 'pending_approval', submittedBy: 'U-PIM', deal: undefined }, ...extra },
  error: null,
});
const approved = (extra = {}) => ({
  data: {
    replayed: false,
    order: { id: ORDER_ID, orderNumber: 'SO-26090191-0', status: 'approved', approvedBy: 'U-SUP' },
    contract: { ...draftContract, status: 'signed', contractNo: 'CT-SR-26090007-0', signedFileId: FILE_ID },
    installments: [{ id: 'SOI-1', kind: 'opening', status: 'reported' }, { id: 'SOI-2', kind: 'regular', status: 'pending' }],
    terms: [
      { id: 'SZT-H1', zoneId: 'Z-1', salesOrderLineId: 'SOL-1', packageQty: 6 },
      { id: 'SZT-H2', zoneId: 'Z-2', salesOrderLineId: 'SOL-2', packageQty: 4 },
    ],
    ...extra,
  },
  error: null,
});

// ── ส่งอนุมัติ ──────────────────────────────────────────────────────────────────────────────
test('ส่งอนุมัติ: ด่านมาก่อน RPC — ฝ่ายที่ไม่ใช่ฝ่ายขาย 403 · AE ใบคนอื่น (นอกขอบเขต) 403 · Senior AE ใบคนอื่นในทีม 403 · ไม่เรียก RPC', async () => {
  for (const [user, pattern] of [[fn, /ฝ่ายขายและแอดมิน/], [other, /นอกขอบเขต/], [nat, /เจ้าของ — ใบนี้เป็นของ พิมพ์ชนก/]]) {
    const db = fakeDb({ rpc: [submitted()] });
    const res = await runSubmit(db, { user });
    assert.equal(res.status, 403, user.role);
    assert.match(res.body.error, pattern);
    assert.equal(db.calls.rpc.length, 0);
    assert.equal(db.calls.from.length, 0);
    assert.equal(res.audits.length, 0);
  }
});

test('ส่งอนุมัติ: รออนุมัติอยู่แล้ว (คนอื่นส่ง) / อนุมัติแล้ว / ยกเลิก = 409 submit_state_invalid · ใบ pipeline = 409', async () => {
  for (const row of [pending({ submittedBy: 'U-SUP' }), order({ status: 'approved' }), order({ status: 'cancelled' })]) {
    const db = fakeDb({ rpc: [submitted()] });
    const res = await runSubmit(db, { row });
    assert.equal(res.status, 409, row.status);
    assert.equal(res.body.code, 'historical_so_submit_state_invalid');
    assert.equal(db.calls.rpc.length, 0);
  }
  const pipeline = await runSubmit(fakeDb(), { row: order({ origin: 'pipeline' }) });
  assert.equal(pipeline.status, 409);
});

test('ส่งอนุมัติ: ไม่ส่งเวลาที่จอเห็น = 400 ก่อนเรียก RPC', async () => {
  const db = fakeDb({ rpc: [submitted()] });
  const res = await runSubmit(db, { body: {} });
  assert.equal(res.status, 400);
  assert.equal(db.calls.rpc.length, 0);
});

test('ส่งอนุมัติ: RPC ครั้งเดียว · อาร์กิวเมนต์ครบ · ไม่ส่งหลักฐาน = null (ฐานใช้ของที่เก็บไว้) · audit + เธรดอย่างละครั้ง', async () => {
  const db = fakeDb({ rpc: [submitted()] });
  const res = await runSubmit(db);
  assert.equal(res.status, 200);
  assert.equal(res.body.replayed, false);
  assert.equal(db.calls.rpc.length, 1);
  assert.deepEqual(db.calls.rpc[0], {
    name: 'submit_historical_sales_order',
    args: {
      p_order_id: ORDER_ID, p_expected_updated_at: UPDATED_AT,
      p_actor_id: 'U-PIM', p_actor_name: 'พิมพ์ชนก รัตนา', p_actor_role: 'ae', p_opening_evidence: null,
    },
  });
  assert.deepEqual(res.threads.map((t) => t.action), ['submit']);
  assert.equal(res.audits.length, 1);
  assert.match(res.audits[0].summary, /ส่งอนุมัติใบสั่งขายย้อนหลัง SO-26090191-0 · ไม่นับ Actual/);
  // ใบที่ถูกตีกลับส่งใหม่ได้ · audit บอกว่าเป็นรอบส่งใหม่
  const again = await runSubmit(fakeDb({ rpc: [submitted()] }), { row: order({ status: 'rejected' }) });
  assert.equal(again.status, 200);
  assert.match(again.audits[0].summary, /ส่งใหม่หลังถูกตีกลับ/);
});

test('ส่งอนุมัติ: หลักฐานงวดยกมาที่ส่งมาเหลือเฉพาะไฟล์ใต้โฟลเดอร์ของใบนี้ · ไฟล์ไม่มีจริง = 400 ไม่เรียก RPC', async () => {
  const mine = { storageBucket: PRIVATE_EVIDENCE_BUCKET, storagePath: `sales-orders/${ORDER_ID}/payments/1_slip.pdf`, fileName: 'slip.pdf', fileUrl: 'https://x' };
  const foreign = { storageBucket: PRIVATE_EVIDENCE_BUCKET, storagePath: 'sales-orders/SOR-OTHER/payments/2_x.pdf', fileName: 'x.pdf' };
  const legacy = { fileUrl: 'https://drive.example/file', fileName: 'old.pdf' };
  const db = fakeDb({ rpc: [submitted()] });
  const res = await runSubmit(db, { body: { expectedUpdatedAt: UPDATED_AT, openingEvidence: [mine, foreign, legacy] } });
  assert.equal(res.status, 200);
  const sent = db.calls.rpc[0].args.p_opening_evidence;
  assert.equal(sent.length, 1);
  assert.equal(sent[0].storagePath, mine.storagePath);
  assert.equal(sent[0].fileUrl, null);

  const missing = fakeDb({ rpc: [submitted()], stored: new Set() });
  const gone = await runSubmit(missing, { body: { expectedUpdatedAt: UPDATED_AT, openingEvidence: [mine] } });
  assert.equal(gone.status, 400);
  assert.match(gone.body.error, /ไม่พบไฟล์/);
  assert.equal(missing.calls.rpc.length, 0);

  const bad = await runSubmit(fakeDb({ rpc: [submitted()] }), { body: { expectedUpdatedAt: UPDATED_AT, openingEvidence: 'x' } });
  assert.equal(bad.status, 400);
  // อาร์เรย์ว่าง = "ไม่มีไฟล์" จริง ⇒ ส่งต่อให้ฐานตีกลับ ไม่ถอยไปใช้ของเก่า
  const empty = fakeDb({ rpc: [submitted()] });
  await runSubmit(empty, { body: { expectedUpdatedAt: UPDATED_AT, openingEvidence: [] } });
  assert.deepEqual(empty.calls.rpc[0].args.p_opening_evidence, []);
});

test('ส่งอนุมัติซ้ำโดยผู้ส่งคนเดิม (เน็ตหลุดหลังสำเร็จ) = ถึง RPC แล้วได้ผลเดิม · ไม่ลง audit/เธรดซ้ำ', async () => {
  const db = fakeDb({ rpc: [submitted({ replayed: true })] });
  const res = await runSubmit(db, { row: pending() });
  assert.equal(res.status, 200);
  assert.equal(res.body.replayed, true);
  assert.equal(db.calls.rpc.length, 1);
  assert.equal(res.audits.length, 0);
  assert.equal(res.threads.length, 0);
});

test('ส่งอนุมัติ: error ของฐาน — stale 409 · ไฟล์สัญญายังไม่แนบ 409 · ยังไม่ได้รัน 0374 = 503 · ไม่มี audit', async () => {
  for (const [error, status, code] of [
    [{ message: 'workflow_stale' }, 409, 'workflow_stale'],
    [{ message: 'historical_so_contract_file_missing' }, 409, 'historical_so_contract_file_missing'],
    [{ message: 'historical_so_opening_evidence_missing' }, 409, 'historical_so_opening_evidence_missing'],
    [{ code: 'PGRST202', message: 'Could not find the function public.submit_historical_sales_order' }, 503, undefined],
  ]) {
    const res = await runSubmit(fakeDb({ rpc: [{ data: null, error }] }));
    assert.equal(res.status, status, error.message);
    assert.equal(res.body.code, code);
    assert.equal(res.audits.length, 0);
    assert.equal(res.threads.length, 0);
  }
});

// ── อนุมัติ ──────────────────────────────────────────────────────────────────────────────────
test('อนุมัติ: ผู้ที่ไม่ใช่ AE Sup/Admin = 403 ไม่เรียก RPC · ใบที่ไม่ได้รออนุมัติ = 400', async () => {
  for (const user of [pim, nat, fn]) {
    const db = fakeDb({ rpc: [approved()] });
    const res = await runApprove(db, { user });
    assert.equal(res.status, 403, user.role);
    assert.equal(res.body.code, 'historical_so_approve_forbidden');
    assert.equal(db.calls.rpc.length, 0);
  }
  for (const row of [order(), order({ status: 'rejected' }), order({ status: 'approved', approvedBy: 'U-SUP2' })]) {
    const db = fakeDb({ rpc: [approved()] });
    const res = await runApprove(db, { row });
    assert.equal(res.status, 400, row.status);
    assert.equal(res.body.code, 'historical_so_approve_state_invalid');
    assert.equal(db.calls.rpc.length, 0);
  }
});

test('อนุมัติ: AE Sup อนุมัติใบที่ตัวเองคีย์/ส่ง = 403 ไม่เรียก RPC · Admin = override (เหตุผลไม่บังคับ · ตัดช่องว่าง)', async () => {
  for (const row of [pending({ createdBy: 'U-SUP' }), pending({ submittedBy: 'U-SUP' })]) {
    const db = fakeDb({ rpc: [approved()] });
    const res = await runApprove(db, { row });
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'historical_so_self_approval');
    assert.equal(db.calls.rpc.length, 0);
  }
  const db = fakeDb({ rpc: [approved({ order: { id: ORDER_ID, orderNumber: 'SO-26090191-0', status: 'approved', approvedBy: 'U-ADM' } })] });
  const res = await runApprove(db, {
    user: admin, row: pending({ createdBy: 'U-ADM', submittedBy: 'U-ADM' }),
    body: { expectedUpdatedAt: UPDATED_AT, signedFileId: FILE_ID, overrideReason: '  ไม่มี   AE Sup คนที่สอง ' },
  });
  assert.equal(res.status, 200);
  assert.equal(db.calls.rpc[0].args.p_override_reason, 'ไม่มี AE Sup คนที่สอง');
  assert.equal(db.calls.rpc[0].args.p_actor_role, 'admin');
  assert.match(res.audits[0].summary, /Admin Override: ไม่มี AE Sup คนที่สอง/);
  assert.deepEqual(res.threads, [{ action: 'approve', opts: { overrideReason: 'ไม่มี AE Sup คนที่สอง', note: null } }]);

  const blank = fakeDb({ rpc: [approved()] });
  await runApprove(blank, { user: admin, row: pending({ createdBy: 'U-ADM' }) });
  assert.equal(blank.calls.rpc[0].args.p_override_reason, null);
  const tooLong = await runApprove(fakeDb({ rpc: [approved()] }), {
    user: admin, row: pending({ createdBy: 'U-ADM' }),
    body: { expectedUpdatedAt: UPDATED_AT, signedFileId: FILE_ID, overrideReason: 'ก'.repeat(501) },
  });
  assert.equal(tooLong.status, 400);
  // ผู้ตรวจที่ไม่ใช่ผู้คีย์ = standard · เหตุผลที่แนบมาไม่ถูกส่ง
  const standard = fakeDb({ rpc: [approved()] });
  await runApprove(standard, { body: { expectedUpdatedAt: UPDATED_AT, signedFileId: FILE_ID, overrideReason: 'x' } });
  assert.equal(standard.calls.rpc[0].args.p_override_reason, null);
});

test('อนุมัติ: ไม่ส่งเวลาที่จอเห็น / ไม่ส่งไฟล์ที่ตรวจ / id ไฟล์ผิดรูป = 400 ไม่เรียก RPC', async () => {
  for (const body of [
    { signedFileId: FILE_ID },
    { expectedUpdatedAt: UPDATED_AT },
    { expectedUpdatedAt: UPDATED_AT, signedFileId: 'not-a-uuid' },
  ]) {
    const db = fakeDb({ rpc: [approved()] });
    const res = await runApprove(db, { body });
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(db.calls.rpc.length, 0);
  }
});

test('อนุมัติ: RPC ครั้งเดียว · ไฟล์ที่ AE Sup เห็น + ช่องเลข CT แบบเดียวกับ approve-external (เดือนไทยที่อนุมัติ)', async () => {
  const db = fakeDb({ rpc: [approved()] });
  const res = await runApprove(db, { body: { expectedUpdatedAt: UPDATED_AT, signedFileId: FILE_ID, note: '  ตรวจแล้ว ' } });
  assert.equal(res.status, 200);
  assert.equal(db.calls.rpc.length, 1);
  assert.deepEqual(db.calls.rpc[0], {
    name: 'approve_historical_sales_order',
    args: {
      p_order_id: ORDER_ID,
      p_expected_updated_at: UPDATED_AT,
      p_actor_id: 'U-SUP',
      p_actor_name: 'หัวหน้าขาย',
      p_actor_role: 'ae_supervisor',
      p_override_reason: null,
      p_note: 'ตรวจแล้ว',
      p_signed_file_id: FILE_ID,
      p_contract_month: '-',
      p_contract_prefix: 'CT-SR-2609',
      p_contract_width: 4,
    },
  });
  // คำตอบพกของที่ RPC คืน — จอโหลดใหม่ทั้งใบอยู่ดี แต่ไม่ต้องเดา
  assert.equal(res.body.serviceContract.contractNo, 'CT-SR-26090007-0');
  assert.equal(res.body.terms.length, 2);
  assert.equal(res.body.replayed, false);
});

test('อนุมัติ: audit สามก้อน (ใบ · เอกสารแทนสัญญา · รอบขายของโซน) + เธรดครั้งเดียว · ไม่มีคำว่านับ Actual', async () => {
  const res = await runApprove(fakeDb({ rpc: [approved()] }));
  assert.deepEqual(res.audits.map((a) => a.entityType), ['sales_order', 'sales_contract', 'service_zone_term']);
  assert.match(res.audits[0].summary, /^อนุมัติใบสั่งขายย้อนหลัง SO-26090191-0 · ไม่นับ Actual · สัญญา CT-SR-26090007-0$/);
  assert.deepEqual(res.audits[0].after.installments.map((row) => row.status), ['reported', 'pending']);
  assert.match(res.audits[1].summary, /CT-SR-26090007-0 พร้อมใบสั่งขายย้อนหลัง SO-26090191-0 \(มีผล 2026-01-01 ถึง 2026-12-31\)/);
  assert.equal(res.audits[1].before, draftContract);
  assert.deepEqual(res.audits[2].after.terms.map((t) => t.zoneId), ['Z-1', 'Z-2']);
  assert.match(res.audits[2].summary, /2 โซน/);
  assert.deepEqual(res.threads.map((t) => t.action), ['approve']);
  // ทุกครั้งที่พูดถึง Actual ต้องเป็น "ไม่นับ Actual" — ตัดวลีที่ถูกออกแล้วต้องไม่เหลือ "นับ Actual" สักที่
  for (const audit of res.audits) assert.doesNotMatch(audit.summary.replaceAll('ไม่นับ Actual', ''), /นับ Actual/);
});

test('อนุมัติซ้ำโดยผู้อนุมัติคนเดิม = ถึง RPC แล้วได้ผลเดิม (200) · ไม่ลง audit/เธรดซ้ำ', async () => {
  const db = fakeDb({ rpc: [approved({ replayed: true })] });
  const res = await runApprove(db, { row: order({ status: 'approved', approvedBy: 'U-SUP' }) });
  assert.equal(res.status, 200);
  assert.equal(res.body.replayed, true);
  assert.equal(db.calls.rpc.length, 1);
  assert.equal(res.audits.length, 0);
  assert.equal(res.threads.length, 0);
});

test('อนุมัติ: error ของฐาน — stale 409 · ไฟล์ไม่ใช่ของสัญญานี้ 409 · เลข CT เต็ม 409 · ยังไม่ได้รัน 0374 = 503 · ไม่มี audit', async () => {
  for (const [error, status, code] of [
    [{ message: 'workflow_stale' }, 409, 'workflow_stale'],
    [{ message: 'historical_so_signed_file_invalid' }, 409, 'historical_so_signed_file_invalid'],
    [{ message: 'contract_monthly_sequence_exhausted' }, 409, 'contract_monthly_sequence_exhausted'],
    [{ message: 'historical_so_approve_state_invalid' }, 409, 'historical_so_approve_state_invalid'],
    [{ code: '42883', message: 'function public.approve_historical_sales_order does not exist' }, 503, undefined],
  ]) {
    const res = await runApprove(fakeDb({ rpc: [{ data: null, error }] }));
    assert.equal(res.status, status, error.message);
    assert.equal(res.body.code, code);
    assert.equal(res.audits.length, 0);
  }
});

test('อนุมัติ: ผู้ตรวจอีกคน (AE Sup คนที่สอง) อนุมัติใบที่ AE Sup คนแรกคีย์ได้ตามปกติ', async () => {
  const db = fakeDb({ rpc: [approved()] });
  const res = await runApprove(db, { user: sup2, row: pending({ createdBy: 'U-SUP', submittedBy: 'U-SUP' }) });
  assert.equal(res.status, 200);
  assert.equal(db.calls.rpc[0].args.p_override_reason, null);
  assert.doesNotMatch(res.audits[0].summary, /Override/);
});

// ── ของเสริมหน้าใบ ───────────────────────────────────────────────────────────────────────────
const extrasTables = ({ files = [], terms = [], termOrders = [], contract = null, siblings = [] } = {}) => ({
  service_zones: (q) => ({
    data: [
      { id: 'Z-1', siteId: 'ST-1', code: 'ZN-1', name: 'ชั้น G ล็อบบี้', isActive: true },
      { id: 'Z-2', siteId: 'ST-2', code: 'ZN-2', name: 'ทางเข้าหลัก', isActive: false },
    ].filter((z) => inIds(q, 'id').includes(z.id)),
    error: null,
  }),
  service_sites: (q) => ({
    data: [
      { id: 'ST-1', code: 'ST-1002', name: 'สยามพารากอน', isActive: true },
      { id: 'ST-2', code: 'ST-1044', name: 'สยามดิสคัฟเวอรี่', isActive: true },
    ].filter((s) => inIds(q, 'id').includes(s.id)),
    error: null,
  }),
  sales_contracts: { data: contract, error: null },
  attachments: { data: files, error: null },
  service_zone_terms: (q) => ({ data: terms.filter((t) => inIds(q, 'zoneId').includes(t.zoneId)), error: null }),
  /* ใบแม่ของรอบขาย (อ่านด้วย id) · ใบย้อนหลังของลูกค้าเดียวกัน (ตรวจใบที่อาจซ้ำใหม่ — อ่านด้วย customerId) */
  sales_orders: (q) => (q.filters.some(([op, col]) => op === 'eq' && col === 'customerId')
    ? { data: siblings, error: null }
    : { data: termOrders.filter((o) => inIds(q, 'id').includes(o.id)), error: null }),
});
const extrasOrder = (extra = {}) => pending({
  lines: [
    { id: 'SOL-2', sortOrder: 1, serviceZoneId: 'Z-2', productId: 'P-PKG', fgCode: 'FG-SNS-02-001-0012', qty: 48, unit: 'แพ็คเกจ',
      unitPrice: 1200, discountType: 'amount', discountValue: 600, discountAmount: 600, serviceRounds: 12, lineTotal: 57000 },
    { id: 'SOL-1', sortOrder: 0, serviceZoneId: 'Z-1', productId: 'P-PKG', fgCode: 'FG-SNS-02-001-0012', qty: 72, unit: 'แพ็คเกจ',
      unitPrice: 1200, discountType: null, discountValue: 0, discountAmount: 0, serviceRounds: 12, lineTotal: 86400 },
  ],
  installments: [
    { id: 'SOI-1', kind: 'opening', evidence: [
      { storageBucket: PRIVATE_EVIDENCE_BUCKET, storagePath: `sales-orders/${ORDER_ID}/payments/1_a.pdf`, fileName: 'IV-2601.pdf', mimeType: 'application/pdf' },
      { storageBucket: PRIVATE_EVIDENCE_BUCKET, storagePath: `sales-orders/${ORDER_ID}/payments/2_b.jpg`, fileName: 'slip.jpg', mimeType: 'image/jpeg' },
    ] },
    { id: 'SOI-2', kind: 'regular', evidence: [] },
  ],
  ...extra,
});

test('ของเสริม: โซนหนึ่งแถวต่อบรรทัดตามลำดับบนใบ พร้อมไซต์/สถานะใช้งาน · อ่านโซน/ไซต์ซอยลิสต์ + ไล่หน้า', async () => {
  const db = fakeDb({ tables: extrasTables() });
  const extras = await loadHistoricalOrderExtras(db.supabase, extrasOrder(), { todayIso: '2026-09-22' });
  assert.deepEqual(extras.lineZones.map((z) => [z.lineId, z.zoneCode, z.siteCode, z.zoneActive]), [
    ['SOL-1', 'ZN-1', 'ST-1002', true],
    ['SOL-2', 'ZN-2', 'ST-1044', false],
  ]);
  /* ⭐ มติ 23/09: แถวโซนพกบรรทัดแบบใบเสนอราคา (จำนวน · หน่วย · ราคา/หน่วย · ส่วนลด · จำนวนเงิน) — ไม่มี "แพ็ค" แล้ว */
  assert.deepEqual(extras.lineZones.map((z) => [z.fgCode, z.qty, z.unit, z.unitPrice, z.discountAmount, z.lineTotal, z.rounds]), [
    ['FG-SNS-02-001-0012', 72, 'แพ็คเกจ', 1200, 0, 86400, 12],
    ['FG-SNS-02-001-0012', 48, 'แพ็คเกจ', 1200, 600, 57000, 12],
  ]);
  assert.ok(extras.lineZones.every((z) => !('packs' in z)));
  for (const table of ['service_zones', 'service_sites']) {
    const q = db.calls.from.find((c) => c.table === table);
    assert.ok(q.orders.includes('id'), `${table} ต้องเรียง id (ไล่หน้า)`);
  }
});

test('ของเสริม: ไฟล์เอกสารแทนสัญญา — external_doc ไฟล์แรกเป็นตัวเลือก · สัญญาที่ลงนามแล้วใช้ไฟล์ที่ผูกจริง · จำกัดจำนวน', async () => {
  const files = [
    { id: 'A-OTHER', docType: 'other', fileName: 'note.pdf', createdAt: '2026-09-01' },
    { id: 'A-FIRST', docType: 'external_doc', fileName: 'po.pdf', createdAt: '2026-09-02' },
    { id: 'A-SECOND', docType: 'external_doc', fileName: 'po-v2.pdf', createdAt: '2026-09-03' },
  ];
  const db = fakeDb({ tables: extrasTables({ files }) });
  const extras = await loadHistoricalOrderExtras(db.supabase, extrasOrder(), { todayIso: '2026-09-22' });
  assert.deepEqual(extras.serviceContractFiles.filter((f) => f.signedFileCandidate).map((f) => f.id), ['A-FIRST']);
  const read = db.calls.from.find((c) => c.table === 'attachments');
  assert.deepEqual(read.filters, [['eq', 'entityType', 'contract'], ['eq', 'entityId', 'CTR-H1']]);
  assert.equal(read.limit, 50);
  assert.equal(extras.serviceContract, draftContract, 'ใช้สัญญาที่ผู้เรียกโหลดมาแล้ว ไม่อ่านซ้ำ');
  assert.ok(!db.calls.from.some((c) => c.table === 'sales_contracts'));

  const signed = { ...draftContract, status: 'signed', signedFileId: 'A-SECOND' };
  const again = await loadHistoricalOrderExtras(fakeDb({ tables: extrasTables({ files }) }).supabase,
    extrasOrder({ serviceContract: signed }), { todayIso: '2026-09-22' });
  assert.deepEqual(again.serviceContractFiles.filter((f) => f.signedFileCandidate).map((f) => f.id), ['A-SECOND']);

  // ไม่มีสัญญาในมือ = อ่านด้วย id
  const byId = fakeDb({ tables: extrasTables({ files, contract: draftContract }) });
  await loadHistoricalOrderExtras(byId.supabase, extrasOrder({ serviceContract: null }), { todayIso: '2026-09-22' });
  const contractRead = byId.calls.from.find((c) => c.table === 'sales_contracts');
  assert.deepEqual(contractRead.filters, [['eq', 'id', 'CTR-H1']]);
  assert.match(contractRead.selected, /"externalDocKind"/);
  assert.match(contractRead.selected, /metadata/);
});

test('ของเสริม: หลักฐานงวดยกมาส่งแค่ชื่อไฟล์ + ตำแหน่ง (ไม่ส่ง path ของที่เก็บไฟล์)', async () => {
  const extras = await loadHistoricalOrderExtras(fakeDb({ tables: extrasTables() }).supabase, extrasOrder(), { todayIso: '2026-09-22' });
  assert.deepEqual(extras.openingEvidence, [
    { installmentId: 'SOI-1', index: 0, fileName: 'IV-2601.pdf', mimeType: 'application/pdf' },
    { installmentId: 'SOI-1', index: 1, fileName: 'slip.jpg', mimeType: 'image/jpeg' },
  ]);
  assert.ok(!JSON.stringify(extras.openingEvidence).includes('storagePath'));
});

test('ของเสริม: รอบขายที่ยังมีผลของใบอื่นบนโซนเดียวกัน = คำเตือน · ตัดใบตัวเอง · ใบยกเลิก/ถูก Rev. ทับ/หมดช่วง ไม่นับ', async () => {
  const terms = [
    { id: 'T-LIVE', zoneId: 'Z-1', salesOrderId: 'SO-LIVE', startDate: '2026-01-01', endDate: '2026-12-31' },
    { id: 'T-SELF', zoneId: 'Z-1', salesOrderId: ORDER_ID, startDate: null, endDate: null },
    { id: 'T-CANCEL', zoneId: 'Z-2', salesOrderId: 'SO-CANCEL', startDate: null, endDate: null },
    { id: 'T-REV', zoneId: 'Z-2', salesOrderId: 'SO-REV', startDate: null, endDate: null },
    { id: 'T-OLD', zoneId: 'Z-2', salesOrderId: 'SO-OLD', startDate: '2025-01-01', endDate: '2025-12-31' },
  ];
  const termOrders = [
    { id: 'SO-LIVE', orderNumber: 'SO-26010005-0', status: 'approved', supersededById: null },
    { id: ORDER_ID, orderNumber: 'SO-26090191-0', status: 'approved', supersededById: null },
    { id: 'SO-CANCEL', orderNumber: 'SO-X', status: 'cancelled', supersededById: null },
    { id: 'SO-REV', orderNumber: 'SO-Y', status: 'approved', supersededById: 'SO-Z' },
    { id: 'SO-OLD', orderNumber: 'SO-W', status: 'approved', supersededById: null },
  ];
  const db = fakeDb({ tables: extrasTables({ terms, termOrders }) });
  const extras = await loadHistoricalOrderExtras(db.supabase, extrasOrder(), { todayIso: '2026-09-22' });
  assert.deepEqual(extras.liveTermWarnings, [{
    zoneId: 'Z-1', zoneCode: 'ZN-1', zoneName: 'ชั้น G ล็อบบี้', orderId: 'SO-LIVE', orderNumber: 'SO-26010005-0', endDate: '2026-12-31',
  }]);
  assert.deepEqual(db.calls.from.find((c) => c.table === 'service_zone_terms').filters, [['in', 'zoneId', ['Z-1', 'Z-2']]]);
});

/* ⭐ มติ 26/09: ใบที่อาจซ้ำตรวจใหม่ทุกครั้งที่เปิดใบ (ตัวจับคู่ตัวเดียวกับแผนตอนคีย์) — ปิดช่องที่บันทึกของผู้คีย์ปิดไม่ได้
   (ใบที่คนอื่นคีย์หลังยืนยัน · สร้างซ้ำที่ได้ใบเดิมคืนโดยไม่เขียนบันทึกใหม่) + สถานะปัจจุบันของใบที่ผู้คีย์ยืนยันไว้ */
test('ของเสริม: ใบที่อาจซ้ำตอนนี้ + สถานะปัจจุบันของใบย้อนหลังของลูกค้า · ตัดใบตัวเอง · อ่านด้วยตัวกรอง origin', async () => {
  const siblings = [
    { id: ORDER_ID, orderNumber: 'SO-SELF', orderDate: '2026-01-01', status: 'pending_approval' },
    { id: 'SOR-A', orderNumber: 'SO-A', orderDate: '2026-01-01', status: 'approved' },
    { id: 'SOR-B', orderNumber: 'SO-B', orderDate: '2025-05-01', status: 'draft', historicalQuoteRef: 'qt-old-9' },
    { id: 'SOR-C', orderNumber: 'SO-C', orderDate: '2026-01-01', status: 'cancelled' },
    { id: 'SOR-D', orderNumber: 'SO-D', orderDate: '2026-02-01', status: 'approved' },
  ];
  const db = fakeDb({ tables: extrasTables({ siblings }) });
  const extras = await loadHistoricalOrderExtras(db.supabase,
    extrasOrder({ customerId: 'CUS-SPW', orderDate: '2026-01-01', historicalQuoteRef: 'QT-OLD-9' }), { todayIso: '2026-09-22' });
  assert.deepEqual(extras.duplicateCheck.candidates.map((row) => [row.id, row.matchedOn.map((m) => m.kind)]), [
    ['SOR-A', ['startDate']], ['SOR-B', ['ref']],
  ]);
  assert.deepEqual(extras.duplicateCheck.statusById, { 'SOR-A': 'approved', 'SOR-B': 'draft', 'SOR-C': 'cancelled', 'SOR-D': 'approved' });
  const read = db.calls.from.find((q) => q.table === 'sales_orders' && q.filters.some(([, col]) => col === 'customerId'));
  assert.ok(read.filters.some(([op, col, val]) => op === 'eq' && col === 'origin' && val === 'historical'), 'ใบย้อนหลังเท่านั้น (historicalRowsOnly)');
  assert.ok(read.filters.some(([op, col, val]) => op === 'eq' && col === 'customerId' && val === 'CUS-SPW'));
  /* ไม่มีลูกค้า (ข้อมูลเพี้ยน) = ยังไม่รู้ ไม่ใช่ "ไม่มีใบซ้ำ" */
  const noCustomer = await loadHistoricalOrderExtras(fakeDb({ tables: extrasTables({ siblings }) }).supabase,
    extrasOrder({ customerId: null }), { todayIso: '2026-09-22' });
  assert.equal(noCustomer.duplicateCheck, null);
  /* อ่านไม่ขึ้น = โยน (ผู้เรียกตั้ง extrasError) — ไม่กลืนเป็น "ไม่มีใบซ้ำ" */
  const broken = fakeDb({ tables: { ...extrasTables(), sales_orders: (q) => (q.filters.some(([, col]) => col === 'customerId')
    ? { data: null, error: { message: 'siblings boom' } } : { data: [], error: null }) } });
  await assert.rejects(loadHistoricalOrderExtras(broken.supabase, extrasOrder({ customerId: 'CUS-SPW' }), { todayIso: '2026-09-22' }),
    (error) => error?.message === 'siblings boom');
});

test('ของเสริม: อ่านไม่ขึ้น = โยน (ผู้เรียกตั้ง extrasError) · ใบ pipeline = ชุดว่างโดยไม่แตะฐาน', async () => {
  const broken = fakeDb({ tables: { ...extrasTables(), service_zones: { data: null, error: { message: 'boom' } } } });
  await assert.rejects(loadHistoricalOrderExtras(broken.supabase, extrasOrder(), { todayIso: '2026-09-22' }),
    (error) => error?.message === 'boom');
  const pipeline = fakeDb();
  const empty = await loadHistoricalOrderExtras(pipeline.supabase, { id: 'SO-P', origin: 'pipeline' });
  assert.deepEqual(empty.lineZones, []);
  assert.equal(pipeline.calls.from.length, 0);
});

// ── ผลของ trigger ยกเลิกเอกสารแทนสัญญา ─────────────────────────────────────────────────────────
test('ยกเลิก/ลบใบ: บอกว่าสัญญาถูกยกเลิกตาม เฉพาะเอกสารภายนอกที่ชี้กลับใบนี้ · เคยยังไม่ยกเลิก · ตอนนี้ยกเลิกแล้ว', async () => {
  const voided = { ...draftContract, status: 'cancelled' };
  const read = (contract) => fakeDb({ tables: { sales_contracts: { data: contract, error: null } } });
  const hit = read(voided);
  assert.equal(await historicalContractVoided(hit.supabase, order()), voided);
  /* 🔴 ถามด้วย **ตัวชี้กลับ** ไม่ใช่ `serviceContractId` — ต้องเป็นคำถามเดียวกับที่ trigger ข้อ 7e ใช้ตามหา */
  assert.deepEqual(hit.calls.from[0].filters, [
    ['eq', 'source', 'external'], ['eq', 'metadata->>historicalSalesOrderId', ORDER_ID],
  ]);
  // ยังไม่ยกเลิก (ใบอื่นที่ยังมีชีวิตผูกอยู่ — trigger ไม่แตะ) · สัญญาของใบอื่น · ยกเลิกไว้ก่อนแล้ว · อ่านไม่ขึ้น
  assert.equal(await historicalContractVoided(read(draftContract).supabase, order()), null);
  assert.equal(await historicalContractVoided(read({ ...voided, metadata: { historicalSalesOrderId: 'SOR-OTHER' } }).supabase, order()), null);
  assert.equal(await historicalContractVoided(read(voided).supabase, order({ serviceContract: voided })), null);
  const failing = fakeDb({ tables: { sales_contracts: { data: null, error: { message: 'x' } } } });
  assert.equal(await historicalContractVoided(failing.supabase, order()), null);
  // ใบ pipeline = ไม่แตะฐาน (ใบย้อนหลังต้องถามเสมอ แม้ไม่ได้ชี้สัญญาอยู่ — เทสต์ถัดไป)
  const none = fakeDb();
  assert.equal(await historicalContractVoided(none.supabase, order({ origin: 'pipeline' })), null);
  assert.equal(none.calls.from.length, 0);
  assert.equal(voidedContractLabel({ ...voided, contractNo: 'CT-SR-26090007-0' }),
    'ใบสั่งซื้อของลูกค้า (PO) PO-SPW-2026-0118 (CT-SR-26090007-0)');
});

/* 🔴 **ใบที่ถูกถอดสัญญาออกไปก่อนยกเลิก ต้องไม่เงียบ** — trigger ข้อ 7e ตามหาด้วยตัวชี้กลับ ⇒ มันยกเลิกเอกสาร
   ให้จริงแม้ `serviceContractId` เป็น NULL แล้ว · ของเดิมตัวอ่านผลคืน null ทันทีเมื่อใบไม่ชี้สัญญา ⇒ toast/audit
   ของการยกเลิกไม่พูดถึงเอกสารเลย ทั้งที่ HISTORICAL_CORRECTION_PATH สัญญาไว้ว่า "เอกสารแทนสัญญาถูกยกเลิกตาม"
   ⚠️ ไม่มีภาพก่อนหน้าของเอกสารให้เทียบ ⇒ ใช้ "เหตุผลการยกเลิกอ้างเลขใบนี้" แทน (trigger เขียนเลขใบลงไปเสมอ)
     — ยกเลิกค้างมาจากรอบก่อน (เหตุผลไม่อ้างใบนี้) ยังต้องเงียบเหมือนเดิม */
test('🔴 ใบที่ถูกถอดสัญญาออกไปแล้ว: ยังอ่านเจอว่าเอกสารแทนสัญญาถูกยกเลิกตามใบ', async () => {
  const unlinked = (extra = {}) => order({ serviceContractId: null, serviceContract: null, ...extra });
  const voided = (reason) => ({ ...draftContract, status: 'cancelled', cancelReason: reason });
  const read = (contract) => fakeDb({ tables: { sales_contracts: { data: contract, error: null } } });

  const byThisOrder = voided('ใบสั่งขายย้อนหลัง SO-26090191-0 ถูกยกเลิก');
  const hit = read(byThisOrder);
  assert.equal(await historicalContractVoided(hit.supabase, unlinked()), byThisOrder);
  assert.deepEqual(hit.calls.from[0].filters, [
    ['eq', 'source', 'external'], ['eq', 'metadata->>historicalSalesOrderId', ORDER_ID],
  ]);
  // ลบใบก็ทางเดียวกัน (trigger เขียน "ถูกลบ")
  assert.ok(await historicalContractVoided(read(voided('ใบสั่งขายย้อนหลัง SO-26090191-0 ถูกลบ')).supabase, unlinked()));
  // ยกเลิกค้างมาก่อน (แอดมินยกเลิกเอกสารกำพร้าด้วยมือ) = ไม่ใช่ผลของคราวนี้ ⇒ เงียบ
  assert.equal(await historicalContractVoided(read(voided('เอกสารซ้ำ')).supabase, unlinked()), null);
  assert.equal(await historicalContractVoided(read(voided(null)).supabase, unlinked()), null);
  // ยังไม่ถูกยกเลิก (ใบอื่นที่ยังมีชีวิตผูกอยู่ — trigger ไม่แตะ) ⇒ เงียบ
  assert.equal(await historicalContractVoided(read(draftContract).supabase, unlinked()), null);
  // ใบไม่มีเลขที่ = เทียบไม่ได้ ⇒ เงียบ ไม่ใช่เดาว่าใช่
  assert.equal(await historicalContractVoided(read(byThisOrder).supabase, unlinked({ orderNumber: null })), null);
});

// ── ยามต้นทาง ──────────────────────────────────────────────────────────────────────────────────
test('ตัวเดินงานไม่ยืมของการอนุมัติปกติ · เขียนผ่าน RPC เท่านั้น · ไม่มี literal ของ origin', () => {
  const source = readFileSync(join(HERE, 'historicalOrderWorkflow.js'), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  assert.doesNotMatch(code, /import[^;]*\b(freezeInstallments|withLiveAmounts|captureIssuedSalesOrderSnapshot)\b/);
  assert.doesNotMatch(code, /approveSalesOrderWithSignatureEvidence|submitSalesOrderWithSignatureEvidence|signatureEvidence/);
  assert.doesNotMatch(code, /\.(update|insert|upsert|delete)\(/, 'เขียนผ่าน RPC ของ 0374 เท่านั้น (สัญญายกเลิกด้วย trigger)');
  assert.doesNotMatch(code, /financeStatus|actualAmount/);
  assert.doesNotMatch(code, /['"`]historical['"`]/);
  for (const rpc of ["rpc('submit_historical_sales_order'", "rpc('approve_historical_sales_order'"]) {
    assert.ok(code.includes(rpc), rpc);
  }
});
