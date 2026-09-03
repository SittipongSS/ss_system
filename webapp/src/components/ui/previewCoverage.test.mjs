import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* หน้า settings/design-preview คือ "ต้นแบบที่เปิดดูได้จริง" ตาม UI_DESIGN_SYSTEM.md
   primitive ที่ไม่อยู่บนหน้านี้ = ของที่คนหาไม่เจอ แล้วไปสร้างของตัวเองขนานกันอีกชุด

   ⚠️ อย่าเล่าเกินจริง — "ไม่อยู่บนหน้าต้นแบบ" ไม่ได้แปลว่า "ไม่มีคนใช้"
   ตอนวัดครั้งแรก (2026-09-03) OptionTiles ถูกอิมพอร์ตจริง 22 ไฟล์ · AlertBanner 9 ไฟล์
   ทั้งคู่ไม่เคยอยู่บนหน้านี้เลย · สิ่งที่หน้านี้แก้คือ **"หาไม่เจอ"** ไม่ใช่ "ไม่มีคนใช้"
   ลายเซ็นของ shelf-ware ตัวจริงคือช่องว่างระหว่าง "อิมพอร์ตจริง" กับ "เอ่ยถึงในคอมเมนต์":
   GatedAction อิมพอร์ต 3 · เอ่ยถึง 13 — คนเขียนกฎของมันไว้ในคอมเมนต์แล้วเขียนตรรกะเอง

   ── ผ่านต้องได้ทั้งสองข้อ (AND) ────────────────────────────────────────────
   ข้อ A · เรนเดอร์จริง — ตรวจจาก *โค้ด* ไม่ใช่จากตัวหนังสือ
   ข้อ B · ชื่อต้องเป็น *ตัวหนังสือที่คนอ่านเห็น* บนหน้า

   ทำไมต้องมีทั้งคู่ — เกณฑ์ "มีชื่อปรากฏในไฟล์" (ซึ่งเคยใช้วัดรอบแรก) หลุด 2 ตัว
   จากของจริง 27 ตัว และทั้งคู่คือกับดักคนละด้านพอดี:
     Tooltip          ผ่านเพราะบรรทัด import ของ recharts มีคำว่า Tooltip — คนละไลบรารี
     TransitionDialog ผ่านเพราะชื่อไปโผล่ในสตริง subtitle โดยไม่มีโค้ดสักบรรทัด
   ข้อ A ปิดรูแรก (อ่านเฉพาะ binding ที่ import มาจาก @/components/ui/ และตัดสตริง
   กับ text node ทิ้งก่อนหาการใช้งาน) · ข้อ B ปิดรูที่กลับกัน คือ "อิมพอร์ตแล้วโยน
   <X /> เปล่าไว้มุมหนึ่ง" ให้ผ่านทั้งที่ไม่มีใครหาเจอ — และข้อ B คือสิ่งที่ทำให้
   Ctrl+F บนหน้าต้นแบบตอบคำถาม "ของกลางตัวไหนทำเรื่องนี้" ได้จริง

   บ้านของด่านอยู่ที่นี่ ไม่ใช่ scripts/audit-ui.mjs เพราะ audit-ui เป็นระบบ
   **เพดาน ratchet** ส่วนด่านนี้ต้องเป็น **hard-zero** เหมือน ROW_MIRROR/CARD_MIRROR —
   เพดานจะกลายเป็นโควตาแจกให้ primitive ใหม่ทันทีที่มีคนอยากข้าม */

const UI_DIR = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const PREVIEW_REL = "src/app/settings/design-preview/page.js";
const PREVIEW = read("../../app/settings/design-preview/page.js");

/* ── ทะเบียนยกเว้น — รายตัว มีเหตุผล และ "ตายเองได้" ─────────────────────────
   ไม่มีกฎกว้าง ๆ แบบ "utility ยกเว้นหมด" — ตรวจแล้วทั้ง 76 ไฟล์ใน components/ui
   เรนเดอร์ JSX ทุกตัว ไม่มีตัวไหนเป็น utility ล้วน จึงไม่มีชนชั้นยกเว้น มีแต่รายตัว

   `via` = primitive ที่ **เรนเดอร์ตัวที่ยกเว้นให้อยู่แล้วบนหน้าต้นแบบ** และตัวนั้น
   ต้องผ่านข้อ A ด้วยตัวเอง ⇒ วันที่ใครถอด via ออกจากหน้า ตัวที่ยกเว้นจะตกตามทันที
   ไม่ใช่ยกเว้นค้างอยู่เงียบ ๆ */
