import test from 'node:test';
import assert from 'node:assert/strict';

import { IRREVERSIBLE_NOTE, approvalPrompt, paymentConfirmPrompt, costingPriceApprovalEffects, costingPriceApprovalPrompt,
  historicalApprovalPrompt, paymentPlanEditPrompt, paymentCarryPrompt, paymentRefundPrompt, paymentRefundClearPrompt,
} from './approvalPrompt.js';
import { applyCarryIn, carryPromptFacts } from './sales/installmentCarry.js';
import { HISTORICAL_STATUS_NOTE } from './sales/historicalOrders.js';
import { buildReplanRows, replanPromptFacts } from './sales/installmentReplan.js';

test('โมดัลบอก "สิ่งที่จะเกิดขึ้น" เป็นบรรทัดละข้อ ไม่ใช่ถามลอย ๆ ว่าแน่ใจไหม', () => {
  const p = approvalPrompt({
    subject: 'ใบสั่งขาย SO-26080008-0',
    effects: ['ยอด Actual ฿30,000 เข้าดีลทันที', 'ส่งใบเข้าคิวบัญชีตรวจ'],
    confirmLabel: 'อนุมัติและนับ Actual',
  });
  assert.match(p.description, /ใบสั่งขาย SO-26080008-0/);
  assert.equal(p.confirmLabel, 'อนุมัติและนับ Actual');
  assert.equal(p.detail.split('\n').filter((l) => l.startsWith('· ')).length, 2);
  assert.match(p.detail, /ยอด Actual ฿30,000 เข้าดีลทันที/);
});

/* 🔴 โมดัลเปล่าที่เขียนแค่ "แน่ใจหรือไม่" แย่กว่าไม่มีโมดัล — คนกดผ่านโดยไม่อ่าน
   แล้วได้ความรู้สึกปลอดภัยปลอม ๆ · ต้องพังตอน dev ไม่ใช่ปล่อยขึ้น production */
test('ไม่บอกผลลัพธ์เลย = สร้างโมดัลไม่ได้', () => {
  assert.throws(() => approvalPrompt({ subject: 'x', effects: [] }), /อย่างน้อย 1 อย่าง/);
  assert.throws(() => approvalPrompt({ subject: 'x', effects: ['  ', ''] }), /อย่างน้อย 1 อย่าง/);
  assert.throws(() => approvalPrompt({ subject: 'x' }), /อย่างน้อย 1 อย่าง/);
});

test('ของที่ถอนคืนไม่ได้ต้องขึ้นคำเตือนเป็นบรรทัดแรก', () => {
  const p = approvalPrompt({ subject: 'x', effects: ['ก'], irreversible: true });
  assert.equal(p.detail.split('\n')[0], `⚠️ ${IRREVERSIBLE_NOTE}`);
  assert.ok(!approvalPrompt({ subject: 'x', effects: ['ก'] }).detail.includes(IRREVERSIBLE_NOTE));
});

/* บัญชีคอนเฟิร์มแล้วถอยได้ทางเดียวคือถอนคำรับรองพร้อมเหตุผล (unconfirm) ⇒ คำเตือนนี้ต้องอยู่ในโมดัลเสมอ
   ⭐ PR1 (mig 0376 · มติเจ้าของ 23/09): งวดที่รับรองแล้ว **ไม่ล็อกใบจากการย้อนการอนุมัติ/ออก Rev. อีกแล้ว** —
     งวดย้ายไปใบ Rev. ทั้งแถว ⇒ โมดัลต้องบอกผลนั้นแทนคำเดิม "ย้อนการอนุมัติหรือออก Rev. ใหม่ไม่ได้อีก" (ซึ่งกลายเป็นเท็จ) */
/* ⚠️ UAT 23/09: "ย้อนกลับเองไม่ได้" ถูกถอดจากโมดัลนี้ — บัญชีถอนคำรับรองเองได้ ⇒ โมดัลต้องบอกทางถอนแทนคำเตือนที่เป็นเท็จ */
test('คอนเฟิร์มการชำระบอกทางถอนคำรับรอง (ไม่ใช่ "ย้อนกลับเองไม่ได้") และบอกว่าเงินงวดนี้ย้ายไปกับใบ Rev.', () => {
  const p = paymentConfirmPrompt({ label: 'งวดที่ 2', amount: '฿16,050.00' });
  assert.doesNotMatch(p.detail, new RegExp(IRREVERSIBLE_NOTE));
  assert.match(p.detail, /ถ้ารับรองผิด บัญชีถอนได้ที่เมนู “ถอนคำรับรอง” ของงวดนี้ \(ต้องใส่เหตุผล\)/);
  assert.doesNotMatch(p.detail, /ย้อนการอนุมัติหรือออก Rev\. ใหม่ไม่ได้/);
  assert.match(p.detail, /ถ้าใบนี้ถูกย้อนการอนุมัติ\/ออก Rev\. เงินงวดนี้ย้ายไปกับใบ Rev\. — บัญชีไม่ต้องรับรองซ้ำ/);
  // ไม่ใช่การอนุมัติเอกสาร ประโยคจึงต้องไม่ใช่ "ยืนยันอนุมัติ ชำระเต็มจำนวน"
  assert.equal(p.description, 'ยืนยันการรับชำระ งวดที่ 2 · ฿16,050.00 หรือไม่');
  // ยอด Actual ไม่ขยับตามการคอนเฟิร์ม — มติผู้ใช้ ต้องไม่มีใครเข้าใจผิดตรงนี้
  assert.match(p.detail, /Actual ของฝ่ายขายไม่เปลี่ยน/);
});

