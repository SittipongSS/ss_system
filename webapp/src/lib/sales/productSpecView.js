// ── สิ่งที่จอใบสเปคสินค้าต้องรู้ — ตัวตัดสินล้วน (mig 0364) ────────────────────
//
// ⚠️ จอห้ามคิดเงื่อนไขซ้ำ: ด่านทุกตัวมาจาก `productSpecWorkflow` ที่ API ใช้ตัวเดียวกัน
// ⇒ ปุ่มที่จอโชว์กับสิ่งที่ API ยอมเป็นเรื่องเดียวกันเสมอ (กับดักที่ form-design-rules
// §2 เรียกว่า "เงื่อนไขที่ปุ่มรู้แต่ฟอร์มไม่รู้")
//
// ⚠️ **ปุ่มที่กดไม่ได้ต้องโชว์พร้อมเหตุ ไม่ใช่หาย** (กฎ ui-visibility-rule) ⇒ ทุก action
// มี `disabledReason` เป็นข้อความ · `visible: false` เหลือไว้เฉพาะ "ไม่ใช่งานของ role นี้เลย"
import {
  SPEC_REVISION_STATUS_LABELS, SPEC_REVISION_STEPS,
  canApproveProductSpec, canDraftProductSpec, canReviewProductSpec,
  productSpecApproveBlock, productSpecEditBlock, productSpecNewRevisionBlock,
  productSpecReviewBlock, productSpecSubmitBlock,
} from '@/lib/sales/productSpecWorkflow';

export const revLabel = (revNo) => (revNo == null ? '—' : `Rev.${String(revNo).padStart(2, '0')}`);

const STATUS_COLOR = Object.freeze({
  draft: 'var(--text-3)',
  pending_ae: 'var(--amber)',
  pending_ae_supervisor: 'var(--amber)',
  approved: 'var(--green)',
  rejected: 'var(--red)',
  superseded: 'var(--text-3)',
});

export const specStatusColor = (status) => STATUS_COLOR[status] || 'var(--text-3)';

/* รางสี่ขั้น — `rejected` ไม่เป็นจุดของตัวเอง มันคือสุขภาพของขั้นที่ยืนอยู่
   (กติกาเดียวกับรางของคำร้อง/ใบสั่งขาย) */
export function specWorkflowSteps(revision) {
  const status = revision?.status || 'draft';
  const at = status === 'rejected' ? 0 : Math.max(SPEC_REVISION_STEPS.indexOf(status), 0);
  const labels = [
    { id: 'draft', label: 'ร่าง', hint: 'AC กรอกสเปกและ checklist' },
    { id: 'pending_ae', label: 'รอ AE ตรวจ', hint: status === 'rejected' ? 'แก้ตามเหตุผลที่ตีกลับแล้วส่งใหม่' : 'เจ้าของดีลตรวจเนื้อสเปก' },
    { id: 'pending_ae_supervisor', label: 'รอ AE Sup อนุมัติ', hint: 'หัวหน้าฝ่ายขายรับรองสเปก' },
    { id: 'approved', label: 'อนุมัติแล้ว', hint: 'พิมพ์เป็นฉบับจริงได้ · ออกเอกสารตาม SO ได้' },
  ];
  return labels.map((step, index) => ({
    ...step,
    state: index < at ? 'done' : index === at ? (status === 'rejected' ? 'rejected' : 'current') : 'pending',
  }));
}

/** ข้อความพาดหัวสถานะบนการ์ดจัดการ */
export function specStatusHeadline(spec, revision) {
  if (!spec || !revision) {
    return { status: 'ยังไม่มีใบสเปค', sub: 'สร้างใบเพื่อเริ่มกรอกสเปกของสินค้าชิ้นนี้', color: 'var(--text-3)' };
  }
  const label = SPEC_REVISION_STATUS_LABELS[revision.status] || revision.status;
  const who = {
    pending_ae: revision.submittedByName ? `ส่งโดย ${revision.submittedByName}` : null,
    pending_ae_supervisor: revision.reviewedByName ? `ตรวจโดย ${revision.reviewedByName}` : null,
    approved: revision.approvedByName ? `อนุมัติโดย ${revision.approvedByName}` : null,
    rejected: revision.rejectionReason || null,
  }[revision.status] || null;
  return {
    status: `${revLabel(revision.revNo)} · ${label}`,
    sub: who,
    color: specStatusColor(revision.status),
  };
}

