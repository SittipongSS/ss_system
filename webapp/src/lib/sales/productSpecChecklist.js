// ── Checklist ของใบสเปคสินค้า FM-SA-04 — ทะเบียนฝั่งโค้ด (mig 0364) ──────────
//
// ⭐ 17 แถวตามแบบฟอร์มกระดาษ Rev.00 (08/05/2568) · งอกเป็นแถวจริงตอนสร้าง "ฉบับ"
// แล้วเก็บ `itemLabel` ลงแถวด้วย ⇒ ฉบับที่ออกไปแล้วไม่เปลี่ยนคำตามทะเบียนที่แก้ทีหลัง
//
// ⚠️ **ทะเบียนอยู่ในโค้ด ไม่ใช่ CHECK ในฐาน** (แพตเทิร์นเดียวกับ PDR mig 0214) —
// แบบฟอร์มกระดาษเพิ่งขึ้น Rev.00 ยังเปลี่ยนได้อีก · ผูก CHECK เมื่อไร การเพิ่ม/ลด
// แถวกลายเป็น migration ทุกครั้ง
//
// ⚠️ **ห้ามเปลี่ยน `key` ของแถวที่ปล่อยไปแล้ว** — คีย์คือสิ่งที่ผูกแถวในฉบับเก่ากับ
// ทะเบียนวันนี้ · เปลี่ยนคำได้ (แถวเก่าถือคำเดิมของตัวเองอยู่) แต่เปลี่ยนคีย์แปลว่า
// แถวเก่ากลายเป็นแถวที่ไม่มีต้นทางเงียบ ๆ
//
// ⚠️ ลำดับในลิสต์ = `sortOrder` บนกระดาษ · แถวที่ผู้ใช้เพิ่มเองต่อท้าย (`itemKey` = null)

export const PRODUCT_SPEC_CHECKLIST = Object.freeze([
  { key: 'raw_material',     label: 'วัตถุดิบ/สารประกอบ' },
  { key: 'inner_packaging',  label: 'บรรจุภัณฑ์ภายใน' },
  { key: 'spray_head',       label: 'หัวสเปรย์' },
  { key: 'cap',              label: 'ฝา' },
  { key: 'ring',             label: 'แหวน' },
  { key: 'reed_stick',       label: 'ก้านไม้ (สี/ขนาด)' },
  { key: 'packaging_print',  label: 'สกรีนบรรจุภัณฑ์' },
  { key: 'bottle_sticker',   label: 'สติกเกอร์ติดขวด' },
  { key: 'box_sticker',      label: 'สติกเกอร์ติดกล่อง' },
  { key: 'clear_box_stk',    label: 'สติกเกอร์ใสติดกล่อง' },
  { key: 'box',              label: 'กล่องบรรจุภัณฑ์' },
  { key: 'shrink_film',      label: 'ซีลฟิล์ม' },
  { key: 'carton',           label: 'ลังบรรจุ' },
  { key: 'box_insert',       label: 'ไส้ในกล่อง' },
  { key: 'card',             label: 'การ์ด' },
  { key: 'box_band',         label: 'สายคาดกล่อง' },
  { key: 'other',            label: 'อื่นๆ' },
]);

export const PRODUCT_SPEC_CHECKLIST_KEYS = Object.freeze(
  PRODUCT_SPEC_CHECKLIST.map((row) => row.key),
);

const LABEL_BY_KEY = new Map(PRODUCT_SPEC_CHECKLIST.map((row) => [row.key, row.label]));

export const productSpecChecklistLabel = (key) => LABEL_BY_KEY.get(key) || '';

/**
 * แถวตั้งต้นของฉบับใหม่ — ก๊อปคำจากทะเบียนลงแถว (ไม่ผูกสด)
 *
 * · ไม่มี `previousItems` (ใบแรกของสินค้า) = ครบ 17 แถวตามแบบฟอร์ม
 * · มี `previousItems` (ออก Rev. ใหม่) = **ยกมาเท่าที่ฉบับก่อนมีจริง** ทั้งค่าที่กรอกไว้
 *   ลำดับที่จัดไว้ และแถวที่ผู้ใช้เพิ่มเอง เพราะ "ออก Rev. ใหม่" คือแก้ต่อจากของเดิม
 *
 * ⚠️ **แถวที่ถูกลบต้องไม่ฟื้น** (มติผู้ใช้ 2026-09-21 — 17 แถวของแบบฟอร์มลบได้แล้ว) ·
 * ของเดิมงอกทะเบียนทั้งชุดทุกครั้งแล้วเติมค่าเก่าทับ ⇒ แถวที่ลบทิ้งไปจะกลับมาเองทุกครั้ง
 * ที่ออก Rev. ใหม่ และคนกดก็ไม่รู้ว่าทำไม
 *
 * ⚠️ คำของแถวที่มีคีย์อ่านจากทะเบียนวันนี้ (แถวในฉบับที่ออกไปแล้วถือคำของตัวเองอยู่
 * ในฐาน — ที่นี่คือการสร้างฉบับ **ใหม่** ซึ่งควรได้คำล่าสุด)
 */
export function productSpecChecklistSeed(previousItems = []) {
  const previous = (previousItems || []).filter(Boolean);
  if (!previous.length) {
    return PRODUCT_SPEC_CHECKLIST.map((row, index) => ({
      sortOrder: index,
      itemKey: row.key,
      itemLabel: row.label,
      detail: null,
      preparedByS: false,
      preparedByCustomer: false,
      note: null,
    }));
  }
  return previous.map((row, index) => ({
    sortOrder: index,
    itemKey: row.itemKey || null,
    itemLabel: (row.itemKey ? productSpecChecklistLabel(row.itemKey) : '') || row.itemLabel || '',
    detail: row.detail ?? null,
    preparedByS: row.preparedByS ?? false,
    preparedByCustomer: row.preparedByCustomer ?? false,
    note: row.note ?? null,
  }));
}

