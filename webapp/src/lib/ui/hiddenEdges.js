/* ── ฝั่งที่กล่องเลื่อนแนวนอนยังซ่อนเนื้ออยู่ (TableScroll `edgeHint` · UAT FN 27/10 ข้อ 6) ──────────────────────────
   ตรรกะล้วน (ไม่มี DOM) — แยกจาก hook เพื่อเทสต์ได้
   ⭐ "start" = เลื่อนไปจากซ้ายแล้ว มีของซ่อนทางซ้าย · "end" = ยังมีของซ่อนทางขวา · ว่าง = ไม่ล้น/ไม่มีอะไรซ่อน
   ⚠️ ทน 1px ของการปัดเศษ subpixel (ตารางกว้างเท่ากล่องพอดีมัก scrollWidth − clientWidth = 1) · `scrollLeft` ติดลบได้ใน RTL ⇒ ใช้ค่าสัมบูรณ์ */
export function hiddenEdges({ scrollLeft = 0, scrollWidth = 0, clientWidth = 0 } = {}) {
  const max = scrollWidth - clientWidth;
  if (!(max > 1)) return '';
  const left = Math.abs(scrollLeft);
  return [left > 1 && 'start', max - left > 1 && 'end'].filter(Boolean).join(' ');
}
