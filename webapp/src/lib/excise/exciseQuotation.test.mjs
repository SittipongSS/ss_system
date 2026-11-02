// ── ใบเสนอราคาค่าสรรพสามิต (แผนรื้อสรรพสามิต PR3 · mig 0415) ─────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  EXCISE_LINES_LOCKED_MESSAGE, ExciseQuotationError, LIVE_EXCISE_QUOTATION_STATUSES, acceptExciseQuotation,
  createExciseQuotationDraft, exciseHandledOrderIds, exciseQuotationBlocker, exciseQuotationOverrides, exciseQuotationReference,
  exciseSourceLock, isLiveExciseQuotation, previewExciseQuotationDraft,
} from './exciseQuotation.js';
import { EXCISE_CHARGE_PREVIEW_ID } from './exciseChargeProduct.js';
import { newExciseQuotationHref } from './exciseQuotationLinks.js';
import {
  EXCISE_NOT_BILLED_KINDS, exciseNotBilledBlocker, exciseNotBilledInput, exciseNotBilledPatch,
} from './exciseNotBilled.js';
import { FILING_CREATE_CLOSED_MESSAGE, SA_FILING_CREATE_OPEN } from './workflow.js';
import { canCancelQuotation, isCancellableQuotation, quotationApprovalDeal } from '../sales/quotationWorkflow.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const code = (path) => read(path).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const approvedOrder = (over = {}) => ({
  id: 'SO-1', orderNumber: 'SO-26100001-0', origin: 'pipeline', status: 'approved', supersededById: null,
  exciseNotBilledKind: null, quotationId: 'QT-SRC', customerId: 'C-1', customerName: 'ลูกค้า', deal: { ownerId: 'U-OWNER' }, ...over,
});

// ── 1. ด่านออกใบ ───────────────────────────────────────────────────────────────────────────
test('exciseQuotationBlocker: ออกได้เฉพาะ SO pipeline ที่อนุมัติอยู่ · ไม่ถูกแทน · ไม่ตัดสินไม่เรียกเก็บ · ยังไม่มีใบที่มีผล', () => {
  assert.equal(exciseQuotationBlocker(approvedOrder()), null);
  assert.match(exciseQuotationBlocker(approvedOrder({ origin: 'historical' })), /ย้อนหลัง/);
  assert.match(exciseQuotationBlocker(approvedOrder({ origin: 'excise' })), /ค่าสรรพสามิตอยู่แล้ว/);
  assert.match(exciseQuotationBlocker(approvedOrder({ status: 'pending_approval' })), /อนุมัติแล้ว/);
  assert.match(exciseQuotationBlocker(approvedOrder({ supersededById: 'SO-2' })), /Rev/);
  assert.match(exciseQuotationBlocker(approvedOrder({ exciseNotBilledKind: 'not_liable' })), /ไม่เรียกเก็บ/);
  assert.match(exciseQuotationBlocker(approvedOrder(), { liveQuote: { quoteNumber: 'QT-9' } }), /QT-9.*1 ใบสั่งขาย = 1 ใบ/);
  assert.equal(exciseQuotationBlocker(null), 'ไม่พบใบสั่งขาย');
});

test('ใบที่ "ยังมีผล" = ร่าง/ส่งแล้ว/ตีกลับ/รับแล้ว ของใบ excise เท่านั้น · คำอ้างอิงบนกระดาษ', () => {
  assert.deepEqual([...LIVE_EXCISE_QUOTATION_STATUSES], ['draft', 'sent', 'rejected', 'accepted']);
  assert.equal(isLiveExciseQuotation({ origin: 'excise', status: 'accepted' }), true);
  assert.equal(isLiveExciseQuotation({ origin: 'excise', status: 'cancelled' }), false);
  assert.equal(isLiveExciseQuotation({ origin: 'pipeline', status: 'draft' }), false);
  // มติ 29/10: เลข SO / QT ต้นทางเท่านั้น (คำว่า "ค่าภาษีสรรพสามิต" อยู่ช่อง "โครงการ")
  assert.equal(exciseQuotationReference({ orderNumber: 'SO-1' }, { quoteNumber: 'QT-1' }), 'SO-1 / QT-1');
  assert.equal(exciseQuotationReference({ orderNumber: 'SO-1' }, null), 'SO-1');
});

