// ── ส่ง FG ให้ RD ลง BOM — กติกากลางชุดเดียว (มติเจ้าของ 03/11/2026 · mig 0419) ─────────────
//
// ⭐ BOM ลงในโปรแกรม **Express** (นอกระบบ) — ระบบนี้ติดตามแค่การส่งมอบ SA → RD และผลของ RD
//    (แม่แบบไทม์ไลน์ NPD ขั้น 34 "ส่งเรื่องให้ RD ลง BOM" · ขั้น 35 "ลง BOM ใน Express")
// ⭐ ขั้นของ RD = คอลัมน์บนสินค้าเดิม (กฎสามชั้น) — ปุ่มอยู่ที่การ์ดจัดการของหน้า FG · RD ทำงานจากคิว /rd/bom
//
// ⚠️ ไฟล์นี้ **ไม่ยิง I/O** — จอ (การ์ดจัดการ · คิว RD) กับ route (`/api/products/[id]/bom` · PATCH สินค้า)
//    ถามฟังก์ชันชุดเดียวกัน ⇒ จอเปิดปุ่มที่ API ตีกลับไม่ได้ และคำว่า "รอรับเรื่อง" แปลว่าอย่างเดียวกันทุกจอ
import { approvalStatusOf } from './approvalStatus.js';
import { categoryOf } from './categoryOf.js';
import { isGiftSetCategory } from './giftSetFormulas.js';
import { isFragranceOilCategory } from './fragranceOilScent.js';
import { normalizeRejectionReason, rejectionReasonError } from './approval.js';

/* มติข้อ 2: กลุ่ม 01 + 02 ทั้งกลุ่ม · 03 ค่าออกแบบ / 04 รายได้อื่น ไม่มีของให้ลง BOM ⇒ ไม่มีปุ่ม (ไม่ใช่ด่าน) */
export const BOM_MAIN_CATEGORIES = Object.freeze(['01', '02']);
/* มติข้อ 3: หมวดตัวเครื่องไม่มีสูตร ⇒ ข้ามข้อ "ผูกสูตร/กลิ่น" (02-024 เครื่องกดสบู่ · 02-035 เครื่องกระจายกลิ่น)
   ⚠️ เป็นเลขหมวดตายตัวแบบ ARTWORK_MAIN_CATEGORIES — มีเคสสวนทางเมื่อไรให้ย้ายไปเป็นช่องติ๊กบนหมวด อย่าต่อรหัส */
export const BOM_NO_FORMULA_CATEGORIES = Object.freeze(['02-024', '02-035']);

/* มติข้อ 5–6: ส่งแล้วล็อกตัวที่เปลี่ยนส่วนผสมใน BOM จริง — ชื่อสินค้า/ลูกค้ายังแก้ได้
   ⚠️ ล็อกที่ **id** ไม่ใช่ชื่อ/รหัสที่ derive จากทะเบียน (formulaName/formulaCode) — RD แก้ชื่อสูตรในทะเบียน
      แล้ว SA กดบันทึกสินค้า ชื่อที่ derive ใหม่ต้องไม่ถูกนับเป็น "แก้ช่องที่ล็อก" */
export const BOM_LOCKED_FIELDS = Object.freeze(['formulaId', 'scentId', 'formulaComponents', 'volume', 'volumeUnit']);
const LOCKED_FIELD_LABELS = {
  formulaId: 'สูตร',
  scentId: 'กลิ่น',
  formulaComponents: 'สูตรในชุด',
  volume: 'ปริมาตร/น้ำหนักบรรจุ',
  volumeUnit: 'หน่วยบรรจุ',
};

/* ทุกคอลัมน์ของ mig 0419 — PATCH สินค้าต้อง **ไม่เขียนกลับ** ชุดนี้ (มันอ่านทั้งแถวแล้ว update ทั้งแถว ⇒ RD
   กดรับเรื่องระหว่างที่ SA กำลังบันทึก = สถานะถูกเขียนทับด้วยค่าเก่าเงียบ ๆ) · route อ่านคิวก็เลือกชุดนี้ */
