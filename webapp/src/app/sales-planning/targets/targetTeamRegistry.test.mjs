// ── จอวางเป้าต้องอ่านรายชื่อทีมจากทะเบียน ไม่ใช่ค่าคงที่ ────────────────────
//
// 🐞 **ตัวเลขผี** (ตรวจย้อน 2026-09-07): ทั้งสามจอวนตามลิสต์ทีมคงที่ ⇒ แถวของทีมที่
//    ไม่อยู่ในลิสต์ (ทีมที่เพิ่งสร้าง หรือทีมที่ปิดไปแล้ว) **ถูกทิ้งเงียบ**: ไม่มีแถวให้เห็น
//    แก้ไม่ได้ เกลี่ยออกไม่ได้ แต่ยังอยู่ในฐานและยังถูกเอาไปทับบนแท็บผลงาน
//    (`overlayHistory` สร้างแถวทีมให้ทุกรหัสที่มันเจอ) — อาการเดียวกับที่ `historyEntry`
//    เขียนไว้เองว่าสร้างมาเพื่อกัน แต่กันได้เฉพาะ "คน" ที่หลุดทีม ไม่ได้กัน "ทีม"
//
// ⚠️ อ่านซอร์สเพราะเป็น client page ที่ import มารันตรง ๆ ไม่ได้
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = (f) => readFileSync(join(here, f), 'utf8');
const grid = read('page.js');
const plan = read('plan/page.js');
const history = read('history/page.js');

test('⭐ ไม่มีจอไหนอ่านรายชื่อทีมจากค่าคงที่อีก', () => {
  for (const [name, src] of [['targets', grid], ['plan', plan], ['history', history]]) {
    assert.doesNotMatch(src, /\bSALES_TEAMS\b/, `${name} ยังอ่าน SALES_TEAMS`);
    assert.doesNotMatch(src, /\bTEAM_LABELS\b/, `${name} ยังอ่านป้ายจากค่าคงที่`);
    assert.match(src, /useSalesTeams/, `${name} ต้องอ่านทะเบียนจริง`);
  }
});

/* ทีมที่ "มีของ" ต้องมีแถวเสมอ แม้จะไม่อยู่ในทะเบียนที่ใช้งานอยู่แล้ว */
test('⭐ ตารางเป้ากับหน้าประวัติต้องกวาดทีมที่มีข้อมูลจริงเข้ามาด้วย', () => {
  assert.match(grid, /for \(const row of targets\)/, 'ตารางเป้าไม่ได้กวาดทีมจากแถวข้อมูล');
  assert.match(history, /for \(const row of savedRows \|\| \[\]\)/, 'หน้าประวัติไม่ได้กวาดทีมจากแถวข้อมูล');
});

/* 🔴 ยอดย้อนหลังกับการแบ่งเป้าปีหน้าใช้ **คนละลิสต์** โดยเจตนา
   active = แบ่งเป้าปีหน้า · history = ยอดจริงย้อนหลัง (รวมทีมที่ปิดแล้ว) */
test('⭐ หน้าแผนแยกลิสต์ "ทีมที่เปิดอยู่" ออกจาก "ทีมที่มีของย้อนหลัง"', () => {
  assert.match(plan, /const activeCodes = useMemo/);
  assert.match(plan, /const historyCodes = useMemo/);
  assert.match(plan, /teams=\{historyCodes\}/, 'ขั้นยอดย้อนหลังต้องได้ historyCodes');
  assert.match(plan, /teams: activeCodes,/, 'planNodes ต้องแบ่งเป้าเฉพาะทีมที่เปิดอยู่');
});

/* 🐞 เขียนยอดย้อนหลังต้องวนตามคีย์ที่ "ขั้น 1 วาดไว้จริง" — วนตามลิสต์อื่นเมื่อไร
   ยอดจริงของทีมที่ไม่ได้อยู่ในหน้าจะถูกเขียนทับด้วย 0 (ตระกูลเดียวกับที่แก้ 2026-08-24) */
test('⭐ บันทึกยอดย้อนหลังวนตามคีย์ของ teamHist เท่านั้น', () => {
  assert.match(plan, /for \(const t of Object\.keys\(teamHist\)\)/);
});

/* 🔴 ลิสต์ทีมห้ามหลุดเข้า deps ของ `load` — `useEffect(() => load(), [load])` +
   `useRevalidateOnFocus(load)` ผูกกับ identity ของ load ⇒ อาเรย์ที่สร้างใหม่ทุกเรนเดอร์
   จะยิง /api/sales-planning/history (ซึ่งกวาด sales_deals ทั้งตาราง) วนไม่รู้จบ */
test('⭐ ตัวโหลดของหน้าแผนต้องไม่ผูกกับรายชื่อทีม', () => {
  const deps = plan.match(/\}, \[historyYears, latestHistYear, startRun\]\);/);
  assert.ok(deps, 'deps ของ load เปลี่ยนไปแล้ว — ตรวจว่าไม่มีรายชื่อทีมหลุดเข้าไป');
  assert.match(plan, /const codesInData = new Set/, 'การเติม teamHist ต้องขับด้วยข้อมูล ไม่ใช่ลิสต์');
});
