/* สัญญาของกล่องคำอธิบายลอย — ตรึงสิ่งที่พังเงียบได้ ไม่ใช่ตรึงหน้าตา
   (หน้าตาอ่านจาก Tooltip.module.css ได้ตรง ๆ อยู่แล้ว) */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const TOOLTIP = source("./Tooltip.js");
const TOOLTIP_CSS = source("./Tooltip.module.css");
const STEP_TRACK = source("./StepTrack.js");
const GLOBALS = source("../../app/globals.css");

test("Tooltip portal ไป body และลอยเหนือทุกชั้น", () => {
  /* เซลล์ตารางมีเพดานความกว้าง + overflow: hidden ⇒ วาดในที่ตั้งเดิม = ถูกตัดครึ่งใบ */
  assert.match(TOOLTIP, /createPortal\(/);
  assert.match(TOOLTIP, /document\.body/);
  assert.match(TOOLTIP_CSS, /z-index: var\(--z-portal-tooltip\)/);
  assert.match(GLOBALS, /--z-portal-tooltip: (\d+);/);
  const value = Number(GLOBALS.match(/--z-portal-tooltip: (\d+);/)[1]);
  const menu = Number(GLOBALS.match(/--z-portal-menu: (\d+);/)[1]);
  assert.ok(value > menu, "ชี้ปุ่มในเมนูที่ portal ออกไปแล้วต้องยังอ่านคำอธิบายได้");
});

test("Tooltip ใช้พื้นผิวแผงลอยกลาง ไม่ใช่ --panel เปล่า", () => {
  /* กฎเดียวกับ audit-ui: พื้นโปร่ง 8% พอให้ตัวอักษรข้างหลังลอดขึ้นมาปน */
  assert.match(TOOLTIP_CSS, /background: var\(--panel-float\)/);
  assert.doesNotMatch(TOOLTIP_CSS, /background: var\(--panel\)/);
  /* ชี้โดนกล่องเองแล้วตัวที่ชี้อยู่ได้ mouseleave = กะพริบไม่จบ */
  assert.match(TOOLTIP_CSS, /pointer-events: none/);
});

test("Tooltip วางกล่องใหม่เมื่อขนาดเปลี่ยน ไม่ใช่วัดครั้งเดียวจบ", () => {
  /* 🐞 ครั้งแรกที่ชี้ CSS ของโมดูลยังมาไม่ทัน กล่องถูกวัดตอนยังไม่มี padding
     แล้วค้างเยื้องซ้าย 75px — ฟอนต์ที่มาช้าก็อาการเดียวกัน */
  assert.match(TOOLTIP, /new ResizeObserver\(place\)/);
  /* พิกัดเพี้ยนทันทีที่หน้าเลื่อน ⇒ ปิดทิ้ง · ตัวที่เลื่อนคือกรอบตาราง ต้องดักแบบ capture */
  assert.match(TOOLTIP, /addEventListener\("scroll", hide, true\)/);
});

test("StepTrack เลิกใช้ title ของเบราว์เซอร์แล้ว", () => {
  /* กล่องของ OS ไม่ใช่ดีไซน์ของระบบ (มติผู้ใช้ 2026-08-24) — ธีมมืดยังได้กล่องขาว */
  assert.doesNotMatch(STEP_TRACK, /title=\{/);
  assert.match(STEP_TRACK, /<Tooltip/);
});
