import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { isExemptFiling, untaxedFilingItems } from "./exciseBilling.js";
import { stampExemptFlags } from "./orders.js";

/* 🔴 ตรวจระบบ 2026-10-26 — "ยอดภาษี 0" เคยถูกอ่านเป็น "ยกเว้นภาษี" ทุกจอ ⇒ ใบที่สินค้ายังไม่มีราคาขายปลีก
   วิ่งเข้าทางลัดของใบยกเว้น: ข้ามใบเสร็จ S&S · ข้ามขั้น "กำลังยื่น" · ปิดงานโดยไม่มีใบเสร็จสรรพสามิต
   ยกเว้นจริง = ทุกรายการผูกทะเบียนที่ฝ่าย RA ตัดสินว่าไม่เสียภาษี และยอดเป็น 0 จริง */
const exemptReg = { id: "R-EX", isExciseTaxable: false };
const taxedReg = { id: "R-TX", isExciseTaxable: true };
const item = (over) => ({ id: "I-1", quantity: 10, totalTax: 0, registrationId: null, registration: null, ...over });

test("ยอด 0 เพราะสินค้าไม่มีราคาขายปลีก ไม่ใช่ใบยกเว้น — ทั้งที่มีทะเบียนและไม่มี", () => {
  assert.equal(isExemptFiling({ totalTax: 0, items: [item({})] }), false, "รายการจาก SO ที่ยังไม่มีทะเบียน");
  assert.equal(isExemptFiling({ totalTax: 0, items: [item({ registrationId: "R-TX", registration: taxedReg })] }), false);
});

test("ทุกรายการผูกทะเบียนที่ RA ยกเว้น + ยอด 0 = ยกเว้น", () => {
  assert.equal(isExemptFiling({
    totalTax: 0,
    items: [item({ registrationId: "R-EX", registration: exemptReg }), item({ id: "I-2", registrationId: "R-EX", registration: exemptReg })],
  }), true);
});

test("ปนกันแม้แต่รายการเดียว = ไม่ยกเว้น · ทะเบียนยกเว้นแต่ยอดไม่ 0 ก็ไม่ยกเว้น (ต้องเก็บตามยอด)", () => {
  assert.equal(isExemptFiling({
    totalTax: 0,
    items: [item({ registrationId: "R-EX", registration: exemptReg }), item({ id: "I-2", registrationId: "R-TX", registration: taxedReg })],
  }), false);
  assert.equal(isExemptFiling({ totalTax: 88, items: [item({ totalTax: 88, registrationId: "R-EX", registration: exemptReg })] }), false);
});

test("ไม่มีรายการ / ไม่มีใบ = ไม่ยกเว้น · แถว slim (ไม่มี items) อ่านธงที่ server คิดมา", () => {
  assert.equal(isExemptFiling(null), false);
  assert.equal(isExemptFiling({ totalTax: 0, items: [] }), false);
  assert.equal(isExemptFiling({ totalTax: 0, itemCount: 2 }), false, "ไม่มีธง = ไม่ยกเว้น ไม่ใช่ตกไปดูยอด 0");
  assert.equal(isExemptFiling({ totalTax: 0, itemCount: 2, taxExempt: true }), true);
});

test("untaxedFilingItems: รายการภาษี 0 ที่ไม่ได้รับยกเว้น — ไม่นับรายการยกเว้น/มีภาษี/จำนวน 0", () => {
  const rows = untaxedFilingItems({
    items: [
      item({ id: "A" }),
      item({ id: "B", registrationId: "R-TX", registration: taxedReg }),
      item({ id: "C", registrationId: "R-EX", registration: exemptReg }),
      item({ id: "D", totalTax: 8.8 }),
      item({ id: "E", quantity: 0 }),
    ],
  });
  assert.deepEqual(rows.map((row) => row.id), ["A", "B"]);
  assert.deepEqual(untaxedFilingItems(null), []);
});

/* ตัวจำลอง supabase: บันทึกทุกคำขอ แล้วตอบแถวทะเบียนที่ตรง id — ไม่ต่อฐานจริง */
function fakeSupabase(registrations) {
  const calls = [];
  return {
    calls,
    from(table) {
      const call = { table };
      calls.push(call);
      const builder = {
        select(cols) { call.select = cols; return builder; },
        in(col, ids) { call.in = [col, ids]; return builder; },
        limit(n) { call.limit = n; return builder; },
        then(resolve, reject) {
          const ids = new Set(call.in?.[1] || []);
          return Promise.resolve({ data: registrations.filter((r) => ids.has(r.id)), error: null }).then(resolve, reject);
        },
      };
      return builder;
    },
  };
}

test("stampExemptFlags: แถว slim ได้ธงจากกฎตัวเดียวกัน · อ่านทะเบียนเฉพาะใบยอด 0", async () => {
  const supabase = fakeSupabase([exemptReg, taxedReg]);
  const rows = await stampExemptFlags(supabase, [
    { id: "O-EX", totalTax: 0, items: [{ registrationId: "R-EX", totalTax: 0, quantity: 1 }] },
    { id: "O-NOBASE", totalTax: 0, items: [{ registrationId: null, totalTax: 0, quantity: 5 }] },
    { id: "O-TAXREG", totalTax: 0, items: [{ registrationId: "R-TX", totalTax: 0, quantity: 5 }] },
    { id: "O-PAID", totalTax: 88, items: [{ registrationId: "R-PAID", totalTax: 88, quantity: 10 }] },
  ]);
  assert.deepEqual(rows.map((r) => [r.id, r.taxExempt]), [
    ["O-EX", true], ["O-NOBASE", false], ["O-TAXREG", false], ["O-PAID", false],
  ]);
  assert.equal(supabase.calls.length, 1);
  assert.deepEqual(supabase.calls[0].in[1].sort(), ["R-EX", "R-TX"], "ใบที่มียอดไม่มีทางยกเว้น — ไม่ต้องอ่านทะเบียนของมัน");
  assert.equal(supabase.calls[0].limit, 2);
});

test("stampExemptFlags: ไม่มีใบยอด 0 = ไม่ยิงคำขอเลย", async () => {
  const supabase = fakeSupabase([]);
  const rows = await stampExemptFlags(supabase, [{ id: "O-1", totalTax: 10, items: [{ registrationId: "R-1", totalTax: 10, quantity: 1 }] }]);
  assert.equal(rows[0].taxExempt, false);
  assert.equal(supabase.calls.length, 0);
});

/* 🔴 ยามกันไหลกลับ — ห้ามมีจอ/route ไหนตัดสิน "ยกเว้น" จากยอด 0 อีก (ให้เรียก isExemptFiling)
   รูปที่เคยมีจริง 9 จุด: `(o.totalTax || 0) === 0` · `(order?.totalTax || 0) === 0` · `totalTax === 0` */
const SRC = fileURLToPath(new URL("../..", import.meta.url));
function* sourceFiles(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* sourceFiles(path);
    else if (/\.(js|jsx|mjs)$/.test(name) && !/\.test\.mjs$/.test(name)) yield path;
  }
}
test("ไม่มีโค้ดตัดสินจากยอดภาษี === 0 (นอกคอมเมนต์)", () => {
  const offenders = [];
  for (const path of sourceFiles(SRC)) {
    readFileSync(path, "utf8").split("\n").forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, "");
      if (/totalTax\s*(\|\|\s*0\s*\))?\s*===\s*0\b/.test(code)) offenders.push(`${relative(SRC, path)}:${i + 1}`);
    });
  }
  assert.deepEqual(offenders, []);
});
