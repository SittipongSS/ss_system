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
  docRevisionSteps, formatRevLabel, rejectStageOf,
} from '@/lib/sales/productSpecDocWorkflow';
import { SPEC_CONTENT_FIELDS, SPEC_CONTENT_LABELS } from '@/lib/sales/productSpecWorkflow';

/* ── ปลายทางของลิงก์ — ที่เดียว (หน้าสเปค · การ์ดหน้า SO · หน้าเอกสาร ใช้ชุดเดียวกัน) ── */

export const specDocumentHref = (documentId) => (documentId ? `/sales-planning/spec-documents/${documentId}` : null);
// ⚠️ ใบสั่งขายใช้เส้นสั้น /sa/... เหมือนเมนูและกระดิ่ง (next.config rewrite) — ไม่ใช่ /sales-planning
export const salesOrderHref = (orderId) => (orderId ? `/sa/sales-orders/${orderId}` : null);
export const productSpecPageHref = (productId) => (productId ? `/database/products/${productId}/spec` : null);
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

  const danger = [
    make('reject', 'reject', 'ตีกลับให้แก้ไข'),
    make('void', 'cancel', 'ยกเลิกเอกสาร'),
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
 * @param key 'submit' | 'withdraw' | 'aeApprove' | 'supApprove'
 * @returns {object|null} null = คีย์นี้ใช้โมดัลเหตุผล (ดู `docReasonPrompt`)
 */
export function docConfirmPrompt(key, {
  document, latest, revisions = [], dealOwner,
} = {}) {
  const subject = subjectOf(document, latest);
  const rev = formatRevLabel(latest?.revNo);
  const owner = ownerNameOf(dealOwner);
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
    return {
      ...base,
      title: `แก้ไขเอกสาร — ออก ${next}`,
      description: `เปิด ${next} ของ ${subject} หรือไม่`,
      detail: bullets([
        `ได้ ${next} เป็นฉบับร่าง เลขที่เดิม ${docNo}${document?.docNo ? ` (พิมพ์เป็น ${formatSpecDocNo(document.docNo, nextRevNo)})` : ''}`,
        `${current} ยังเป็นฉบับที่ใช้ จนกว่า ${next} จะอนุมัติครบ`,
        `${next} ต้องยื่นและผ่าน AE เจ้าของดีลกับ AE Supervisor ใหม่ทั้งหมด`,
        'เหตุผลนี้ขึ้นในประวัติ Rev ของเอกสาร',
      ]),
      label: 'เหตุผลที่แก้ไข',
      placeholder: 'เช่น ลูกค้าเปลี่ยนหัวสเปรย์เป็นหัวปั๊ม',
      confirmLabel: `ออก ${next}`,
      tone: 'warning',
    };
  }
  if (key === 'void') {
    return {
      ...base,
      title: 'ยกเลิกเอกสาร',
      description: `ยกเลิก ${subject} หรือไม่`,
      detail: bullets([
        `เลขที่ ${docNo} ถูกปิดถาวร — นำกลับมาใช้ไม่ได้`,
        'ทุกปุ่มของเอกสารใบนี้ปิด Rev ที่ค้างอยู่หยุดเดินด่าน',
        'กระดาษทุก Rev ขึ้นลายน้ำ "ยกเลิก"',
        orphan
          ? 'บรรทัดที่เอกสารอ้างถูกถอดจากใบสั่งขายแล้ว — ไม่มีสินค้าให้รับรองต่อ'
          : 'บรรทัดใบสั่งขายนี้ออกเอกสารใบใหม่ได้ (ได้เลขที่ใหม่)',
      ], { irreversible: true }),
      label: 'เหตุผลที่ยกเลิก',
      placeholder: 'เช่น ลูกค้ายกเลิกสินค้ารายการนี้',
      confirmLabel: 'ยกเลิกเอกสาร',
      tone: 'danger',
    };
  }
  return null;
}

