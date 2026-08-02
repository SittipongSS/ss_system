import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* แผงรายละเอียดงานแบบกางในที่ (หน้ารายการงาน)

   กติกา: **อ่านให้ครบตรงนี้ · จะแก้ค่อยกดไปต้นทาง** — หน้ารายการมีหน้าที่ให้ตรวจสอบ
   เดิมเห็นแค่ชื่องานกับโน้ตย่อ 2 บรรทัด อยากรู้ว่าใครสั่ง เริ่มเมื่อไหร่ ทำไมเสร็จช้า
   ต้องเปิดหน้างานทีละใบ กลับมาแล้วตัวกรอง/หน้าที่ค้างอยู่ก็หายไปด้วย

   ไฟล์นี้ล็อกสามอย่างที่พังง่ายและพังเงียบ */

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const PANEL = read("./TaskDetailPanel.js");
const PAGE = read("../../app/pm/tasks/page.js");

test("กางแล้วไม่ยิง API เพิ่ม — ค่าทุกช่องมาจากแถวที่โหลดมาแล้ว", () => {
  // กาง 20 แถวแล้วยิง 20 ครั้งคือสิ่งที่จะเกิดถ้าใครเผลอเติม useEffect ที่นี่
  assert.doesNotMatch(PANEL, /\bfetch\s*\(/, "แผงต้องไม่เรียก fetch");
  assert.doesNotMatch(PANEL, /useEffect|useSWR|cachedFetchJson/, "แผงต้องไม่โหลดข้อมูลเอง");
});

test("แผงอ่านอย่างเดียว — การแก้ไขเกิดที่ต้นทางเสมอ", () => {
  assert.doesNotMatch(PANEL, /<(input|textarea|select|Input|Textarea|Select)\b/,
    "มีช่องกรอกในแผง = กลายเป็นฟอร์มแก้ชุดที่สอง ซึ่งจะเพี้ยนจากฟอร์มจริงเสมอ");
  assert.doesNotMatch(PANEL, /onEdit|onDelete|onSave|method:\s*['"]PATCH/,
    "แผงต้องไม่มีการกระทำที่เขียนข้อมูล");
  // ทางกลับไปต้นทางคือเหตุผลที่แผงนี้อ่านอย่างเดียวได้
  assert.match(PANEL, /เปิดหน้างาน/, "ต้องมีทางกดไปหน้างานจริง");
});

test("แถวรายละเอียดในตารางกินความกว้างเท่าจำนวนคอลัมน์จริง", () => {
  const thead = PAGE.slice(PAGE.indexOf("<thead>"), PAGE.indexOf("</thead>"));
  const headers = thead.match(/<th\b/g)?.length ?? 0;
  /* ⚠️ "บทบาทของฉัน" กับ "ผู้รับมอบหมาย" สลับกันตามสโคป ไม่ได้บวกกัน — ในไฟล์มี
     <th> ทั้งคู่ ความกว้างจริงจึงเป็น headers - 1 · ผิดแล้วแถวที่กางจะกินเกิน/ขาด
     ตารางแบบที่เทสต์เดิมจับไม่ได้เพราะ HTML ไม่ error */
  const colSpan = Number(PAGE.match(/colSpan=\{(\d+)\}/)?.[1]);
  assert.equal(colSpan, headers - 1,
    `colSpan (${colSpan}) ต้องเท่ากับจำนวนคอลัมน์ที่แสดงจริง (${headers - 1})`);
});

test("กางแล้วโน้ตไม่ซ้ำสองที่", () => {
  // บรรทัดย่อในแถว + โน้ตเต็มในแผง = ข้อความเดียวกันสองรอบติดกัน
  const shortNotes = PAGE.match(/t\.note && [^\n]*ReadableText/g) ?? [];
  assert.ok(shortNotes.length >= 2, "ควรมีบรรทัดย่อทั้งในตารางและการ์ด");
  for (const line of shortNotes) {
    assert.match(line, /!expandedIds\.has\(t\.id\)/,
      "บรรทัดย่อต้องซ่อนเมื่อแผงกางอยู่");
  }
});
