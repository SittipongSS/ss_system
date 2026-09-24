// ── สิ่งที่จอเอกสาร FM-SA-04 ต้องรู้ — ตัวประกอบภาพล้วน (mig 0370) ─────────────
//
// ⭐ **มติเจ้าของ 21/09/2569** (docs/fm-sa-04-document-model.md): เลขที่ Rev และด่านอนุมัติ
//   เป็นของ **เอกสารที่ออกจากบรรทัด SO** · เส้นอนุมัติ AC ยื่น → AE เจ้าของดีล → AE Supervisor
//
// ⚠️ **จอห้ามคิดด่านเอง** — ปุ่มทุกตัวมาจาก `documentActions` (API คิดแล้วส่งมาใน `actions`)
//    ที่นี่แค่แปลง `{ visible, reason }` เป็นปุ่มบนการ์ดจัดการ + เขียนข้อความโมดัล
//    คิดเงื่อนไขซ้ำที่จอเมื่อไร ปุ่มจะบอกอย่างหนึ่งแล้ว API ทำอีกอย่าง
// ⚠️ ทุกการกระทำต้องมีโมดัลที่ **บอกผลลัพธ์** (กฎ approval-confirm-modals) — ข้อความอยู่ที่นี่
//    (มีเทสต์) ไม่ใช่เขียนกระจายในหน้า · ยืนยันเฉย ๆ ว่า "แน่ใจไหม" = คนกดผ่านโดยไม่อ่าน
// ⚠️ ไฟล์นี้ไม่แตะฐาน ไม่แตะ DOM — หน้าเอกสารกับการ์ดบนหน้า SO import ตรง ๆ
import { approvalPrompt, IRREVERSIBLE_NOTE } from '@/lib/approvalPrompt';
import { fmtDate } from '@/lib/format';
import { toneColor } from '@/lib/ui/tone';
import {
  PRODUCT_SPEC_CERT_STATUS_LABELS, productSpecCertPendingLabel,
} from '@/lib/sales/productSpecChecklist';
import { formatSpecDocNo, productSpecDocNoParts } from '@/lib/sales/productSpecDocNo';
import {
  DOC_REASON_MAX, DOC_REASON_MIN, DOC_REVISION_STATUS_LABELS, DOC_STATUS_LABELS,
  docRevisionSteps, documentExitKey, formatRevLabel, rejectStageOf,
} from '@/lib/sales/productSpecDocWorkflow';
import { SPEC_CONTENT_FIELDS, SPEC_CONTENT_LABELS } from '@/lib/sales/productSpecWorkflow';

/* ── ปลายทางของลิงก์ — ที่เดียว (หน้าสเปค · การ์ดหน้า SO · หน้าเอกสาร ใช้ชุดเดียวกัน) ── */

export const specDocumentHref = (documentId) => (documentId ? `/sales-planning/spec-documents/${documentId}` : null);
// ⚠️ ใบสั่งขายใช้เส้นสั้น /sa/... เหมือนเมนูและกระดิ่ง (next.config rewrite) — ไม่ใช่ /sales-planning
export const salesOrderHref = (orderId) => (orderId ? `/sa/sales-orders/${orderId}` : null);
export const productSpecPageHref = (productId) => (productId ? `/database/products/${productId}/spec` : null);
/* ⭐ หน้า "ออกเอกสาร" ของบรรทัด SO หนึ่งบรรทัด (มติเจ้าของ 23/09/2569 "การสร้างเอกสาร ยังไม่ต้องรันอะไร จนกว่าจะบันทึก
   เอาแบบ คำร้อง แบบใบเสนอราคา") — การ์ดบนหน้า SO พามาที่นี่ · เลขที่ถูกใช้ตอนกด "บันทึก" บนหน้านั้นเท่านั้น
   ⚠️ id อยู่ใน query ⇒ ห่อ `encodeURIComponent` (id วันนี้เป็นตัวอักษรปลอดภัยล้วน แต่ลิงก์ต้องไม่พังวันที่ไม่ใช่) */
const enc = (value) => encodeURIComponent(String(value));
export const specDocumentNewHref = (orderId, lineId) => (orderId && lineId
  ? `/sales-planning/spec-documents/new?order=${enc(orderId)}&line=${enc(lineId)}`
  : null);
/* เส้นอ่านของหน้าออกเอกสาร (ข้อมูล + ด่าน) · เส้นบันทึก (POST ตัวเดิมของการ์ด) · กระดาษร่าง (HTML แท็บใหม่ —
   ข้อยกเว้นเอกสารเดี่ยวของ apiFetch เหมือน `docPrintHref`) — ที่เดียว ห้ามต่อสตริงเองในหน้า */
export const specDocNewApiPath = (orderId, lineId) => (orderId && lineId
  ? `/api/sales-planning/sales-orders/${enc(orderId)}/spec-documents/new?line=${enc(lineId)}`
  : null);
export const specDocCreateApiPath = (orderId) => (orderId
  ? `/api/sales-planning/sales-orders/${enc(orderId)}/spec-documents`
  : null);
export const specDocDraftPreviewHref = (orderId, lineId) => (orderId && lineId
  ? `/api/sales-planning/sales-orders/${enc(orderId)}/spec-documents/preview?line=${enc(lineId)}`
  : null);
/* กระดาษของ Rev หนึ่ง — ⚠️ เส้นนี้คืน **HTML ทั้งหน้า** ไม่ใช่ JSON จึงเปิดเป็นลิงก์แท็บใหม่
   ไม่ผ่าน apiFetch (ข้อยกเว้นเอกสารเดี่ยวใน AGENTS.md) */
export const docPrintHref = (documentId, revNo) => (
  documentId && Number.isFinite(Number(revNo)) && revNo !== null && revNo !== ''
    ? `/api/sales-planning/spec-documents/${documentId}/document?rev=${Number(revNo)}`
    : null
);

/* ── สถานะ → สี ─────────────────────────────────────────────────────────── */

const REVISION_TONE = Object.freeze({
  draft: 'neutral',
  pending_ae: 'info',
  pending_ae_supervisor: 'info',
  approved: 'success',
  rejected: 'danger',
  superseded: 'neutral',
});

/** tone ของ StatusBadge ตามสถานะ Rev — สีจริงแปลงผ่าน `toneColor` ที่เดียว */
export const docRevisionTone = (status) => REVISION_TONE[status] || 'neutral';

const stampText = (name, at) => [name, at ? fmtDate(at) : null].filter(Boolean).join(' · ') || null;

const ownerNameOf = (dealOwner) => dealOwner?.name || null;

/* ⭐ เลขที่ในข้อความบนจอ = รูปเดียวกับกระดาษ `DDMMYY-XXX-RR` (มติ 22/09) — Rev อยู่ในเลขแล้ว ไม่ต่อ "Rev.XX" ซ้ำ
   `baseNoOf` = เลขที่ไม่มี Rev (ตอนพูดถึง "เลขที่" ทั้งใบ เช่น ยกเลิก = เลขที่ปิดถาวรทุก Rev) */
const subjectOf = (document, latest) => (document?.docNo
  ? formatSpecDocNo(document.docNo, latest?.revNo)
  : 'เอกสารใบนี้');
const baseNoOf = (document) => (document?.docNo ? formatSpecDocNo(document.docNo, null) : null);

/**
 * พาดหัวสถานะบนหัวใบ/การ์ดจัดการ — `{ status, sub, tone, color }`
 *
 * ⚠️ บรรทัดรองบอก **คนที่ลงมือล่าสุด** (และเหตุผลเมื่อถูกตีกลับ) — เอกสารไม่มีบล็อก
 *    ผู้รับผิดชอบ พาดหัวกับรางคือที่เดียวที่บอกว่าใครทำอะไร
 */
