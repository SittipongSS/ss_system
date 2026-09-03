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