export const BOM_COLUMNS = Object.freeze([
  'bomStatus', 'bomRound',
  'bomSentAt', 'bomSentBy', 'bomSentByName',
  'bomAcceptedAt', 'bomAcceptedBy', 'bomAcceptedByName',
  'bomReturnedAt', 'bomReturnedByName', 'bomReturnReason',
  'bomDoneAt', 'bomDoneBy', 'bomDoneByName',
  'bomCode', 'bomNote', 'bomUpdatedAt',
]);

export const BOM_CODE_MAX = 60;
export const BOM_NOTE_MAX = 500;

/* ป้ายสถานะ — `none` = ยังไม่ส่ง (คอลัมน์เป็น NULL)
   `short` = ป้ายบนแถวของทะเบียนสินค้า ต่อท้ายคำว่า "BOM" (`ProductBomBadge`) — `label` เต็มใช้ที่ตัวกรอง/คิว RD/Excel */
export const BOM_STATUS_META = Object.freeze({
  none: { label: 'ยังไม่ส่ง RD', short: 'ยังไม่ส่ง', color: 'var(--text-3)', tone: 'neutral' },
  queued: { label: 'รอ RD รับเรื่อง', short: 'รอ RD รับ', color: 'var(--amber)', tone: 'warning' },
  in_progress: { label: 'RD กำลังลง BOM', short: 'กำลังลง', color: 'var(--blue)', tone: 'info' },
  returned: { label: 'RD ตีกลับ ต้องแก้', short: 'ตีกลับ ต้องแก้', color: 'var(--red)', tone: 'danger' },
  done: { label: 'ลง BOM แล้ว', short: 'ลงแล้ว', color: 'var(--green)', tone: 'success' },
});
/* ลำดับตัวเลือกของตัวกรอง "สถานะ BOM" บนทะเบียนสินค้า — ตามทางเดินของงาน */
export const BOM_FILTER_VALUES = Object.freeze(['none', 'queued', 'in_progress', 'returned', 'done']);

/* ทางเดินสถานะ — `from: null` = ยังไม่ส่ง · แถวที่ไม่อยู่ใน `from` = ปฏิเสธ (ส่งซ้ำ · รับซ้ำ · กดค้างจากแท็บเก่า)
   ⭐ `done` จาก `queued` ได้ตรง ๆ — FG ที่ Express มี BOM อยู่แล้ว (FG เก่า · มติข้อ 8) RD ไม่ต้องกดสองจังหวะ
   ⭐ `reopen` = RD กดเสร็จผิดตัว — ไม่มีทางนี้ ช่องที่ล็อกจะแก้ไม่ได้ตลอดกาล (ยกเว้นแอดมิน) */
export const BOM_TRANSITIONS = Object.freeze({
  send: { from: [null, 'returned'], to: 'queued', side: 'sales' },
  pullback: { from: ['queued'], to: null, side: 'sales' },
  accept: { from: ['queued'], to: 'in_progress', side: 'rd' },
  return: { from: ['queued', 'in_progress'], to: 'returned', side: 'rd' },
  done: { from: ['queued', 'in_progress'], to: 'done', side: 'rd' },
  reopen: { from: ['done'], to: 'in_progress', side: 'rd' },
});
export const BOM_ACTIONS = Object.freeze(Object.keys(BOM_TRANSITIONS));

const mainOf = (product) => String(product?.categoryCode || categoryOf(product?.fgCode) || '').slice(0, 2);
const categoryCodeOf = (product) => String(product?.categoryCode || categoryOf(product?.fgCode) || '');

/** FG ตัวนี้มีขั้นลง BOM ไหม (กลุ่ม 01/02) — ไม่มี = ไม่มีปุ่ม ไม่มีป้าย */
export function hasBomStep(product) {
  return BOM_MAIN_CATEGORIES.includes(mainOf(product));
}

const KNOWN_STATUSES = ['queued', 'in_progress', 'returned', 'done'];

/** สถานะปัจจุบัน — `null` = ยังไม่ส่ง (ค่าแปลกปลอมนับเป็นยังไม่ส่ง: ฐานกันไว้แล้วด้วย CHECK) */
export function bomStatusOf(product) {
  const status = product?.bomStatus;
  return KNOWN_STATUSES.includes(status) ? status : null;
}

export function bomStatusMeta(product) {
  return BOM_STATUS_META[bomStatusOf(product) || 'none'];
}