export function docHeadline({ document, latest, dealOwner } = {}) {
  if (!document) return { status: 'ไม่พบเอกสาร', sub: null, tone: 'neutral', color: toneColor('neutral') };
  if (document.status === 'void') {
    const who = stampText(document.voidedByName, document.voidedAt);
    return {
      status: DOC_STATUS_LABELS.void,
      sub: [who ? `ยกเลิกโดย ${who}` : null, document.voidReason || null].filter(Boolean).join(' — ') || null,
      tone: 'neutral',
      color: toneColor('neutral'),
    };
  }
  const status = latest?.status || 'draft';
  const label = DOC_REVISION_STATUS_LABELS[status] || status;
  const owner = ownerNameOf(dealOwner);
  let sub = null;
  if (status === 'draft') {
    sub = latest?.revNo > 0 && latest?.reason ? `แก้ไขเพราะ: ${latest.reason}` : 'รอ AC ยื่นขออนุมัติ';
  } else if (status === 'pending_ae') {
    const who = stampText(latest.submittedByName, latest.submittedAt);
    sub = [who ? `ยื่นโดย ${who}` : null, `รอ ${owner || 'AE เจ้าของดีล'} อนุมัติ`].filter(Boolean).join(' · ');
  } else if (status === 'pending_ae_supervisor') {
    const who = stampText(latest.aeApprovedByName, latest.aeApprovedAt);
    sub = [who ? `AE อนุมัติโดย ${who}` : null, 'รอ AE Supervisor อนุมัติ'].filter(Boolean).join(' · ');
  } else if (status === 'approved') {
    const who = stampText(latest.supApprovedByName, latest.supApprovedAt);
    sub = who ? `อนุมัติครบโดย ${who}` : 'อนุมัติครบแล้ว';
  } else if (status === 'rejected') {
    const who = stampText(latest.rejectedByName, latest.rejectedAt);
    sub = [who ? `ตีกลับโดย ${who}` : 'ถูกตีกลับ', latest.rejectionReason || null].filter(Boolean).join(' — ');
  }
  const tone = docRevisionTone(status);
  return { status: `${formatRevLabel(latest?.revNo)} · ${label}`, sub, tone, color: toneColor(tone) };
}

/**
 * รางสามขั้น (AC ยื่น → AE อนุมัติ → AE Sup อนุมัติ) ในรูปที่ `WorkflowRail` อ่าน
 *
 * ⭐ **ถูกตีกลับ = ป้ายติดที่ขั้นของคนตีกลับ** ("ตีกลับโดย … · วันที่") ส่วนขั้นปัจจุบันถอยไปที่
 *    "AC ยื่น" เพราะงานกลับไปอยู่ที่ AC — คนอ่านรู้ทั้งว่างานอยู่ที่ใครและใครส่งคืน
 * ⚠️ `WorkflowRail` รู้จักแค่ done/current/pending/cancelled — `todo` ของตัวตัดสินแปลงเป็น
 *    `pending` ที่นี่ (สถานะที่ CSS ไม่รู้จักคือคลาส `undefined` บน DOM)
 */
export function docRailSteps({ document, latest, dealOwner } = {}) {
  const isVoid = document?.status === 'void';
  const owner = ownerNameOf(dealOwner);
  const waiting = {
    submit: 'รอ AC ยื่น',
    ae: owner ? `รอ ${owner}` : 'รอ AE เจ้าของดีล',
    ae_supervisor: 'รอ AE Supervisor',
  };
  return docRevisionSteps(latest).map((step) => {
    let hint;
    if (step.rejected) {
      hint = `ตีกลับโดย ${stampText(latest?.rejectedByName, latest?.rejectedAt) || 'ผู้อนุมัติ'}`;
    } else if (step.state === 'done') {
      hint = stampText(step.byName, step.at) || 'เรียบร้อย';
    } else if (step.state === 'current' && step.id === 'submit' && latest?.status === 'rejected') {
      hint = 'แก้ตามเหตุผลที่ตีกลับแล้วยื่นใหม่';
    } else {
      hint = waiting[step.id];
    }
    return {
      id: step.id,
      // ป้ายของขั้นที่ตีกลับบอกเองว่า "ตีกลับ" — รางไม่มีสีของสถานะนี้ (CSS รู้จักแค่ 4 สถานะ)
      label: step.rejected ? `${step.label} · ตีกลับ` : step.label,
      hint,
      rejected: step.rejected,
      state: isVoid ? 'cancelled' : step.state === 'todo' ? 'pending' : step.state,
    };
  });
}

/* ── ปุ่มบนการ์ดจัดการ ───────────────────────────────────────────────────── */

/* คีย์ของ `documentActions` → action ที่ `PATCH /api/sales-planning/spec-documents/[id]` รับ */
const API_ACTION = Object.freeze({
  submit: 'submit',
  withdraw: 'withdraw',
  aeApprove: 'ae_approve',
  supApprove: 'sup_approve',
  reject: 'reject',
  revise: 'revise',
  void: 'void',
});

export const docApiAction = (key) => API_ACTION[key] || null;

/* ⭐ ลบร่างไม่ได้อยู่ใน `API_ACTION` โดยเจตนา — มันเป็น `DELETE /api/sales-planning/spec-documents/<id>`
   ไม่ใช่ `PATCH { action }` (แถวหายทั้งใบ ไม่ใช่การเปลี่ยนสถานะ) · จอแยกทางด้วยคีย์นี้ ไม่ใช่เดาจากชื่อ */
export const DOC_DELETE_KEY = 'remove';

/** การกระทำที่ต้องมีช่องเหตุผล (โมดัลเหตุผล) — ที่เหลือใช้โมดัลยืนยันที่บอกผลลัพธ์ */
export const DOC_REASON_ACTIONS = Object.freeze(['reject', 'revise', 'void']);

/* ⚠️ ลำดับคงที่ — ปุ่มที่สลับที่ตามสถานะทำให้คนกดผิดปุ่ม · "เดินหน้า" เรียงตามลำดับงานจริง
   ปุ่มหลักคือตัวแรกที่กดได้ (ใครถึงคิวก่อนได้ก่อน) · admin เห็นหลายตัวพร้อมกันได้ */
const FORWARD = Object.freeze([
  { key: 'submit', kind: 'submit', label: (latest) => (latest?.status === 'rejected' ? 'ยื่นใหม่' : 'ยื่นขออนุมัติ') },
  { key: 'aeApprove', kind: 'approve', label: () => 'อนุมัติ (AE เจ้าของดีล)' },
  { key: 'supApprove', kind: 'approve', label: () => 'อนุมัติขั้นสุดท้าย (AE Sup)' },
  { key: 'revise', kind: 'revise', label: (latest) => `แก้ไขเอกสาร (${formatRevLabel((Number(latest?.revNo) || 0) + 1)})` },
]);

/**
 * ปุ่มของหน้าเอกสาร → `{ primaryAction, secondaryActions, dangerActions }` ของ DocumentControlCard
 *
 * @param actions ผล `documentActions` ที่ API ส่งมา (`{ submit: { visible, reason }, … }`)
 * @param onAction `(key) => void` — จอเปิดโมดัลตามคีย์ (ยืนยัน/เหตุผล)
 *
 * ⚠️ ปุ่มที่ติดด่าน = `disabled` + `disabledReason` ⇒ การ์ดวาดเหตุเป็นตัวหนังสือเหนือปุ่ม
 *    (ui-visibility-rule: มีสิทธิ์แต่ติดด่าน = โชว์พร้อมเหตุ) · ไม่มีสิทธิ์ = `visible: false`
 */
export function docControlActions({
  actions = {}, document, latest, onAction = () => {},
} = {}) {
  const make = (key, kind, label) => {
    const gate = actions?.[key] || { visible: false, reason: null };
    return {
      id: key,
      label,
      kind,
      visible: Boolean(gate.visible),
      disabled: Boolean(gate.reason),
      disabledReason: gate.reason || null,
      onClick: () => onAction(key),
    };
  };

  const forward = FORWARD.map((entry) => make(entry.key, entry.kind, entry.label(latest)))
    .filter((button) => button.visible);
  const primary = forward.find((button) => !button.disabled) || forward[0] || null;
  const restForward = forward.filter((button) => button !== primary);

  const printHref = document?.id && latest ? docPrintHref(document.id, latest.revNo) : null;
  const secondary = [
    ...restForward,
    make('withdraw', 'withdraw', 'ดึงกลับมาแก้ไข'),
    ...(printHref ? [{
      id: 'print',
      label: `พิมพ์ ${formatRevLabel(latest.revNo)}`,
      kind: 'print',
      href: printHref,
      external: true,
    }] : []),
  ].filter((button) => button.visible !== false);

  /* ⚠️ "ลบร่างเอกสารถาวร" อยู่ท้ายสุดของช่องอันตราย — ปุ่มเดียวที่ทำให้แถวหายจริง (มติ 23/09 · mig 0375)
     ⭐ **"ยกเลิกเอกสาร" กับ "ลบร่างเอกสารถาวร" ไม่ยืนคู่กันแล้ว** (มติเจ้าของ 23/09/2569 "ซ่อนปุ่มยกเลิกช่วงร่าง")
        — `documentActions` ให้ปุ่มปลายทางทีละตัว (`documentExitKey`): ร่างที่ไม่เคยยื่น = ลบ · ยื่นแล้วแม้ครั้งเดียว = ยกเลิก
        จอนี้ไม่ต้องรู้กติกา แค่วาดตามที่ API ส่งมา (ลำดับในช่องคงที่ ถ้าวันหนึ่งโผล่คู่กันก็ไม่สลับที่)
     ⚠️ **ป้ายยังต้องบอกทั้งของและความถาวร** — "ลบร่าง" เฉย ๆ อ่านเป็นเรื่องเดียวกับ "ยกเลิก" ที่คนคุ้นมือ
        ทั้งที่ยกเลิกเก็บใบไว้ ส่วนลบไม่เหลืออะไร · ทรงเดียวกับปุ่มลบถาวรที่อื่นในระบบ (หน้าใบสั่งขาย
        "ลบฉบับร่างถาวร") ⇒ ความต่างอยู่บนปุ่ม ไม่ใช่เฉพาะในโมดัล */
  const danger = [
    make('reject', 'reject', 'ตีกลับให้แก้ไข'),
    make('void', 'cancel', 'ยกเลิกเอกสาร'),
    make(DOC_DELETE_KEY, 'delete', 'ลบร่างเอกสารถาวร'),
  ].filter((button) => button.visible);

  return { primaryAction: primary, secondaryActions: secondary, dangerActions: danger };
}

