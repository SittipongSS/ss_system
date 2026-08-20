// ── สัญญาของฝ่ายขาย (mig 0278) — กติกาล้วน ไม่มี I/O ────────────────────────
//
// ⭐ มติผู้ใช้ 2026-08-20 (docs/sales-contract-plan.md) — สามข้อที่ตัดสินไปแล้ว:
//   1. ออกสัญญาได้เมื่อดีลมีใบเสนอราคาที่ **อนุมัติภายในแล้ว** (approvalStatus)
//      ไม่ต้องรอลูกค้าตอบรับ
//   2. ลงนามนอกระบบ — พิมพ์ไปเซ็นแล้วอัปโหลดไฟล์กลับ
//   3. ระบบเจนเนื้อสัญญาเองจากแม่แบบ
//
// ⚠️ ไฟล์นี้ถูก import ทั้งฝั่งจอ (ซ่อน/จางปุ่ม + บอกเหตุผล) และฝั่ง API (ปฏิเสธจริง)
//    ⇒ ห้าม import อะไรที่เป็น server-only · **ด่านต้องเป็นตัวเดียวกันสองที่**
//    บทเรียนจากโมดูลบัญชี: ด่านที่แยกสองชุดจะเพี้ยนหากันแล้วได้ปุ่มที่กดแล้ว 403 เงียบ ๆ

import { dealTypeOf } from '@/lib/salesPlanning';

export const CONTRACT_KINDS = Object.freeze(['scent_design', 'manufacturing', 'service']);

export const CONTRACT_KIND_LABELS = Object.freeze({
  scent_design: 'สัญญาจ้างออกแบบกลิ่น',
  manufacturing: 'สัญญาจ้างผลิต',
  service: 'สัญญาบริการ',
});

// ชื่อเต็มบนกระดาษ — ยาวกว่าป้ายในตารางโดยเจตนา (ป้ายสั้นไว้อ่านในลิสต์
// ชื่อเต็มไว้เป็นหัวเอกสารตามต้นฉบับที่ใช้จริง)
export const CONTRACT_KIND_DOC_TITLES = Object.freeze({
  scent_design: 'สัญญาจ้างออกแบบกลิ่นและการพัฒนาสินค้า',
  manufacturing: 'สัญญาจ้างผลิตสินค้า',
  service: 'สัญญาให้บริการ',
});

export const CONTRACT_KIND_DOC_TITLES_EN = Object.freeze({
  scent_design: 'SCENT DESIGN & PRODUCT DEVELOPMENT AGREEMENT',
  manufacturing: 'MANUFACTURING AGREEMENT',
  service: 'SERVICE AGREEMENT',
});

export const CONTRACT_STATUSES = Object.freeze(['draft', 'awaiting_signature', 'signed', 'cancelled']);

export const CONTRACT_STATUS_LABELS = Object.freeze({
  draft: 'ร่าง',
  awaiting_signature: 'รอลงนาม',
  signed: 'ลงนามแล้ว',
  cancelled: 'ยกเลิก',
});

// ชื่อโทนของ <StatusBadge> ไม่ใช่ค่าสี (กติกาเดียวกับ SCENT_STATUS_TONES)
export const CONTRACT_STATUS_TONES = Object.freeze({
  draft: 'muted',
  awaiting_signature: 'warning',
  signed: 'success',
  cancelled: 'danger',
});

export const contractKindLabel = (kind) => CONTRACT_KIND_LABELS[kind] || 'สัญญา';
export const contractStatusLabel = (status) => CONTRACT_STATUS_LABELS[status] || status || '—';
export const contractStatusTone = (status) => CONTRACT_STATUS_TONES[status] || 'muted';
export const isContractKind = (kind) => CONTRACT_KINDS.includes(kind);

// ── เลขที่สัญญา ────────────────────────────────────────────────────────────
//
// CT-YYMMXXXX (รีเซ็ตต่อเดือน scope 'CT' ใน entity_number_counters)
//
// ⚠️ **ไม่ได้อยู่ในทะเบียน "มาตรฐานเอกสาร"** (DOCUMENT_STANDARD_KEYS) โดยเจตนา —
//    ทะเบียนนั้นบังคับให้มีรหัสแบบฟอร์มควบคุม (FM-xx-nn) ซึ่งสัญญายังไม่มี และการ
//    กุรหัสขึ้นเองแปลว่ามีเอกสารควบคุมปลอมโผล่ในระบบคุณภาพ · วันไหนฝ่ายเอกสารออก
//    รหัสจริงให้ ค่อยย้ายรูปแบบนี้เข้าทะเบียนแล้วให้หน้าตั้งค่าคุมแทน
export const CONTRACT_NUMBER_PATTERN = 'CT-{YY}{MM}{RUNNING:4}';
export const CONTRACT_NUMBER_SCOPE = 'CT';

// ── ประเภทดีล/สายธุรกิจ → ชนิดสัญญาที่ออกได้ ──────────────────────────────
//
// มติผู้ใช้ 2026-08-20 (ตอบคำถาม "เฉพาะดีล SCENT ครอบคลุมแค่ไหน"):
//   ออกแบบกลิ่น = ดีล SCENT · จ้างผลิต = NPD/RE-ORDER สาย PRODUCT
//   บริการ      = NPD/RE-ORDER สาย SERVICE
//
// ⚠️ **สายธุรกิจอ่านจากดีลก่อน แล้วค่อยตกไปที่โครงการ** — ดีลถือสายของตัวเองตั้งแต่
//    mig 0275 (มติผู้ใช้ 2026-08-20) ส่วนดีลเก่าที่ยังไม่ระบุยังสืบจากโครงการที่ผูกอยู่
//    ซึ่งเป็นกติกาเดียวกับ backfill ของ 0275 ไม่ใช่การเดา
// ⚠️ NULL คือ "ยังไม่ระบุ" ที่ถูกต้อง ไม่ใช่ข้อผิดพลาด ⇒ ดีลที่ยังไม่มีสายจะออกได้แค่
//    สัญญาออกแบบกลิ่น (ซึ่งไม่ต้องใช้สาย) · **ห้ามเดาสายให้เอง**
const SCENT_TYPES = new Set(['SCENT']);
const DELIVERY_TYPES = new Set(['NPD', 'RE-ORDER']);

