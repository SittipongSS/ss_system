// ── สเปคสินค้า FM-SA-04 — กติกาของ "ข้อมูลสเปค" ล้วน (mig 0370) ─────────────────
//
// ⭐ **มติเจ้าของ 21/09/2569** (docs/fm-sa-04-document-model.md): สเปคในฐานข้อมูลเป็น
//   **ข้อมูลของสินค้า** — 1 แถวต่อสินค้า ไม่มีเลขรัน ไม่มี Rev ไม่มีด่านอนุมัติ ·
//   ฝ่ายขายแก้ได้เลย ทุกการแก้ลง audit log
//   เลขที่เอกสาร Rev และด่านอนุมัติย้ายไปอยู่ที่ **เอกสารที่ออกจาก SO**
//   ⇒ กติกาของเอกสารอยู่ที่ `productSpecDocWorkflow.js` ไม่ใช่ที่นี่
//
// ⚠️ ไฟล์นี้ **ไม่แตะฐาน ไม่ import ของฝั่ง server** — จอ (client) import ได้ตรง ๆ
//    ค่าคงที่ที่จอต้องใช้ (`SPEC_CONTENT_FIELDS` ฯลฯ) จึงต้องอยู่ที่นี่ ไม่ใช่ที่ store
// ⚠️ ตัวตัดสินคืน **เหตุผลเป็นข้อความ** ไม่ใช่ boolean เปล่า เพราะจอต้องบอกเหตุตอนกด
//    (กฎ ui-visibility-rule) · `null` = ทำได้
import { SALES_ROLES } from '@/lib/permissions';
import {
  PRODUCT_SPEC_CERTIFICATIONS, PRODUCT_SPEC_CERT_STATUSES, productSpecChecklistLabel,
} from '@/lib/sales/productSpecChecklist';

/** ช่องเนื้อสเปค — ลำดับเดียวกับกระดาษ · คอลัมน์ของ product_specs (0370)
 *
 * ⭐ **"ระดับราคา" (`pricingTier`) ถูกตัดออก** (มติผู้ใช้ 2026-09-22 "ตัดระดับราคาออก") — ช่องบนจอ
 *   ชวนให้พิมพ์ราคาทุน/ราคาขาย (ของจริง 3 ใบ: "ราคาต้นทุน 200 บาท/ขวด" · "ราคาขายลูกค้า 3,500 บาท")
 *   ลงกระดาษที่ส่งให้ลูกค้าเซ็น
 * ⚠️ **คอลัมน์ `product_specs.pricingTier` ยังอยู่และค่าที่เคยพิมพ์ไว้ยังอยู่** — ไม่อยู่ในลิสต์นี้ =
 *   จอไม่แสดง · บันทึกไม่แตะ · ภาพนิ่งไม่ถ่าย · กระดาษไม่พิมพ์ (ลิสต์นี้คือตัวเดียวที่ทุกทางอ่าน)
 *   ⇒ อย่าใส่กลับโดยไม่ถามเจ้าของ */
export const SPEC_CONTENT_FIELDS = Object.freeze([
  'texture', 'standardPackaging',
  'targetGroup', 'keySellingPoint',
  'productBenefit', 'longevity', 'dosagePerUse',
]);

/* ⚠️ ต้องเท่ากับ CHECK `product_specs_text_check` ของ mig 0370 ทุกช่อง — ด่านที่หลวมกว่าฐาน
   = ผู้ใช้เห็นข้อความ error ภาษาอังกฤษของ Postgres · ที่แน่นกว่าฐาน = ข้อมูลเดิมบันทึกซ้ำไม่ได้ */
export const SPEC_CONTENT_LIMITS = Object.freeze({
  texture: 200,
  standardPackaging: 500,
  targetGroup: 500,
  keySellingPoint: 500,
  productBenefit: 500,
  longevity: 200,
  dosagePerUse: 200,
});