/* ── โมดัลยืนยัน (ยื่น · ดึงกลับ · อนุมัติสองขั้น) ──────────────────────────── */

const previousApprovedOf = (revisions = [], latest) => (revisions || [])
  .filter((rev) => rev && rev.status === 'approved' && rev.id !== latest?.id
    && Number(rev.revNo) < Number(latest?.revNo))
  .sort((a, b) => Number(b.revNo) - Number(a.revNo))[0] || null;

/**
 * ข้อความโมดัลยืนยันของการกระทำที่ไม่ต้องมีเหตุผล — คีย์ตามที่ `ConfirmDialog` อ่าน
 * (`title` · `description` · `detail` · `confirmLabel`)
 *
 * ⚠️ ทุกข้อความบอก **สิ่งที่เกิดขึ้นทันทีหลังกด** ผ่าน `approvalPrompt` (บังคับอย่างน้อยหนึ่งผล)
 * @param key 'submit' | 'withdraw' | 'aeApprove' | 'supApprove' | 'remove'
 * @param orphan true = บรรทัด SO ที่เอกสารอ้างถูกถอดแล้ว (โมดัลลบต้องไม่สัญญาว่าออกใบใหม่บนบรรทัดนั้นได้)
 * @returns {object|null} null = คีย์นี้ใช้โมดัลเหตุผล (ดู `docReasonPrompt`)
 */
export function docConfirmPrompt(key, {
  document, latest, revisions = [], dealOwner, orphan = false,
} = {}) {
  const subject = subjectOf(document, latest);
  const rev = formatRevLabel(latest?.revNo);
  const owner = ownerNameOf(dealOwner);
  /* ⭐ ลบร่างที่ยังไม่เคยยื่น (มติเจ้าของ 23/09/2569 · mig 0375) — โมดัลต้องพูดสามเรื่องที่คน
     เข้าใจผิดได้: **เลขที่ถูกเผาถาวร** (ตัวนับไม่ถอย เหมือนร่างใบเสนอราคาที่ถูกลบ) ·
     **บรรทัด SO ว่างและออกใบใหม่ได้ แต่ได้เลขใหม่** · **ไม่มีถังขยะ กดแล้วกู้เองไม่ได้**
     🔴 ต่างจาก "ยกเลิกเอกสาร" ตรงที่ void ยังเหลือใบไว้ในประวัติของบรรทัด — ลบคือไม่เหลืออะไรเลย */
  if (key === DOC_DELETE_KEY) {
    const docNo = baseNoOf(document) || 'เอกสารใบนี้';
    // ⚠️ `tone: 'danger'` — โมดัลของการลบต้องหน้าตาเป็นการลบ (ไอคอนถังขยะ + ปุ่มแดง)
    //    ไม่ใช่กล่องยืนยันธรรมดาแบบการอนุมัติ ซึ่งคนกดผ่านด้วยความเคยชิน
    return { ...approvalPrompt({
      title: 'ลบร่างเอกสาร',
      verb: 'ลบ',
      subject,
      irreversible: true,
      checklist: ['ร่างนี้ยังไม่เคยยื่นให้ใครดู — ยื่นแล้วหรือถูกตีกลับแล้วต้องใช้ "ยกเลิกเอกสาร" แทน'],
      effects: [
        `แถวของเอกสารและ ${rev} หายออกจากระบบ — ไม่มีถังขยะ กู้คืนเองไม่ได้`,
        `เลขที่ ${docNo} ถูกเผาทิ้งถาวร ไม่มีใบไหนได้เลขนี้อีก (ตัวนับไม่ถอยกลับ)`,
        orphan
          ? 'บรรทัดที่เอกสารอ้างถูกถอดจากใบสั่งขายแล้ว — ไม่มีบรรทัดให้ออกใบใหม่'
          : 'บรรทัดใบสั่งขายนี้ว่างอีกครั้ง — ออกเอกสารใบใหม่ได้ทันที และใบใหม่จะได้เลขที่ใหม่',
        'ไม่มีการแจ้งเตือนใคร — ใบนี้ยังไม่เคยเข้าคิวของผู้อนุมัติ',
      ],
      confirmLabel: 'ลบร่างนี้',
    }), tone: 'danger' };
  }
  if (key === 'submit') {
    const again = latest?.status === 'rejected';
    return approvalPrompt({
      title: again ? 'ยื่นเอกสารใหม่' : 'ยื่นเอกสารขออนุมัติ',
      verb: 'ยื่น',
      subject,
      checklist: ['สเปคที่หน้าสินค้าตรงกับที่ตกลงกับลูกค้าแล้ว — ยื่นแล้ว การแก้สเปคที่หน้าสินค้าไม่มีผลกับเอกสารใบนี้'],
      effects: [
        'ระบบถ่ายภาพนิ่งของสเปค · checklist · รูปประกอบ · ข้อมูลสินค้า และบรรทัดใบสั่งขาย ณ ตอนนี้ลงเอกสาร',
        `เอกสารไปรอ ${owner ? `${owner} (AE เจ้าของดีล)` : 'AE เจ้าของดีล'} อนุมัติ และระบบแจ้งเตือนผู้อนุมัติ`,
        ...(again ? ['รอยตีกลับรอบก่อนถูกล้าง — เอกสารเดินด่านใหม่ตั้งแต่ขั้น AE'] : []),
        'คุณยังดึงกลับมาแก้ได้จนกว่าจะอนุมัติครบ',
      ],
      confirmLabel: again ? 'ยื่นใหม่' : 'ยื่นขออนุมัติ',
    });
  }
  if (key === 'withdraw') {
    return approvalPrompt({
      title: 'ดึงกลับมาแก้ไข',
      verb: 'ดึงกลับ',
      subject,
      effects: [
        `เอกสารกลับเป็นฉบับร่าง ${rev} (เลข Rev ไม่ขยับ) — ผู้อนุมัติไม่เห็นในคิวอีก`,
        'ภาพนิ่งและตราประทับการยื่น/อนุมัติของรอบนี้ถูกล้าง',
        'ยื่นใหม่แล้วต้องผ่านทั้ง AE เจ้าของดีลและ AE Supervisor อีกครั้ง',
      ],
      confirmLabel: 'ดึงกลับมาแก้ไข',
    });
  }
  if (key === 'aeApprove') {
    return approvalPrompt({
      title: 'อนุมัติเอกสาร — ขั้น AE',
      subject,
      checklist: [
        'สเปคในภาพนิ่งตรงกับที่ตกลงกับลูกค้า',
        'สินค้า จำนวน และกำหนดส่งตรงกับบรรทัดใบสั่งขาย',
      ],
      effects: [
        'ชื่อคุณลงช่อง Account Executive บนเอกสาร',
        'เอกสารไปรอ AE Supervisor อนุมัติขั้นสุดท้าย และระบบแจ้งเตือนหัวหน้าฝ่ายขายทุกคน',
        `${rev} ยังไม่ใช่ฉบับที่ใช้ จนกว่า AE Supervisor จะอนุมัติ`,
      ],
      confirmLabel: 'อนุมัติ (ขั้น AE)',
    });
  }
  if (key === 'supApprove') {
    const previous = previousApprovedOf(revisions, latest);
    return approvalPrompt({
      title: 'อนุมัติขั้นสุดท้าย',
      subject,
      irreversible: true,
      checklist: ['สเปคในภาพนิ่งตรงกับที่ตกลงกับลูกค้า และ AE เจ้าของดีลอนุมัติแล้ว'],
      effects: [
        'ชื่อคุณลงช่อง Account Executive Supervisor บนเอกสาร',
        `${rev} กลายเป็นฉบับที่ใช้ของเลขที่ ${baseNoOf(document) || 'นี้'}`,
        ...(previous ? [`${formatRevLabel(previous.revNo)} ที่ใช้อยู่เดิมกลายเป็น "ถูกแทนด้วย Rev. ใหม่"`] : []),
        'ระบบตรึงกระดาษฉบับนี้ไว้ — พิมพ์ซ้ำเมื่อไรก็ได้หน้าตาเดิม',
        'ระบบแจ้งเตือนผู้ยื่นและ AE เจ้าของดีล',
        `แก้ภายหลังต้องกด "แก้ไขเอกสาร" เพื่อออก ${formatRevLabel((Number(latest?.revNo) || 0) + 1)} แล้วเดินด่านใหม่ทั้งหมด`,
      ],
      confirmLabel: 'อนุมัติขั้นสุดท้าย',
    });
  }
  return null;
}

