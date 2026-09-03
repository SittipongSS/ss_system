import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/* ── การ์ดของ DataList เป็น <Link> ทั้งใบ ⇒ `card(row)` ของผู้เรียกห้ามมี interactive ──
   (2026-09-02 · คู่กับคอมเมนต์ "การ์ด (จอแนวตั้ง) เป็นลิงก์ทั้งใบ" ใน DataList.js)

   ⭐ ทำไมต้องเป็นเทสต์ ไม่ใช่ด่านใน audit-ui.mjs: เนื้อการ์ดมาจาก render prop `card(r)`
   ที่ **ผู้เรียกเขียน** ⇒ ตัวสแกนของ audit ซึ่งอ่าน JSX ทีละไฟล์มองไม่เห็น (ตรงกับ
   ข้อจำกัด "ตรวจไม่ได้ ข้อ 2" ที่ ROW_MIRROR ประกาศไว้เหนือ `const ROW_PRIMITIVE`)
   ⇒ ปิดรูด้วยเทสต์ที่ไล่ **จากฝั่งผู้เรียก** แทน

   🪤 กฎ HTML ที่กำลังกันไว้: `<a>` เป็น transparent content model ⇒ ครอบ `<div>` ได้
   ถูกสเปก แต่ **ห้ามมี interactive descendant** (ปุ่ม ลิงก์ ช่องกรอก) · เบราว์เซอร์จะ
   แยกเป้าไม่ออก และคีย์บอร์ดได้ tab stop ซ้อนกันสองชั้นบนของชิ้นเดียว

   🔒 รายชื่อผู้เรียก **คำนวณเอง ไม่ใช่ทะเบียนที่พิมพ์มือ** — วันที่มีผู้เรียกรายที่สาม
   มันจะถูกตรวจทันทีโดยไม่ต้องรอให้ใครมาต่อบรรทัดในลิสต์ (รูปเดียวกับ
   src/lib/sales/approvalQueueOnLists.test.mjs) */

const SRC = path.join(process.cwd(), "src");
const IMPORT_LINE = '@/components/excise/DataList';

function jsFiles(dir) {
  const out = [];
  (function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".js")) out.push(full);
    }
  })(dir);
  return out;
}

/* ตัดบล็อก `const card = …` ทั้งก้อนออกมาจากไฟล์ผู้เรียก — ตัดด้วย **ระดับการย่อหน้า**
   ไม่ใช่การนับวงเล็บ: JSX ข้างในมีวงเล็บอยู่ในสตริง/เทมเพลตได้ ตัวนับจะกินยาวเกินก้อนจริง
   แล้วเทสต์จะฟ้องปุ่มของโค้ดที่อยู่ *ถัดจาก* การ์ด (เจอจริงตอนเขียนเทสต์นี้ 2026-09-02) */
function cardBlock(source) {
  const lines = source.split(/\r?\n/);
  const start = lines.findIndex((line) => /^ {2}const card = /.test(line));
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^ {2}(?:const|let|return|function|export|\/\*|\/\/)/.test(lines[i])) { end = i; break; }
  }
  return lines.slice(start, end).join("\n");
}

function callers() {
  return jsFiles(SRC)
    .filter((file) => fs.readFileSync(file, "utf8").includes(IMPORT_LINE))
    .filter((file) => !file.endsWith(".test.mjs"))
    .map((file) => path.relative(process.cwd(), file).replaceAll("\\", "/"))
    .sort();
}

