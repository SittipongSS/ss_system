import test from 'node:test';
import assert from 'node:assert/strict';

import { IRREVERSIBLE_NOTE, approvalPrompt, paymentConfirmPrompt, costingPriceApprovalEffects, costingPriceApprovalPrompt,
  historicalApprovalPrompt,
} from './approvalPrompt.js';
import { HISTORICAL_STATUS_NOTE } from './sales/historicalOrders.js';

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

/* บัญชีคอนเฟิร์มแล้วถอยได้ทางเดียวคือถอนคำรับรองพร้อมเหตุผล (unconfirm) และล็อกใบไม่ให้ย้อนการอนุมัติ/ออก Rev.
   (ดู paymentLockReason) ⇒ สองเรื่องนี้ต้องอยู่ในโมดัลเสมอ */
test('คอนเฟิร์มการชำระเตือนทั้งเรื่องถอนไม่ได้และเรื่องใบถูกล็อก', () => {
  const p = paymentConfirmPrompt({ label: 'งวดที่ 2', amount: '฿16,050.00' });
  assert.match(p.detail, new RegExp(IRREVERSIBLE_NOTE));
  assert.match(p.detail, /ย้อนการอนุมัติหรือออก Rev\. ใหม่ไม่ได้/);
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
/* 🔴 ใบปกติต้องได้ผลลัพธ์เดิมทุกตัวอักษร — ภาพนิ่งของโมดัลรับรองเงิน (ห้ามพารามิเตอร์ใหม่รั่วเข้าใบปกติ) */
test('คอนเฟิร์มการชำระของใบปกติไม่เปลี่ยนแม้แต่ตัวอักษรเดียว', () => {
  const expected = {
    title: 'บัญชีคอนเฟิร์มการชำระ',
    description: 'ยืนยันการรับชำระ งวดที่ 2 · ฿16,050.00 หรือไม่',
    detail: [
      `⚠️ ${IRREVERSIBLE_NOTE}`, '',
      'สิ่งที่จะเกิดขึ้นทันที:',
      '· บันทึกว่าเงินงวดนี้เข้าบัญชีบริษัทแล้วจริง',
      '· ใบนี้จะย้อนการอนุมัติหรือออก Rev. ใหม่ไม่ได้อีก',
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
