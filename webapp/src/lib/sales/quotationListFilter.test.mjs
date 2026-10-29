// ตรวจตัวเลข M16 (2026-10-20) — แถบ "ใบเสนอราคา Won n ใบยังไม่ได้ออก ใบสั่งขาย" บน /sa/quotations
// เทสต์พฤติกรรมกับตัวตัดสินตัวจริงที่หน้าเรียก (ไม่ใช่สำเนาเงื่อนไขในเทสต์) · ยามซอร์สของหน้าอยู่ approvalQueueOnLists.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY_QUOTATION_FILTERS, QUOTATION_AWAITING_SO_PICK, awaitingSalesOrderIdSet, quotationPassesListFilters,
} from './quotationListFilter.js';
import { isQuotationWaitingOnMe } from './quotationWorkflow.js';

const NAMES = { U1: 'สมชาย', U2: 'สมหญิง' };
const ownerNameOf = (row) => NAMES[row.deal?.ownerId] || '';

/* ชุดใบครบทุกสถานะ × สถานะอนุมัติ × ผู้สร้าง × ประเภทดีล × เจ้าของ — ธง `_waitingOnMe` คิดด้วยตัวตัดสินของ server */
function fixture() {
  const ctx = { userId: 'U1', dealOwnerId: 'U1', dealClosed: false };
  const quotes = [];
  let n = 0;
  for (const status of ['draft', 'sent', 'rejected', 'accepted', 'cancelled']) {
    for (const approvalStatus of ['not_submitted', 'pending', 'approved']) {
      for (const createdBy of ['U1', 'U9']) {
        n += 1;
        const q = {
          id: `q${n}`, quoteNumber: `QT-26100${String(n).padStart(3, '0')}`, status, approvalStatus, createdBy,
          rejectionReason: n % 2 ? 'แก้ราคา' : '', customerName: n % 4 ? 'บริษัท เอ' : 'บริษัท บี', customerArCode: `AR-${n % 5}`,
          referenceNote: n % 6 === 0 ? 'PO-7788' : '',
          deal: { ownerId: n % 3 ? 'U1' : 'U2', title: `ดีล ${n}`, dealType: n % 2 ? 'SCENT' : 'RE-ORDER' },
        };
        quotes.push({ ...q, _waitingOnMe: isQuotationWaitingOnMe(q, ctx) });
      }
    }
  }
  return quotes;
}

const rowsAfter = (quotes, filters, awaitingIds) => quotes
  .filter((row) => quotationPassesListFilters(row, filters, { awaitingIds, ownerNameOf }));

test('M16c: awaitingSalesOrderIdSet — ยังไม่รู้รายการ SO (null/undefined/ไม่ใช่อาร์เรย์) = ชุดว่าง · [] ที่โหลดสำเร็จ = ใบ Won ทุกใบ', () => {
  const quotes = fixture();
  const accepted = quotes.filter((q) => q.status === 'accepted').map((q) => q.id);
  assert.ok(accepted.length > 2);
  // 🐞 เดิม: ตั้งต้น `[]` ⇒ ระหว่างโหลด/โหลดพัง แถบบอกว่าใบ Won ทุกใบยังไม่มี SO
  for (const unknown of [null, undefined, { error: 'boom' }, 'oops']) {
    assert.equal(awaitingSalesOrderIdSet(quotes, unknown).size, 0, `salesOrders=${JSON.stringify(unknown)}`);
  }
  assert.deepEqual([...awaitingSalesOrderIdSet(quotes, [])].sort(), accepted.slice().sort(), 'รู้แล้วว่าไม่มี SO สักใบ = ค้างทุกใบ');
  assert.equal(awaitingSalesOrderIdSet(null, []).size, 0, 'ยังไม่มีแถวใบเสนอราคา');
});

