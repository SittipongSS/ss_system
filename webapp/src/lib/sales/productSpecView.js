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
  canApproveProductSpec, canDraftProductSpec,
  productSpecApproveBlock, productSpecDeleteBlock, productSpecDeleteScope,
  productSpecEditBlock, productSpecNewRevisionBlock, productSpecSubmitBlock,
} from '@/lib/sales/productSpecWorkflow';

export const revLabel = (revNo) => (revNo == null ? '—' : `Rev.${String(revNo).padStart(2, '0')}`);

const STATUS_COLOR = Object.freeze({
  draft: 'var(--text-3)',
  pending: 'var(--amber)',
  approved: 'var(--green)',
  rejected: 'var(--red)',
  superseded: 'var(--text-3)',
});

export const specStatusColor = (status) => STATUS_COLOR[status] || 'var(--text-3)';

/* รางสามขั้น เท่ากับรางของใบเสนอราคา (มติ 21/09) — `rejected` ไม่เป็นจุดของตัวเอง
   มันคือสุขภาพของขั้นที่ยืนอยู่ (กติกาเดียวกับรางของคำร้อง/ใบสั่งขาย)

   ⚠️ ป้ายของแต่ละขั้นบอก **ชื่อคนที่ทำขั้นนั้น** เหมือนรางของใบเสนอราคา — รางนี้คือ
   ที่เดียวที่บอกว่าใครทำอะไรกับใบนี้ (ใบไม่มีบล็อกผู้รับผิดชอบ) */
export function specWorkflowSteps(revision) {
  const status = revision?.status || 'draft';
  const at = status === 'rejected' ? 0 : Math.max(SPEC_REVISION_STEPS.indexOf(status), 0);
  const labels = [
    { id: 'draft', label: 'เปิดร่าง', hint: revision?.createdByName || 'ผู้เปิดร่าง' },
    {
      id: 'pending',
      label: 'ผู้จัดทำยื่นอนุมัติ',
      hint: status === 'rejected'
        ? 'แก้ตามเหตุผลที่ตีกลับแล้วยื่นใหม่'
        : revision?.submittedByName || 'รอผู้จัดทำ',
    },
    { id: 'approved', label: 'AE Sup อนุมัติ', hint: revision?.approvedByName || 'รออนุมัติ' },
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
    pending: revision.submittedByName ? `ยื่นโดย ${revision.submittedByName}` : null,
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
  spec, revision, revisions = [], issues = [], role, dirty = false,
  onCreate, onSubmit, onApprove, onReject, onWithdraw, onNewRevision, onDelete, onPrint,
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
  const approveBlock = productSpecApproveBlock(revision, { role });
  const newRevBlock = productSpecNewRevisionBlock(spec, revision, { role });
  const deleteBlock = productSpecDeleteBlock({ spec, revision, revisions, issues, role });
  const wholeSpec = productSpecDeleteScope(revisions) === 'spec';

  /* ⚠️ ปุ่มที่ "รอเรา" เป็นปุ่มหลักได้ทีละตัว — สองขั้นไม่มีทางรอคนเดียวพร้อมกัน
     ยกเว้นแอดมิน/หัวหน้าที่ผ่านได้ทุกด่าน ⇒ เรียงตามลำดับงานจริง ใครถึงก่อนได้ก่อน */
  const dirtyBlock = dirty ? 'ยังมีการแก้ที่ไม่ได้บันทึก — กดบันทึกก่อน' : null;
  const primary = (() => {
    if (!submitBlock) {
      return { id: 'submit', label: 'ยื่นอนุมัติ', kind: 'primary', onClick: onSubmit, disabled: Boolean(dirtyBlock), disabledReason: dirtyBlock };
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
      disabledReason: newRevBlock || approveBlock || submitBlock,
    };
  })();

  const secondary = [
    {
      id: 'print',
      label: 'พิมพ์ / ดูตัวอย่าง',
      kind: 'ghost',
      onClick: onPrint,
    },
    {
      id: 'withdraw',
      label: 'ดึงกลับมาแก้ไข',
      kind: 'ghost',
      visible: revision.status === 'pending',
      onClick: onWithdraw,
    },
  ];

  const danger = [
    {
      id: 'reject',
      label: 'ตีกลับให้แก้ไข',
      kind: 'warning',
      visible: canApproveProductSpec(role) && revision.status === 'pending',
      onClick: onReject,
    },
    /* ⚠️ ปุ่มลบ **โชว์เสมอสำหรับคนที่แก้ใบได้** แล้วบอกเหตุตอนกดไม่ได้ (ui-visibility-rule)
       · ป้ายบอกขอบเขตจริงของการลบ ไม่ใช่คำว่า "ลบ" ลอย ๆ เพราะสองความหมายต่างกันมาก */
    {
      id: 'delete',
      label: wholeSpec ? 'ลบใบสเปคสินค้า' : `ลบฉบับร่าง (${revLabel(revision.revNo)})`,
      kind: 'danger',
      visible: mayDraft,
      disabled: Boolean(deleteBlock),
      disabledReason: deleteBlock,
      onClick: onDelete,
    },
  ];

  return { primaryAction: primary, secondaryActions: secondary, dangerActions: danger };
}

/**
 * ข้อความกล่องยืนยันตอนลบ — **ตัวสร้างล้วน** เพื่อให้เทสต์จับได้ว่าพูดตรงขอบเขตจริง
 *
 * 🐞 2026-09-21 บน production: กล่องลบขึ้นข้อความแล้วกดยืนยันได้ error
 * `E.onConfirm is not a function` เพราะจอสร้างก้อนยืนยันด้วยคีย์ `action` ตามหน้า
 * ใบเสนอราคา แต่กล่องยืนยันของหน้านี้อ่าน `onConfirm` ⇒ ปุ่มยืนยันพังทั้งปุ่ม
 * ⇒ ข้อความอยู่ที่นี่ (มีเทสต์) · ตัวลงมืออยู่ที่จอ · คีย์ที่กล่องอ่านมีชุดเดียว
 *
 * ⚠️ คืนคีย์ตามที่ `ConfirmDialog` อ่านเท่านั้น — เพิ่มคีย์ที่กล่องไม่รู้จักคือของที่
 * หายเงียบ (คีย์ `description` ของหน้านี้เคยไม่ถูกส่งต่อ กล่องจึงไม่มีประโยคถามเลย)
 */
export function specDeletePrompt({ productName, revisions = [], revision } = {}) {
  const rows = revisions.filter(Boolean);
  const wholeSpec = productSpecDeleteScope(rows) === 'spec';
  const of = productName ? ` ของ ${productName}` : '';
  const previous = rows[1];
  return {
    title: wholeSpec ? 'ลบใบสเปคสินค้า' : `ลบฉบับร่าง ${revLabel(revision?.revNo)}`,
    description: wholeSpec
      ? `ยืนยันลบใบสเปค${of} หรือไม่`
      : `ยืนยันลบ ${revLabel(revision?.revNo)}${of} หรือไม่`,
    detail: wholeSpec
      ? 'ฉบับทุกฉบับและ checklist ของใบนี้จะถูกลบ สินค้าจะกลับไปเป็น “ยังไม่มีใบสเปค” และกู้จากหน้าจอนี้ไม่ได้'
      : `ลบเฉพาะฉบับร่างนี้ · ${revLabel(previous?.revNo)} ยังเป็นสเปกที่ใช้อยู่ และกู้ฉบับที่ลบจากหน้าจอนี้ไม่ได้`,
    confirmLabel: wholeSpec ? 'ลบใบสเปคสินค้า' : 'ลบฉบับร่าง',
    danger: true,
  };
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
