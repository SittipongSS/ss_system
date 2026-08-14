import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const GLOBALS = src("../../app/globals.css");
const AUDIT = src("../../../scripts/audit-ui.mjs");

const tokens = Object.fromEntries(
  [...GLOBALS.matchAll(/--lh-([\w-]+):\s*([0-9.]+);/g)].map((m) => [m[1], Number(m[2])]),
);

/* ตัวที่ใช้กับ "กล่องที่มีข้อความ" — ต่ำกว่าเกณฑ์เมื่อไหร่ สระบน/สระล่างไทยชนขอบ
   ส่วน none/flat ตั้งใจให้ต่ำ เพราะใช้กับตัวเลขล้วน ป้ายนับ และกล่องไอคอน

   ⚠️ `tight` (1.2) ถูก **ถอดออกทั้งชั้น** 2026-08-14 — ไล่ดูที่เรียกใช้ทั้ง 19 จุด
   แล้วเป็นข้อความไทยทุกจุด (หัวเรื่อง · ชื่อการ์ด · หมายเหตุ · ค่าในแผงรายละเอียด)
   ยกเว้น `.code-strip-value` ที่เป็น mono ล้วนและย้ายไป `--lh-flat`
   ชื่อที่ความหมายจริงไม่ตรงกับที่ประกาศไว้ = กับดักของคนถัดไป จึงลบทิ้งดีกว่าเก็บไว้ */
const TEXT_TOKENS = ["thai", "text", "relaxed"];
const TIGHT_TOKENS = ["none", "flat"];
const THAI_MIN = 1.65;

test("มีขั้นความสูงบรรทัดครบและเป็นตัวเลขล้วน", () => {
  assert.deepEqual(Object.keys(tokens).sort(), [...TEXT_TOKENS, ...TIGHT_TOKENS].sort());
  for (const [name, value] of Object.entries(tokens)) {
    assert.ok(Number.isFinite(value) && value >= 0 && value <= 3, `--lh-${name} = ${value}`);
  }
});

/* 🔴 หัวใจของชั้นนี้ (#794 — ผู้ใช้ส่งภาพว่าป้ายชิดขอบ วัดได้เหลือ 0.8px)
   ก่อนหน้านี้กฎ "ข้อความไทยต้อง ≥ 1.45" เป็นแค่คอมเมนต์ที่ก๊อปตามกันไปทีละไฟล์
   ใครลืมก๊อปก็ไม่มีอะไรฟ้อง เทสต์นี้ทำให้มันเป็นของจริง */
test("ขั้นที่ใช้กับข้อความต้อง ≥ 1.65 (สระบน/วรรณยุกต์ไทยยื่นเหนือตัวอักษร)", () => {
  for (const name of TEXT_TOKENS) {
    assert.ok(
      tokens[name] >= THAI_MIN,
      `--lh-${name}: ${tokens[name]} ต่ำกว่า ${THAI_MIN} — คำอย่าง "รออนุมัติ" จะชนขอบกล่อง`,
    );
  }
});

test("ขั้นที่ต่ำกว่าเกณฑ์ไทยต้องมีเหตุผลกำกับไว้ในไฟล์", () => {
  for (const name of TIGHT_TOKENS) {
    assert.ok(tokens[name] < THAI_MIN, `--lh-${name} ไม่ต่ำกว่าเกณฑ์แล้ว — ย้ายไป TEXT_TOKENS`);
    /* ชื่อที่อนุญาตให้ต่ำได้ต้องมีคอมเมนต์บอกว่าใช้กับอะไร ไม่งั้นคนถัดไปหยิบไปใช้
       กับข้อความไทยแล้วเจอปัญหาเดิม */
    assert.match(
      GLOBALS,
      new RegExp(`--lh-${name}:[^;]*;\\s*/\\*[^*]+\\*/`),
      `--lh-${name} ต้องมีคอมเมนต์กำกับว่าใช้กับกล่องแบบไหน`,
    );
  }
});

test("ขั้นเรียงจากแน่นไปโปร่ง", () => {
  const order = ["none", "flat", "thai", "text", "relaxed"];
  for (let i = 1; i < order.length; i += 1) {
    assert.ok(
      tokens[order[i - 1]] < tokens[order[i]],
      `--lh-${order[i - 1]} ต้องแน่นกว่า --lh-${order[i]}`,
    );
  }
});

test("audit:ui มีเพดานเลขดิบ และตกทั้งสองทาง", () => {
  assert.match(AUDIT, /RAW_LINE_HEIGHT_CAP/);
  assert.match(AUDIT, /rawLineHeightCount > RAW_LINE_HEIGHT_CAP/, "ต้องฟ้องตอนเพิ่ม");
  assert.match(AUDIT, /rawLineHeightCount < RAW_LINE_HEIGHT_CAP/, "ต้องฟ้องตอนลืมรูดเพดานลง");
});

