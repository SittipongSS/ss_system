import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { ROW_REVEAL_PEEK, revealInRow, rowRevealDelta } from "./rowReveal.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const row = { left: 28, right: 1412 }; // แถบแท็บของหน้ามาตรฐานเอกสารที่จอ 1440 (กรอบ 1384px)

/* 🐞 UAT PR-3 · D16 ที่ 1440px: แท็บที่เจ็ด ("รายงานการประเมินพื้นที่ FM-TS-01" กว้าง 226px) เห็นแค่ 85px
   แถวเลื่อนได้แต่ไม่มีสกอร์ลบาร์ · กดส่วนที่เห็นแล้วแท็บถูกเลือก แต่ป้ายยังขาดเท่าเดิม */
test("แท็บที่ล้นขอบขวาถูกพาเข้ากรอบเต็มตัว พร้อมระยะเผื่อ", () => {
  const cut = { left: 1327, right: 1553 }; // เห็น 85 จาก 226px
  const delta = rowRevealDelta(row, cut);
  assert.equal(delta, 1553 + ROW_REVEAL_PEEK - 1412);
  // หลังเลื่อน (พิกัดของลูกลดลงเท่า delta) ลูกอยู่ในกรอบทั้งตัว และไม่ต้องขยับอีก
  const after = { left: cut.left - delta, right: cut.right - delta };
  assert.ok(after.left >= row.left && after.right <= row.right);
  assert.equal(rowRevealDelta(row, after), 0);
});

test("แท็บที่ล้นขอบซ้ายถูกพากลับมา · แท็บที่อยู่ในกรอบแล้วไม่ขยับ", () => {
  assert.equal(rowRevealDelta(row, { left: -113, right: 52 }), -113 - ROW_REVEAL_PEEK - 28);
  assert.equal(rowRevealDelta(row, { left: 400, right: 600 }), 0);
  // ชิดขอบพอดีแต่ไม่เหลือระยะเผื่อ = ขยับให้เห็นขอบของแท็บข้าง ๆ (แถวไม่มีสกอร์ลบาร์ — ชิ้นที่โผล่คือสัญญาณว่ายังมีต่อ)
  assert.equal(rowRevealDelta(row, { left: 1200, right: 1412 }), ROW_REVEAL_PEEK);
  assert.equal(rowRevealDelta(row, { left: 1200, right: 1412 }, 0), 0);
});

test("ลูกที่กว้างเกือบเท่ากรอบ: ระยะเผื่อหดลงจนลูกยังอยู่ครบ · กว้างกว่ากรอบ: ชิดซ้าย", () => {
  const narrow = { left: 16, right: 344 }; // จอ 360
  // ลูก 300px ในกรอบ 328px — เผื่อได้ข้างละ 14px ไม่ใช่ 40
  const delta = rowRevealDelta(narrow, { left: 200, right: 500 });
  assert.equal(delta, 500 + 14 - 344);
  const after = { left: 200 - delta, right: 500 - delta };
  assert.ok(after.left >= narrow.left && after.right <= narrow.right);
  assert.equal(rowRevealDelta(narrow, { left: 200, right: 600 }), 200 - 16);
  assert.equal(rowRevealDelta(narrow, { left: -50, right: 350 }), -50 - 16);
});

test("กล่องที่วัดไม่ได้ (ยังไม่ถูกวาด · ค่าแปลก) = ไม่ขยับ", () => {
  assert.equal(rowRevealDelta({ left: 0, right: 0 }, { left: 0, right: 0 }), 0);
  assert.equal(rowRevealDelta(row, { left: 10, right: 10 }), 0);
  assert.equal(rowRevealDelta(null, { left: 10, right: 20 }), 0);
  assert.equal(rowRevealDelta(row, undefined), 0);
  assert.equal(rowRevealDelta({ left: "x", right: 5 }, { left: 1, right: 2 }), 0);
});

test("revealInRow ขยับ scrollLeft ของแถวอย่างเดียว — ไม่เรียก scrollIntoView (ตัวนั้นเลื่อนหน้าไปด้วย)", () => {
  const rect = (left, right) => ({ getBoundingClientRect: () => ({ left, right }) });
  const tablist = { ...rect(28, 1412), scrollLeft: 0 };
  const tab = { ...rect(1327, 1553), scrollIntoView: () => { throw new Error("ห้ามเรียก scrollIntoView"); } };
  assert.equal(revealInRow(tablist, tab), 181);
  assert.equal(tablist.scrollLeft, 181);
  const inside = rect(400, 600);
  assert.equal(revealInRow(tablist, inside), 0);
  assert.equal(tablist.scrollLeft, 181);
  assert.equal(revealInRow(null, tab), 0);
  assert.equal(revealInRow(tablist, null), 0);
  assert.doesNotMatch(read("./rowReveal.js").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, ""), /scrollIntoView/);
});

// แถบแท็บกลางเดินสายถึงตัวนี้จริง — แท็บที่ถูกเลือก (กด · ลูกศร · ค่าที่หน้าเปลี่ยนเอง) เข้ากรอบทุกครั้ง เฉพาะแถบแนวนอน
test("Tabs พาแท็บที่ถูกเลือกเข้ากรอบของแถบ ทุกครั้งที่ค่าเปลี่ยน", () => {
  const tabs = read("../../components/ui/Tabs.js");
  assert.match(tabs, /import \{ revealInRow \} from "@\/lib\/ui\/rowReveal";/);
  assert.match(tabs, /const selectedIndex = visibleTabs\.findIndex\(\(tab\) => value === tab\.key\);/);
  assert.match(
    tabs,
    /useEffect\(\(\) => \{\s*if \(orientation !== "horizontal" \|\| selectedIndex < 0\) return;\s*revealInRow\(rootRef\.current, buttonsRef\.current\[selectedIndex\]\);\s*\}, \[value, selectedIndex, orientation\]\);/,
  );
  // แถบยังเลื่อนแนวนอนได้และยังไม่มีสกอร์ลบาร์ — เหตุที่ต้องพาแท็บเข้ากรอบให้
  const css = read("../../app/globals.css");
  const rule = /\.tabs-header\s*\{([^}]*)\}/.exec(css)?.[1] || "";
  assert.match(rule, /overflow-x:\s*auto/);
  assert.match(rule, /scrollbar-width:\s*none/);
});