/**
 * แถวของแบบฟอร์มที่ยังไม่อยู่ในใบ — ให้จอเสนอ "คืนแถว" ได้
 *
 * ⭐ ลบได้ต้องคู่กับคืนได้ ไม่งั้นลบพลาดครั้งเดียวคือทางตัน: เพิ่มใหม่เองได้แต่เป็นแถว
 * ไม่มีคีย์ ซึ่งไม่ใช่แถวเดิมของแบบฟอร์มอีกแล้ว (เอกสาร/รายงานที่นับตามคีย์จะนับไม่เจอ)
 */
export function productSpecChecklistMissing(items = []) {
  const have = new Set((items || []).filter(Boolean).map((row) => row.itemKey).filter(Boolean));
  return PRODUCT_SPEC_CHECKLIST.filter((row) => !have.has(row.key));
}

/**
 * คืนแถวของแบบฟอร์มกลับเข้าใบ — วางให้แถวที่มีคีย์ยังเรียงตามลำดับกระดาษ
 *
 * ⚠️ ไม่ใช่ต่อท้าย: กระดาษมีลำดับของตัวเอง (`PRODUCT_SPEC_CHECKLIST`) ⇒ คืน "ฝา" แล้ว
 * มันต้องกลับไปอยู่หลัง "หัวสเปรย์" ไม่ใช่ไปต่อท้ายแถวที่ผู้ใช้เพิ่มเอง
 */
export function restoreChecklistItem(items = [], key) {
  const entry = PRODUCT_SPEC_CHECKLIST.find((row) => row.key === key);
  const rows = (items || []).filter(Boolean);
  if (!entry || rows.some((row) => row.itemKey === key)) return rows;
  const rank = PRODUCT_SPEC_CHECKLIST_KEYS.indexOf(key);
  const fresh = {
    itemKey: entry.key,
    itemLabel: entry.label,
    detail: '',
    preparedByS: false,
    preparedByCustomer: false,
    note: '',
  };
  const at = rows.findIndex((row) => {
    if (!row.itemKey) return true; // แถวที่เพิ่มเองอยู่ท้ายเสมอ
    return PRODUCT_SPEC_CHECKLIST_KEYS.indexOf(row.itemKey) > rank;
  });
  if (at < 0) return [...rows, fresh];
  return [...rows.slice(0, at), fresh, ...rows.slice(at)];
}

/* ── เอกสารที่ขอได้ (Certification & Documents) ───────────────────────────────
 *
 * ⭐ สี่แถวตามกระดาษ + แถว "อื่นๆ" ที่พิมพ์ชื่อเองได้
 * สถานะมีสองค่าตามกระดาษเท่านั้น: **เรียบร้อย** / **อยู่ระหว่างจัดเตรียม**
 * (แถว อย. บนกระดาษเขียนว่า "อยู่ระหว่างยื่น" — คำของแถวนั้นเอง ไม่ใช่สถานะที่สาม)
 *
 * ⚠️ เก็บเป็น jsonb ไม่ใช่คอลัมน์ต่อแถว เพราะเป็น **ลิสต์ที่ยาวได้** (แถวอื่นๆ 0..N)
 * ⚠️ `status` ว่าง = ยังไม่ตอบ ไม่ใช่ "อยู่ระหว่างจัดเตรียม" — สองอันนี้ต่างกัน
 *    (ยังไม่มีใครตอบ vs ตอบแล้วว่ากำลังทำ) และกระดาษก็ปล่อยว่างได้
 */
export const PRODUCT_SPEC_CERT_STATUSES = Object.freeze(['ready', 'in_progress']);

export const PRODUCT_SPEC_CERT_STATUS_LABELS = Object.freeze({
  ready: 'เรียบร้อย',
  in_progress: 'อยู่ระหว่างจัดเตรียม',
});

export const PRODUCT_SPEC_CERTIFICATIONS = Object.freeze([
  { key: 'fda', label: 'เอกสารจดแจ้ง อย.', pendingLabel: 'อยู่ระหว่างยื่น' },
  { key: 'sds', label: 'SDS / MSDS' },
  { key: 'coa', label: 'COA' },
  { key: 'ifra', label: 'IFRA' },
]);

export const productSpecCertPendingLabel = (key) => PRODUCT_SPEC_CERTIFICATIONS
  .find((row) => row.key === key)?.pendingLabel || PRODUCT_SPEC_CERT_STATUS_LABELS.in_progress;

/** แถวตั้งต้นของเอกสารที่ขอได้ — ยกค่าจากฉบับก่อนเหมือน checklist */
export function productSpecCertSeed(previous = []) {
  const prevByKey = new Map(
    (previous || []).filter((row) => row?.key).map((row) => [row.key, row]),
  );
  const base = PRODUCT_SPEC_CERTIFICATIONS.map((row) => {
    const prev = prevByKey.get(row.key);
    return {
      key: row.key,
      label: row.label,
      status: prev?.status || '',
      note: prev?.note || '',
    };
  });
  const extras = (previous || [])
    .filter((row) => row && !row.key)
    .map((row) => ({ key: null, label: row.label || '', status: row.status || '', note: row.note || '' }));
  return [...base, ...extras];
}