export const contractBusinessLine = (deal, project = null) =>
  deal?.line || project?.line || deal?.project?.line || null;

export function contractKindsForDeal(deal, project = null) {
  const type = dealTypeOf(deal);
  const line = contractBusinessLine(deal, project);
  const kinds = [];
  if (SCENT_TYPES.has(type)) kinds.push('scent_design');
  if (DELIVERY_TYPES.has(type)) {
    if (line === 'PRODUCT') kinds.push('manufacturing');
    if (line === 'SERVICE') kinds.push('service');
  }
  return kinds;
}

// ใบเสนอราคาที่ "ปลดล็อกสัญญา" ได้ — อนุมัติภายในแล้ว และใบยังมีผลอยู่
// ⚠️ ใบที่ถูกยกเลิก/ปฏิเสธไม่นับ แม้จะเคยอนุมัติมาก่อน: มันคือใบที่ตายแล้ว
//    การอ้างมันบนสัญญาเท่ากับอ้างราคาที่ไม่มีใครถืออยู่
const DEAD_QUOTE_STATUSES = new Set(['cancelled', 'rejected']);

export function approvedQuotationsForContract(quotations = []) {
  return (quotations || []).filter((q) => q?.approvalStatus === 'approved' && !DEAD_QUOTE_STATUSES.has(q?.status));
}

// ── ด่านออกสัญญา ────────────────────────────────────────────────────────────
// คืน { ok, reason } — `reason` เป็นข้อความไทยที่เอาไปโชว์ใต้ปุ่มได้ตรง ๆ
// (ปุ่มจางที่ไม่บอกเหตุผล = คนเดินมาถามผู้ดูแลทีละคน — กติกาเดียวกับการ์ดระบบที่ปิดอยู่)
export function contractEligibility({ kind, deal, project = null, quotations = [] } = {}) {
  if (!deal) return { ok: false, reason: 'ไม่พบดีลของสัญญานี้' };
  const approved = approvedQuotationsForContract(quotations);
  if (!approved.length) {
    return { ok: false, reason: 'ออกสัญญาได้หลังใบเสนอราคาของดีลนี้ผ่านการอนุมัติแล้ว' };
  }
  const allowed = contractKindsForDeal(deal, project);
  if (!allowed.length) {
    const type = dealTypeOf(deal) || 'ไม่ระบุ';
    const line = contractBusinessLine(deal, project);
    if (DELIVERY_TYPES.has(type) && !line) {
      return { ok: false, reason: 'ดีลนี้ยังไม่ระบุสายธุรกิจ — เลือกสายสินค้า/บริการที่ดีลก่อน' };
    }
    return { ok: false, reason: `ดีลประเภท ${type} ยังไม่มีชนิดสัญญาที่ออกได้` };
  }
  if (kind && !allowed.includes(kind)) {
    return {
      ok: false,
      reason: `${contractKindLabel(kind)}ออกกับดีลนี้ไม่ได้ — ออกได้เฉพาะ ${allowed.map(contractKindLabel).join(' · ')}`,
    };
  }
  return { ok: true, reason: null, kinds: allowed, quotations: approved };
}

// ── สถานะ → ทำอะไรได้บ้าง ───────────────────────────────────────────────────
// จุดเดียวที่ตอบว่า "ปุ่มไหนขึ้น" ทั้งหน้าจอและ API — แยกสองชุดเมื่อไรได้ปุ่มที่กดแล้ว
// ระบบปฏิเสธ (หรือแย่กว่า: ปุ่มที่ไม่ขึ้นทั้งที่ทำได้)
export const isContractEditable = (contract) => contract?.status === 'draft';
export const canIssueContract = (contract) => contract?.status === 'draft';
export const canSignContract = (contract) => contract?.status === 'awaiting_signature';
export const canCancelContract = (contract) => ['draft', 'awaiting_signature'].includes(contract?.status);
// ลบได้เฉพาะร่างที่ยังไม่เคยออกเลข — ใบที่ออกเลขไปแล้วต้อง "ยกเลิก" ให้เหลือร่องรอย
export const canDeleteContract = (contract) => contract?.status === 'draft' && !contract?.contractNo;

// ใบที่รอมือใคร — ใช้ทั้งป้ายตัวเลขบนเมนูและตัวกรอง "ที่ต้องทำ" ในลิสต์
export function isContractWaitingOnMe(contract, { userId } = {}) {
  if (!contract || !userId) return false;
  const mine = contract.ownerId === userId || contract.createdBy === userId;
  if (!mine) return false;
  return contract.status === 'draft' || contract.status === 'awaiting_signature';
}

// จำนวนวันที่ใบค้างอยู่ในขั้น "รอลงนาม" — ตัวเลขที่ฝ่ายขายใช้ตามงานจริง
export function daysAwaitingSignature(contract, now = new Date()) {
  if (contract?.status !== 'awaiting_signature' || !contract?.issuedAt) return null;
  const issued = new Date(contract.issuedAt);
  if (Number.isNaN(issued.getTime())) return null;
  return Math.max(0, Math.floor((now - issued) / 86400000));
}
