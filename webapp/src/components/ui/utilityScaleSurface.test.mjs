import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/* ── ผิวที่สาม: สเกลที่เขียนลง `className` ด้วย Tailwind (2026-09-02) ─────────────
   `utilityTypeScale.test.mjs` คุม **ขนาดตัวอักษร** ในผิวนี้ไปแล้วเมื่อ 2026-09-01
   ไฟล์นี้คือสเกลที่เหลือทั้งหมด: ความมนมุม · เงา · ความสูงบรรทัด · ระยะห่างตัวอักษร ·
   น้ำหนักตัวอักษร · ชั้นซ้อน · จังหวะ · ระยะห่าง · ขนาด

   ⚠️ แยกไฟล์จาก `utilityTypeScale.test.mjs` ตามกติกาเดิมของชุดนี้ — สเกลคนละตัวยกเข้า
   โทเคนคนละงบประมาณ ถ้ายัดรวมไฟล์เดียว วันที่สเกลใดสเกลหนึ่งปิดหมด อีกแปดตัวจะพลอย
   ถูกลบกฎไปด้วย

   ทำไมต้องมีไฟล์นี้: ก่อน 2026-09-02 ไม่มีสเกลไหนเห็นครบสามผิว และ `npm run audit:ui`
   พิมพ์เลข 0 สวย ๆ ให้อ่านทุกวัน — บทเรียนสดคือชั้นพิมพ์ที่พิมพ์ "0" มาตลอดทั้งที่ผิวนี้
   มี 152 จุด · **ศูนย์ปลอมอันตรายกว่าไม่มีด่าน** เพราะคนอ่านผลแล้วเลิกระวัง */

const root = path.join(process.cwd(), "src");
const AUDIT = fs.readFileSync(path.join(process.cwd(), "scripts", "audit-ui.mjs"), "utf8");

/* ต้องเดินไฟล์ชุดเดียวกับ `uiFiles` ของ audit-ui.mjs เป๊ะ ๆ (.js และ .css ใต้
   src/app + src/components) ไม่งั้นเลขที่นับได้จะไม่มีวันตรงกับเพดาน */
function uiFiles() {
  const out = [];
  for (const dir of ["app", "components"]) {
    (function walk(current) {
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(?:js|css)$/.test(entry.name)) out.push(full);
      }
    })(path.join(root, dir));
  }
  return out;
}

const rel = (file) => path.relative(process.cwd(), file).replaceAll("\\", "/");
/* audit-ui.mjs ใช้ blankBlockComments() กับกฎรอบ 2026-09-02 (ตัดคอมเมนต์บล็อกแต่คง
   เลขบรรทัด) — ที่นี่ต้องตัดแบบเดียวกัน ไม่งั้นทั้งเลขและบรรทัดจะไม่ตรงกัน */
const blankBlockComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ""));

/* ⚠️ ทุกตัวข้างล่างต้องเป็น regex **ตัวเดียวกับใน audit-ui.mjs เป๊ะ ๆ** — มีเทสต์ผูกไว้
   ข้างล่างแล้ว ถ้าสองฝั่งหลุดจากกัน เลขที่นับได้จะไม่ตรงเพดาน แล้วเทสต์จะฟ้องด้วยข้อความ
   "รูดเพดานลง" ซึ่ง *ชี้ผิดที่* คนแก้จะไปรูดเพดานตามแล้วรูที่แท้จริงถูกกลบ */
