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
 * ใบนี้ "ค้างนาน" ในคิวของฝ่าย RA ไหม — **ตัวตัดสินเดียว** ของแถบบนหน้าภาพรวม (`lateRegistrations`)
 * และตัวกรอง `?late=1` ของคิวขึ้นทะเบียน (ตรวจตัวเลข H2 · 2026-10-19)
 * (สถานะอื่นไม่นับ: ฉบับร่างค้างเป็นเรื่องของฝ่ายขายเอง · อนุมัติแล้วจบงาน)
 */
export function isLateRegistration(row, todayIso, { minDays = AGE_LATE_DAYS } = {}) {
  if (row?.status !== "pending_legal") return false;
  const days = registrationAge(row, todayIso);
  return Number.isFinite(days) && days >= minDays;
}

/**
 * ใบที่ "ค้างนาน" ในคิวของฝ่าย RA — ตัวเลขที่หน้าภาพรวมต้องกล้าโชว์
 */
export function lateRegistrations(rows = [], todayIso, { minDays = AGE_LATE_DAYS } = {}) {
  return (rows || [])
    .filter((r) => isLateRegistration(r, todayIso, { minDays }))
    .map((r) => ({ row: r, days: registrationAge(r, todayIso) }))
    .sort((a, b) => b.days - a.days);
}

/* ── ลิงก์ของแถบ "ทะเบียนค้างรออนุมัติเกิน N วัน" ──────────────────────────
 * 🐞 (ตรวจตัวเลข H2 · 2026-10-08) แถบบอก "· 9 ใบ" แต่กดแล้วคิวเปิด `?status=pending_legal` = รออนุมัติ
 *    **ทั้งหมด 17 ใบ** — คิวไม่มีตัวกรองอายุ คนต้องไล่ดูคอลัมน์ "ค้างมา" เองว่าใบไหนคือเก้าใบนั้น
 * ⇒ ส่ง `late=1` ไปด้วย · คิวกรองด้วย `isLateRegistration` ตัวเดียวกับที่แถบนับ */
export const LATE_REGISTRATIONS_HREF = "/tax/registrations?status=pending_legal&late=1";

/** คิวถูกเปิดมาจากแถบค้างนานไหม */
export function wantsLateOnly(searchParams) {
  return searchParams?.get?.("late") === "1";
}

/* ── ข้อมูลสินค้าที่คิวต้องเห็นทุกแถว ────────────────────────────────────────
 *
 * ⭐ **คิวกับรายงานต้องเล่าเรื่องเดียวกัน** (มติผู้ใช้ 2026-08-28) — เดิมคิวโชว์แค่
 * ภาษี/ชิ้น + ราคาปลีกรวม VAT ส่วนรายงาน (`lib/tax/reports.js`) มี ขนาด · เลขผู้เสียภาษี ·
 * ราคาปลีกถอด VAT · ราคาผลิตแจกแจง+กำไร ⇒ คนอ่านคิวต้องเปิดรายงานอีกหน้าเพื่อดูเลข
 * ที่ตัดสินใจจริง ๆ · ตัวเลขชุดนี้จึงคิด **ที่เดียว** แล้วส่งให้จอ
 *
 * ⚠️ **ถอด VAT ใช้กติกาเดียวกับรายงาน**: มีค่าที่ทะเบียนสินค้าเก็บไว้ใช้ค่านั้น ·
 * ไม่มีถึงหารกลับด้วย `EXCISE_VAT_RATE` (ห้าม hardcode 1.07 ซ้ำที่นี่)
 * ⚠️ **ไม่ตัดสินสิทธิ์ในนี้** — `factory` คืนครบเสมอ แล้วให้ route กรองด้วย
 * `redactProductMargin(user, …)` ซึ่งเป็นด่านเดียวกับทะเบียนสินค้า ⇒ กติกาว่าใครเห็น
 * ต้นทุน/กำไรอยู่ที่เดียวของทั้งระบบ ไม่ใช่สองชุดที่เลื่อนออกจากกัน
 */
export function registrationProductFacts(product, { vatRate }) {
  const p = product || {};
  const incVat = Number(p.retailPriceIncVat);
  const hasIncVat = Number.isFinite(incVat) && incVat > 0;
  const exVat = p.retailPriceExVat != null
    ? Number(p.retailPriceExVat)
    : (hasIncVat ? incVat / (1 + vatRate) : null);
  return {
    volume: p.volume ?? null,
    volumeUnit: p.volumeUnit ?? null,
    retailPriceIncVat: hasIncVat ? incVat : (p.retailPriceIncVat ?? null),
    retailPriceExVat: Number.isFinite(exVat) ? exVat : null,
    factory: {
      costPrice: p.costPrice ?? null,
      materialCost: p.materialCost ?? null,
      laborCost: p.laborCost ?? null,
      shippingCost: p.shippingCost ?? null,
      factoryProfit: p.factoryProfit ?? null,
    },
  };
}

/** เหลืออะไรให้โชว์ไหมหลังโดนกรองสิทธิ์ — คิวซ่อนทั้งคอลัมน์เมื่อไม่มีใครเห็นสักค่า */
export function hasFactoryFacts(factory) {
  return !!factory && Object.values(factory).some((v) => v != null);
}
