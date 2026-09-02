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

/* 📅 2026-09-02 เหลือที่เรียกที่เดียว (เดิม 2): DetailRow ถอด `onKeyDown` ออกจาก <tr>
   พร้อม `role`/`tabIndex` เพราะ `role="link"` ทับ `role="row"` ทิ้ง (ตก 1.3.1) และ
   ทางเข้าของคีย์บอร์ดอยู่ที่ <Link> ในเซลล์อยู่แล้วทุกที่เรียก — วัดเอง 2026-09-02:
   ผู้เรียก 10 จุด · 8 จุดที่เป็นแถวพาไปหน้าอื่นจริงมี <Link> ที่ href เหมือนกันเป๊ะ
   ทุกตัวอักษรในเซลล์แรกครบทั้ง 8 (อีก 2 จุดไม่ใช่แถวพาไปไหน แก้ในคอมมิตเดียวกัน)
   ⇒ เลข 1 ตรงนี้ไม่ใช่ "ลดลงเพราะเลิกสนใจ" · ด่าน ROW_MIRROR ใน scripts/audit-ui.mjs
   บังคับลิงก์ในเซลล์กับทุกที่เรียกแบบ hard-zero แทนแล้ว
   🔒 เทสต์ข้างล่างที่ยืนยันว่า role='link' บน <tr> เองต้องไม่บล็อกการกดแถว **เก็บไว้**
      แม้วันนี้ <tr> ไม่มี role แล้ว — มันกันบั๊กเดิมไหลกลับถ้าใครเผลอใส่ role คืน */
test("DetailRow ต้องส่ง currentTarget เป็นขอบเขตของทางลัดเมาส์", () => {
  const SRC = readFileSync(path.join(process.cwd(), "src", "components", "ui", "DetailRow.js"), "utf8");
  const calls = SRC.match(/isInteractiveTarget\([^)]*\)/g) || [];
  assert.equal(calls.length, 1, "DetailRow ควรเรียกที่เดียว (onClick — ทางลัดของเมาส์)");
  for (const call of calls) {
    assert.match(call, /event\.currentTarget/,
      `${call} ไม่ได้ส่งขอบเขต — แถวจะกดไม่ได้อีกรอบ`);
  }
});

/* 🚫 กันการไหลกลับของท่าที่ถอดไปแล้ว — ไม่ใช่เรื่องรสนิยม: `role`/`tabIndex` บน <tr>
   ทับ `role="row"` ทิ้ง (ตก 1.3.1) และเพิ่ม tab stop แถวละ 1 จุดที่ทำงานซ้ำกับลิงก์
   ที่อยู่ถัดไปแค่ 1 tab · ROLE_ON_TABLE_TAG_CAP เป็น 0 แล้ว เทสต์นี้ฟ้องเร็วกว่า
   และบอกเหตุผลตรงจุดที่คนกำลังแก้ */
test("DetailRow ห้ามคืน role/tabIndex/onKeyDown ขึ้นมาบน <tr>", () => {
  const SRC = readFileSync(path.join(process.cwd(), "src", "components", "ui", "DetailRow.js"), "utf8");
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const banned of ["role=", "tabIndex=", "onKeyDown=", "onKeyUp=", "onKeyPress="]) {
    assert.ok(!code.includes(banned),
      `DetailRow มี ${banned} กลับมาแล้ว — ทางเข้าของคีย์บอร์ดต้องเป็น <Link> ในเซลล์ ไม่ใช่ตัวแถว`);
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
