// ── สิ่งที่หน้าสเปคของสินค้าต้องรู้ — ตัวประกอบภาพล้วน (mig 0370) ──────────────
//
// ⭐ **มติเจ้าของ 21/09/2569** (docs/fm-sa-04-document-model.md): สเปคในฐานข้อมูลเป็น
//   ข้อมูลของสินค้า — ไม่มีเลขรัน ไม่มี Rev ไม่มีด่านอนุมัติ · ฝ่ายขายแก้แล้วกดบันทึกได้เลย
//   เลขที่ · Rev · การอนุมัติ อยู่ที่ **เอกสารที่ออกจาก SO** (ดู productSpecDocView.js)
//
// ⚠️ จอห้ามคิดสิทธิ์เอง — `permissions` มาจาก API (`productSpecPermissions` ตัวเดียวกับที่
//    เส้น PATCH/DELETE ถาม) · ที่นี่แค่แปลงเป็นปุ่ม ข้อความ และก้อนที่ส่งบันทึก
// ⚠️ ไฟล์นี้ไม่แตะฐาน ไม่แตะ DOM — จอ import ตรง ๆ และมีเทสต์ครบทุกตัว
import { approvalPrompt } from '@/lib/approvalPrompt';
import { fmtDate } from '@/lib/format';
import { toneColor } from '@/lib/ui/tone';
import { isRetiredAttachment } from '@/lib/master/attachmentTypes';
import { specIllustrationsOf } from '@/lib/sales/productSpecIllustrations';
import { productSpecCertSeed, productSpecChecklistSeed } from '@/lib/sales/productSpecChecklist';
import {
  DOC_REVISION_STATUS_LABELS, DOC_STATUS_LABELS, formatRevLabel,
} from '@/lib/sales/productSpecDocWorkflow';
import { SPEC_CONTENT_FIELDS } from '@/lib/sales/productSpecWorkflow';
import { docRevisionTone, salesOrderHref, specDocumentHref } from '@/lib/sales/productSpecDocView';

/** ปลายทางกระดาษตัวอย่าง (ลายน้ำ "ตัวอย่าง" · ยังไม่มีเลขที่) — HTML ทั้งหน้า เปิดแท็บใหม่ */
export const specSamplePrintHref = (productId) => (productId ? `/api/products/${productId}/spec/document` : null);

/* ── ค่าของฟอร์มจากสเปคที่โหลดมา ───────────────────────────────────────── */

/** ช่องเนื้อหาทั้งแปดเป็นสตริงเสมอ (ช่องกรอกห้ามได้ `null` — React เตือน controlled/uncontrolled) */
export function specFormFrom(spec) {
  return Object.fromEntries(SPEC_CONTENT_FIELDS.map((key) => [key, spec?.[key] ?? '']));
}

export const specItemsFrom = (spec) => (Array.isArray(spec?.items) ? spec.items : []);
export const specCertsFrom = (spec) => (Array.isArray(spec?.certifications) ? spec.certifications : []);

/**
 * ร่างบนจอทั้งชุด `{ form, items, certs }` — มีสเปค = ค่าที่บันทึกไว้ · ยังไม่มี = แถวตั้งต้นของกระดาษ
 *
 * ⭐ **ฟอร์มสร้างกับฟอร์มแก้คือฟอร์มเดียว** (AGENTS.md) — ยังไม่มีสเปคก็กรอกได้เลยบนฟอร์มเดียวกัน
 *    แล้วกด "สร้างสเปคสินค้า" ทีเดียว ไม่ต้องสร้างใบเปล่าก่อนแล้วค่อยกลับมากรอก
 * ⚠️ แถวตั้งต้นเท่ากับที่ server เติมให้เมื่อไม่ส่งมา (17 แถว checklist + 4 แถวเอกสาร) —
 *    ใช้ตัวสร้างตัวเดียวกัน จอกับของที่บันทึกจึงไม่ต่างกัน
 */