/* supabase ปลอมของเส้นสร้างใบ — จดคำสั่งเขียนไว้ตรวจ · ไม่มีการเขียนฐานจริง */
function createDb({ liveQuote = null, lines, products, registrations = [] } = {}) {
  const writes = [];
  const select = (table) => {
    const q = { table, filters: [] };
    const result = () => {
      if (table === 'quotations' && q.filters.some(([c]) => c === 'sourceSalesOrderId')) return { data: liveQuote ? [liveQuote] : [], error: null };
      if (table === 'quotations') return { data: { id: 'QT-SRC', quoteNumber: 'QT-26100001-0', customerName: 'ลูกค้า', docLanguage: 'th', billingAddress: 'ที่อยู่' }, error: null };
      if (table === 'sales_orders') return { data: { ...approvedOrder(), lines }, error: null };
      if (table === 'customers' && q.filters.some(([c]) => c === 'id')) return { data: { id: 'C-1', arCode: 'AR-108', name: 'ลูกค้า' }, error: null };
      if (table === 'customers') return { data: [], error: null };
      if (table === 'products') return { data: products, error: null };
      if (table === 'product_types') return { data: [{ mainCategoryCode: '01', typeCode: '002', isExcise: true }], error: null };
      if (table === 'excise_registrations') return { data: registrations, error: null };
      return { data: null, error: null };
    };
    const b = {
      select() { return b; }, eq(c, v) { q.filters.push([c, v]); return b; }, in(c, v) { q.filters.push([c, v]); return b; },
      order() { return b; }, limit: async () => result(), maybeSingle: async () => result(), range: async () => result(),
      then: (resolve) => resolve(result()),
      insert(rows) { writes.push({ table, rows }); return { select: async () => ({ data: rows, error: null }) }; },
      delete() { writes.push({ table, op: 'delete' }); return { eq: async () => ({ error: null }) }; },
    };
    return b;
  };
  return {
    writes,
    from: select,
    rpc: async (name, args) => {
      writes.push({ rpc: name, args });
      return { data: { ...args.p_row, quoteNumber: 'QT-26100050-0', baseNumber: 'QT-26100050' }, error: null };
    },
  };
}
const FG = { id: 'P-1', fgCode: 'FG-0108-01-002-00001', exciseTax: 8.044, localTax: 0.8044, retailPriceIncVat: 107.5, isExciseTaxable: true };
const SO_LINE = { id: 'L-1', productId: 'P-1', fgCode: FG.fgCode, qty: 10, unit: 'ขวด', description: 'น้ำหอม A' };
const chargeProduct = { id: 'PRD-X', fgCode: 'FG-0108-04-003', categoryCode: '04-003', customerId: 'C-1' };

test('createExciseQuotationDraft: ใบ origin excise ไม่มีดีล ผูก SO · บรรทัดภาษี/ชิ้นปัดครั้งเดียว · VAT 7% · ไม่มีส่วนลด · audit ผ่านตัวที่ส่งเข้า', async () => {
  const db = createDb({ lines: [SO_LINE], products: [FG] });
  const audits = [];
  const result = await createExciseQuotationDraft({
    supabase: db, user: { id: 'U-SA', name: 'SA' }, order: approvedOrder(),
    audit: async (entry) => { audits.push(entry); },
    ensureProduct: async () => ({ product: chargeProduct, created: true }),
  });
  const row = db.writes.find((w) => w.rpc === 'create_quotation_with_number').args.p_row;
  assert.equal(row.origin, 'excise');
  assert.equal(row.dealId, null);
  assert.equal(row.sourceSalesOrderId, 'SO-1');
  assert.equal(row.vatRate, 7);
  assert.equal(row.discountType, null);
  assert.equal(row.approvalStatus, 'not_submitted');
  assert.equal(row.referenceNote, 'SO-26100001-0 / QT-26100001-0');
  assert.deepEqual(row.paymentPlan, { type: 'full' });
  assert.equal(row.subtotal, 88.5, '10 × 8.85');
  assert.equal(row.totalAmount, 94.7, '+VAT 7%');
  const lines = db.writes.find((w) => w.table === 'quotation_lines').rows;
  assert.equal(lines.length, 1);
  assert.equal(lines[0].productId, 'PRD-X');
  assert.equal(lines[0].unitPrice, 8.85);
  assert.equal(lines[0].quotationId, row.id);
  assert.equal('packQty' in lines[0], false);
  assert.equal(result.chargeProductCreated, true);
  assert.equal(audits.length, 1);
});