/**
 * ค่าของแถวสำหรับตัวกรอง/ป้าย/Excel ของทะเบียนสินค้า — `null` = ไม่มีขั้น BOM (กลุ่ม 03/04) · `'none'` = ยังไม่ส่ง
 * ⚠️ แยกสองค่านี้ให้ขาด: "ยังไม่ส่ง" ต้องไม่กวาดสินค้า 03/04 มารวม (ไม่มีอะไรให้ส่ง ⇒ ไม่ใช่งานค้างของ SA)
 */
export function bomFilterValueOf(product) {
  if (!hasBomStep(product)) return null;
  return bomStatusOf(product) || 'none';
}

/** ช่องที่ล็อกอยู่ไหม — ตั้งแต่ส่ง จนกว่าจะดึงกลับ/ถูกตีกลับ (มติข้อ 6) */
export function bomLocked(product) {
  return ['queued', 'in_progress', 'done'].includes(bomStatusOf(product));
}

/** ผูกสูตร/กลิ่นครบตามหมวดไหม (มติข้อ 3) — ชุดของขวัญนับจากแถวใน `product_formulas` ที่ผู้เรียกส่งมา */
export function bomFormulaBound(product, { formulaComponents = [] } = {}) {
  const code = categoryCodeOf(product);
  if (BOM_NO_FORMULA_CATEGORIES.includes(code)) return true;
  if (isGiftSetCategory(code)) return (formulaComponents || []).some((row) => row?.formulaId);
  if (isFragranceOilCategory(code)) return !!product?.scentId;
  return !!product?.formulaId;
}

function formulaGap(product) {
  const code = categoryCodeOf(product);
  if (isGiftSetCategory(code)) return 'ผูกสูตรในชุดอย่างน้อย 1 แถว';
  if (isFragranceOilCategory(code)) return 'ผูกกลิ่นจากทะเบียน';
  return 'ผูกสูตรจากทะเบียน';
}

/**
 * ด่าน "ส่ง RD ลง BOM" — คืนข้อความเหตุ (ภาษาไทย) หรือ `''` เมื่อส่งได้
 * ⚠️ ด่าน **เงื่อนไขของสินค้า** ⇒ ปุ่มยังโชว์ กดแล้วบอกเหตุ (กฎ UI) · สิทธิ์ตัดสินที่ผู้เรียก
 */
export function bomSendBlocker(product, { formulaComponents = [] } = {}) {
  if (!product) return 'ไม่พบสินค้า';
  if (!hasBomStep(product)) return 'สินค้ากลุ่มนี้ไม่มีขั้นลง BOM';
  const status = bomStatusOf(product);
  if (!BOM_TRANSITIONS.send.from.includes(status)) {
    return `ส่งไปแล้ว — สถานะตอนนี้: ${BOM_STATUS_META[status].label}`;
  }
  if (product.isActive === false) return 'สินค้านี้พักใช้งานอยู่ — เปิดใช้ก่อนจึงส่ง RD ได้';
  const approval = approvalStatusOf(product);
  if (approval === 'rejected') return 'สินค้าถูกตีกลับ — แก้ตามเหตุผลแล้วให้หัวหน้าอนุมัติก่อนส่ง RD';
  if (approval !== 'approved') return 'สินค้ายังรออนุมัติ — หัวหน้าอนุมัติก่อนจึงส่ง RD ได้';
  const gaps = [];
  if (!bomFormulaBound(product, { formulaComponents })) gaps.push(formulaGap(product));
  if (!(Number(product.volume) > 0) || !product.volumeUnit) gaps.push('กรอกปริมาตร/น้ำหนักบรรจุ');
  if (gaps.length) return `ข้อมูลยังไม่ครบ — ${gaps.join(' · ')} ก่อนส่ง RD`;
  return '';
}

