import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { THREAD_POLL_FAST_MS, threadPollDelay, threadSignature } from "./threadPollSchedule.js";

/* ── จังหวะดึงของเธรด ─────────────────────────────────────────────────────
 * เหตุผลของงานนี้: เธรดดึงทุก 45 วินาทีตายตัว ⇒ เปิดหน้ารายละเอียดค้างไว้ทั้งวัน
 * จ่าย ~640 invocation/วัน/แท็บ ซึ่งกลืนที่ประหยัดได้จากการหยุดโพลตอนแท็บซ่อน
 */

test("เพิ่งมีความเคลื่อนไหว = ถี่เท่าเดิม ไม่ทำให้บทสนทนาสะดุด", () => {
  assert.equal(threadPollDelay(0), THREAD_POLL_FAST_MS);
  assert.equal(threadPollDelay(3), THREAD_POLL_FAST_MS, "3 นาทีแรกที่เงียบยังถือว่ากำลังคุยกันอยู่");
});

test("เงียบนานขึ้น = ห่างขึ้นเป็นขั้น และมีเพดาน", () => {
  assert.ok(threadPollDelay(4) > THREAD_POLL_FAST_MS);
  assert.ok(threadPollDelay(8) > threadPollDelay(4));
  assert.equal(threadPollDelay(50), threadPollDelay(8), "ต้องมีเพดาน ไม่ห่างออกไปเรื่อย ๆ");
  assert.ok(threadPollDelay(1000) <= 180_000, "เพดานต้องไม่เกิน 3 นาที — นานกว่านี้เธรดจะรู้สึกตาย");
});

test("จังหวะต้องไม่ถอยลงเลยสักขั้น", () => {
  let prev = 0;
  for (let q = 0; q <= 20; q += 1) {
    const d = threadPollDelay(q);
    assert.ok(d >= prev, `รอบที่ ${q} ถอยกลับมาถี่ขึ้นเอง (${prev} → ${d})`);
    prev = d;
  }
});

test("ตอนเงียบยาว ต้องประหยัดจริงอย่างน้อยครึ่งหนึ่ง", () => {
  const perHourBefore = 3_600_000 / THREAD_POLL_FAST_MS;      // 80
  const perHourAfter = 3_600_000 / threadPollDelay(50);       // 20
  assert.ok(perHourAfter <= perHourBefore / 2,
    `ต้องลดอย่างน้อยครึ่ง (ก่อน ${perHourBefore}/ชม. หลัง ${perHourAfter}/ชม.)`);
});

/* 🪤 ลบข้อความกลางเธรดทิ้ง แล้ว id ตัวท้ายยังเท่าเดิม — ถ้าลายเซ็นดูแค่ตัวท้าย
   จะนับว่า "เงียบ" ทั้งที่เธรดเปลี่ยนไปแล้ว แล้วจังหวะจะถอยออกทั้งที่ควรไว */
test("ลายเซ็นต้องจับทั้งการเพิ่มและการลบ", () => {
  const a = [{ id: "u1" }, { id: "u2" }, { id: "u3" }];
  assert.notEqual(threadSignature(a), threadSignature([...a, { id: "u4" }]), "มีข้อความใหม่");
  assert.notEqual(threadSignature(a), threadSignature([{ id: "u1" }, { id: "u3" }]),
    "ลบข้อความกลางเธรด — id ตัวท้ายเท่าเดิมแต่ต้องนับว่าเปลี่ยน");
  assert.equal(threadSignature(a), threadSignature([...a]), "ไม่มีอะไรเปลี่ยน = ลายเซ็นเดิม");
});

test("เธรดว่าง/ค่าพัง ต้องได้ลายเซ็นที่ยังเทียบกันได้ ไม่ใช่ระเบิด", () => {
  assert.equal(typeof threadSignature([]), "string");
  assert.equal(typeof threadSignature(null), "string");
  assert.equal(threadSignature([]), threadSignature(undefined));
});

/* ── ฝั่งที่เอาไปใช้จริง ─────────────────────────────────────────────────── */

const thread = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "..", "components", "updates", "UpdateThread.js"),
  "utf8",
);

test("เธรดต้องใช้ timeout ต่อเนื่อง ไม่ใช่ interval คงที่", () => {
  /* `setInterval` ล็อกระยะไว้ตั้งแต่ตอนตั้ง ⇒ การถอยจังหวะจะไม่มีผลเลย */
  assert.doesNotMatch(thread, /setInterval\(/, "กลับไปใช้ setInterval = การถอยจังหวะตายทันที");
  assert.match(thread, /setTimeout\(\(\) => \{ tick\(\); schedule\(\); \}, threadPollDelay\(/);
  assert.match(thread, /clearTimeout\(timer\)/, "ต้องเก็บกวาดตอน unmount");
});

test("กลับมามองแท็บ = รีเซ็ตให้ไวเหมือนเดิม", () => {
  assert.match(thread, /quietRounds\.current = 0;/,
    "ไม่รีเซ็ต = คนที่เพิ่งกลับมาต้องรอถึง 3 นาทีกว่าจะเห็นของใหม่");
  assert.match(thread, /addEventListener\("visibilitychange", onReturn\)/);
});

test("ยังต้องไม่ยิงตอนแท็บซ่อน (กติกาเดิมห้ามหาย)", () => {
  assert.match(thread, /document\.visibilityState !== "visible"/);
});
