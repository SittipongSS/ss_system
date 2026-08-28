import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canViewUpdates } from "../master/updateAccess.js";

/* ความคืบหน้าของ "งานที่ผูกดีล" ที่ไหลเข้าเธรดดีล

   เดิมดีลได้แค่ 3 จังหวะ (สร้าง/เสร็จ/เลยกำหนด) ส่วนเนื้อความจริงที่คนพิมพ์ไว้ใน
   เธรดของงานไม่ไหลออกมาไหนเลย — คนดูดีลเห็นว่ามีงาน แต่ไม่รู้ว่างานเดินไปถึงไหน

   🔴 กติกาที่ห้ามพัง: เธรดของงานมีด่านของตัวเอง (คนเกี่ยวข้อง + ทีม) ซึ่ง
   **แคบกว่าด่านของดีล** — เห็นดีลไม่ได้แปลว่าเห็นทุกอย่างใต้ดีล กติกาเดียวกับที่
   หน้าโครงการต้องกรองเธรดดีลรายใบ (PR #861) */

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const ROUTE = read("../../app/api/sales-planning/deals/[id]/overview/route.js");
const PAGE = read("../../app/sales-planning/deals/[id]/page.js");

test("ด่านของเธรดงานไม่ใช่ด่านเดียวกับดีล — เหมาไม่ได้", async () => {
  // ผู้รับผิดชอบงานอยู่ทีม KA (ด่านของงานอ่านทีมจาก auth ไม่ใช่จากแถวงาน)
  const db = {
    from: () => db, select: () => db, eq: () => db,
    maybeSingle: async () => ({ data: null, error: null }),
    auth: { admin: { getUserById: async () => ({ data: { user: { app_metadata: { team: "KA", department: "SA" } } } }) } },
  };
  const task = { id: "T1", ownerId: "U-AE", assigneeId: "U-AE" };

  const sameTeam = { id: "U-AE2", role: "ae", department: "SA", team: "KA" };
  const otherTeam = { id: "U-AE3", role: "ae", department: "SA", team: "KB" };
  const factory = { id: "U-PC", role: "pc", department: "PC" };

  assert.equal(await canViewUpdates(db, "personal_task", task, sameTeam), true,
    "ทีมเดียวกันเห็นได้ (ตรงกับขอบเขตที่หน้างานของฉันเปิดให้)");
  // 🔴 ดีลของทีม KA อาจถูกอ่านโดยหัวหน้า/แอดมินข้ามทีม — แต่งานใต้ดีลไม่ได้เปิดตาม
  assert.equal(await canViewUpdates(db, "personal_task", task, otherTeam), false,
    "ต่างทีมต้องไม่เห็นเธรดงาน — นี่คือเหตุผลที่ต้องกรองรายใบก่อนส่งเข้าเธรดดีล");
  assert.equal(await canViewUpdates(db, "personal_task", task, factory), false);
});

test("server กรองเธรดงานรายใบก่อนส่งออก ไม่ใช่เหมาทั้งก้อน", () => {
  assert.match(ROUTE, /canViewUpdates\(\s*supabase,\s*'personal_task'/,
    "ต้องเรียกด่านของ personal_task ต่อใบ");
  assert.match(ROUTE, /hiddenTaskFeeds/,
    "ต้องบอกจำนวนที่ถูกซ่อน — เส้นเรื่องที่สั้นลงเงียบ ๆ อ่านเป็น 'ไม่มีความคืบหน้า'");
  // ต้องยิงด้วย id ที่ผ่านด่านแล้วเท่านั้น
  const query = ROUTE.slice(ROUTE.indexOf("taskUpdates = "), ROUTE.indexOf("const canEdit"));
  assert.doesNotMatch(query, /\.in\('entityId',\s*enrichedDealTasks/,
    "ห้ามยิงด้วยรายการงานดิบ ต้องใช้ชุดที่ผ่านด่านแล้ว");
});

test("หน้าดีลบอกจำนวนงานที่ถูกซ่อน", () => {
  assert.match(PAGE, /hiddenTaskFeeds > 0/, "ต้องมีป้ายบอกของที่ถูกซ่อน");
});

test("บรรทัดคำร้องอ้างชื่อคอลัมน์ที่มีจริง", () => {
  /* 🐞 เคยอ้าง `q.requesterName` / `q.assigneeName` ซึ่งไม่มีในตาราง dept_requests
     (คอลัมน์จริงคือ requestedByName / closedByName) — ชื่อคนในบรรทัดคำร้องจึงว่าง
     มาตลอดโดยไม่มี error ให้เห็น */
  // ตัดคอมเมนต์ทิ้งก่อน — คำอธิบายบั๊กมีชื่อเก่าอยู่ด้วยโดยตั้งใจ
  const feed = PAGE.slice(PAGE.indexOf("const inqs ="), PAGE.indexOf("const taskRows"))
    .replace(/\/\/[^\n]*/g, "");
  assert.doesNotMatch(feed, /q\.requesterName|q\.assigneeName/,
    "ชื่อคอลัมน์ที่ไม่มีจริงไม่ระเบิด มันแค่ว่าง");
  assert.match(feed, /q\.requestedByName/);
  assert.match(feed, /q\.closedByName/);
});

test("รายการที่ยืมมาแสดงต้องมีเนื้อความ ไม่ใช่ป้ายเปล่า", () => {
  const feed = PAGE.slice(PAGE.indexOf("const taskRows"), PAGE.indexOf("return [...stages"));
  assert.match(feed, /body:\s*u\.body/, "ความคืบหน้าของงานต้องเอาข้อความมาด้วย");
  assert.match(feed, /href:\s*`\/sa\/tasks\//, "และต้องกดกลับไปที่งานต้นทางได้");
});
