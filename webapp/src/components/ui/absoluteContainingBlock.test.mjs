import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/* ── กล่อง position:absolute ต้องมีบล็อกอ้างอิงในบ้านตัวเอง (2026-09-07) ──────
   🐞 ที่มา: ผู้ใช้ทักว่า "ทำไมคำร้อง ใต้ ตาราง เหลือพื้นที่เยอะจัง"

   วัดจริง (/requests · vp 1440×900 · 25 แถว):
     เนื้อหาจริงจบที่           1542px
     แต่หน้าเลื่อนลงได้ถึง       2709px
     ⇒ ช่องว่างเปล่า            1167px

   ตัวการคือป้าย screen-reader ของ StepTrack:
     `.compact .label { position: absolute; width: 1px; height: 1px; … }`
   `.step` ที่ครอบมันเป็น `position: static` ⇒ บล็อกอ้างอิงของป้ายคือกรอบหน้าจอ
   ไม่ใช่หมุด · กล่อง absolute **ไม่ถูกตัดด้วย overflow ของบรรพบุรุษที่ไม่ใช่
   บล็อกอ้างอิงของมัน** ⇒ ป้ายของแถวล่าง ๆ (ตารางสูง 2106px ยัดในกล่อง 770px)
   ไปวางที่ y=2708 นอกกล่องตาราง แล้วดัน `documentElement.scrollHeight` ตามไป
   หน้ามีป้ายแบบนี้ 90 อัน (25 แถว × ราง 4 ขั้น) ยิ่งแบ่งหน้าใหญ่ยิ่งว่างมาก

   🪤 ทำไมด่านที่มีอยู่มองไม่เห็น: `position: absolute` กับ `width: 1px` ถูกต้อง
   ทีละตัว และไฟล์ที่ผิดกับไฟล์ที่เจ็บอยู่คนละที่ (StepTrack ทำ · Table รับกรรม)
   ไม่มีด่านไหนอ่านความสัมพันธ์ข้ามไฟล์ ⇒ ผูกเป็นกฎโครงสร้างของ CSS ตรง ๆ */

const WEBAPP = process.cwd();
const CSS_ROOT = path.join(WEBAPP, "src");

function cssFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) cssFiles(full, out);
    else if (entry.name.endsWith(".css")) out.push(full);
  }
  return out;
}

const withoutComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "");

const ABSOLUTE = /position\s*:\s*absolute/;
const POSITIONED_ANCESTOR = /position\s*:\s*(?:relative|sticky|fixed)/;

/* แตกเป็น { selector, body } ทีละกฎ — @media ข้างในยังเป็นกฎแบน ๆ เหมือนกัน */
function rules(source) {
  const out = [];
  for (const hit of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = hit[1].trim().replace(/\s+/g, " ");
    if (!selector || selector.startsWith("@")) continue;
    out.push({ selector, body: hit[2] });
  }
  return out;
}

/* ── ยามหลัก — hard zero ไม่มีเพดานให้ไต่ ─────────────────────────────────
   ไฟล์ไหนวางของแบบ absolute ต้องประกาศบล็อกอ้างอิงไว้ในไฟล์เดียวกัน
   ไม่ใช่หวังว่าจะมีใครสักคนใน globals.css ตั้ง relative ให้ */
test("ทุกไฟล์ CSS ที่มี position:absolute ต้องประกาศบล็อกอ้างอิงในไฟล์เดียวกัน", () => {
  const offenders = [];
  for (const file of cssFiles(CSS_ROOT)) {
    const source = withoutComments(fs.readFileSync(file, "utf8"));
    if (!ABSOLUTE.test(source)) continue;
    if (POSITIONED_ANCESTOR.test(source)) continue;
    offenders.push(path.relative(WEBAPP, file));
  }
  assert.deepEqual(
    offenders,
    [],
    `ไฟล์นี้วางของแบบ absolute โดยไม่มี position: relative/sticky/fixed อยู่เลย\n` +
      `⇒ ของจะไปอิงกรอบหน้าจอ แล้วหลุดกรอบตัดของกล่องที่ห่ออยู่ ดันหน้าให้ยาวเกินจริง\n` +
      offenders.map((f) => `  · ${f}`).join("\n"),
  );
});

/* ── ยามเฉพาะจุด — สามที่ที่เคยหลุดจริง ต้องไม่ถูกถอด relative ออกภายหลัง ──
   ยามข้างบนอ่านได้แค่ระดับไฟล์ บอกไม่ได้ว่า relative ไปอยู่บน selector ที่ถูกตัว
   สามอันนี้จึงผูกชื่อ selector ตรง ๆ */
const CONTAINED = [
  { file: "src/components/ui/StepTrack.module.css", selector: ".step", child: ".compact .label" },
  { file: "src/components/ui/Pager.module.css", selector: ".navigation", child: ".srOnly" },
  { file: "src/app/service/import/page.module.css", selector: ".fileBox", child: ".fileInput" },
];

for (const { file, selector, child } of CONTAINED) {
  test(`${file} — ${selector} ต้องเป็นบล็อกอ้างอิงให้ ${child}`, () => {
    const source = withoutComments(fs.readFileSync(path.join(WEBAPP, file), "utf8"));
    const parsed = rules(source);

    const holder = parsed.find((rule) => rule.selector === selector);
    assert.ok(holder, `หา selector ${selector} ใน ${file} ไม่เจอ — ถ้าเปลี่ยนชื่อ ต้องแก้ด่านนี้ด้วย`);
    assert.match(
      holder.body,
      POSITIONED_ANCESTOR,
      `${selector} ต้องมี position: relative เพราะ ${child} เป็น absolute\n` +
        `ถ้าถอดออก ${child} จะไปอิงกรอบหน้าจอ แล้วดันความสูงเอกสารทั้งหน้า`,
    );

    const hidden = parsed.find((rule) => rule.selector === child);
    assert.ok(hidden, `หา selector ${child} ใน ${file} ไม่เจอ`);
    assert.match(hidden.body, ABSOLUTE, `${child} ควรยังเป็น absolute — ถ้าเลิกใช้แล้ว ให้ถอดด่านนี้ออกพร้อมกัน`);
  });
}
