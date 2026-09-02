// ── บันทึกเพิ่มเติมสัญญา (mig 0282) — กติกาล้วน ไม่มี I/O ────────────────────
//
// ⭐ มติผู้ใช้ 2026-08-21: บันทึก **ออกจากสัญญาหลักที่ลงนามแล้วเท่านั้น** และต้องอ้าง
//    **คำร้องพัฒนากลิ่นที่ปิดเรื่องแล้ว** เพราะข้อมูลกลิ่น/สูตรที่จะขึ้นตารางอยู่ที่นั่น
//    เลขที่ต่อจากสัญญาแม่: `CT-YYMMXXXX-A1`
//
// ⚠️ import ได้ทั้งจอและ API — ห้าม import อะไรที่เป็น server-only (ด่านเดียวสองที่)

import { isExternalContract } from '@/lib/sales/contracts';

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
/* ลูกค้าเดียวกันไหม — เทียบรหัสลูกค้าก่อน เพราะชื่อบนเอกสารพิมพ์ต่างกันได้
   (เว้นวรรค · "จำกัด" กับ "จก.") ⚠️ ข้อมูลไม่ครบทั้งสองฝั่ง = ตรวจไม่ได้ ไม่ใช่ไม่ผ่าน */
const normalizeName = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();

export function sameCustomer(contract, request) {
  if (contract?.customerId && request?.customerId) return contract.customerId === request.customerId;
  const left = normalizeName(contract?.customerName);
  const right = normalizeName(request?.customerName);
  if (!left || !right) return true;
  return left === right;
}

export function addendumEligibility({ contract, request = null, takenByDocNo = null } = {}) {
  if (!contract) return { ok: false, reason: 'ไม่พบสัญญาแม่' };
  /* 🔴 **ใบที่ใช้เอกสารภายนอกแทนสัญญาทำบันทึกเพิ่มเติมไม่ได้** — แม่แบบบันทึกเพิ่มเติม
     เขียนขึ้นเป็น *ภาคผนวกของสัญญาจ้างออกแบบกลิ่นฉบับของเรา* และดึงสถานที่/ผู้ลงนามจาก
     `contract.fields` ของสัญญาแม่ · ใบ external ไม่มีข้อความนั้น (fields ว่างโดยตั้งใจ)
     ⇒ ปล่อยผ่านแล้วจะได้เอกสารที่อ้างข้อสัญญาซึ่งไม่มีอยู่ในกระดาษที่ทั้งสองฝ่ายถืออยู่
     เป็นรูเดียวกับที่ปิดไปในเส้นพิมพ์สัญญา แค่ย้ายบ้านมาอยู่เอกสารลูก */
  if (isExternalContract(contract)) {
    return { ok: false, reason: 'ใบนี้ใช้เอกสารภายนอกแทนสัญญา — แก้ไขข้อตกลงต้องทำกับคู่สัญญาบนเอกสารฉบับนั้นโดยตรง' };
  }
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
  /* ⭐ ลูกค้าต้องเป็นรายเดียวกับสัญญา (มติผู้ใช้ 2026-08-22) — บันทึกเป็นส่วนหนึ่งของสัญญา
     ตามข้อ 2 ของตัวมันเอง ⇒ เอาสูตรของลูกค้ารายอื่นมาแนบท้ายไม่ได้ */
  if (!sameCustomer(contract, request)) {
    return { ok: false, reason: 'คำร้องนี้เป็นของลูกค้าคนละรายกับสัญญา' };
  }
  /* ⭐ หนึ่งคำร้อง = หนึ่งบันทึก (มติผู้ใช้ 2026-08-22) — ออกซ้ำแปลว่าสูตรชุดเดียวกัน
     ถูกแนบท้ายสองใบ แล้วไม่มีใครรู้ว่าใบไหนคือฉบับที่ใช้ */
  if (takenByDocNo) {
    return { ok: false, reason: `คำร้องนี้ออกบันทึกไปแล้ว (${takenByDocNo}) — หนึ่งคำร้องออกบันทึกได้ครั้งเดียว` };
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
