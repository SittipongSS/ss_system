// ── ด่านของใบสเปคสินค้า FM-SA-04 — ตัวตัดสินล้วน (mig 0364) ──────────────────
//
// ⭐ **เส้นอนุมัติอยู่ที่ "ฉบับ" ไม่ใช่ "การออกเอกสาร"** (มติผู้ใช้ 2026-09-17)
//   เปิดร่าง → ยื่นอนุมัติ → AE Sup อนุมัติ = การอนุมัติ **เนื้อสเปก**
//   ⇒ ออกเอกสารรอบใหม่ด้วยสเปกเดิม ไม่ต้องเดินด่านซ้ำ · ลายเซ็นบนกระดาษคือชุดที่
//     อนุมัติ Rev. นั้นพร้อมวันที่เดิม เพราะลายเซ็นรับรอง *สเปก* ไม่ใช่รอบขาย
//   ⇒ แก้ช่องสเปก = ฉบับใหม่ = เดินด่านใหม่ทั้งเส้น
//
// ⭐ **ลำดับเดียวกับใบเสนอราคา** (มติผู้ใช้ 2026-09-21 · mig 0369) — ร่าง · บันทึก ·
//   ยื่น · อนุมัติ และ **ลบได้** · ขั้น "AE ตรวจ" ของ 0364 ถูกยุบออก เหลือ `pending`
//   ขั้นเดียวที่รออยู่ที่ AE Supervisor
//   🪤 ของเดิมสี่ขั้นแล้วคนที่ตรวจกับคนที่อนุมัติเป็นคนเดียวกันในทางปฏิบัติ ⇒ ทุกใบ
//     ต้องกดสองปุ่มติดกันโดยไม่มีใครอ่านอะไรเพิ่มระหว่างสองปุ่มนั้น
//
// ⚠️ ที่นี่ตอบแค่ "ใครทำอะไรได้ และติดอะไรอยู่" — ไม่แตะฐาน ไม่รู้จัก supabase
// ⚠️ ทุกตัวคืน **เหตุผลเป็นข้อความ** ไม่ใช่ boolean เปล่า เพราะจอต้องบอกเหตุตอนกด
//    (กฎ ui-visibility-rule) · `null` = ทำได้
import { isSuperuser } from '@/lib/permissions';

export const SPEC_REVISION_STATUSES = Object.freeze([
  'draft', 'pending', 'approved', 'rejected', 'superseded',
]);

export const SPEC_REVISION_STATUS_LABELS = Object.freeze({
  draft: 'ฉบับร่าง',
  pending: 'รออนุมัติ',
  approved: 'อนุมัติแล้ว',
  rejected: 'ตีกลับให้แก้',
  superseded: 'ถูกแทนด้วยฉบับใหม่',
});

export const SPEC_ISSUE_STATUS_LABELS = Object.freeze({
  pending: 'รอฉบับอนุมัติ',
  issued: 'ออกเอกสารแล้ว',
  void: 'ยกเลิกแล้ว',
});

/* สามขั้นบนราง เท่ากับรางของใบเสนอราคา — `rejected` ไม่นับเป็นจุด มันคือ *สุขภาพ*
   ของขั้นที่ยืนอยู่ (กติกาเดียวกับรางของคำร้องและของใบสั่งขาย) */
export const SPEC_REVISION_STEPS = Object.freeze(['draft', 'pending', 'approved']);

export const isSpecRevisionOpen = (revision) => Boolean(revision)
  && ['draft', 'pending'].includes(revision.status);

export const isSpecRevisionClosed = (revision) => Boolean(revision)
  && ['approved', 'rejected', 'superseded'].includes(revision.status);

const AE_ROLES = ['ae', 'senior_ae', 'ae_supervisor'];

export const canDraftProductSpec = (role) => isSuperuser(role)
  || ['ac', ...AE_ROLES].includes(role);

export const canApproveProductSpec = (role) => isSuperuser(role) || role === 'ae_supervisor';

/** แก้เนื้อฉบับได้ไหม — ได้เฉพาะฉบับที่ยังไม่ยื่น (หรือผู้อนุมัติเอง) */
export function productSpecEditBlock(revision, { role } = {}) {
  if (!revision) return 'ยังไม่มีฉบับให้แก้ — ต้องสร้างฉบับใหม่ก่อน';
  if (!canDraftProductSpec(role)) return 'ต้องเป็น AC หรือฝ่ายขายจึงแก้ใบสเปคได้';
  if (revision.status === 'approved') {
    return 'ฉบับนี้อนุมัติแล้ว แก้ไม่ได้ — ต้องออกฉบับใหม่ (Rev. ถัดไป)';
  }
  if (revision.status === 'superseded') return 'ฉบับนี้ถูกแทนด้วยฉบับใหม่แล้ว';
  if (revision.status === 'pending' && !canApproveProductSpec(role)) {
    return 'ฉบับนี้ยื่นอนุมัติแล้ว — ดึงกลับมาแก้ก่อนถึงจะแก้ได้';
  }
  return null;
}

/** ยื่นอนุมัติ (ปุ่มเดียวเหมือนใบเสนอราคา — ไม่มีขั้นตรวจคั่นแล้ว) */
export function productSpecSubmitBlock(revision, { role } = {}) {
  if (!revision) return 'ยังไม่มีฉบับให้ยื่น';
  if (!canDraftProductSpec(role)) return 'ต้องเป็น AC หรือฝ่ายขายจึงยื่นใบสเปคได้';
  if (!['draft', 'rejected'].includes(revision.status)) {
    return `ฉบับนี้อยู่สถานะ "${SPEC_REVISION_STATUS_LABELS[revision.status] || revision.status}" ยื่นซ้ำไม่ได้`;
  }
  return null;
}

