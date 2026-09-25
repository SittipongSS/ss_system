import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  contractLinkable, contractSpanAt, serviceContractHeadline, serviceContractLinkError,
  serviceContractOptions,
} from './serviceContractLink';

const order = (extra = {}) => ({ id: 'SOR-1', status: 'approved', dealId: 'DL-1', ...extra });
const signed = (extra = {}) => ({
  id: 'CTR-1', contractNo: 'CT-SR-26080001-0', kind: 'service', status: 'signed',
  dealId: 'DL-1', effectiveDate: '2026-09-01', expiryDate: '2027-08-31', ...extra,
});
const ok = { canEdit: true };

/* ⭐ สัญญาต้อง **มีผลแล้ว** ถึงผูกได้ — ขั้น "รอหัวหน้ารับรอง" ยังไม่ผูกพัน
   ผูกไปก็ปลดล็อกงานไม่ได้จริง แต่ทำให้คนเข้าใจผิดว่ามีสัญญาแล้ว */
test('⭐ ผูกได้เฉพาะสัญญาที่มีผลแล้ว', () => {
  assert.equal(serviceContractLinkError(order(), signed(), ok), null);
  for (const s of ['draft', 'awaiting_signature', 'awaiting_approval', 'cancelled', 'revised']) {
    assert.match(serviceContractLinkError(order(), signed({ status: s }), ok), /ยังไม่มีผล/, s);
  }
  assert.equal(contractLinkable(signed()), true);
  assert.equal(contractLinkable(signed({ status: 'awaiting_approval' })), false);
});

/* ⭐ ข้ามดีลไม่ได้ — สัญญาผูกกับดีล และใบก็ออกจากดีล */
test('⭐ สัญญาต้องเป็นของดีลเดียวกับใบ', () => {
  assert.match(serviceContractLinkError(order(), signed({ dealId: 'DL-9' }), ok), /ของดีลอื่น/);
});

test('ถอดสัญญาออกจากใบทำได้เสมอ', () => {
  assert.equal(serviceContractLinkError(order(), null, ok), null);
  assert.equal(serviceContractLinkError(order(), undefined, ok), null);
});

/* ⚠️ ใบที่อนุมัติแล้วยังผูกได้โดยตั้งใจ — สัญญามักมาทีหลังใบ
   แต่ใบที่ยกเลิก/ถูกแทนด้วย Rev. คือเอกสารที่ตายแล้ว */
test('ใบที่ปิดไปแล้วผูกไม่ได้ แต่ใบที่อนุมัติแล้วยังผูกได้', () => {
  assert.equal(serviceContractLinkError(order({ status: 'approved' }), signed(), ok), null);
  assert.equal(serviceContractLinkError(order({ status: 'draft' }), signed(), ok), null);
  for (const s of ['cancelled', 'revised']) {
    assert.match(serviceContractLinkError(order({ status: s }), signed(), ok), /ปิดไปแล้ว/, s);
  }
});

test('ไม่มีสิทธิ์แก้ใบ = ผูกไม่ได้ (ด่านเดียวกับปุ่มบนจอ)', () => {
  assert.match(serviceContractLinkError(order(), signed(), { canEdit: false }), /เฉพาะฝ่ายขาย/);
});

/* ⚠️ ไม่กรองด้วยชนิดสัญญา — ใบบริการที่ออกเป็น "สัญญาจ้างผลิต" มีจริง
   ชนิดโชว์บนตัวเลือกให้คนตัดสินเอง */
test('ตัวเลือกโชว์เลขที่ + ชนิด + ช่วงมีผล และตัดใบที่ยังไม่มีผลออก', () => {
  const opts = serviceContractOptions([
    signed(),
    signed({ id: 'CTR-2', status: 'draft' }),
    signed({ id: 'CTR-3', contractNo: 'CT-MF-26080002-0', kind: 'manufacturing' }),
  ]);
  assert.equal(opts.length, 2, 'ใบร่างต้องไม่อยู่ในตัวเลือก');
  assert.equal(opts[0].label, 'CT-SR-26080001-0 · สัญญาบริการ');
  assert.equal(opts[0].hint, '2026-09-01 — 2027-08-31');
  assert.match(opts[1].label, /สัญญาจ้างผลิต/);
});