test('งวดที่ไม่มีป้าย/ยอด ยังสร้างข้อความได้ ไม่หลุดเป็น "undefined" หรือ "การการ"', () => {
  const p = paymentConfirmPrompt({});
  assert.ok(!p.description.includes('undefined'));
  assert.equal(p.description, 'ยืนยันการรับชำระหรือไม่');
  assert.equal(approvalPrompt({ effects: ['ก'] }).description, 'ยืนยันอนุมัติหรือไม่');
});

// ── อนุมัติราคาผลิต (แก้ 2026-08-16) ───────────────────────────────────────
test('costingPriceApprovalEffects: บอกครบทั้งลายเซ็น ขั้นป้อนต้นทุน และปลายทางที่ใบเสนอราคา', () => {
  const lines = costingPriceApprovalEffects({ tierCount: 3 });
  assert.ok(lines.length >= 4);
  assert.ok(lines.some((l) => l.includes('3 ชั้น')), 'ต้องบอกจำนวนชั้นที่กำลังอนุมัติ');
  assert.ok(lines.some((l) => l.includes('ลายเซ็น')));
  // ⚠️ ต้องไม่โกหกว่าราคาสินค้าเปลี่ยนทันที — มีขั้น "ป้อนต้นทุนเข้า FG" คั่นอยู่
  assert.ok(lines.some((l) => l.includes('ป้อนต้นทุนเข้า FG')));
  assert.ok(lines.some((l) => l.includes('ใบเสนอราคา')), 'ต้องบอกปลายทางว่าไปเป็นราคาขาย');
});

test('costingPriceApprovalEffects: ชั้นเดียวไม่ต้องพูดจำนวนชั้น', () => {
  const lines = costingPriceApprovalEffects({ tierCount: 1 });
  assert.ok(!lines.some((l) => l.includes('1 ชั้น')));
});

test('costingPriceApprovalPrompt: ผ่านด่าน effects บังคับของ approvalPrompt', () => {
  const prompt = costingPriceApprovalPrompt({ subject: 'FG-0119-001', tierCount: 2 });
  assert.match(prompt.description, /FG-0119-001/);
  assert.match(prompt.detail, /สิ่งที่จะเกิดขึ้นทันที:/);
  assert.match(prompt.detail, /ป้อนต้นทุนเข้า FG/);
});

// ── ใบสั่งขายย้อนหลัง (มติ 22/09 · mig 0374) ───────────────────────────────
/* 🔴 ภาพนิ่งของโมดัลรับรองเงินของใบปกติ (ห้ามพารามิเตอร์ใหม่รั่วเข้าใบปกติ)
   ⚠️ แก้ภาพนิ่งโดยตั้งใจครั้งเดียวใน PR1 (mig 0376 · มติเจ้าของ 23/09): บรรทัด Rev. เปลี่ยนจาก "ใบนี้จะย้อนการอนุมัติ
     หรือออก Rev. ใหม่ไม่ได้อีก" เป็นบรรทัดว่าเงินย้ายไปกับใบ Rev. — บรรทัดอื่นทุกตัวอักษรเท่าเดิม */
test('คอนเฟิร์มการชำระของใบปกติ: ภาพนิ่งทุกตัวอักษร (บรรทัด Rev. ตามมติ PR1)', () => {
  const expected = {
    title: 'บัญชีคอนเฟิร์มการชำระ',
    description: 'ยืนยันการรับชำระ งวดที่ 2 · ฿16,050.00 หรือไม่',
    /* ⚠️ แก้ภาพนิ่งโดยตั้งใจครั้งที่สอง (UAT 23/09): ถอดบรรทัด "ย้อนกลับเองไม่ได้" — บัญชีถอนคำรับรองเองได้ (action unconfirm ·
       มีตั้งแต่ #1234 13/08) และหลัง PR1/PR3 งวดที่รับรองแล้วไม่ล็อกการย้อน/ยกเลิกใบอีก ⇒ คำเตือนนั้นเป็นเท็จ · บอกทางถอนแทน */
    detail: [
      'สิ่งที่จะเกิดขึ้นทันที:',
      '· บันทึกว่าเงินงวดนี้เข้าบัญชีบริษัทแล้วจริง',
      '· ถ้าใบนี้ถูกย้อนการอนุมัติ/ออก Rev. เงินงวดนี้ย้ายไปกับใบ Rev. — บัญชีไม่ต้องรับรองซ้ำ',
      '· ยอด Actual ของฝ่ายขายไม่เปลี่ยน — เป็นยอดเต็มตั้งแต่ใบอนุมัติแล้ว',
      '· ถ้ารับรองผิด บัญชีถอนได้ที่เมนู “ถอนคำรับรอง” ของงวดนี้ (ต้องใส่เหตุผล)',
    ].join('\n'),
    confirmLabel: 'ยืนยันว่าเงินเข้าแล้ว',
  };
  assert.deepEqual(paymentConfirmPrompt({ label: 'งวดที่ 2', amount: '฿16,050.00' }), expected);
  assert.deepEqual(paymentConfirmPrompt({ label: 'งวดที่ 2', amount: '฿16,050.00', historical: false, opening: true }), expected,
    'opening ของใบปกติไม่มีความหมาย — ต้องไม่เปลี่ยนอะไร');
});

