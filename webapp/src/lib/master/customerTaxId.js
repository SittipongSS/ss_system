// ── เช็คลูกค้าซ้ำจากเลขประจำตัวผู้เสียภาษี ─────────────────────────────────
//
// ⭐ มติผู้ใช้ 2026-08-12: "ลูกค้า เช็คซ้ำจาก เลขประจำตัวผู้เสียภาษี" — เดิมด่านกัน
// ซ้ำตอนสร้างดูแค่รหัส AR ซึ่งเป็นเลขที่เราออกเอง ⇒ **บริษัทเดียวกันถูกเปิดซ้ำได้
// ตราบใดที่ให้รหัส AR ใหม่** เลขผู้เสียภาษีคือเลขที่กรมสรรพากรออกให้ ซึ่งเป็นตัวชี้ตัว
// นิติบุคคลจริง ๆ ตัวเดียวที่เรามี
//
// ⚠️ **ซ้ำ = เลขผู้เสียภาษี + สาขา ไม่ใช่เลขผู้เสียภาษีเดี่ยว ๆ** — บริษัทเดียวมี
// สำนักงานใหญ่ (00000) กับสาขา (00012) เป็นคนละสถานประกอบการโดยชอบ และ DB ก็ตั้ง
// unique (taxId, branchCode) ไว้แบบนั้นตั้งแต่ mig 0039 · ถ้าบล็อกที่เลขเดี่ยว ๆ
// จะบล็อกการเปิดสาขาซึ่งเป็นงานปกติ จึงแยกเป็นสองระดับ:
//
//   สาขาเดียวกัน  = ซ้ำจริง — ตีกลับพร้อมบอกว่าไปชนกับรายไหน (DB ตีกลับอยู่แล้ว
//                   แต่ข้อความจาก DB ไม่บอกว่าชนกับใคร คนกรอกจึงหาไม่เจอว่าซ้ำกับอะไร)
//   คนละสาขา      = เตือนบนฟอร์ม ไม่บล็อก — คนกรอกต้องเห็นว่ามีรายเดิมอยู่ เผื่อที่จริง
//                   ตั้งใจจะแก้รายเดิม ไม่ใช่เปิดใหม่
//
// ไม่มี import ฝั่ง server — ฟอร์มเรียกได้ตรง ๆ (แพตเทิร์นเดียวกับ masterCodes.js)
import { HEAD_OFFICE_BRANCH, normalizeBranchCode } from '@/lib/master/thaiAddress';

export const TAX_ID_LENGTH = 13;

// เก็บเป็นตัวเลขล้วน (MaskedNumberInput ส่งเฉพาะตัวเลข) — แต่ค่ายุคเก่า/ค่าที่นำเข้า
// มีขีดคั่นได้ จึงถอดทุกอย่างที่ไม่ใช่ตัวเลขก่อนเทียบเสมอ ไม่งั้น '0105560000069'
// กับ '0-1055-60000-06-9' จะกลายเป็นคนละบริษัท
export const taxIdDigits = (value) => String(value ?? '').replace(/\D/g, '');

export const isCompleteTaxId = (value) => taxIdDigits(value).length === TAX_ID_LENGTH;

// สาขาที่ใช้เทียบ — ไม่ระบุ = สำนักงานใหญ่ (ความหมายเดิมของ '00000' และเป็นค่าที่
// legacyAddressMirror เขียนลงคอลัมน์จริงเสมอ)
export const branchKeyOf = (value) => normalizeBranchCode(value) || HEAD_OFFICE_BRANCH;

/**
 * แยกแถวที่เลขผู้เสียภาษีตรงกัน ออกเป็น "สาขาเดียวกัน" กับ "คนละสาขา"
 *
 * @param rows แถวลูกค้าที่ taxId ตรงกันแล้ว (ผู้เรียกกรองมาก่อน หรือส่งทั้งลิสต์ก็ได้)
 * @param taxId เลขที่กำลังจะบันทึก · branchCode สาขาของที่อยู่ออกบิลหลัก
 * @param excludeId ตัวเอง (โหมดแก้) — ไม่งั้นทุกใบจะรายงานว่าซ้ำกับตัวเอง
 */
export function splitTaxIdMatches(rows, { taxId, branchCode, excludeId = null } = {}) {
  const digits = taxIdDigits(taxId);
  const branch = branchKeyOf(branchCode);
  const empty = { sameBranch: [], otherBranch: [] };
  if (!digits) return empty;
  return (rows || []).reduce((acc, row) => {
    if (!row || row.id === excludeId) return acc;
    if (taxIdDigits(row.taxId) !== digits) return acc;
    acc[branchKeyOf(row.branchCode) === branch ? 'sameBranch' : 'otherBranch'].push(row);
    return acc;
  }, { sameBranch: [], otherBranch: [] });
}

const nameOf = (row) => [row?.arCode, row?.name].filter(Boolean).join(' — ') || 'ลูกค้าที่มีอยู่';

// ข้อความตีกลับตอนซ้ำจริง — **ต้องบอกว่าชนกับรายไหน** ไม่ใช่แค่ "มีในระบบแล้ว"
// (ข้อความเดิมจาก unique ของ DB บอกแค่ว่าซ้ำ คนกรอกจึงไม่รู้ว่าต้องไปแก้ใบไหน)
export function taxIdDuplicateError(rows, { branchCode } = {}) {
  if (!rows?.length) return null;
  const branch = branchKeyOf(branchCode);
  const others = rows.length > 1 ? ` (และอีก ${rows.length - 1} ราย)` : '';
  return `เลขประจำตัวผู้เสียภาษีนี้ใช้กับสาขา ${branch} อยู่แล้วที่ ${nameOf(rows[0])}${others}`
    + ' — ถ้าเป็นบริษัทเดิม ให้แก้ที่รายเดิม หรือเปลี่ยนเลขสาขาของที่อยู่ออกบิล';
}

// ข้อความเตือนบนฟอร์มตอนเลขตรงแต่คนละสาขา — ไม่บล็อก
export function taxIdOtherBranchWarning(rows) {
  if (!rows?.length) return null;
  const list = rows.slice(0, 3).map((row) => `${nameOf(row)} (สาขา ${branchKeyOf(row.branchCode)})`).join(' · ');
  const more = rows.length > 3 ? ` และอีก ${rows.length - 3} ราย` : '';
  return `เลขนี้มีลูกค้าในระบบแล้ว: ${list}${more} — บันทึกต่อได้ถ้าเป็นคนละสาขา`;
}
