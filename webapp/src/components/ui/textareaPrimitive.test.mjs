import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const src = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const TEXTAREA = src("./Textarea.js");
const INPUT = src("./Input.js");
const GLOBALS = src("../../app/globals.css");
const PREVIEW = src("../../app/settings/design-preview/page.js");

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/* เอกสารพิมพ์ประกอบ HTML ของตัวเองและไม่โหลด globals.css — คลาสกลางไม่มีค่าที่นั่น */
const EXEMPT = ["components/documents/", "lib/"];

test("Textarea เป็นที่เดียวที่ประกอบคลาส textarea-premium", () => {
  assert.match(TEXTAREA, /"textarea-premium"/);
  assert.match(TEXTAREA, /forwardRef/, "ต้องส่ง ref ต่อได้ ไม่งั้น focus ช่องแรกไม่ได้");
});

/* ฝั่งฟอร์มต้องส่งต่อให้ Input ไม่ใช่ประกอบ premium-input เอง — ไม่งั้นกลับไปมี
   ที่เขียนคลาสเดียวกันสองแห่งแล้วเพี้ยนจากกัน (เหตุผลเดียวกับที่ Input.js มีอยู่) */
test("variant ฟอร์มส่งต่อให้ Input ไม่ประกอบคลาสเอง", () => {
  assert.match(TEXTAREA, /<Input\s+as="textarea"/);
  assert.doesNotMatch(TEXTAREA, /"premium-input"/,
    "ห้ามเขียน premium-input ที่นี่ — Input.js เป็นที่เดียวของคลาสนั้น");
  assert.match(INPUT, /as: Component = "input"/, "Input ต้องยังรับ as= อยู่");
});

test("สองงานแยกกันด้วย variant ไม่ใช่ให้ผู้เรียกเลือกคลาสเอง", () => {
  assert.match(TEXTAREA, /variant = "form"/, "ค่าตั้งต้นต้องเป็นช่องกรอกของฟอร์ม");
  assert.match(TEXTAREA, /variant === "data"/);
  assert.match(GLOBALS, /\.textarea-premium\s*\{/, "กล่องวางข้อมูลดิบต้องมี selector จริง");
});

/* 🐛 ที่มาของ primitive นี้: มี <textarea> 3 จุดที่ไม่มีคลาสเลย → border 0,
   พื้นโปร่งใส, สีตัวอักษรตายตัวไม่ตามธีม = มองไม่ออกว่าเป็นช่องกรอก
   กฎนี้กันไม่ให้ <textarea> ดิบกลับเข้ามาอีก ไม่ว่าจะใส่คลาสหรือไม่ */
test("ไม่มี <textarea> ดิบเหลือในหน้าไหนอีก", () => {
  const offenders = [];
  for (const file of walk(srcRoot)) {
    const rel = path.relative(srcRoot, file).replaceAll("\\", "/");
    if (!/\.(js|jsx)$/.test(rel)) continue;
    if (EXEMPT.some((p) => rel.startsWith(p))) continue;
    if (rel === "components/ui/Textarea.js") continue;
    /* แทนคอมเมนต์ด้วยช่องว่างเท่าเดิม (เลขบรรทัดไม่เพี้ยน) — คอมเมนต์ที่*พูดถึง*
       <textarea> ไม่ใช่การใช้งาน เช่นโน้ตใน Input.js ที่ชี้ทางมาที่ primitive นี้ */
    const text = readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
      .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));
    let index = text.indexOf("<textarea");
    while (index !== -1) {
      offenders.push(`${rel}:${text.slice(0, index).split("\n").length}`);
      index = text.indexOf("<textarea", index + 1);
    }
  }
  assert.deepEqual(offenders, [], "ใช้ <Textarea> จาก components/ui แทน");
});

/* primitive ใหม่ต้องขึ้นหน้าต้นแบบเสมอ ไม่งั้นคนทำหน้าใหม่ไม่รู้ว่ามีให้ใช้ */
test("Textarea อยู่บนหน้าต้นแบบทั้งสอง variant", () => {
  assert.match(PREVIEW, /ui\/Textarea/, "ต้อง import มาโชว์");
  assert.match(PREVIEW, /<Textarea[\s\S]{0,200}variant="data"/,
    "ต้องโชว์กล่องวางข้อมูลดิบด้วย ไม่ใช่เฉพาะช่องกรอกฟอร์ม");
});
