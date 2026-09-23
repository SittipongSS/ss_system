import test from 'node:test';
import assert from 'node:assert/strict';

import { IRREVERSIBLE_NOTE, approvalPrompt, paymentConfirmPrompt, costingPriceApprovalEffects, costingPriceApprovalPrompt,
  historicalApprovalPrompt, paymentPlanEditPrompt,
} from './approvalPrompt.js';
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
test('คอนเฟิร์มการชำระเตือนเรื่องถอนไม่ได้ และบอกว่าเงินงวดนี้ย้ายไปกับใบ Rev.', () => {
  const p = paymentConfirmPrompt({ label: 'งวดที่ 2', amount: '฿16,050.00' });
  assert.match(p.detail, new RegExp(IRREVERSIBLE_NOTE));
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
    detail: [
      `⚠️ ${IRREVERSIBLE_NOTE}`, '',
      'สิ่งที่จะเกิดขึ้นทันที:',
      '· บันทึกว่าเงินงวดนี้เข้าบัญชีบริษัทแล้วจริง',
      '· ถ้าใบนี้ถูกย้อนการอนุมัติ/ออก Rev. เงินงวดนี้ย้ายไปกับใบ Rev. — บัญชีไม่ต้องรับรองซ้ำ',
      '· ยอด Actual ของฝ่ายขายไม่เปลี่ยน — เป็นยอดเต็มตั้งแต่ใบอนุมัติแล้ว',
    ].join('\n'),
    confirmLabel: 'ยืนยันว่าเงินเข้าแล้ว',
  };
  assert.deepEqual(paymentConfirmPrompt({ label: 'งวดที่ 2', amount: '฿16,050.00' }), expected);
  assert.deepEqual(paymentConfirmPrompt({ label: 'งวดที่ 2', amount: '฿16,050.00', historical: false, opening: true }), expected,
    'opening ของใบปกติไม่มีความหมาย — ต้องไม่เปลี่ยนอะไร');
});

/* ⭐ ใบย้อนหลังไม่มี Rev. และไม่นับ Actual ตั้งแต่แรก ⇒ สองบรรทัดนั้นของใบปกติเป็นเรื่องไม่จริงกับใบนี้
   สิ่งที่เกิดจริง: "จ่ายถึง" ขยับ · AE Sup ยกเลิกใบไม่ได้อีก (ทางแก้ข้อมูลผิดปิด) · ไม่นับ Actual */
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
  assert.match(p.detail, /ยกเลิกใบนี้ไม่ได้อีกจนกว่าบัญชีถอนคำรับรอง/);
  // PR1 เปลี่ยนเฉพาะบรรทัด Rev. ของใบปกติ — บรรทัดของใบย้อนหลังต้องเท่าเดิมทุกตัวอักษร (ใบย้อนหลังคงกติกาเดิมทุกข้อ)
  assert.ok(p.detail.includes('\n· AE Sup ยกเลิกใบนี้ไม่ได้อีกจนกว่าบัญชีถอนคำรับรอง — ถ้ายอดหรือช่วงครอบผิด ให้ตีกลับแทนการรับรอง\n'));
  assert.doesNotMatch(p.detail, /ย้ายไปกับใบ Rev\./);
  assert.match(p.detail, /· งวดถัดไป งวด ต.ค.–ธ.ค./);
  assert.ok(p.detail.includes(`· ${HISTORICAL_STATUS_NOTE}`));

  // งวดปกติของใบย้อนหลัง · ไม่รู้ "จ่ายถึง" · ไม่มีงวดถัดไป = ไม่พูดสิ่งที่ไม่รู้
  const plain = paymentConfirmPrompt({ label: 'งวด ต.ค.–ธ.ค.', amount: '฿65,484.00', historical: true });
  assert.doesNotMatch(plain.detail, /งวดยกมา/);
  assert.doesNotMatch(plain.detail, /งวดถัดไป/);
  assert.doesNotMatch(plain.detail, /undefined|null/);
  assert.match(plain.detail, /ตามช่วงครอบของงวดนี้/);
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