/**
 * ปุ่มบนการ์ดจัดการ
 *
 * ⚠️ ลำดับคงที่ไม่ขึ้นกับสถานะ — ปุ่มที่สลับที่ทุกครั้งที่สถานะเปลี่ยนทำให้คนกดผิดปุ่ม
 * ⚠️ `save` ไม่อยู่ที่นี่ — มันเป็นปุ่มของฟอร์ม ไม่ใช่ก้าวของเอกสาร
 */
export function specControlActions({
  spec, revision, role, dirty = false, onCreate, onSubmit, onReview, onApprove, onReject,
  onWithdraw, onNewRevision, onPrint,
}) {
  const mayDraft = canDraftProductSpec(role);
  if (!spec || !revision) {
    return {
      primaryAction: {
        id: 'create',
        label: 'สร้างใบสเปคสินค้า',
        kind: 'accent',
        visible: mayDraft,
        onClick: onCreate,
      },
      secondaryActions: [],
      dangerActions: [],
    };
  }

  const submitBlock = productSpecSubmitBlock(revision, { role });
  const reviewBlock = productSpecReviewBlock(revision, { role });
  const approveBlock = productSpecApproveBlock(revision, { role });
  const newRevBlock = productSpecNewRevisionBlock(spec, revision, { role });

  /* ⚠️ ปุ่มที่ "รอเรา" เป็นปุ่มหลักได้ทีละตัว — สามขั้นไม่มีทางรอคนเดียวพร้อมกัน
     ยกเว้นแอดมิน/หัวหน้าที่ผ่านได้ทุกด่าน ⇒ เรียงตามลำดับงานจริง ใครถึงก่อนได้ก่อน */
  const dirtyBlock = dirty ? 'ยังมีการแก้ที่ไม่ได้บันทึก — กดบันทึกก่อน' : null;
  const primary = (() => {
    if (!submitBlock) {
      return { id: 'submit', label: 'ส่งให้ AE ตรวจ', kind: 'primary', onClick: onSubmit, disabled: Boolean(dirtyBlock), disabledReason: dirtyBlock };
    }
    if (!reviewBlock) {
      return { id: 'review', label: 'ตรวจผ่าน · ส่งต่อ AE Sup', kind: 'primary', onClick: onReview };
    }
    if (!approveBlock) {
      return { id: 'approve', label: 'อนุมัติใบสเปค', kind: 'primary', onClick: onApprove };
    }
    if (!newRevBlock) {
      return { id: 'new-revision', label: `ออกฉบับใหม่ (${revLabel((revision.revNo || 0) + 1)})`, kind: 'accent', onClick: onNewRevision };
    }
    // ไม่มีก้าวที่เราทำได้ — โชว์ก้าวถัดไปของเรื่องพร้อมเหตุที่กดไม่ได้
    return {
      id: 'blocked',
      label: revision.status === 'approved' ? 'ออกฉบับใหม่' : 'รอขั้นถัดไป',
      kind: 'primary',
      disabled: true,
      disabledReason: newRevBlock || approveBlock || reviewBlock || submitBlock,
    };
  })();

  const secondary = [
    {
      id: 'print',
      label: 'พิมพ์ / ดูตัวอย่าง',
      kind: 'ghost',
      onClick: onPrint,
      disabled: true,
      disabledReason: 'เอกสารที่พิมพ์ได้จะมาในรอบถัดไป — ตอนนี้ดูข้อมูลบนหน้านี้ได้',
    },
    {
      id: 'withdraw',
      label: 'ดึงกลับมาแก้ไข',
      kind: 'ghost',
      visible: ['pending_ae', 'pending_ae_supervisor'].includes(revision.status),
      onClick: onWithdraw,
    },
  ];

  const danger = [
    {
      id: 'reject',
      label: 'ตีกลับให้แก้ไข',
      kind: 'warning',
      visible: (canReviewProductSpec(role) || canApproveProductSpec(role))
        && ['pending_ae', 'pending_ae_supervisor'].includes(revision.status),
      onClick: onReject,
    },
  ];

  return { primaryAction: primary, secondaryActions: secondary, dangerActions: danger };
}

