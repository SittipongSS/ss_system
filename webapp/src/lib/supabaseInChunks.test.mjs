import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fetchInChunks, fetchAllInChunks, byColumns, IN_CHUNK_SIZE } from "./supabaseInChunks.js";
import { guardedFetch, POSTGREST_URL_LIMIT } from "./supabaseAdmin.js";

/* ── ลิสต์ id ที่ยาวเกินทำให้ PostgREST ต่อไม่ติด (2026-09-07) ─────────────────
   🐞 `/api/products` ตอบ 500 `TypeError: fetch failed` หลังรอ 7.7 วินาที
   ⇒ ทะเบียนสินค้าโชว์ "ยังไม่มีสินค้าในระบบ" และ dropdown เลือกสินค้าทุกจอว่าง
   **โดยไม่มี error ให้ผู้ใช้เห็น**

   ต้นเหตุ: route ดึงสินค้าครบ 435 แถว แล้วยิงต่อด้วย
   `.in('productId', rows.map(p => p.id))` · PostgREST รับตัวกรองทาง query string
   ของ GET ⇒ id 40 ตัวอักษร × 435 = ตัวกรอง ~17,800 ไบต์ · Node/undici ตัดที่
   16 KB ต่อบล็อกเฮดเดอร์ทั้งก้อน (นับ request line + apikey + Authorization JWT)

   วัดจริงกับทะเบียนชุดปัจจุบัน:
     300 ids | ตัวกรอง 12,314 ไบต์ |   108ms | ✓
     370 ids | ตัวกรอง 15,184 ไบต์ | 7,688ms | ✗ TypeError: fetch failed
   หลังแก้: /api/products ตอบ 200 · 434 แถว · 1.1 วินาที · registrationStatus
   ยังติดมาครบ (approved 17 · none 417)

   ⚠️ พังเมื่อ **ข้อมูลโตข้ามเส้น** ไม่ใช่ตอนดีพลอย ⇒ โค้ดที่ผ่านมาตลอดพังเองได้
   ตารางที่เกินเส้นแล้ววันนี้: notifications 6,193 · project_tasks 5,725 ·
   personal_tasks 1,320 · customers 523 · products 435 · sales_deals 420 */

const WEBAPP = process.cwd();

test("แบ่งก้อนแล้วยิงครบทุกก้อน ไม่ตกหล่น", async () => {
  const ids = Array.from({ length: 435 }, (_, i) => `PRD-${String(i).padStart(4, "0")}`);
  const seen = [];
  const { data, error } = await fetchInChunks(ids, (chunk) => {
    seen.push(chunk.length);
    return Promise.resolve({ data: chunk.map((id) => ({ id })), error: null });
  });
  assert.equal(error, null);
  assert.equal(data.length, 435, "ต้องได้ครบทุกแถว");
  assert.deepEqual(data.map((r) => r.id), ids, "ลำดับต้องเหมือนเดิม");
  assert.ok(seen.every((n) => n <= IN_CHUNK_SIZE), `ก้อนต้องไม่เกิน ${IN_CHUNK_SIZE} — ได้ ${seen}`);
  assert.equal(seen.reduce((a, b) => a + b, 0), 435);
});

test("ลิสต์ว่างต้องไม่ยิงเลย — .in([]) ของ PostgREST คืนศูนย์แถวอยู่แล้ว แต่เสียรอบ", async () => {
  let calls = 0;
  const { data, error } = await fetchInChunks([], () => { calls += 1; return Promise.resolve({ data: [], error: null }); });
  assert.equal(calls, 0);
  assert.deepEqual(data, []);
  assert.equal(error, null);
});

test("ตัดค่าซ้ำและค่าว่างก่อนยิง", async () => {
  const seen = [];
  await fetchInChunks(["a", "a", null, "b", undefined], (chunk) => {
    seen.push(...chunk);
    return Promise.resolve({ data: [], error: null });
  });
  assert.deepEqual(seen, ["a", "b"]);
});

test("เจอ error ก้อนไหนต้องหยุดทันที ไม่ยิงก้อนที่เหลือ", async () => {
  const ids = Array.from({ length: 400 }, (_, i) => `id-${i}`);
  let calls = 0;
  const { data, error } = await fetchInChunks(ids, () => {
    calls += 1;
    return Promise.resolve(calls === 2 ? { data: null, error: new Error("boom") } : { data: [], error: null });
  });
  assert.equal(data, null);
  assert.equal(error.message, "boom");
  assert.equal(calls, 2, "ต้องหยุดที่ก้อนที่พัง ไม่ยิงต่อ");
});

