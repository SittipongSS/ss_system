// ── สามกองต้องบวกกันได้เท่าที่ไล่มา ────────────────────────────────────────
//
// 🐞 ของจริงบน prod 2026-08-26: หัวข้อ "ของบน Drive ที่ไม่มีใครอ้างถึง" รายงานว่า
// "ไล่ 586 · มีคนอ้างถึง 359 · ไม่มีใครอ้าง 46" — 359 + 46 = 405 ไม่ใช่ 586
// ⇒ 181 รายการหายไปโดยไม่มีอะไรบอกว่าไปไหน (คือโฟลเดอร์ที่ตั้งใจข้าม)
// หน้าเดียวกันมีปุ่ม "ทิ้งลงถังขยะ" ⇒ ตัวเลขที่อ่านแล้วเข้าใจผิดได้เป็นเรื่องใหญ่กว่าปกติ
import test from 'node:test';
import assert from 'node:assert/strict';

import { classifyDriveItems, DRIVE_FOLDER_MIME } from '@/lib/driveOrphanClassify';

const folder = (id, name, parent = null) => ({ id, name, mimeType: DRIVE_FOLDER_MIME, parents: parent ? [parent] : [] });
const file = (id, name, parent, size = 100) => ({ id, name, mimeType: 'application/pdf', parents: [parent], size: String(size) });

const STRUCTURE = new Set(['ลูกค้า', 'งานขาย']);

test('ทุกรายการต้องถูกจัดลงกองใดกองหนึ่ง — ไม่มีตัวหาย', () => {
  const items = [
    folder('root', 'ลูกค้า'),
    folder('cust', 'บริษัท ก', 'root'),
    folder('empty', 'กล่องเปล่า', 'root'),
    file('f1', 'มีคนอ้าง.pdf', 'cust'),
    file('f2', 'ไม่มีใครอ้าง.pdf', 'cust'),
  ];
  const out = classifyDriveItems(items, new Set(['f1']), STRUCTURE);
  assert.equal(out.scanned, 5);
  assert.equal(
    out.referenced + out.keptFolders + out.orphans.length,
    out.scanned,
    'มีคนอ้าง + โฟลเดอร์ที่เก็บไว้ + กำพร้า ต้องเท่ากับที่ไล่มา',
  );
});

test('โฟลเดอร์โครงสร้างและโฟลเดอร์ที่มีของอยู่ = เก็บไว้ ไม่ใช่กำพร้า', () => {
  const items = [
    folder('root', 'ลูกค้า'), // ชื่อโครงสร้าง
    folder('cust', 'บริษัท ก', 'root'), // มีลูก
    folder('empty', 'กล่องเปล่า', 'root'), // ว่าง + ไม่มีใครอ้าง = กำพร้า
    file('f1', 'เอกสาร.pdf', 'cust'),
  ];
  const out = classifyDriveItems(items, new Set(), STRUCTURE);
  assert.equal(out.keptFolders, 2);
  assert.deepEqual(out.orphans.map((o) => o.id).sort(), ['empty', 'f1']);
  assert.equal(out.orphans.find((o) => o.id === 'empty').kind, 'โฟลเดอร์ว่าง');
});

test('เส้นทางเต็มไล่ขึ้นไปหาพ่อ', () => {
  const items = [folder('root', 'ลูกค้า'), folder('cust', 'บริษัท ก', 'root'), file('f1', 'ก.pdf', 'cust')];
  const out = classifyDriveItems(items, new Set(), STRUCTURE);
  assert.equal(out.orphans.find((o) => o.id === 'f1').path, 'ลูกค้า / บริษัท ก / ก.pdf');
});

test('เรียงจากไฟล์ใหญ่ไปเล็ก และคิดขนาดเป็นตัวเลข', () => {
  const items = [folder('root', 'ลูกค้า'), file('a', 'เล็ก.pdf', 'root', 10), file('b', 'ใหญ่.pdf', 'root', 900)];
  const out = classifyDriveItems(items, new Set(), STRUCTURE);
  assert.deepEqual(out.orphans.map((o) => o.id), ['b', 'a']);
  assert.equal(out.orphans[0].sizeBytes, 900);
});

test('ไม่มีของเลย = ทุกกองเป็นศูนย์ ไม่พัง', () => {
  const out = classifyDriveItems([], new Set(), STRUCTURE);
  assert.deepEqual(out, { scanned: 0, referenced: 0, keptFolders: 0, orphans: [] });
});

// ตัวเลขจริงที่ผู้ใช้เห็น — จำลองสัดส่วนเดียวกันเพื่อกันไม่ให้กลับไปเงียบอีก
test('จำลองเคสจริง 586/359/46 — กองที่สามต้องได้ 181', () => {
  const items = [];
  const refs = new Set();
  for (let i = 0; i < 359; i += 1) { items.push(file(`r${i}`, `อ้างถึง${i}.pdf`, 'root')); refs.add(`r${i}`); }
  for (let i = 0; i < 181; i += 1) items.push(folder(`k${i}`, 'ลูกค้า')); // ชื่อโครงสร้าง = เก็บไว้
  for (let i = 0; i < 46; i += 1) items.push(file(`o${i}`, `กำพร้า${i}.pdf`, 'root'));
  const out = classifyDriveItems(items, refs, STRUCTURE);
  assert.equal(out.scanned, 586);
  assert.equal(out.referenced, 359);
  assert.equal(out.keptFolders, 181);
  assert.equal(out.orphans.length, 46);
});