/** ช่องที่ยังว่าง — บอกความพร้อมโดยไม่บังคับ (ไม่มีช่องไหนบังคับตามกระดาษ) */
export function specReadiness(revision) {
  if (!revision) return [];
  const has = (value) => Boolean(String(value ?? '').trim());
  const items = (revision.items || []);
  const filledItems = items.filter((row) => has(row.detail) || row.preparedByS || row.preparedByCustomer);
  return [
    { id: 'spec', label: 'สเปกของสินค้า', detail: 'ลักษณะเนื้อสาร · บรรจุภัณฑ์มาตรฐาน', ready: has(revision.texture) && has(revision.standardPackaging) },
    { id: 'market', label: 'ตำแหน่งทางการตลาด', detail: 'กลุ่มเป้าหมาย · จุดขาย · ระดับราคา', ready: has(revision.targetGroup) && has(revision.keySellingPoint) && has(revision.pricingTier) },
    { id: 'functional', label: 'คุณสมบัติผลิตภัณฑ์', detail: 'ประสิทธิภาพ · ระยะเวลา · ปริมาณแนะนำ', ready: has(revision.productBenefit) && has(revision.longevity) && has(revision.dosagePerUse) },
    { id: 'checklist', label: 'Checklist บรรจุภัณฑ์', detail: `กรอกแล้ว ${filledItems.length}/${items.length} แถว`, ready: items.length > 0 && filledItems.length === items.length },
  ];
}

/** แก้ฟอร์มได้ไหม — ตัวเดียวที่ทั้งฟอร์มและปุ่มบันทึกถาม */
export function specFormBlocker(revision, role) {
  return productSpecEditBlock(revision, { role });
}

/**
 * ปุ่มของบรรทัดสินค้าบนหน้าใบสั่งขาย — สามหน้าตามสถานะที่ API ตัดสินมาแล้ว
 *
 * ⚠️ รับ `state` จาก `productSpecLineState` (API ส่งมาในผลลัพธ์) — จอห้ามคิดเอง
 * ⚠️ `reason` ที่ติดมากับ state ทำให้ปุ่มกดไม่ได้ **แต่ยังอยู่** (ui-visibility-rule)
 *    ยกเว้นบรรทัดนอกขอบเขต ซึ่งไม่มีปุ่มเพราะไม่มีงานให้ทำเลย
 */
export function specLineAction(state, { canEdit = false } = {}) {
  if (!state || state.kind === 'out_of_scope') return null;
  if (state.kind === 'issued') {
    return { id: 'open', label: 'เปิดใบสเปค', kind: 'open', disabled: false, reason: null };
  }
  if (!canEdit) {
    return {
      id: 'blocked',
      label: state.kind === 'no_spec' ? 'สร้างใบสเปค' : 'ออกเอกสารรอบนี้',
      kind: state.kind === 'no_spec' ? 'create' : 'issue',
      disabled: true,
      reason: 'ต้องเป็น AC หรือฝ่ายขายจึงออกเอกสารได้',
    };
  }
  if (state.kind === 'no_spec') {
    return { id: 'create', label: 'สร้างใบสเปค', kind: 'create', disabled: Boolean(state.reason), reason: state.reason };
  }
  return { id: 'issue', label: 'ออกเอกสารรอบนี้', kind: 'issue', disabled: Boolean(state.reason), reason: state.reason };
}