/* ── ยามชั้นสอง: จับที่ตัวส่งคำขอ ────────────────────────────────────────────
   ระบบมี `.in()` 182 จุดที่ป้อนลิสต์จาก `.map()` — ไล่แก้ทีละจุดไม่จบและจุดที่ยัง
   ไม่ถึงเส้นวันนี้จะถึงเองพรุ่งนี้ · ยามนี้เปลี่ยน "พังเงียบหลัง 8 วินาที" เป็น error
   ที่บอกตารางกับความยาว ที่จุดเดียวคุมทั้งระบบ */
test("URL ยาวเกินต้องโยน error ที่อ่านออก ไม่ปล่อยให้ซ็อกเก็ตถูกตัด", async () => {
  const long = "https://x.supabase.co/rest/v1/excise_registrations?select=id&productId=in.("
    + "PRD-0000000000000000000000000000000000,".repeat(500) + ")";
  assert.ok(long.length > POSTGREST_URL_LIMIT);
  await assert.rejects(() => guardedFetch(long), (err) => {
    assert.match(err.message, /excise_registrations/, "ต้องบอกว่าตารางไหน");
    assert.match(err.message, /productId/, "ต้องบอกว่าตัวกรองไหน");
    assert.match(err.message, /fetchInChunks/, "ต้องบอกทางแก้");
    assert.doesNotMatch(err.message, /^TypeError: fetch failed$/, "ห้ามปล่อยข้อความดิบที่ชี้ผิดทาง");
    return true;
  });
});

test("เพดานต้องต่ำกว่า 16 KB ที่ undici ตัดจริง — เผื่อเฮดเดอร์ apikey/JWT", () => {
  assert.ok(POSTGREST_URL_LIMIT < 16384, "16384 คือเพดานของบล็อกเฮดเดอร์ทั้งก้อน ไม่ใช่ของ URL อย่างเดียว");
  assert.ok(POSTGREST_URL_LIMIT >= 8000, "ต่ำเกินไปจะไปตัด query ปกติที่ยาวโดยธรรมชาติ");
});