/* ⭐ ใบย้อนหลังไม่มี Rev. และไม่นับ Actual ตั้งแต่แรก ⇒ สองบรรทัดนั้นของใบปกติเป็นเรื่องไม่จริงกับใบนี้
   สิ่งที่เกิดจริง: "จ่ายถึง" ขยับ · งวดปกติล็อกการยกเลิกใบ / งวดยกมาโมฆะตามใบถ้ายกเลิก (มติ 24/09) · ไม่นับ Actual */
test('คอนเฟิร์มงวดของใบย้อนหลัง: ไม่มีบรรทัด Rev./Actual ของใบปกติ · บอกด่านเงิน · งวดถัดไป · ไม่นับ Actual', () => {
  const p = paymentConfirmPrompt({
    label: 'งวดยกมา', amount: '฿196,452.00', historical: true, opening: true,
    paidThroughLabel: '30/09/2026', nextInstallmentLabel: 'งวด ต.ค.–ธ.ค. ฿65,484.00 ครบกำหนด 01/10/2026',
  });
  assert.equal(p.title, 'บัญชีคอนเฟิร์มการชำระ');
  assert.equal(p.confirmLabel, 'ยืนยันว่าเงินเข้าแล้ว');
  assert.equal(p.description, 'ยืนยันการรับชำระ งวดยกมา · ฿196,452.00 หรือไม่');
  assert.equal(p.detail.split('\n')[0], `⚠️ ${IRREVERSIBLE_NOTE}`);
  assert.doesNotMatch(p.detail, /Rev\./);
  assert.doesNotMatch(p.detail, /Actual ของฝ่ายขาย/);
  assert.match(p.detail, /· บันทึกว่าเงินงวดนี้เข้าบัญชีบริษัทแล้วจริง/);
  assert.match(p.detail, /· งวดยกมา — เงินที่เก็บก่อนเข้าระบบ รับรองครั้งเดียว/);
  assert.match(p.detail, /· เปิดด่านเงินของนัดบริการถึง 30\/09\/2026/);
  /* มติ 24/09 (mig 0387): ผู้จัดการฝ่ายขายยกเลิกใบได้แม้งวดยกมารับรองแล้ว — งวดยกมาเป็นโมฆะตามใบ
     ⇒ บรรทัดเดิม "AE Sup ยกเลิกใบนี้ไม่ได้อีก" เป็นเท็จกับงวดยกมา · ยังจริงกับงวดปกติ (ข้างล่าง) */
  assert.doesNotMatch(p.detail, /ยกเลิกใบนี้ไม่ได้/);
  assert.ok(p.detail.includes('\n· ถ้าผู้จัดการฝ่ายขายยกเลิกใบเพื่อคีย์ใหม่ งวดยกมานี้เป็นโมฆะตามใบ — ใบใหม่ต้องรับรองงวดยกมาอีกครั้ง\n'));
  assert.doesNotMatch(p.detail, /ย้ายไปกับใบ Rev\./);
  assert.match(p.detail, /· งวดถัดไป งวด ต.ค.–ธ.ค./);
  assert.ok(p.detail.includes(`· ${HISTORICAL_STATUS_NOTE}`));

  // งวดปกติของใบย้อนหลัง · ไม่รู้ "จ่ายถึง" · ไม่มีงวดถัดไป = ไม่พูดสิ่งที่ไม่รู้
  const plain = paymentConfirmPrompt({ label: 'งวด ต.ค.–ธ.ค.', amount: '฿65,484.00', historical: true });
  assert.doesNotMatch(plain.detail, /งวดยกมา/);
  assert.doesNotMatch(plain.detail, /งวดถัดไป/);
  assert.doesNotMatch(plain.detail, /undefined|null/);
  assert.match(plain.detail, /ตามช่วงครอบของงวดนี้/);
  // งวดปกติ = เงินที่รับในระบบหลังอนุมัติ — ยังล็อกการยกเลิกใบจนกว่าบัญชีถอนคำรับรอง (ใบย้อนหลังไม่มีทางยก/คืนเงิน)
  assert.ok(plain.detail.includes('\n· ผู้จัดการฝ่ายขายยกเลิกใบนี้ไม่ได้จนกว่าบัญชีถอนคำรับรอง — ถ้ายอดหรือช่วงครอบผิด ให้ตีกลับแทนการรับรอง\n'));
  assert.doesNotMatch(plain.detail, /AE Sup/);
});