/* ── โมดัลเหตุผล (ตีกลับ · แก้ไขเอกสาร · ยกเลิก) ─────────────────────────── */

const STAGE_LABEL = Object.freeze({ ae: 'ขั้น AE เจ้าของดีล', ae_supervisor: 'ขั้น AE Supervisor' });

const bullets = (lines, { irreversible = false } = {}) => [
  ...(irreversible ? [`⚠️ ${IRREVERSIBLE_NOTE}`, ''] : []),
  'สิ่งที่จะเกิดขึ้นทันที:',
  ...lines.filter(Boolean).map((line) => `· ${line}`),
].join('\n');

/**
 * ข้อความโมดัลเหตุผล — คีย์ตามที่ `ReasonDialog` อ่าน
 * (`title` · `description` · `detail` · `label` · `placeholder` · `confirmLabel` · `tone` ·
 *  `minLength` · `maxLength`)
 *
 * ⚠️ ความยาวมาจาก `DOC_REASON_MIN/MAX` ตัวเดียวกับที่ API ตรวจ (`docReasonError`)
 * @param key 'reject' | 'revise' | 'void'
 * @param orphan true = เอกสารที่บรรทัด SO ถูกถอดแล้ว (การ์ดบนหน้า SO)
 */
export function docReasonPrompt(key, {
  document, latest, orphan = false,
} = {}) {
  const docNo = baseNoOf(document) || 'เอกสารใบนี้';
  const subject = subjectOf(document, latest);
  const base = { minLength: DOC_REASON_MIN, maxLength: DOC_REASON_MAX };
  if (key === 'reject') {
    const stage = STAGE_LABEL[rejectStageOf(latest)] || 'ขั้นที่รออนุมัติ';
    return {
      ...base,
      title: 'ตีกลับให้แก้ไข',
      description: `ตีกลับ ${subject} ที่${stage}`,
      detail: bullets([
        'เอกสารกลับไปที่ AC พร้อมเหตุผลนี้ และระบบแจ้งเตือนผู้ยื่น',
        'AC แก้สเปคที่หน้าสินค้าแล้วยื่นใหม่ได้ใน Rev เดิม — เลขที่ไม่เปลี่ยน',
        'ยื่นใหม่แล้วต้องเดินด่านตั้งแต่ขั้น AE อีกครั้ง',
      ]),
      label: 'เหตุผลที่ตีกลับ',
      placeholder: 'เช่น ขวดในรายการที่ 2 ยังไม่ตรงกับตัวอย่างที่ลูกค้าอนุมัติ',
      confirmLabel: 'ตีกลับ',
      tone: 'danger',
    };
  }
  if (key === 'revise') {
    const current = formatRevLabel(latest?.revNo);
    const nextRevNo = (Number(latest?.revNo) || 0) + 1;
    const next = formatRevLabel(nextRevNo);
    /* ⭐ มติ 24/09/2569: ผู้อนุมัติกดปุ่มนี้ได้ด้วย แต่ยื่นยังเป็นของสาย AC ⇒ ข้อความพูดกลาง ๆ ว่าใครทำต่อ
       (จริงทั้งกับ AC และผู้อนุมัติ — ไม่ต้องมีช่องบอกบทบาทใน payload) · บอกด้วยว่า Rev ที่เปิดแล้ว **ทิ้งไม่ได้**
       (ไม่มีทางลบ/ปิด Rev · ดึงกลับ/ตีกลับใช้กับร่างไม่ได้) — ทางออกมีแค่ยื่นให้ครบหรือยกเลิกทั้งใบ */
    return {
      ...base,
      title: `แก้ไขเอกสาร — ออก ${next}`,
      description: `เปิด ${next} ของ ${subject} หรือไม่`,
      detail: bullets([
        `ได้ ${next} เป็นฉบับร่าง เลขที่เดิม ${docNo}${document?.docNo ? ` (พิมพ์เป็น ${formatSpecDocNo(document.docNo, nextRevNo)})` : ''}`,
        `${current} ยังเป็นฉบับที่ใช้ จนกว่า ${next} จะอนุมัติครบ`,
        `AC แก้สเปคที่หน้าสินค้าแล้วยื่น ${next} — ระบบแจ้งเตือน AC ผู้ยื่นฉบับก่อนและผู้ออกเอกสาร`,
        `${next} ต้องยื่นและผ่าน AE เจ้าของดีลกับ AE Supervisor ใหม่ทั้งหมด`,
        `${next} ที่เปิดแล้วลบทิ้งไม่ได้ — ต้องยื่นจนอนุมัติ หรือยกเลิกทั้งเอกสาร`,
        'เหตุผลนี้ขึ้นในประวัติ Rev ของเอกสาร',
      ]),
      label: 'เหตุผลที่แก้ไข',
      placeholder: 'เช่น ลูกค้าเปลี่ยนหัวสเปรย์เป็นหัวปั๊ม',
      confirmLabel: `ออก ${next}`,
      tone: 'warning',
    };
  }
  if (key === 'void') {
    /* ⭐ มติ 24/09/2569: ผู้อนุมัติยกเลิกใบที่เคยอนุมัติได้ ⇒ บอกด้วยว่าฉบับที่ใช้อยู่ตายตาม และระบบแจ้งใคร
       🪤 ฉบับที่อนุมัติพูดถึงเฉพาะเมื่อรู้ `currentRevNo` — การ์ดหน้า SO ส่งมาแค่ `{ docNo }` ห้ามเดา */
    const current = document?.currentRevNo !== null && document?.currentRevNo !== undefined
      ? formatRevLabel(document.currentRevNo)
      : null;
    return {
      ...base,
      title: 'ยกเลิกเอกสาร',
      description: `ยกเลิก ${subject} หรือไม่`,
      detail: bullets([
        `เลขที่ ${docNo} ถูกปิดถาวร — นำกลับมาใช้ไม่ได้`,
        ...(current ? [`ฉบับ ${current} ที่อนุมัติแล้วใช้ไม่ได้อีก`] : []),
        'ทุกปุ่มของเอกสารใบนี้ปิด Rev ที่ค้างอยู่หยุดเดินด่าน',
        'กระดาษทุก Rev ขึ้นลายน้ำ "ยกเลิก"',
        orphan
          ? 'บรรทัดที่เอกสารอ้างถูกถอดจากใบสั่งขายแล้ว — ไม่มีสินค้าให้รับรองต่อ'
          : 'บรรทัดใบสั่งขายนี้ออกเอกสารใบใหม่ได้ (ได้เลขที่ใหม่)',
        'ระบบแจ้งเตือน AC ผู้ยื่นและ AE เจ้าของดีล',
      ], { irreversible: true }),
      label: 'เหตุผลที่ยกเลิก',
      placeholder: 'เช่น ลูกค้ายกเลิกสินค้ารายการนี้',
      confirmLabel: 'ยกเลิกเอกสาร',
      tone: 'danger',
    };
  }
  return null;
}

/**
 * ข้อความหลังทำสำเร็จ — บอกว่าเอกสารไปอยู่ที่ใครต่อ ไม่ใช่แค่ "สำเร็จ"
 * @param orphan true = บรรทัด SO ที่เอกสารอ้างถูกถอดแล้ว — toast ของการลบต้องไม่ชวน "ออกใบใหม่บนบรรทัดนี้"
 *               (ไม่มีบรรทัดแล้ว · ข้อความเดียวกับโมดัลลบที่เพิ่งกดผ่านมา)
 */
