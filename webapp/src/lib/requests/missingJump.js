// ── ปุ่ม "ยังขาด" พาไปถึงช่อง — เลื่อน **หลังของที่อยู่เหนือช่องนิ่งแล้ว** (UAT S4 รอบ 4 ข้อ 9 · รีวิวรอบ 4) ──
//
// ⭐ บล็อกไฟล์แบบ (`#req-required-files`) อยู่ใต้บล็อกสถานที่ของแท็บรายละเอียด — แท็บวาดเฉพาะตอนเปิดอยู่
//    ⇒ กดจากแท็บอื่น = `SurveySiteFields` เกิดใหม่ ลิสต์ไซต์ + ทะเบียนพื้นที่ยังไม่มา (บรรทัด "กำลังโหลด…" บรรทัดเดียว)
//    🐞 เดิมเลื่อนใน `setTimeout(0)` ⇒ ไทล์สถานที่ (สูงสุด 6 ใบ · 2–3 แถวที่ 375px) โผล่ทีหลังเหนือบล็อก ดันบล็อกลง
//       200–500px จนตกขอบล่างของจอมือถือ = อาการ "กดแล้วไม่มีอะไรเกิดขึ้น" ที่ข้อ 9 ตั้งใจแก้ (scroll anchoring ไม่ช่วย —
//       ของที่โตอยู่เหนือจุดยึดในจอ · Safari บน iPhone ไม่มี scroll anchoring เลย)
// ⭐ ตัวนี้แค่ตัดสิน "เลื่อนเมื่อไร" — ไม่แตะ DOM เอง (ผู้เรียกส่ง `scroll`) ⇒ เทสต์ได้โดยไม่มีเบราว์เซอร์
//    · `jump(anchor, { ready })` ถามความพร้อมในจังหวะถัดไป (หลัง React commit แท็บใหม่) — พร้อม = เลื่อนเลย
//    · ยังไม่พร้อม = ค้างไว้จนผู้เรียกบอก `settled()` (โหลดจบ — **ได้หรือพังก็ตาม** · พังแล้วบล็อกก็ไม่ขยับอีก)
//    · 🔴 `apiFetch` ไม่มีเพดานเวลา ⇒ คำขอค้างต้องไม่ทำให้ปุ่มเงียบถาวร: ครบ `wait` แล้วเลื่อนเลย (ทรงเดิมของข้อ 9)
//    · กดใหม่ = ทิ้งของที่ค้าง (เลื่อนไปที่หมายล่าสุดครั้งเดียว) · `cancel()` ตอนคนสลับแท็บเอง — ห้ามกระชากจอทีหลัง

/** รอของเหนือที่หมายได้นานสุดเท่านี้ (ms) — เกินแล้วเลื่อนเลย ไม่ปล่อยให้ปุ่มเงียบ */
export const MISSING_JUMP_WAIT_MS = 2500;

/**
 * @param {object} deps
 * @param {(anchor: string) => void} deps.scroll  เลื่อนไปที่หมาย (ผู้เรียกถือ DOM)
 * @param {number} [deps.wait]                     เพดานการรอ (ms)
 * @param {{ setTimeout: Function, clearTimeout: Function }} [deps.timers]  ตัวจับเวลา (เทสต์ส่งของปลอม)
 */
export function createMissingJump({ scroll, wait = MISSING_JUMP_WAIT_MS, timers = globalThis } = {}) {
  let pending = null; // { anchor, fallback }
  const fire = () => {
    if (!pending) return;
    const { anchor, fallback } = pending;
    pending = null;
    timers.clearTimeout(fallback);
    scroll(anchor);
  };
  const cancel = () => {
    if (!pending) return;
    timers.clearTimeout(pending.fallback);
    pending = null;
  };
  return {
    /** สลับแท็บแล้วจะเลื่อนไป `anchor` · `ready()` = ของเหนือที่หมายนิ่งแล้วหรือยัง (ไม่ส่ง = นิ่งเสมอ) */
    jump(anchor, { ready = () => true } = {}) {
      cancel();
      if (!anchor) return;
      const mine = { anchor, fallback: timers.setTimeout(fire, wait) };
      pending = mine;
      // จังหวะถัดไป — แท็บใหม่ลง DOM แล้ว (idiom เดียวกับปุ่ม "แก้ไข" ของหน้าคำร้อง)
      timers.setTimeout(() => { if (pending === mine && ready()) fire(); }, 0);
    },
    /** ของเหนือที่หมายโหลดจบแล้ว (ได้หรือพัง) — ค้างอยู่ = เลื่อนในจังหวะถัดไป (ให้ไทล์ที่เพิ่งมาลง DOM ก่อน) */
    settled() {
      if (!pending) return;
      const mine = pending;
      timers.setTimeout(() => { if (pending === mine) fire(); }, 0);
    },
    cancel,
  };
}
