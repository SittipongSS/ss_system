import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/* ── ทะเบียนหน้าที่ต้องดึงของใหม่เองตอนกลับมามองแท็บ ──────────────────────
 *
 * อาการที่ปิด: *"ต้อง F5 ถึงจะดึงข้อมูล"* — แท็บที่เปิดค้างไว้ไม่มีสัญญาณดึงใหม่เลย
 *
 * ⚠️ **ลิสต์นี้เพิ่มได้อย่างเดียว** — หน้าที่หลุดออกไปแปลว่ามีคนถอดสัญญาณทิ้ง
 */
const WIRED = [
  "app/requests/page.js",
  "app/notifications/page.js",
  "app/finance/payments/page.js",
  "app/sa/calendar/page.js",
  "app/mgmt/tasks/page.js",
  "app/mgmt/meetings/page.js",
  "app/mgmt/rocks/page.js",
  "app/pm/tasks/page.js",
  "app/production/page.js",
  "app/production/jobs/page.js",
  "app/production/board/page.js",
  "app/service/page.js",
  "app/service/schedule/page.js",
  // F-1 2026-08-27: ย้ายจาก app/service/my-visits/page.js (เปลี่ยนชื่อ route
  // เป็น "งานวันนี้") — หน้าเดิมหน้าเดียวกัน สัญญาณยังติดครบ ไม่ใช่การถอดออกจากลิสต์
  "app/service/today/page.js",
  "app/service/visits/[id]/page.js",
  "app/sales-planning/deals/page.js",
  "app/sales-planning/leads/page.js",
  "app/sales-planning/targets/page.js",
  "app/sales-planning/targets/history/page.js",
  "app/sales-planning/targets/plan/page.js",
];

/* ── ฮุกที่ถือสัญญาณแทนหน้าทั้งโมดูล ─────────────────────────────────────────
 * โมดูลภาษี (/tax) อ่านข้อมูลทุกหน้าผ่าน `useApiList` ตัวเดียว ⇒ ติดสัญญาณที่ฮุก
 * ครั้งเดียวได้ครบทั้งโมดูล และหน้าใหม่ที่ใช้ฮุกนี้ได้ฟรีโดยไม่ต้องมาเติมทะเบียนข้างบน
 * ⚠️ **ลิสต์นี้เพิ่มได้อย่างเดียว** เหมือนทะเบียนหน้า — หลุดออกไปแปลว่ามีคนถอดสัญญาณทิ้ง
 */
const WIRED_HOOKS = [
  "lib/excise/useApiList.js",
];

const src = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => readFileSync(join(src, rel), "utf8");

test("ทุกหน้าในทะเบียนต้องติดสัญญาณ 'กลับมามองแท็บ'", () => {
  for (const rel of WIRED) {
    const text = read(rel);
    assert.match(text, /import useRevalidateOnFocus from "@\/lib\/ui\/useRevalidateOnFocus"/, `${rel}: ไม่ได้ import`);
    assert.match(text, /useRevalidateOnFocus\(/, `${rel}: ไม่ได้เรียกใช้`);
  }
});

test("ฮุกที่ถือสัญญาณแทนทั้งโมดูลต้องยังติดสัญญาณอยู่", () => {
  for (const rel of WIRED_HOOKS) {
    const text = read(rel);
    assert.match(text, /import useRevalidateOnFocus from "@\/lib\/ui\/useRevalidateOnFocus"/, `${rel}: ไม่ได้ import`);
    assert.match(text, /useRevalidateOnFocus\(/, `${rel}: ไม่ได้เรียกใช้`);
    // กติกาเดียวกับหน้า: รอบเบื้องหลังห้ามพาจอไปอยู่สถานะโหลด และห้ามพ่น error ทับของเดิม
    assert.match(text, /if \(!opts\?\.background\) setLoading\(true\);/, `${rel}: ยังสั่ง setLoading(true) โดยไม่ดูโหมด`);
    assert.match(text, /if \(!opts\?\.background\) setError\(/, `${rel}: รอบเบื้องหลังยังพ่น error ทับของเดิม`);
  }
});

/* 🪤 กับดักหลักของงานนี้: ถ้าโหมดเบื้องหลังยังสั่ง `setLoading(true)` ตารางจะหายแล้ว
   โผล่ใหม่ทุกครั้งที่สลับแท็บกลับมา ⇒ แก้เรื่อง "ข้อมูลเก่า" แล้วได้ "จอกระพริบ" แทน
   ซึ่งน่ารำคาญกว่าเดิม (หลายหน้าซ่อนตารางทั้งก้อนตอน loading เช่น requests · production/jobs) */
test("โหมดเบื้องหลังต้องไม่พาหน้าไปอยู่สถานะโหลด", () => {
  for (const rel of WIRED) {
    const text = read(rel);
    assert.match(text, /if \(!opts\?\.background\) setLoading\(true\);/,
      `${rel}: ยังสั่ง setLoading(true) โดยไม่ดูโหมด`);
    assert.doesNotMatch(text, /\n {4}setLoading\(true\);/,
      `${rel}: ยังเหลือ setLoading(true) แบบไม่มีเงื่อนไขในตัวโหลด`);
  }
});

/* รอบเบื้องหลังที่ล้ม (เน็ตสะดุดตอนสลับแท็บ) ต้องไม่ล้างของเดิมทิ้งแล้วขึ้นแบนเนอร์ error
   ทับหน้าที่ผู้ใช้กำลังอ่านอยู่ — เขาไม่ได้สั่งอะไรเลยด้วยซ้ำ */
test("รอบเบื้องหลังที่ล้มต้องเงียบ ไม่ทับของเดิม", () => {
  const noisy = WIRED.filter((rel) => {
    const text = read(rel);
    if (!/if \(isLatest\(\)\) set(Error|LoadError)\(/.test(text)) return false;
    return true;
  });
  assert.deepEqual(noisy, [], `หน้าที่ยังพ่น error ของรอบเบื้องหลัง: ${noisy.join(", ")}`);
});

/* ── โพลสองตัวบนแถบบน — อยู่ทุกหน้า จึงคูณด้วยจำนวนแท็บที่เปิดค้างเสมอ ── */
test("กระดิ่งกับป้ายบนเมนูต้องไม่ยิงตอนแท็บซ่อน", () => {
  for (const rel of ["components/notifications/NotificationBell.js", "lib/nav/useNavCounts.js"]) {
    const text = read(rel);
    assert.match(text, /document\.visibilityState === "visible"|document\.visibilityState !== "visible"/,
      `${rel}: ไม่ได้เช็คว่าแท็บเปิดอยู่ไหม`);
    assert.match(text, /addEventListener\("visibilitychange"/, `${rel}: ไม่ได้ดึงตอนกลับมามอง`);
    assert.match(text, /removeEventListener\("visibilitychange"/, `${rel}: ไม่ได้ถอด listener ตอน unmount`);
    assert.doesNotMatch(text, /setInterval\(load, POLL_MS\)/, `${rel}: ยังโพลตรง ๆ โดยไม่ผ่านตัวเช็ค`);
  }
});
