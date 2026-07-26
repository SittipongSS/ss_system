import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { MODULES, METRICS, compareBudget } from "../../../scripts/uiLegacyBudget.mjs";

const root = process.cwd();
const budget = JSON.parse(fs.readFileSync(path.join(root, "scripts", "ui-legacy-budget.json"), "utf8"));

/* 5 โมดูลที่ผู้ใช้ระบุลำดับความสำคัญไว้ (2026-07-26) ต้องมีเพดานของตัวเองเสมอ
   ถ้ามีใครยุบรวมโมดูลเข้า "ส่วนกลาง" เพื่อให้ตัวเลขดูดีขึ้น เทสต์นี้จะจับได้ */
test("ทุกโมดูลที่จัดลำดับไว้มีเพดานชั้นเก่าของตัวเอง", () => {
  for (const key of ["sales", "sahamit", "database", "tax", "mgmt"]) {
    assert.ok(MODULES.some((entry) => entry.key === key), `ไม่มีโมดูล ${key}`);
    for (const metric of METRICS) {
      assert.equal(typeof budget.modules[key]?.[metric], "number", `${key}.${metric} ไม่มีเพดาน`);
    }
  }
});

test("ratchet ฟ้องทั้งตอนตัวเลขขึ้นและตอนลืมรูดเพดานลง", () => {
  const base = Object.fromEntries(
    MODULES.map((entry) => [entry.key, Object.fromEntries(METRICS.map((metric) => [metric, 10]))])
  );
  const cap = { modules: base };

  assert.deepEqual(compareBudget(base, cap), { over: [], under: [] });

  const grown = structuredClone(base);
  grown.sales.legacyTable = 11;
  assert.equal(compareBudget(grown, cap).over.length, 1);

  const shrunk = structuredClone(base);
  shrunk.sales.legacyTable = 9;
  assert.equal(compareBudget(shrunk, cap).under.length, 1);
});

/* เพดานไม่มีค่าติดลบ และไม่มีใครแอบตั้งเป็น Infinity/ตัวเลขมั่ว */
test("ค่าเพดานเป็นจำนวนเต็มไม่ติดลบ", () => {
  for (const { key } of MODULES) {
    for (const metric of METRICS) {
      const value = budget.modules[key][metric];
      assert.ok(Number.isInteger(value) && value >= 0, `${key}.${metric} = ${value}`);
    }
  }
});
