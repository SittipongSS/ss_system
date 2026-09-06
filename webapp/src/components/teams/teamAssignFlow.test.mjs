// ── ทางที่บัญชีขายจะได้ทีม ต้องไม่หายไปอีก ────────────────────────────────
//
// 🐞 **ของจริงที่หลุด** (ตรวจย้อน 2026-09-07): #1629 ถอดช่องทีมออกจากหน้าผู้ใช้ ⇒ บัญชีขาย
//    เกิดมาไม่มีทีมเสมอ และโมดัลหลังสร้างบัญชีพาไป /sa/teams พร้อมบอกว่าจัดต่อได้ที่นั่น ·
//    แต่ #1633 ที่รื้อหน้าทะเบียน **ทำปุ่ม "จัดเข้าทีม" ในถัง "ยังไม่อยู่ทีมไหน" หายไป**
//    ⇒ ไม่มีทางไหนในระบบเลยที่จะให้ทีมแรกกับบัญชีขายใหม่ · CI เขียวตลอด เพราะเทสต์เดิม
//    ยืนยันแค่ว่า "พาไปหน้านั้น" ไม่ได้ยืนยันว่า "ไปแล้วทำอะไรได้"
//
// ⚠️ เทสต์นี้อ่าน **ซอร์ส** เพราะเป็น client component ที่ import มารันตรง ๆ ไม่ได้
//    (ท่าเดียวกับ navMenuNames.test.mjs · users/teamOwnership.test.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = (f) => readFileSync(join(here, f), 'utf8');
const manager = read('TeamManager.js');
const detail = read('TeamDetail.js');
const modal = read('TeamAssignModal.js');
const usersRoute = readFileSync(join(here, '../../app/api/users/[id]/route.js'), 'utf8');
const teamRoute = readFileSync(join(here, '../../app/api/teams/[code]/route.js'), 'utf8');

test('⭐ ถัง "ยังไม่อยู่ทีมไหน" ต้องมีทางจัดคนเข้าทีม ไม่ใช่รายชื่อเปล่า', () => {
  assert.match(manager, /setAssigning\(person\)/, 'ไม่มีปุ่มจัดเข้าทีมในถังคนที่ยังไม่มีทีม');
  assert.match(manager, /<TeamAssignModal/, 'ไม่ได้เรนเดอร์โมดัลจัดเข้าทีม');
  assert.match(manager, /จัดเข้าทีม/);
});

/* ⭐ กฎข้อแรกของ repo: ฟอร์มสร้าง = ฟอร์มแก้ — "จัดเข้าทีมครั้งแรก" กับ "ย้ายทีม"
   เป็นคำถามชุดเดียวกัน ⇒ ต้องเป็น component เดียว ไม่ใช่สองก้อนที่เพี้ยนหากันได้ */
test('⭐ จัดเข้าทีมกับย้ายทีมใช้โมดัลตัวเดียวกัน', () => {
  assert.match(manager, /import TeamAssignModal/);
  assert.match(detail, /import TeamAssignModal/);
  assert.match(detail, /<TeamAssignModal/);
  // ทีมหลักต้องเป็นคำถามจริงในโมดัลตัวนั้น ไม่ใช่ผลข้างเคียงของลำดับที่วาด
  assert.match(modal, /ทีมหลัก/);
  assert.match(modal, /picked\.length > 1/);
});

/* 🐞 ด่านปิดทีมเคยนับสมาชิกจาก `team_members` ซึ่งเป็นตารางของทีม **ปฏิบัติงาน**
   ⇒ ทีมขายนับได้ 0 เสมอ ปิดทีมที่มีคนอยู่ได้เงียบ ๆ แล้วคนกลุ่มนั้นค้างกับรหัสทีมที่ปิด
   ซึ่งทำให้ทุกการแก้บัญชีของเขาโดนตีกลับทีหลัง */
test('⭐ ปิดทีมขายต้องนับคนจาก Auth ไม่ใช่ตารางทีมปฏิบัติงาน', () => {
  assert.match(teamRoute, /kind === 'sales'\s*\n?\s*\?\s*\(await loadTeamHolderIds/);
});

/* 🐞 ฟอร์มแก้ผู้ใช้ส่ง `role` เสมอแต่ไม่ส่งทีม ⇒ ค่าเดิมถูกยกมาเทียบ · ถ้าเทียบกับเฉพาะทีม
   ที่ยัง active คนที่ทีมเดิมถูกปิดไปแล้วจะแก้อะไรไม่ได้เลยตลอดกาล ทั้งที่เขาไม่ได้เลือกเอง */
test('⭐ ไม่ได้ส่งทีมมา = ยอมรับทีมที่ปิดแล้วด้วย · ส่งมาเอง = ต้องเป็นทีมที่เปิดอยู่', () => {
  assert.match(usersRoute, /const teamGiven = body\.team !== undefined \|\| body\.teams !== undefined/);
  assert.match(usersRoute, /loadSalesTeamCodes\(supabase, \{ includeInactive: !teamGiven \}\)/);
});
