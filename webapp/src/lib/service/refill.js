// ── เตือนน้ำหอมใกล้หมด (S-4) — logic ล้วน ─────────────────────────────────
//
// ⭐ นี่คือสิ่งที่เปลี่ยนธุรกิจบริการจาก **งานตามแจ้ง** เป็น **งานเชิงรุก**: ระบบรู้ว่า
// ขวดจะหมดวันไหน และรู้ว่ามีนัดก่อนหน้านั้นหรือยัง — ลูกค้าไม่ต้องโทรมาบอกว่ากลิ่นหาย
//
// ⚠️ **ประเมิน ไม่ใช่ความจริง** — อัตราใช้จริงขึ้นกับการตั้งเครื่องและขนาดห้อง
// ทุกป้ายจึงต้องอ่านออกว่าเป็นการคาดการณ์ ไม่ใช่ค่าที่วัดมา
import { toLocalISODate } from '@/lib/pm/dateHelpers';
import { refillDueDate, isAssetOnSite, ASSET_STATUS_LABELS } from './sites';
import { businessDate } from '@/lib/businessDate';
import { fmtDate } from '@/lib/format';

// ใกล้หมดภายในกี่วันถึงเรียกว่า "ต้องรีบ" — 14 วันคือเวลาที่ยังจัดรอบวิ่งทันโดยไม่ต้องแทรกคิว
export const REFILL_SOON_DAYS = 14;

/* ชนิดนัดที่เติม/ดูแลน้ำหอมจริง — "เติมล่าสุด" นับเฉพาะนัดชนิดนี้ที่ปิดแล้ว (ตัวเดียวกับตัวโหลดฝั่ง server `siteVisitDates`)
   ⚠️ หน้าเครื่องเคยนับนัดทุกชนิด (รวมเก็บเครื่อง/ประเมิน) เป็น "เติมล่าสุด" ⇒ คาดวันหมดคนละวันกับหน้าไซต์ (23/11/2026) */
export const REFILL_VISIT_KINDS = Object.freeze(['refill', 'maintenance', 'install']);

