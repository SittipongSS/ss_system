// เหตุการณ์ระบบของเธรดดีล — ตัวเลขดีลขยับ + งานที่ผูกดีล (ตรรกะล้วน)
import test from 'node:test';
import assert from 'node:assert/strict';
import { dealForecastUpdate, dealRequestUpdate, dealTaskUpdate } from './dealUpdates.js';
import { dealDocumentUpdate } from './documentUpdates.js';
import { isKnownUpdateKind, isAuthorableKind, updateKindMeta } from '../master/updateTypes.js';

/* ตารางไม่มี CHECK บน kind — ทะเบียนฝั่งโค้ดคือด่านเดียวที่กันชนิดหลุด
   🐞 เทสต์นี้มีมาก่อนแล้ว **แต่ `dealRequestUpdate` ไม่เคยถูกใส่ในลิสต์** ⇒ ชนิด
   `request` (มติ 2026-08-03) หลุดทะเบียนไปเงียบ ๆ · ผลคือ `updateKindMeta` ตกไปใช้
   ชนิดตั้งต้นแล้วป้ายขึ้นว่า "บันทึก" ทั้งในเธรดและบนหัวแจ้งเตือน — เจอ 2026-08-13
   ตอนไล่ว่าทำไม 55 ใบนี้ไม่มีใครอ่าน (85%)
   ⚠️ เพิ่มฟังก์ชันที่สร้างเหตุการณ์ของดีลตัวใหม่เมื่อไร ต้องมาต่อท้ายลิสต์นี้ด้วย */
test('ทุก kind ที่ยิงเข้าเธรดดีลต้องมีในทะเบียน และต้องไม่ใช่ชนิดที่คนพิมพ์เองได้', () => {
  const request = { id: 'DR-1', kind: 'scent_dev', docNo: 'SB-26080001', dept: 'RD', dealId: 'DL-1' };
  const built = [
    dealForecastUpdate({ projectValue: 100 }, { projectValue: 200 }),
    dealTaskUpdate('created', { id: 'T-1', title: 'ส่งตัวอย่าง' }),
    dealTaskUpdate('done', { id: 'T-1', title: 'ส่งตัวอย่าง' }),
    dealTaskUpdate('late', { id: 'T-1', title: 'ส่งตัวอย่าง' }, { lateReason: 'รอลูกค้าตอบ' }),
    ...['submit', 'answer', 'close', 'cancel'].map((a) => dealRequestUpdate(a, request)),
    ...['submit', 'approve', 'reject', 'accept', 'revise', 'cancel', 'revoke', 'unaccept']
      .map((a) => dealDocumentUpdate('quotation', a, { id: 'QT-1', quoteNumber: 'QT-26070028-0' })),
  ];
  for (const event of built) {
    assert.ok(event, 'ต้องสร้างเหตุการณ์ได้');
    assert.ok(isKnownUpdateKind('deal', event.kind), `kind ${event.kind} ไม่มีในทะเบียนของดีล`);
    // ⚠️ ถ้าติดธง authorable คนจะเลือกชนิดนี้ในกล่องพิมพ์ได้ = ปลอมไทม์ไลน์
    assert.equal(isAuthorableKind('deal', event.kind), false, `${event.kind} ต้องไม่ใช่ชนิดที่คนเลือกเองได้`);
    assert.ok(event.body?.trim(), `${event.kind} ต้องมีเนื้อความ`);
  }
});

/* ⚠️ `isKnownUpdateKind` อย่างเดียวจับไม่ครบ — `updateKindMeta` มี fallback เงียบ ๆ
   ที่คืนชนิดตั้งต้นให้ชนิดที่ไม่รู้จัก ⇒ ป้ายผิดโดยไม่มีอะไรพัง · ล็อกป้ายที่ผู้ใช้
   เห็นจริงไว้ด้วย เพราะหัวแจ้งเตือนถูกเก็บเป็นข้อความตายตัวในแถว แก้ย้อนหลังไม่ได้ */
test('เงาของคำร้องบนดีลต้องขึ้นป้าย "คำร้อง" ไม่ใช่ "บันทึก"', () => {
  const event = dealRequestUpdate('answer', { id: 'DR-1', kind: 'scent_dev', docNo: 'SB-26080001', dept: 'RD' });
  assert.equal(event.kind, 'request');
  assert.equal(updateKindMeta('deal', event.kind).label, 'คำร้อง');
  assert.notEqual(updateKindMeta('deal', event.kind).label, updateKindMeta('deal', 'note').label);
});