/** ข้อความหลังทำสำเร็จ — บอกว่าเอกสารไปอยู่ที่ใครต่อ ไม่ใช่แค่ "สำเร็จ" */
export function docActionDoneMessage(key, { dealOwner } = {}) {
  const owner = ownerNameOf(dealOwner);
  return {
    submit: `ยื่นแล้ว — รอ ${owner || 'AE เจ้าของดีล'} อนุมัติ`,
    withdraw: 'ดึงกลับเป็นฉบับร่างแล้ว',
    aeApprove: 'อนุมัติขั้น AE แล้ว — รอ AE Supervisor',
    supApprove: 'อนุมัติขั้นสุดท้ายแล้ว — ฉบับนี้เป็นฉบับที่ใช้',
    reject: 'ตีกลับให้ AC แก้ไขแล้ว',
    revise: 'เปิด Rev ใหม่เป็นฉบับร่างแล้ว — แก้สเปคที่หน้าสินค้าแล้วยื่นอนุมัติ',
    void: 'ยกเลิกเอกสารแล้ว',
  }[key] || 'ดำเนินการแล้ว';
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
 * @returns {{ source, capturedAt, fields, items, certifications, illustrations, order } | null}
 */
export function docContentSummary({ source, snapshot, spec } = {}) {
  const fromSnapshot = source === 'snapshot';
  const content = fromSnapshot ? snapshot?.spec : spec;
  if (!content) return null;
  const items = fromSnapshot ? snapshot?.items : spec?.items;
  const order = fromSnapshot ? snapshot?.order || null : null;
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

/* ── การ์ด "เอกสารต่อเนื่อง" บนหน้า SO ──────────────────────────────────── */

/**
 * ข้อความโมดัลยืนยันตอน AC กด "ออกเอกสาร" ที่บรรทัด SO
 *
 * 🔴 **กดแล้วเลขที่ถูกใช้ทันทีและคืนไม่ได้** (ตัวนับเดินใน RPC เดียวกับ INSERT) — ยกเลิก
 *    เอกสารทีหลังเลขก็ยังหายไปจากลำดับ ⇒ โมดัลต้องพูดเรื่องนี้ตรง ๆ พร้อมหน้าตาเลขจริงของวันนี้
 * ⚠️ วันที่ในเลขมาจากนาฬิกาไทย (`productSpecDocNoParts` → businessDate) ไม่ใช่ UTC
 */
export function lineIssuePrompt({ line, now = new Date() } = {}) {
  const { prefix } = productSpecDocNoParts(now);
  return approvalPrompt({
    title: 'ออกเอกสาร FM-SA-04',
    verb: 'ออกเอกสารให้',
    subject: [line?.fgCode, line?.description].filter(Boolean).join(' ') || 'บรรทัดนี้',
    irreversible: true,
    effects: [
      // เลขที่ที่คนเห็นบนกระดาษ/จอ = DDMMYY-XXX-RR (Rev.00 ตอนออก)
      `ระบบออกเลขที่ ${formatSpecDocNo(`${prefix}XXX`, 0)} ทันที — เลขที่นี้คืนไม่ได้ ยกเลิกเอกสารภายหลังเลขก็ถูกใช้ไปแล้ว`,
      'ได้ Rev.00 ฉบับร่าง — ยังไม่มีใครต้องอนุมัติจนกว่า AC จะกดยื่นที่หน้าเอกสาร',
      'บรรทัดใบสั่งขายหนึ่งบรรทัดมีเอกสารที่ใช้งานได้ใบเดียว',
    ],
    confirmLabel: 'ออกเอกสาร',
  });
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

/**
 * แถวหนึ่งของการ์ดบนหน้า SO — แปลง `state` (จาก `lineDocumentState` ที่ API คิดแล้ว) เป็นของที่จอวาด
 *
 * ⚠️ ไม่มีสิทธิ์ออก = ไม่มีปุ่ม (บอกแค่ว่าใครเป็นคนออก) · มีสิทธิ์แต่ติดด่าน = ปุ่มอยู่ พร้อม `blocker`
 *    ที่จอบอกตอนกด (GatedAction) — ตรงกับ ui-visibility-rule
 */
export function followUpLineView(row) {
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
    action: state.action === 'issue'
      ? { kind: 'issue', label: 'ออกเอกสาร', blocker: state.reason || null }
      : null,
  };
}