/** AE Sup อนุมัติ */
export function productSpecApproveBlock(revision, { role } = {}) {
  if (!revision) return 'ยังไม่มีฉบับให้อนุมัติ';
  if (!canApproveProductSpec(role)) return 'ต้องเป็น AE Supervisor จึงอนุมัติใบสเปคได้';
  if (revision.status !== 'pending') {
    return revision.status === 'approved'
      ? 'ฉบับนี้อนุมัติไปแล้ว'
      : 'ฉบับนี้ยังไม่ได้ยื่นอนุมัติ';
  }
  return null;
}

/**
 * ลบได้ไหม — และลบแล้วหายไปแค่ไหน
 *
 * ⭐ กติกาเดียวกับใบเสนอราคา (มติ 21/09): ฉบับร่าง/ที่ถูกตีกลับ คนที่แก้ได้ก็ลบได้ ·
 * แอดมินลบได้ทุกสถานะ
 * 🔴 **แต่ใบที่ออกกระดาษไปแล้วลบไม่ได้ ไม่ว่าใคร** — `product_spec_issues` ถือเลขที่
 * เอกสารที่ออกไปนอกบริษัทแล้ว (`FM-SA-04-DDMMYY-XXX` จากตัวนับที่ไม่เคยใช้เลขซ้ำ)
 * ลบทิ้งคือทำให้เลขที่ยังอยู่บนกระดาษของลูกค้าไม่มีต้นทางในระบบ · ฐานก็กันด้วย
 * FK `ON DELETE RESTRICT` (0364) — ที่นี่แค่บอกเหตุเป็นภาษาคนก่อนกด
 */
export function productSpecDeleteBlock({
  spec, revision, revisions = [], issues = [], role,
} = {}) {
  if (!spec || !revision) return 'ยังไม่มีใบสเปคให้ลบ';
  if (!canDraftProductSpec(role)) return 'ต้องเป็น AC หรือฝ่ายขายจึงลบใบสเปคได้';
  /* ฉบับเดียว = ลบใบทั้งใบ ⇒ กระดาษของทุกฉบับนับเป็นตัวขัด · หลายฉบับ = ลบเฉพาะฉบับนี้
     ⇒ กระดาษของฉบับอื่นไม่เกี่ยว (FK ผูกรายฉบับ) */
  const wholeSpec = productSpecDeleteScope(revisions) === 'spec';
  const live = issues.filter((row) => row && row.status !== 'void'
    && (wholeSpec || row.revisionId === revision.id));
  if (live.length) {
    return `ออกเอกสารไปแล้ว ${live.length} ฉบับ (${live[0].docNo}) — ยกเลิกเอกสารก่อนจึงลบได้`;
  }
  if (isSuperuser(role)) return null;
  if (!['draft', 'rejected'].includes(revision.status)) {
    return revision.status === 'pending'
      ? 'ฉบับนี้ยื่นอนุมัติแล้ว — ดึงกลับก่อนจึงลบได้'
      : `ฉบับที่${SPEC_REVISION_STATUS_LABELS[revision.status] || revision.status}ลบได้เฉพาะแอดมิน`;
  }
  return null;
}

/**
 * ลบแล้วหายไปแค่ไหน — 'spec' = ทั้งใบ (สินค้ากลับไปเป็น "ยังไม่มีใบสเปค") ·
 * 'revision' = เฉพาะฉบับล่าสุด (ฉบับก่อนยังเป็นสเปกที่ใช้อยู่)
 *
 * ⚠️ จอต้องพูดให้ตรงข้อนี้ก่อนกด — "ลบ" สองความหมายที่ปุ่มเดียวกันคือที่มาของ
 * การลบพลาดแบบกู้ไม่ได้ (ไม่มีถังขยะในระบบ)
 */
export function productSpecDeleteScope(revisions = []) {
  return revisions.filter(Boolean).length > 1 ? 'revision' : 'spec';
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
/**
 * ด่านที่มาจาก **ใบสั่งขายกับสิทธิ์** อย่างเดียว — ไม่เกี่ยวว่าสินค้ามีใบสเปคหรือยัง
 *
 * ⚠️ แยกออกมาเพราะปุ่ม "สร้างใบสเปค" ติดได้เฉพาะสองเรื่องนี้ · เอาเหตุ "ยังไม่มีใบสเปค"
 * ไปปิดปุ่มที่มีไว้สร้างใบ = ปุ่มที่กดไม่ได้ตลอดกาลด้วยเหตุผลที่ตัวมันเองแก้ให้อยู่แล้ว
 */
export function productSpecOrderGate({ role, salesOrder } = {}) {
  if (!canDraftProductSpec(role)) return 'ต้องเป็น AC หรือฝ่ายขายจึงออกเอกสารได้';
  if (!salesOrder) return 'ไม่พบใบสั่งขายต้นเรื่อง';
  if (salesOrder.status !== 'approved') {
    return 'ใบสั่งขายยังไม่ผ่านการอนุมัติของ AE Supervisor — ออกใบสเปคได้หลังอนุมัติ';
  }
  return null;
}

export function productSpecIssueBlock(spec, latestRevision, { role, salesOrder } = {}) {
  const orderBlock = productSpecOrderGate({ role, salesOrder });
  if (orderBlock) return orderBlock;
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
  /* ปุ่มสร้างใบติดได้เฉพาะด่านของใบสั่งขาย/สิทธิ์ — ไม่ใช่เหตุ "ยังไม่มีใบสเปค"
     ซึ่งเป็นสิ่งที่ปุ่มนั้นมีไว้แก้ */
  const orderReason = productSpecOrderGate({ role, salesOrder });
  if (!spec || !latestRevision) {
    return {
      kind: 'no_spec',
      label: 'ยังไม่มีใบสเปค',
      reason: orderReason,
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
