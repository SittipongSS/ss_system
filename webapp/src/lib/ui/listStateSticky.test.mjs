import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/* ── ด่านจำค่าหน้ารายการ LIST_STATE_STICKY (คำขอเจ้าของ 27/11/2026 · ทั้งระบบ) ─────────────────
   "กรอง เรียง ค้นหา จัดกลุ่ม — กดเข้ารายละเอียดรายการหนึ่ง พอย้อนกลับ อยากให้คงค่าไว้"
   ⇒ ค่าที่กำหนดว่า **เห็นแถวไหน เรียงอย่างไร อยู่หน้าไหน** ต้องอยู่ใน useStickyState (lib/ui/useStickyState.js)
   ไม่ใช่ useState · ค่าคืนเฉพาะตอนกดย้อน/ปุ่ม "← กลับ" ที่พากลับหน้าที่เปิดใบมา (lib/ui/historyArrival.js)
   เข้าจากเมนู = ค่าตั้งต้น (มติ 2026-08-25)

   ชุดที่ตรวจ = ไฟล์ .js ใต้ src/app · src/components · src/lib ที่ "เป็นหน้ารายการ" คือ import เครื่องมือรายการ
   (FilterPopover · SortMenu · SortDirButton · GroupMenu · CollapseAllButton · ViewSwitcher) หรือ ListPanel
   หรือเรียก usePagination/useSortableTable · ยกเว้นชั้น primitive (components/ui) · โมดัล (*Modal.js) · เทสต์
   กฎ
     LS1 useState ที่ชื่อเป็นค่าของรายการ (ค้นหา · ตัวกรอง · เรียง · จัดกลุ่ม · กลุ่มที่ย่อ) — ใช้ useStickyState/useStickySet
     LS2 usePagination(...) ไม่ส่ง stickyKey — กดกลับแล้วได้หน้า 1 ทั้งที่อ่านอยู่หน้า 4
     LS3 useSortableTable(...) ไม่ส่ง { stickyKey } — กดกลับแล้วลำดับคอลัมน์หาย
     LS4 แท็บกรอง (Segmented · Tabs · ChoiceChips) ที่ value ผูกกับ useState — ชื่อตัวแปรอะไรก็ได้ (ทั้งหมด/ฉบับร่าง/
         รออนุมัติ… ชื่อ `tab` `status` `view` ที่ LS1 ไม่จับ · คำถามเจ้าของ 27/11 "แท็บพวกนี้ทั้งระบบค้างสถานะด้วยใช่ไหม")
   ข้อยกเว้น = LIST_STATE_EXEMPT ข้างล่าง (ต้องมีเหตุผล) · ข้อยกเว้นที่ไม่ตรง violation จริงสักจุด = ค้าง ⇒ ตก */

const WEBAPP = process.cwd();
const ROOTS = ["src/app", "src/components", "src/lib"];

const LIST_SIGNAL = /\b(FilterPopover|SortMenu|SortDirButton|GroupMenu|CollapseAllButton|ViewSwitcher|ListPanel)\b[^\n]*from\s+["'][^"']+["']|\busePagination\(|\buseSortableTable\(/;
/* ชื่อ state ที่เป็นค่าของรายการ — ตั้งให้กว้างพอจับของใหม่ แคบพอไม่จับช่องฟอร์ม */
const LIST_STATE_NAME = /^(query|q|search|searchText|searchQuery|needle|keyword|term|filter|filters|[a-z][A-Za-z]*Filter|sort|sortKey|sortDir|sortBy|sortOrder|groupBy|collapsed|collapsedGroups|collapsedBuckets)$/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (name.endsWith(".js")) out.push(full);
  }
  return out;
}