/** ทางเดินสถานะผ่านไหม — คืนข้อความเหตุหรือ `''` */
export function bomTransitionError(action, product) {
  const rule = BOM_TRANSITIONS[action];
  if (!rule) return 'ไม่รู้จักคำสั่งนี้';
  const status = bomStatusOf(product);
  if (rule.from.includes(status)) return '';
  const now = BOM_STATUS_META[status || 'none'].label;
  if (action === 'pullback') {
    return status === 'in_progress' || status === 'done'
      ? `RD รับเรื่องแล้ว — ดึงกลับไม่ได้ (สถานะตอนนี้: ${now}) · ต้องแก้ ให้ RD ตีกลับ`
      : `ยังไม่ได้ส่ง — ไม่มีอะไรให้ดึงกลับ (สถานะตอนนี้: ${now})`;
  }
  return `ทำรายการนี้ไม่ได้ — สถานะตอนนี้: ${now} (มีคนเปลี่ยนสถานะไปก่อนแล้ว · โหลดหน้าใหม่)`;
}

/**
 * แถวที่ต้องเขียนลงสินค้าสำหรับคำสั่งหนึ่งครั้ง — ฟังก์ชันบริสุทธิ์ (เทสต์ยิงตรง) · ด่านสิทธิ์อยู่ที่ route
 * @returns {{ error: string } | { patch: object, from: string|null, to: string|null }}
 */
export function bomActionPatch(action, product, { user = null, reason = '', bomCode = '', note = '', formulaComponents = [], now = new Date().toISOString() } = {}) {
  const transition = bomTransitionError(action, product);
  if (transition) return { error: transition };
  const rule = BOM_TRANSITIONS[action];
  const from = bomStatusOf(product);
  const who = { id: user?.id != null ? String(user.id) : null, name: user?.name || null };
  const base = { bomStatus: rule.to, bomUpdatedAt: now };

  if (action === 'send') {
    const blocker = bomSendBlocker(product, { formulaComponents });
    if (blocker) return { error: blocker };
    return {
      from, to: rule.to,
      patch: {
        ...base,
        bomRound: (Number(product.bomRound) || 0) + 1,
        bomSentAt: now, bomSentBy: who.id, bomSentByName: who.name,
        // รอบใหม่เริ่มสะอาด — ผลของรอบก่อน (คนรับ · รหัส) ไม่ใช่ของรอบนี้ · เหตุที่ตีกลับยังอยู่ในเธรด
        bomAcceptedAt: null, bomAcceptedBy: null, bomAcceptedByName: null,
        bomDoneAt: null, bomDoneBy: null, bomDoneByName: null,
        bomCode: null, bomNote: null,
      },
    };
  }
  if (action === 'pullback') {
    return {
      from, to: rule.to,
      // รอบที่ดึงกลับไม่นับเป็นรอบ — RD ยังไม่ได้แตะ
      patch: { ...base, bomRound: Math.max(0, (Number(product.bomRound) || 0) - 1), bomSentAt: null, bomSentBy: null, bomSentByName: null },
    };
  }
  if (action === 'accept') {
    return { from, to: rule.to, patch: { ...base, bomAcceptedAt: now, bomAcceptedBy: who.id, bomAcceptedByName: who.name } };
  }
  if (action === 'return') {
    const reasonError = rejectionReasonError(reason);
    if (reasonError) return { error: reasonError };
    return {
      from, to: rule.to,
      patch: { ...base, bomReturnedAt: now, bomReturnedByName: who.name, bomReturnReason: normalizeRejectionReason(reason) },
    };
  }
  if (action === 'done') {
    const code = String(bomCode ?? '').trim();
    const text = String(note ?? '').trim();
    if (code.length > BOM_CODE_MAX) return { error: `รหัส BOM ต้องไม่เกิน ${BOM_CODE_MAX} ตัวอักษร` };
    if (text.length > BOM_NOTE_MAX) return { error: `หมายเหตุต้องไม่เกิน ${BOM_NOTE_MAX} ตัวอักษร` };
    return {
      from, to: rule.to,
      patch: {
        ...base,
        // กดเสร็จจากรอรับเรื่องตรง ๆ = คนกดคือคนรับด้วย (ไม่ทิ้งช่องคนรับว่างบนแถวที่เสร็จแล้ว)
        ...(from === 'queued' ? { bomAcceptedAt: now, bomAcceptedBy: who.id, bomAcceptedByName: who.name } : {}),
        bomDoneAt: now, bomDoneBy: who.id, bomDoneByName: who.name,
        bomCode: code || null, bomNote: text || null,
      },
    };
  }
  // reopen — รหัสที่ใส่ไว้ยังอยู่ (มักกดเสร็จเร็วไปก่อนแก้รหัส) · เวลาเสร็จล้าง: ยังไม่เสร็จจริง
  return { from, to: rule.to, patch: { ...base, bomDoneAt: null, bomDoneBy: null, bomDoneByName: null } };
}

