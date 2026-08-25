import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { THREAD_POLL_FAST_MS } from "./threadPollSchedule.js";

/* ── จอที่รู้ตัวว่าเก่า ต้องดึงของใหม่เอง ────────────────────────────────────
 *
 * 🐞 อาการจริงที่ด่านนี้กันไว้ (ตรวจระบบ 2026-08-25): ผู้ใช้บ่นว่า "ต้อง F5 ถึงจะได้
 * ข้อมูล" · หนึ่งในต้นเหตุคือหน้ารายละเอียดทั้งสามใบ (คำร้อง · ใบเสนอราคา · ใบสั่งขาย)
 * โยน error ทิ้งเมื่อ action ถูกตีกลับ แล้ว **ไม่ดึงอะไรกลับมาเลย** ⇒ อีกคนอนุมัติไป
 * ก่อนแล้ว เราได้ toast ว่า "อนุมัติแล้ว" แต่ปุ่มอนุมัติยังอยู่ครบและสถานะบนจอยังเก่า
 * คนจึงกดซ้ำแล้วได้ข้อความเดิมไปเรื่อย ๆ
 *
 * ⭐ ด่านฝั่ง server ของทั้งสามใบอ่านแถวสดแล้วตรวจสถานะซ้ำทุกครั้ง ⇒ **คำตอบที่ไม่ผ่าน
 * คือสัญญาณ "จอไม่ตรงกับของจริง" ที่แม่นที่สุดเท่าที่ระบบมี** — ทิ้งไปคือทิ้งของฟรี
 *
 * ⚠️ ตรวจจากตัวหนังสือในซอร์ส เพราะโปรเจกต์นี้ไม่มี test runner ฝั่ง React
 * (กติกาเดียวกับ useStickyState.test.mjs / entityIcon.test.mjs)
 */

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, "..", "..", "app");
const read = (...parts) => readFileSync(join(...parts), "utf8");

const requestDetail = read(app, "requests", "[id]", "page.js");
const quotationDetail = read(app, "sales-planning", "quotations", "[id]", "page.js");
const orderDetail = read(app, "sales-planning", "sales-orders", "[id]", "page.js");
const thread = read(here, "..", "..", "components", "updates", "UpdateThread.js");

test("คำร้อง: action ถูกตีกลับ ต้องดึงใบใหม่แบบไม่พาหน้าไปอยู่สถานะกำลังโหลด", () => {
  assert.match(requestDetail, /if \(!res\.ok\) \{\s*\n\s*load\(\{ background: true \}\)/,
    "ทางที่พลาดต้องเรียก load ก่อนโยน — ไม่งั้นปุ่มค้างอยู่กับสถานะเก่า");
  assert.match(requestDetail, /if \(!opts\?\.background\) setLoading\(true\)/,
    "โหมด background ต้องไม่แตะ loading — ไม่งั้นจอกระพริบทุกครั้งที่ action พลาด");
});

/* ⚠️ สองใบนี้ **ห้าม** ใช้ `load()` ในทางที่พลาด — `load` ของมันเขียนทับร่างที่ผู้ใช้
   กำลังพิมพ์ (form/lines ของใบเสนอราคา · form/confirmation + setDirty(false) ของใบสั่งขาย)
   ⇒ การรีเฟรชจะกลายเป็นการกลืนงานที่ยังไม่บันทึก จึงต้องมีตัวดึง "เฉพาะตัวใบ" แยก */
test("ใบเสนอราคา/ใบสั่งขาย: ดึงเฉพาะตัวใบ ไม่แตะร่างที่พิมพ์ค้าง", () => {
  assert.match(quotationDetail, /const refreshQuote = useCallback/, "ต้องมีตัวดึงเฉพาะตัวใบ");
  assert.match(quotationDetail, /setErrorActionUrl\(data\.accountUrl \|\| ""\);\s*\n[\s\S]{0,600}?refreshQuote\(\);/,
    "ทางที่พลาดของ act ต้องเรียก refreshQuote");
  assert.doesNotMatch(quotationDetail, /setErrorActionUrl\(data\.accountUrl \|\| ""\);\s*\n\s*load\(\);/,
    "ใช้ load ตรงนี้ = ทับ form/lines ที่ยังไม่บันทึก");

  assert.match(orderDetail, /const refreshOrder = useCallback/, "ต้องมีตัวดึงเฉพาะตัวใบ");
  assert.match(orderDetail, /if \(action === "save"\) setSaveState\("error"\);\s*\n[\s\S]{0,600}?refreshOrder\(\);/,
    "ทางที่พลาดของ requestAction ต้องเรียก refreshOrder");
  assert.doesNotMatch(orderDetail, /if \(action === "save"\) setSaveState\("error"\);\s*\n\s*load\(\);/,
    "ใช้ load ตรงนี้ = ทับ form/confirmation แล้วยังรีเซ็ต dirty ทิ้งอีก");
});

/* ── เธรดอัปเดต = ที่เดียวในระบบที่ดึงเองเป็นระยะ ────────────────────────── */

/* ⚠️ **ล็อกพฤติกรรม ไม่ใช่รูปแบบ** — ของเดิมเขียนไว้ว่าต้องเป็น `setInterval(tick, POLL_MS)`
   เป๊ะ ๆ ⇒ พอเปลี่ยนไปใช้ timeout ต่อเนื่องเพื่อถอยจังหวะตอนเธรดเงียบ (2026-08-26)
   ด่านนี้แดงทั้งที่พฤติกรรมที่ตั้งใจคุ้มครองยังอยู่ครบ · ตัวจังหวะมีเทสต์ของตัวเองแล้วที่
   `threadPollSchedule.test.mjs` — ที่นี่เหลือคุมแค่ "ต้องมีรอบดึงเอง + หยุดตอนแท็บซ่อน" */
test("เธรดดึงของใหม่เป็นระยะ และหยุดเมื่อแท็บถูกซ่อน", () => {
  assert.match(thread, /threadPollDelay\(/, "ต้องมีรอบดึงเอง — เธรดคือกล่องสนทนา");
  assert.match(thread, /document\.visibilityState !== "visible"/,
    "ต้องเช็คใน tick — แท็บที่ถูกซ่อนระหว่างทางต้องหยุดยิงด้วย ไม่ใช่แค่ตอน mount");
  assert.match(thread, /clearTimeout\(timer\)/, "ต้องเก็บกวาด ไม่งั้นเปิดหลายใบแล้ว timer ทับกัน");
  assert.match(thread, /removeEventListener\("visibilitychange", onReturn\)/, "ต้องถอด listener ตอน unmount");
});

test("รอบดึงของเธรดต้องไม่ถี่กว่าที่ตั้งใจ และมีคอกกั้นทางที่ผู้ใช้กระตุ้น", () => {
  assert.ok(THREAD_POLL_FAST_MS >= 30_000 && THREAD_POLL_FAST_MS <= 60_000,
    `จังหวะถี่สุดต้องอยู่ระหว่าง 30–60 วินาที (ได้ ${THREAD_POLL_FAST_MS})`);
  assert.match(thread, /Date\.now\(\) - lastLoadAt\.current < MIN_GAP_MS/,
    "visibilitychange กับ focus เด้งพร้อมกันตอนสลับแท็บ — ต้องมีคอกกั้นไม่ให้ยิงซ้อน");
});
