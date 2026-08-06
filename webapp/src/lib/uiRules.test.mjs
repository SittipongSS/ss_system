import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ENTITY_SELECT_RULES, isInteractiveTarget, searchableForEntity } from "./uiRules.js";

/* 🐞 บั๊กที่เทสต์ชุดนี้เกิดมาเพื่อกัน: `DetailRow` ใส่ `role="link"` บน <tr> เอง แล้ว
   `isInteractiveTarget` ไล่ closest() ขึ้นไปเจอ <tr> ตัวนั้น → คืน true ทุกครั้ง →
   `!isInteractiveTarget(...)` เป็นเท็จเสมอ → คลิกแถว/กด Enter ไม่ทำงานเลยทุกหน้า
   (ดีล · โครงการ · ใบเสนอราคา · Sale Order · ลีด) และไม่มีอะไรฟ้อง เพราะ "ไม่มีอะไร
   เกิดขึ้น" ไม่ใช่ error */

/* DOM จำลองเท่าที่ฟังก์ชันนี้ใช้ — ต้องการแค่ closest() ที่ไล่ขึ้นตาม parent */
function el(tag, attrs = {}, parent = null) {
  const node = {
    tag, attrs, parent,
    matches(sel) {
      return sel.split(",").map((s) => s.trim()).some((s) => {
        if (s === this.tag) return true;
        const roleMatch = s.match(/^\[role='(.+)'\]$/);
        if (roleMatch) return this.attrs.role === roleMatch[1];
        if (s === "[data-no-row-navigation]") return "data-no-row-navigation" in this.attrs;
        return false;
      });
    },
    closest(sel) {
      let cur = this;
      while (cur) { if (cur.matches(sel)) return cur; cur = cur.parent; }
      return null;
    },
  };
  return node;
}

const row = el("tr", { role: "link" });
const cell = el("td", {}, row);
const button = el("button", {}, cell);
const plainText = el("span", {}, cell);

test("กดพื้นที่ว่างในแถว = ไม่ใช่ตัวควบคุม แถวต้องพาไปต่อได้", () => {
  assert.equal(isInteractiveTarget(plainText, row), false);
  assert.equal(isInteractiveTarget(cell, row), false);
});

test("แถวตัวเองไม่นับเป็นตัวควบคุมข้างใน (นี่คือบั๊กตัวจริง)", () => {
  assert.equal(isInteractiveTarget(row, row), false,
    "role='link' บน <tr> เองต้องไม่บล็อกการกดแถว");
  assert.equal(isInteractiveTarget(row), true,
    "ไม่ส่ง boundary = พฤติกรรมเดิม (ยังมีคนเรียกแบบเก่าได้)");
});

test("ปุ่ม/ลิงก์ข้างในแถวยังกันการพาไปต่อได้เหมือนเดิม", () => {
  assert.equal(isInteractiveTarget(button, row), true);
  const link = el("a", {}, cell);
  assert.equal(isInteractiveTarget(link, row), true);
  const optOut = el("div", { "data-no-row-navigation": "" }, cell);
  assert.equal(isInteractiveTarget(optOut, row), true);
});

test("DetailRow ต้องส่ง currentTarget เป็นขอบเขตทั้งคลิกและคีย์บอร์ด", () => {
  const SRC = readFileSync(path.join(process.cwd(), "src", "components", "ui", "DetailRow.js"), "utf8");
  const calls = SRC.match(/isInteractiveTarget\([^)]*\)/g) || [];
  assert.equal(calls.length, 2, "DetailRow ควรเรียก 2 ที่ (onClick + onKeyDown)");
  for (const call of calls) {
    assert.match(call, /event\.currentTarget/,
      `${call} ไม่ได้ส่งขอบเขต — แถวจะกดไม่ได้อีกรอบ`);
  }
});

test("entity selector rules are consistent across the system", () => {
  assert.equal(ENTITY_SELECT_RULES.customer.searchable, true);
  assert.equal(ENTITY_SELECT_RULES.product.searchable, true);
  assert.equal(ENTITY_SELECT_RULES.brand.searchable, false);
  assert.equal(ENTITY_SELECT_RULES.mainCategory.searchable, true);
  assert.equal(ENTITY_SELECT_RULES.subCategory.searchable, true);
  // โครงการ/ดีล ค้นได้เสมอ — ฟอร์มไหนเผลอส่ง searchable={false} มาก็ต้องไม่ชนะกฎนี้
  assert.equal(ENTITY_SELECT_RULES.project.searchable, true);
  assert.equal(ENTITY_SELECT_RULES.deal.searchable, true);
  assert.equal(searchableForEntity("project", false), true);
  assert.equal(searchableForEntity("deal", false), true);
  assert.equal(searchableForEntity("customer", false), true);
  assert.equal(searchableForEntity("brand", true), false);
  assert.equal(searchableForEntity("phase", true), true);
});