test('โมดัลอนุมัติใบย้อนหลัง: ป้ายที่ตัดสินแล้ว · ไม่นับ Actual ท้ายรายการเสมอ · ไม่ใช่ "อนุมัติและนับ Actual"', () => {
  const checklist = ['ลูกค้า: AR-1207 · บจก. สยามพิวรรธน์', 'ยอดทั้งใบ: ฿261,936.00'];
  const effects = ['เอกสารแทนสัญญา PO-SPW-2026-0118 อนุมัติ ออกเลข CT แล้วผูกกับใบนี้'];
  const p = historicalApprovalPrompt({ subject: 'ใบสั่งขาย SO-26090051-0', checklist, effects });
  assert.equal(p.title, 'อนุมัติ ใบสั่งขาย');
  assert.equal(p.description, 'ยืนยันอนุมัติ ใบสั่งขาย SO-26090051-0 หรือไม่');
  assert.equal(p.confirmLabel, 'อนุมัติใบย้อนหลัง');
  assert.doesNotMatch(`${p.confirmLabel} ${p.detail}`, /อนุมัติและนับ Actual/);
  const lines = p.detail.split('\n');
  assert.equal(lines[lines.length - 1], `· ${HISTORICAL_STATUS_NOTE}`, 'ป้ายไม่นับ Actual ต้องเป็นบรรทัดสุดท้าย');
  assert.ok(lines.indexOf('สิ่งที่ต้องตรวจก่อนกด:') < lines.indexOf('สิ่งที่จะเกิดขึ้นทันที:'));

  // Override: รายการตรวจชุดเดิม + บรรทัดของ override ก่อนป้ายสถานะ · ป้ายปุ่มบอกว่าไม่นับ Actual
  const o = historicalApprovalPrompt({ subject: 'ใบสั่งขาย SO-26090051-0', checklist, effects, override: { note: 'อนุมัติใบตัวเอง' } });
  assert.equal(o.confirmLabel, 'ยืนยัน Override ใบย้อนหลัง (ไม่นับ Actual)');
  assert.equal(o.title, p.title);
  const checks = (detail) => detail.split('สิ่งที่จะเกิดขึ้นทันที:')[0];
  assert.equal(checks(o.detail), checks(p.detail), 'override ต้องตรวจชุดเดียวกับผู้ตรวจปกติ');
  const oLines = o.detail.split('\n');
  assert.deepEqual(oLines.slice(-2), ['· อนุมัติใบตัวเอง', `· ${HISTORICAL_STATUS_NOTE}`]);
});

test('โมดัลอนุมัติใบย้อนหลังยังบังคับผลลัพธ์จริง — ป้าย "ไม่นับ Actual" ที่เติมเองไม่นับแทน', () => {
  assert.throws(() => historicalApprovalPrompt({ subject: 'x', effects: [] }), /อย่างน้อย 1 อย่าง/);
  assert.throws(() => historicalApprovalPrompt({ subject: 'x', effects: [' '], override: { note: 'n' } }), /อย่างน้อย 1 อย่าง/);
  assert.throws(() => historicalApprovalPrompt({ subject: 'x' }), /อย่างน้อย 1 อย่าง/);
});

/* ══ ปรับแผนงวดหลังอนุมัติ (PR2 · mig 0377 · มติเจ้าของ 23/09 D1/D5) ════════════════════════════════════════
   ⭐ โมดัลต้องบอกผลที่ตรวจได้: รายงวดก่อน→หลัง · งวดที่ล็อกไม่ถูกแตะ · Σ = ยอดใบ · Actual ไม่เปลี่ยน (ยอด + เดือนไทย)
     · ทะเบียนบัญชีเห็นทันที · ฉบับพิมพ์ยังแสดงแผน QT (D5) — ข้อเท็จจริงมาจาก replanPromptFacts (จัดรูปแล้ว) */
const REPLAN_ORDER = {
  id: 'SO1', orderNumber: 'SO-26090001-0', origin: 'pipeline', status: 'approved', totalAmount: 234000,
  actualAmount: 218691.59, approvedAt: '2026-08-31T18:30:00Z', financeStatus: 'pending',
  quotation: { quoteNumber: 'QT-26080011' },
};
const replanRow = (over) => ({
  seq: 1, label: 'งวดที่ 1', percent: 0, amount: 0, status: 'pending', frozenAt: 'x', evidence: [], kind: 'regular', ...over,
});
const REPLAN_ROWS = [
  replanRow({ id: 'A', seq: 1, label: 'มัดจำ', percent: 30, amount: 70200, status: 'confirmed' }),
  replanRow({ id: 'B', seq: 2, label: 'งวดที่ 2', percent: 40, amount: 93600 }),
  replanRow({ id: 'C', seq: 3, label: 'งวดที่ 3', percent: 30, amount: 70200 }),
];
const replanFacts = (draft, order = REPLAN_ORDER, rows = REPLAN_ROWS, opts = {}) => {
  const built = buildReplanRows(order, rows, draft, opts);
  assert.equal(built.error, null);
  return replanPromptFacts(order, rows, built.rows, opts);
};

test('paymentPlanEditPrompt: หัว/คำถาม/ปุ่มตามมติ · ไม่ใช่ irreversible (ปรับซ้ำได้)', () => {
  const p = paymentPlanEditPrompt(replanFacts([{ id: 'B', amount: 50000 }, { id: 'C', amount: 50000 }, { id: null, amount: 63800 }]));
  assert.equal(p.title, 'ยืนยันปรับแผนงวดชำระ');
  assert.equal(p.description, 'ยืนยันการปรับแผนงวด SO-26090001-0 · 3 งวด → 4 งวด หรือไม่');
  assert.equal(p.confirmLabel, 'ยืนยันปรับแผนงวด');
  assert.doesNotMatch(p.detail, new RegExp(IRREVERSIBLE_NOTE));
});

