// ── ยาม: ใครตัดสินเรื่อง "วันกำหนดส่ง" ต้องถามตัวเดียวกัน ─────────────────
//
// 🐞 **ที่มา (ตรวจย้อนหลัง 2026-08-26)** — รอบแรกแก้แค่ `requestAwaitingDue` แล้วคิด
// ว่าจบ · ของจริงมีอีกแปดจุดที่อ่าน `committedDueDate` ดิบและตัดสินคำว่า "เลยกำหนด"
// เอง ⇒ รางบนหน้ารายละเอียดบอก "รอ RD แจ้งวันของรอบแก้" แต่ **ใบเดียวกัน** ในคิว
// ขึ้นป้ายแดง ตกกลุ่ม "เลยกำหนด" และถูกนับเข้าแถบตัวเลข
//
// ⚠️ เทสต์นี้ไม่ได้ตรวจพฤติกรรม (ตัวนั้นอยู่ที่ `dueRound.test.mjs`) — มันตรวจว่า
// **ไม่มีใครแอบอ่านคอลัมน์ดิบกลับมาอีก** ซึ่งเป็นรูปแบบความพังที่เกิดจริงมาแล้ว
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* ไฟล์ที่ "ตัดสินว่าวันยังใช้ได้ไหม" — ต้องอ่านผ่าน `liveDueDate` เท่านั้น
   ⚠️ เพิ่มไฟล์ใหม่ที่ทำหน้าที่นี้ ต้องมาต่อรายการที่นี่ด้วย */
const DECIDERS = [
  'src/lib/requests/queue.js',
  'src/lib/requests/queueBoard.js',
  'src/lib/requests/queueList.js',
  'src/lib/requests/headerFacts.js',
  'src/lib/requests/dueCalendar.js',
  'src/lib/salesPlanning/myQueue.js',
  'src/lib/salesPlanning/mySchedule.js',
  'src/components/requests/requestUi.js',
];

// ตัดคอมเมนต์ออกก่อนเทียบ — คอมเมนต์ที่เล่าว่าเคยผิดยังไงต้องไม่ทำเทสต์แดง
const code = (p) => readFileSync(p, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

test('🔴 ไฟล์ที่ตัดสินเรื่องวัน ห้ามอ่าน committedDueDate ดิบ', () => {
  for (const path of DECIDERS) {
    const src = code(path);
    assert.ok(
      !/\.committedDueDate/.test(src),
      `${path} อ่าน committedDueDate ตรง ๆ — ต้องผ่าน liveDueDate() ไม่งั้นใบที่รอแจ้ง`
      + ' วันของรอบใหม่จะขึ้น "เลยกำหนด" ขัดกับรางบนหน้ารายละเอียด',
    );
    assert.match(src, /liveDueDate/, `${path} ต้อง import liveDueDate`);
  }
});

test('⭐ สองเส้นทางที่โหลดหัวใบล้วน ต้องเติมแถวก่อน ไม่งั้น liveDueDate ตอบไม่ได้', () => {
  // ไม่มี items = ไม่รู้ว่ามีรอบแก้ = ถือว่าวันยังใช้ได้ ⇒ จอตกกลับพฤติกรรมเดิมเงียบ ๆ
  for (const path of [
    'src/app/api/sales-planning/my-schedule/route.js',
    'src/app/api/pm/my-work/route.js',
  ]) {
    assert.match(code(path), /attachReworkRows/, `${path} ต้องเรียก attachReworkRows`);
  }
});

test('⭐ ตัวตัดสินมีตัวเดียว — liveDueDate อยู่กับ dueIsStale ไฟล์เดียวกัน', () => {
  const src = readFileSync('src/lib/requests/dueRound.js', 'utf8');
  assert.match(src, /export function liveDueDate/);
  assert.match(src, /export function dueIsStale/);
});