export const SPEC_CONTENT_LABELS = Object.freeze({
  texture: 'ลักษณะเนื้อสาร',
  standardPackaging: 'บรรจุภัณฑ์มาตรฐาน',
  targetGroup: 'กลุ่มเป้าหมาย',
  keySellingPoint: 'จุดขายหลัก',
  productBenefit: 'ประสิทธิภาพหลัก',
  longevity: 'ระยะเวลาการออกฤทธิ์กลิ่น',
  dosagePerUse: 'ปริมาณแนะนำต่อการใช้งาน',
});

// checklist: แถวที่ผู้ใช้เพิ่มเองมีเพดาน · ความยาวเท่า CHECK ของ product_spec_items (0370)
export const SPEC_ITEM_EXTRA_MAX = 20;
export const SPEC_ITEM_LABEL_MAX = 200;
export const SPEC_ITEM_TEXT_MAX = 500;
// เอกสารที่ขอได้: แถวที่พิมพ์ชื่อเองมีเพดานเท่ากัน (jsonb ไม่มี CHECK รายแถว — ด่านอยู่ที่นี่ที่เดียว)
export const SPEC_CERT_EXTRA_MAX = 20;
export const SPEC_CERT_LABEL_MAX = 200;
export const SPEC_CERT_NOTE_MAX = 500;

/* ใครแก้สเปคได้ — ฝ่ายขายทุกตำแหน่ง (SALES_ROLES · ผังตำแหน่ง 2026-09-24) + admin
   ⚠️ ถามลิสต์ตำแหน่งฝ่ายขาย ไม่ใช้ `isSuperuser` (สิ่งที่ตั้งใจคือ "ฝ่ายขาย" ไม่ใช่
      "ผู้ดูแลทุกทีม") · ลิสต์เดียวให้ทั้งจอและ API ถาม */
export const SPEC_EDIT_ROLES = Object.freeze([...SALES_ROLES, 'admin']);

export const canEditProductSpec = (role) => SPEC_EDIT_ROLES.includes(role);

/**
 * ลบสเปคได้ไหม — `null` = ลบได้
 *
 * 🔴 **มีแถวเอกสารแม้ใบเดียว (รวมใบที่ void) = ลบไม่ได้ ไม่ว่าใคร** — เอกสารถือเลขที่ที่ออก
 * ไปนอกบริษัทแล้ว และฐานกันด้วย FK `ON DELETE RESTRICT` + ยามห้ามลบแถวเอกสาร (0370)
 * ⇒ ใบที่ void แล้วก็ยังอ้างสเปคอยู่ · ที่นี่แค่บอกเหตุเป็นภาษาคนก่อนกด
 */
export function productSpecDeleteBlock({ spec, documents = [], role } = {}) {
  if (!spec) return 'สินค้านี้ยังไม่มีสเปคให้ลบ';
  if (!canEditProductSpec(role)) return 'ต้องเป็น AC หรือฝ่ายขายจึงลบสเปคได้';
  const rows = (documents || []).filter(Boolean);
  if (rows.length) {
    const first = rows[0]?.docNo ? ` (${rows[0].docNo})` : '';
    return `ออกเอกสารจากสเปคนี้ไปแล้ว ${rows.length} ใบ${first} — ลบสเปคไม่ได้ เพราะเลขที่เอกสารอ้างสเปคนี้อยู่`;
  }
  return null;
}

/**
 * สิทธิ์บนหน้าสเปคของสินค้า — รูปเดียวกับที่ `GET /api/products/[id]/spec` ส่งให้จอ
 *
 * ⚠️ ปุ่มลบ: ไม่มีสิทธิ์ = ไม่โชว์ · มีสิทธิ์แต่ติดเอกสาร = โชว์แล้วบอกเหตุ (ui-visibility-rule)
 *    ยังไม่มีสเปค = ไม่มีของให้ลบ ⇒ ไม่โชว์
 */
