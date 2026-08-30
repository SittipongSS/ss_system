// ── งวดชำระครอบช่วงบริการไหน + ค่า "จ่ายถึง" (mig 0320) ─────────────────────
//
// ⭐ **มติผู้ใช้ 2026-08-30**: *"จ่ายก่อนบริการเสมอ ถ้าไม่จ่าย TS เอาลงคิวไม่ได้"*
//   (docs/service-contract-phase-plan.md §0 ข้อ 1 · §3.2)
//
// ทั้งเส้นบริการห้อยอยู่กับค่าเดียว — **paidThrough = เงินที่รับแล้วครอบบริการถึงวันไหน**
// ด่านเข้าไซต์ (PR-C) เอาไปตัดสินว่านัดวันนั้นลงคิวได้ไหม ⇒ ที่นี่คือ**ตัวตัดสินเดียว**
// ของทั้งระบบ ห้ามคิดเงื่อนไขนี้ซ้ำที่จอไหนอีก (กติกาเดียวกับ `visitGate`/`termIsActive`)
//
// ⚠️ **`reported` ไม่นับ — นับเมื่อ `confirmed` เท่านั้น** (กติกาเดิมของ mig 0245)
//   งวดที่ SA กดว่าลูกค้าจ่ายแล้วแต่บัญชียังไม่รับรอง ไม่ขยับ "จ่ายถึง" แม้แต่วันเดียว
//   ไม่งั้น SA แจ้งเองปลดด่านเอง = เท่ากับไม่มีด่าน
//
// ⚠️ **ไม่อ่านนาฬิกาในไฟล์นี้** — ทุกฟังก์ชันที่ต้องรู้ "วันนี้" รับ `todayIso` เข้ามา
//   ผู้เรียกส่ง `businessDate()` (นาฬิกาไทย) เสมอ · เหตุผล: อ่านนาฬิกาตอนเรนเดอร์แล้ว
//   จอกับ server ตอบคนละวันได้ และเทสต์กลายเป็นของที่พังเองตอนข้ามเที่ยงคืน
//
// ⚠️ เลขคณิตวันในไฟล์นี้เป็น **ปฏิทินล้วน** (สตริงวัน `YYYY-MM-DD` ตรึง T00:00:00Z)
//   ไม่มีโซนเวลาเข้ามาเกี่ยว — เป็นรูปแบบที่ด่าน `check:thaitime` อนุญาตไว้ชัดเจน

/* งวดที่ "รับเงินแล้วจริง" — ที่เดียวที่นิยามคำนี้ */
export const isConfirmed = (row) => String(row?.status || '') === 'confirmed';

