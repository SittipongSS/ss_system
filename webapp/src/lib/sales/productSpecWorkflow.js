// ── ด่านของใบสเปคสินค้า FM-SA-04 — ตัวตัดสินล้วน (mig 0364) ──────────────────
//
// ⭐ **เส้นอนุมัติอยู่ที่ "ฉบับ" ไม่ใช่ "การออกเอกสาร"** (มติผู้ใช้ 2026-09-17)
//   AC ร่าง → AE ตรวจ → AE Sup อนุมัติ = การอนุมัติ **เนื้อสเปก**
//   ⇒ ออกเอกสารรอบใหม่ด้วยสเปกเดิม ไม่ต้องเดินด่านซ้ำ · ลายเซ็นบนกระดาษคือชุดที่
//     อนุมัติ Rev. นั้นพร้อมวันที่เดิม เพราะลายเซ็นรับรอง *สเปก* ไม่ใช่รอบขาย
//   ⇒ แก้ช่องสเปก = ฉบับใหม่ = เดินด่านใหม่ทั้งสามขั้น
//
// ⚠️ ที่นี่ตอบแค่ "ใครทำอะไรได้ และติดอะไรอยู่" — ไม่แตะฐาน ไม่รู้จัก supabase
// ⚠️ ทุกตัวคืน **เหตุผลเป็นข้อความ** ไม่ใช่ boolean เปล่า เพราะจอต้องบอกเหตุตอนกด
//    (กฎ ui-visibility-rule) · `null` = ทำได้
import { isSuperuser } from '@/lib/permissions';

export const SPEC_REVISION_STATUSES = Object.freeze([
  'draft', 'pending_ae', 'pending_ae_supervisor', 'approved', 'rejected', 'superseded',
]);

export const SPEC_REVISION_STATUS_LABELS = Object.freeze({
  draft: 'ร่าง',
  pending_ae: 'รอ AE ตรวจ',
  pending_ae_supervisor: 'รอ AE Sup อนุมัติ',
  approved: 'อนุมัติแล้ว',
  rejected: 'ตีกลับให้แก้',
  superseded: 'ถูกแทนด้วยฉบับใหม่',
});

export const SPEC_ISSUE_STATUS_LABELS = Object.freeze({
  pending: 'รอฉบับอนุมัติ',
  issued: 'ออกเอกสารแล้ว',
  void: 'ยกเลิกแล้ว',
});

/* สี่ขั้นบนราง — `rejected` ไม่นับเป็นจุด มันคือ *สุขภาพ* ของขั้นที่ยืนอยู่
   (กติกาเดียวกับรางของคำร้องและของใบสั่งขาย) */
export const SPEC_REVISION_STEPS = Object.freeze([
  'draft', 'pending_ae', 'pending_ae_supervisor', 'approved',
]);

export const isSpecRevisionOpen = (revision) => Boolean(revision)
  && ['draft', 'pending_ae', 'pending_ae_supervisor'].includes(revision.status);

export const isSpecRevisionClosed = (revision) => Boolean(revision)
  && ['approved', 'rejected', 'superseded'].includes(revision.status);

const AE_ROLES = ['ae', 'senior_ae', 'ae_supervisor'];

export const canDraftProductSpec = (role) => isSuperuser(role)
  || ['ac', ...AE_ROLES].includes(role);

export const canReviewProductSpec = (role) => isSuperuser(role) || AE_ROLES.includes(role);

export const canApproveProductSpec = (role) => isSuperuser(role) || role === 'ae_supervisor';

/** แก้เนื้อฉบับได้ไหม — ได้เฉพาะฉบับที่ยังไม่ผ่านด่าน AE Sup */
export function productSpecEditBlock(revision, { role } = {}) {
  if (!revision) return 'ยังไม่มีฉบับให้แก้ — ต้องสร้างฉบับใหม่ก่อน';
  if (!canDraftProductSpec(role)) return 'ต้องเป็น AC หรือฝ่ายขายจึงแก้ใบสเปคได้';
  if (revision.status === 'approved') {
    return 'ฉบับนี้อนุมัติแล้ว แก้ไม่ได้ — ต้องออกฉบับใหม่ (Rev. ถัดไป)';
  }
  if (revision.status === 'superseded') return 'ฉบับนี้ถูกแทนด้วยฉบับใหม่แล้ว';
  if (revision.status === 'pending_ae_supervisor' && !canApproveProductSpec(role)) {
    return 'ฉบับนี้อยู่ที่ AE Sup — ดึงกลับมาแก้ก่อนถึงจะแก้ได้';
  }
  return null;
}

/** ส่งให้ AE ตรวจ */
export function productSpecSubmitBlock(revision, { role } = {}) {
  if (!revision) return 'ยังไม่มีฉบับให้ส่ง';
  if (!canDraftProductSpec(role)) return 'ต้องเป็น AC หรือฝ่ายขายจึงส่งใบสเปคได้';
  if (!['draft', 'rejected'].includes(revision.status)) {
    return `ฉบับนี้อยู่สถานะ "${SPEC_REVISION_STATUS_LABELS[revision.status] || revision.status}" ส่งซ้ำไม่ได้`;
  }
  return null;
}

/** AE กดตรวจผ่าน → ส่งต่อ AE Sup */
export function productSpecReviewBlock(revision, { role } = {}) {
  if (!revision) return 'ยังไม่มีฉบับให้ตรวจ';
  if (!canReviewProductSpec(role)) return 'ต้องเป็น AE จึงตรวจใบสเปคได้';
  if (revision.status !== 'pending_ae') {
    return revision.status === 'pending_ae_supervisor'
      ? 'ฉบับนี้ผ่าน AE แล้ว รออยู่ที่ AE Sup'
      : 'ฉบับนี้ยังไม่ได้ส่งมาให้ตรวจ';
  }
  return null;
}

