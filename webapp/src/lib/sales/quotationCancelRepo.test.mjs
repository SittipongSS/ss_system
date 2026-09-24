// ── เส้นเขียนของ "ยกเลิกใบเสนอราคา" บนฐานจำลองในหน่วยความจำ (มติเจ้าของ 24/09) ─────────
//
// ⚠️ ทำไมไม่ทดสอบบนฐานจริง: dev DB = prod DB · ยกเลิกใบคือทางเดียว ย้อนไม่ได้
//    ⇒ ทดสอบลำดับ "เขียนอะไร · มีเงื่อนไขอะไร · ผลข้างเคียงถึงใครบ้าง" ที่นี่แทน
// ⚠️ ผลข้างเคียงทุกตัว (audit · เธรด · สัญญา · FC · แจ้งเตือน) ฉีดเข้าไปเป็นตัวเก็บ — ห้ามให้เทสต์
//    แตะ recordAudit จริง (มันใช้ service-role ของเครื่อง dev = เขียน audit_logs ลง prod)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cancelQuotation, loadQuotationCancelContext, previewQuotationCancel } from './quotationCancelRepo.js';

function fakeDb(seed = {}, { failRead = {} } = {}) {
  const tables = Object.fromEntries(Object.entries(seed).map(([k, rows]) => [k, rows.map((r) => ({ ...r }))]));
  const writes = [];
  const from = (table) => {
    const state = { op: 'select', filters: [], patch: null, limit: null, offset: 0 };
    const matches = (row) => state.filters.every(([kind, col, val]) => {
      if (kind === 'eq') return row[col] === val;
      if (kind === 'neq') return row[col] !== val;
      if (kind === 'in') return val.includes(row[col]);
      return true;
    });
    const run = () => {
      if (state.op === 'select' && failRead[table]) return { data: null, error: { message: `read ${table} failed` } };
      const rows = tables[table] || [];
      if (state.op === 'update') {
        const hit = rows.filter(matches);
        for (const row of hit) Object.assign(row, state.patch);
        writes.push({ table, patch: state.patch, filters: state.filters, count: hit.length });
        return { data: hit.map((r) => ({ ...r })), error: null };
      }
      let out = rows.filter(matches).map((r) => ({ ...r }));
      if (state.limit != null) out = out.slice(state.offset || 0, (state.offset || 0) + state.limit);
      return { data: out, error: null };
    };
    const builder = {
      select() { return builder; },
      update(patch) { state.op = 'update'; state.patch = patch; return builder; },
      eq(col, val) { state.filters.push(['eq', col, val]); return builder; },
      neq(col, val) { state.filters.push(['neq', col, val]); return builder; },
      in(col, val) { state.filters.push(['in', col, val]); return builder; },
      order() { return builder; },
      limit(n) { state.limit = n; return builder; },
      range(from, to) { state.offset = from; state.limit = to - from + 1; return builder; },
      async maybeSingle() {
        const res = run();
        if (res.error) return res;
        return { data: (res.data || [])[0] || null, error: null };
      },
      then(resolve, reject) { return Promise.resolve(run()).then(resolve, reject); },
    };
    return builder;
  };
  return { from, tables, writes };
}

const UPDATED_AT = '2026-09-24T03:00:00.123456+00:00';
const deal = (over = {}) => ({ id: 'DEAL-1', title: 'น้ำหอม 30 ml', code: 'DL-26090001', stage: 'quotation', ownerId: 'u-ae', team: 'ODM', ...over });
const quote = (over = {}) => ({
  id: 'QT1', quoteNumber: 'QT-26090001-0', baseNumber: 'QT-26090001', revisionNo: 0, dealId: 'DEAL-1',
  status: 'sent', approvalStatus: 'approved', updatedAt: UPDATED_AT, metadata: { paymentPresetVersionId: 'PV-1' },
  totalAmount: 1070000, vatAmount: 70000, createdAt: '2026-09-01T00:00:00.000Z',
  deal: deal(),
  ...over,
});
const USER = { id: 'u-sup', name: 'หัวหน้า', role: 'ae_supervisor' };
const REASON = 'ลูกค้าเปลี่ยนสเปคทั้งหมด เสนอใบใหม่แทน';

