// ── ชิปบอกเจ้าของก้าว (มติผู้ใช้ 2026-08-26) ──────────────────────────────
//
// 🐞 **ปุ่มที่กดได้ไม่เคยบอกว่าเป็นของใคร** — ป้าย "รอ RD" ขึ้นเฉพาะตอนก้าวนั้น
// *ไม่ใช่* ของคนที่กำลังดู ⇒ แอดมินที่มีสิทธิ์สองฝั่งเห็นปุ่มสดทุกแถวโดยไม่มีอะไร
// แยกว่าแถวไหนควรเป็นงานของ RD แถวไหนของ SA
//
// ⚠️ นำเข้าตรง ๆ ไม่ได้ (ไฟล์เป็น "use client" + JSX) ⇒ คุม **กติกา** ผ่านโค้ด
// ไม่ใช่หน้าตา: ชิปขึ้นตอนไหน · เอาชื่อจากไหน
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync('src/components/requests/NextStepBar.js', 'utf8');
const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

test('⭐ ชิปเอาชื่อฝ่ายจริงจาก props ชุดเดียวกับป้าย "รออีกฝั่ง"', () => {
  /* ⚠️ ฝั่งผู้ขอไม่ใช่ SA เสมอไป — RD เปิดใบขอเอกสารจาก FN ก็มี ⇒ ห้าม hardcode
     รหัสฝ่ายที่ไหนเลย · ต้องอ่าน deptLabel/requesterLabel ที่เปลือกส่งมา */
  assert.match(code, /ownerTag = \(owner, \{ deptLabel, requesterLabel \}/);
  assert.ok(!/["']SA["']/.test(code), 'ห้าม hardcode รหัสฝ่ายในคอมโพเนนต์');
  assert.match(code, /deptLabel \|\| "ฝ่าย"/);
  assert.match(code, /requesterLabel \|\| "ผู้ขอ"/);
});

test('🔴 ชิปขึ้นเฉพาะตอนปุ่มกดได้ — กิ่ง "รออีกฝั่ง" ห้ามมีชิป', () => {
  // กิ่งนั้นเขียน "รอ RD" อยู่แล้ว ⇒ ติดชิปซ้ำคือข้อเท็จจริงเดียวกันสองที่ในบรรทัดเดียว
  const notMine = code.indexOf('if (!isMine)');
  const tagDecl = code.indexOf('const tag =');
  assert.ok(notMine > 0 && tagDecl > notMine, 'ชิปต้องประกาศหลังกิ่ง !isMine');
});

test('🔴 ชิปขึ้นเฉพาะตอนสองฝั่งสดพร้อมกัน — คนบทบาทเดียวต้องไม่เห็น', () => {
  /* 🐞 รอบแรกติดทุกครั้งที่ปุ่มกดได้ โดยอ้างว่าปุ่มจางไม่บอกว่าเป็นของใคร ซึ่งผิด —
     กิ่ง !isMine เขียน "รอ RD" อยู่แล้ว ⇒ SA ทั่วไปได้ป้าย "SA" ซ้ำทุกแถวที่กดได้
     ⭐ คนที่แยกไม่ออกจริงคือคนที่ canDept และ canRequester จริงพร้อมกัน (แอดมิน) */
  assert.match(code, /const tag = \(canDept && canRequester\)/);
});

test('⭐ ทุกกิ่งที่มีปุ่มกดได้ต้องมีชิป — outcome (3 ปุ่ม) และปุ่มเดี่ยว', () => {
  const branches = code.split('return (').filter((b) => /styles\.actions/.test(b) && /<Button/.test(b));
  const withTag = branches.filter((b) => /\{tag\}/.test(b));
  assert.equal(withTag.length, 2, `กิ่งที่มีปุ่มกดได้ ${branches.length} · ติดชิป ${withTag.length}`);
});

test('⭐ ปุ่มระดับก้อนใช้ชิปตัวเดียวกัน ไม่วาดเอง', () => {
  /* ปุ่ม "ส่งงาน" รายบรีฟอยู่ในตารางเดียวกับปุ่มรายแถว แต่ไม่ได้ผ่าน RowStepActions
     ⇒ ตารางเดียวมีปุ่มติดชิปกับไม่ติดชิปปนกันไม่ได้ (อ่านเหมือนชิปมีความหมายพิเศษ) */
  assert.match(code, /export function OwnerTag/);
  const scent = readFileSync('src/components/requests/details/ScentDevDetail.js', 'utf8');
  assert.match(scent, /<OwnerTag owner="dept"/);
  // ⚠️ เงื่อนไขต้องตรงกับ RowStepActions — ตารางเดียวมีปุ่มติดชิปกับไม่ติดปนกันไม่ได้
  assert.match(scent, /rowStep\.canDept && rowStep\.canRequester &&/);
  assert.match(scent, /import \{ OwnerTag, RowStepActions \}/);
});