/* ═══════════════════════════════════════════════════════════════════════
   ถอดสัญญา · หัวใบสั่งขาย (#1570 ตามด้วยรอบเก็บงาน)
   ═══════════════════════════════════════════════════════════════════════ */

/* 🪤 **ด่านตัวเดียวคุมทั้งผูกและถอด** — ของเดิมตอบ "ผูกสัญญาไม่ได้" ให้คนที่กดปุ่ม
   *ถอด* ซึ่งอ่านแล้วไม่รู้ว่าเกิดอะไรขึ้น (และปุ่มถอดก็ไม่ได้ถามด่านนี้เลย) */
test('🪤 ข้อความตีกลับต้องพูดถึงสิ่งที่คนกดจริง — ถอด ไม่ใช่ผูก', () => {
  const dead = order({ status: 'cancelled' });
  assert.match(serviceContractLinkError(dead, null, ok), /ถอดสัญญาไม่ได้/);
  assert.match(serviceContractLinkError(dead, signed(), ok), /ผูกสัญญาไม่ได้/);
  assert.match(serviceContractLinkError(order(), null, { canEdit: false }), /ถอดสัญญาได้เฉพาะ/);
  // ใบที่ยังเปิดอยู่ ถอดได้เสมอ
  assert.equal(serviceContractLinkError(order(), null, ok), null);
});

/* ปุ่มถอดต้องถามด่านตัวเดียวกับ API — ของเดิมมีแค่ `disabled={busy}` ⇒ ใบที่ปิดไปแล้ว
   ยังกดได้ แล้วเด้ง 409 · เทสต์นี้จับที่ **การเรียกใช้** เพราะตรรกะอยู่ในไฟล์อื่น */
test('การ์ดสัญญาบนหน้า SO ต้องถามด่านก่อนเปิดปุ่มถอด', () => {
  const card = readFileSync(
    new URL('../../components/salesPlanning/ServiceContractCard.js', import.meta.url),
    'utf8',
  );
  assert.match(card, /serviceContractLinkError\(order, null, \{ canEdit \}\)/);
  assert.match(card, /disabled=\{busy \|\| !!unlinkGate\}/);
});

/* 🔴 สิทธิ์แก้ต้องมาจาก server — จอเคยคิดเองด้วย cap ล้วน ซึ่งไม่ได้ตอบเรื่องขอบเขต
   ส่วน action ทุกตัวใน PATCH ตรวจ cap **และ** ขอบเขต ⇒ วันไหนสองอย่างต่างกัน
   ปุ่มจะโผล่แล้วเด้ง 409 เงียบ ๆ (แพตเทิร์นเดียวกับ /contracts/[id]) */