function spyDeps() {
  const calls = { audit: [], appendEvent: [], syncContracts: [], applyForecast: [], notify: [], appendThread: [] };
  const deps = {
    audit: async (arg) => { calls.audit.push(arg); },
    appendEvent: async (...args) => { calls.appendEvent.push(args); },
    syncContracts: async (...args) => { calls.syncContracts.push(args); return { cancelled: ['CT-D'], warned: ['CT-S'] }; },
    applyForecast: async (...args) => { calls.applyForecast.push(args); return { changed: true, value: 500000, previousValue: 1000000 }; },
    notify: async (...args) => { calls.notify.push(args); return { sent: 1 }; },
    appendThread: async (...args) => { calls.appendThread.push(args); return { row: {}, error: null }; },
  };
  return { calls, deps };
}

const seed = (over = {}) => ({
  quotations: [{ ...quote(), deal: undefined }],
  document_signature_evidence: [],
  sales_contracts: [],
  dept_requests: [],
  dept_request_items: [],
  sales_orders: [],
  ...over,
});

test('⭐ เขียนครั้งเดียวแบบมีเงื่อนไข: status → cancelled · เหตุผลลง metadata.cancel · approvalStatus คงเดิมเป็นประวัติ', async () => {
  const db = fakeDb(seed());
  const { calls, deps } = spyDeps();
  const context = await loadQuotationCancelContext(db, quote());
  const res = await cancelQuotation(db, {
    quote: quote(), context, user: USER, reason: REASON, expectedUpdatedAt: UPDATED_AT,
    now: '2026-09-24T04:00:00.000Z', deps,
  });
  assert.equal(res.error, undefined, res.error);
  const write = db.writes.find((w) => w.table === 'quotations');
  assert.equal(write.count, 1);
  assert.equal(write.patch.status, 'cancelled');
  assert.equal(write.patch.approvalStatus, undefined, 'ไม่แตะ approvalStatus — trigger 0125/0126 จะล้างตัวชี้หลักฐาน');
  assert.equal(write.patch.metadata.paymentPresetVersionId, 'PV-1');
  assert.equal(write.patch.metadata.cancel.reason, REASON);
  assert.equal(write.patch.metadata.cancel.byName, 'หัวหน้า');
  // ด่านกันชนกันอยู่ในคำสั่ง update เอง: id · สถานะที่ยังเดินอยู่ · เวอร์ชันดิบจากจอ (ไม่ผ่าน toISOString)
  assert.deepEqual(write.filters, [
    ['eq', 'id', 'QT1'],
    ['in', 'status', ['draft', 'sent', 'rejected']],
    ['eq', 'updatedAt', UPDATED_AT],
  ]);
  assert.equal(res.data.quotation.status, 'cancelled');
  assert.equal(db.tables.quotations[0].approvalStatus, 'approved');
});

test('เวอร์ชันไม่ตรง (อีกแท็บกดไปก่อน) = 409 ไม่มีผลข้างเคียงสักตัว', async () => {
  const db = fakeDb(seed());
  const { calls, deps } = spyDeps();
  const context = await loadQuotationCancelContext(db, quote());
  const res = await cancelQuotation(db, {
    quote: quote(), context, user: USER, reason: REASON, expectedUpdatedAt: '2026-09-24T02:00:00+00:00', deps,
  });
  assert.equal(res.status, 409);
  assert.match(res.error, /โหลดหน้าใหม่/);
  for (const [name, list] of Object.entries(calls)) assert.equal(list.length, 0, `${name} ต้องไม่ถูกเรียก`);
});