test('paymentPlanEditPrompt: บรรทัด Actual มียอดและเดือนไทยของ approvedAt · เทียบก่อน/หลังรายงวด · งวดล็อกไม่ถูกแตะ', () => {
  const p = paymentPlanEditPrompt(replanFacts([
    { id: 'B', amount: 50000, dueDate: '2026-10-31' }, { id: 'C', amount: 50000 }, { id: null, amount: 63800 },
  ]));
  const lines = p.detail.split('\n');
  // 18:30Z ของ 31 ส.ค. = 01:30 ของ 1 ก.ย. เวลาไทย ⇒ Actual อยู่เดือน ก.ย. (ไม่ใช่ ส.ค. ของนาฬิกา UTC)
  assert.ok(lines.includes('· ยอด Actual ฿218,691.59 เดือน ก.ย. 2026 ไม่เปลี่ยน — ใบยังอนุมัติอยู่ ไม่ต้องย้อนการอนุมัติ'), p.detail);
  assert.ok(lines.includes('· งวดที่ 2: ฿93,600.00 (40.00%) → ฿50,000.00 (21.37%) · ครบกำหนด 31/10/2026'), p.detail);
  assert.ok(lines.includes('· เพิ่ม งวดที่ 4 ฿63,800.00'));
  assert.ok(lines.includes('· งวดที่รับเงินแล้ว/รอบัญชีตรวจ/มีเอกสารผูก 1 งวด ฿70,200.00 ไม่ถูกแตะ (ยอด หลักฐาน ใบกำกับคงเดิม)'));
  assert.ok(lines.includes('· ยอดรวมทุกงวด ฿234,000.00 = ยอดใบ (รวม VAT)'));
  assert.ok(lines.includes('· ทะเบียนรับชำระของบัญชีแสดงยอดใหม่ทันที'));
  assert.ok(lines.includes('· ใบสั่งขายฉบับพิมพ์ยังแสดงแผนตามใบเสนอราคา QT-26080011 — แผงงวดและทะเบียนบัญชีขึ้นป้าย “ปรับแผนหลังอนุมัติ”'));
  assert.doesNotMatch(p.detail, /คิวปิดใบ/, 'ยังมีงวดค้าง — ห้ามสัญญาว่าเข้าคิวปิดใบ');
  assert.doesNotMatch(p.detail, /จ่ายถึง|สัญญา /, 'ใบสินค้า ไม่มีสัญญาผูก — ไม่พูดเรื่องบริการ');
});

test('paymentPlanEditPrompt: ไม่มีงวดล็อก = ไม่มีบรรทัดงวดล็อก · ใบบริการบอก "จ่ายถึง" · ใบที่ผูกสัญญาบอกข้อ 3', () => {
  const rows = REPLAN_ROWS.map((r) => ({ ...r, status: 'pending' }));
  const order = { ...REPLAN_ORDER, serviceContractId: 'CT1', serviceContract: { contractNo: 'CT-2609001' } };
  const p = paymentPlanEditPrompt(replanFacts(
    [{ id: 'A', amount: 117000, dueDate: '2026-10-01' }, { id: 'B', amount: 117000, dueDate: '2026-11-01' }],
    order, rows, { serviceRounds: true },
  ));
  assert.doesNotMatch(p.detail, /ไม่ถูกแตะ/);
  assert.match(p.detail, /“จ่ายถึง” ยังว่าง — ยังไม่มีงวดที่บัญชีรับรองครอบบริการ/);
  assert.match(p.detail, /สัญญา CT-2609001 ข้อ 3 ยังระบุงวดเดิม — ทำบันทึกเพิ่มเติมถ้าต้องให้ลูกค้าลงนาม/);
});

test('paymentPlanEditPrompt: บรรทัด "เข้าคิวปิดใบ" ขึ้นเฉพาะเมื่อหลังปรับทุกงวดรับเงินแล้ว', () => {
  const rows = [
    replanRow({ id: 'A', seq: 1, percent: 60, amount: 140400, status: 'confirmed' }),
    replanRow({ id: 'B', seq: 2, percent: 40, amount: 93600, status: 'confirmed' }),
    replanRow({ id: 'Z', seq: 3, label: 'แถม', percent: 0, amount: 0 }),
  ];
  const p = paymentPlanEditPrompt(replanFacts([], REPLAN_ORDER, rows));
  assert.match(p.detail, /· ทุกงวดรับเงินครบ — ใบเข้าคิวปิดใบของบัญชี/);
});

test('paymentPlanEditPrompt: ไม่มีงวดที่เปลี่ยน หรือไม่รู้ยอด/เดือน Actual = สร้างโมดัลไม่ได้', () => {
  const facts = replanFacts([{ id: 'B', amount: 50000 }, { id: 'C', amount: 113800 }]);
  assert.throws(() => paymentPlanEditPrompt({ ...facts, changes: [] }), /อย่างน้อย 1 งวด/);
  assert.throws(() => paymentPlanEditPrompt({ ...facts, changes: ['  '] }), /อย่างน้อย 1 งวด/);
  assert.throws(() => paymentPlanEditPrompt({ ...facts, actualMonthLabel: '' }), /Actual/);
  assert.throws(() => paymentPlanEditPrompt({ ...facts, actualAmountLabel: '' }), /Actual/);
  assert.throws(() => paymentPlanEditPrompt(), /อย่างน้อย 1 งวด/);
});


