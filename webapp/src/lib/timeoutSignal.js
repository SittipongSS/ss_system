/* สัญญาณตัดเวลาที่ **ตัวจับเวลายังยึด event loop ไว้** — ใช้แทน `AbortSignal.timeout()` ตรงที่ "รอของนอกที่อาจค้าง"
 *
 * 🐞 2026-10-01 (PR #1870): `AbortSignal.timeout(ms)` ตั้งตัวจับเวลาแบบ unref — ถ้าสิ่งเดียวที่ค้างอยู่คือ promise
 *    ที่ไม่มีวันจบ (ถัง/Drive ไม่ตอบ) event loop จะว่างแล้ว process จบก่อนสัญญาณยิง · บน Node 22 ของ CI
 *    เทสต์ "ที่เก็บค้างไม่ตอบ" 33 ตัวถูกยกเลิกด้วย "Promise resolution is still pending but the event loop has
 *    already resolved" ทั้งที่ Node 24 ในเครื่องผ่าน · ตัวจับเวลาธรรมดา (ref) ไม่ขึ้นกับรุ่นของ Node
 *
 * ต้องเรียก `clear()` เมื่องานจบ (ใน `finally`) — ไม่งั้นตัวจับเวลาจะยึด process ไว้จนครบเพดาน
 */

/**
 * @param ms เพดานเวลา (ms)
 * @returns `{ signal, clear }` — `signal.reason` เป็น `TimeoutError` แบบเดียวกับ `AbortSignal.timeout()`
 */
export function timeoutSignal(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new DOMException('The operation was aborted due to timeout', 'TimeoutError'));
  }, ms);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}