test('ผลข้างเคียงหลังเขียนสำเร็จ: สัญญา (supabase มาก่อน) · เธรดดีล · audit · FC ด้วยเหตุ quotation_cancelled', async () => {
  const db = fakeDb(seed());
  const { calls, deps } = spyDeps();
  const context = await loadQuotationCancelContext(db, quote());
  const res = await cancelQuotation(db, { quote: quote(), context, user: USER, reason: REASON, expectedUpdatedAt: UPDATED_AT, deps });
  // ⚠️ ลำดับอาร์กิวเมนต์ของ syncContractsForQuotation คือ (supabase, { quotation, actor }) — สลับแล้วเงียบ
  assert.equal(calls.syncContracts.length, 1);
  assert.equal(calls.syncContracts[0][0], db);
  assert.equal(calls.syncContracts[0][1].quotation.status, 'cancelled', 'ตัวไล่ปิดต้องเห็นใบที่ยกเลิกแล้ว');
  assert.equal(calls.syncContracts[0][1].actor, USER);
  assert.deepEqual(res.data.contracts, { cancelled: ['CT-D'], warned: ['CT-S'] });

  assert.equal(calls.appendEvent.length, 1);
  assert.equal(calls.appendEvent[0][1].action, 'cancel');
  assert.equal(calls.appendEvent[0][1].opts.reason, REASON);

  assert.equal(calls.audit.length, 1);
  assert.equal(calls.audit[0].entityType, 'quotation');
  assert.match(calls.audit[0].summary, /ยกเลิกใบเสนอราคา QT-26090001-0/);
  assert.match(calls.audit[0].summary, new RegExp(REASON));
  assert.equal(calls.audit[0].after.status, 'cancelled');

  assert.deepEqual(calls.applyForecast.map(([, dealId, opts]) => [dealId, opts.cause]), [['DEAL-1', 'quotation_cancelled']]);
  assert.deepEqual(res.data.forecast, { changed: true, value: 500000, previousValue: 1000000 });
});

test('⭐ ดีล Lost: ยกเลิกได้ แต่ไม่คิด FC ใหม่ (มติ 24/09 — ไม่แก้ประวัติยอดที่เสีย)', async () => {
  const lostQuote = quote({ deal: deal({ stage: 'lost' }) });
  const db = fakeDb(seed());
  const { calls, deps } = spyDeps();
  const context = await loadQuotationCancelContext(db, lostQuote);
  const res = await cancelQuotation(db, { quote: lostQuote, context, user: USER, reason: REASON, expectedUpdatedAt: UPDATED_AT, deps });
  assert.equal(res.error, undefined);
  assert.equal(calls.applyForecast.length, 0);
  assert.deepEqual(res.data.forecast, { changed: false, reason: 'lost_skipped' });
});

test('FC เขียนไม่ผ่าน = ใบยกเลิกไปแล้ว ห้ามตอบ error แต่ต้องส่งคำเตือนกลับ', async () => {
  const db = fakeDb(seed());
  const { deps } = spyDeps();
  deps.applyForecast = async () => { throw new Error('timeout'); };
  const context = await loadQuotationCancelContext(db, quote());
  const res = await cancelQuotation(db, { quote: quote(), context, user: USER, reason: REASON, expectedUpdatedAt: UPDATED_AT, deps });
  assert.equal(res.error, undefined);
  assert.deepEqual(res.data.forecast, { changed: false, warning: 'timeout' });
});

/* ⭐ มติ 24/09: ใบกำกับ/ใบเสร็จที่ออกใน Express ไปแล้ว — เตือน + แจ้งผู้ขอและ FN **ไม่บล็อก** */
test('⭐ คำร้องเอกสารการเงินที่อ้างใบนี้: ลงเธรดคำร้อง (quiet) + กระดิ่งถึงผู้ขอและผู้รับผิดชอบ · ไม่บล็อก', async () => {
  const db = fakeDb(seed({
    dept_requests: [
      { id: 'RQ-1', docNo: 'RQ-26090001', kind: 'billing_doc', status: 'closed', quotationId: 'QT1', requestedById: 'u-ae', assigneeId: 'u-fn', assigneeName: 'FN' },
      { id: 'RQ-9', docNo: 'RQ-26090009', kind: 'billing_doc', status: 'closed', quotationId: 'QT1', requestedById: 'u-ae' },
      { id: 'RQ-X', docNo: 'RQ-26090010', kind: 'billing_doc', status: 'pending', quotationId: 'QT-OTHER', requestedById: 'u-ae' },
    ],
    dept_request_items: [{ requestId: 'RQ-1', docNumber: 'IV-6909-001' }],
  }));
  const { calls, deps } = spyDeps();
  const context = await loadQuotationCancelContext(db, quote());
  const res = await cancelQuotation(db, { quote: quote(), context, user: USER, reason: REASON, expectedUpdatedAt: UPDATED_AT, deps });
  assert.equal(res.error, undefined, 'มีเลขเอกสารการเงินแล้วก็ยังยกเลิกได้');
  assert.equal(res.data.notifiedRequests, 1);

  assert.equal(calls.appendThread.length, 1);
  const [threadDb, row] = calls.appendThread[0];
  assert.equal(threadDb, db);
  assert.equal(row.entityType, 'dept_request');
  assert.equal(row.entityId, 'RQ-1');
  assert.equal(row.kind, 'quotation_cancelled');
  assert.match(row.body, /QT-26090001-0/);
  assert.match(row.body, /IV-6909-001/);
  assert.match(row.body, new RegExp(REASON));

  assert.equal(calls.notify.length, 1);
  const [, notice] = calls.notify[0];
  assert.deepEqual(notice.userIds, ['u-ae', 'u-fn']);
  assert.equal(notice.entityType, 'dept_request', 'กระดิ่งรับ dept_request ทั้ง entity อยู่แล้ว');
  assert.equal(notice.entityId, 'RQ-1');
  assert.equal(notice.dedupeKey, 'QTCANCEL-QT1-RQ-1');
  assert.match(notice.title, /QT-26090001-0/);
});

