// เอกสารทั้งหมดของดีลหนึ่งใบ (P5b) — logic ล้วน ทดสอบได้โดยไม่แตะ DB
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEntityDocuments, entityDocumentProgress } from './entityDocuments.js';

test('⭐ "รอเอกสาร" ขึ้นบนสุดเสมอ — เป็นของที่ต้องทำอะไรต่อ', () => {
  // เรียงกลับกันเมื่อไร คนต้องเลื่อนผ่านของที่เสร็จแล้วเพื่อไปหาของที่ค้าง
  const rows = buildEntityDocuments({
    attachments: [{ id: 'A1', fileName: 'a.pdf', createdAt: '2026-08-05' }],
    awaitingRequestItems: [{ id: 'I1', docType: 'ifra', requestId: 'DR-1', createdAt: '2026-08-01' }],
  });
  assert.equal(rows[0].source, 'awaiting');
  assert.match(rows[0].title, /IFRA/);
  assert.equal(rows[1].source, 'attachment');
});

test('ของที่ยังไม่มาลิงก์ไป *คำร้อง* ไม่ใช่ไฟล์', () => {
  // ปุ่ม "เปิดคำร้อง" จะได้ใบซ้ำ เพราะคำร้องเปิดไปแล้ว — สิ่งที่กดได้คือไปดูว่า
  // ค้างอยู่ขั้นไหน
  const [row] = buildEntityDocuments({
    awaitingRequestItems: [{ id: 'I1', docType: 'coa', requestId: 'DR-9' }],
  });
  assert.equal(row.href, '/requests/DR-9');
});

test('⭐ ตัวเลขต้องรู้จักของที่ยังไม่มา ไม่งั้นเป็น 100% เสมอ', () => {
  const rows = buildEntityDocuments({
    attachments: [{ id: 'A1' }, { id: 'A2' }],
    awaitingRequestItems: [{ id: 'I1', docType: 'msds' }],
    checklist: [
      { id: 'C1', title: 'PO ลูกค้า', status: 'pending' },
      { id: 'C2', title: 'สำเนาบัตร', status: 'received', attachmentId: 'A9' },
    ],
  });
  const p = entityDocumentProgress(rows);
  assert.equal(p.waiting, 2, 'บรรทัดคำร้อง + checklist ที่ยังไม่แนบ');
  assert.equal(p.arrived, 3);
  assert.equal(p.total, 5);
});

test('ไม่มีอะไรเลย = ศูนย์ทุกช่อง ไม่ใช่ระเบิด', () => {
  assert.deepEqual(entityDocumentProgress([]), { arrived: 0, waiting: 0, total: 0 });
  assert.deepEqual(buildEntityDocuments(), []);
  assert.deepEqual(buildEntityDocuments({}), []);
});

test('ในกลุ่มเดียวกันเรียงใหม่ก่อนเก่า — ของที่เพิ่งเกิดคือของที่คนกำลังตามหา', () => {
  const rows = buildEntityDocuments({
    attachments: [
      { id: 'A1', fileName: 'เก่า', createdAt: '2026-01-01' },
      { id: 'A2', fileName: 'ใหม่', createdAt: '2026-08-05' },
    ],
  });
  assert.equal(rows[0].title, 'ใหม่');
});

test('ฉบับที่ออกจริงติดป้ายเมื่อเนื้อหาเปลี่ยนหลังอนุมัติ', () => {
  const [row] = buildEntityDocuments({
    issued: [{ id: 'IS1', docNo: 'QT-001', staleAfterApproval: true }],
  });
  assert.match(row.note, /เปลี่ยนหลังอนุมัติ/);
});

test('ทุกแถวมี id ไม่ซ้ำข้ามแหล่ง — id ของแต่ละแหล่งชนกันได้จริง', () => {
  const rows = buildEntityDocuments({
    attachments: [{ id: 'X' }],
    checklist: [{ id: 'X', title: 'ชื่อซ้ำ id' }],
  });
  assert.equal(new Set(rows.map((r) => r.id)).size, rows.length);
});
