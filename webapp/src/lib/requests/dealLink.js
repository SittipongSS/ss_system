// ── ลิงก์ "คำร้องของดีล" → /requests และตัวกรองฝั่งปลายทาง — คู่เดียวกัน ─────────────
//
// 🐞 สองอาการบนคู่เดียวกัน (ตรวจตัวเลขทั้งระบบ 2026-10-08 ข้อ H1 · H16 · แก้ 2026-10-19):
//   H1  ปุ่ม "เปิดหน้าคำร้อง" บนหน้าดีล (และหมุดที่มีหลายใบ) พาไป `/requests?dealId=…` แล้วจอขึ้น
//       **คิวทั้งบริษัท 224 เรื่อง** — `?dealId=` บังคับขอบเขตกว้างสุด แต่ตัวกรองดีลอยู่ในสาขา
//       "ของฉัน · ที่ฉันเปิด" อย่างเดียว ⇒ ขอบเขตทีม/ทั้งหมดไม่มีใครกรองดีลเลย
//   H16 หมุด "คำร้องค้าง 2" นับ **ขั้นเดียวของไทม์ไลน์** แต่ลิงก์ส่งไปแค่ดีล ⇒ ปลายทางนับทุกใบของดีล ·
//       หมุดที่ปิดครบแล้ว ("คำร้อง 3") พาไปคิวที่ไม่มีใบไหนในสามใบนั้นเลย (อยู่ประวัติหมด)
// ⇒ ไฟล์นี้คือที่เดียวที่ตอบทั้ง "ลิงก์หน้าตาแบบไหน" และ "ปลายทางอ่านลิงก์แล้วเหลือใบไหน"
//    นิยามเดียวกับ `stepPinSummary` (lib/requests/pins.js) — เทสต์ยืนยันว่าเลขบนหมุด = แถวที่ลิงก์เปิด
//
// ⚠️ ตัวกรองนี้คุม **ทั้งหน้า** /requests (เลขบนแท็บ · แถบตัวเลข · การ์ดเริ่มที่นี่ · ตาราง) ไม่ใช่แค่ตาราง —
//    ตัวเลขบนหน้าต้องพูดถึงชุดเดียวกับแถว (กติกาเดิมของหน้านั้น)
import { isStepPinnable } from '@/lib/requests/pins';
import { stepKeyLabel } from '@/lib/master/requestTypes';

/** ลิงก์ทั้งดีล — ปุ่ม "เปิดหน้าคำร้อง" / "เปิดคำร้อง" บนหน้าดีล */
export function dealRequestsHref(dealId) {
  return dealId ? `/requests?dealId=${encodeURIComponent(dealId)}` : '/requests';
}

/**
 * ลิงก์ของหมุดที่มีหลายใบ — ชุดเดียวกับที่หมุดนับ (`pin` = ผลของ `stepPinSummary`)
 * · ยังมีใบค้าง = เปิด "ในคิว" (ป้าย "คำร้องค้าง n" = n แถว)
 * · ปิดครบแล้ว = เปิด "ประวัติ" (ป้าย "คำร้อง n" = n แถว) — ในคิวไม่มีใบพวกนั้นสักใบ
 */
export function stepPinHref(pin) {
  const q = new URLSearchParams();
  if (pin?.dealId) q.set('dealId', pin.dealId);
  if (pin?.projectId) q.set('project', pin.projectId);
  if (pin?.stepKey) q.set('step', pin.stepKey);
  if (pin && !pin.open) q.set('tab', 'history');
  const s = q.toString();
  return s ? `/requests?${s}` : '/requests';
}

/**
 * อ่านลิงก์จาก URL — `null` = ไม่ได้มาจากหน้าดีล/หมุด (ไม่กรอง)
 * ⚠️ ต้องมีตัวยึด (ดีลหรือโครงการ) — `?step=` ลอย ๆ คือทุกดีลที่มีขั้นนั้น ไม่ใช่สิ่งที่ลิงก์ไหนตั้งใจส่ง
 */
export function readDealRequestsLink(searchParams) {
  const get = (key) => String(searchParams?.get?.(key) ?? '').trim() || null;
  const dealId = get('dealId');
  const projectId = get('project');
  if (!dealId && !projectId) return null;
  return { dealId, projectId, stepKey: get('step') };
}

/** ใบนี้อยู่ในชุดของลิงก์ไหม — กติกาเดียวกับ `stepPinSummary` (ดีลเดียวกัน หรือใบของกลางของโครงการ) */
export function matchesDealRequestsLink(request, link) {
  if (!link) return true;
  const r = request || {};
  const anchored = (link.dealId && r.dealId === link.dealId)
    || (link.projectId && !r.dealId && r.projectId === link.projectId);
  if (!anchored) return false;
  if (!link.stepKey) return true;
  return isStepPinnable(r) && r.stepKey === link.stepKey;
}

export function filterByDealRequestsLink(rows = [], link) {
  return link ? (rows || []).filter((r) => matchesDealRequestsLink(r, link)) : (rows || []);
}

/**
 * URL ของหน้าคิวที่ **พาตัวกรองดีลไปด้วย** — กดสลับแท็บแล้วตัวกรองต้องไม่หลุดเงียบ ๆ
 * (ตัวเลขบนแท็บนับจากชุดที่กรองแล้ว ⇒ สลับแท็บแล้วชุดเปลี่ยนเอง = เลขบนแท็บโกหก)
 * `tab` ว่าง = ถอด `?tab=` (ใช้กับ "ในคิว" ของทีม/ทั้งหมด) · `link` ว่าง = ถอดตัวกรองดีล (ปุ่ม ×)
 */
export function requestsQueueHref({ tab = null, link = null } = {}) {
  const q = new URLSearchParams();
  if (tab) q.set('tab', tab);
  if (link?.dealId) q.set('dealId', link.dealId);
  if (link?.projectId) q.set('project', link.projectId);
  if (link?.stepKey) q.set('step', link.stepKey);
  const s = q.toString();
  return s ? `/requests?${s}` : '/requests';
}

/** ป้ายของตัวกรอง — "ดีล DL-26080343 · ขั้น ออกแบบกลิ่น (SCENT 6)" */
export function dealRequestsLinkLabel(link, { dealCode = null } = {}) {
  if (!link) return null;
  const owner = link.dealId ? `ดีล ${dealCode || link.dealId}` : 'คำร้องกลางของโครงการ';
  if (!link.stepKey) return owner;
  // ชื่อขั้นในแม่แบบเป็นคำกริยา ("ขึ้น Mock-up สินค้า") — เว้นวรรคหลัง "ขั้น" ให้อ่านแยกคำ (ไม่ใช่ "ขั้นขึ้น…")
  return `${owner} · ขั้น ${stepKeyLabel(link.stepKey) || link.stepKey}`;
}