export function specDraftFrom(spec) {
  return {
    form: specFormFrom(spec),
    items: spec ? specItemsFrom(spec) : productSpecChecklistSeed(),
    certs: spec ? specCertsFrom(spec) : productSpecCertSeed(),
  };
}

/**
 * ก้อนที่ส่ง `POST/PATCH /api/products/[id]/spec` — `{ content, certifications, items }`
 *
 * ⚠️ **ส่งทั้งชุดทุกครั้ง** — `certifications`/`items` ที่ส่งมา = ทับทั้งชุด (แถวที่หายไปคือแถวที่
 *    ถูกลบ) · ส่งเฉพาะคีย์ที่ตัวตรวจฝั่ง server อ่าน ไม่ลาก `id/specId/createdAt` ของแถวเดิมไป
 * ⚠️ `expectedUpdatedAt` = กันเขียนทับคนอื่น (อีกแท็บบันทึกไปก่อน ⇒ 409) · ไม่มีสเปค = ไม่ส่ง
 */
export function specSaveBody({ form, items = [], certs = [], expectedUpdatedAt } = {}) {
  return {
    content: Object.fromEntries(SPEC_CONTENT_FIELDS.map((key) => [key, String(form?.[key] ?? '')])),
    certifications: (certs || []).filter(Boolean).map((row) => ({
      key: row.key || null,
      label: row.label || '',
      status: row.status || '',
      note: row.note || '',
    })),
    items: (items || []).filter(Boolean).map((row) => ({
      itemKey: row.itemKey || null,
      itemLabel: row.itemLabel || '',
      detail: row.detail || '',
      preparedByS: Boolean(row.preparedByS),
      preparedByCustomer: Boolean(row.preparedByCustomer),
      note: row.note || '',
    })),
    ...(expectedUpdatedAt ? { expectedUpdatedAt } : {}),
  };
}

/* ── การ์ดจัดการ ─────────────────────────────────────────────────────────── */

/** พาดหัวสถานะของสเปค — ไม่มี Rev ไม่มีขั้น เหลือแค่ "มี/ไม่มี" กับ "บันทึกแล้วหรือยัง" */
export function specHeadline({ spec, dirty = false } = {}) {
  if (!spec) {
    return {
      status: 'ยังไม่มีสเปค',
      sub: 'สร้างครั้งเดียว ใช้ออกเอกสาร FM-SA-04 ได้ทุกใบสั่งขาย',
      color: toneColor('neutral'),
    };
  }
  if (dirty) {
    return {
      status: 'มีการแก้ที่ยังไม่บันทึก',
      sub: 'กดบันทึกก่อนออกจากหน้านี้ — ของที่พิมพ์ค้างยังไม่เข้าระบบ',
      color: toneColor('warning'),
    };
  }
  const when = spec.updatedAt ? fmtDate(spec.updatedAt) : null;
  /* ⚠️ ไม่ถอยไปชื่อผู้สร้าง — แถวที่ถูกแตะโดย migration (0370 ย้ายเนื้อสเปคแล้วขยับ updatedAt)
     ไม่มีผู้แก้ ถอยไปแล้วจอจะบอกว่าผู้สร้างเป็นคนแก้เมื่อวันที่รัน migration */
  const who = spec.updatedByName || null;
  return {
    status: 'บันทึกแล้ว',
    sub: when ? `แก้ล่าสุด ${when}${who ? ` โดย ${who}` : ''}` : null,
    color: toneColor('success'),
  };
}

const DIRTY_PRINT_BLOCK = 'มีการแก้ที่ยังไม่บันทึก — กระดาษตัวอย่างพิมพ์จากสเปคที่บันทึกแล้ว กดบันทึกก่อน';