export function docActionDoneMessage(key, { dealOwner, orphan = false } = {}) {
  const owner = ownerNameOf(dealOwner);
  return {
    submit: `ยื่นแล้ว — รอ ${owner || 'AE เจ้าของดีล'} อนุมัติ`,
    withdraw: 'ดึงกลับเป็นฉบับร่างแล้ว',
    aeApprove: 'อนุมัติขั้น AE แล้ว — รอ AE Supervisor',
    supApprove: 'อนุมัติขั้นสุดท้ายแล้ว — ฉบับนี้เป็นฉบับที่ใช้',
    reject: 'ตีกลับให้ AC แก้ไขแล้ว',
    // ⭐ มติ 24/09: ผู้อนุมัติเปิด Rev ได้แต่ยื่นไม่ได้ ⇒ บอกว่าใครยื่นต่อ · ยกเลิกบอกว่าแจ้งใครแล้ว
    revise: 'เปิด Rev ใหม่เป็นฉบับร่างแล้ว — แก้สเปคที่หน้าสินค้า แล้ว AC ยื่นอนุมัติ',
    void: 'ยกเลิกเอกสารแล้ว — แจ้งเตือน AC ผู้ยื่นและ AE เจ้าของดีลแล้ว',
    // ⭐ บอกด้วยว่าเลขที่ไม่กลับมา ไม่งั้นคนจะรอให้ใบใหม่ได้เลขเดิม (มติ 23/09)
    [DOC_DELETE_KEY]: orphan
      ? 'ลบร่างแล้ว — เลขที่เดิมไม่นำกลับมาใช้'
      : 'ลบร่างแล้ว — เลขที่เดิมไม่นำกลับมาใช้ ออกใบใหม่บนบรรทัดนี้ได้ (เลขใหม่)',
  }[key] || 'ดำเนินการแล้ว';
}

/**
 * แถบเตือน "บรรทัดถูกถอด" บนหน้าเอกสาร — ชี้ปุ่มปลายทางที่ใบนี้มีจริง
 * ⭐ มติ 23/09/2569 "ซ่อนปุ่มยกเลิกช่วงร่าง": ร่างที่ไม่เคยยื่นไม่มีปุ่มยกเลิก ⇒ แถบที่บอก "ยกเลิกเอกสารใบนี้แทน"
 *    บนร่างแบบนั้นคือการส่งคนไปหาปุ่มที่ไม่มีอยู่ · ตัดสินด้วย `documentExitKey` ตัวเดียวกับที่ API ใช้ซ่อนปุ่ม
 * ⚠️ หน้านี้เปิดได้ทุกคนที่เห็น SO (AE · AE Sup · RD · FN …) แต่ปุ่มปลายทางมีแค่ AC/admin
 *    + ผู้อนุมัติบนใบที่เคยอนุมัติแล้ว (มติ 24/09/2569 — `documentActions().void`)
 *    ⇒ คนที่ `actions` ไม่มีปุ่มปลายทางให้ ได้ประโยค "รอ AC …" แทนคำสั่งให้ไปกดปุ่มที่ตัวเองไม่มี
 * @param actions `documentActions` ของคนดู (จาก API) · ไม่ส่ง = ไม่รู้ ⇒ ใช้ประโยคของคนกด (ทรงเดิม)
 * @returns {{ title: string, body: string } | null} null = ใบนี้ไม่มีปุ่มปลายทาง (void แล้ว/ไม่มี Rev)
 */
export function lineRemovedNotice({ document, latest, actions } = {}) {
  const exit = documentExitKey(document, latest);
  if (!exit) return null;
  const canExit = !actions || Boolean(actions.remove?.visible || actions.void?.visible);
  let body;
  if (exit === 'remove') {
    body = canExit
      ? 'ไม่มีสินค้าให้รับรองต่อ — ร่างนี้ยังไม่เคยยื่น ลบร่างทิ้งแทนการเดินด่าน'
      : 'ไม่มีสินค้าให้รับรองต่อ — ร่างนี้ยังไม่เคยยื่น รอ AC ลบร่างทิ้ง';
  } else {
    body = canExit
      ? 'ไม่มีสินค้าให้รับรองต่อ — ยกเลิกเอกสารใบนี้แทนการเดินด่าน'
      : 'ไม่มีสินค้าให้รับรองต่อ — รอ AC ยกเลิกเอกสารใบนี้';
  }
  return { title: 'บรรทัดของใบสั่งขายที่เอกสารนี้อ้างถูกถอดแล้ว', body };
}

/**
 * ลบร่างจากแถว "บรรทัดถูกถอด" บนการ์ดหน้า SO แล้ว **ไม่ได้คำตอบว่าสำเร็จ** — ตัดสินจากการ์ดชุดใหม่
 *
 * 🐞 เน็ตหลุด/เกตเวย์หมดเวลา **หลัง** เซิร์ฟเวอร์ลบไปแล้ว = แถวหายจากการ์ดชุดใหม่ แต่จอเคยขึ้น
 *    "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — …ลองอีกครั้ง" สั่งให้ลองสิ่งที่สำเร็จไปแล้ว (UAT 23/09)
 * @param failure สิ่งที่ `apiJson` โยน (`ApiNetworkError` = ไม่มีคำตอบ · `status` = มีคำตอบแต่ไม่ ok)
 * @param next คำตอบ GET ของการ์ดชุดใหม่ · `null` = โหลดไม่ขึ้น
 * @returns {'done'|'moved'|'retry'}
 *   · `done`  — ใบหายจากการ์ด และคำขอไม่ได้คำตอบที่ตัดสินได้ (เน็ตหลุด/5xx) ⇒ นับว่าลบสำเร็จ (toast สำเร็จ)
 *   · `moved` — เซิร์ฟเวอร์ตอบเหตุจริงแล้ว (409 มีคนยื่นแทรก · 404 มีคนลบไปก่อน) หรือใบยังอยู่แต่ลบไม่ได้แล้ว
 *               ⇒ ปิดโมดัล ย้ายเหตุขึ้นแถบของการ์ด (ปุ่มข้างหลังเปลี่ยนไปแล้ว)
 *   · `retry` — ใบยังลบได้ หรือโหลดการ์ดไม่ขึ้น (ไม่รู้ความจริง) ⇒ คงโมดัล ขึ้นข้อความในโมดัลให้กดใหม่
 * ⚠️ "หายจากการ์ด" ไม่ได้แปลว่าลบเสมอ (มีคนยกเลิกแทรก · SO ออก Rev ย้ายใบไป) ⇒ ยอมนับเป็นลบสำเร็จเฉพาะตอน
 *    ไม่มีคำตอบของเซิร์ฟเวอร์ให้เชื่อ — ถ้ามีคำตอบ (4xx) เชื่อคำตอบนั้นก่อน
 */
export function orphanRemoveFailureOutcome({ failure, next, documentId } = {}) {
  if (!next) return 'retry';
  const orphans = Array.isArray(next.orphans) ? next.orphans : [];
  const fresh = orphans.find((orphan) => orphan?.documentId === documentId);
  if (fresh?.removeAction?.visible) return 'retry';
  const noVerdict = failure?.name === 'ApiNetworkError' || Number(failure?.status) >= 500;
  if (!fresh && noVerdict) return 'done';
  return 'moved';
}

/* ── ประวัติ Rev ────────────────────────────────────────────────────────── */

/**
 * แถวประวัติ Rev (ใหม่ก่อน) — ทุกแถวพิมพ์ได้ (กระดาษของ Rev นั้นเอง)
 * ⚠️ ตราประทับว่างเป็น `null` ให้จอส่ง `naText` เอง — ไม่ประกอบขีดที่นี่
 */
export function docRevisionRows(revisions = [], { documentId, docNo = null } = {}) {
  return [...(revisions || [])].filter(Boolean)
    .sort((a, b) => Number(b.revNo) - Number(a.revNo))
    .map((rev) => ({
      id: rev.id,
      revNo: rev.revNo,
      revLabel: formatRevLabel(rev.revNo),
      // เลขที่ของ Rev นั้น (DDMMYY-XXX-RR) — แต่ละแถวต่างกันแค่สองหลักท้าย
      docNoText: docNo ? formatSpecDocNo(docNo, rev.revNo) : null,
      status: rev.status,
      statusLabel: DOC_REVISION_STATUS_LABELS[rev.status] || rev.status,
      tone: docRevisionTone(rev.status),
      reason: rev.reason || null,
      submitted: stampText(rev.submittedByName, rev.submittedAt),
      aeApproved: stampText(rev.aeApprovedByName, rev.aeApprovedAt),
      supApproved: stampText(rev.supApprovedByName, rev.supApprovedAt),
      rejected: rev.rejectedAt || rev.rejectionReason
        ? [stampText(rev.rejectedByName, rev.rejectedAt), rev.rejectionReason].filter(Boolean).join(' — ')
        : null,
      printHref: docPrintHref(documentId || rev.documentId, rev.revNo),
    }));
}