/** ช่องที่ล็อกซึ่งการแก้รอบนี้แตะ — ผู้เรียกส่ง `changedFields` (จาก changedFieldsAgainst) + ธงชุดของขวัญ
    ⚠️ `updated` (แถวหลังแก้) ใช้เทียบปริมาตรเป็นตัวเลข — changedFieldsAgainst เทียบเป็นสตริง ⇒ "50.0" กับ 50
       นับว่าเปลี่ยน แล้วคนกดบันทึกชื่อสินค้าเฉย ๆ โดนตีกลับเรื่องปริมาตรที่ไม่ได้แตะ */
export function bomLockedFieldChanges(product, changedFields = [], { giftSetChanged = false, updated = null } = {}) {
  if (!bomLocked(product)) return [];
  const touched = new Set((changedFields || []).filter((field) => BOM_LOCKED_FIELDS.includes(field)));
  if (giftSetChanged) touched.add('formulaComponents');
  if (updated && touched.has('volume') && Number(updated.volume) === Number(product.volume)) touched.delete('volume');
  return BOM_LOCKED_FIELDS.filter((field) => touched.has(field));
}

export function bomLockedFieldLabels(fields = []) {
  return fields.map((field) => LOCKED_FIELD_LABELS[field] || field);
}

/** ข้อความตอน PATCH แตะช่องที่ล็อก — บอกทางออกตามสถานะ (ดึงกลับเองได้ไหม) */
export function bomLockMessage(product, fields = []) {
  const what = bomLockedFieldLabels(fields).join(' · ') || 'สูตร/กลิ่น · ปริมาตร';
  const status = bomStatusOf(product);
  const way = status === 'queued'
    ? 'กด "ดึงกลับจาก RD" ก่อน แล้วค่อยแก้'
    : status === 'in_progress'
      ? 'ให้ RD ตีกลับก่อน แล้วค่อยแก้'
      : 'BOM ลงใน Express แล้ว — ต้องเปลี่ยนให้สร้าง FG ใหม่ หรือติดต่อแอดมิน';
  return `แก้${what}ไม่ได้ — ล็อกไว้ตั้งแต่ส่ง RD ลง BOM (${BOM_STATUS_META[status || 'none'].label}) · ${way}`;
}

/* ชนิดเหตุการณ์ในเธรดสินค้า (UPDATE_KINDS.product) — หนึ่งคำสั่งหนึ่งชนิด */
export const BOM_UPDATE_KIND = Object.freeze({
  send: 'bom_send', pullback: 'bom_pullback', accept: 'bom_accept', return: 'bom_return', done: 'bom_done', reopen: 'bom_reopen',
});

/** บรรทัดในเธรดของสินค้า — `{ kind, body }` */
export function bomThreadEvent(action, product, patch = {}) {
  const kind = BOM_UPDATE_KIND[action];
  if (!kind) return null;
  const round = Number(patch.bomRound ?? product?.bomRound) || 0;
  if (action === 'send') return { kind, body: round > 1 ? `ส่ง RD ลง BOM อีกครั้ง (รอบที่ ${round})` : 'ส่ง RD ลง BOM' };
  if (action === 'pullback') return { kind, body: 'ดึงเรื่องลง BOM กลับก่อน RD รับเรื่อง — ปลดล็อกสูตร/ปริมาตรแล้ว' };
  if (action === 'accept') return { kind, body: 'RD รับเรื่องลง BOM แล้ว' };
  if (action === 'return') return { kind, body: `RD ตีกลับเรื่องลง BOM — เหตุผล: ${patch.bomReturnReason || '-'}` };
  if (action === 'done') {
    return { kind, body: ['ลง BOM ใน Express เสร็จแล้ว', patch.bomCode ? `รหัส BOM ${patch.bomCode}` : null, patch.bomNote].filter(Boolean).join(' · ') };
  }
  return { kind, body: 'RD ย้อนสถานะ BOM กลับเป็นกำลังลง' };
}