test('createExciseQuotationDraft: มีใบที่มีผลแล้ว = 409 · ไม่มีราคาขายปลีก = 400 บอก FG · ไม่มีสินค้าสรรพสามิต = 400 — ก่อนเขียนอะไร', async () => {
  const deps = { user: { id: 'U-SA' }, audit: async () => {}, ensureProduct: async () => ({ product: chargeProduct }) };
  const live = createDb({ liveQuote: { id: 'QT-L', quoteNumber: 'QT-L', origin: 'excise', status: 'draft' }, lines: [SO_LINE], products: [FG] });
  await assert.rejects(createExciseQuotationDraft({ supabase: live, order: approvedOrder(), ...deps }),
    (e) => e instanceof ExciseQuotationError && e.status === 409 && e.extra.quotationId === 'QT-L');
  const unpriced = createDb({ lines: [SO_LINE], products: [{ ...FG, exciseTax: 0, localTax: 0, retailPriceIncVat: null }] });
  await assert.rejects(createExciseQuotationDraft({ supabase: unpriced, order: approvedOrder(), ...deps }),
    (e) => e instanceof ExciseQuotationError && e.status === 400 && /ราคาขายปลีก.*FG-0108-01-002-00001/.test(e.message));
  const none = createDb({ lines: [{ ...SO_LINE, fgCode: 'FG-0108-01-001-00009' }], products: [{ ...FG, fgCode: 'FG-0108-01-001-00009', isExciseTaxable: false }] });
  await assert.rejects(createExciseQuotationDraft({ supabase: none, order: approvedOrder(), ...deps }), /ไม่มีรายการสินค้าที่ต้องเสียภาษี/);
  for (const db of [live, unpriced, none]) {
    assert.equal(db.writes.filter((w) => w.rpc || w.table).length, 0, 'ปฏิเสธก่อนออกเลข/เขียนบรรทัด');
  }
});

// ── 1b. หน้าออกใบใหม่ "แก้ก่อนบันทึก" (มติเจ้าของ 29/10) ─────────────────────────────────────────────
test('exciseQuotationOverrides: รับเฉพาะหัวใบ · วันผิดรูป/ยืนราคาก่อนวันออก/งวดไม่ครบ 100%/ภาษาแปลก = ข้อความไทย', () => {
  assert.deepEqual(exciseQuotationOverrides({}), { value: {} }, 'ไม่ส่ง = ค่าตั้งต้นของใบ');
  const ok = exciseQuotationOverrides({
    quoteDate: '2026-10-29', validUntil: '2026-11-28', referenceNote: '  SO-1 / QT-1 ', notes: '', paymentTerms: 'โอน',
    paymentPlan: { type: 'installment', installments: [{ label: 'มัดจำ', percent: 50 }, { label: 'ส่งมอบ', percent: 50 }] },
    docLanguage: 'en', metadata: { remarksPresetVersionId: 'V-1' },
    lines: [{ unitPrice: 1 }], vatRate: 0, discountValue: 99,
  });
  assert.equal(ok.error, undefined);
  assert.equal(ok.value.quoteDate, '2026-10-29');
  assert.equal(ok.value.validUntil, '2026-11-28');
  assert.equal(ok.value.referenceNote, 'SO-1 / QT-1');
  assert.equal(ok.value.notes, null, 'ช่องว่าง = null');
  assert.equal(ok.value.docLanguage, 'en');
  assert.deepEqual(ok.value.presets, { paymentPresetVersionId: null, remarksPresetVersionId: 'V-1' });
  for (const key of ['lines', 'vatRate', 'discountValue', 'discountType']) assert.equal(key in ok.value, false, `${key} มาจาก SO ต้นทางเท่านั้น`);
  assert.equal(exciseQuotationOverrides({ validUntil: '' }).value.validUntil, null);
  assert.match(exciseQuotationOverrides({ quoteDate: '29/10/2026' }).error, /วันที่ใบเสนอราคา/);
  assert.match(exciseQuotationOverrides({ quoteDate: '2026-10-29', validUntil: '2026-10-01' }).error, /ไม่ก่อนวันที่/);
  assert.match(exciseQuotationOverrides({ paymentPlan: { type: 'installment', installments: [{ percent: 40 }] } }).error, /100%/);
  assert.match(exciseQuotationOverrides({ docLanguage: 'jp' }).error, /th หรือ en/);
});

