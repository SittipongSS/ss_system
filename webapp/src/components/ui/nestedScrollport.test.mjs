import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/* ── ห้ามมีกล่องเลื่อนซ้อนกล่องเลื่อนรอบตาราง (2026-09-07) ────────────────────
   🐞 ที่มา: `<div className="fz-box"><TableScroll …>` — สองชั้นต่างมี
   `overflow: auto` + `max-height` ของตัวเอง

     กล่องนอก `.fz-box`  = calc(100dvh - 250px)  → 650px ที่จอสูง 900
     กล่องใน  `.scroll`  = --pinned-box-max      → 770px ที่จอเดียวกัน

   กล่องในสูงกว่ากล่องนอก **120px คงที่ทุกความสูงจอ** และ `position: sticky` ของ
   `thead th` / `tfoot td.fz-foot` ปักกับ scrollport ที่ใกล้ที่สุด = กล่อง **ใน**
   ⇒ เลื่อนกล่องนอกทีไร หัวตารางที่ "ปักแล้ว" ก็เลื่อนหลุดจอตามไปทั้งกล่อง

   วัดสดที่ /sa/targets (1440×900) ก่อนแก้:
     บนสุด            หัวเดือนเห็น · แถวรวมสองแถวอยู่ที่ +700/+748 (นอกกล่อง 650)
     กล่องนอกลงสุด    แถวรวมเห็น  · หัวเดือนอยู่ที่ **−135** (หลุดจอ)
   ⇒ หัวกับแถวรวมไม่มีทางเห็นพร้อมกัน บนหน้าที่กรอกเงิน 12 เดือน × ราย AE
   หลังแก้: หัวอยู่ +1 ตลอด และแถวรวมอยู่ในกรอบทั้งตอนบนสุดและลงสุด

   เกิดตอน #1627 ใส่ `max-height` ให้ `.scroll` (ก่อนหน้านั้น `.scroll` ไม่มีเพดาน
   กล่องนอกจึงเป็น scrollport เดียว ทุกอย่างปักถูก) กระทบ 7 จุด และ **ไม่มีด่านไหน
   เห็นเลย** — `grep fz-box` ในไฟล์เทสต์ทั้งหมดได้ 0

   🪤 ทำไมด่านที่มีอยู่มองไม่เห็น: ทั้งสองคลาสถูกต้องทีละตัว ความผิดอยู่ที่
   **ความสัมพันธ์ข้ามไฟล์** (CSS ตัวหนึ่ง + JSX อีกที่หนึ่ง) ไม่มีด่านไหนอ่านคู่นี้ */

const WEBAPP = process.cwd();
const SRC = path.join(WEBAPP, "src");

function filesUnder(dir, exts, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) filesUnder(full, exts, out);
    else if (exts.some((ext) => entry.name.endsWith(ext))) out.push(full);
  }
  return out;
}

const withoutComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "");

/* คลาสที่ "เป็นกล่องเลื่อนที่มีเพดาน" — คิดจาก CSS จริง ไม่ใช่รายชื่อที่พิมพ์ไว้เอง
   ⇒ ใครสร้างคลาสเพดานใหม่ ด่านนี้รู้จักเองทันที ไม่ต้องมาเติมรายชื่อ */
function cappedScrollClasses() {
  const names = new Set();
  for (const file of filesUnder(SRC, [".css"])) {
    const source = withoutComments(fs.readFileSync(file, "utf8"));
    for (const hit of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = hit[1].trim();
      const body = hit[2];
      if (selector.startsWith("@")) continue;
      if (!/max-height\s*:/.test(body)) continue;
      if (!/overflow(?:-y)?\s*:\s*(?:auto|scroll)/.test(body)) continue;
      for (const cls of selector.matchAll(/\.([A-Za-z][\w-]*)/g)) names.add(cls[1]);
    }
  }
  /* `.scroll` คือ primitive เอง — เป็นกล่องเลื่อนที่ถูกต้องอยู่แล้ว */
  names.delete("scroll");
  return names;
}

const OPEN_TAG = /<(div|section|figure)\b[^>]*className=(\{[^}]*\}|"[^"]*")/;
const CLOSE_TAG = /<\/(?:div|section|figure)>/;
const LOOKBACK = 12;