const TW_RAW_RADIUS = /(?<![\w-])rounded(?:-(?:t|b|l|r|s|e|tl|tr|bl|br|ss|se|es|ee))?-\[(?!\s*(?:[a-z-]+:\s*)?var\(--[\w-]+\)\s*\])[^\]\s]*\]|(?<![\w-])\[border-radius:(?!\s*(?:[a-z-]+:\s*)?var\(--[\w-]+\)\s*\])[^\]\s]*\]/g;
const TW_RAW_SHADOW = /(?<![\w-])(?:(?:inset-|drop-|text-)?shadow|inset-ring|ring(?:-offset)?)-\[(?!\s*(?:[a-z-]+:\s*)?var\(--[\w-]+\)\s*\])(?![a-z-]*color:)(?!#)[^\]\s]*\d[^\]\s]*\]|(?<![\w-])\[box-shadow:(?!\s*(?:[a-z-]+:\s*)?var\(--[\w-]+\)\s*\])[^\]\s]*\]/g;
const TW_RAW_LEADING = /(?<![\w-])leading-\[(?!\s*(?:[a-z-]+:\s*)?var\(--[\w-]+\)\s*\])[^\]\s]*\]|(?<![\w-])\[line-height:(?!\s*(?:[a-z-]+:\s*)?var\(--[\w-]+\)\s*\])[^\]\s]*\]|(?<![\w-])text-(?:\[(?:length:)?[0-9.][^\]\s]*\]|xs|sm|base|lg|[2-9]?xl)\/(?:\[(?!\s*var\()[^\]\s]*\]|\d)/g;
const TW_RAW_TRACKING = /(?<![\w-])-?tracking-\[(?!\s*(?:[a-z-]+:\s*)?var\(--[\w-]+\)\s*\])[^\]\s]*\]|(?<![\w-])\[letter-spacing:(?!\s*(?:[a-z-]+:\s*)?var\(--[\w-]+\)\s*\])[^\]\s]*\]/g;
const TW_RAW_FONT_WEIGHT = /(?<![\w-])font-\[(?!family-name:)(?:[a-z-]+:\s*)?[0-9][^\]\s]*\]|(?<![\w-])\[font-weight:(?!\s*(?:[a-z-]+:\s*)?var\(--[\w-]+\)\s*\])[^\]\s]*\]/g;
const TW_RAW_Z_INDEX = /(?<![\w-])-?(?:z|order)-\[(?!\s*(?:[a-z-]+:\s*)?var\(--[\w-]+\)\s*\])[^\]\s]*\]|(?<![\w-])\[z-index:(?!\s*(?:[a-z-]+:\s*)?var\(--[\w-]+\)\s*\])[^\]\s]*\]/g;
const TW_RAW_MOTION = /(?<![\w-])(?:duration|delay|ease|animate)-\[(?!\s*(?:[a-z-]+:\s*)?var\(--[\w-]+\)\s*\])[^\]\s]*\]|(?<![\w-])\[(?:transition-duration|transition-delay|transition-timing-function|animation):(?!\s*(?:[a-z-]+:\s*)?var\(--[\w-]+\)\s*\])[^\]\s]*\]/g;
const TW_RAW_SPACING = /(?<![\w-])-?(?:scroll-[mp][tblrxyse]?|space-[xy]|inset-[xy]|inset|gap-[xy]|gap|top|bottom|left|right|start|end|[pm][xytblrse]?)-\[(?!\s*(?:[a-z-]+:\s*)?var\(--[\w-]+\)\s*\])[^\]\s]*\]/g;
const TW_RAW_SIZE = /(?<![\w-])-?(?:min-[wh]|max-[wh]|size|basis|[wh])-\[(?!\s*(?:[a-z-]+:\s*)?var\(--[\w-]+\)\s*\])[^\]\s]*\]/g;
const TW_RAW_OPACITY = /(?<![\w-])opacity-\[(?!\s*var\(--[\w-]+\)\s*\])[^\]\s]*\]/g;
const TW_DEAD_TOKEN_FORM = /(?<![\w-])[a-z][\w-]*-\[--[\w-]+\]/g;

const PATTERNS = {
  TW_RAW_RADIUS,
  TW_RAW_SHADOW,
  TW_RAW_LEADING,
  TW_RAW_TRACKING,
  TW_RAW_FONT_WEIGHT,
  TW_RAW_Z_INDEX,
  TW_RAW_MOTION,
  TW_RAW_SPACING,
  TW_RAW_SIZE,
  TW_RAW_OPACITY,
  TW_DEAD_TOKEN_FORM,
};

function offenders(pattern) {
  const found = [];
  for (const file of uiFiles()) {
    blankBlockComments(fs.readFileSync(file, "utf8")).split(/\r?\n/).forEach((line, index) => {
      for (const hit of line.matchAll(pattern)) found.push(`${rel(file)}:${index + 1} → ${hit[0]}`);
    });
  }
  return found;
}

test("regex ทุกตัวของผิว className ต้องเป็นตัวเดียวกับใน audit-ui.mjs", () => {
  for (const [name, pattern] of Object.entries(PATTERNS)) {
    assert.ok(AUDIT.includes(pattern.source), `audit-ui.mjs ไม่มี regex ของ ${name} แล้ว`);
    assert.ok(AUDIT.includes(`const ${name} =`), `audit-ui.mjs ไม่ได้ประกาศ ${name} แล้ว`);
  }
});