export function productSpecPermissions({ spec, documents = [], role } = {}) {
  const canEdit = canEditProductSpec(role);
  return {
    canEdit,
    delete: {
      visible: canEdit && Boolean(spec),
      reason: spec ? productSpecDeleteBlock({ spec, documents, role }) : null,
    },
  };
}

const cleanText = (value) => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
};

/**
 * ช่องเนื้อสเปคที่ส่งมา → ค่าที่เขียนลงฐานได้
 *
 * ⚠️ ส่งมาเฉพาะช่องที่มีในก้อน — ช่องที่ไม่ส่ง = ไม่แตะ (PATCH บางส่วนได้) ·
 *    ส่งค่าว่าง = ล้างเป็น NULL
 */
export function normalizeSpecContent(content = {}) {
  const value = {};
  const source = content && typeof content === 'object' ? content : {};
  for (const field of SPEC_CONTENT_FIELDS) {
    if (!(field in source)) continue;
    const text = cleanText(source[field]);
    if (text && text.length > SPEC_CONTENT_LIMITS[field]) {
      return { error: `${SPEC_CONTENT_LABELS[field]}ยาวเกิน ${SPEC_CONTENT_LIMITS[field]} ตัวอักษร` };
    }
    value[field] = text;
  }
  return { value };
}

/**
 * checklist ทั้งชุด → แถวที่เขียนได้ (ยังไม่มี id/specId — store เติม)
 *
 * ⚠️ ส่งมาเมื่อไรคือ **ทับทั้งก้อน** — แถวที่หายไปจากที่ส่งมา = แถวที่ถูกลบ
 * ⚠️ คำของแถวที่มีคีย์อ่านจากทะเบียนวันนี้ (กระดาษพูดคำเดียวกันทุกใบ) · แถวที่เพิ่มเองใช้คำที่พิมพ์
 */
export function normalizeSpecItems(rows) {
  if (!Array.isArray(rows)) return { error: 'รูปแบบ checklist ไม่ถูกต้อง' };
  const extras = rows.filter((row) => !row?.itemKey).length;
  if (extras > SPEC_ITEM_EXTRA_MAX) return { error: `เพิ่มแถว checklist เองได้ไม่เกิน ${SPEC_ITEM_EXTRA_MAX} แถว` };
  const seen = new Set();
  const value = [];
  for (const [index, row] of rows.entries()) {
    const key = cleanText(row?.itemKey);
    if (key) {
      if (!productSpecChecklistLabel(key)) return { error: `checklist แถวที่ ${index + 1} อ้างรายการที่ไม่มีในแบบฟอร์ม` };
      if (seen.has(key)) return { error: `checklist แถวที่ ${index + 1} ซ้ำกับแถวก่อนหน้า` };
      seen.add(key);
    }
    const label = key ? productSpecChecklistLabel(key) : cleanText(row?.itemLabel);
    if (!label) return { error: `checklist แถวที่ ${index + 1} ไม่มีชื่อรายการ` };
    if (label.length > SPEC_ITEM_LABEL_MAX) return { error: `ชื่อรายการ checklist แถวที่ ${index + 1} ยาวเกิน ${SPEC_ITEM_LABEL_MAX} ตัวอักษร` };
    const detail = cleanText(row?.detail);
    const note = cleanText(row?.note);
    if (detail && detail.length > SPEC_ITEM_TEXT_MAX) return { error: `รายละเอียด checklist แถวที่ ${index + 1} ยาวเกิน ${SPEC_ITEM_TEXT_MAX} ตัวอักษร` };
    if (note && note.length > SPEC_ITEM_TEXT_MAX) return { error: `หมายเหตุ checklist แถวที่ ${index + 1} ยาวเกิน ${SPEC_ITEM_TEXT_MAX} ตัวอักษร` };
    value.push({
      sortOrder: index,
      itemKey: key,
      itemLabel: label,
      detail,
      preparedByS: Boolean(row?.preparedByS),
      preparedByCustomer: Boolean(row?.preparedByCustomer),
      note,
    });
  }
  return { value };
}