test('ใบสั่งขายที่ยังใช้อยู่บนใบนี้ = 409 ก่อนเขียนอะไร · พรีวิวบอกเหตุเดียวกัน', async () => {
  const db = fakeDb(seed({ sales_orders: [{ id: 'SO-1', orderNumber: 'SO-26090001-0', status: 'approved', quotationId: 'QT1' }] }));
  const { calls, deps } = spyDeps();
  const context = await loadQuotationCancelContext(db, quote());
  const res = await cancelQuotation(db, { quote: quote(), context, user: USER, reason: REASON, expectedUpdatedAt: UPDATED_AT, deps });
  assert.equal(res.status, 409);
  assert.match(res.error, /SO-26090001-0/);
  assert.equal(db.writes.length, 0);
  assert.equal(calls.audit.length, 0);
  const preview = await previewQuotationCancel(db, quote(), { context });
  assert.match(preview.blocked, /SO-26090001-0/);
});

test('context: หลักฐานลายเซ็นนับทั้งแถวหลักฐานและตัวชี้บนใบ · อ่านไม่ขึ้น = โยน (ไม่ใช่ถือว่าไม่มี)', async () => {
  const withRow = fakeDb(seed({ document_signature_evidence: [{ id: 'EV-1', quotationId: 'QT1' }] }));
  assert.equal((await loadQuotationCancelContext(withRow, quote({ approvalStatus: 'not_submitted', status: 'draft' }))).hasSignatureEvidence, true);
  const pointerOnly = fakeDb(seed());
  assert.equal((await loadQuotationCancelContext(pointerOnly, quote({ signatureEvidenceId: 'EV-2' }))).hasSignatureEvidence, true);
  assert.equal((await loadQuotationCancelContext(pointerOnly, quote())).hasSignatureEvidence, false);
  const broken = fakeDb(seed(), { failRead: { dept_requests: true } });
  await assert.rejects(() => loadQuotationCancelContext(broken, quote()), /dept_requests/);
});

test('พรีวิว FC ใช้ตัวตัดสินเดียวกับตอนเขียน — ใบที่ชี้อยู่ถูกจำลองเป็น cancelled', async () => {
  const followed = deal({ projectValue: 1000000, forecastManualValue: 400000, forecastSource: 'quotation', forecastQuotationId: 'QT1' });
  const db = fakeDb(seed());
  const preview = await previewQuotationCancel(db, quote({ deal: followed }));
  assert.deepEqual(
    { changed: preview.forecast.changed, before: preview.forecast.before, after: preview.forecast.after, reason: preview.forecast.reason },
    { changed: true, before: 1000000, after: 400000, reason: 'pointer_gone' },
  );
  const lost = await previewQuotationCancel(db, quote({ deal: { ...followed, stage: 'lost' } }));
  assert.equal(lost.forecast.skipped, 'lost');
  assert.equal(lost.forecast.changed, false);
});