/**
 * ปุ่มบนการ์ดจัดการ → `{ primaryAction, secondaryActions, dangerActions }` ของ DocumentControlCard
 *
 * ⚠️ ไม่มีสิทธิ์แก้ = ไม่มีปุ่มบันทึก/สร้าง/ลบเลย (ui-visibility-rule) · ลบติดเอกสาร = โชว์พร้อมเหตุ
 * ⚠️ "บันทึกแล้ว" ตอนไม่มีอะไรเปลี่ยน = `disabled` เปล่า ๆ ได้ (ไม่มีของให้ทำ ไม่ใช่ติดด่าน)
 */
export function specControlActions({
  spec, productId, permissions, scopeReason = null, dirty = false,
  onCreate, onSave, onDelete,
} = {}) {
  const canEdit = Boolean(permissions?.canEdit);
  if (!spec) {
    return {
      primaryAction: {
        id: 'create',
        label: 'สร้างสเปคสินค้า',
        kind: 'save',
        visible: canEdit,
        // นอกขอบเขต (หมวด 03/04) — มีสิทธิ์แต่สินค้าชิ้นนี้ไม่มีสเปคให้ตกลง ⇒ โชว์พร้อมเหตุ
        disabled: Boolean(scopeReason),
        disabledReason: scopeReason || null,
        onClick: onCreate,
      },
      secondaryActions: [],
      dangerActions: [],
    };
  }
  const deleteGate = permissions?.delete || { visible: false, reason: null };
  return {
    primaryAction: {
      id: 'save',
      label: dirty ? 'บันทึกสเปค' : 'บันทึกแล้ว',
      kind: 'save',
      visible: canEdit,
      disabled: !dirty,
      disabledReason: null,
      onClick: onSave,
    },
    /* ⚠️ พิมพ์ตัวอย่างเป็น **ลิงก์แท็บใหม่** ไม่ใช่ `window.open` ในปุ่ม — เส้นนี้คืน HTML ทั้งหน้า
       (ข้อยกเว้นเอกสารเดี่ยวของ apiFetch) และลิงก์ `_blank` ไม่โดนตัวกันออกจากหน้าดักกลางทาง */
    secondaryActions: [{
      id: 'print',
      label: 'พิมพ์ตัวอย่าง',
      kind: 'print',
      href: specSamplePrintHref(productId || spec.productId),
      external: true,
      disabled: dirty,
      disabledReason: dirty ? DIRTY_PRINT_BLOCK : null,
    }],
    dangerActions: [{
      id: 'delete',
      label: 'ลบสเปคสินค้า',
      kind: 'delete',
      visible: Boolean(deleteGate.visible),
      disabled: Boolean(deleteGate.reason),
      disabledReason: deleteGate.reason || null,
      onClick: onDelete,
    }],
  };
}

/** บรรทัดใต้หัวการ์ดจัดการ — นับเอกสารที่ออกจากสเปคนี้ (รวมใบที่ยกเลิก เพราะเลขที่ถูกใช้ไปแล้ว) */
export function specControlDescription({ spec, documents = [] } = {}) {
  if (!spec) return 'หนึ่งสินค้าหนึ่งสเปค — ไม่มีเลขที่ ไม่มี Rev';
  const rows = (documents || []).filter(Boolean);
  if (!rows.length) return 'ยังไม่เคยออกเอกสารจากสเปคนี้';
  const voided = rows.filter((doc) => doc.status === 'void').length;
  return `ออกเอกสารจากสเปคนี้แล้ว ${rows.length} ใบ${voided ? ` (ยกเลิก ${voided})` : ''}`;
}

/**
 * ข้อความกล่องยืนยันตอนลบสเปค — คีย์ตามที่ `ConfirmDialog` อ่าน
 *
 * 🐞 2026-09-21 กล่องลบเคยกดยืนยันแล้วได้ `onConfirm is not a function` เพราะก้อนยืนยันใช้คีย์
 *    คนละชุดกับที่กล่องอ่าน ⇒ ข้อความอยู่ที่นี่ (มีเทสต์) ตัวลงมืออยู่ที่จอ
 * ⚠️ ลบแล้วกู้จากหน้าจอไม่ได้ (ระบบไม่มีถังขยะ) ⇒ ต้องพูดตรง ๆ
 */