/* ── หมวดที่เป็น hard-zero ────────────────────────────────────────────────────
   ทั้งเจ็ดหมวดวัด 2026-09-02 แล้วได้ 0 จุด ⇒ ตั้ง 0 แล้วจบ ไม่ต้องมีเพดานให้ไล่
   ⚠️ ถ้าวันหนึ่งเทสต์นี้แดง **ห้ามเปลี่ยนเป็นเพดาน** — แปลว่ามีคนเพิ่งเขียนจุดแรก
   ซึ่งยังถอนออกได้ถูกกว่าการรับเป็นหนี้ */
const HARD_ZERO = {
  TW_RAW_RADIUS: "ความมนมุม",
  TW_RAW_SHADOW: "เงา",
  TW_RAW_LEADING: "ความสูงบรรทัด",
  TW_RAW_TRACKING: "ระยะห่างตัวอักษร",
  TW_RAW_FONT_WEIGHT: "น้ำหนักตัวอักษร",
  TW_RAW_Z_INDEX: "ชั้นซ้อน",
  TW_RAW_MOTION: "จังหวะ",
  TW_RAW_OPACITY: "ความจาง",
  TW_DEAD_TOKEN_FORM: "รูป -[--token] ที่ตายเงียบ",
};

for (const [name, label] of Object.entries(HARD_ZERO)) {
  test(`${label} ในผิว className ต้องเป็น 0 (${name})`, () => {
    assert.deepEqual(offenders(PATTERNS[name]), [],
      `${label} เขียนเป็นค่าดิบใน className — หยิบขั้นจากโทเคนแล้วเขียนรูป -(--token)`);
  });
}

test("audit:ui มีด่าน hard-zero ของผิว className ครบทุกหมวด", () => {
  for (const list of [
    "tailwindRadiusViolations", "tailwindShadowViolations", "tailwindLeadingViolations",
    "tailwindTrackingViolations", "tailwindFontWeightViolations", "tailwindZIndexViolations",
    "motionSurfaceViolations", "deadTokenFormViolations", "tailwindOpacityViolations",
  ]) {
    assert.match(AUDIT, new RegExp(`\\.\\.\\.${list}\\.map`), `${list} ไม่ได้ต่อเข้า failures`);
  }
});

/* ── หมวดที่เป็นเพดานสองทาง ───────────────────────────────────────────────── */
test("audit:ui มีเพดานระยะห่าง/ขนาดในผิว className และตกทั้งสองทาง", () => {
  for (const [cap, counter] of [
    ["RAW_TAILWIND_SPACING_CAP", "rawTailwindSpacingCount"],
    ["RAW_TAILWIND_SIZE_CAP", "rawTailwindSizeCount"],
  ]) {
    assert.match(AUDIT, new RegExp(`${counter} > ${cap}`), `${cap} ต้องฟ้องตอนเพิ่ม`);
    assert.match(AUDIT, new RegExp(`${counter} < ${cap}`), `${cap} ต้องฟ้องตอนลืมรูดเพดานลง`);
  }
});

/* ── ความจาง: ชื่อขั้นของ Tailwind เป็น *เพดาน* ไม่ใช่ hard-zero ─────────────
   ผิว className ของสเกลอื่นเป็น 0 หมด แต่ของสเกลนี้ยกไม่ได้แบบตาบอด:
   `opacity-70` = 70% ส่วนบันไดของระบบมีสองขั้น (--op-disabled 0.45 · --op-muted 0.55)
   ⇒ ยกเข้าโทเคนแล้ว **หน้าตาเปลี่ยนจริง** ต้องมีคนเปิดหน้าดูก่อน
   (วัดด้วย compile() ของ tailwindcss 4.3.0: `opacity-70` → `opacity: 70%` ·
    `opacity-[var(--op-disabled)]` → `opacity: var(--op-disabled)` = รูปที่ถูก) */
const TW_NAMED_OPACITY = /(?<![\w-])opacity-\d+(?![\w-])/g;

test("regex ความจางชื่อขั้นต้องเป็นตัวเดียวกับใน audit-ui.mjs", () => {
  assert.ok(AUDIT.includes(TW_NAMED_OPACITY.source),
    `audit-ui.mjs ไม่มี regex ตัวนี้แล้ว: ${TW_NAMED_OPACITY.source}`);
  assert.match(AUDIT, /twNamedOpacityCount > TW_NAMED_OPACITY_CAP/, "ต้องฟ้องตอนเพิ่ม");
  assert.match(AUDIT, /twNamedOpacityCount < TW_NAMED_OPACITY_CAP/, "ต้องฟ้องตอนลืมรูดเพดานลง");
});