test("ห้ามเอาคลาสกล่องเลื่อนที่มีเพดานไปห่อ TableScroll อีกชั้น", () => {
  const capped = cappedScrollClasses();
  assert.ok(capped.size > 0, "อ่านคลาสเพดานจาก CSS ไม่ได้เลย — ตัวจับน่าจะพัง");

  const offenders = [];
  for (const file of filesUnder(SRC, [".js", ".jsx"])) {
    const lines = fs.readFileSync(file, "utf8").split("\n");
    lines.forEach((line, index) => {
      if (!line.includes("<TableScroll")) return;
      /* 🪤 ของจริงที่เคยพลาด: div กับ TableScroll เขียนอยู่ **บรรทัดเดียวกัน**
         ต้องตรวจส่วนหน้าของบรรทัดนั้นก่อน ไม่ใช่เริ่มดูจากบรรทัดบน */
      const before = line.slice(0, line.indexOf("<TableScroll"));
      const inline = before.match(new RegExp(OPEN_TAG.source + "(?![\\s\\S]*</(?:div|section|figure)>)"));
      if (inline) {
        for (const cls of capped) {
          if (new RegExp(`(^|[^\\w-])${cls}($|[^\\w-])`).test(inline[2])) {
            offenders.push(`${path.relative(WEBAPP, file)}:${index + 1} ห่อด้วย .${cls} (บรรทัดเดียวกัน)`);
          }
        }
        return;
      }
      /* เดินขึ้นหาแท็กที่ห่ออยู่ตัวแรก — เจอแท็กปิดก่อนแปลว่าไม่มีใครห่อ */
      for (let up = index - 1; up >= Math.max(0, index - LOOKBACK); up -= 1) {
        if (CLOSE_TAG.test(lines[up])) break;
        const open = lines[up].match(OPEN_TAG);
        if (!open) continue;
        for (const cls of capped) {
          if (new RegExp(`(^|[^\\w-])${cls}($|[^\\w-])`).test(open[2])) {
            offenders.push(`${path.relative(WEBAPP, file)}:${up + 1} ห่อด้วย .${cls}`);
          }
        }
        break;
      }
    });
  }

  assert.deepEqual(
    offenders,
    [],
    "คลาสเพดานต้องอยู่บน <TableScroll> เอง ไม่ใช่บน div ที่ห่อมัน\n" +
      "ไม่งั้นได้กล่องเลื่อนสองชั้น แล้วหัวตาราง sticky จะปักกับกล่องในที่เลื่อนตามกล่องนอกไปด้วย\n" +
      offenders.map((o) => `  · ${o}`).join("\n"),
  );
});

/* ── เจ็ดจุดที่เคยผิด ต้องอยู่บน TableScroll เท่านั้น ───────────────────────
   ยามข้างบนอ่านได้แค่ 12 บรรทัดย้อนหลัง ถ้ามีคนแทรกอะไรคั่นจนหลุดกรอบนั้น
   ยามนี้ยังจับได้ เพราะผูกกับคลาสตรง ๆ */
for (const cls of ["fz-box", "reconciliation-container"]) {
  test(`ทุกที่ที่ใช้ .${cls} ใน JSX ต้องอยู่บน <TableScroll>`, () => {
    const wrong = [];
    let seen = 0;
    for (const file of filesUnder(SRC, [".js", ".jsx"])) {
      if (file.endsWith(".test.mjs")) continue;
      fs.readFileSync(file, "utf8").split("\n").forEach((line, index) => {
        if (!new RegExp(`(^|[^\\w-])${cls}($|[^\\w-])`).test(line)) return;
        if (!/className/.test(line)) return;
        seen += 1;
        /* ต้องอยู่ **ในแท็ก** `<TableScroll …>` ไม่ใช่แค่บรรทัดเดียวกัน —
           `<div className="fz-box"><TableScroll>` ก็อยู่บรรทัดเดียวกันแต่ผิด */
        const open = line.indexOf("<TableScroll");
        const tag = open < 0 ? "" : line.slice(open, line.indexOf(">", open) + 1);
        if (!new RegExp(`(^|[^\\w-])${cls}($|[^\\w-])`).test(tag)) {
          wrong.push(`${path.relative(WEBAPP, file)}:${index + 1}`);
        }
      });
    }
    assert.ok(seen > 0, `ไม่เจอการใช้ .${cls} เลย — ถ้าเลิกใช้แล้ว ให้ถอดด่านนี้ออกพร้อมกัน`);
    assert.deepEqual(wrong, [], `.${cls} ต้องเป็น className ของ <TableScroll> เท่านั้น`);
  });
}

/* ── คลาสเพดานต้องชนะ `.scroll` ได้จริง ─────────────────────────────────────
   `.scroll` เป็น CSS Module ซึ่งโหลด **ทีหลัง** globals ⇒ ที่ความจำเพาะเท่ากัน
   `.scroll { max-height }` ชนะเสมอ · คลาสเพดานใน globals จึงต้องเขียนชื่อซ้ำ
   เพื่อดันความจำเพาะขึ้น ไม่งั้นย้ายคลาสมาแล้วเพดานที่จูนไว้ไม่มีผล */
for (const cls of ["fz-box", "reconciliation-container"]) {
  test(`.${cls} ต้องมีความจำเพาะพอจะชนะเพดานของ .scroll`, () => {
    const globals = withoutComments(fs.readFileSync(path.join(SRC, "app", "globals.css"), "utf8"));
    const owner = [...globals.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .map((hit) => ({ selector: hit[1].trim().replace(/\s+/g, " "), body: hit[2] }))
      .filter((rule) => /max-height\s*:/.test(rule.body))
      .filter((rule) => new RegExp(`\\.${cls}(?![\\w-])`).test(rule.selector));
    assert.ok(owner.length > 0, `ไม่เจอกฎ max-height ของ .${cls}`);
    for (const rule of owner) {
      const times = (rule.selector.match(new RegExp(`\\.${cls}(?![\\w-])`, "g")) || []).length;
      assert.ok(
        times >= 2,
        `\`${rule.selector}\` ต้องเขียน .${cls} ซ้ำอย่างน้อยสองครั้ง ไม่งั้นแพ้ .scroll ที่โหลดทีหลัง`,
      );
    }
  });
}
