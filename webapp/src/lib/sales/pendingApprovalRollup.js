// ── ยอด SO "รออนุมัติ" บนแดชบอร์ดขาย (มติผู้ใช้ 2026-09-11 · mig 0353) ─────────
//
// ผู้ใช้แจ้ง: "SO ที่รออนุมัติ มันกลายเป็น 0 อยากให้โชว์ยอดด้วย แต่แยกให้รู้ว่า
// รออนุมัติ กับ Actual" ⇒ GET /api/sales-planning/dashboard ส่งยอดนี้เป็น **ช่องแยก**
// `pendingApproval` (บาท ก่อน VAT) + `pendingApprovalCount` (จำนวนใบ) ใน totals ·
// byOwner[] · byTeam[] · byType[] ของทุกเดือน
//
// ตัวรวมอยู่ที่นี่ ไม่ใช่ใน route — route.js ของ Next export ได้แค่ HTTP handler
// เทสต์จึงเรียกของใน route ตรง ๆ ไม่ได้
//
// ⭐ **รอบแยก ไม่ขี่ลูป Won** — เดือนของยอดรออนุมัติ = เดือนปัจจุบันเวลาไทยเสมอ
//    (pendingApprovalMonthOf) ส่วน Won ลงเดือน wonMonthOf ⇒ ดีลที่มีใบอนุมัติแล้วเดือน
//    ส.ค. แล้วมีใบใหม่รออนุมัติ ต้องได้ Won ที่ ส.ค. แต่รออนุมัติที่เดือนนี้ · ถ้าบวกในลูป
//    Won ยอดรออนุมัติจะไปตกเดือนของใบเก่า (เดือนที่ปิดไปแล้วไม่มีวันเห็นยอดนี้)
// ⭐ ลงถังคน/ทีมเดียวกับที่ Actual ของดีลนั้นลง — route ส่ง "ตัวหาถัง" ชุดเดียวกับลูป Won
//    มาให้ (ownerBucket(d.ownerId, d.ownerName, d.team) · teamBucket(d.team))
// ⛔ ไม่แตะ won / wonValue / wonCount / fcTotal / gap / variance เด็ดขาด — ตัวเลขพวกนั้น
//    ถูกหน้า "เติมยอดจากระบบ" คัดลอกไปเก็บใน sales_history ถาวร
import {
  isWonDeal,
  pendingApprovalAmountOf,
  pendingApprovalCountOf,
  pendingApprovalMonthOf,
} from '@/lib/sales/dashboardMetrics';

/** ช่องตั้งต้นของทุกถัง — ไม่มีใบรออนุมัติก็ต้องมีช่องเป็น 0 (สัญญากับจอ: ห้ามขาดช่อง) */
export const pendingApprovalFields = () => ({ pendingApproval: 0, pendingApprovalCount: 0 });

/** ดีลที่ยอดรออนุมัติตกเดือน `month` ('YYYY-MM') — ดีล Won เท่านั้น · เดือนปัจจุบันเวลาไทยเท่านั้น */
export function pendingApprovalDealsOf(deals, month, now = new Date()) {
  return (deals || []).filter((d) => isWonDeal(d) && pendingApprovalMonthOf(d, now) === month);
}

/** บวกยอดรออนุมัติของดีลเดียวลงถัง — แตะแค่สองช่องของตัวเอง ไม่แตะช่องอื่นของถัง */
export function addPendingApproval(bucket, deal) {
  if (!bucket) return bucket;
  bucket.pendingApproval = (Number(bucket.pendingApproval) || 0) + pendingApprovalAmountOf(deal);
  bucket.pendingApprovalCount = (Number(bucket.pendingApprovalCount) || 0) + pendingApprovalCountOf(deal);
  return bucket;
}

/**
 * รอบรวมยอดรออนุมัติของหนึ่งเดือน
 * @param {object[]} deals ดีลทั้งหมดที่แดชบอร์ดเห็น
 * @param {string} month 'YYYY-MM'
 * @param {object} opts
 * @param {Date} opts.now เวลาของ request — คิดครั้งเดียวต่อ request แล้วส่งลงมา
 * @param {Array<(deal) => object>} opts.attribute ตัวหาถัง (คน/ทีม/หมวด) ที่ยอดของดีลต้องลงด้วย
 *   ⚠️ ต้องเป็นตัวเดียวกับที่ลูป Won ใช้ ไม่งั้นยอดรออนุมัติกับ Actual ของดีลเดียวกันลงคนละแถว
 * @returns {{ pendingApproval: number, pendingApprovalCount: number }} ยอดรวมทั้งเดือน
 */
export function rollupPendingApproval(deals, month, { now = new Date(), attribute = [] } = {}) {
  const totals = pendingApprovalFields();
  for (const d of pendingApprovalDealsOf(deals, month, now)) {
    addPendingApproval(totals, d);
    for (const bucketOf of attribute) addPendingApproval(bucketOf(d), d);
  }
  return totals;
}

export const hasPendingApproval = (b) => Number(b?.pendingApproval) > 0 || Number(b?.pendingApprovalCount) > 0;

/* แถว "ผี" ของ byOwner/byTeam: ไม่มีทั้งเป้า/won/คาดการณ์/จำนวนดีล — เกิดจาก target
   ค้างค่า 0 หรือถังที่ถูกสร้างโดยไม่มีข้อมูลจริง → ตัดทิ้งไม่ให้โผล่บนหน้า
   ⭐ ถังที่มีแต่ยอดรออนุมัติ **ไม่ใช่ผี** — คนที่เดือนนี้มีแค่ใบรออนุมัติ (ดีล Won เดือนก่อน)
      ต้องยังมีแถว ไม่งั้นยอดรออนุมัติรายคนรวมไม่เท่ายอดบริษัท */
export const isEmptyDashboardBucket = (b) => !b.target && !b.won && !b.weighted && !b.lost
  && !b.openCount && !b.wonCount && !hasPendingApproval(b);