export function specDeletePrompt({ productName } = {}) {
  return {
    ...approvalPrompt({
      title: 'ลบสเปคสินค้า',
      verb: 'ลบสเปคของ',
      subject: productName || 'สินค้านี้',
      irreversible: true,
      effects: [
        'เนื้อสเปค checklist และเอกสารที่ขอได้ของสินค้านี้ถูกลบทั้งหมด',
        'สินค้ากลับไปเป็น "ยังไม่มีสเปค" — ออกเอกสาร FM-SA-04 จากใบสั่งขายไม่ได้จนกว่าจะสร้างใหม่',
        'รูปประกอบยังอยู่กับสินค้า ไม่ถูกลบตาม',
        'กู้คืนจากหน้าจอไม่ได้ ต้องกรอกใหม่ทั้งหมด',
      ],
      confirmLabel: 'ลบสเปคสินค้า',
    }),
    danger: true,
  };
}

/** ช่องที่ยังว่าง — บอกความพร้อมโดยไม่บังคับ (ไม่มีช่องไหนบังคับตามกระดาษ) */
export function specReadiness({ form, items = [] } = {}) {
  const has = (value) => Boolean(String(value ?? '').trim());
  const rows = (items || []).filter(Boolean);
  const filled = rows.filter((row) => has(row.detail) || row.preparedByS || row.preparedByCustomer);
  return [
    {
      id: 'spec',
      label: 'สเปคของสินค้า',
      detail: 'ลักษณะเนื้อสาร · บรรจุภัณฑ์มาตรฐาน',
      ready: has(form?.texture) && has(form?.standardPackaging),
    },
    {
      id: 'market',
      label: 'ตำแหน่งทางการตลาด',
      detail: 'กลุ่มเป้าหมาย · จุดขาย · ระดับราคา',
      ready: has(form?.targetGroup) && has(form?.keySellingPoint) && has(form?.pricingTier),
    },
    {
      id: 'functional',
      label: 'คุณสมบัติผลิตภัณฑ์',
      detail: 'ประสิทธิภาพ · ระยะเวลา · ปริมาณแนะนำ',
      ready: has(form?.productBenefit) && has(form?.longevity) && has(form?.dosagePerUse),
    },
    {
      id: 'checklist',
      label: 'Checklist บรรจุภัณฑ์',
      detail: `กรอกแล้ว ${filled.length}/${rows.length} แถว`,
      ready: rows.length > 0 && filled.length === rows.length,
    },
  ];
}

/* ── เอกสารที่ออกจากสเปคนี้ (หน้าสเปค + การ์ดบนหน้าสินค้า) ───────────────── */

/**
 * แถวตาราง "เอกสารที่ออกจากสเปคนี้" — เลขที่ · Rev ล่าสุด · สถานะ · ใบสั่งขาย
 *
 * ⚠️ ใบที่ยกเลิกยังอยู่ในตาราง — เลขที่ออกไปแล้ว และมันคือเหตุที่ลบสเปคไม่ได้
 * ⚠️ `inUseRevLabel` = Rev ที่อนุมัติครบแล้วและยังใช้อยู่ (`currentRevNo`) — ต่างจาก Rev ล่าสุด
 *    ตอนกำลังแก้ Rev ถัดไป (ฉบับเดิมยังเป็นฉบับที่ใช้จนกว่าฉบับใหม่จะอนุมัติ)
 */
