import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const GLOBALS = src("../../app/globals.css");
const AUDIT = src("../../../scripts/audit-ui.mjs");

const tokens = Object.fromEntries(
  [...GLOBALS.matchAll(/--lh-([\w-]+):\s*([0-9.]+);/g)].map((m) => [m[1], Number(m[2])]),
);

/* ตัวที่ใช้กับ "กล่องที่มีข้อความ" — ต่ำกว่า 1.45 เมื่อไหร่ สระบน/วรรณยุกต์ไทยชนขอบ
   ส่วน none/flat/tight ตั้งใจให้ต่ำ เพราะใช้กับตัวเลขล้วน ป้ายนับ และกล่องไอคอน */
const TEXT_TOKENS = ["thai", "text", "relaxed"];
const TIGHT_TOKENS = ["none", "flat", "tight"];
const THAI_MIN = 1.45;

test("มีขั้นความสูงบรรทัดครบและเป็นตัวเลขล้วน", () => {
  assert.deepEqual(Object.keys(tokens).sort(), [...TEXT_TOKENS, ...TIGHT_TOKENS].sort());
  for (const [name, value] of Object.entries(tokens)) {
    assert.ok(Number.isFinite(value) && value >= 0 && value <= 3, `--lh-${name} = ${value}`);
  }
});

/* 🔴 หัวใจของชั้นนี้ (#794 — ผู้ใช้ส่งภาพว่าป้ายชิดขอบ วัดได้เหลือ 0.8px)
   ก่อนหน้านี้กฎ "ข้อความไทยต้อง ≥ 1.45" เป็นแค่คอมเมนต์ที่ก๊อปตามกันไปทีละไฟล์
   ใครลืมก๊อปก็ไม่มีอะไรฟ้อง เทสต์นี้ทำให้มันเป็นของจริง */
test("ขั้นที่ใช้กับข้อความต้อง ≥ 1.45 (สระบน/วรรณยุกต์ไทยยื่นเหนือตัวอักษร)", () => {
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
  const order = ["none", "flat", "tight", "thai", "text", "relaxed"];
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