test('previewExciseQuotationDraft: ได้หัวใบ+บรรทัดแบบเดียวกับที่บันทึก · ไม่ออกเลข ไม่เขียนบรรทัด ไม่สร้างสินค้า 04-003', async () => {
  const db = createDb({ lines: [SO_LINE], products: [FG] });
  const preview = await previewExciseQuotationDraft({
    supabase: db, user: { id: 'U-SA', name: 'SA' }, order: approvedOrder({ deal: { id: 'D-1', title: 'ดีลต้นทาง', ownerId: 'U-OWNER', ownerName: 'AE' } }),
    ensureProduct: async () => ({ product: { id: EXCISE_CHARGE_PREVIEW_ID, fgCode: 'FG-0108-04-003', productDescription: 'ค่าภาษีสรรพสามิต' }, pending: true }),
  });
  assert.equal(db.writes.length, 0, 'พรีวิวไม่เขียนอะไรเลย');
  assert.equal(preview.chargeProductPending, true);
  assert.equal(preview.quote.origin, 'excise');
  assert.equal(preview.quote.dealId, null);
  assert.equal(preview.quote.quoteNumber, undefined, 'ยังไม่มีเลข');
  assert.equal(preview.quote.referenceNote, 'SO-26100001-0 / QT-26100001-0');
  assert.equal(preview.quote.subtotal, 88.5);
  assert.equal(preview.quote.totalAmount, 94.7);
  assert.equal(preview.quote.lines.length, 1);
  assert.equal(preview.quote.lines[0].unitPrice, 8.85);
  assert.deepEqual(preview.sourceOrder, { id: 'SO-1', orderNumber: 'SO-26100001-0' });
  assert.deepEqual(preview.sourceDeal, { id: 'D-1', title: 'ดีลต้นทาง', ownerName: 'AE' });
  // ด่านเดียวกับทางบันทึก — มีใบที่มีผลแล้ว = 409 พร้อมเลขใบให้หน้าเปิด
  const live = createDb({ liveQuote: { id: 'QT-L', quoteNumber: 'QT-L', origin: 'excise', status: 'draft' }, lines: [SO_LINE], products: [FG] });
  await assert.rejects(previewExciseQuotationDraft({ supabase: live, user: {}, order: approvedOrder(), ensureProduct: async () => ({ product: chargeProduct }) }),
    (e) => e instanceof ExciseQuotationError && e.status === 409 && e.extra.quotationId === 'QT-L');
});