export function specDocumentRows(documents = []) {
  return (documents || []).filter(Boolean).map((doc) => {
    const isVoid = doc.status === 'void';
    const latest = doc.latest || null;
    const inUse = doc.currentRevNo === null || doc.currentRevNo === undefined ? null : Number(doc.currentRevNo);
    return {
      id: doc.id,
      docNo: doc.docNo || null,
      href: specDocumentHref(doc.id),
      revLabel: latest ? formatRevLabel(latest.revNo) : null,
      inUseRevLabel: inUse !== null && latest && inUse !== Number(latest.revNo) ? formatRevLabel(inUse) : null,
      statusLabel: isVoid
        ? DOC_STATUS_LABELS.void
        : latest ? (DOC_REVISION_STATUS_LABELS[latest.status] || latest.status) : null,
      tone: isVoid ? 'neutral' : docRevisionTone(latest?.status),
      orderNumber: doc.orderNumber || null,
      orderHref: salesOrderHref(doc.salesOrderId),
      createdAt: doc.createdAt || null,
      isVoid,
    };
  });
}

/* ── ภาพประกอบ ─────────────────────────────────────────────────────────── */

/** ภาพที่ถูกปลดระวาง — เอกสารที่ยื่นแล้วอ้างอยู่ จึงลบไฟล์ไม่ได้ (กระดาษเก่ายังต้องเปิดรูปได้)
    ⚠️ ตัวตัดสินกลางของไฟล์แนบ (`isRetiredAttachment`) ตัวเดียว — ห้ามพิมพ์ชื่อคีย์ซ้ำที่นี่ */
export const isRetiredIllustration = (row) => isRetiredAttachment(row);

/**
 * ภาพประกอบที่จอสเปคแสดงและนับ — ตัวคัดเดียวกับกระดาษ ลบภาพที่ปลดระวางแล้ว
 * ⚠️ ภาพปลดระวางยังอยู่ในกองไฟล์แนบ (ไฟล์ไม่ถูกลบ) — ซ่อนที่จอ ไม่ใช่ลบ
 */
export function liveIllustrations(rows = []) {
  return specIllustrationsOf(rows).filter((row) => !isRetiredIllustration(row));
}

const storedOrder = (row) => {
  const raw = row?.metadata?.sortOrder;
  const value = typeof raw === 'number' ? raw : Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : null;
};

/**
 * แผนเขียนลำดับตอนกดเลื่อนภาพขึ้น/ลง — `[{ id, sortOrder }]` เรียงจากบนลงล่าง
 *
 * 🐞 ของเดิมเขียน `sortOrder` แค่สองแถวที่สลับกัน ⇒ ภาพเก่าที่ **ยังไม่เคยมีลำดับ** (อัปก่อนมี
 *    ฟีเจอร์นี้) ถูกเรียงไว้ท้ายสุดเสมอ: สามภาพที่ไม่มีลำดับ กดเลื่อนภาพที่สามขึ้น ⇒ ภาพสองกับ
 *    สามได้ลำดับ 1–2 แล้วภาพแรก (ไม่มีลำดับ) **กระโดดไปอยู่ท้าย**
 * ⭐ จัดลำดับใหม่ทั้งชุดตามตำแหน่งบนจอ แล้วเขียนเฉพาะแถวที่ค่าที่เก็บไม่ตรงกับตำแหน่งใหม่
 * ⚠️ เรียงบนลงล่างโดยตั้งใจ — ถ้าคำขอกลางทางล้ม แถวที่เขียนแล้วคือส่วนบนของลิสต์ที่ถูกต้องอยู่แล้ว
 *    แถวที่ยังไม่ได้เขียนไม่มีลำดับ ⇒ ไปต่อท้าย ⇒ ลำดับที่เห็นยังเป็นลำดับเดิมหรือลำดับใหม่ ไม่ใช่มั่ว
 *
 * @param rows ลำดับบนจอตอนนี้ (ผ่าน `sortIllustrations` แล้ว)
 */
export function illustrationReorderPlan(rows = [], index, direction) {
  const target = index + direction;
  if (!Array.isArray(rows) || !rows[index] || !rows[target]) return [];
  const next = [...rows];
  [next[index], next[target]] = [next[target], next[index]];
  return next
    .map((row, position) => ({ row, position }))
    .filter(({ row, position }) => storedOrder(row) !== position)
    .map(({ row, position }) => ({ id: row.id, sortOrder: position }));
}
