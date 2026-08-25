import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/* ── ทะเบียนหน้าที่ต้องกันคำตอบมาผิดลำดับ ─────────────────────────────────
 *
 * หน้าที่โหลดใหม่ตามตัวกรอง (เดือน · ปี · ขอบเขต · ช่วงวัน · สวิตช์) ต้องทิ้งคำตอบ
 * ของรอบที่ตกไปแล้ว ไม่งั้นคำตอบเก่าที่ตอบช้ากว่าจะได้เขียนทับเป็นตัวสุดท้าย
 * แล้วจอโชว์ข้อมูลของตัวกรองที่ผู้ใช้เลื่อนผ่านไปแล้ว โดยไม่มี error อะไรเลย
 *
 * ⚠️ **ลิสต์นี้เพิ่มได้อย่างเดียว** — หน้าที่หลุดออกจากลิสต์แปลว่ามีคนถอดด่านทิ้ง
 * (เพิ่มหน้าใหม่เข้าลิสต์เมื่อทำหน้ารายการที่มีตัวกรองเพิ่ม)
 */
const GUARDED = [
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
  "app/service/my-visits/page.js",
  "app/sales-planning/deals/page.js",
  "app/sales-planning/leads/page.js",
  "app/sales-planning/targets/page.js",
  "app/sales-planning/targets/history/page.js",
  "app/sales-planning/targets/plan/page.js",
];

const src = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => readFileSync(join(src, rel), "utf8");

test("ทุกหน้ารายการในทะเบียนต้องจองรอบก่อนยิง และเช็คก่อนเขียนจอ", () => {
  for (const rel of GUARDED) {
    const text = read(rel);
    assert.match(text, /import useLatestRun from "@\/lib\/ui\/useLatestRun"/, `${rel}: ไม่ได้ import ตัวกัน`);
    /* ⚠️ ชื่อตัวแปรยืดหยุ่นได้ — หน้าที่โหลดหลายก้อนอิสระต้องมีตัวนับ **คนละชุด**
       (คิวลีดมี startLeadsRun กับ startKpiRun) ⇒ ล็อกที่ "มีตัวนับและมีการจองรอบ"
       ไม่ใช่ล็อกที่ชื่อ */
    assert.match(text, /const start\w* = useLatestRun\(\);/, `${rel}: ไม่ได้สร้างตัวนับรอบ`);
    assert.match(text, /const isLatest = start\w*\(\);/, `${rel}: ไม่ได้จองรอบตอนเริ่มโหลด`);
    assert.match(text, /if \(!isLatest\(\)\) return;/, `${rel}: ไม่มีจุดทิ้งคำตอบของรอบเก่า`);
  }
});

/* 🪤 กับดักที่เจอตอนไล่แก้: เขียน `setLoading(false)` ใน finally โดยไม่เช็ครอบ ⇒ รอบเก่า
   ที่ตอบช้ากว่าไปดับสปินเนอร์ของรอบใหม่ที่ยังบินอยู่ ⇒ จอบอกว่าโหลดเสร็จแล้วทั้งที่
   ข้อมูลยังเป็นของเดิม ซึ่งอ่านออกยากกว่าเดิมอีก */
test("การดับสปินเนอร์ต้องเป็นของรอบล่าสุดเท่านั้น", () => {
  for (const rel of GUARDED) {
    const text = read(rel);
    const bare = text.match(/(?<!isLatest\(\)\) )setLoading\(false\);/g) || [];
    const guarded = text.match(/if \(isLatest\(\)\) setLoading\(false\);/g) || [];
    assert.ok(guarded.length > 0, `${rel}: ไม่มี setLoading ที่เช็ครอบเลย`);
    assert.ok(bare.length === 0 || guarded.length >= bare.length,
      `${rel}: ยังมี setLoading(false) ที่ไม่ได้เช็ครอบ ${bare.length} จุด`);
  }
});

/* คิวคำร้องมีของพิเศษ: ป้ายขอบเขตอ่านจาก **เฮดเดอร์ของคำตอบ** ⇒ ถ้าปล่อยรอบเก่าผ่าน
   ป้ายกับแถวจะเป็นของคนละรอบ แล้วยังมีป้ายมายืนยันความผิดให้ด้วย */
test("คิวคำร้อง: ต้องทิ้งรอบเก่าก่อนถึงบรรทัดที่อ่านเฮดเดอร์ขอบเขต", () => {
  const text = read("app/requests/page.js");
  const guardAt = text.indexOf("if (!isLatest()) return;");
  const headerAt = text.indexOf('res.headers.get("X-Request-Scope")');
  assert.ok(guardAt > 0 && headerAt > 0, "หาบรรทัดที่ต้องตรวจไม่เจอ");
  assert.ok(guardAt < headerAt, "ด่านต้องมาก่อนการอ่านเฮดเดอร์ ไม่งั้นป้ายกับแถวหลุดจากกัน");
});

/* หน้างานของฉันเป็นหน้าแรกที่กันเรื่องนี้ด้วยเลขลำดับที่เขียนเอง — ยกออกมาเป็นของกลาง
   แล้วต้องไม่มีใครถือของตัวเองอีก (สองแบบอยู่ด้วยกัน = แก้ที่หนึ่งลืมอีกที่) */
test("ไม่มีตัวนับรอบที่เขียนเองหลงเหลือ", () => {
  assert.doesNotMatch(read("app/pm/tasks/page.js"), /loadSeq/,
    "ยกไปใช้ lib/ui/latestRun แล้ว — เลขลำดับของหน้าเองต้องไม่กลับมา");
});