const daysBetween = (fromIso, toIso) => {
  const a = new Date(`${fromIso}T00:00:00`);
  const b = new Date(`${toIso}T00:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
};

// วันตั้งต้นของการนับ = เข้าเติมล่าสุด · ไม่มีก็วันติดตั้ง
//
// ⚠️ ข้อจำกัดที่ยอมรับไว้: ใช้ "วันเข้าเติมล่าสุดของ**ไซต์**" กับทุกเครื่องในไซต์นั้น
// ไม่ได้แยกรายเครื่อง เพราะเจ้าหน้าที่เข้าไซต์ครั้งเดียวเติมทุกเครื่องเป็นปกติ · เครื่องที่
// ติดตั้งทีหลังยังถูกต้องอยู่เพราะ `installedAt` ชนะเมื่อมาหลังวันเติมล่าสุด
export function refillAnchor(asset, lastSiteRefillDate = null) {
  const installed = asset?.installedAt || null;
  if (!lastSiteRefillDate) return installed;
  if (!installed) return lastSiteRefillDate;
  return installed > lastSiteRefillDate ? installed : lastSiteRefillDate;
}

// ── สถานะน้ำหอมของเครื่องหนึ่งตัว ────────────────────────────────────────
//
// state:
//   unknown  — ข้อมูลไม่พอ (ไม่รู้ขนาดขวด/อัตราใช้/วันตั้งต้น) → **ไม่เดา**
//   covered  — จะหมด แต่มีนัดก่อนหน้านั้นแล้ว = ไม่ต้องทำอะไร
//   overdue  — เลยวันที่คาดว่าหมดแล้ว และไม่มีนัดรออยู่
//   soon     — จะหมดภายใน REFILL_SOON_DAYS และไม่มีนัดครอบ
//   ok       — ยังอีกนาน
export function refillStatus(asset, {
  lastSiteRefillDate = null,
  nextVisitDate = null,
  todayIso = businessDate(),
  soonDays = REFILL_SOON_DAYS,
} = {}) {
  /* เครื่องที่ไม่ได้อยู่หน้างานไม่ต้องเตือน — ทั้งที่ปลดระวางแล้วและที่อยู่ในคลัง
     ⚠️ ก่อน mig 0332 บรรทัดนี้เช็คแค่ `=== 'removed'` ⇒ พอมี `in_stock` เข้ามา
        เครื่องบนชั้นวาง 343 ตัวจะถูกคำนวณวันน้ำหอมหมดและขึ้นป้าย "ใกล้หมด" ทั้งกอง
        ป้ายที่มั่วทั้งกระดานทำให้ป้ายจริงถูกเมินไปด้วย */
  if (!isAssetOnSite(asset)) {
    return {
      state: 'unknown', dueDate: null, daysLeft: null,
      label: ASSET_STATUS_LABELS[asset?.status] || 'ไม่ได้อยู่หน้างาน', tone: 'neutral',
    };
  }

  const dueDate = refillDueDate(asset, refillAnchor(asset, lastSiteRefillDate));
  if (!dueDate) {
    // ⚠️ ป้าย "ใกล้หมด" ที่มั่วจะถูกเมินทั้งกระดานภายในสองสัปดาห์ แล้วป้ายจริง
    // ก็ถูกเมินไปด้วย — ข้อมูลไม่พอต้องบอกตรง ๆ ว่าประเมินไม่ได้
    return { state: 'unknown', dueDate: null, daysLeft: null, label: 'ยังประเมินไม่ได้', tone: 'neutral' };
  }

  const daysLeft = daysBetween(todayIso, dueDate);

  // มีนัดก่อนวันหมด = ครอบแล้ว · เท่ากับวันหมดพอดีก็นับว่าครอบ (เข้าวันนั้นก็ทัน)
  if (nextVisitDate && String(nextVisitDate) <= String(dueDate)) {
    // วันที่บนป้ายจัดรูปแบบเดียวกับทั้งระบบ (เดิมพิมพ์ ISO ดิบ · 23/11/2026)
    return { state: 'covered', dueDate, daysLeft, label: `มีนัดก่อนหมด (${fmtDate(nextVisitDate)})`, tone: 'success' };
  }

  if (daysLeft !== null && daysLeft < 0) {
    return { state: 'overdue', dueDate, daysLeft, label: `น่าจะหมดแล้วตั้งแต่ ${fmtDate(dueDate)}`, tone: 'danger' };
  }
  if (daysLeft !== null && daysLeft <= soonDays) {
    // วันครบเอง = "คาดว่าหมดวันนี้" ไม่ใช่ "อีก 0 วัน" (23/11/2026)
    return { state: 'soon', dueDate, daysLeft, label: daysLeft === 0 ? 'ใกล้หมด — คาดว่าหมดวันนี้' : `ใกล้หมด — อีก ${daysLeft} วัน`, tone: 'warning' };
  }
  return { state: 'ok', dueDate, daysLeft, label: `คาดว่าหมด ${dueDate}`, tone: 'neutral' };
}

// สถานะที่ต้องมีคนทำอะไรต่อ (ต่างจาก covered/ok/unknown ที่ปล่อยได้)
export const NEEDS_ATTENTION = ['overdue', 'soon'];

// ── สรุประดับไซต์ — ตัวเลขที่แท็บบนหน้าลูกค้าต้องตอบได้ทันที ──────────────
export function siteRefillSummary(assets = [], context = {}) {
  const rows = assets
    // mig 0332: เครื่องในคลังไม่ใช่ภาระของไซต์ — ใช้ตัวตัดสินกลางแทนการเทียบสตริง
    .filter(isAssetOnSite)
    .map((asset) => ({ asset, status: refillStatus(asset, context) }));

  const overdue = rows.filter((r) => r.status.state === 'overdue').length;
  const soon = rows.filter((r) => r.status.state === 'soon').length;
  const unknown = rows.filter((r) => r.status.state === 'unknown').length;

  // เรียงจากด่วนสุด — วันหมดที่เร็วที่สุดของเครื่องที่ยังไม่มีนัดครอบ
  const openDue = rows
    .filter((r) => NEEDS_ATTENTION.includes(r.status.state))
    .map((r) => r.status.dueDate)
    .filter(Boolean)
    .sort();

  return {
    total: rows.length,
    overdue,
    soon,
    unknown,
    needsAttention: overdue + soon,
    earliestDue: openDue.length ? openDue[0] : null,
  };
}

// ป้ายสรุปของไซต์ — คืน null เมื่อไม่มีอะไรต้องเตือน (ป้ายเปล่าห้อยอยู่คือขยะ)
export function siteRefillBadge(summary) {
  if (!summary?.needsAttention) return null;
  if (summary.overdue) {
    return { tone: 'danger', label: `น้ำหอมน่าจะหมดแล้ว ${summary.overdue} เครื่อง` };
  }
  return { tone: 'warning', label: `ใกล้หมด ${summary.soon} เครื่อง` };
}