/* ── สัญญาข้ามไฟล์: client กลางต้องเสียบยามไว้จริง ────────────────────────── */
test("getSupabaseAdmin ต้องเสียบ guardedFetch ไว้", () => {
  const source = fs.readFileSync(path.join(WEBAPP, "src", "lib", "supabaseAdmin.js"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(source, /global:\s*\{\s*fetch:\s*guardedFetch\s*\}/,
    "ถอดออกเมื่อไร กลับไปพังเงียบทันที");
});

test("/api/products ต้องยิงทะเบียนสรรพสามิตทีละก้อน", () => {
  const source = fs.readFileSync(path.join(WEBAPP, "src", "app", "api", "products", "route.js"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(source, /fetchInChunks\(/, "จุดนี้คือจุดที่พังจริง — ห้ามกลับไปใช้ .in() ตรง ๆ");
  assert.doesNotMatch(source, /\.in\('productId',\s*rows\.map/,
    "ลิสต์ทั้งทะเบียนยาวเกิน 16 KB แล้ว");
});

/* ── fetchAllInChunks — ซอยข้างนอก ไล่หน้าข้างใน ───────────────────────────
   🪤 `fetchAll` **ไม่ได้ช่วยเรื่อง URL ยาว** — มันไล่ `.range()` ทีละหน้าโดยส่ง
   ตัวกรองก้อนเดิมไปทุกหน้า ⇒ ลิสต์ยาวเกินก็ยาวเกินทุกหน้า · สองอย่างนี้แก้คนละ
   ปัญหาและต้องซ้อนกันตามลำดับนี้เท่านั้น */

/** query ปลอมที่ทำตัวเหมือน PostgREST: ตัดที่ 1,000 แถวต่อหน้า + เรียงต่อก้อน */
function fakeTable(rowsByKey, pageSize = 1000) {
  const calls = [];
  return {
    calls,
    query(chunk, order) {
      const rows = chunk.flatMap((k) => rowsByKey[k] || []);
      if (order) rows.sort(order);
      calls.push({ size: chunk.length, rows: rows.length });
      return {
        range(from, to) {
          return Promise.resolve({ data: rows.slice(from, Math.min(to + 1, from + pageSize)), error: null });
        },
      };
    },
  };
}

test("ซอยข้างนอก ไล่หน้าข้างใน — ได้ครบทั้งที่เกินทั้งสองเพดาน", async () => {
  /* 400 คีย์ × 6 แถว = 2,400 แถว ⇒ เกินเพดานแถว 1,000 **และ** ลิสต์ยาวเกิน URL */
  const rowsByKey = {};
  const keys = Array.from({ length: 400 }, (_, i) => `SVS-${String(i).padStart(4, "0")}`);
  for (const k of keys) rowsByKey[k] = Array.from({ length: 6 }, (_, j) => ({ siteId: k, id: `${k}-${j}` }));
  const t = fakeTable(rowsByKey);
  const rows = await fetchAllInChunks(keys, (chunk) => t.query(chunk));
  assert.equal(rows.length, 2400, "ต้องได้ครบ ไม่โดนตัดที่ 1,000");
  assert.ok(t.calls.every((c) => c.size <= IN_CHUNK_SIZE), `ก้อนต้องไม่เกิน ${IN_CHUNK_SIZE}`);
  assert.equal(new Set(rows.map((r) => r.id)).size, 2400, "ห้ามมีแถวซ้ำจากการไล่หน้า");
});

test("ลิสต์ว่างต้องไม่ยิงเลย", async () => {
  let calls = 0;
  const rows = await fetchAllInChunks([], () => { calls += 1; return { range: () => Promise.resolve({ data: [], error: null }) }; });
  assert.deepEqual(rows, []);
  assert.equal(calls, 0);
});

test("เรียงซ้ำหลังรวมก้อน — PostgREST เรียงต่อก้อน ไม่ได้เรียงทั้งชุด", async () => {
  /* ก้อนแรกได้ชื่อ z, ก้อนสองได้ชื่อ a ⇒ ถ้าไม่เรียงซ้ำจะได้ z ก่อน a */
  const rowsByKey = {};
  const keys = Array.from({ length: 300 }, (_, i) => `k${String(i).padStart(3, "0")}`);
  keys.forEach((k, i) => { rowsByKey[k] = [{ siteId: k, name: i < 150 ? "z" : "a", id: k }]; });
  const t = fakeTable(rowsByKey);
  const unsorted = await fetchAllInChunks(keys, (chunk) => t.query(chunk));
  assert.equal(unsorted[0].name, "z", "ยืนยันว่าถ้าไม่เรียงซ้ำ ลำดับข้ามก้อนเพี้ยนจริง");
  const sorted = await fetchAllInChunks(keys, (chunk) => t.query(chunk), { sort: byColumns("name", "id") });
  assert.equal(sorted[0].name, "a", "เรียงซ้ำแล้วต้องได้ a ขึ้นก่อน");
  assert.deepEqual(sorted.map((r) => r.name), [...sorted.map((r) => r.name)].sort());
});

test("byColumns — เรียงหลายชั้น ทิศทางได้ และค่าว่างไปท้ายเสมอ", () => {
  const rows = [
    { a: 2, b: "x" }, { a: 1, b: "y" }, { a: 1, b: "x" }, { a: null, b: "z" },
  ];
  assert.deepEqual([...rows].sort(byColumns("a", "b")).map((r) => `${r.a}${r.b}`),
    ["1x", "1y", "2x", "nullz"]);
  assert.deepEqual([...rows].sort(byColumns(["a", "desc"])).map((r) => r.a),
    [2, 1, 1, null], "ค่าว่างไปท้ายแม้เรียงลง (ตาม NULLS LAST ของ PostgREST)");
});

/* ── สัญญาข้ามไฟล์: โมดูลบริการต้องไม่กลับไปยิงก้อนเดียว ─────────────────── */
test("โมดูลบริการต้องซอยลิสต์ทุกจุดที่ .in() รับลิสต์ที่โตได้", () => {
  const files = [
    "src/app/api/service/customers/[customerId]/zones/route.js",
    "src/lib/service/sitesRepo.js",
    "src/lib/service/visitsRepo.js",
    "src/app/api/service/intake/route.js",
  ];
  const offenders = [];
  for (const file of files) {
    const source = fs.readFileSync(path.join(WEBAPP, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const hit of source.matchAll(/\.in\(\s*[^,]+,\s*([^)]*)\)/g)) {
      const arg = hit[1].trim();
      /* ลิสต์คงที่ในโค้ด (สถานะ/ชนิด) กับตัวแปร `chunk` คือของที่ถูกแล้ว */
      if (arg === "chunk" || arg.startsWith("[") || /^[A-Z_]+$/.test(arg)) continue;
      offenders.push(`${file} → .in(…, ${arg})`);
    }
  }
  assert.deepEqual(offenders, [],
    "โมดูลบริการรับข้อมูลเก่าเข้ามาทีเดียว (F-8) ⇒ ลิสต์กระโดดเต็มขนาดในก้าวเดียว\n"
    + "ต้องยิงผ่าน fetchAllInChunks เสมอ\n" + offenders.join("\n"));
});
