import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  contractLinkable, serviceContractHeadline, serviceContractLinkError, serviceContractOptions,
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

test('หัวใบ: ยังไม่ผูก = บอกว่างานบริการยังเริ่มไม่ได้', () => {
  const head = serviceContractHeadline(null);
  assert.match(head.value, /ยังไม่ผูก/);
  assert.equal(head.tone, 'wait');
});

/* ⚠️ สัญญาที่ยังไม่ผ่านการรับรองเป็นสีแดง ไม่ใช่เขียว — ผูกไว้แล้วแต่ยังเดินงานไม่ได้
   คือสภาพที่ต้องเห็นชัดที่สุด (ผูกแล้วนึกว่าจบ เป็นความเข้าใจผิดที่แพงที่สุดของเส้นนี้) */
test('หัวใบ: ผูกแล้วแต่ยังไม่มีผล = ธงแดงพร้อมบอกสถานะ', () => {
  const head = serviceContractHeadline(signed({ status: 'awaiting_approval' }));
  assert.equal(head.tone, 'late');
  assert.match(head.sub, /ยังใช้เดินงานไม่ได้/);
});

/* ⚠️ สัญญาที่หมดอายุแล้วยังเป็น `signed` ⇒ สถานะไม่ได้ตอบเรื่องเวลา ต้องโชว์ช่วงคู่กัน */
test('หัวใบ: มีผลแล้วต้องโชว์ช่วงเวลาคู่กับเลขที่เสมอ', () => {
  const head = serviceContractHeadline(signed());
  assert.equal(head.value, 'CT-SR-26080001-0');
  assert.equal(head.sub, '2026-09-01 — 2027-08-31');
  assert.equal(head.tone, 'ok');
  // ใบที่ไม่ระบุวันสิ้นสุดต้องพูด ไม่ใช่ปล่อยว่างให้เดา
  assert.match(serviceContractHeadline(signed({ effectiveDate: null, expiryDate: null })).sub, /ไม่ระบุ/);
});