test('ตัวเลขดีลขยับ: รวมทุกช่องที่เปลี่ยนไว้แถวเดียว · ไม่เปลี่ยน = เงียบ', () => {
  const before = { projectValue: 100000, probability: 20, forecastMonth: '2026-08' };
  const after = { projectValue: 150000, probability: 50, forecastMonth: '2026-09' };

  const all = dealForecastUpdate(before, after);
  assert.match(all.body, /มูลค่า/);
  assert.match(all.body, /โอกาสปิด/);
  assert.match(all.body, /เดือนที่คาดว่าจะปิด/);
  assert.equal(all.meta.probability.from, 20);
  assert.equal(all.meta.probability.to, 50);

  // แก้ช่องเดียวก็ได้แถวเดียวที่พูดเฉพาะช่องนั้น
  const one = dealForecastUpdate(before, { ...before, probability: 80 });
  assert.doesNotMatch(one.body, /มูลค่า/);
  assert.match(one.body, /80%/);

  assert.equal(dealForecastUpdate(before, { ...before }), null, 'ไม่เปลี่ยน = ไม่มีแถว');
  assert.equal(dealForecastUpdate(null, after), null);
  // "100" กับ 100 คือค่าเดียวกัน — ห้ามสร้างแถวเพราะชนิดข้อมูลต่างกัน
  assert.equal(dealForecastUpdate({ projectValue: 100 }, { projectValue: '100' }), null);
});

test('งานที่ผูกดีล: สร้าง/เสร็จ/เลยกำหนด — เหตุผลที่ช้าต้องอยู่ในข้อความ', () => {
  const task = { id: 'T-1', title: 'ส่งตัวอย่างให้ลูกค้า', assigneeName: 'สมชาย', dueDate: '2026-08-05' };
  assert.match(dealTaskUpdate('created', task).body, /สร้างงาน/);
  assert.match(dealTaskUpdate('created', task).body, /2026-08-05/);
  assert.match(dealTaskUpdate('done', task).body, /งานเสร็จ/);

  const late = dealTaskUpdate('late', task, { lateReason: 'โรงงานส่งของช้า' });
  assert.match(late.body, /เลยกำหนด/);
  assert.match(late.body, /โรงงานส่งของช้า/, 'เหตุผลต้องอยู่ในข้อความที่คนอ่านเห็น');
  assert.equal(late.meta.lateReason, 'โรงงานส่งของช้า');

  assert.equal(dealTaskUpdate('อะไรก็ไม่รู้', task), null);
  assert.equal(dealTaskUpdate('done', null), null);
});

// ⚠️ เดิมดึงกลับ/กู้ร่างไม่ขึ้นดีล (ถือเป็นการบ้านภายในของคนทำใบ) เพราะยังอ่านได้
// ในเธรดของใบ — พอใบไม่มีเธรดแล้ว (มติ 2026-08-04) ไม่ส่งขึ้น = เหตุผลหายถาวร
test('เอกสาร → เธรดดีล: ครบทุก action รวมดึงกลับ/กู้ร่าง · ย้อนการรับ/ยกเลิกอนุมัติ', () => {
  const quote = { id: 'QT-1', quoteNumber: 'QT-26070028-0' };
  const withdraw = dealDocumentUpdate('quotation', 'withdraw', quote, { reason: 'ราคายังไม่นิ่ง' });
  assert.equal(withdraw.kind, 'doc_withdraw');
  assert.match(withdraw.body, /ราคายังไม่นิ่ง/);
  // ดึงกลับ ≠ ตีกลับ — ต้องคนละชนิด ไม่งั้นกวาดตาแล้วแยกไม่ออกว่าอันไหนคือปัญหา
  assert.notEqual(withdraw.kind, dealDocumentUpdate('quotation', 'reject', quote).kind);
  assert.match(dealDocumentUpdate('sales_order', 'restore', { id: 'SO-1', orderNumber: 'SO-1' }).body, /กู้คืนกลับเป็นร่าง/);

  const unaccept = dealDocumentUpdate('quotation', 'unaccept', quote, { reason: 'ลูกค้าขอยกเลิก' });
  assert.match(unaccept.body, /ดีลหลุดจาก Won/);
  assert.match(unaccept.body, /ลูกค้าขอยกเลิก/);

  const revoke = dealDocumentUpdate('sales_order', 'revoke', { id: 'SO-1', orderNumber: 'SO-26070001-0' });
  assert.match(revoke.body, /ยอดหลุดจาก Actual/);
  // ⚠️ คำต้องห้ามของ workflow เอกสาร — ต้องใช้ "ยกเลิกอนุมัติ" ไม่ใช่ "เพิกถอน"
  assert.doesNotMatch(revoke.body, /เพิกถอน|ถอน|ถอด/);
});

test('เอกสาร → เธรดดีล: เลขที่ใบอยู่ในข้อความเสมอ (RichText ทำเป็นลิงก์ /go/ ต่อ)', () => {
  for (const action of ['submit', 'approve', 'reject', 'accept', 'revise']) {
    const e = dealDocumentUpdate('quotation', action, { id: 'QT-1', quoteNumber: 'QT-26070028-0' });
    assert.match(e.body, /QT-26070028-0/, `${action} ต้องบอกเลขที่ใบ`);
    assert.equal(e.meta.docNumber, 'QT-26070028-0');
  }
  // ใบไม่มีเลขที่ (ร่างที่ยังไม่ออกเลข) ต้องไม่พัง แค่ไม่มีเลขให้ลิงก์
  const noNumber = dealDocumentUpdate('sales_order', 'approve', { id: 'SO-1' });
  assert.ok(noNumber.body.includes('ใบสั่งขาย'));
  assert.equal(noNumber.meta.docNumber, null);
});
