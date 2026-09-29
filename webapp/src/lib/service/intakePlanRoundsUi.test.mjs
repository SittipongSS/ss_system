// ── แถว "รอตั้งรอบ" ของหน้างานเข้าใหม่: ช่อง "ขายไว้" พูดตาม `planRoundsSoldText` ทั้งการ์ดและตาราง (รีวิว 29/09 · F18) ──
//
// 🐞 เดิม `roundsMixed` ถูกคิดแต่ไม่มีจออ่าน ⇒ สองรายการ 12 กับ 4 รอบที่ไซต์เดียวขึ้น "ขายไว้ 12 รอบ" เฉย ๆ
//   TS ไม่รู้ว่ารายการต่างกัน · ยามนี้กันไม่ให้จอกลับไปพิมพ์ `roundsSold` ตรง ๆ
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const page = readFileSync(path.resolve(process.cwd(), 'src/app/service/intake/page.js'), 'utf8');

test('F18: การ์ดและตารางของแถวรอตั้งรอบใช้ planRoundsSoldText (ค่า + คำแนะนำเมื่อรอบไม่เท่ากัน)', () => {
  assert.equal((page.match(/planRoundsSoldText\(row\)\?\.value/g) || []).length, 2, 'การ์ด + ตาราง');
  assert.equal((page.match(/planRoundsSoldText\(row\)\?\.hint \?/g) || []).length, 2, 'คำแนะนำขึ้นทั้งสองมุมมอง');
  assert.doesNotMatch(page, /fmtNumber\(row\.roundsSold\)/, 'ห้ามพิมพ์ roundsSold ตรง ๆ (ตกกรณีรอบไม่เท่ากัน)');
});