test('M16c: รายการ SO บางส่วน — ใบที่มี SO ใช้งานอยู่หลุดออก · SO ยกเลิก/ถูกแทนที่ไม่นับว่ามี (ตัวตัดสินกลาง 0169)', () => {
  const quotes = fixture();
  const [a, b, c, d] = quotes.filter((q) => q.status === 'accepted');
  const salesOrders = [
    { quotationId: a.id, status: 'approved' },
    { quotationId: b.id, status: 'pending_approval' },
    { quotationId: c.id, status: 'cancelled' },
    { quotationId: d.id, status: 'approved', supersededById: 'so-rev' },
    { quotationId: quotes.find((q) => q.status === 'draft').id, status: 'approved' },
  ];
  const ids = awaitingSalesOrderIdSet(quotes, salesOrders);
  assert.ok(!ids.has(a.id) && !ids.has(b.id), 'มี SO ใช้งานอยู่ = ไม่ค้าง');
  assert.ok(ids.has(c.id) && ids.has(d.id), 'SO ยกเลิก/ถูกแทนที่ = ยังค้าง');
  for (const id of ids) assert.equal(quotes.find((q) => q.id === id).status, 'accepted', 'นับเฉพาะใบ Won');
  assert.equal(ids.size, quotes.filter((q) => q.status === 'accepted').length - 2);
});

test('M16a: "ดูเฉพาะใบที่ค้าง" = ตัวกรองทั้งชุด ⇒ แถวในตาราง = เลขบนแถบ ทุกชุดตัวกรองที่ค้างไว้ก่อนกด', () => {
  const quotes = fixture();
  const salesOrders = [{ quotationId: quotes.find((q) => q.status === 'accepted').id, status: 'approved' }];
  const awaiting = awaitingSalesOrderIdSet(quotes, salesOrders);
  assert.ok(awaiting.size > 1, 'ชุดทดสอบต้องมีใบค้าง');
  // ใบ accepted ไม่มีวัน "รอฉันลงมือ" (ตัวตัดสินของ server) — เหตุที่ของเดิมได้ 0 แถวเมื่อมาจากป้ายเมนู
  for (const q of quotes.filter((row) => awaiting.has(row.id))) assert.equal(q._waitingOnMe, false, q.quoteNumber);

  const stale = [
    {}, { waitingOnMe: true }, { status: ['draft'] }, { status: ['accepted'] }, { type: ['RE-ORDER'] },
    { owner: ['U2'] }, { query: 'PO-7788' }, { query: 'สมหญิง' },
    { waitingOnMe: true, status: ['sent'], type: ['SCENT'], owner: ['U1'], query: 'บริษัท บี' },
  ];
  for (const before of stale) {
    const label = JSON.stringify(before);
    // 🐞 ของเดิม: สลับธงอย่างเดียว — ตัวกรองที่ค้างยังกรองอยู่
    const oldRows = rowsAfter(quotes, { ...before, pendingSo: true }, awaiting);
    assert.ok(oldRows.length <= awaiting.size, label);
    /* สถานะ=accepted อย่างเดียวไม่ตัดใบค้าง (ใบค้างเป็น accepted ทุกใบ) — ตัวอื่นตัดหมด */
    const harmless = !Object.keys(before).length || (Object.keys(before).length === 1 && before.status?.join() === 'accepted');
    if (!harmless) assert.ok(oldRows.length < awaiting.size, `ของเดิมต้องน้อยกว่าเลขบนแถบ ${label}`);
    // ตอนนี้: ปุ่มตั้ง QUOTATION_AWAITING_SO_PICK ทั้งชุด (แทนที่ ไม่ใช่เติม) ⇒ ตัวกรองเดิมไม่มีผล
    const after = rowsAfter(quotes, QUOTATION_AWAITING_SO_PICK, awaiting);
    assert.equal(after.length, awaiting.size, `แถวหลังกด = เลขบนแถบ ${label}`);
    assert.deepEqual(after.map((r) => r.id).sort(), [...awaiting].sort());
  }
  // มาจากป้ายเมนู (`?count=quotations`) แล้วกดแถบแบบเดิม = 0 แถวทุกครั้ง
  assert.equal(rowsAfter(quotes, { waitingOnMe: true, pendingSo: true }, awaiting).length, 0);
});