/* ── เนื้อเอกสารบนจอ (สรุปอ่านอย่างเดียว) ─────────────────────────────── */

/**
 * เนื้อบนจอมาจากไหน — `snapshot` (ภาพนิ่งตอนยื่น) หรือ `live` (สเปคปัจจุบันที่หน้าสินค้า)
 *
 * ⭐ ร่าง = แสดงสดเสมอ (มติ "ร่างที่ยังไม่ยื่นแสดงสด") · ถูกตีกลับ = งานกลับไปอยู่ที่ AC
 *    ซึ่งกำลังแก้สเปค ⇒ แสดงสด ให้เห็นว่ายื่นใหม่แล้วจะได้อะไร (ภาพนิ่งรอบที่ถูกตีกลับยัง
 *    พิมพ์ดูได้จากประวัติ Rev)
 * ⚠️ ยื่นแล้วแต่ภาพนิ่งหาย (ไม่ควรเกิด — CHECK ของ 0370 กันไว้) = `live` ดีกว่าจอว่าง
 */
export function docContentSource(latest) {
  if (!latest) return 'live';
  if (['draft', 'rejected'].includes(latest.status)) return 'live';
  return latest.snapshot ? 'snapshot' : 'live';
}

const PREPARED_BY = (row) => [row?.preparedByS ? 'S&S' : null, row?.preparedByCustomer ? 'ลูกค้า' : null]
  .filter(Boolean).join(' · ') || null;

const certStatusLabel = (row) => {
  if (row?.status === 'ready') return PRODUCT_SPEC_CERT_STATUS_LABELS.ready;
  if (row?.status === 'in_progress') return productSpecCertPendingLabel(row?.key);
  return 'ยังไม่ตอบ';
};

/**
 * สรุปเนื้อเอกสารสำหรับจออ่านอย่างเดียว — รูปเดียวกันทั้งภาพนิ่งและสเปคสด
 *
 * @param source 'snapshot' | 'live'
 * @param snapshot `latest.snapshot` (schemaVersion 1)
 * @param spec สเปคสดจาก `GET /api/products/[id]/spec` (มี items)
 * @param order (สเปคสดเท่านั้น) ก้อนใบสั่งขายรูปเดียวกับ `snapshot.order` — ภาพนิ่งใช้ของตัวเองเสมอ
 * @returns {{ source, capturedAt, fields, items, certifications, illustrations, order } | null}
 */
export function docContentSummary({
  source, snapshot, spec, order: liveOrder = null,
} = {}) {
  const fromSnapshot = source === 'snapshot';
  const content = fromSnapshot ? snapshot?.spec : spec;
  if (!content) return null;
  const items = fromSnapshot ? snapshot?.items : spec?.items;
  /* ก้อนใบสั่งขาย: ภาพนิ่งถือของตัวเอง · สเปคสดไม่มี ⇒ ผู้เรียกส่งมาเองได้ (หน้า "ออกเอกสาร" ส่งของที่กระดาษ
     จะพิมพ์ — `specDocNewOrderFacts`) · ไม่ส่ง = ไม่มีแถวใบสั่งขาย (ร่างบนหน้าเอกสารเดิม) */
  const order = fromSnapshot ? snapshot?.order || null : liveOrder;
  return {
    source: fromSnapshot ? 'snapshot' : 'live',
    capturedAt: fromSnapshot ? snapshot?.capturedAt || null : null,
    fields: SPEC_CONTENT_FIELDS.map((key) => ({
      key, label: SPEC_CONTENT_LABELS[key], value: content?.[key] || null,
    })),
    items: (Array.isArray(items) ? items : []).map((row, index) => ({
      no: index + 1,
      label: row?.itemLabel || null,
      detail: row?.detail || null,
      preparedBy: PREPARED_BY(row),
      note: row?.note || null,
    })),
    certifications: (Array.isArray(content?.certifications) ? content.certifications : []).map((row) => ({
      label: row?.label || null,
      statusLabel: certStatusLabel(row),
      note: row?.note || null,
    })),
    // สเปคสดไม่รู้ว่าจะถ่ายรูปไหน (ถ่ายตอนยื่น) ⇒ `null` = "ดูที่หน้าสินค้า" ไม่ใช่ "ไม่มีรูป"
    illustrations: fromSnapshot
      ? (Array.isArray(snapshot?.illustrations) ? snapshot.illustrations : []).map((row, index) => ({
        no: index + 1,
        caption: row?.caption || null,
        fileName: row?.fileName || null,
      }))
      : null,
    order: order ? {
      orderNumber: order.orderNumber || null,
      lineDescription: order.lineDescription || null,
      qty: order.qty ?? null,
      unit: order.unit || null,
      deliveryDueDate: order.deliveryDueDate || null,
      customerName: order.customerName || null,
      dealOwnerName: order.dealOwnerName || null,
    } : null,
  };
}

/**
 * บรรทัดใต้การ์ด "ภาพประกอบ" ตอนเนื้อยังเป็นสเปคสด (ยังไม่มีภาพนิ่ง)
 *
 * 🐞 ผลตรวจสด 23/09: หน้าออกเอกสารเขียนแค่ "ดูภาพได้ที่หน้าสเปคของสินค้า" ขณะที่กระดาษร่างพิมพ์ 5 ภาพ
 *    ⇒ คนที่อ่านแต่จอแล้วกดบันทึก ไม่รู้ว่าจะมีภาพอะไรไปอยู่บนเอกสาร · จอที่เป็นจุดตัดสินใจต้องบอกอย่างน้อย "กี่ภาพ"
 * ⚠️ `null` = ผู้เรียกไม่ได้นับมา (หน้าเอกสารที่ยังเป็นร่าง) — ไม่ใช่ "ไม่มีภาพ" ⇒ ข้อความเดิม ไม่เดาเลข
 */
export function liveIllustrationNote(count) {
  if (count === null || count === undefined) return 'ดูและจัดลำดับภาพได้ที่หน้าสเปคของสินค้า';
  if (!count) return 'หน้าสเปคของสินค้ายังไม่มีภาพประกอบ — เอกสารใบนี้จะไม่มีภาพ';
  return `${count} ภาพจากหน้าสเปคจะถูกถ่ายลงเอกสารตอนยื่น — ดูภาพจริงได้ที่ปุ่ม "ดูตัวอย่างกระดาษ" หรือหน้าสเปคของสินค้า`;
}

/* ── หน้า "ออกเอกสาร" (ยังไม่บันทึก · มติเจ้าของ 23/09/2569) ─────────────────────────── */

/**
 * หน้าตาเลขที่ที่จะได้ถ้าบันทึกวันนี้ — `DDMMYY-XXX-00` (XXX = ลำดับที่ตัวนับให้ตอนบันทึก รู้ล่วงหน้าไม่ได้)
 * ⚠️ วันที่ในเลขมาจากนาฬิกาไทย (`productSpecDocNoParts` → businessDate) ไม่ใช่ UTC
 */
export function specDocNextNumberText(now = new Date()) {
  const { prefix } = productSpecDocNoParts(now);
  return formatSpecDocNo(`${prefix}XXX`, 0);
}

export const SPEC_DOC_NEW_FOOTER = 'เลขที่เอกสารออกตอนกดบันทึก และใช้ซ้ำไม่ได้ — ยังไม่มีอะไรถูกบันทึกจนกว่าจะกด';

export const SPEC_DOC_NEW_DENIED = 'ออกเอกสาร FM-SA-04 ได้เฉพาะ AC (ผู้ประสานงานฝ่ายขาย) — '
  + 'เอกสารของบรรทัดนี้จะขึ้นบนการ์ด "เอกสารต่อเนื่อง" ของใบสั่งขายเมื่อ AC ออกแล้ว';

/**
 * ก้อนใบสั่งขายของเนื้อเอกสารบนหน้า "ออกเอกสาร" — รูปเดียวกับ `snapshot.order` ที่ `docContentSummary` อ่าน
 * ⭐ จำนวนผลิตมาจาก `quantity` ที่ API อ่านด้วยตัวเดียวกับกระดาษ (บรรทัด SO ก่อน ถอยบรรทัดใบเสนอราคา)
 *    ไม่ใช่ `line.qty` ดิบ — ไม่งั้นจอบอก "—" ขณะที่กระดาษพิมพ์จำนวนจากใบเสนอราคา
 */
