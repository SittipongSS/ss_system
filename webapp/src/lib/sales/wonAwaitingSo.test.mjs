// "Won รอยื่น SO" (มติผู้ใช้ 2026-09-14 · ปรับ 2026-09-16) — ดีล Won ที่ยังไม่มี Actual และไม่มี SO รออนุมัติ · มูลค่าดีล 0 ไม่นับ
// ใช้ปิดรูของยอดคาดการณ์ช่วงรับใบเสนอราคา → ยื่น SO · ล็อกนิยามตัวช่วยกลางไว้ที่นี่
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WON_AWAITING_SO_LABEL,
  dealHasApprovedSalesOrder,
  isLegacyWonAtCreate,
  isWonAwaitingSo,
  wonAwaitingSoAmountOf,
  wonAwaitingSoCountOf,
  wonAwaitingSoMonthOf,
  wonAmountOf,
  pendingApprovalAmountOf,
} from './dashboardMetrics.js';

const won = (over = {}) => ({
  stage: 'won',
  projectValue: 120000,
  wonValue: 0,
  confirmedAt: '2026-09-14T03:00:00Z',
  forecastMonth: '2026-10',
  metadata: { actualSource: 'sale_order', wonMonth: null, wonValueExVat: 0 },
  ...over,
});

test('ป้าย', () => {
  assert.equal(WON_AWAITING_SO_LABEL, 'Won รอยื่น SO');
});

test('Won ที่ยังไม่มี SO อนุมัติ/รออนุมัติ = รอยื่น SO ด้วยมูลค่าดีลเต็มก้อน', () => {
  const d = won();
  assert.equal(isWonAwaitingSo(d), true);
  assert.equal(wonAwaitingSoAmountOf(d), 120000);
  assert.equal(wonAwaitingSoCountOf(d), 1);
  // ไม่ใช่ Actual ไม่ใช่รออนุมัติ — เป็นกองที่สามแยกกัน
  assert.equal(wonAmountOf(d), 0);
  assert.equal(pendingApprovalAmountOf(d), 0);
});

test('เดือน = wonMonthOf (ถังเดียวกับ FC Total ของดีล Won) ไม่ใช่เดือน FC และไม่ใช่เดือนปัจจุบัน', () => {
  assert.equal(wonAwaitingSoMonthOf(won()), '2026-09');
  assert.equal(wonAwaitingSoMonthOf(won({ confirmedAt: null })), '2026-10');
});

/* ตัดกองด้วย **ยอด** ไม่ใช่จำนวนใบ (ตรวจ 2026-09-16) — ใบที่ยื่นแล้วยอด 0 บาทเคยเตะดีลออกจากทั้งสองกอง
   ⇒ มูลค่าดีลทั้งก้อนหายจากคาดจบงวด โดยไม่มีช่องไหนบนจอรับไว้ */
test('มี SO รออนุมัติที่มียอด = ไม่ใช่รอยื่น (ย้ายไปกองรออนุมัติ) · ใบยื่นแล้วยอด 0 บาท = ยังรอยื่น', () => {
  assert.equal(isWonAwaitingSo(won({ metadata: { actualSource: 'sale_order', soPendingAmount: 120000, soPendingCount: 1 } })), false);
  const zeroPending = won({ metadata: { actualSource: 'sale_order', soPendingAmount: 0, soPendingCount: 1 } });
  assert.equal(isWonAwaitingSo(zeroPending), true);
  assert.equal(wonAwaitingSoAmountOf(zeroPending), 120000);
  assert.equal(pendingApprovalAmountOf(zeroPending), 0, 'กองรออนุมัติยังได้ 0 บาทเหมือนเดิม — ยอดไม่ถูกนับสองที่');
});

test('มี SO อนุมัติที่มียอดแล้ว = ไม่ใช่รอยื่น', () => {
  const approved = won({ wonValue: 90000, metadata: { actualSource: 'sale_order', wonMonth: '2026-09', wonValueExVat: 90000 } });
  assert.equal(isWonAwaitingSo(approved), false);
  assert.equal(wonAwaitingSoAmountOf(approved), 0);
});