test('🔴 GET ของใบสั่งขายต้องส่ง canEdit ที่คิดขอบเขตมาแล้ว', () => {
  const route = readFileSync(
    new URL('../../app/api/sales-planning/sales-orders/[id]/route.js', import.meta.url),
    'utf8',
  );
  assert.match(route, /canEdit: canEditSalesPlanning\(user\) && inSalesEditScope\(user, order\.deal\)/);
  const page = readFileSync(
    new URL('../../app/sales-planning/sales-orders/[id]/page.js', import.meta.url),
    'utf8',
  );
  assert.match(page, /const canEdit = !!order\.canEdit && canEditCap;/);
  assert.doesNotMatch(page, /const canEdit = useCan\(/, 'จอต้องไม่คิดสิทธิ์แก้เองจาก cap ล้วน');
});

/* ── หัวใบบอกสถานะสัญญาได้โดยไม่ต้องสลับแท็บ ───────────────────────────── */

const TODAY = '2026-09-02';

test('หัวใบ: ยังไม่ผูก = บอกว่างานบริการยังเริ่มไม่ได้', () => {
  const head = serviceContractHeadline(null, { today: TODAY });
  assert.match(head.value, /ยังไม่ผูก/);
  assert.equal(head.tone, 'wait');
});

/* 🔴 **"โหลดไม่ขึ้น" ไม่ใช่ "ยังไม่ผูก"** — GET ของใบกลืน error ของคิวรีสัญญาแล้วคืน
   `null` ซึ่งหน้าตาเหมือนใบที่ไม่เคยผูกเป๊ะ ⇒ หัวใบจะสั่งงานผิดว่า "งานบริการเริ่มไม่ได้"
   ให้ใบที่ผูกสัญญาไว้เรียบร้อยแล้ว · ต้องดู `serviceContractId` ของใบประกอบด้วย */
test('🔴 หัวใบ: ผูกไว้แล้วแต่โหลดไม่ขึ้น ต้องไม่อ่านว่ายังไม่ผูก', () => {
  const head = serviceContractHeadline(null, { linkedId: 'CTR-1', today: TODAY });
  assert.doesNotMatch(head.value, /ยังไม่ผูก/);
  assert.match(head.sub, /ผูกสัญญาไว้แล้ว/);
  assert.equal(head.tone, 'late');
});

/* ⚠️ สัญญาที่ยังไม่ผ่านการรับรองเป็นสีแดง ไม่ใช่เขียว — ผูกไว้แล้วแต่ยังเดินงานไม่ได้
   คือสภาพที่ต้องเห็นชัดที่สุด ("ผูกแล้วนึกว่าจบ" คือความเข้าใจผิดที่แพงที่สุดของเส้นนี้) */
test('หัวใบ: ผูกแล้วแต่ยังไม่มีผล = ธงแดงพร้อมบอกสถานะ', () => {
  const head = serviceContractHeadline(signed({ status: 'awaiting_approval' }), { today: TODAY });
  assert.equal(head.tone, 'late');
  assert.match(head.sub, /ยังใช้เดินงานไม่ได้/);
});

/* 🪤 **วันที่ต้องเป็น DD/MM/YYYY เหมือนทั้งใบ** — ปล่อย ISO ดิบจะได้ค่าเดียวกันอ่าน
   สองรูปบนใบเดียวกัน (การ์ดสัญญาที่อยู่ห่างกันคลิกเดียวใช้ fmtDate อยู่แล้ว) */
test('หัวใบ: มีผลแล้วต้องโชว์ช่วงเวลาคู่กับเลขที่ ในรูปแบบเดียวกับทั้งใบ', () => {
  const head = serviceContractHeadline(signed(), { today: TODAY });
  assert.equal(head.value, 'CT-SR-26080001-0');
  assert.equal(head.sub, '01/09/2026 — 31/08/2027');
  assert.equal(head.tone, 'ok');
  assert.doesNotMatch(head.sub, /2026-09-01/, 'ห้ามปล่อย ISO ดิบขึ้นจอ');
  // ใบที่ไม่ระบุวันสิ้นสุดต้องพูด ไม่ใช่ปล่อยว่างให้เดา
  assert.match(serviceContractHeadline(signed({ effectiveDate: null, expiryDate: null }), { today: TODAY }).sub, /ไม่ระบุ/);
});

/* 🔴 **สัญญาที่หมดอายุแล้วยังเป็น `signed`** — `contractInForce` ดูแค่สถานะ ไม่ดูวันที่
   ⇒ ปล่อยไว้หัวใบจะขึ้นเขียวว่าใช้ได้ ทั้งที่งานหน้างานเดินต่อไม่ได้จริง
   ⚠️ วันหมดอายุนับรวมทั้งวัน — หมดจริงเมื่อ *เลย* วันนั้นไปแล้ว */
test('🔴 หัวใบ: สัญญาที่หมดอายุแล้วต้องไม่เขียว', () => {
  const expired = serviceContractHeadline(signed({ expiryDate: '2026-09-01' }), { today: TODAY });
  assert.equal(expired.tone, 'late');
  assert.match(expired.sub, /หมดอายุแล้ว/);
  // วันสุดท้ายยังใช้ได้อยู่
  assert.equal(serviceContractHeadline(signed({ expiryDate: TODAY }), { today: TODAY }).tone, 'ok');
});

/* 🔴 **ขอบหน้าของช่วงมีผล** — ของเดิมตรวจแต่ขอบท้าย (หมดอายุ) ⇒ สัญญาที่เซ็นแล้ว
   แต่เริ่มมีผลเดือนหน้าขึ้น **เขียว** พร้อมช่วงวันที่ที่ยังมาไม่ถึง
   ⚠️ ห้ามแก้ด้วยการปิดไม่ให้ผูก — ผูกล่วงหน้าเป็นลำดับที่ถูกต้องของงานจริง */
test('🔴 สัญญาที่ยังไม่ถึงวันเริ่มมีผล ต้องไม่ขึ้นเขียว', () => {
  const soon = serviceContractHeadline(
    signed({ effectiveDate: '2026-10-01', expiryDate: '2027-09-30' }), { today: TODAY },
  );
  assert.equal(soon.tone, 'wait', 'ยังไม่ถึงเวลา ≠ ใช้ได้แล้ว');
  assert.match(soon.sub, /ยังไม่ถึงวันเริ่มมีผล/);
  assert.notEqual(soon.tone, 'late', 'ไม่มีอะไรผิดพลาด แค่ยังไม่ถึงเวลา — โทนต้องไม่ใช่ late');

  // วันแรกที่มีผลนับรวมทั้งวัน
  assert.equal(
    serviceContractHeadline(signed({ effectiveDate: TODAY }), { today: TODAY }).tone, 'ok',
  );
  // ผูกได้ตามเดิม — ด่านผูกไม่ได้ถูกทำให้แคบลงเพราะเรื่องนี้
  assert.equal(
    serviceContractLinkError(order(), signed({ effectiveDate: '2026-10-01' }), ok), null,
  );
});

/* ตัวตัดสินช่วงมีผลต้องแยกออกมาเป็นของตัวเอง — จอ/ด่านอื่นจะได้ถามตัวเดียวกัน
   ⚠️ ไม่ระบุวันเลย = null ("ไม่รู้") ไม่ใช่ 'in' — ผู้เรียกเลือกเองว่าจะถือว่าอย่างไร */
test('contractSpanAt: ก่อน / ระหว่าง / หลัง / ไม่รู้', () => {
  const c = (e, x) => ({ effectiveDate: e, expiryDate: x });
  assert.equal(contractSpanAt(c('2026-10-01', '2027-09-30'), TODAY), 'before');
  assert.equal(contractSpanAt(c('2026-01-01', '2027-09-30'), TODAY), 'in');
  assert.equal(contractSpanAt(c('2026-01-01', '2026-02-01'), TODAY), 'after');
  assert.equal(contractSpanAt(c(null, null), TODAY), null);
  assert.equal(contractSpanAt(null, TODAY), null);
  // ขอบทั้งสองข้างนับรวมทั้งวัน
  assert.equal(contractSpanAt(c(TODAY, null), TODAY), 'in');
  assert.equal(contractSpanAt(c(null, TODAY), TODAY), 'in');
});

/* ⭐ ใบสั่งขายย้อนหลัง (mig 0360): ดีลภาชนะถือสัญญาหลายช่วง ⇒ ช่วงสัญญาต้องครอบวันที่ใบ (= วันเริ่มสัญญาจริง)
   ไม่งั้นสัญญาฉบับไหนที่เซ็นแล้วก็ปลดด่าน ① ของนัดบริการได้ทั้งที่ไม่ได้ครอบงานรอบนี้ */
test('⭐ ใบย้อนหลัง: สัญญาต้องครอบวันที่ใบ · ขาดวันหมดอายุ = ผูกไม่ได้ · ใบปกติไม่ตรวจช่วง', () => {
  const historical = order({ origin: 'historical', orderDate: '2024-06-01' });
  const covering = signed({ effectiveDate: '2024-06-01', expiryDate: '2025-05-31' });
  assert.equal(serviceContractLinkError(historical, covering, ok), null);
  assert.equal(serviceContractLinkError(historical, signed({ effectiveDate: '2024-01-01', expiryDate: '2024-06-01' }), ok), null);
  const later = serviceContractLinkError(historical, signed({ effectiveDate: '2025-06-01', expiryDate: '2026-05-31' }), ok);
  assert.match(later, /ไม่ครอบวันเริ่มของใบย้อนหลัง/);
  assert.match(later, /01\/06\/2024/);
  assert.match(serviceContractLinkError(historical, signed({ effectiveDate: '2024-01-01', expiryDate: null }), ok), /ไม่ครอบ/);
  assert.match(serviceContractLinkError(historical, signed({ effectiveDate: null, expiryDate: '2025-01-01' }), ok), /ไม่ครอบ/);
  // สัญญายังไม่มีผล/ข้ามดีล ยังตีกลับด้วยเหตุเดิมก่อนถึงด่านช่วง
  assert.match(serviceContractLinkError(historical, signed({ status: 'draft' }), ok), /ยังไม่มีผล/);
  // ใบย้อนหลังที่อนุมัติแล้วและ **ไม่ได้** ชี้เอกสารแทนสัญญาอยู่ ถอด/ผูกได้ตามกติกาเดิม (ทางกู้ — ดูเทสต์ถัดไป)
  assert.equal(serviceContractLinkError(historical, null, ok), null);
  // ใบปกติ: สัญญาที่ช่วงไม่ครอบวันที่ใบยังผูกล่วงหน้าได้เหมือนเดิม
  assert.equal(serviceContractLinkError(order({ orderDate: '2024-06-01' }), signed(), ok), null);
});

/* 🔴 **เอกสารแทนสัญญาเป็นของใบตั้งแต่เกิดจนตาย** — *"เกิดพร้อมใบ อนุมัติพร้อมใบ"* (0374 ข้อ 7e)
   ของเดิมปิดแค่ใบที่ยังไม่อนุมัติ ⇒ ใบที่อนุมัติแล้วกด "ถอดสัญญาออกจากใบ" ได้จริง แล้วเสียสองต่อ:
   ① ด่าน ① ของทุกนัดในใบบล็อกทันที และกดคืนไม่ได้ (ผูกกลับก็คือการ "ผูก" ที่ต้องปิดอยู่ดี)
   ② เอกสาร signed ที่ถือเลข CT ลอยออกจากใบ — trigger ข้อ 7e ตามหาด้วยตัวชี้กลับแล้วก็จริง แต่ด่านนี้คือ
      ชั้นที่ทำให้ไม่เกิดตั้งแต่แรก · ทางแก้ของใบที่อนุมัติแล้วมีทางเดียว: HISTORICAL_CORRECTION_PATH
   ⚠️ ใบที่ไม่ได้ชี้เอกสารแทนสัญญาอยู่ยังผูกได้ — ทางกู้ทางเดียวที่เหลือของใบที่เคยถูกถอดไป */
test('🔴 ใบย้อนหลังที่อนุมัติแล้ว: เอกสารแทนสัญญาของใบ ถอด/สับเปลี่ยนไม่ได้ทั้งคู่', () => {
  const span = { effectiveDate: '2024-01-01', expiryDate: '2024-12-31' };
  const substitute = signed({
    id: 'CTR-H1', source: 'external', status: 'signed', contractNo: 'CT-SR-26090007-0',
    metadata: { historicalSalesOrderId: 'SOR-1' }, ...span,
  });
  const owner = order({
    origin: 'historical', orderDate: '2024-06-01', serviceContractId: 'CTR-H1', serviceContract: substitute,
  });
  const otherDoc = signed({ id: 'CTR-2', ...span });
  // ข้อความต้องพูดถึงสิ่งที่คนกดจริง และบอกทางออกที่มีอยู่จริงทางเดียว
  const unlink = serviceContractLinkError(owner, null, ok);
  assert.match(unlink, /เอกสารแทนสัญญาเป็นของใบนี้ — ถอดสัญญาไม่ได้/);
  assert.match(unlink, /ผู้จัดการฝ่ายขายยกเลิกใบ/, 'ต้องชี้ทาง HISTORICAL_CORRECTION_PATH (ผู้ยกเลิก = ผู้อนุมัติได้ · มติ 24/09)');
  assert.equal(serviceContractLinkError(owner, undefined, ok), unlink);
  assert.match(serviceContractLinkError(owner, otherDoc, ok), /เอกสารแทนสัญญาเป็นของใบนี้ — ผูกสัญญาไม่ได้/);
  // สิทธิ์มาก่อนล็อก · ใบที่ปิดไปแล้วยังได้คำเดิม
  assert.match(serviceContractLinkError(owner, null, { canEdit: false }), /เฉพาะฝ่ายขาย/);
  assert.match(serviceContractLinkError({ ...owner, status: 'cancelled' }, null, ok), /ปิดไปแล้ว/);
  // สัญญาทั่วไป (ไม่ใช่เอกสารแทนสัญญา) ที่ใบย้อนหลังผูกไว้ ยังถอดได้ตามกติกาเดิม
  const plain = order({
    origin: 'historical', orderDate: '2024-06-01', serviceContractId: 'CTR-1', serviceContract: signed(span),
  });
  assert.equal(serviceContractLinkError(plain, null, ok), null);
  // ใบที่ถูกถอดไปแล้ว (ไม่มีสัญญาชี้อยู่) ยังผูกกลับได้ — ทางกู้
  assert.equal(serviceContractLinkError(order({ origin: 'historical', orderDate: '2024-06-01' }), otherDoc, ok), null);
});

/* 🔴 **ประตูที่สองของเรื่องเดียวกัน** — ด่านข้างบนดูแต่สัญญา *ปัจจุบัน* ของใบ ⇒ ใบย้อนหลังที่อนุมัติแล้ว
   และไม่มีสัญญาชี้อยู่ (ทางกู้) เดินผ่านด่านนั้นแล้วไปหยิบ **เอกสารแทนสัญญาของใบอื่น** มาผูกได้
   ⇒ จบที่ปลายทางเดียวกับที่ R1 กันไว้: ยกเลิกใบเจ้าของ trigger เว้นไว้ (NOT EXISTS — ถูกแล้ว)
     ยกเลิกใบที่หยิบมาใช้ trigger ก็หาไม่เจอ (ตัวชี้กลับยังชี้ใบเดิม) ⇒ เอกสาร signed ถือเลข CT ลอยไร้เจ้าของ
   ⇒ ตัดสินด้วย **ตัวชี้กลับ** ตัวเดียวกับที่ trigger ใช้ · ทางกู้ยังอยู่ (ผูกเอกสารของตัวเองกลับได้) */
test('🔴 เอกสารแทนสัญญาของใบอื่นผูกเข้าใบนี้ไม่ได้ (ตัวชี้กลับ) — แต่ของตัวเองผูกกลับได้ (ทางกู้)', () => {
  const span = { effectiveDate: '2024-01-01', expiryDate: '2024-12-31' };
  const substitute = (orderId, extra = {}) => signed({
    id: `CTR-${orderId}`, source: 'external', status: 'signed', contractNo: `CT-SR-2609000${orderId.at(-1)}-0`,
    metadata: { historicalSalesOrderId: orderId }, ...span, ...extra,
  });
  // ใบย้อนหลังที่อนุมัติแล้วและถูกถอดสัญญาไปก่อนมีด่าน = ประตูเดียวที่เหลือ (order() ให้ id SOR-1)
  const recovering = order({ origin: 'historical', orderDate: '2024-06-01' });

  // ⭐ ทางกู้ต้องยังเดินได้ — เอกสารที่ชี้กลับมาใบนี้ ผูกกลับได้
  assert.equal(serviceContractLinkError(recovering, substitute('SOR-1'), ok), null);

  // 🔴 ของใบอื่น = ปิด (นี่คือสิ่งที่ด่านเดิมปล่อยผ่าน)
  const stolen = serviceContractLinkError(recovering, substitute('SOR-2'), ok);
  assert.match(stolen, /เป็นของใบสั่งขายย้อนหลังอีกใบ/);
  assert.match(stolen, /ฟอร์มคีย์ใบ/, 'ต้องบอกด้วยว่าเอกสารของใบนี้เกิดจากที่ไหน');

  // ใบปกติของดีลภาชนะเดียวกันก็เห็นเอกสารฉบับนี้ในตัวเลือก ⇒ ต้องปิดเหมือนกัน (ใบปกติไม่มีด่านช่วงมาช่วย)
  assert.match(serviceContractLinkError(order({ id: 'SOR-9' }), substitute('SOR-2'), ok),
    /เป็นของใบสั่งขายย้อนหลังอีกใบ/);

  // ความเป็นเจ้าของมาก่อนด่านดีล/ช่วง — เหตุที่ตรงกว่าต้องขึ้นก่อน
  assert.match(serviceContractLinkError(recovering, substitute('SOR-2', { dealId: 'DL-9' }), ok),
    /เป็นของใบสั่งขายย้อนหลังอีกใบ/);

  // ⚠️ ด่านนี้ตัดสินจาก "เอกสารแทนสัญญา" เท่านั้น — สัญญา external ธรรมดา (ไม่มีตัวชี้กลับ) ไม่โดน
  assert.equal(serviceContractLinkError(recovering, signed({ source: 'external', ...span }), ok), null);
  // และไม่แตะการถอด (ถอดของใบที่ไม่มีสัญญาชี้อยู่ ยังผ่านตามเดิม)
  assert.equal(serviceContractLinkError(recovering, null, ok), null);
});

/* ⭐ ใบย้อนหลังที่ยังไม่อนุมัติ (มติ 22/09 · mig 0374) — สัญญาของใบคือเอกสารแทนสัญญาที่ฟอร์มคีย์ใบสร้าง
   RPC อนุมัติออกเลข CT ให้ฉบับนั้นพร้อมใบ ⇒ ผูกฉบับอื่น/ถอดออก = อนุมัติไม่ได้ (contract_state_invalid)
   ⇒ ปิดทั้งสองทางด้วยคำเดียว ชี้ไปที่ฟอร์มคีย์ใบ · ใบที่ปิดแล้วยังได้คำเดิม ("ปิดไปแล้ว") */
test('⭐ ใบย้อนหลังที่ยังไม่อนุมัติ: ผูก/ถอดสัญญาที่นี่ไม่ได้ — แก้ที่ฟอร์มคีย์ใบ อนุมัติพร้อมใบ', () => {
  for (const status of ['draft', 'pending_approval', 'rejected']) {
    const pending = order({ origin: 'historical', status, orderDate: '2026-01-01' });
    const covering = signed({ effectiveDate: '2026-01-01', expiryDate: '2026-12-31' });
    assert.equal(serviceContractLinkError(pending, covering, ok), 'เอกสารแทนสัญญาของใบย้อนหลังแก้ที่ฟอร์มคีย์ใบ — อนุมัติพร้อมใบนี้', status);
    assert.equal(serviceContractLinkError(pending, null, ok), 'เอกสารแทนสัญญาของใบย้อนหลังแก้ที่ฟอร์มคีย์ใบ — อนุมัติพร้อมใบนี้', `${status} ถอด`);
  }
  // สิทธิ์มาก่อนล็อก (คนไม่มีสิทธิ์ได้คำเรื่องสิทธิ์) · ใบยกเลิกได้คำ "ปิดไปแล้ว" ตามเดิม
  assert.match(serviceContractLinkError(order({ origin: 'historical', status: 'draft' }), signed(), { canEdit: false }), /เฉพาะฝ่ายขาย/);
  assert.match(serviceContractLinkError(order({ origin: 'historical', status: 'cancelled' }), null, ok), /ปิดไปแล้ว/);
  // ใบ pipeline ร่างยังผูกได้ตามเดิม
  assert.equal(serviceContractLinkError(order({ status: 'draft' }), signed(), ok), null);
});

/* ── ความครอบคลุม ณ วันหนึ่ง — รวมสัญญาที่ถูกยกเลิกหลังลงนาม (มติเจ้าของ 24/09/2026) ────────────────── */
test('contractCoverageOn: ใบลงนามแล้วตอบเหมือน contractSpanAt · ใบที่ไม่เคยมีผล = none', async () => {
  const { contractCoverageOn } = await import('./serviceContractLink.js');
  assert.equal(contractCoverageOn(signed(), '2026-10-01'), 'in');
  assert.equal(contractCoverageOn(signed(), '2026-08-31'), 'before');
  assert.equal(contractCoverageOn(signed(), '2027-09-01'), 'after');
  assert.equal(contractCoverageOn(signed({ effectiveDate: null, expiryDate: null }), '2026-10-01'), null);
  for (const status of ['draft', 'awaiting_signature', 'awaiting_approval', 'revised']) {
    assert.equal(contractCoverageOn(signed({ status }), '2026-10-01'), 'none', status);
  }
  assert.equal(contractCoverageOn(signed({ status: 'cancelled', cancelledAt: '2026-10-05T03:00:00Z' }), '2026-10-01'), 'none',
    'ยกเลิกโดยไม่เคยมีผล (ไม่มี approvedAt) ไม่ครอบวันไหนเลย');
  assert.equal(contractCoverageOn(null, '2026-10-01'), 'none');
});

test('contractCoverageOn: ยกเลิกหลังลงนาม — ก่อนวันยกเลิกครอบ · วันยกเลิกครอบเฉพาะนัดที่ปิดงานก่อนเวลายกเลิก · หลังจากนั้นไม่ครอบ', async () => {
  const { contractCoverageOn } = await import('./serviceContractLink.js');
  // ยกเลิก 05/10/2026 10:00 เวลาไทย
  const c = signed({ status: 'cancelled', approvedAt: '2026-09-01T03:00:00Z', cancelledAt: '2026-10-05T03:00:00Z' });
  assert.equal(contractCoverageOn(c, '2026-10-04'), 'in');
  assert.equal(contractCoverageOn(c, '2026-10-05'), 'cancelled');
  assert.equal(contractCoverageOn(c, '2026-10-05', { closedAt: '2026-10-05 09:30' }), 'in', 'ปิดงานก่อนกดยกเลิก');
  /* 🔴 รีวิว 25/09: ถาม "ปิดงานแล้ว **ก่อน** ยกเลิกไหม" ไม่ใช่ "ปิดแล้วตอนนี้ไหม" — นัดที่ยังเปิดอยู่ตอนยกเลิก
     แล้วมาปิดทีหลัง ต้องติดเหมือนเดิม ไม่งั้นใบส่งงานของนัดเดียวกันพลิกจาก "งดบริการ" เป็นให้บริการครบ */
  assert.equal(contractCoverageOn(c, '2026-10-05', { closedAt: '2026-10-05 11:00' }), 'cancelled', 'ปิดงานหลังยกเลิก');
  assert.equal(contractCoverageOn(c, '2026-10-05', { closedAt: '2026-10-05 10:00' }), 'cancelled', 'นาทีเดียวกัน = พิสูจน์ไม่ได้ว่าก่อน');
  assert.equal(contractCoverageOn(c, '2026-10-05', { finished: true }), 'cancelled', 'ธง "ปิดแล้ว" เปล่า ๆ ปลดไม่ได้');
  assert.equal(contractCoverageOn(c, '2026-10-06', { closedAt: '2026-10-05 09:30' }), 'cancelled');
  assert.equal(contractCoverageOn(c, '2026-08-31'), 'before');
  assert.equal(contractCoverageOn({ ...c, expiryDate: '2026-09-30' }, '2026-10-02'), 'after');
  // ไม่มีช่วงวันก็ยังมีวันยกเลิกเป็นขอบ
  assert.equal(contractCoverageOn({ ...c, effectiveDate: null, expiryDate: null }, '2026-10-04'), 'in');
  assert.equal(contractCoverageOn({ ...c, effectiveDate: null, expiryDate: null }, '2026-10-05'), 'cancelled');
});