test("เพดาน TW_NAMED_OPACITY_CAP ยังผูกกับของจริง", () => {
  const cap = Number((AUDIT.match(/const TW_NAMED_OPACITY_CAP = (\d+);/) || [])[1]);
  assert.ok(Number.isFinite(cap), "หา TW_NAMED_OPACITY_CAP ไม่เจอ");
  const found = offenders(TW_NAMED_OPACITY);
  assert.equal(found.length, cap,
    `ของจริงเหลือ ${found.length} แต่เพดานเขียน ${cap} — รูดเพดานลง (ขึ้นไม่ได้)\n${found.join("\n")}`);
});

/* 🪤 รูปที่ถูกต้องต้องไม่ถูกนับเป็นทั้งสองด่าน ไม่งั้นคนที่ยกเข้าโทเคน *ถูกวิธี*
   จะโดนด่านตัวเองฟ้อง แล้วเพดานจะไม่มีวันรูดลงได้ */
test("opacity-[var(--op-…)] ต้องรอดทั้งสองด่าน", () => {
  assert.equal("opacity-[var(--op-disabled)]".match(TW_RAW_OPACITY), null,
    "รูปโทเคนต้องไม่ติด hard-zero");
  assert.equal("opacity-[var(--op-disabled)]".match(TW_NAMED_OPACITY), null,
    "รูปโทเคนต้องไม่ถูกนับเป็นชื่อขั้น");
  assert.ok("opacity-[0.62]".match(TW_RAW_OPACITY), "ค่าดิบในวงเล็บต้องติด hard-zero");
  assert.deepEqual("opacity-70".match(TW_NAMED_OPACITY), ["opacity-70"], "ชื่อขั้นต้องถูกนับ");
});

test("เพดาน RAW_TAILWIND_SPACING_CAP ยังผูกกับของจริง", () => {
  const cap = Number((AUDIT.match(/const RAW_TAILWIND_SPACING_CAP = (\d+);/) || [])[1]);
  assert.ok(Number.isFinite(cap), "หา RAW_TAILWIND_SPACING_CAP ไม่เจอ");
  const found = offenders(TW_RAW_SPACING);
  assert.equal(found.length, cap,
    `ของจริงเหลือ ${found.length} แต่เพดานเขียน ${cap} — รูดเพดานลง (ขึ้นไม่ได้)`);
});

test("เพดาน RAW_TAILWIND_SIZE_CAP ยังผูกกับของจริง", () => {
  const cap = Number((AUDIT.match(/const RAW_TAILWIND_SIZE_CAP = (\d+);/) || [])[1]);
  assert.ok(Number.isFinite(cap), "หา RAW_TAILWIND_SIZE_CAP ไม่เจอ");
  const found = offenders(TW_RAW_SIZE);
  assert.equal(found.length, cap,
    `ของจริงเหลือ ${found.length} แต่เพดานเขียน ${cap} — รูดเพดานลง (ขึ้นไม่ได้)`);
});

/* 🪤 ระยะห่างกับขนาดต้องนับแยกกัน ไม่ใช่ตัวเดียวรวม 45 — `h-[…]` กับ `min-h-[…]`
   เป็นคนละ utility และ regex ที่ใช้ `\b` แทน lookbehind จะนับ min-h/max-w ซ้ำสองรอบ
   (นั่นคือที่มาของเลข 60 ที่เคยนับกันไว้ ทั้งที่ของจริง 32 + 13 = 45)
   เทสต์นี้ล็อกไว้ว่าสองชุดต้องไม่ทับกันเลยสักจุด */
test("ระยะห่างกับขนาดต้องไม่นับซ้ำกัน", () => {
  const spacing = new Set(offenders(TW_RAW_SPACING));
  const overlap = offenders(TW_RAW_SIZE).filter((item) => spacing.has(item));
  assert.deepEqual(overlap, [], "จุดเดียวถูกนับทั้งสองเพดาน — ตรวจ lookbehind ของ regex");
});

