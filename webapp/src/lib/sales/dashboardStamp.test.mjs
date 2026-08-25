import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { combineStamps, loadDashboardStamp, tableStamp } from "./dashboardStamp.js";
import { bumpStamp, cachedJson, invalidateCache, resetStamps } from "../serverCache.js";

/* ── แดชบอร์ดขาย: สดทันทีที่ข้อมูลเปลี่ยน โดยไม่ทิ้ง cache ────────────────
 * อาการเดิม: ปิดดีล Won เสร็จ กด F5 กี่รอบก็ยังเห็นเลขเก่า เพราะ cache อยู่ฝั่ง server
 * และไม่มีใครล้างเลย — ต้องรอครบ 5 นาทีเอง
 */

test("สแตมป์ต้องขยับเมื่อมีการแก้ และเมื่อจำนวนแถวเปลี่ยน", () => {
  const a = tableStamp("2026-08-25T10:00:00Z", 333);
  assert.notEqual(a, tableStamp("2026-08-25T10:00:01Z", 333), "แก้ดีล = สแตมป์ต้องเปลี่ยน");
  /* 🪤 `updatedAt` **ไม่ขยับตอนลบ** — ถ้าสแตมป์มีแต่เวลา ลบดีลทิ้งแล้วแดชบอร์ดจะยัง
     นับดีลที่ไม่มีอยู่แล้วต่อไปจนครบ TTL ⇒ ต้องมีจำนวนแถวอยู่ในสแตมป์ด้วย */
  assert.notEqual(a, tableStamp("2026-08-25T10:00:00Z", 332), "ลบดีล = สแตมป์ต้องเปลี่ยน");
});

test("ตารางว่าง/อ่านค่าไม่ได้ ต้องได้สแตมป์ที่ยังเทียบกันได้ ไม่ใช่ระเบิด", () => {
  assert.equal(typeof tableStamp(undefined, 0), "string");
  assert.notEqual(tableStamp(undefined, 0), tableStamp(undefined, 1));
});

test("รวมสแตมป์หลายตาราง — เป้าเปลี่ยนอย่างเดียวก็ต้องนับว่าเปลี่ยน", () => {
  const deals = tableStamp("2026-08-25T10:00:00Z", 333);
  const before = combineStamps([deals, tableStamp("2026-08-17T00:00:00Z", 40)]);
  const after = combineStamps([deals, tableStamp("2026-08-25T11:00:00Z", 41)]);
  assert.notEqual(before, after);
});

test("bumpStamp: สแตมป์เปลี่ยน = cache ถูกล้าง · เท่าเดิม = ไม่แตะ", async () => {
  resetStamps();
  invalidateCache("test-dash");
  let built = 0;
  const build = () => { built += 1; return { n: built }; };

  await cachedJson("test-dash:2026-08", 60_000, build);
  await cachedJson("test-dash:2026-08", 60_000, build);
  assert.equal(built, 1, "TTL ยังไม่หมด = ไม่คิดใหม่");

  assert.equal(bumpStamp("test-dash", "s1"), true, "สแตมป์แรกนับว่าเปลี่ยน");
  await cachedJson("test-dash:2026-08", 60_000, build);
  assert.equal(built, 2, "สแตมป์เปลี่ยน = ต้องคิดใหม่ทันที ไม่ต้องรอ TTL");

  assert.equal(bumpStamp("test-dash", "s1"), false, "สแตมป์เดิมต้องไม่ล้างซ้ำ");
  await cachedJson("test-dash:2026-08", 60_000, build);
  assert.equal(built, 2, "ไม่มีอะไรเปลี่ยน = ห้ามคิดใหม่ (นี่คือของที่ TTL ซื้อมา)");
});

/* ⚠️ อ่านสแตมป์ไม่ได้ต้องไม่ทำให้แดชบอร์ดพัง — ถอยไปใช้ TTL เฉย ๆ */
test("อ่านสแตมป์ไม่ได้ = คืน null แล้วระบบถอยไปใช้ TTL", async () => {
  const broken = {
    from: () => ({
      select: () => ({ order: () => ({ limit: async () => ({ error: new Error("boom") }) }) }),
    }),
  };
  assert.equal(await loadDashboardStamp(broken), null);
  resetStamps();
  assert.equal(bumpStamp("test-dash", null), false, "null ต้องไม่ล้าง cache ทิ้งเปล่า ๆ");
});

test("สแตมป์อ่านจาก deals และ targets ครบทั้งสองตาราง", async () => {
  const seen = [];
  const fake = {
    from: (table) => {
      seen.push(table);
      return {
        select: () => ({
          order: () => ({
            limit: async () => ({ data: [{ updatedAt: `${table}-time` }], count: 7, error: null }),
          }),
        }),
      };
    },
  };
  const stamp = await loadDashboardStamp(fake);
  assert.deepEqual(seen.sort(), ["sales_deals", "sales_targets"]);
  assert.match(stamp, /sales_deals-time#7/);
  assert.match(stamp, /sales_targets-time#7/);
});

/* TTL คือสิ่งที่ซื้อโควตา CPU กลับมา (endpoint นี้เคยกิน Active CPU อันดับ 1 ของระบบ)
   — สแตมป์เพิ่มความสด ไม่ใช่ข้ออ้างให้ถอด TTL ทิ้ง */
test("TTL 5 นาทีต้องยังอยู่ และ route ต้องเรียกสแตมป์ก่อนตอบ", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const route = readFileSync(join(here, "..", "..", "app", "api", "sales-planning", "dashboard", "route.js"), "utf8");
  assert.match(route, /DASHBOARD_TTL_MS = 5 \* 60 \* 1000/, "ห้ามถอด TTL");
  assert.match(route, /bumpStamp\(DASHBOARD_CACHE_PREFIX, await loadDashboardStamp\(supabase\)\)/);
  const stampAt = route.indexOf("bumpStamp(");
  const cacheAt = route.indexOf("cachedJson(");
  assert.ok(stampAt > 0 && stampAt < cacheAt, "ต้องถามสแตมป์ก่อนหยิบของจาก cache");
});