/* มติผู้ใช้ 2026-09-16 (รอบบ่าย): **ใบสั่งขายที่อนุมัติแล้วแม้ยอด 0 บาท = จบ** — ส่วนลด 100% เกิดได้จริง
   ⇒ ดีลนั้นไม่มีเงินจะเข้าอีก การค้างไว้ในกองคือการโชว์เงินที่ไม่มีวันมา
   (รอบเช้าเคยลองนับไว้ในกอง แล้วผู้ใช้ทักว่าดีลพวกนี้ยื่น SO ไปแล้วจริง ๆ) */
test('SO อนุมัติ 0 บาท = จบ ไม่อยู่ในกองรอยื่น SO', () => {
  const zeroApproved = won({ metadata: { actualSource: 'sale_order', wonMonth: '2026-08', wonValueExVat: 0 } });
  assert.equal(dealHasApprovedSalesOrder(zeroApproved), true);
  assert.equal(isWonAwaitingSo(zeroApproved), false);
  assert.equal(wonAwaitingSoAmountOf(zeroApproved), 0);
  assert.equal(wonAwaitingSoCountOf(zeroApproved), 0);
  assert.equal(wonAwaitingSoMonthOf(zeroApproved), null);
  // ยังไม่มีใบอนุมัติเลย = ยังรอ (ตัวเทียบของกรณีข้างบน)
  assert.equal(isWonAwaitingSo(won({ metadata: { actualSource: 'sale_order', wonMonth: null } })), true);
});

test('ดีลที่ยังเปิด / แพ้ ไม่ใช่รอยื่น SO', () => {
  assert.equal(isWonAwaitingSo(won({ stage: 'quotation' })), false);
  assert.equal(isWonAwaitingSo(won({ stage: 'lost' })), false);
  assert.equal(wonAwaitingSoMonthOf(won({ stage: 'quotation' })), null);
  assert.equal(isWonAwaitingSo(won({ stage: 'in_project' })), true);
});

/* มติผู้ใช้ 2026-09-16: มูลค่าดีล 0/ว่าง/ติดลบ ไม่นับทั้งยอดและจำนวน — บวกคาดการณ์ 0 อยู่แล้ว ได้แค่บรรทัด "฿0.00 · 1 ดีล"
   (ของจริง 16/09: 3 ดีลมูลค่า 0 ที่มี SO 0 บาทร่าง/ยกเลิก — DL-26080214 · DL-26080303 · DL-260900469) */
test('มูลค่าดีล 0 / ว่าง / ติดลบ ไม่อยู่ในกอง Won รอยื่น SO ทั้งยอดและจำนวน', () => {
  for (const projectValue of [0, null, undefined, -5, '0']) {
    const d = won({ projectValue });
    assert.equal(isWonAwaitingSo(d), false, String(projectValue));
    assert.equal(wonAwaitingSoAmountOf(d), 0);
    assert.equal(wonAwaitingSoCountOf(d), 0);
    assert.equal(wonAwaitingSoMonthOf(d), null);
  }
  assert.equal(wonAwaitingSoCountOf(won({ projectValue: '1' })), 1);
});

/* ── ดีลเก่าจากระบบเดิมที่สร้างเป็น Won (มติผู้ใช้ 2026-09-15) ────────────────────────────
   รูปจริงบน prod: POST ของสวิตช์เก็บ metadata.legacy = true · ไม่มี acceptedQuotationId / wonSource ·
   trigger เขียน actualSource 'sale_order' + wonMonth null · ไม่มีใบเสนอราคาและ SO เลย (และไม่มีวันมี) */
const legacyWonAtCreate = (over = {}) => won({
  confirmedAt: '2026-07-15T00:00:00Z',
  metadata: { legacy: true, actualSource: 'sale_order', wonMonth: null, wonValueExVat: 0, projectType: 'NPD', brand: '' },
  ...over,
});