export function specDocNewOrderFacts(payload) {
  const order = payload?.order || null;
  if (!order) return null;
  return {
    orderNumber: order.orderNumber || null,
    lineDescription: payload?.line?.description || null,
    qty: payload?.quantity?.qty ?? null,
    unit: payload?.quantity?.unit || null,
    deliveryDueDate: order.deliveryDueDate || null,
    customerName: order.customerName || null,
    dealOwnerName: payload?.dealOwner?.name || null,
  };
}

/**
 * หน้า "ออกเอกสาร" อยู่สถานะไหน + ของทุกชิ้นบนการ์ดจัดการ — ตัวเดียวที่หน้า `/sales-planning/spec-documents/new` วาด
 *
 * ⭐ ลำดับการตัดสิน (ui-visibility-rule):
 *   1. ไม่มีสิทธิ์ออก (`gate.visible = false`) ⇒ `denied` — คำบอกแทนฟอร์ม ไม่มีปุ่ม
 *   2. บรรทัดมีเอกสารที่ยังใช้งานอยู่แล้ว ⇒ `exists` — คำบอก + ลิงก์ไปเอกสารใบนั้น (ไม่ใช่ปุ่มบันทึกที่กดแล้วโดน 409)
 *   3. ที่เหลือ ⇒ `form` · ติดด่าน = ปุ่ม "บันทึก" อยู่แต่กดไม่ได้พร้อมเหตุเป็นตัวหนังสือ (`disabledReason`)
 * ⚠️ **ด่านมาจาก API (`documentCreateGate` ตัวเดียวกับ POST)** — ที่นี่ไม่คิดเงื่อนไขเอง แค่แปลงเป็นปุ่ม
 * ⚠️ ปุ่ม "ยกเลิก" เป็นลิงก์กลับใบสั่งขายเฉย ๆ — ยังไม่มีอะไรถูกบันทึก จึงไม่มีอะไรให้ลบหรือยืนยัน
 *
 * @param payload คำตอบของ `GET .../spec-documents/new`
 * @param opts.saving กำลังบันทึกอยู่ (ปุ่มเปลี่ยนคำ + การ์ดทั้งใบ busy)
 * @param opts.onSave ตัวบันทึกของหน้า
 * @param opts.now นาฬิกา (เทสต์) — หน้าตาเลขที่ของวันนี้
 * @returns {{ kind: 'denied'|'exists'|'form', notice: object|null, blocker: string|null, control: object|null,
 *   orderFacts: object|null, editSpecHref: string|null, contentNotice: object|null, contentMeta: string|null,
 *   liveNotice: string|null, backHref: string|null }}
 */
export function specDocNewView(payload, { saving = false, onSave = () => {}, now = new Date() } = {}) {
  const order = payload?.order || null;
  const line = payload?.line || null;
  const gate = payload?.gate || { visible: false, reason: null };
  const backHref = salesOrderHref(order?.id);
  const base = {
    notice: null,
    blocker: null,
    control: null,
    orderFacts: null,
    editSpecHref: null,
    contentNotice: null,
    contentMeta: null,
    liveNotice: null,
    illustrationCount: null,
    backHref,
  };
  if (!gate.visible) {
    return {
      ...base,
      kind: 'denied',
      notice: { tone: 'info', title: 'ไม่มีสิทธิ์ออกเอกสารนี้', message: SPEC_DOC_NEW_DENIED },
    };
  }
  const existing = payload?.existingDocument || null;
  if (existing) {
    return {
      ...base,
      kind: 'exists',
      notice: {
        tone: 'info',
        title: 'บรรทัดนี้ออกเอกสารไปแล้ว',
        message: `เลขที่ ${existing.docNoText || existing.docNo || 'ไม่ทราบเลขที่'} — บรรทัดใบสั่งขายหนึ่งบรรทัดมีเอกสารที่ใช้งานได้ใบเดียว`,
        href: specDocumentHref(existing.id),
        hrefLabel: 'เปิดเอกสาร',
      },
    };
  }

  const blocker = gate.reason || null;
  const owner = payload?.dealOwner?.name || null;
  // ดูกระดาษร่างได้เมื่อมีสเปคให้พิมพ์ และบรรทัดอยู่ในหมวด — เส้นกระดาษตอบหน้าแจ้งเหตุในกรณีอื่นอยู่แล้ว
  // แต่ปุ่มที่พาไปหน้าแจ้งเหตุเสมอไม่ได้บอกอะไรเพิ่มจากเหตุบนปุ่มบันทึก
  const previewable = Boolean(payload?.spec) && Boolean(line?.productId) && !payload?.scopeReason;
  const control = {
    status: 'ยังไม่บันทึก',
    statusDescription: 'ตรวจเนื้อเอกสารก่อนบันทึก — เลขที่ออกตอนกดบันทึก',
    workflowSteps: [
      {
        id: 'save',
        label: 'บันทึกเอกสาร',
        hint: `คุณอยู่ตรงนี้ — ได้เลขที่ ${specDocNextNumberText(now)} (Rev.00 ฉบับร่าง) ตอนกดบันทึก`,
        state: 'current',
      },
      { id: 'submit', label: 'AC ยื่น', hint: 'ที่หน้าเอกสาร — ระบบถ่ายภาพนิ่งของสเปคตอนยื่น', state: 'pending' },
      { id: 'ae', label: 'AE อนุมัติ', hint: owner ? `${owner} (AE เจ้าของดีล)` : 'AE เจ้าของดีล', state: 'pending' },
      { id: 'ae_supervisor', label: 'AE Sup อนุมัติ', hint: 'ขั้นสุดท้าย — ระบบตรึงกระดาษฉบับอนุมัติ', state: 'pending' },
    ],
    primaryAction: {
      id: 'save',
      kind: 'save',
      label: saving ? 'กำลังบันทึก…' : 'บันทึก',
      disabled: Boolean(blocker),
      disabledReason: blocker,
      onClick: onSave,
    },
    secondaryActions: previewable ? [{
      id: 'preview',
      kind: 'print',
      label: 'ดูตัวอย่างกระดาษ',
      href: specDocDraftPreviewHref(order?.id, line?.id),
      external: true,
    }] : [],
    dangerActions: backHref ? [{ id: 'cancel', kind: 'cancel', label: 'ยกเลิก', href: backHref }] : [],
    footer: SPEC_DOC_NEW_FOOTER,
  };
  // "แก้สเปคที่หน้าสินค้า" — เฉพาะคนที่แก้สเปคได้ (ไม่มีสิทธิ์ = ไม่แสดง ไม่ใช่ลิงก์ไปหน้าอ่านอย่างเดียว)
  const editSpecHref = payload?.canEditSpec && !payload?.scopeReason ? productSpecPageHref(line?.productId) : null;
  /* ยังไม่มีเนื้อให้แสดง (ไม่มีสเปค · นอกหมวด · บรรทัดไม่ผูกสินค้า) — การ์ดเนื้อบอกเหตุเดียวกับปุ่มบันทึก
     ⚠️ ไม่เขียน "ยังไม่มีสเปค" ตายตัว — บรรทัดนอกหมวดก็ไม่มีสเปคเหมือนกัน แต่เหตุคนละเรื่อง */
  const contentNotice = payload?.spec ? null : {
    title: payload?.scopeReason || !line?.productId ? 'บรรทัดนี้ไม่มีเนื้อเอกสารให้แสดง' : 'สินค้านี้ยังไม่มีสเปค',
    message: blocker || 'ยังไม่มีสเปคของสินค้าให้แสดง',
    action: editSpecHref ? { href: editSpecHref, label: 'สร้างสเปคที่หน้าสินค้า' } : null,
  };
  return {
    ...base,
    kind: 'form',
    blocker,
    control,
    orderFacts: specDocNewOrderFacts(payload),
    editSpecHref,
    /* จำนวนภาพที่จะถูกถ่ายลงเอกสารตอนยื่น (API นับด้วยตัวเดียวกับกระดาษ) — จอนี้เป็น **จุดตัดสินใจ**
       ⇒ ต้องบอกอย่างน้อยว่ากี่ภาพ · `null` = ไม่ได้นับมา (ไม่มีสเปค/นอกหมวด) ไม่ใช่ "ไม่มีภาพ" */
    illustrationCount: payload?.illustrationCount ?? null,
    contentNotice,
    contentMeta: 'ยังไม่ออกเอกสาร — แสดงสเปคปัจจุบันของสินค้า',
    liveNotice: `ยังไม่ได้บันทึก — เนื้อเอกสารคือสเปคปัจจุบันของสินค้า ระบบถ่ายภาพนิ่งลงเอกสารตอนยื่น${editSpecHref ? ' · แก้ที่หน้าสินค้าแล้วกลับมาบันทึก' : ''}`,
  };
}