const CERT_KEYS = new Set(PRODUCT_SPEC_CERTIFICATIONS.map((row) => row.key));
const CERT_LABEL_BY_KEY = new Map(PRODUCT_SPEC_CERTIFICATIONS.map((row) => [row.key, row.label]));

/**
 * เอกสารที่ขอได้ทั้งชุด → ก้อน jsonb ที่เขียนได้
 *
 * ⚠️ jsonb ไม่มี CHECK รายแถว — ด่านรูปทรงอยู่ที่นี่ที่เดียว (สถานะมีสองค่าตามกระดาษ +
 *    ค่าว่าง = "ยังไม่ตอบ" ซึ่งต่างจาก "อยู่ระหว่างจัดเตรียม")
 */
export function normalizeSpecCertifications(rows) {
  if (!Array.isArray(rows)) return { error: 'รูปแบบรายการเอกสารที่ขอได้ไม่ถูกต้อง' };
  const extras = rows.filter((row) => !row?.key).length;
  if (extras > SPEC_CERT_EXTRA_MAX) return { error: `เพิ่มเอกสารเองได้ไม่เกิน ${SPEC_CERT_EXTRA_MAX} แถว` };
  const seen = new Set();
  const value = [];
  for (const [index, row] of rows.entries()) {
    const key = cleanText(row?.key);
    if (key) {
      if (!CERT_KEYS.has(key)) return { error: `เอกสารแถวที่ ${index + 1} อ้างรายการที่ไม่มีในแบบฟอร์ม` };
      if (seen.has(key)) return { error: `เอกสารแถวที่ ${index + 1} ซ้ำกับแถวก่อนหน้า` };
      seen.add(key);
    }
    const label = key ? CERT_LABEL_BY_KEY.get(key) : cleanText(row?.label);
    if (!label) return { error: `เอกสารแถวที่ ${index + 1} ไม่มีชื่อ` };
    if (label.length > SPEC_CERT_LABEL_MAX) return { error: `ชื่อเอกสารแถวที่ ${index + 1} ยาวเกิน ${SPEC_CERT_LABEL_MAX} ตัวอักษร` };
    const status = cleanText(row?.status) || '';
    if (status && !PRODUCT_SPEC_CERT_STATUSES.includes(status)) {
      return { error: `สถานะเอกสารแถวที่ ${index + 1} ไม่ถูกต้อง` };
    }
    const note = cleanText(row?.note) || '';
    if (note.length > SPEC_CERT_NOTE_MAX) return { error: `หมายเหตุเอกสารแถวที่ ${index + 1} ยาวเกิน ${SPEC_CERT_NOTE_MAX} ตัวอักษร` };
    value.push({ key: key || null, label, status, note });
  }
  return { value };
}

/**
 * ก้อนที่จอส่งมาบันทึกสเปค `{ content, certifications, items }` → ค่าที่เขียนได้
 *
 * ⚠️ `certifications` / `items` ที่ไม่ส่งมา (undefined) = ไม่แตะของเดิม · ส่งมา = ทับทั้งชุด
 * @returns {{ value: { content: object, certifications?: object[], items?: object[] } } | { error: string }}
 */
export function normalizeProductSpecInput(input = {}) {
  const content = normalizeSpecContent(input?.content || {});
  if (content.error) return { error: content.error };
  const value = { content: content.value };
  if (input?.certifications !== undefined) {
    const certs = normalizeSpecCertifications(input.certifications);
    if (certs.error) return { error: certs.error };
    value.certifications = certs.value;
  }
  if (input?.items !== undefined) {
    const items = normalizeSpecItems(input.items);
    if (items.error) return { error: items.error };
    value.items = items.value;
  }
  return { value };
}