/* ══ PR3 · เงินค้างจากใบที่ยกเลิก (mig 0378 · มติ D4) ═══════════════════════════════════════════════════════ */
const CARRY_TARGET = {
  id: 'SOR-N', orderNumber: 'SO-26090002-0', origin: 'pipeline', status: 'approved', dealId: 'D1', totalAmount: 100000,
  actualAmount: 93457.94, approvedAt: '2026-08-31T18:30:00Z', quotation: { quoteNumber: 'QT-26090002' }, financeStatus: 'pending',
};
const CARRY_SOURCE = { id: 'SOR-C', orderNumber: 'SO-26080039-0', origin: 'pipeline', status: 'cancelled', dealId: 'D1', totalAmount: 80000 };
const carryRow = (over) => ({
  seq: 1, label: 'งวดที่ 1', percent: 0, amount: 0, status: 'pending', frozenAt: 'f', evidence: [], movedFrom: [],
  updatedAt: 'u', ...over,
});
const CT1 = carryRow({ id: 'T1', seq: 1, percent: 30, amount: 30000 });
const CT2 = carryRow({ id: 'T2', seq: 2, label: 'ก่อนส่งมอบ', percent: 70, amount: 70000 });
const CS1 = carryRow({ id: 'S1', salesOrderId: 'SOR-C', label: 'มัดจำ', amount: 20000, status: 'confirmed', taxInvoiceNo: 'IV-7' });
const CS2 = carryRow({ id: 'S2', salesOrderId: 'SOR-C', seq: 2, label: 'งวดที่ 2', amount: 10000, status: 'reported' });
const carryFacts = (carried = [CS1, CS2], extra = {}) => carryPromptFacts(CARRY_TARGET, CARRY_SOURCE, [CT1, CT2], carried,
  applyCarryIn(CARRY_TARGET, [CT1, CT2], carried), { sourceRows: [CS1, CS2], ...extra });

test('paymentCarryPrompt: หัว/คำถาม/ปุ่ม · ถอนคืนเองไม่ได้ · ย้ายแถวเงินทั้งแถว (บัญชีไม่ต้องรับรองซ้ำ)', () => {
  const p = paymentCarryPrompt(carryFacts());
  assert.equal(p.title, 'ยืนยันยกเงินจากใบที่ยกเลิก');
  assert.equal(p.description, 'ยืนยันการยกเงิน 2 งวด ฿30,000.00 จาก SO-26080039-0 → SO-26090002-0 หรือไม่');
  assert.equal(p.confirmLabel, 'ยืนยันยกเงิน');
  assert.match(p.detail, /^⚠️ ย้อนกลับเองไม่ได้/);
  assert.match(p.detail, /· ย้ายงวดที่มีเงิน 2 งวด ฿30,000\.00 จาก SO-26080039-0 \(ยกเลิกแล้ว\) มาเป็นงวดของใบนี้ — สลิป · วันจ่าย · คำรับรองของบัญชี · ใบกำกับภาษีคงเดิม บัญชีไม่ต้องรับรองซ้ำ/);
  assert.match(p.detail, /· ยกมาเป็นงวดที่ 1: มัดจำ ฿20,000\.00 · รับเงินแล้ว/);
  assert.match(p.detail, /· ยกมาเป็นงวดที่ 2: งวดที่ 2 ฿10,000\.00 · รอบัญชีตรวจ/);
  assert.match(p.detail, /· สลิปรอบัญชีตรวจ 1 งวด ฿10,000\.00 ย้ายมาอยู่ในคิวบัญชีของใบนี้/);
  assert.match(p.detail, /· ใบกำกับภาษี IV-7 ย้ายมากับงวด — ไม่ต้องออกใหม่/);
});

test('paymentCarryPrompt: แผนที่เหลือของใบนี้ก่อน→หลัง · Σ = ยอดใบ · Actual ไม่เปลี่ยน (ยอด + เดือนไทย) · เงินค้างที่เหลือของใบเดิม · D5', () => {
  const p = paymentCarryPrompt(carryFacts());
  assert.match(p.detail, /· ลบ งวดที่ 1 ฿30,000\.00 \(ยังไม่มีการชำระ\)/);
  assert.match(p.detail, /· งวดที่ 2 → งวดที่ 3: ยอดคงเดิม ฿70,000\.00/);
  assert.match(p.detail, /· ยอดรวมทุกงวด ฿100,000\.00 = ยอดใบ \(รวม VAT\)/);
  assert.match(p.detail, /· ยอด Actual ฿93,457\.94 เดือน ก\.ย\. 2026 ของใบนี้ไม่เปลี่ยน — SO-26080039-0 ยกเลิกแล้วไม่นับ Actual อยู่แล้ว/);
  assert.match(p.detail, /· SO-26080039-0 ไม่เหลือเงินค้าง — ออกจากหัวข้อ “เงินค้างจากใบที่ยกเลิก” ของบัญชี/);
  assert.match(p.detail, /· ใบสั่งขายฉบับพิมพ์ยังแสดงแผนตามใบเสนอราคา QT-26090002 — งวดที่ต่างจากแผนขึ้นป้าย “ปรับแผนหลังอนุมัติ”/);
  assert.doesNotMatch(p.detail, /เข้าคิวปิดใบ/);
  const partial = paymentCarryPrompt(carryFacts([CS1]));
  assert.match(partial.detail, /· SO-26080039-0 ยังเหลือเงินค้าง 1 งวด ฿10,000\.00 — ยกเพิ่มหรือให้บัญชีบันทึกคืนเงินได้ภายหลัง/);
  assert.doesNotMatch(partial.detail, /สลิปรอบัญชีตรวจ/);
});

