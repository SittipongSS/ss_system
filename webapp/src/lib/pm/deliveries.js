// ── ของเข้า PM/RM ระดับโครงการ (mig 0176) — logic ล้วน ────────────────────
//
// ⭐ ที่มา (คำขอตั้งต้นของผู้ใช้): "ขอเช็คสถานะติดตามการเข้าของ PM และ RM เพื่อ
// ติดตามกำหนดการผลิต" · ก่อนหน้านี้งานทั่วไปมีแค่ task เดียวในไทม์ไลน์
// "สั่งซื้อสารและบรรจุภัณฑ์ — กำหนดของเข้าทั้งหมด" (45 วัน) ที่**ไม่มีอะไรอยู่ข้างใน**
// → SA ถาม PC ทีไรก็ต้องไล่ถามเป็นรายตัวนอกระบบ (มีของจริงเฉพาะสายสหมิตร)
/* ⚠️ งวด P3b-1 (ยุบโครงการ 16/11/2026): ทางเขียนของเข้า (พาเนลบนหน้าโครงการ · route `api/pm/projects/[id]/deliveries/**`)
   ถูกถอดแล้ว — `material_deliveries` บน prod มี 0 แถว · ไฟล์นี้เหลือแค่ตัวอ่านที่หน้า SO / งานผลิตยังใช้ */

// ── สรุปขึ้นขั้นไทม์ไลน์ (npd-38 / re-order-11) ──────────────────────────
// milestone "สั่งซื้อสารและบรรจุภัณฑ์ — กำหนดของเข้าทั้งหมด" จะได้มีของจริงข้างใน
// แทนที่จะเป็นกล่องเปล่าที่ทุกคนต้องเดาว่าคืบไปแค่ไหน
//
// `late` = ยังไม่มาและเลยกำหนดแล้ว — ตัวเลขที่ SA ต้องเห็นก่อนใคร
export function deliveryRollup(rows = [], todayIso = null) {
  const total = rows.length;
  const arrived = rows.filter((r) => r.arrivedAt).length;
  const open = rows.filter((r) => !r.arrivedAt);
  const late = todayIso
    ? open.filter((r) => r.dueDate && String(r.dueDate) < String(todayIso)).length
    : 0;
  // กำหนดถึงที่ช้าที่สุดของ "ของที่ยังไม่มา" = วันที่เร็วที่สุดที่ผลิตได้จริง
  const dueDates = open.map((r) => r.dueDate).filter(Boolean).sort();
  return {
    total,
    arrived,
    open: open.length,
    late,
    complete: total > 0 && arrived === total,
    lastDue: dueDates.length ? dueDates[dueDates.length - 1] : null,
  };
}

// ── ของเข้าของใบสั่งขายใบหนึ่ง (มติผู้ใช้ 2026-07-29) ────────────────────
// "ติดตามเพื่อสู่การผลิต" — คำถามจริงที่หน้า SO ต้องตอบคือ **ผลิตได้เมื่อไหร่**
// ซึ่งคือ "ของครบเมื่อไหร่" ไม่ใช่ "ของมาถึงกี่ชิ้นแล้ว" เฉย ๆ
//
// ⚠️ แถวที่ยังไม่ผูก SO ถือว่า "ไม่ใช่ของใบนี้" — ไม่เดาให้ เพราะโครงการหนึ่งมี SO
// ได้หลายใบ (re-order) เดาผิดแล้วใบที่ยังไม่พร้อมจะดูเหมือนพร้อมผลิต
export function deliveriesForSalesOrder(rows = [], salesOrderId) {
  if (!salesOrderId) return [];
  return rows.filter((r) => r.salesOrderId === salesOrderId);
}

// พร้อมผลิตหรือยัง + ถ้ายัง ติดที่อะไร → ใช้บนหน้า SO โดยตรง
export function productionReadiness(rows = [], todayIso = null) {
  const sum = deliveryRollup(rows, todayIso);
  if (!sum.total) {
    return { ...sum, state: 'unknown', label: 'ยังไม่มีรายการของเข้า', tone: 'neutral' };
  }
  if (sum.complete) {
    return { ...sum, state: 'ready', label: 'ของครบแล้ว — เริ่มผลิตได้', tone: 'success' };
  }
  if (sum.late) {
    return {
      ...sum,
      state: 'blocked',
      label: `ของยังไม่ครบ · เลยกำหนดแล้ว ${sum.late} รายการ`,
      tone: 'danger',
    };
  }
  return {
    ...sum,
    state: 'waiting',
    label: sum.lastDue ? `รอของ — ครบเมื่อ ${sum.lastDue}` : 'รอของ — ยังไม่มีกำหนด',
    tone: 'warning',
  };
}
