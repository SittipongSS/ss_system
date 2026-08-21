// ── บันทึกเพิ่มเติมสัญญา (mig 0282) — กติกาล้วน ไม่มี I/O ────────────────────
//
// ⭐ มติผู้ใช้ 2026-08-21: บันทึก **ออกจากสัญญาหลักที่ลงนามแล้วเท่านั้น** และต้องอ้าง
//    **คำร้องพัฒนากลิ่นที่ปิดเรื่องแล้ว** เพราะข้อมูลกลิ่น/สูตรที่จะขึ้นตารางอยู่ที่นั่น
//    เลขที่ต่อจากสัญญาแม่: `CT-YYMMXXXX-A1`
//
// ⚠️ import ได้ทั้งจอและ API — ห้าม import อะไรที่เป็น server-only (ด่านเดียวสองที่)

export const ADDENDUM_STATUSES = Object.freeze(['draft', 'awaiting_signature', 'signed', 'cancelled']);

export const ADDENDUM_STATUS_LABELS = Object.freeze({
  draft: 'ร่าง',
  awaiting_signature: 'รอลงนาม',
  signed: 'ลงนามแล้ว',
  cancelled: 'ยกเลิก',
});

export const ADDENDUM_STATUS_TONES = Object.freeze({
  draft: 'muted',
  awaiting_signature: 'warning',
  signed: 'success',
  cancelled: 'danger',
});

export const addendumStatusLabel = (status) => ADDENDUM_STATUS_LABELS[status] || status || '—';
export const addendumStatusTone = (status) => ADDENDUM_STATUS_TONES[status] || 'muted';

export const ADDENDUM_DOC_TITLE = 'บันทึกเพิ่มเติมสัญญาจ้างออกแบบกลิ่นน้ำหอม';

/* เลขที่บันทึก = เลขสัญญาแม่ + `-A` + ครั้งที่
   ⚠️ ใช้ **เลขที่เต็มของสัญญาแม่รวมเลขฉบับแก้ไข** (CT-26080001-1-A2) โดยตั้งใจ —
   บันทึกแนบท้ายสัญญา *ฉบับที่ลงนามจริง* ไม่ใช่แนบท้ายเลขฐานลอย ๆ */
export const addendumDocNo = (contractNo, addendumNo) =>
  (contractNo ? `${contractNo}-A${addendumNo}` : null);

// ── ด่านสร้างบันทึก ─────────────────────────────────────────────────────────
// คืน { ok, reason } — `reason` เอาไปโชว์ใต้ปุ่มได้ตรง ๆ
export function addendumEligibility({ contract, request = null } = {}) {
  if (!contract) return { ok: false, reason: 'ไม่พบสัญญาแม่' };
  if (contract.kind !== 'scent_design') {
    return { ok: false, reason: 'ตอนนี้มีแม่แบบบันทึกเพิ่มเติมเฉพาะสัญญาจ้างออกแบบกลิ่น' };
  }
  if (contract.status !== 'signed') {
    return {
      ok: false,
      reason: contract.status === 'awaiting_signature'
        // ⭐ ใบที่ยังไม่เซ็นแก้ได้ด้วยการออกฉบับแก้ไข ซึ่งถูกกว่าและตรงความหมายกว่า
        ? 'สัญญายังไม่ลงนาม — แก้ด้วยการออกฉบับแก้ไข (Rev.) แทน'
        : 'ทำบันทึกเพิ่มเติมได้เฉพาะสัญญาที่ลงนามแล้ว',
    };
  }
  if (!request) return { ok: false, reason: 'เลือกคำร้องพัฒนากลิ่นที่ปิดเรื่องแล้วก่อน' };
  if (request.kind !== 'scent_dev') {
    return { ok: false, reason: 'ต้องเป็นคำร้องพัฒนากลิ่นเท่านั้น' };
  }
  /* ⚠️ ต้อง "ปิดเรื่อง" จริง ไม่ใช่แค่ฝ่ายใดฝ่ายหนึ่งกด — ใบที่ยังไม่ปิดแปลว่าสูตร
     ยังขยับได้ แล้วตารางในบันทึกจะไม่ตรงกับของจริงที่ตกลงกัน (กติกาปิดสองฝั่ง mig 0158) */
  if (request.status !== 'closed') {
    return { ok: false, reason: 'คำร้องนี้ยังไม่ปิดเรื่อง — ปิดครบทั้งสองฝั่งก่อนจึงทำบันทึกได้' };
  }
  return { ok: true, reason: null };
}

// ── สถานะ → ทำอะไรได้ (จุดเดียวที่ทั้งจอและ API ถาม) ────────────────────────
export const isAddendumEditable = (addendum) => addendum?.status === 'draft';
export const canIssueAddendum = (addendum) => addendum?.status === 'draft';
export const canSignAddendum = (addendum) => addendum?.status === 'awaiting_signature';
export const canCancelAddendum = (addendum) => ['draft', 'awaiting_signature'].includes(addendum?.status);
// ลบได้ตราบใดที่ยังเป็นร่าง — กติกาเดียวกับสัญญา (มติผู้ใช้ 2026-08-21)
export const canDeleteAddendum = (addendum) => addendum?.status === 'draft' && !addendum?.docNo;

/* แถวตารางสูตรจากคำร้อง — คำร้องหนึ่งใบมีหลายแถว แต่ละแถวผลิตสูตรของตัวเอง
   ⚠️ เอาเฉพาะแถวที่ **ผลิตสูตรออกมาแล้ว** (`producedFormulaId`) — แถวที่ยังไม่มีสูตร
   คือกลิ่นที่ยังไม่ได้ขึ้นทะเบียน ใส่ลงบันทึกไม่ได้เพราะไม่มีรหัสให้อ้าง */
export function addendumLinesFromFormulas(formulas = []) {
  return formulas
    .filter(Boolean)
    .map((formula, index) => ({
      seq: index + 1,
      name: formula.name || '',
      code: formula.code || '',
      formulaDate: formula.formulaDate || null,
      scentCode: formula.scentCode || null,
    }));
}