test('M16a: pick = ตัวกรองว่างทุกมิติ + ธงเดียว · มีครบทุกคีย์ของตัวกรองตาราง (เพิ่มมิติใหม่แล้วลืมล้าง = แดง)', () => {
  assert.deepEqual(Object.keys(QUOTATION_AWAITING_SO_PICK).sort(), Object.keys(EMPTY_QUOTATION_FILTERS).sort());
  for (const [key, value] of Object.entries(QUOTATION_AWAITING_SO_PICK)) {
    if (key === 'pendingSo') { assert.equal(value, true); continue; }
    assert.deepEqual(value, EMPTY_QUOTATION_FILTERS[key], key);
    assert.ok(Array.isArray(value) ? value.length === 0 : !value, `${key} ต้องว่าง`);
  }
  assert.ok(Object.isFrozen(QUOTATION_AWAITING_SO_PICK) && Object.isFrozen(EMPTY_QUOTATION_FILTERS));
});

test('M16c: ยังไม่รู้รายการ SO ⇒ แถบ 0 · ธงค้างจากก่อนโหลดไม่ทำให้ตารางว่างเพราะชุดว่าง (หน้าใช้ pendingSoActive ปิดธงจนกว่าจะรู้)', () => {
  const quotes = fixture();
  const unknown = awaitingSalesOrderIdSet(quotes, null);
  assert.equal(unknown.size, 0, 'แถบไม่ขึ้น');
  // หน้าส่ง pendingSo = pendingSoOnly && salesOrders !== null ⇒ ระหว่างยังไม่รู้ ตารางเท่ากับไม่มีธง
  assert.equal(rowsAfter(quotes, { pendingSo: false }, unknown).length, quotes.length);
  // ถ้าหลุดส่งธงเข้ามาทั้งที่ยังไม่รู้ = ตารางว่าง (เหตุที่หน้าต้องคุมด้วย salesOrders !== null)
  assert.equal(rowsAfter(quotes, { pendingSo: true }, unknown).length, 0);
});

test('ตัวตัดสินของตาราง: ตาเห็นบนแถว = ค้นเจอ (+ เลข PO ในเอกสารอ้างอิง) · ผู้ดูแลตาม ownerId · ประเภทตาม dealTypeOf', () => {
  const quotes = fixture();
  const one = (filters) => rowsAfter(quotes, filters, new Set()).map((r) => r.id);
  assert.deepEqual(one({}), quotes.map((q) => q.id), 'ไม่มีตัวกรอง = ทุกแถว');
  assert.deepEqual(one({ query: '  po-7788 ' }), quotes.filter((q) => q.referenceNote === 'PO-7788').map((q) => q.id));
  assert.deepEqual(one({ query: 'ar-3' }), quotes.filter((q) => q.customerArCode === 'AR-3').map((q) => q.id));
  assert.deepEqual(one({ query: 'สมหญิง' }), quotes.filter((q) => q.deal.ownerId === 'U2').map((q) => q.id), 'ชื่อผู้ดูแลจาก ownerNameOf');
  assert.deepEqual(one({ owner: ['U2'] }), quotes.filter((q) => q.deal.ownerId === 'U2').map((q) => q.id));
  assert.deepEqual(one({ type: ['RE-ORDER'] }), quotes.filter((q) => q.deal.dealType === 'RE-ORDER').map((q) => q.id));
  assert.deepEqual(one({ status: ['sent', 'draft'] }), quotes.filter((q) => ['sent', 'draft'].includes(q.status)).map((q) => q.id));
  assert.deepEqual(one({ waitingOnMe: true }), quotes.filter((q) => q._waitingOnMe).map((q) => q.id));
  assert.ok(one({ waitingOnMe: true }).length > 0, 'ชุดทดสอบต้องมีใบรอฉันลงมือ');
  // ใบไม่มีดีล — ตัวกรองผู้ดูแลเทียบกับ "" ไม่พัง
  assert.equal(quotationPassesListFilters({ id: 'x', status: 'draft' }, { owner: ['U1'] }, {}), false);
  assert.equal(quotationPassesListFilters({ id: 'x', status: 'draft' }, {}, {}), true);
});