test('paymentCarryPrompt: ไม่มีงวดที่ยก หรือไม่รู้ยอด/เดือน Actual = สร้างโมดัลไม่ได้ · ทุกงวดรับเงินแล้ว = เข้าคิวปิดใบ', () => {
  const facts = carryFacts();
  assert.throws(() => paymentCarryPrompt({ ...facts, count: 0 }), /อย่างน้อย 1 งวด/);
  assert.throws(() => paymentCarryPrompt({ ...facts, actualMonthLabel: '' }), /Actual/);
  assert.throws(() => paymentCarryPrompt(), /อย่างน้อย 1 งวด/);
  assert.match(paymentCarryPrompt({ ...facts, complete: true }).detail, /· ทุกงวดรับเงินครบ — ใบเข้าคิวปิดใบของบัญชี/);
});

test('paymentRefundPrompt: บอกยอดที่คืน · ทะเบียนลดยอดเก็บได้ · ใบลดหนี้คู่ใบกำกับ · ทางถอน · Actual ไม่เปลี่ยน', () => {
  const p = paymentRefundPrompt({
    label: 'มัดจำ', amount: '฿20,000.00', orderNumber: 'SO-26080039-0', refundedOnLabel: '20/09/2026',
    taxInvoiceNo: 'IV-7', creditNoteNo: 'CN-0001',
  });
  assert.equal(p.title, 'บันทึกคืนเงินให้ลูกค้า');
  assert.equal(p.description, 'ยืนยันการบันทึกคืนเงิน มัดจำ · ฿20,000.00 หรือไม่');
  assert.equal(p.confirmLabel, 'ยืนยันบันทึกคืนเงิน');
  assert.doesNotMatch(p.detail, /ย้อนกลับเองไม่ได้/, 'ถอนการบันทึกได้');
  assert.match(p.detail, /· บันทึกว่าคืนเงินงวดนี้ ฿20,000\.00 ให้ลูกค้าเต็มจำนวนแล้ว \(วันที่คืน 20\/09\/2026\)/);
  assert.match(p.detail, /· งวดออกจาก “เงินค้างจากใบที่ยกเลิก” ของ SO-26080039-0 และยอดเก็บได้ในทะเบียนบัญชีลดลง ฿20,000\.00/);
  assert.match(p.detail, /· งวดนี้มีใบกำกับภาษี IV-7 — บันทึกคู่กับใบลดหนี้ CN-0001/);
  assert.match(p.detail, /· งวดที่คืนเงินแล้วยกไปใบใหม่และถอนคำรับรองไม่ได้ — บันทึกผิดให้ “ถอนการบันทึกคืนเงิน” \(เมนูแถว\)/);
  assert.match(p.detail, /· ยอด Actual ไม่เปลี่ยน — ใบนี้ยกเลิกแล้วไม่นับ Actual อยู่แล้ว/);
  const plain = paymentRefundPrompt({ label: 'งวดที่ 2', amount: '฿1.00', orderNumber: 'SO-1' });
  assert.doesNotMatch(plain.detail, /ใบลดหนี้/);
  assert.throws(() => paymentRefundPrompt({ label: 'x' }), /ยอด/);
});

test('paymentRefundClearPrompt: งวดกลับเป็นเงินค้าง · ล้างข้อมูลคืนเงิน (ร่องรอยอยู่ในประวัติ)', () => {
  const p = paymentRefundClearPrompt({ label: 'มัดจำ', amount: '฿20,000.00', creditNoteNo: 'CN-0001' });
  assert.equal(p.title, 'ถอนการบันทึกคืนเงิน');
  assert.equal(p.confirmLabel, 'ยืนยันถอนการบันทึก');
  assert.match(p.detail, /· งวดนี้กลับเป็น “เงินค้างจากใบที่ยกเลิก” ฿20,000\.00 — ยกไปใบใหม่ของดีลเดียวกันหรือบันทึกคืนใหม่ได้/);
  assert.match(p.detail, /· ล้างวันที่คืน เหตุผล และเลขใบลดหนี้ CN-0001 ของงวดนี้ — ร่องรอยอยู่ในประวัติการแก้ไข/);
  assert.match(p.detail, /· ยอดเก็บได้ในทะเบียนบัญชีเพิ่มกลับ ฿20,000\.00/);
});

/* ══ review UI-1 / F2: โมดัลรับรองเงินต้องพูดตามสถานะใบ (PR0/PR3 เปิดให้บัญชีรับรองบนใบยกเลิก · D3 บนใบที่ย้อนการอนุมัติ/Rev. ร่าง) ══
   🐞 เดิมทุกใบได้สองบรรทัดของใบที่อนุมัติอยู่: "ถ้าใบนี้ถูกย้อนการอนุมัติ/ออก Rev. …" + "Actual … เป็นยอดเต็มตั้งแต่ใบอนุมัติแล้ว"
     ⇒ ใบยกเลิก (ไม่นับ Actual · ออก Rev. ไม่ได้) และใบที่ย้อนการอนุมัติ (Actual ถูกถอนแล้ว) ได้คำเท็จ และไม่รู้ว่ารับรองแล้ว
       เงินไปเป็น "เงินค้างจากใบที่ยกเลิก" */