test('createExciseQuotationDraft + overrides: หัวใบที่แก้บนหน้าออกใบลงฐานตามนั้น · ชุดเงื่อนไขผ่านตัวตรวจที่ส่งเข้า · บรรทัดยังคิดจาก SO', async () => {
  const db = createDb({ lines: [SO_LINE], products: [FG] });
  const presetCalls = [];
  const { value } = exciseQuotationOverrides({
    quoteDate: '2026-10-30', validUntil: '2026-11-29', referenceNote: 'อ้างถึง PO-77', notes: 'หมายเหตุ', paymentTerms: 'เครดิต 30 วัน',
    paymentPlan: { type: 'full', paymentMethod: 'โอน' }, metadata: { paymentPresetVersionId: 'PV-1', remarksPresetVersionId: 'RV-X' },
  });
  await createExciseQuotationDraft({
    supabase: db, user: { id: 'U-SA' }, order: approvedOrder(), overrides: value,
    audit: async () => {}, ensureProduct: async () => ({ product: chargeProduct }),
    resolvePresets: async (_db, presets) => { presetCalls.push(presets); return { payment: 'PV-1', remarks: null }; },
  });
  const row = db.writes.find((w) => w.rpc === 'create_quotation_with_number').args.p_row;
  assert.equal(row.quoteDate, '2026-10-30');
  assert.equal(row.validUntil, '2026-11-29');
  assert.equal(row.referenceNote, 'อ้างถึง PO-77', 'คนพิมพ์ทับ = ไม่ใช้คำอ้างอิงอัตโนมัติ');
  assert.equal(row.notes, 'หมายเหตุ');
  assert.equal(row.paymentTerms, 'เครดิต 30 วัน');
  assert.deepEqual(row.paymentPlan, { type: 'full', paymentMethod: 'โอน' });
  assert.equal(row.metadata.paymentPresetVersionId, 'PV-1');
  assert.equal(row.metadata.remarksPresetVersionId, null, 'ชุดที่ตรวจไม่ผ่าน = ไม่ตรึง');
  assert.equal(row.metadata.exciseSource.salesOrderId, 'SO-1');
  assert.equal(presetCalls.length, 1);
  assert.equal(row.subtotal, 88.5, 'บรรทัด/ยอดไม่ขยับตามหัวใบ');
});

