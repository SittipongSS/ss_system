import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/* ── supabase ไม่ throw — try/catch ที่ล้อมมันไว้จึงดักไม่ได้ (2026-09-09) ────
   `await supabase.from(...).insert(...)` **ไม่โยน exception** มันคืน
   `{ data, error }` ⇒ `try { … } catch { log }` ที่เขียนล้อมไว้ **ไม่เคยทำงาน**
   ⇒ ความล้มเหลวหายเงียบสนิท ไม่มีแม้แต่บรรทัด log ที่ผู้เขียนตั้งใจให้มี

   🐞 ของจริงที่เจอ (ไล่จากลายเดียวกับ #1687):

   ① `lib/audit.js` — หัวไฟล์เขียนกฎไว้เองว่า
        "audit ต้องไม่มีวันทำให้ action ของผู้ใช้พัง — insert ห่อ try/catch เสมอ
         action สำเร็จไปแล้วก่อนถึงตรงนี้; log พลาดก็แค่ log.error ทิ้ง"
      แต่ `console.error('[audit] record failed', …)` **ไม่เคยพิมพ์สักครั้ง**
      ⚠️ แพงที่สุดในชุดนี้: `audit_logs.before` คือ **ทางเดียว** ที่กู้ข้อมูลที่ถูกลบได้
      (ระบบไม่มีถังขยะ) ⇒ audit ที่เขียนไม่ลง = ของที่ลบไปแล้วกู้ไม่ได้ตลอดกาล

   ② `lib/master/priceHistory.js` — ทรงเดียวกัน ประวัติราคาหายเงียบ

   ③ `api/mgmt/trash` — อ่านรายการที่ soft-delete ไว้ · อ่านไม่ได้แล้วคืน []
      = "ถังขยะว่าง" ซึ่งแปลว่าไม่มีอะไรให้กู้ ทั้งที่ของอยู่ครบ

   ④ `api/sales-planning/my-dashboard` — 7 query ใน Promise.all เดียว ก้อนไหนพัง
      ก็กลายเป็น [] ⇒ แดชบอร์ดขึ้น "ไม่มีดีล/ไม่มีลีด/ไม่มีงาน" ทั้งที่ของอยู่ครบ
      (ไฟล์นั้นมีคอมเมนต์บันทึกโรคเดียวกันไว้แล้ว: `.single()` เคยทำให้จอขึ้น
       "ยังไม่ตั้งเป้า" ทั้งที่ตั้งไว้)

   ⚠️ ด่านนี้ล็อก **จุดที่ตาข่ายต้องทำงานจริง** ไม่ใช่เพดานที่โตตามงาน — ไล่นับ
   `const { data }` ทั้งรีโปแล้วตั้งเพดานคือการนับของที่ส่วนใหญ่ไม่ผิด */

const WEBAPP = process.cwd();
const read = (p) => fs.readFileSync(path.join(WEBAPP, p), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/* ตาข่ายสองตัวที่ "ห้ามพังเงียบ" — ทั้งคู่จงใจกลืน error ไว้ไม่ให้ล้มงานผู้ใช้
   แต่ต้อง **ได้ log** · ถ้าไม่รับ error มาเอง catch จะไม่มีวันทำงาน */
for (const [file, table] of [
  ["src/lib/audit.js", "audit_logs"],
  ["src/lib/master/priceHistory.js", "product_price_history"],
]) {
  test(`${path.basename(file)} — insert ต้องรับ error มาเอง ไม่งั้น catch ที่เขียนไว้ตายสนิท`, () => {
    const source = read(file);
    const insert = new RegExp(`const \\{ error \\} = await supabase\\.from\\('${table}'\\)\\.insert\\(`);
    assert.match(source, insert, `ต้องอ่าน error จาก insert ของ ${table}`);
    assert.match(source, /if \(error\) throw error;/,
      "ต้องโยนเข้า catch เดิม — catch นั้นคือที่ที่ log ถูกเขียนไว้แล้ว");
    assert.match(source, /catch[\s\S]{0,120}console\.error/,
      "catch ต้องยัง log อยู่ · เจตนาคือ 'ไม่ล้มงานผู้ใช้ แต่ต้องรู้ว่าพลาด'");
  });
}

test("ถังขยะ mgmt ต้องไม่กลายเป็น 'ว่าง' เพราะ query พัง", () => {
  const source = read("src/app/api/mgmt/trash/route.js");
  assert.match(source, /if \(res\.error\) throw res\.error/,
    "อ่านไม่ได้ต้องเป็น error ไม่ใช่ถังขยะว่าง — หน้านี้คือทางกู้ทางเดียวของ mgmt");
});

test("แดชบอร์ดส่วนตัวต้องเช็ค error ทุกก้อนใน Promise.all", () => {
  const source = read("src/app/api/sales-planning/my-dashboard/route.js");
  const guard = source.match(/for \(const res of \[([^\]]*)\]\)[\s\S]{0,80}res\?\.error/);
  assert.ok(guard, "ต้องมีลูปเช็ค error ของทุกผลลัพธ์");
  /* ทุกตัวที่ถูกอ่าน `.data` ต้องอยู่ในลูปตรวจ — เพิ่ม query ใหม่แล้วลืมใส่
     = ก้อนนั้นกลับไปพังเงียบคนเดียว */
  const checked = new Set(guard[1].split(",").map((s) => s.trim()));
  const readVars = new Set([...source.matchAll(/(\w+)\.data\s*(?:\|\||\?\?)/g)].map((m) => m[1]));
  const missing = [...readVars].filter((v) => !checked.has(v));
  assert.deepEqual(missing, [], `ผลลัพธ์เหล่านี้ถูกอ่าน .data แต่ไม่ได้เช็ค error: ${missing}`);
});