/* ── ตัวอย่างที่ต้องจับ / ต้องไม่จับ ──────────────────────────────────────────
   ทุกบรรทัดข้างล่างวัดด้วย `compile()` ของ tailwindcss 4.3.0 (node_modules ของ webapp)
   เมื่อ 2026-09-02 ว่าคายอะไรออกมาจริง — ไม่ได้อ่านจากเอกสาร
   หัวใจคือสามกับดัก: (1) type hint อะไรก็ได้คอมไพล์เหมือนเลขดิบเป๊ะ (2) prefix เดียวกัน
   แปลคนละ property (shadow-[red] = สีของเงา · font-[Arial] = ตระกูล · transition-[…] =
   property ไม่ใช่เวลา) (3) รูป -(--token) และ -[var(--token)] คือรูปที่ถูก ห้ามจับ */
const FIXTURES = {
  TW_RAW_RADIUS: {
    yes: ["rounded-[8px]", "rounded-t-[8px]", "rounded-tl-[.5rem]", "rounded-[50%]", "rounded-[8px_4px]",
      "rounded-[calc(8px+2px)]", "rounded-[8PX]", "rounded-[length:8px]", "rounded-[percentage:50%]",
      "rounded-[bogus:8px]", "[border-radius:8px]", "rounded-[8px]!", "!rounded-[8px]", "md:rounded-[8px]",
      "hover:rounded-b-[8px]", "data-[open=true]:rounded-[8px]", "[&>*]:rounded-[8px]",
      "max-[600px]:rounded-[8px]", "sm:max-md:rounded-[8px]", "rounded-ss-[8px]", "rounded-e-[8px]",
      "rounded-[--radius-lg]"],
    no: ["rounded-[var(--radius-lg)]", "rounded-(--radius-lg)", "rounded-t-(--radius-lg)",
      "rounded-tl-(--radius-lg)", "rounded-[length:var(--radius-lg)]", "rounded-lg", "rounded-full", "rounded"],
  },
  TW_RAW_SHADOW: {
    yes: ["shadow-[0_8px_24px_rgba(0,0,0,.2)]", "shadow-[inset_0_1px_0_#fff]", "shadow-[0_8px_24px_var(--x)]",
      "shadow-[length:0_8px_24px_#000]", "shadow-[any:0_1px_2px_#000]", "inset-shadow-[0_1px_2px_#000]",
      "drop-shadow-[0_1px_2px_#000]", "text-shadow-[0_1px_2px_#000]", "ring-[3px]", "inset-ring-[3px]",
      "ring-offset-[3px]", "[box-shadow:0_8px_24px_#000]", "hover:shadow-[0_1px_2px_#000]"],
    no: ["shadow-(--shadow-float)", "shadow-[var(--shadow-float)]", "shadow-(length:--shadow-card)",
      "inset-shadow-(--x)", "drop-shadow-(--x)", "text-shadow-(--x)", "ring-(length:--x)", "shadow-none",
      "shadow-[red]", "shadow-[#123456]", "shadow-[color:red]", "shadow-(color:--color-brand)", "shadow-brand",
      "drop-shadow-[color:red]", "ring-(--x)", "shadow-lg", "shadow-sm"],
  },
  TW_RAW_LEADING: {
    yes: ["leading-[1.4]", "leading-[20px]", "leading-[length:20px]", "leading-[number:1.4]", "leading-[any:1.4]",
      "leading-[calc(1.31)]", "[line-height:1.4]", "text-[13px]/[1.4]", "text-base/[1.4]", "text-base/7",
      "md:leading-[1.4]", "leading-[--lh-thai]"],
    no: ["leading-[var(--lh-thai)]", "leading-(--lh-thai)", "leading-tight", "leading-none",
      "text-base/tight", "text-base/(--leading-tight)", "text-[13px]/tight", "text-[13px]/[var(--lh-thai)]"],
  },
  TW_RAW_TRACKING: {
    yes: ["tracking-[.02em]", "tracking-[-.01em]", "tracking-[length:.02em]", "tracking-[any:.02em]",
      "[letter-spacing:.02em]", "tracking-[--ls-heading]"],
    no: ["tracking-[var(--ls-heading)]", "tracking-(--ls-heading)", "tracking-wide", "tracking-normal"],
  },
  TW_RAW_FONT_WEIGHT: {
    yes: ["font-[600]", "font-[number:600]", "font-[any:600]", "[font-weight:600]", "md:font-[600]"],
    no: ["font-[var(--fw-bold)]", "font-(--fw-bold)", "font-(number:--fw-bold)", "font-bold",
      "font-[Arial]", "font-[family-name:Arial]", "font-(family-name:--font-sans)", "font-sans", "font-mono"],
  },
  TW_RAW_Z_INDEX: {
    yes: ["z-[999]", "-z-[999]", "z-[999.5]", "z-[integer:999]", "z-[number:999]", "z-[any:999]",
      "z-[calc(999+1)]", "[z-index:999]", "order-[5]", "z-[--z-modal]"],
    no: ["z-[var(--z-modal)]", "z-(--z-modal)", "z-auto", "order-(--z-modal)", "order-first"],
  },
  TW_RAW_MOTION: {
    yes: ["duration-[150ms]", "duration-[.15s]", "duration-[150MS]", "duration-[any:150ms]",
      "duration-[number:150]", "delay-[150ms]", "ease-[cubic-bezier(0,0,.2,1)]",
      "animate-[spin_1s_linear_infinite]", "[transition-duration:150ms]", "motion-safe:duration-[150ms]",
      "duration-[--dur-fast]"],
    no: ["duration-(--dur-fast)", "duration-[var(--dur-fast)]", "delay-(--dur-fast)", "ease-(--ease-out)",
      "ease-[var(--ease-out)]", "animate-(--x)", "transition-[opacity]", "transition-(--x)",
      "transition-discrete", "transition-colors", "animate-spin"],
  },
  TW_RAW_SPACING: {
    yes: ["gap-[14px]", "gap-x-[14px]", "gap-y-[14px]", "p-[14px]", "px-[14px]", "ps-[14px]", "pe-[14px]",
      "m-[14px]", "-m-[14px]", "mb-[9px]", "ms-[14px]", "space-y-[14px]", "-space-y-[14px]", "scroll-mt-[14px]",
      "inset-[14px]", "top-[14px]", "start-[14px]", "gap-[length:14px]", "gap-[percentage:50%]",
      "gap-[any:14px]", "gap-[clamp(8px,2vw,16px)]", "md:gap-[14px]", "gap-[14PX]"],
    no: ["gap-[var(--space-3)]", "gap-(--space-3)", "p-(--space-3)", "m-(--space-3)", "gap-4", "p-2.5",
      "min-h-[var(--ctl-h)]", "max-w-[200px]", "min-w-[120px]", "h-[60px]"],
  },
  TW_RAW_SIZE: {
    yes: ["w-[220px]", "h-[220px]", "size-[220px]", "min-w-[220px]", "min-h-[220px]", "max-w-[200px]",
      "max-w-[70%]", "max-h-[220px]", "basis-[220px]", "w-[50%]", "w-[100vw]", "h-[calc(100vh-40px)]",
      "h-[min(220px,50vh)]", "w-[length:220px]", "w-[any:220px]", "w-[220PX]", "md:w-[220px]"],
    /* 🪤 `min-[600px]:` และ `max-[600px]:` เป็น *variant* (คอมไพล์เป็น media query)
       ไม่ใช่ขนาด — regex ที่เขียน `min-\[` เปล่าจะตีสองตัวนี้เป็นขนาดทันที */
    no: ["w-(--w-panel)", "h-(--w-panel)", "size-(--w-panel)", "min-h-(--ctl-h)", "max-w-(--w-panel)",
      "basis-(--w-panel)", "min-h-[var(--ctl-h)]", "w-full", "w-4", "min-[600px]:flex", "max-[600px]:hidden",
      "gap-[14px]", "mb-[22px]"],
  },
  TW_RAW_OPACITY: {
    yes: ["opacity-[0.62]", "opacity-[.62]", "opacity-[62%]", "hover:opacity-[0.62]"],
    /* `opacity-70` ไม่อยู่ในลิสต์นี้โดยเจตนา — ชื่อขั้นเป็น *เพดาน* คนละด่านกับ hard-zero
       (ดูเทสต์ TW_NAMED_OPACITY_CAP ข้างบน) */
    no: ["opacity-[var(--op-disabled)]", "opacity-[var(--op-muted)]", "opacity-70", "opacity-0"],
  },
  TW_DEAD_TOKEN_FORM: {
    /* รูปนี้คายค่าที่ไม่ใช่ CSS ออกมาแล้วเบราว์เซอร์ทิ้งทั้งบรรทัดเงียบ ๆ —
       `shadow-[--shadow-card]` ไม่ถูกจับที่ด่านเงา (ไม่มีตัวเลขให้แยกจากสี) จึงต้องมี
       ด่านนี้กวาดรูปนั้นให้ทุกหมวดพร้อมกัน */
    yes: ["rounded-[--radius-lg]", "shadow-[--shadow-card]", "gap-[--space-3]", "z-[--z-modal]",
      "text-[--fs-3]", "md:rounded-[--radius-lg]"],
    no: ["rounded-(--radius-lg)", "rounded-[var(--radius-lg)]", "gap-[var(--space-3)]", "gap-(--space-3)",
      "data-[open=true]:flex", "max-[600px]:hidden"],
  },
};

