import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/* ── มุมของตารางตรึงสองแกน (2026-09-12) ──────────────────────────────────────
   ตาราง `family="matrix"` ตรึงสองแกนพร้อมกัน: หัวตาราง (thead) ตรึงบน · คอลัมน์แรก
   ตรึงซ้าย · บางใบตรึงแถวรวมไว้ล่าง ⇒ **เซลล์มุม** (เซลล์แรกของ thead/tfoot) ต้อง
   ลอยเหนือทั้งสองแกนเสมอ

   🐞 ผู้ใช้ส่งภาพหน้าแท็บผลงานขาย (2026-09-12): เลื่อนตารางลง แล้ว "ชื่อพนักงาน +
   ทีม" ของแถวที่ผ่านหัวตารางไปแล้ว **ลอยทับช่องหัว "พนักงาน / ทีม"** (หัวตาราง
   กลายเป็นคำว่า "KA") · ต้นเหตุอยู่ที่ Table.module.css:
     `.scroll[data-family] thead th        { z-index: 5 }`   (บรรทัดก่อน)
     `.scroll[data-family="matrix"] th:first-child { z-index: 2 }` (บรรทัดหลัง)
   specificity เท่ากัน (0,2,1) ⇒ ตัวหลังชนะ ⇒ เซลล์มุมเหลือ 2 เท่าคอลัมน์แรกของ body
   ⇒ เสมอกันแล้วตัดสินด้วยลำดับ DOM: แถวใน tbody มาทีหลัง จึงทับหัวตาราง

   🐞 อาการที่สองในภาพเดียวกัน: ป้าย "รวมทั้งบริษัท" ลอยติดขอบล่างของกล่อง ห่างจาก
   ตัวเลขของแถวตัวเอง (วัดในกล่องทดลองที่โหลด CSS จริง: ห่างได้ถึง 155px) — เซลล์นั้น
   มีทั้ง `fz-c1` และ `fz-foot` · กฎของตารางผลงานปิด `position` ของ `.fz-foot` เป็น
   static เพื่อ **ไม่** ตรึงแนวตั้ง แต่กฎถัดมาเปิด sticky กลับเพื่อตรึงแนวนอน ⇒
   `bottom: 0` ที่ประกาศไว้กับ `.fz-foot` กลับมามีผล ⇒ ป้ายตรึงล่างคนเดียวทั้งแถว

   ⚠️ ทั้งสองจุดเป็นความผิดแบบ "ทับกันเองข้ามกฎ" — ตัวเลขทุกตัวถูกต้องทีละบรรทัด
   ด่านนี้จึงอ่าน **ลำดับและค่าที่ชนกัน** ไม่ใช่แค่ว่ามีคลาสอยู่ */

const WEBAPP = process.cwd();
const read = (p) => fs.readFileSync(path.join(WEBAPP, p), "utf8");

test("มุมของ matrix ต้องถูกยกเหนือคอลัมน์แรก และกฎต้องอยู่หลังกฎ first-child", () => {
  const css = read("src/components/ui/Table.module.css");
  const firstChild = css.indexOf('.scroll[data-family="matrix"] :global(th:first-child)');
  const corner = css.indexOf('.scroll[data-family="matrix"] :global(thead th:first-child)');
  assert.ok(firstChild > -1, "หา กฎคอลัมน์แรกของ matrix ไม่เจอ");
  assert.ok(corner > -1, "ต้องมีกฎยก z-index ของเซลล์มุม (thead/tfoot first-child)");
  assert.ok(corner > firstChild,
    "กฎมุมต้องอยู่ **หลัง** กฎ first-child — specificity เท่ากัน ผู้มาทีหลังชนะ");

  const zOf = (from) => Number((css.slice(from, from + 400).match(/z-index:\s*(\d+)/) || [])[1]);
  const columnZ = zOf(firstChild);
  const cornerZ = zOf(corner);
  assert.ok(cornerZ > columnZ, `มุม (${cornerZ}) ต้องสูงกว่าคอลัมน์แรก (${columnZ})`);
  const headerZ = Number((css.match(/\.scroll\[data-family\] :global\(thead th\)[\s\S]{0,160}?z-index:\s*(\d+)/) || [])[1]);
  assert.ok(cornerZ >= headerZ, `มุม (${cornerZ}) ต้องไม่ต่ำกว่าหัวตาราง (${headerZ})`);
  assert.match(css.slice(corner, corner + 400), /tfoot td:first-child/,
    "แถวรวมที่ตรึงล่างก็ต้องได้มุมเดียวกัน ไม่งั้นคอลัมน์แรกทับแถวรวม");
});

test("ตารางผลงานขาย: เซลล์แรกของแถวรวมต้องไม่ตรึงแนวตั้ง", () => {
  const css = read("src/app/globals.css");
  const block = css.match(/\.performance-tracking-table \.fz-table tfoot td\.fz-c1 \{[\s\S]*?\}/);
  assert.ok(block, "หา กฎเซลล์แรกของแถวรวม (ตารางผลงาน) ไม่เจอ");
  assert.match(block[0], /position:\s*sticky/, "ยังต้องตรึงแนวนอนอยู่");
  assert.match(block[0], /bottom:\s*auto/,
    "ต้องล้าง `bottom` ที่ตกค้างจากกฎ .fz-foot ไม่งั้นป้ายแถวรวมลอยติดขอบล่างคนเดียว");
  // ตัวตั้งต้นที่ทำให้ต้องล้าง — ถ้าวันหนึ่งมันหายไป ด่านนี้จะได้ไม่บังคับโค้ดที่ไม่จำเป็น
  assert.match(css, /\.fz-table tfoot td\.fz-foot \{[\s\S]*?bottom:\s*0/,
    "กฎกลางยังตั้ง bottom: 0 ให้ .fz-foot — นี่คือเหตุผลที่ต้องล้างข้างบน");
});