/**
 * อ่านหน้า "ออกเอกสาร" ไม่ขึ้น → กล่องที่จอวาด `{ tone, message }`
 * ⚠️ 4xx = คำตอบของระบบ (ใบย้อนหลัง · ไม่พบบรรทัด · นอกขอบเขต) ไม่ใช่ระบบพัง ⇒ กล่องเตือน ไม่ใช่แถบแดง
 *    (กติกาเดียวกับการ์ดบนหน้า SO) · `forbidden` ดิบของ proxy/ด่านขอบเขตแปลเป็นไทยที่นี่
 */
export function specDocNewLoadProblem(error) {
  const status = Number(error?.status) || 0;
  const raw = String(error?.message || '').trim();
  const message = raw === 'forbidden' ? 'คุณไม่มีสิทธิ์เปิดใบสั่งขายนี้' : (raw || 'อ่านข้อมูลเอกสารไม่สำเร็จ');
  return { tone: status >= 400 && status < 500 ? 'warning' : 'error', message };
}

/** toast หลังบันทึกสำเร็จ — เลขที่รูปเดียวกับกระดาษ DDMMYY-XXX-RR (ออกใหม่ = Rev.00) และบอกว่างานไปอยู่ที่ไหนต่อ */
export function specDocSavedMessage(result) {
  const docNo = result?.document?.docNo;
  return docNo
    ? `บันทึกเอกสาร ${formatSpecDocNo(docNo, result?.revision?.revNo ?? 0)} แล้ว — ยื่นอนุมัติได้ที่หน้านี้`
    : 'บันทึกเอกสารแล้ว — ยื่นอนุมัติได้ที่หน้านี้';
}

/* ── ผลกับเอกสาร FM-SA-04 เมื่อ SO ถูกยกเลิก / ออก Rev. (โมดัลบนหน้า SO) ─────────── */

/**
 * จำนวนเอกสาร FM-SA-04 ที่ยังใช้งานของ SO — จากคำตอบ `GET .../sales-orders/[id]/spec-documents`
 * (เส้นเดียวกับการ์ด): บรรทัดที่ออกแล้ว + ใบที่บรรทัดถูกถอด
 * @returns {number|null} `null` = คำตอบไม่ครบรูป (ไม่รู้)
 */
export function liveSpecDocumentCount(payload) {
  if (!payload || !Array.isArray(payload.rows)) return null;
  return payload.rows.filter((row) => row?.state?.kind === 'issued').length
    + (Array.isArray(payload.orphans) ? payload.orphans.length : 0);
}

/**
 * บรรทัดผลลัพธ์เรื่องเอกสาร FM-SA-04 ในโมดัลยกเลิก/ออก Rev. ของ SO (กฎ approval-confirm-modals)
 *
 * ⭐ สองทางนี้ลากเอกสารไปด้วยผ่าน hook ของ API (mig 0370) — ยกเลิก = void ทุกใบ เลขที่ไม่คืน ·
 *    ออก Rev. = ย้ายไปใบใหม่ ฉบับที่อนุมัติแล้วต้องเดินด่านใหม่ ⇒ คนกดต้องรู้ก่อน ไม่ใช่รู้ทีหลัง
 * ⚠️ `count` ไม่รู้ (`null`/`undefined` — กำลังอ่าน/อ่านไม่ขึ้น) = บอกแบบมีเงื่อนไข ดีกว่าเงียบ ·
 *    `0` = ใบนี้ไม่มีเอกสาร ⇒ ไม่ต้องมีบรรทัดนี้
 * @param action 'cancel' | 'revise'
 * @returns {string|null}
 */
export function salesOrderSpecDocEffect(action, count) {
  const known = count !== null && count !== undefined && Number.isFinite(Number(count));
  if (known && Number(count) <= 0) return null;
  const subject = known
    ? `เอกสาร FM-SA-04 ${Number(count)} ใบของใบสั่งขายนี้`
    : 'เอกสาร FM-SA-04 ของใบสั่งขายนี้ (ถ้ามี) ';
  if (action === 'cancel') {
    return `${subject}จะถูกยกเลิกทั้งหมด — เลขที่ไม่นำกลับมาใช้ และกระดาษทุก Rev ขึ้นลายน้ำ "ยกเลิก"`;
  }
  if (action === 'revise') {
    return `${subject}ย้ายไปผูกใบ Rev. ใหม่ เลขที่เดิม — ฉบับที่อนุมัติแล้วได้ Rev ใหม่ที่ต้องอนุมัติครบ 3 ขั้นอีกครั้ง · ฉบับที่รออนุมัติถอยกลับเป็นร่าง`;
  }
  return null;
}

/* ── การ์ด "เอกสารต่อเนื่อง" บนหน้า SO ──────────────────────────────────── */

/**
 * แถวหนึ่งของการ์ดบนหน้า SO — แปลง `state` (จาก `lineDocumentState` ที่ API คิดแล้ว) เป็นของที่จอวาด
 *
 * ⚠️ ไม่มีสิทธิ์ออก = ไม่มีปุ่ม (บอกแค่ว่าใครเป็นคนออก) · มีสิทธิ์แต่ติดด่าน = ปุ่มอยู่ พร้อม `blocker`
 *    ที่จอบอกตอนกด (GatedAction) — ตรงกับ ui-visibility-rule
 * @param opts.orderId ใบสั่งขายของการ์ด — ประกอบลิงก์ไปหน้าออกเอกสาร (`specDocumentNewHref`)
 */
export function followUpLineView(row, { orderId = null } = {}) {
  const state = row?.state || {};
  const line = row?.line || {};
  if (state.kind === 'out_of_scope') {
    return {
      kind: 'out_of_scope', tone: 'neutral', statusLabel: state.label || 'ไม่ต้องใช้', note: state.reason || null,
      docNo: null, docNoText: null, revLabel: null, action: null,
    };
  }
  if (state.kind === 'no_spec') {
    return {
      kind: 'no_spec',
      tone: 'warning',
      statusLabel: state.label || 'ยังไม่มีสเปค',
      note: 'สร้างสเปคที่หน้าสินค้าก่อน จึงออกเอกสารได้',
      docNo: null,
      docNoText: null,
      revLabel: null,
      action: state.action === 'create_spec' && line.productId
        ? { kind: 'create_spec', label: 'สร้างสเปค', href: productSpecPageHref(line.productId) }
        : null,
    };
  }
  if (state.kind === 'issued') {
    return {
      kind: 'issued',
      // สีตามสถานะ Rev ล่าสุด ชุดเดียวกับหน้าสเปค/หน้าเอกสาร — ตีกลับต้องแดง ไม่ใช่เขียวว่า "ออกแล้ว"
      tone: state.revStatus ? docRevisionTone(state.revStatus) : 'neutral',
      statusLabel: state.statusLabel || state.label || 'ออกแล้ว',
      note: null,
      docNo: state.docNo || null,
      docNoText: state.docNoText || (state.docNo ? formatSpecDocNo(state.docNo, null) : null),
      revLabel: state.revLabel || null,
      action: state.documentId
        ? { kind: 'open', label: 'เปิดเอกสาร', href: specDocumentHref(state.documentId) }
        : null,
    };
  }
  return {
    kind: 'not_issued',
    tone: 'info',
    statusLabel: state.label || 'ยังไม่ออก',
    note: state.action === 'issue' ? null : 'AC เป็นผู้ออกเอกสารหลังใบสั่งขายอนุมัติแล้ว',
    docNo: null,
    docNoText: null,
    revLabel: null,
    /* ⭐ "ออกเอกสาร" = **ลิงก์ไปหน้าออกเอกสาร** ไม่ใช่ปุ่มที่ออกเลขทันที (มติเจ้าของ 23/09/2569) — เลขที่ถูกใช้
       ตอนกดบันทึกบนหน้านั้น · ติดด่าน = ปุ่มอยู่ บอกเหตุตอนกด ไม่พาไป (GatedAction) */
    action: state.action === 'issue'
      ? {
        kind: 'issue', label: 'ออกเอกสาร', blocker: state.reason || null, href: specDocumentNewHref(orderId, line.id),
      }
      : null,
  };
}