/* 🪤 ไม่มีอะไรบังคับให้ regex ตัวใหม่ต้องมี fixture — เติม PATTERNS แล้วลืม FIXTURES
   จะได้ด่านที่ไม่มีใครพิสูจน์ว่าจับถูกและปล่อยรูปโทเคนถูก ซึ่งเป็นทรงเดียวกับ
   "ข้อยกเว้นที่กลายเป็นสวิตช์ปิด" ที่รีโปนี้เจอมาแล้วสี่รอบ */
test("regex ทุกตัวใน PATTERNS ต้องมี fixture พิสูจน์", () => {
  assert.deepEqual(Object.keys(PATTERNS).sort(), Object.keys(FIXTURES).sort(),
    "PATTERNS กับ FIXTURES ไม่ตรงกัน — regex ที่ไม่มี fixture คือด่านที่ไม่มีใครตรวจ");
});

for (const [name, { yes, no }] of Object.entries(FIXTURES)) {
  test(`${name} จับรูปที่ต้องจับ และปล่อยรูปโทเคน`, () => {
    for (const sample of yes) {
      PATTERNS[name].lastIndex = 0;
      assert.ok(PATTERNS[name].test(sample), `${name} ต้องจับ "${sample}"`);
    }
    for (const sample of no) {
      PATTERNS[name].lastIndex = 0;
      assert.ok(!PATTERNS[name].test(sample), `${name} ห้ามจับ "${sample}" (เป็นรูปที่ถูกหรือคนละสเกล)`);
    }
  });
}