test("ผู้เรียก DataList ทุกรายที่ส่ง card ต้องไม่มี interactive อยู่ในการ์ด", () => {
  const found = callers();
  assert.ok(found.length > 0, "หาผู้เรียก DataList ไม่เจอเลย — ตัวไล่ไฟล์เพี้ยนแล้ว");

  let checked = 0;
  for (const rel of found) {
    const source = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
    const block = cardBlock(source);
    if (!block) continue; // ผู้เรียกที่ไม่ส่ง card → เดินสาขาสำรองซึ่ง **ไม่ถูกห่อ**
    checked += 1;
    for (const pattern of [/<button/, /<Link\b/, /<a\s/, /onClick=/, /<input/, /<select/, /<textarea/]) {
      assert.ok(!pattern.test(block),
        `${rel}: บล็อก \`const card\` มี ${pattern.source} อยู่ข้างใน — DataList ห่อการ์ดทั้งใบ`
        + " ด้วย <Link> ⇒ <a> จะมี interactive descendant (HTML ผิด และเบราว์เซอร์แยกเป้าไม่ออก)\n"
        + "ทางแก้: ย้ายการ์ดใบนี้ไปท่า C (ลิงก์ที่หัวการ์ด + <ClickableCard> เป็นทางลัดของเมาส์)"
        + " แทนการห่อทั้งใบ — ดูหัวไฟล์ src/components/ui/ClickableCard.js");
    }
  }
  /* 🪤 กันเทสต์กลวง: ถ้าตัวตัดบล็อกพังจนคืน null ทุกไฟล์ ลูปข้างบนจะไม่ตรวจอะไรเลย
     แล้วผ่านฉลุย ⇒ ล็อกว่ามีก้อนที่ตรวจจริงอย่างน้อยเท่าจำนวนผู้เรียกที่ส่ง card วันนี้ */
  assert.ok(checked >= 2, `ตรวจบล็อก card ได้แค่ ${checked} ก้อนจากผู้เรียก ${found.length} ราย `
    + "— ตัวตัดบล็อกอ่านรูปที่ผู้เรียกเขียนไม่ออกแล้ว (เทสต์กำลังจะกลายเป็นของกลวง)");
});

/* ⚠️ **ตรวจไม่ได้ 1 ข้อ — เขียนไว้ ห้ามเงียบ**: การ์ดเรนเดอร์ *คอมโพเนนต์* ได้
   (`<StatusBadge>` `<RegistryBadge>` `<DocsCell>`) และเทสต์ข้างบนอ่านเฉพาะแท็กที่เขียน
   อยู่ในบล็อก ⇒ วันที่ใครเติมปุ่มลงในป้ายสถานะ การ์ดจะได้ interactive descendant เงียบ ๆ
   ปิดรูเท่าที่ปิดได้: ป้ายสถานะเป็น primitive ร่วมของทั้งสองผู้เรียก จึงล็อกมันตรง ๆ ที่นี่
   (`DocsCell` เป็นตัวช่วยในไฟล์ของ tax/registrations เอง — วัดด้วยมือ 2026-09-02
   ว่าเป็น `<span title=…>` ล้วน) */
test("ป้ายสถานะที่การ์ดใช้ต้องไม่มี interactive (ไม่งั้น <a> ครอบแล้วได้ปุ่มซ้อนลิงก์)", () => {
  const badge = fs.readFileSync(path.join(SRC, "components", "ui", "StatusBadge.js"), "utf8");
  for (const pattern of [/<button/, /<Link\b/, /<a\s/, /onClick=/]) {
    assert.ok(!pattern.test(badge),
      `components/ui/StatusBadge.js มี ${pattern.source} แล้ว — การ์ดของ DataList ถูกห่อด้วย <Link> `
      + "ทั้งใบ ป้ายที่กดได้จะกลายเป็น interactive descendant ของ <a>");
  }
});

/* 🪤 สายสะดุดของสาขาสำรอง: `card ? card(r) : columns.map(...)` เรนเดอร์ **ทุกคอลัมน์**
   รวมคอลัมน์เลือกใบที่คาย `<input type="checkbox">` ⇒ ถ้าวันหน้ามีคนเผลอห่อสาขานั้นด้วย
   จะได้ <a> ที่มี <input> ข้างใน · ล็อกรูปของ DataList ไว้ว่ายังแยกสาขาอยู่ */
test("DataList ห่อเฉพาะสาขาที่มี card — สาขาสำรอง (ทุกคอลัมน์ + เช็กบ็อกซ์) ต้องไม่ถูกห่อ", () => {
  const src = fs.readFileSync(path.join(SRC, "components", "excise", "DataList.js"), "utf8");
  assert.match(src, /const linkedCard = Boolean\(rowHref && card\);/,
    "เงื่อนไขการห่อต้องขึ้นกับ **ทั้ง** rowHref และ card — ขาด card เมื่อไหร่ สาขาสำรอง"
    + " (ที่มีเช็กบ็อกซ์เลือกใบ) จะถูกห่อไปด้วย");
  assert.match(src, /const CardTag = linkedCard \? Link : "div";/);
  assert.doesNotMatch(src, /onClick=/, "การ์ดของ DataList ต้องไม่กลับไปเป็น <div onClick>");
});