const PREVIEW_EXEMPT = [
  {
    module: "TransitionDialog",
    via: "RecordControlCard",
    reason:
      "สัญญาของมันคือ 'lifecycle เป็นคนเรนเดอร์' — ห้ามผู้เรียกสร้างเอง · หน้าต้นแบบ"
      + " เปิดโมดัลนี้จริงอยู่แล้วเมื่อกด 'ยกเลิกรายการ' บน RecordControlCard/RecordActionMenu"
      + " (มี fields ครบสี่ชนิด: select · person · money · datetime) และมี caption ชี้ไว้แล้ว"
      + " · เรียกตรงในหน้าต้นแบบ = สอนท่าที่ผิด",
  },
];

// ── เครื่องมืออ่านหน้าต้นแบบ ───────────────────────────────────────────────

/* ชื่อในคอมเมนต์ต้องไม่นับ — ทั้งข้อ A และข้อ B อ่านจากซอร์สที่ตัดคอมเมนต์แล้ว
   (`[^:]` กัน `https://` ในสตริงไม่ให้ถูกมองเป็นคอมเมนต์บรรทัดเดียว) */
const NO_COMMENT = PREVIEW
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

/* โค้ดล้วน = ตัดสตริง/เทมเพลต แล้วตัด text node ของ JSX ออกอีกชั้น
   ต้องตัด **สตริงก่อน** เพราะ subtitle ของหน้านี้มีคำว่า `<Input>` อยู่ในข้อความจริง ๆ
   ถ้าไม่ตัด โมดูล Input จะผ่านข้อ A ด้วยตัวหนังสือ ทั้งที่ข้อ A ต้องวัดจากโค้ดเท่านั้น */
const CODE_ONLY = NO_COMMENT
  .replace(/`[^`]*`/g, " ")
  .replace(/"[^"\n]*"/g, " ")
  .replace(/'[^'\n]*'/g, " ")
  .replace(/>[^<>{}]+</g, "> <");

/* ตัวหนังสือที่คนอ่านเห็น = text node ของ JSX (รวมเนื้อใน <code>) + prop ที่เป็นข้อความ
   ตั้งใจ **ไม่นับ** ariaLabel/placeholder/alt/className — พวกนั้น Ctrl+F บนหน้าไม่เจอ */
const TEXT_PROPS = /\b(?:title|subtitle|label|description|hint|helpText|eyebrow|detail)=(?:"([^"\n]*)"|\{`([^`]*)`\}|\{"([^"\n]*)"\})/g;
const VISIBLE = [
  ...[...NO_COMMENT.matchAll(/>([^<>{}]+)</g)].map((m) => m[1]),
  ...[...NO_COMMENT.matchAll(TEXT_PROPS)].map((m) => m[1] ?? m[2] ?? m[3]),
].join("\n");

/* binding → module: รับทั้ง default, named และ `as` · อ่านเฉพาะ import ที่มาจาก
   @/components/ui/ — บรรทัด import จากที่อื่นไม่เข้าแผนที่ (นี่คือข้อที่ปิดรู recharts)
   ยึด `^import` กับ `$` ไว้ทั้งสองข้าง เพื่อไม่ให้ clause ลากข้าม import ตัวก่อนหน้ามา */