/* ⚠️ ผิวที่สี่ — utility สเกลในตัวของ Tailwind (`gap-2` · `duration-300` · `z-50`)
   เดินผ่านสเกลของ Tailwind เอง ไม่ใช่โทเคนของระบบ · รอบ 2026-09-02 จงใจไม่ตั้งด่านทับ
   (604 จุดของ gap-* คือสำนวนที่คนส่วนใหญ่ใช้ และ `duration-300` ของ layout.js จะแดงทันที)
   เทสต์นี้ไม่ได้ห้ามอะไร — มันล็อกไว้ว่า **ด่านข้างบนไม่ได้ครอบผิวนั้น** เพื่อไม่ให้ใคร
   อ่านเลข 0 แล้วเข้าใจว่าครบ ถ้าวันหนึ่งจะตั้งด่านผิวนั้นจริง ต้องมาลบเทสต์นี้ทิ้งก่อน */
/* ⚠️ ชื่อเทสต์นี้เคยพูดคลุมทั้งหมด แต่ตั้งแต่ 2026-09-05 **ไม่จริงทั้งหมดแล้ว** —
   สามหมวดถูกครอบด้วย *เพดานชื่อขั้น* แยกต่างหาก (TW_NAMED_LEADING · TW_NAMED_TRACKING ·
   TW_NAMED_OPACITY) เพราะขั้นของ Tailwind ไม่ใช่ขั้นของเรา · ที่นี่คุมเฉพาะกลุ่ม
   hard-zero ใน PATTERNS ว่ายังไม่ลามไปจับ utility ในตัวของ Tailwind */
test("ด่าน hard-zero ของผิว className ยังไม่ครอบ utility สเกลในตัวของ Tailwind (จงใจ)", () => {
  for (const sample of ["gap-2", "p-2.5", "duration-300", "z-50", "leading-4", "w-4", "opacity-70"]) {
    for (const pattern of Object.values(PATTERNS)) {
      pattern.lastIndex = 0;
      assert.ok(!pattern.test(sample), `"${sample}" เป็นสเกลของ Tailwind เอง ยังไม่อยู่ในขอบเขตรอบนี้`);
    }
  }
});