const dateOf = (value) => {
  const text = String(value ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
};

/* สตริง ISO วันล้วนเทียบกันด้วย < > ได้ตรง ๆ (เรียงตามตัวอักษร = เรียงตามเวลา)
   — เขียนเป็นฟังก์ชันไว้กันคนหลังเผลอ new Date() แล้วได้ปัญหาโซนเวลากลับมา */
const isBefore = (a, b) => a < b;

/* ── ค่าหลัก: เงินครอบบริการถึงวันไหน ────────────────────────────────────
   `null` = **ยังไม่ครอบอะไรเลย** ไม่ใช่ "ครอบทุกวัน" — ผู้เรียกต้องอ่านว่าติดด่าน
   ⚠️ งวดที่ `confirmed` แต่ไม่มี `coversTo` **ไม่นับ** (ไม่ใช่นับเป็นอนันต์) —
   เงินเข้าจริงแต่ไม่มีใครบอกว่าซื้อบริการช่วงไหน ระบบจึงตอบแทนไม่ได้
   ⇒ ต้องโผล่เป็นคำเตือนให้คนไปเติม (ดู `coverageWarnings`) ไม่ใช่ปล่อยผ่านเงียบ ๆ */
export function paidThrough(installments = []) {
  let best = null;
  for (const row of installments || []) {
    if (!isConfirmed(row)) continue;
    const to = dateOf(row?.coversTo);
    if (!to) continue;
    if (!best || isBefore(best, to)) best = to;
  }
  return best;
}

/* วันนัดนี้อยู่ในช่วงที่เงินครอบไหม — ตัวที่ด่านข้อ 2 เรียกจริง (PR-C)
   ⚠️ **fail-closed ทุกทางที่ไม่แน่ใจ**: ไม่รู้วันนัด · ส่ง installments มาไม่ใช่อาเรย์
   (null/undefined = ผู้เรียกยังไม่ได้โหลด หรือ API นั้นไม่ได้ select มา) · อาเรย์ว่าง
   · ไม่มีงวดไหน confirmed ⇒ ตอบ **ไม่ผ่าน** ทั้งหมด
   ⭐ **"ใบยอด 0 ไม่มีงวด" ไม่ตัดสินที่นี่** — ระบบมีตัวตัดสินตัวเดียวของเรื่องนั้นอยู่แล้วคือ
   `paymentNotRequired(orderTotal)` (lib/sales/salesOrderPayments.js) ซึ่ง `installmentActionError`
   ใช้อยู่ · ถ้าที่นี่แปล "ไม่มีแถว = ผ่าน" เอง จะกลายเป็นกติกาที่สองที่กว้างกว่าของจริง:
   ใบยอดไม่เป็นศูนย์ก็ไม่มีแถวได้ (ใบเก่าก่อน mig 0245 ที่ยังไม่มีใครกด "เริ่มติดตามการชำระ")
   แล้วด่านจะเปิดให้ทุกนัดของใบที่ยังไม่เคยเก็บเงินสักบาท — fail-open ที่ตรงข้ามกับมติ
   ⇒ ผู้เรียกใน PR-C ต้องประกอบเอง: `paymentNotRequired(order.totalAmount) || coversDate(...)` */
export function coversDate(installments, dateIso) {
  const day = dateOf(dateIso);
  if (!day) return false;
  if (!Array.isArray(installments)) return false;
  const through = paidThrough(installments);
  return !!through && !isBefore(through, day);
}

/* ── งวดเลยกำหนดที่บัญชียังไม่รับรอง — บล็อกทั้งใบ ไม่มี grace ───────────
   นับ `rejected` ด้วย: บัญชีตีกลับ = เงินยังไม่เข้า ไม่ใช่เรื่องจบแล้ว
   คืน "แถว" ไม่ใช่ boolean เพราะทั้งจอคิวและด่านต้องบอกได้ว่า *งวดไหน* ค้าง */
export function overdueUnconfirmed(installments = [], todayIso) {
  const today = dateOf(todayIso);
  if (!today) return [];
  return (installments || []).filter((row) => {
    if (isConfirmed(row)) return false;
    const due = dateOf(row?.dueDate);
    return !!due && isBefore(due, today);
  });
}

export const hasOverdueUnconfirmed = (installments, todayIso) =>
  overdueUnconfirmed(installments, todayIso).length > 0;

/* ── สรุปสำหรับหัวการ์ด/แถบสถานะเส้น ───────────────────────────────────── */
export function coverageRollup(installments = [], todayIso) {
  const rows = Array.isArray(installments) ? installments : [];
  const overdue = overdueUnconfirmed(rows, todayIso);
  return {
    total: rows.length,
    confirmedCount: rows.filter(isConfirmed).length,
    paidThrough: paidThrough(rows),
    overdueCount: overdue.length,
    /* งวดที่รับเงินแล้วแต่ไม่มีช่วงครอบ — ตัวเลขนี้คือเหตุผลที่ "จ่ายถึง" ต่ำกว่าความจริง */
    confirmedWithoutCoverage: rows.filter((row) => isConfirmed(row) && !dateOf(row?.coversTo)).length,
  };
}

/* ── คำเตือนเรื่องช่วงครอบ — **เตือน ไม่บล็อก** ─────────────────────────
   ⭐ จงใจไม่มี constraint ที่ฐานและไม่มีด่านที่ API: แผนชำระของจริงในชีตทีมมี
   29 รูปแบบพิมพ์มือ (มัดจำ + รายเดือน + ก้อนท้าย ปนกัน) ถ้าบล็อกช่วงซ้อน/เว้น
   ใบจริงจะบันทึกไม่ได้ทั้งใบ ⇒ บอกให้คนเห็นแล้วให้คนตัดสิน
   เรียงตาม seq ก่อนเทียบเสมอ — ลำดับในอาเรย์ที่ API คืนมาไม่ใช่ลำดับงวด */
export function coverageWarnings(installments = []) {
  const rows = [...(installments || [])]
    .filter(Boolean)
    .sort((a, b) => Number(a?.seq || 0) - Number(b?.seq || 0));

  const out = [];
  for (const row of rows) {
    const from = dateOf(row?.coversFrom);
    const to = dateOf(row?.coversTo);
    if (isConfirmed(row) && !to) {
      out.push({ kind: 'confirmed_without_coverage', seq: row?.seq ?? null });
      continue;
    }
    if ((from && !to) || (!from && to)) out.push({ kind: 'half_range', seq: row?.seq ?? null });
  }

  const ranged = rows.filter((row) => dateOf(row?.coversFrom) && dateOf(row?.coversTo));
  for (let i = 1; i < ranged.length; i += 1) {
    const prevTo = dateOf(ranged[i - 1].coversTo);
    const from = dateOf(ranged[i].coversFrom);
    if (!isBefore(prevTo, from)) {
      out.push({ kind: 'overlap', seq: ranged[i]?.seq ?? null, since: from, until: prevTo });
      continue;
    }
    if (from !== addDays(prevTo, 1)) {
      out.push({ kind: 'gap', seq: ranged[i]?.seq ?? null, since: addDays(prevTo, 1), until: addDays(from, -1) });
    }
  }
  return out;
}

/* ── เลขคณิตปฏิทิน (ไม่มีโซนเวลา) ──────────────────────────────────────── */
export function addDays(dateIso, days) {
  const day = dateOf(dateIso);
  if (!day) return null;
  const base = new Date(`${day}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + Number(days || 0));
  /* ⚠️ ประกอบสตริงจากส่วน UTC เอง **ไม่ใช้ `.toISOString().slice(0, 10)`** — ที่นี่ไม่ผิด
     เพราะเป็นเลขคณิตปฏิทินล้วน แต่รูปนั้นคือรูปที่ด่าน `check:thaitime` ไล่จับ และมันจับ
     ตามชื่อตัวแปร ⇒ วันหนึ่งใครเปลี่ยนชื่อตัวแปรเป็นอะไรที่ลงท้าย `At` ด่านจะแดงทันที
     โดยไม่มีอะไรผิดจริง · เขียนแบบนี้แล้วไม่ต้องพึ่งโชคของชื่อตัวแปร */
  const year = base.getUTCFullYear();
  const month = String(base.getUTCMonth() + 1).padStart(2, '0');
  const dayOfMonth = String(base.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${dayOfMonth}`;
}

export function daysBetween(fromIso, toIso) {
  const a = dateOf(fromIso);
  const b = dateOf(toIso);
  if (!a || !b) return null;
  const ms = new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`);
  return Math.round(ms / 86400000);
}

/* ── ปุ่ม "แบ่งช่วงอัตโนมัติ" ─────────────────────────────────────────────
   แบ่งช่วงสัญญาเป็น n ท่อนต่อกันสนิท (ไม่ซ้อน ไม่เว้น) — **งวดสุดท้ายกินเศษ**
   เพื่อให้วันจบท่อนสุดท้าย = วันจบสัญญาเป๊ะเสมอ (ค่าที่คนตรวจจะมองหาก่อนเพื่อน)
   ⚠️ เป็น **ปุ่มให้คนกด ไม่ใช่ค่าตั้งต้นที่เติมเงียบ ๆ** — กฎฟอร์มของ repo:
   สิ่งที่เป็นการตัดสินใจห้ามมี default (แผนชำระจริงไม่ได้แบ่งเท่ากันทุกใบ) */
export function splitCoverageEvenly({ startDate, endDate, count } = {}) {
  const from = dateOf(startDate);
  const to = dateOf(endDate);
  const parts = Number(count);
  if (!from || !to || !Number.isInteger(parts) || parts < 1) return [];
  const span = daysBetween(from, to) + 1;
  if (span < parts) return [];

  const size = Math.floor(span / parts);
  const out = [];
  let cursor = from;
  for (let i = 0; i < parts; i += 1) {
    const last = i === parts - 1;
    const end = last ? to : addDays(cursor, size - 1);
    out.push({ coversFrom: cursor, coversTo: end });
    cursor = addDays(end, 1);
  }
  return out;
}