function bindingsByModule(source) {
  const map = new Map();
  for (const m of source.matchAll(/^import\s+([\s\S]*?)\s+from\s+(["'])([^"']+)\2;?[ \t]*$/gm)) {
    const [, clause, , from] = m;
    /* รับทั้ง alias และ path สัมพัทธ์ — วันนี้หน้าต้นแบบใช้ alias ล้วน แต่ในโฟลเดอร์
       components/ui กันเองเขียน `./MaskedNumberInput` กัน ถ้าใครย้ายหน้าต้นแบบแล้ว
       เผลอเปลี่ยนรูป import ด่านต้องไม่ฟ้องผิดจุด */
    const hit = /(?:^@\/components\/ui\/|(?:^|\/)components\/ui\/)([\w/]+)$/.exec(from);
    if (!hit) continue;
    const mod = hit[1];
    /* ตั้งต้นเป็นเซตว่าง **ห้ามหยอดชื่อโมดูลลงไป** — ข้อ A ต้องรู้จักเฉพาะชื่อที่หน้านี้
       ผูกไว้จริงเท่านั้น ไม่งั้น `import X from "@/components/ui/Foo"` ที่ไม่มีใครใช้
       จะถูก `<Foo />` ของไลบรารีอื่นในหน้าเดียวกันปั๊มให้ผ่าน */
    if (!map.has(mod)) map.set(mod, new Set());
    const names = map.get(mod);
    const def = clause.match(/^\s*([A-Za-z_$][\w$]*)/);
    if (def) names.add(def[1]);
    const braces = clause.match(/\{([\s\S]*)\}/);
    if (braces) {
      for (const part of braces[1].split(",")) {
        const token = part.trim();
        if (!token) continue;
        const aliased = token.split(/\s+as\s+/);
        names.add((aliased[1] || aliased[0]).trim());
      }
    }
  }
  return map;
}

/* ⚠️ ผ่าน/ตกต้องวัด "ระดับโมดูล" ไม่ใช่ "ระดับชื่อ export" — ไม่งั้น Table (หน้าใช้
   TableShell/TableScroll/TableEmpty) · DetailPage (ContextCard/DetailCard/DetailPageLayout)
   · ActionButtons (ActionBar/ActionButton) · Skeleton (SkeletonRows) จะตกทั้งที่อยู่บนหน้าจริง */
function rendersModule(names) {
  return names.some((name) => (
    new RegExp(`<${name}[\\s/>]`).test(CODE_ONLY)              // เรนเดอร์เป็น JSX element
    // primitive ที่เป็น *คำสั่ง* ไม่มีทางเป็น JSX: confirmAction(...) · notifyToast.info(...)
    || new RegExp(`(?<![\\w$.])${name}\\s*\\(`).test(CODE_ONLY)
    || new RegExp(`(?<![\\w$.])${name}\\.[A-Za-z_$][\\w$]*\\s*\\(`).test(CODE_ONLY)
  ));
}

const mentionsModule = (names) =>
  names.some((name) => new RegExp(`(?<![\\w$])${name}(?![\\w$])`).test(VISIBLE));

const BINDINGS = bindingsByModule(NO_COMMENT);
/* ⚠️ ข้อ A ต้องดูเฉพาะ binding ที่ import มาจาก @/components/ui/ **เท่านั้น** — โมดูลที่
   หน้าต้นแบบไม่ได้อิมพอร์ตเลยจะได้ชุดว่าง แล้วตกทันที · ห้ามเผลอ fallback เป็นชื่อโมดูล
   ตรง ๆ เพราะจะเปิดรู recharts กลับมา: `import { Tooltip } from "recharts"` + `<Tooltip />`
   จะทำให้ ui/Tooltip ผ่านทั้งที่ไม่มีอยู่บนหน้าเลย (ยิงกระสุนนัดนี้จริงแล้ว 2026-09-03
   ตอนแรกด่านปล่อยผ่าน) · ข้อ B เป็นคนละเรื่อง — วัดว่า "ชื่อ" ปรากฏเป็นตัวหนังสือไหม
   จึงนับชื่อโมดูลรวมไปด้วยได้ */
const renderNamesOf = (mod) => [...(BINDINGS.get(mod) || [])];
const textNamesOf = (mod) => [...new Set([mod, ...renderNamesOf(mod)])];
const UI_MODULES = readdirSync(UI_DIR)
  .filter((file) => file.endsWith(".js"))
  .map((file) => file.replace(/\.js$/, ""))
  .sort();
const EXEMPT_BY_MODULE = new Map(PREVIEW_EXEMPT.map((entry) => [entry.module, entry]));

// ── ด่านหลัก ──────────────────────────────────────────────────────────────

test("ข้อ A · primitive ทุกตัวถูกเรนเดอร์จริงบนหน้าต้นแบบ (ชื่อในคอมเมนต์ไม่นับ)", () => {
  const missing = UI_MODULES.filter((mod) => !EXEMPT_BY_MODULE.has(mod) && !rendersModule(renderNamesOf(mod)));
  assert.deepEqual(missing, [],
    `primitive ${missing.length} ตัวไม่ถูกเรนเดอร์ใน ${PREVIEW_REL} — คนหาไม่เจอแล้วจะไป`
    + ` สร้างของตัวเองขนานกันอีกชุด · เพิ่มตัวอย่างที่กดได้จริงลงหน้าต้นแบบ`
    + ` (ถ้าเป็น primitive ที่ห้ามเรียกตรง ให้ลงทะเบียนใน PREVIEW_EXEMPT พร้อมเหตุผล)`);
});

test("ข้อ B · ชื่อของ primitive ต้องเป็นตัวหนังสือที่คนอ่านเห็นบนหน้า", () => {
  const silent = UI_MODULES.filter((mod) => !EXEMPT_BY_MODULE.has(mod) && !mentionsModule(textNamesOf(mod)));
  assert.deepEqual(silent, [],
    `primitive ${silent.length} ตัวเรนเดอร์อยู่แต่ไม่มีชื่อเป็นตัวหนังสือบนหน้า —`
    + ` Ctrl+F หาไม่เจอก็เท่ากับไม่มี · เขียนชื่อลงใน title/subtitle ของ <Section>,`
    + ` caption ข้าง ๆ ตัวอย่าง หรือ <code> ในบล็อกกฎ`);
});

// ── ด่านคุมทะเบียนยกเว้นไม่ให้เน่า ─────────────────────────────────────────

test("ทะเบียนยกเว้นชี้ไปโมดูลที่มีจริง และเขียนเหตุผลไว้จริง", () => {
  for (const entry of PREVIEW_EXEMPT) {
    assert.ok(UI_MODULES.includes(entry.module),
      `PREVIEW_EXEMPT ยกเว้น ${entry.module} แต่ไม่มีไฟล์ components/ui/${entry.module}.js แล้ว — ลบรายการทิ้ง`);
    assert.ok(UI_MODULES.includes(entry.via),
      `${entry.module} อ้าง via=${entry.via} แต่ไม่มีไฟล์ components/ui/${entry.via}.js`);
    // 60 ตัวอักษรกันคำว่า "TODO" หรือ "ยังไม่ทำ" ไม่ให้ผ่านเป็นเหตุผล
    assert.ok((entry.reason || "").length >= 60,
      `${entry.module} ต้องเขียนเหตุผลว่าทำไมเรียกตรงบนหน้าต้นแบบไม่ได้ — ไม่ใช่ "TODO"`);
  }
});

/* 🔴 **ช่องที่ทะเบียนยกเว้นเปิดไว้ — ปิดแล้ว 2026-09-03**
   รีวิว**ยิงทดสอบจริง**: สร้าง primitive ปลอมแล้วเติมรายการเดียวลง PREVIEW_EXEMPT
   ว่า `{ module: "ZzProbe", via: "Button", reason: "<ข้อความลอย ๆ>" }` ⇒ เทสต์เขียวหมด
   เพราะของเดิมตรวจแค่ว่า **via มีอยู่จริง** และ **via ยังอยู่บนหน้าต้นแบบ**
   ไม่มีใครตรวจว่า **via เรนเดอร์ตัวที่ยกเว้นจริงหรือเปล่า** ⇒ เขียนชื่ออะไรก็ผ่าน

   นี่คือรูปเดิมที่เจอมาสามครั้งในงานชุดนี้: **ข้อยกเว้นกลายเป็นสวิตช์ปิดด่าน**
   (ไอคอน Plus ในด่านเชิงคำ · ทะเบียนที่หมดอายุเงียบ ๆ ใน ROW_MIRROR)
   ⇒ ผูกการยกเว้นกับ **ของจริงที่ตรวจได้** ไม่ใช่กับข้อความที่คนพิมพ์ */
test("via ต้องเรนเดอร์ตัวที่ยกเว้นจริง ไม่ใช่แค่ชื่อในทะเบียน", () => {
  for (const entry of PREVIEW_EXEMPT) {
    /* ตัดคอมเมนต์ก่อนหาแบบเดียวกับ NO_COMMENT ข้างบน — ไม่งั้นชื่อที่เอ่ยถึงใน
       คอมเมนต์ของ via จะนับเป็น "เรนเดอร์แล้ว" ซึ่งคือช่องเดิมที่กำลังปิดอยู่พอดี */
    const viaSource = readFileSync(path.join(UI_DIR, `${entry.via}.js`), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/(^|[^:\w])\/\/[^\n]*/g, "$1 ");
    const rendered = new RegExp(`<${entry.module}[\\s/>]`).test(viaSource);
    assert.ok(rendered,
      `${entry.module} อ้างว่ายกเว้นได้เพราะ ${entry.via} เรนเดอร์ให้ — แต่หา <${entry.module}`
      + ` ใน components/ui/${entry.via}.js ไม่เจอ · การยกเว้นต้องผูกกับของจริงที่ตรวจได้`
      + ` ไม่ใช่กับเหตุผลที่พิมพ์ลงทะเบียน`);
  }
});

test("ตัวที่ยกเว้นต้องมี via ที่ยังเรนเดอร์อยู่บนหน้าต้นแบบ", () => {
  for (const entry of PREVIEW_EXEMPT) {
    assert.ok(rendersModule(renderNamesOf(entry.via)),
      `${entry.module} ยกเว้นได้เพราะ ${entry.via} เรนเดอร์มันให้อยู่แล้ว — แต่ ${entry.via}`
      + ` หลุดออกจากหน้าต้นแบบไปแล้ว ⇒ ตอนนี้ไม่มีใครเห็น ${entry.module} เลย`
      + ` · เอา ${entry.via} กลับขึ้นหน้า หรือถอน ${entry.module} ออกจาก PREVIEW_EXEMPT`);
  }
});

/* กัน "ยกเว้นค้าง" แบบเดียวกับตัวเลขใน BADGE_FAMILIES ที่เคยค้างผิดอยู่ 3 เดือน:
   วันที่ใครเพิ่มตัวอย่างของจริงเข้าไป ทะเบียนต้องถูกลบ ไม่ใช่ปล่อยไว้เงียบ ๆ */
test("ห้ามมีรายการยกเว้นที่ผ่านด่านอยู่แล้ว", () => {
  const stale = PREVIEW_EXEMPT
    .filter((entry) => rendersModule(renderNamesOf(entry.module)) && mentionsModule(textNamesOf(entry.module)))
    .map((entry) => entry.module);
  assert.deepEqual(stale, [],
    `${stale.join(" · ")} อยู่บนหน้าต้นแบบครบแล้ว — ลบออกจาก PREVIEW_EXEMPT`);
});

// ── เก็บงานท้ายด่าน ───────────────────────────────────────────────────────

/* หน้าต้นแบบต้องเป็น "ของปลอมล้วน" — ข้อมูลสาธิตทั้งหมดเป็นค่าคงที่ในไฟล์
   ถ้าวันไหนมีคนลัดด้วยการดึงของจริงมาโชว์ (ApprovalQueue · MyTeamsFilter ·
   PersonLoadSelect ล้วนมีทางลัดแบบนั้นที่ "ดูถูก") หน้านี้จะพังตามสิทธิ์ผู้เปิด
   และเปิดจากเครื่องที่ไม่มีเน็ตหลังบ้านไม่ได้อีก */
test("หน้าต้นแบบไม่ยิง API และไม่อ่านทีมจริงของผู้เปิด", () => {
  for (const m of NO_COMMENT.matchAll(/^import\s+[\s\S]*?\s+from\s+(["'])([^"']+)\1;?[ \t]*$/gm)) {
    assert.doesNotMatch(m[2], /apiFetch|useMyTeamsFilter|roleContext/,
      `${PREVIEW_REL} อิมพอร์ต ${m[2]} — ต้นแบบต้องเดินด้วยข้อมูลปลอมในไฟล์เท่านั้น`);
  }
  assert.doesNotMatch(CODE_ONLY, /(?<![\w$.])fetch\s*\(/,
    `${PREVIEW_REL} เรียก fetch โดยตรง — ต้นแบบต้องไม่ต่อเน็ต`);
});

/* รูสุดท้ายที่ทำให้ "ผ่านด่านแต่คนเปิดไม่เห็น" เป็นไปได้จริง: `Section` คืน null เงียบ ๆ
   เมื่อ group ไม่ตรงกับแท็บที่เปิดอยู่ ⇒ พิมพ์ผิดเป็น group="control" แล้วทั้งส่วนหายไป
   โดยไม่มี error และข้อ A ยังผ่านเพราะโค้ดยังอยู่ในไฟล์ */
test("ทุก <Section> ประกาศ group ที่มีอยู่จริงใน GROUPS", () => {
  const block = NO_COMMENT.match(/const GROUPS = \[([\s\S]*?)\n\];/);
  assert.ok(block, "หา const GROUPS บนหน้าต้นแบบไม่เจอ");
  const keys = [...block[1].matchAll(/key:\s*"([\w-]+)"/g)].map((m) => m[1]);
  assert.ok(keys.length >= 2, "GROUPS ต้องมีอย่างน้อย 2 กลุ่ม");

  const total = [...NO_COMMENT.matchAll(/<Section(?![\w$])/g)].length;
  const declared = [...NO_COMMENT.matchAll(/<Section\s+group="([\w-]+)"/g)].map((m) => m[1]);
  assert.equal(declared.length, total,
    `มี <Section> ${total} จุด แต่ประกาศ group เป็นแอตทริบิวต์แรกแค่ ${declared.length} จุด`
    + ` — เขียน group ไว้ต้นแท็กเสมอ ไม่งั้นส่วนนั้นหายทั้งอันโดยไม่มี error`);
  for (const key of declared) {
    assert.ok(keys.includes(key),
      `<Section group="${key}"> ไม่มีใน GROUPS (${keys.join(" · ")}) — ส่วนนี้จะไม่ถูกแสดงเลย`);
  }
});