test('ดีลเก่าที่สร้างเป็น Won ไม่ใช่ Won รอยื่น SO — ตัดทั้งยอดและจำนวน (บล็อก B ที่ยอด FC ยังอยู่ · ดีล ฿0)', () => {
  const blockB = legacyWonAtCreate({
    projectValue: 600000,
    metadata: { ...legacyWonAtCreate().metadata, legacyClosedValue: 600000, legacyClosedDate: '2026-07-15' },
  });
  const typedZero = legacyWonAtCreate({ projectValue: 0 });
  const inProject = legacyWonAtCreate({ stage: 'in_project', projectValue: 30000 });
  for (const d of [blockB, typedZero, inProject]) {
    assert.equal(isLegacyWonAtCreate(d), true, JSON.stringify(d));
    assert.equal(isWonAwaitingSo(d), false);
    assert.equal(wonAwaitingSoAmountOf(d), 0);
    assert.equal(wonAwaitingSoCountOf(d), 0);
    assert.equal(wonAwaitingSoMonthOf(d), null);
  }
});

test('ดีลสวิตช์ที่ปิด Won ผ่านใบเสนอราคา (SO ยังไม่อนุมัติ) ยังนับ — เช่น DL-26080394 ก่อน SO อนุมัติ', () => {
  const viaQuote = legacyWonAtCreate({
    metadata: { legacy: true, actualSource: 'sale_order', wonMonth: null, acceptedQuotationId: 'QT-1', wonSource: 'quotation' },
  });
  assert.equal(isLegacyWonAtCreate(viaQuote), false);
  assert.equal(isWonAwaitingSo(viaQuote), true);
  assert.equal(wonAwaitingSoAmountOf(viaQuote), 120000);
  assert.equal(wonAwaitingSoCountOf(viaQuote), 1);
  assert.equal(wonAwaitingSoMonthOf(viaQuote), '2026-07');
  // มีแค่ acceptedQuotationId ก็คือดีลที่รับใบเสนอราคาแล้ว
  const acceptedOnly = legacyWonAtCreate({
    metadata: { legacy: true, actualSource: 'sale_order', wonMonth: null, acceptedQuotationId: 'QT-1' },
  });
  assert.equal(isLegacyWonAtCreate(acceptedOnly), false);
  assert.equal(wonAwaitingSoCountOf(acceptedOnly), 1);
});

test('wonSource = quotation แต่ acceptedQuotationId หาย (บังคับลบใบเสนอราคาพังครึ่งทาง) ยังนับ', () => {
  const halfReverted = legacyWonAtCreate({
    metadata: { legacy: true, actualSource: 'sale_order', wonMonth: null, wonSource: 'quotation' },
  });
  assert.equal(isLegacyWonAtCreate(halfReverted), false);
  assert.equal(isWonAwaitingSo(halfReverted), true);
  assert.equal(wonAwaitingSoAmountOf(halfReverted), 120000);
  assert.equal(wonAwaitingSoCountOf(halfReverted), 1);
});

test('ไม่มีธง legacy = ไม่ใช่ดีลเก่า แม้ Won โดยไม่มีใบเสนอราคา (wonSource manual / sahamit-po ของ ก.ค. 2026)', () => {
  for (const wonSource of ['manual', 'sahamit-po', undefined]) {
    const d = won({ metadata: { actualSource: 'sale_order', wonMonth: null, ...(wonSource ? { wonSource } : {}) } });
    assert.equal(isLegacyWonAtCreate(d), false, String(wonSource));
    assert.equal(wonAwaitingSoCountOf(d), 1, String(wonSource));
  }
  // ดีลที่ยังเปิด / แพ้ ไม่ใช่ดีลเก่าที่สร้างเป็น Won · ข้อมูลว่างไม่พัง
  assert.equal(isLegacyWonAtCreate(legacyWonAtCreate({ stage: 'qualified' })), false);
  assert.equal(isLegacyWonAtCreate(legacyWonAtCreate({ stage: 'lost' })), false);
  assert.equal(isLegacyWonAtCreate(null), false);
  assert.equal(isLegacyWonAtCreate({ stage: 'won' }), false);
});