/* 🔴 **เกณฑ์ที่ทำให้ "ชนขอบ" กลายเป็น "ขาดหายไป"**

   เดิมตั้งไว้ 1.31em โดยวัดจากคำที่มี *เฉพาะสระล่าง* ("ผู้ดูแลระบบ") — วัดใหม่
   2026-08-14 แยกสองฝั่งบน Sarabun ด้วย canvas `actualBoundingBox*`:

     สระบนสูงสุด  1.250em  ("เชื้อเพลิงที่ใช้")   ← ฝั่งที่รอบก่อน ๆ ไม่ได้วัด
     สระล่างลึกสุด 0.332em  ("ผู้ปฏิบัติหน้าที่")
     รวม          1.582em  ⇐ ระยะบรรทัดขั้นต่ำที่หมึกสองบรรทัดไม่แตะกัน

   ⚠️ กล่องฟอนต์ที่ Sarabun ประกาศคือ **ขึ้น 1.083em / ลง 0.25em** ซึ่งแคบกว่าหมึกจริง
   ทั้งสองฝั่ง — เบราว์เซอร์จัดบรรทัดตามกล่องที่ประกาศ ไม่ใช่ตามหมึก จึงล้นทั้งบนและล่าง
   **ฝั่งบนล้นมากกว่า** (0.167em vs 0.082em) ซึ่งอธิบายว่าทำไมการไล่เติม
   `padding-bottom` (`--ctl-text-sink`) 3 รอบถึงไม่ทำให้รอยขาดขอบบนขยับเลย

   เคสจริง: `.account-menu-identity` ตั้งขั้นแคบไว้ที่ตัวแม่ แล้วสองบรรทัดลูก
   (`.user-name` · `.topbar-user-role`) มี `overflow: hidden` ของตัวเองเพื่อทำ ellipsis
   ⇒ สระล่างของ "ผู้ดูแลระบบ" ขาด (ผู้ใช้ส่งภาพมา) · ชื่อภาษาอังกฤษไม่เห็นอาการ

   ⚠️ **ตัวที่ตัดคือ *ลูก* แต่ตัวที่ตั้งค่าแคบคือ *แม่*** — เทสต์แบบดูบล็อกเดียว
   จับไม่ได้ จึงล็อกสองชั้น: ชั้นแรกคือกฎที่จับคู่กันในบล็อกเดียว (ดักรูปแบบตรงไปตรงมา)
   ชั้นสองคือตรึงบล็อกที่เคยพลาดไว้ตรง ๆ */
const THAI_INK_EM = 1.582;

test("บล็อกที่ตัดข้อความ (overflow/line-clamp) ต้องไม่ใช้ความสูงบรรทัดต่ำกว่าหมึกไทย", () => {
  const offenders = [];
  for (const block of GLOBALS.replace(/\/\*[\s\S]*?\*\//g, "").split("}")) {
    const brace = block.indexOf("{");
    if (brace === -1) continue;
    const body = block.slice(brace + 1);
    const token = body.match(/line-height:\s*var\(--lh-([\w-]+)\)/);
    if (!token) continue;
    if (!/overflow:\s*(hidden|clip)|line-clamp/.test(body)) continue;
    if (tokens[token[1]] >= THAI_INK_EM) continue;
    offenders.push(`${block.slice(0, brace).trim().replace(/\s+/g, " ")} → --lh-${token[1]}`);
  }
  assert.deepEqual(offenders, [],
    `กล่องที่ตัดข้อความต้องมีกล่องบรรทัด ≥ ${THAI_INK_EM}em ไม่งั้นสระไทยขาด`);
});

test("พิลผู้ใช้บนแถบระบบใช้ความสูงบรรทัดระดับข้อความ (สระล่างไม่ขาด)", () => {
  const block = GLOBALS.match(/\.account-menu-identity \{([^}]*)\}/);
  assert.ok(block, "หา .account-menu-identity ไม่เจอ");
  const hit = block[1].match(/line-height:\s*var\(--lh-([\w-]+)\)/);
  assert.ok(hit, "ต้องหยิบขั้นจากโทเคน ไม่ใช่เลขดิบ");
  assert.ok(tokens[hit[1]] >= THAI_MIN,
    `ใช้ --lh-${hit[1]} (${tokens[hit[1]]}) — บรรทัด "ผู้ดูแลระบบ" จะถูก overflow ของตัวเองตัดสระล่าง`);
});

/* กล่องที่ห่อข้อความไทยแน่น ๆ (ป้าย/ชิป) ต้องไม่กลับไปใช้ค่าต่ำ — เคสที่ผู้ใช้เจอจริง */
test("ป้ายสถานะยังใช้ความสูงบรรทัดระดับข้อความ", () => {
  const badge = src("./Badge.module.css");
  const hit = badge.match(/line-height:\s*var\(--lh-([\w-]+)\)/);
  assert.ok(hit, "Badge ต้องหยิบขั้นจากโทเคน ไม่ใช่เลขดิบ");
  assert.ok(
    tokens[hit[1]] >= THAI_MIN,
    `Badge ใช้ --lh-${hit[1]} (${tokens[hit[1]]}) ต่ำกว่าเกณฑ์ไทย — นี่คือบั๊กที่ #794 แก้ไป`,
  );
});
