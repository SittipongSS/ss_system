// ── อายุของงานในคิวขึ้นทะเบียน ─────────────────────────────────────────────
//
// ⭐ ที่มา: ตรวจระบบ 2026-08-28 พบทะเบียน 17 ใบค้างที่ "รออนุมัติ" ทั้งหมด — เก้าใบ
// ค้างมา 28–34 วัน ทั้งที่เอกสารครบทุกใบ · บนจอเดิม **ใบที่ค้าง 34 วันหน้าตาเหมือน
// ใบที่เพิ่งยื่นเมื่อวาน** เพราะคิวไม่มีคอลัมน์วันที่และไม่มีอายุงานเลย
//
// ⚠️ "วันนี้" ต้องส่งเข้ามาเสมอ (`businessDate()` จากนาฬิกาไทย) — ห้ามอ่านนาฬิกา
// ในนี้ ไม่งั้นค่าจะเปลี่ยนระหว่างเรนเดอร์และเทสต์จะผูกกับวันที่รันเทสต์

/** จำนวนวันเต็มจาก `fromIso` ถึง `todayIso` (ทั้งคู่เป็นวันไทย YYYY-MM-DD หรือ timestamp) */
export function ageInDays(from, todayIso) {
  if (!from || !todayIso) return null;
  const start = String(from).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(todayIso)) return null;
  const ms = Date.parse(`${todayIso}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`);
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.round(ms / 86400000));
}

/* เกณฑ์ที่ถือว่า "ช้า" — ตั้งจากงานจริง: ทะเบียนที่เอกสารครบแล้วเป็นงานตรวจอย่างเดียว
   ไม่ต้องรอข้อมูลจากใคร ⇒ ค้างเกินหนึ่งสัปดาห์คือค้าง ไม่ใช่ "กำลังทำ" */
export const AGE_WARN_DAYS = 4;
export const AGE_LATE_DAYS = 8;

/** โทนของอายุงาน — neutral | warning | danger (ตรงกับ tone ของ StatusBadge/KpiCard) */
export function ageTone(days) {
  if (!Number.isFinite(days)) return "neutral";
  if (days >= AGE_LATE_DAYS) return "danger";
  if (days >= AGE_WARN_DAYS) return "warning";
  return "neutral";
}

/** ป้ายอายุงานที่อ่านรู้เรื่องโดยไม่ต้องคิดเลขเอง */
export function ageLabel(days) {
  if (!Number.isFinite(days)) return null;
  if (days === 0) return "วันนี้";
  if (days === 1) return "1 วัน";
  return `${days} วัน`;
}

/* ── จุดเวลาที่ใช้วัดอายุของแต่ละสถานะ ─────────────────────────────────────
 * ⚠️ ไม่ใช่ `createdAt` เสมอไป — ใบที่ถูกตีกลับแล้วส่งกลับมาใหม่ นับอายุจากรอบล่าสุด
 * ไม่ใช่จากวันที่เปิดใบครั้งแรก ไม่งั้นใบที่แก้เสร็จเมื่อวานจะโชว์ว่าค้างมาสามสัปดาห์
 *
 * `updatedAt` คือจุดที่สถานะปัจจุบันเริ่มต้น (ทุกการเปลี่ยนสถานะเขียนคอลัมน์นี้)
 * ยกเว้น `approved` ที่มี `approvedAt` ตรง ๆ ให้ใช้
 */
export function ageAnchor(registration) {
  if (!registration) return null;
  if (registration.status === "approved") return registration.approvedAt || registration.updatedAt || null;
  if (registration.status === "draft") return registration.createdAt || null;
  return registration.updatedAt || registration.createdAt || null;
}

/** อายุของทะเบียนหนึ่งใบในสถานะปัจจุบัน */
export function registrationAge(registration, todayIso) {
  return ageInDays(ageAnchor(registration), todayIso);
}

/**
 * ใบที่ "ค้างนาน" ในคิวของฝ่ายกฎหมาย — ตัวเลขที่หน้าภาพรวมต้องกล้าโชว์
 * (สถานะอื่นไม่นับ: ฉบับร่างค้างเป็นเรื่องของฝ่ายขายเอง · อนุมัติแล้วจบงาน)
 */
export function lateRegistrations(rows = [], todayIso, { minDays = AGE_LATE_DAYS } = {}) {
  return (rows || [])
    .filter((r) => r?.status === "pending_legal")
    .map((r) => ({ row: r, days: registrationAge(r, todayIso) }))
    .filter((x) => Number.isFinite(x.days) && x.days >= minDays)
    .sort((a, b) => b.days - a.days);
}