test('🔴 คอนเฟิร์มงวดของใบที่ยกเลิก: บอกว่าเป็นเงินค้าง (ยกเข้าใบใหม่/บันทึกคืนเงิน) · ไม่นับ Actual · ไม่มีบรรทัด Rev./Actual ของใบที่อนุมัติ', () => {
  const p = paymentConfirmPrompt({ label: 'งวดที่ 2', amount: '฿16,050.00', orderStatus: 'cancelled' });
  assert.match(p.detail, /บันทึกว่าเงินงวดนี้เข้าบัญชีบริษัทแล้วจริง/);
  assert.match(p.detail, /ใบนี้ยกเลิกแล้ว — งวดนี้เป็น “เงินค้างจากใบที่ยกเลิก”: ยกเข้าใบใหม่ของดีลเดียวกัน/);
  assert.match(p.detail, /บัญชีบันทึกคืนเงิน/);
  assert.match(p.detail, /ใบที่ยกเลิกไม่นับ Actual/);
  assert.doesNotMatch(p.detail, /ถ้าใบนี้ถูกย้อนการอนุมัติ/);
  assert.doesNotMatch(p.detail, /ยอดเต็มตั้งแต่ใบอนุมัติแล้ว/);
  assert.doesNotMatch(p.detail, new RegExp(IRREVERSIBLE_NOTE));
  assert.match(p.detail, /บัญชีถอนได้ที่เมนู “ถอนคำรับรอง”/);
});

test('🔴 คอนเฟิร์มงวดของใบที่ย้อนการอนุมัติ / ใบ Rev. ที่ยังไม่อนุมัติ: เงินย้ายไปกับใบ Rev. · Actual นับเมื่อใบอนุมัติ (ไม่ใช่ "ยอดเต็มตั้งแต่อนุมัติ")', () => {
  const revoked = paymentConfirmPrompt({ label: 'งวดที่ 2', amount: '฿16,050.00', orderStatus: 'approval_revoked' });
  assert.match(revoked.detail, /ใบนี้ถูกย้อนการอนุมัติ — ตอนออก Rev\. เงินงวดนี้ย้ายไปกับใบ Rev\. บัญชีไม่ต้องรับรองซ้ำ/);
  assert.match(revoked.detail, /Actual นับเมื่อใบ Rev\. อนุมัติ/);
  assert.doesNotMatch(revoked.detail, /ยอดเต็มตั้งแต่ใบอนุมัติแล้ว/);
  for (const orderStatus of ['draft', 'pending_approval', 'rejected']) {
    const p = paymentConfirmPrompt({ label: 'งวดที่ 2', amount: '฿16,050.00', orderStatus });
    assert.match(p.detail, /ใบนี้ยังไม่อนุมัติ — Actual นับเมื่อ AE Sup อนุมัติใบ/, orderStatus);
    assert.doesNotMatch(p.detail, /ยอดเต็มตั้งแต่ใบอนุมัติแล้ว/, orderStatus);
    assert.doesNotMatch(p.detail, /ถ้าใบนี้ถูกย้อนการอนุมัติ/, `${orderStatus}: ใบที่ยังไม่อนุมัติย้อนการอนุมัติไม่ได้`);
  }
  // ใบที่อนุมัติอยู่ / ไม่รู้สถานะ = ภาพนิ่งเดิมทุกตัวอักษร
  assert.deepEqual(paymentConfirmPrompt({ label: 'งวดที่ 2', amount: '฿16,050.00', orderStatus: 'approved' }),
    paymentConfirmPrompt({ label: 'งวดที่ 2', amount: '฿16,050.00' }));
  // ใบย้อนหลังพูดชุดของตัวเองเสมอ (สถานะใบไม่เปลี่ยนคำ)
  assert.deepEqual(paymentConfirmPrompt({ label: 'ก', amount: '฿1.00', historical: true, orderStatus: 'cancelled' }),
    paymentConfirmPrompt({ label: 'ก', amount: '฿1.00', historical: true }));
});

/* review MONEY-1: คำเตือนสลิปชื่อซ้ำ (carryDuplicates) ต้องถึงโมดัลยืนยันการยกเงิน */
test('paymentCarryPrompt: คำเตือนสลิปชื่อซ้ำกับงวดของใบนี้ขึ้นในโมดัลยืนยัน', () => {
  const p = paymentCarryPrompt({
    orderNumber: 'SO-N', sourceNumber: 'SO-C', count: 1, amountLabel: '฿1.00', totalLabel: '฿10.00',
    actualAmountLabel: '฿9.35', actualMonthLabel: 'ก.ย. 2026',
    warnings: ['งวดที่ 1 ของใบนี้แนบสลิปชื่อเดียวกับงวดที่ 1 ของใบที่ยกเลิก (slip.jpg) — ตรวจว่าไม่ใช่เงินก้อนเดียวกันก่อนยก'],
  });
  assert.match(p.detail, /⚠ งวดที่ 1 ของใบนี้แนบสลิปชื่อเดียวกับงวดที่ 1 ของใบที่ยกเลิก \(slip\.jpg\)/);
});
