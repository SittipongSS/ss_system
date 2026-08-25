import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_MIN_GAP_MS, shouldRevalidate } from "./revalidateSignal.js";

/* ── ตัวตัดสิน "ควรดึงของใหม่ไหม" ตอนกลับมามองแท็บ ────────────────────────
 * เทสต์พฤติกรรมจริง ไม่ใช่จับตัวหนังสือ — ตัวตัดสินแยกออกมาเป็นฟังก์ชันล้วนก็เพื่อข้อนี้
 */

const GAP = DEFAULT_MIN_GAP_MS;

test("แท็บซ่อนอยู่ = ไม่ยิงเด็ดขาด แม้จะทิ้งไว้นานแค่ไหน", () => {
  assert.equal(shouldRevalidate("hidden", 0, 60 * 60 * 1000), false);
  assert.equal(shouldRevalidate("prerender", 0, 60 * 60 * 1000), false);
});

test("กลับมามองหลังทิ้งไว้นาน = ยิง", () => {
  assert.equal(shouldRevalidate("visible", 0, GAP), true);
  assert.equal(shouldRevalidate("visible", 0, GAP * 10), true);
});

test("สลับแท็บกลับมาถี่ ๆ = ยิงรอบเดียว ที่เหลือติดคอกกั้น", () => {
  assert.equal(shouldRevalidate("visible", 0, GAP - 1), false);
  assert.equal(shouldRevalidate("visible", 0, 1_000), false);
  assert.equal(shouldRevalidate("visible", 0, 0), false, "เพิ่งโหลดไปเดี๋ยวนี้ ไม่ต้องยิงซ้ำ");
});

/* 🪤 `visibilitychange` กับ `focus` เด้ง **พร้อมกัน** ตอนคลิกกลับเข้าแท็บ — ถ้าไม่มี
   คอกกั้น ทุกครั้งที่สลับกลับมาจะยิงสองรอบซ้อน (ทั้งคู่ผ่านเงื่อนไข visible เหมือนกัน) */
test("สองสัญญาณที่เด้งพร้อมกันต้องกลายเป็นการยิงครั้งเดียว", () => {
  let lastAt = 0;
  const now = GAP + 5;
  const first = shouldRevalidate("visible", lastAt, now);
  if (first) lastAt = now;                       // ผู้เรียกต้องประทับเวลาทันทีที่ยิง
  const second = shouldRevalidate("visible", lastAt, now);
  assert.equal(first, true);
  assert.equal(second, false, "สัญญาณที่สองในมิลลิวินาทีเดียวกันต้องตกคอกกั้น");
});

test("ปรับคอกกั้นเองได้ — หน้าที่อยากสดกว่าใช้ค่าสั้นลงได้", () => {
  assert.equal(shouldRevalidate("visible", 0, 5_000, 3_000), true);
  assert.equal(shouldRevalidate("visible", 0, 2_999, 3_000), false);
});

test("ค่าตั้งต้นอยู่ในช่วงที่ตั้งใจ — ไม่ถี่จนเปลืองและไม่ห่างจนไร้ประโยชน์", () => {
  assert.ok(DEFAULT_MIN_GAP_MS >= 15_000 && DEFAULT_MIN_GAP_MS <= 60_000,
    `ค่าตั้งต้นควรอยู่ 15–60 วินาที (ได้ ${DEFAULT_MIN_GAP_MS})`);
});