/* ข้อความตั้งแต่ `(` ที่ `open` ถึงวงเล็บปิดคู่ของมัน — ข้ามสตริง/เทมเพลต/คอมเมนต์อย่างหยาบ ๆ */
function callArgs(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === "/" && src[i + 1] === "/") { i = src.indexOf("\n", i); if (i === -1) break; continue; }
    if (ch === "/" && src[i + 1] === "*") { i = src.indexOf("*/", i + 2) + 1; if (i === 0) break; continue; }
    if (ch === '"' || ch === "'" || ch === "`") {
      for (i += 1; i < src.length && src[i] !== ch; i += 1) if (src[i] === "\\") i += 1;
      continue;
    }
    if (ch === "(" || ch === "{" || ch === "[") depth += 1;
    else if (ch === ")" || ch === "}" || ch === "]") {
      depth -= 1;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  return src.slice(open, open + 2000);
}

function scan() {
  const found = [];
  for (const root of ROOTS) {
    for (const full of walk(join(WEBAPP, root))) {
      const file = relative(WEBAPP, full);
      if (file.startsWith("src/components/ui/")) continue;
      if (/Modal\.js$/.test(file)) continue;
      if (file === "src/lib/usePagination.js" || file === "src/lib/useSortableTable.js") continue;
      const src = readFileSync(full, "utf8");
      if (!LIST_SIGNAL.test(src)) continue;
      const lines = src.split("\n");
      lines.forEach((line, i) => {
        const m = line.match(/const \[(\w+), set\w+\] = useState\b/);
        if (m && LIST_STATE_NAME.test(m[1])) found.push({ file, rule: "LS1", name: m[1], line: i + 1 });
      });
      /* LS4 — ตัวแปรที่ value ของแท็บชี้ ประกาศด้วย useState ตรง ๆ ในไฟล์เดียวกัน */
      const tabRe = /<(Segmented|Tabs|ChoiceChips)\b([\s\S]*?)\/?>/g;
      let tm;
      while ((tm = tabRe.exec(src))) {
        const bound = tm[2].match(/\b(?:value|active|selected)=\{([A-Za-z_$][\w$]*)\}/);
        if (!bound) continue;
        const name = bound[1];
        if (new RegExp(`const \\[\\s*${name}\\s*,\\s*set\\w+\\s*\\]\\s*=\\s*useState\\b`).test(src)) {
          found.push({ file, rule: "LS4", name, line: src.slice(0, tm.index).split("\n").length });
        }
      }
      for (const [rule, call] of [["LS2", "usePagination("], ["LS3", "useSortableTable("]]) {
        let at = src.indexOf(call);
        while (at !== -1) {
          /* เฉพาะจุดเรียก ไม่ใช่ import/export · อ่านอาร์กิวเมนต์ถึงวงเล็บปิดคู่ของมัน (accessor ที่มี
             `{ … ; }` ข้างในต้องไม่ตัดกลางทาง — เดิมหยุดที่ `;` ตัวแรกแล้วฟ้องทั้งที่ส่ง stickyKey แล้ว) */
          const before = src.slice(Math.max(0, at - 20), at);
          if (!/function\s+$|import[^;]*$/.test(before)) {
            const body = callArgs(src, at + call.length - 1);
            if (!/stickyKey/.test(body)) {
              found.push({ file, rule, name: call.slice(0, -1), line: src.slice(0, at).split("\n").length });
            }
          }
          at = src.indexOf(call, at + call.length);
        }
      }
    }
  }
  return found;
}