/** AE Sup อนุมัติ */
export function productSpecApproveBlock(revision, { role } = {}) {
  if (!revision) return 'ยังไม่มีฉบับให้อนุมัติ';
  if (!canApproveProductSpec(role)) return 'ต้องเป็น AE Supervisor จึงอนุมัติใบสเปคได้';
  if (revision.status !== 'pending_ae_supervisor') {
    return revision.status === 'approved'
      ? 'ฉบับนี้อนุมัติไปแล้ว'
      : 'ฉบับนี้ยังไม่ผ่านขั้น AE ตรวจ';
  }
  return null;
}

/**
 * ออกฉบับใหม่ (Rev. ถัดไป) ได้ไหม
 *
 * ⚠️ ห้ามมีฉบับที่ยังไม่จบสองใบพร้อมกัน — unique index ของ mig 0364 กันไว้ที่ฐานด้วย
 * แต่จอต้องบอกเหตุก่อนกด ไม่ใช่ปล่อยให้ชน constraint แล้วขึ้น error ภาษาอังกฤษ
 */
export function productSpecNewRevisionBlock(spec, latestRevision, { role } = {}) {
  if (!canDraftProductSpec(role)) return 'ต้องเป็น AC หรือฝ่ายขายจึงออกฉบับใหม่ได้';
  if (!spec) return 'สินค้านี้ยังไม่มีใบสเปค — สร้างใบก่อน';
  if (isSpecRevisionOpen(latestRevision)) {
    return `ฉบับ Rev.${String(latestRevision.revNo).padStart(2, '0')} ยังไม่จบ (${SPEC_REVISION_STATUS_LABELS[latestRevision.status]}) — ปิดฉบับนั้นก่อน`;
  }
  return null;
}

/**
 * ออกเอกสารตาม SO ได้ไหม
 *
 * ⭐ ฉบับที่อนุมัติแล้ว = ออกได้เลย กระดาษเป็นฉบับจริงทันที
 * ⭐ ฉบับที่ยังเดินด่าน = ออกได้ แต่กระดาษเป็น "ฉบับร่าง" (ลายน้ำ) จนฉบับผ่านด่าน
 *    ⇒ เปิดทางไว้เพราะลูกค้ามักขอดูสเปกก่อนที่ใบจะผ่านหัวหน้า
 * 🛑 ฉบับที่ถูกตีกลับ = ออกไม่ได้ ต้องแก้ให้จบก่อน (ฐานก็ตีกลับเหมือนกัน)
 */
export function productSpecIssueBlock(spec, latestRevision, { role, salesOrder } = {}) {
  if (!canDraftProductSpec(role)) return 'ต้องเป็น AC หรือฝ่ายขายจึงออกเอกสารได้';
  if (!salesOrder) return 'ไม่พบใบสั่งขายต้นเรื่อง';
  if (salesOrder.status !== 'approved') {
    return 'ใบสั่งขายยังไม่ผ่านการอนุมัติของ AE Supervisor — ออกใบสเปคได้หลังอนุมัติ';
  }
  if (!spec || !latestRevision) return 'สินค้านี้ยังไม่มีใบสเปค — สร้างใบก่อนจึงออกเอกสารได้';
  if (latestRevision.status === 'rejected') {
    return 'ฉบับล่าสุดถูกตีกลับให้แก้ — แก้ให้จบก่อนจึงออกเอกสารได้';
  }
  return null;
}

/**
 * บรรทัด SO หนึ่งบรรทัดต้องทำอะไรต่อ — ตัวเดียวที่จอ (และแผงบนหน้า SO) ใช้ตัดสิน
 *
 * ⚠️ ห้ามให้จอคิดเอง: สามสถานะนี้หน้าตาใกล้กันมาก (ยังไม่มีใบ / มีใบแต่ยังไม่ออกรอบนี้ /
 * ออกรอบนี้แล้ว) และแต่ละอันมีปุ่มคนละตัว · คิดซ้ำที่จอเมื่อไรมันเพี้ยนจากที่ API ยอม
 */
export function productSpecLineState({
  line, spec, latestRevision, issue, salesOrder, role, scopeReason,
} = {}) {
  if (scopeReason) {
    return { kind: 'out_of_scope', label: 'ไม่ต้องใช้', reason: scopeReason, action: null };
  }
  const revLabel = latestRevision
    ? `Rev.${String(latestRevision.revNo).padStart(2, '0')}`
    : null;
  if (issue && issue.status !== 'void') {
    return {
      kind: 'issued',
      label: SPEC_ISSUE_STATUS_LABELS[issue.status],
      docNo: issue.docNo,
      revLabel: `Rev.${String(issue.revNo).padStart(2, '0')}`,
      reason: null,
      action: 'open',
    };
  }
  const blocked = productSpecIssueBlock(spec, latestRevision, { role, salesOrder });
  if (!spec || !latestRevision) {
    return {
      kind: 'no_spec',
      label: 'ยังไม่มีใบสเปค',
      reason: blocked,
      action: 'create',
      lineId: line?.id || null,
    };
  }
  return {
    kind: 'not_issued',
    label: 'ยังไม่ออกรอบนี้',
    revLabel,
    reason: blocked,
    action: 'issue',
    lineId: line?.id || null,
  };
}