test('ปุ่มบน SO ลูกค้าพาไปหน้าออกใบ (ไม่ยิง POST) · หน้าออกใบโหลดพรีวิวแล้วบันทึกทางเดิมพร้อมหัวใบ · route แยกพรีวิว', () => {
  assert.equal(newExciseQuotationHref('SO-1', '/sa/sales-orders/SO-1'), '/sa/quotations/new-excise?salesOrderId=SO-1&returnTo=%2Fsa%2Fsales-orders%2FSO-1');
  assert.equal(newExciseQuotationHref('SO-1'), '/sa/quotations/new-excise?salesOrderId=SO-1');
  const soPage = code('../../app/sales-planning/sales-orders/[id]/page.js');
  const createFn = soPage.match(/function createExciseQuote\(\) \{[\s\S]*?\n  \}/)?.[0] || '';
  assert.match(createFn, /router\.push\(newExciseQuotationHref\(id,/);
  assert.doesNotMatch(soPage, /excise-quotation`,\s*\{\s*method:\s*"POST"/, 'SO ลูกค้าไม่ออกใบเองแล้ว');
  const page = code('../../app/sales-planning/quotations/new-excise/page.js');
  assert.match(page, /excise-quotation\?preview=1/);
  assert.match(page, /method: "POST",\s*json: \{[\s\S]*?quoteDate,[\s\S]*?paymentPlan,[\s\S]*?\}/);
  assert.match(page, /<QuotationLineItems[^>]*editable=\{false\}/, 'บรรทัดอ่านอย่างเดียว — คิดจาก SO');
  for (const shared of ['QuotationInstallments', 'QuotationPaymentTerms', 'QuotationNotes', 'DateInput']) assert.match(page, new RegExp(`<${shared}[\\s>]`), `${shared} ตัวเดียวกับหน้าใบ`);
  assert.match(page, /router\.push\(`\/sa\/quotations\/\$\{encodeURIComponent\(data\.quote\.id\)\}`\)/);
  const route = code('../../app/api/sales-planning/sales-orders/[id]/excise-quotation/route.js');
  assert.match(route, /searchParams\.get\('preview'\) === '1'[\s\S]*?canEditSalesPlanning\(user\)[\s\S]*?loadScoped\(supabase, 'sales_orders', id, user, 'edit'\)[\s\S]*?previewExciseQuotationDraft/);
  assert.match(route, /exciseQuotationOverrides\(body \|\| \{\}\)[\s\S]*?if \(overrides\.error\) return fail\(overrides\.error, 400\)[\s\S]*?createExciseQuotationDraft\(\{[^}]*overrides: overrides\.value/);
});

// ── 2. รับใบ ─────────────────────────────────────────────────────────────────────────────
test('acceptExciseQuotation: ต้องอนุมัติแล้ว · รหัสของ RPC เป็นข้อความไทย + สถานะ HTTP · สำเร็จไม่แตะดีล', async () => {
  const quote = {
    id: 'QX', quoteNumber: 'QT-X', origin: 'excise', status: 'sent', approvalStatus: 'approved', lines: [{ id: 'L', qty: 1, unitPrice: 10, lineTotal: 10 }],
  };
  const notApproved = await acceptExciseQuotation({ supabase: {}, quote: { ...quote, approvalStatus: 'pending' }, audit: async () => {} });
  assert.equal(notApproved.status, 400);
  const fail = (message) => ({ rpc: async () => ({ data: null, error: { message } }), from: () => ({ insert: async () => ({}) }) });
  const stale = await acceptExciseQuotation({ supabase: fail('quotation_approval_stale'), quote: { ...quote, approvalFingerprint: 'x' }, audit: async () => {} });
  assert.equal(stale.status, 400, 'fingerprint ไม่ตรงถูกจับก่อนเรียก RPC');
  const fp = (await import('../sales/quotationApprovalFingerprint.js')).quotationApprovalFingerprint({ ...quote });
  const ready = { ...quote, approvalFingerprint: fp };
  for (const [code, status] of [['excise_source_already_accepted', 409], ['excise_source_order_invalid', 409], ['excise_source_not_billed', 409]]) {
    const out = await acceptExciseQuotation({ supabase: fail(code), quote: ready, audit: async () => {} });
    assert.equal(out.status, status, code);
    assert.doesNotMatch(out.error, /excise_/, 'ไม่หลุดรหัสดิบ');
  }
});

// ── 3. ล็อก SO ลูกค้า (Q16) + คิวของ SA ───────────────────────────────────────────────────
const liveDb = (rows, orderRows = []) => ({
  from: (table) => {
    const data = table === 'sales_orders' ? orderRows : rows;
    const b = {
      select() { return b; }, eq() { return b; }, in() { return b; }, order() { return b; }, neq() { return b; }, is() { return b; },
      limit: async () => ({ data, error: null }), range: async () => ({ data, error: null }),
    };
    return b;
  },
});

test('exciseSourceLock: ใบที่ยังมีผล = ย้อนอนุมัติ/ออก Rev./ยกเลิก ไม่ได้ พร้อมเลขใบ · ไม่มีใบ/ใบ excise เอง/action อื่น = ไม่ล็อก', async () => {
  const db = liveDb([{ id: 'QX', quoteNumber: 'QT-26100099-0', origin: 'excise', status: 'accepted' }]);
  for (const action of ['revoke', 'revise', 'cancel']) {
    const lock = await exciseSourceLock(db, approvedOrder(), action);
    assert.equal(lock.status, 409);
    assert.match(lock.error, /QT-26100099-0/);
  }
  assert.equal(await exciseSourceLock(db, approvedOrder(), 'approve'), null);
  assert.equal(await exciseSourceLock(db, approvedOrder({ origin: 'excise' }), 'cancel'), null);
  assert.equal(await exciseSourceLock(liveDb([]), approvedOrder(), 'cancel'), null);
});

test('exciseHandledOrderIds: ตัดสินไม่เรียกเก็บ + มีใบค่าภาษีที่มีผล = จัดการแล้ว (ไม่อยู่ในคิว SA)', async () => {
  const db = liveDb([{ id: 'QX', sourceSalesOrderId: 'SO-2', status: 'draft' }]);
  const handled = await exciseHandledOrderIds(db, [
    { id: 'SO-1', exciseNotBilledKind: 'collected_outside' }, { id: 'SO-2' }, { id: 'SO-3' },
  ]);
  assert.deepEqual([...handled].sort(), ['SO-1', 'SO-2']);
});

test('exciseHandledOrderIds (PR4): ลูกค้ารับใบแล้วแต่ยังไม่ออก SO ค่าสรรพสามิต = ยังค้างคิว · มี SO แล้ว = จัดการแล้ว', async () => {
  const quotes = [
    { id: 'QX-A', sourceSalesOrderId: 'SO-A', status: 'accepted' },
    { id: 'QX-B', sourceSalesOrderId: 'SO-B', status: 'accepted' },
  ];
  const handled = await exciseHandledOrderIds(liveDb(quotes, [{ id: 'SOR-B', quotationId: 'QX-B' }]), [{ id: 'SO-A' }, { id: 'SO-B' }]);
  assert.deepEqual([...handled], ['SO-B']);
});

// ── 4. ไม่เรียกเก็บในระบบ ─────────────────────────────────────────────────────────────────
test('exciseNotBilledInput / Blocker / Patch — ตรงกับ CHECK ของ 0414 ทุกข้อ', () => {
  assert.equal(Object.keys(EXCISE_NOT_BILLED_KINDS).join(), 'collected_outside,included_in_price,not_liable');
  assert.match(exciseNotBilledInput({ kind: 'x', reason: 'เหตุผลยาวพอสมควร' }).error, /เลือกเหตุ/);
  assert.match(exciseNotBilledInput({ kind: 'not_liable', reason: 'สั้น' }).error, /10–500/);
  assert.match(exciseNotBilledInput({ kind: 'not_liable', reason: 'เหตุผลยาวพอสมควร', ref: 'x'.repeat(101) }).error, /100/);
  assert.deepEqual(exciseNotBilledInput({ kind: 'not_liable', reason: '  เหตุผลยาวพอสมควร  ', ref: ' ' }).value,
    { kind: 'not_liable', reason: 'เหตุผลยาวพอสมควร', ref: null });
  assert.equal(exciseNotBilledBlocker(approvedOrder()), null);
  assert.match(exciseNotBilledBlocker(approvedOrder(), { liveQuote: { quoteNumber: 'QT-1' } }), /QT-1/);
  assert.match(exciseNotBilledBlocker(approvedOrder({ origin: 'historical' })), /จากใบเสนอราคา/);
  assert.match(exciseNotBilledBlocker(approvedOrder({ exciseNotBilledKind: 'not_liable' }), { clearing: true, filing: { id: 'ET-1' } }), /ET-1/);
  assert.equal(exciseNotBilledBlocker(approvedOrder({ exciseNotBilledKind: 'not_liable' }), { clearing: true }), null);
  const set = exciseNotBilledPatch({ kind: 'not_liable', reason: 'เหตุผลยาวพอสมควร', ref: null }, { user: { id: 'U', name: 'SA' }, at: 'T' });
  assert.deepEqual(Object.values(set).filter((v) => v === null), [null], 'ref ว่างได้ช่องเดียว');
  assert.deepEqual(Object.values(exciseNotBilledPatch(null)).filter((v) => v !== null), [], 'ล้าง = ว่างทั้งชุด');
});

// ── 5. ยกเลิกใบค่าภาษีที่รับแล้ว · ผู้อนุมัติ = ดีลต้นทาง ────────────────────────────────────────────
test('ใบค่าสรรพสามิตที่ลูกค้ารับแล้วยกเลิกได้ (ปลดล็อก SO ลูกค้า) · ใบปกติที่รับแล้วยังต้องย้อนการรับก่อน', () => {
  assert.equal(isCancellableQuotation({ origin: 'excise', status: 'accepted', approvalStatus: 'approved' }), true);
  assert.equal(isCancellableQuotation({ origin: 'pipeline', status: 'accepted', approvalStatus: 'approved' }), false);
  assert.equal(canCancelQuotation({ origin: 'excise', status: 'accepted', approvalStatus: 'approved' }, { approver: true, canEdit: true, inScope: true }), true);
  assert.deepEqual(quotationApprovalDeal({ origin: 'excise', deal: null, sourceDeal: { ownerId: 'U-1' } }), { ownerId: 'U-1' });
  assert.deepEqual(quotationApprovalDeal({ origin: 'pipeline', deal: { ownerId: 'U-2' }, sourceDeal: { ownerId: 'U-1' } }), { ownerId: 'U-2' });
});

// ── 6. ทาง route — ต่อสายถูกที่ (ยึดรูปจาก source) ──────────────────────────────────────────────
/* PR3 ปิดทางสร้างของฝ่ายขาย · PR5 เปิดทางของ RA เป็นเส้นใหม่: from-sales-order POST = ra:approve เท่านั้น ·
   POST /api/orders (สร้างเองแบบเลือกทะเบียน) ยังปิดถาวร */
test('🔴 ปิดทางสร้างใบยื่นของฝ่ายขาย — สร้างเองปิดถาวร · จาก SO เหลือ RA (ด่านมาก่อนอ่านคำขอ/ฐาน) · สวิตช์ปิด', () => {
  assert.equal(SA_FILING_CREATE_OPEN, false, 'ห้ามเปิดกลับ — ทางของ RA (PR5) เป็นเส้นใหม่');
  assert.match(FILING_CREATE_CLOSED_MESSAGE, /ใบเสนอราคาค่าสรรพสามิต/);
  const gates = [
    ['../../app/api/orders/route.js', 'if (!SA_FILING_CREATE_OPEN) return Response.json({ error: FILING_CREATE_CLOSED_MESSAGE }, { status: 403 });'],
    ['../../app/api/tax/orders/from-sales-order/route.js', 'if (!can(user.role, "ra:approve")) return forbidden();'],
  ];
  for (const [path, line] of gates) {
    const src = code(path);
    const post = src.slice(src.search(/export (const|async function) POST/));
    const gate = post.indexOf(line);
    assert.ok(gate > 0, `${path}: ไม่มีด่าน`);
    assert.ok(gate < post.indexOf('await '), `${path}: ด่านต้องมาก่อนอ่านคำขอ/ฐานทุกอย่าง`);
  }
  assert.doesNotMatch(code('../../app/api/tax/orders/from-sales-order/route.js').slice(
    code('../../app/api/tax/orders/from-sales-order/route.js').search(/export const POST/)), /sales:act/, 'ฝ่ายขายต้องไม่มีทางสร้างกลับมา');
});

test('route ใบเสนอราคาแตกสาขาใบค่าสรรพสามิต: PATCH ล็อกบรรทัด + คิดใหม่ · Rev. ล็อกบรรทัด · รับใบ → RPC แยก · ย้อนการรับปฏิเสธ', () => {
  const patch = code('../../app/api/sales-planning/quotations/[id]/route.js');
  assert.match(patch, /if \(\['lines', 'discountType', 'discountValue', 'vatRate'\]\.some\(\(key\) => key in body\)\) \{\s*return badRequest\(EXCISE_LINES_LOCKED_MESSAGE\);/);
  assert.match(patch, /body\.action === 'recalc_from_sales_order'/);
  const revise = code('../../app/api/sales-planning/quotations/[id]/revise/route.js');
  assert.match(revise, /isExciseOrder\(quote\) && \['lines', 'discountType', 'discountValue', 'vatRate'\]\.some/);
  const accept = code('../../app/api/sales-planning/quotations/[id]/accept/route.js');
  assert.ok(accept.indexOf('if (isExciseOrder(quote)) {') < accept.indexOf("from('sales_deals')"), 'สาขา excise มาก่อนอ่านดีล');
  assert.match(accept, /acceptExciseQuotation\(\{ supabase, user, quote, request: req \}\)/);
  const unaccept = code('../../app/api/sales-planning/quotations/[id]/unaccept/route.js');
  assert.match(unaccept, /if \(isExciseOrder\(before\)\) \{\s*return badRequest\(/);
  assert.match(EXCISE_LINES_LOCKED_MESSAGE, /คิดใหม่จากใบสั่งขาย/);
});

test('route SO ลูกค้า: ล็อก Q16 ก่อนย้อนอนุมัติ/Rev./ยกเลิก · action ไม่เรียกเก็บตรวจด่านเดียวกับจอ', () => {
  const so = code('../../app/api/sales-planning/sales-orders/[id]/route.js');
  const lock = so.indexOf("const lock = await exciseSourceLock(supabase, before, action);");
  assert.ok(lock > 0 && lock < so.indexOf("if (action === 'revoke') {") && lock < so.indexOf("if (action === 'cancel') {"));
  assert.match(so, /exciseNotBilledBlocker\(before, \{ liveQuote, clearing, filing \}\)/);
  assert.match(so, /\.eq\('updatedAt', expected\.value\)/);
});