/* ── ข้อยกเว้น — { file, rule, name, reason } · reason บอกว่าทำไม "ไม่ใช่ค่าของรายการ" หรือทำไมไม่ควรจำ ── */
const DEMO_REASON = "หน้าตัวอย่าง primitive (/settings/design-preview) — ตารางเดโมไม่มีแถวที่กดเข้าใบได้ จึงไม่มีการกลับมาให้จำค่า";
const LIST_STATE_EXEMPT = [
  {
    file: "src/app/database/assets/page.js",
    rule: "LS4",
    name: "tab",
    reason: "แท็บ เครื่อง/รุ่น ถืออยู่ใน URL (?tab= · router.replace + effect ซิงก์) — กดย้อนได้คืนจาก URL · ปุ่มกลับจากหน้าเครื่องพากลับแท็บเครื่องซึ่งเป็นค่าตั้งต้นอยู่แล้ว และแท็บรุ่นไม่มีแถวที่กดเข้าใบ",
  },
  {
    file: "src/app/requests/page.js",
    rule: "LS4",
    name: "activeScope",
    reason: "activeScope = ขอบเขตที่ server ยอมให้จริง (header X-Request-Scope) ไม่ใช่ค่าที่ผู้ใช้เลือก — ค่าที่ผู้ใช้เลือกคือ `scope` ซึ่งเป็น useStickyState แล้ว",
  },
  {
    file: "src/app/service/schedule/page.js",
    rule: "LS1",
    name: "collapsed",
    reason: "กลุ่มที่พับในคิวนัดช่างจำใน localStorage อยู่แล้ว (schedule.queue.collapsed · ข้ามแท็บ/ข้ามวัน) — กดกลับก็ได้ค่าเดิม และยาวกว่า sessionStorage",
  },
  { file: "src/app/settings/design-preview/page.js", rule: "LS1", name: "sort", reason: DEMO_REASON },
  { file: "src/app/settings/design-preview/page.js", rule: "LS1", name: "filters", reason: DEMO_REASON },
  { file: "src/app/settings/design-preview/page.js", rule: "LS1", name: "teamFilter", reason: DEMO_REASON },
  { file: "src/app/settings/design-preview/page.js", rule: "LS1", name: "demoChipFilter", reason: DEMO_REASON },
  { file: "src/app/settings/design-preview/page.js", rule: "LS4", name: "tab", reason: DEMO_REASON },
  { file: "src/app/settings/design-preview/page.js", rule: "LS4", name: "view", reason: DEMO_REASON },
  { file: "src/app/settings/design-preview/page.js", rule: "LS4", name: "queueTab", reason: DEMO_REASON },
  { file: "src/app/settings/design-preview/page.js", rule: "LS4", name: "demoBrand", reason: DEMO_REASON },
  { file: "src/app/settings/design-preview/page.js", rule: "LS4", name: "demoChipFilter", reason: DEMO_REASON },
  { file: "src/app/settings/design-preview/page.js", rule: "LS4", name: "demoListView", reason: DEMO_REASON },
  { file: "src/app/settings/design-preview/page.js", rule: "LS4", name: "recordStatus", reason: DEMO_REASON },
  { file: "src/app/settings/design-preview/page.js", rule: "LS4", name: "recordRole", reason: DEMO_REASON },
  { file: "src/app/settings/design-preview/page.js", rule: "LS4", name: "group", reason: DEMO_REASON },
];

test("LS1–LS3: ค่าที่กำหนดแถว/ลำดับ/หน้าของรายการต้องจำไว้ตอนกดเข้าใบแล้วกดกลับ", () => {
  const found = scan();
  const key = (v) => `${v.file}|${v.rule}|${v.name}`;
  const exempt = new Set(LIST_STATE_EXEMPT.map(key));
  const open = found.filter((v) => !exempt.has(key(v)));
  assert.deepEqual(
    open.map((v) => `${v.file}:${v.line} ${v.rule} ${v.name}`),
    [],
    "ใช้ useStickyState/useStickySet · usePagination(…, { stickyKey }) · useSortableTable(…, …, …, { stickyKey })",
  );
});

test("ข้อยกเว้นต้องมีเหตุผล และต้องยังตรงกับของจริง (ไม่ค้าง)", () => {
  const found = new Set(scan().map((v) => `${v.file}|${v.rule}|${v.name}`));
  for (const e of LIST_STATE_EXEMPT) {
    assert.ok(e.reason && e.reason.length >= 30, `${e.file} ${e.name}: เหตุผลสั้นเกิน`);
    assert.ok(found.has(`${e.file}|${e.rule}|${e.name}`), `ข้อยกเว้นค้าง (โค้ดแก้แล้ว ลบทิ้ง): ${e.file} ${e.rule} ${e.name}`);
  }
});
