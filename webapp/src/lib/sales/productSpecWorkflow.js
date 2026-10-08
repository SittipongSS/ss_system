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
import { SALES_ROLES, canSeeProductCostUser } from '@/lib/permissions';
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
// ราคาทุนรายแถว (mig 0405) — เพดานเท่า CHECK `product_spec_items_cost_check` · ว่าง (null) กับ 0 เป็นคนละค่า
export const SPEC_ITEM_COST_MAX = 999999999.99;
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
 * เห็นราคาทุนรายแถวของ checklist ไหม (mig 0405 · มติเจ้าของ 08/10/2569 "ใช้ในระบบเท่านั้น")
 *
 * ⭐ ด่านเดียวกับราคาทุนของทะเบียนสินค้า (`canSeeProductCostUser`) — ไม่ตั้ง capability ใหม่:
 *   คนที่เห็นต้นทุนของ FG ได้อยู่แล้วคือคนกลุ่มเดียวกับที่ควรเห็นต้นทุนรายชิ้นของมัน
 * ⚠️ ถามจาก **ผู้ใช้ทั้งก้อน** ไม่ใช่ role — สิทธิ์ `products:margin` ให้รายคนได้
 */
export const canSeeSpecItemCost = (user) => canSeeProductCostUser(user);

/**
 * สิทธิ์บนหน้าสเปคของสินค้า — รูปเดียวกับที่ `GET /api/products/[id]/spec` ส่งให้จอ
 *
 * ⚠️ ปุ่มลบ: ไม่มีสิทธิ์ = ไม่โชว์ · มีสิทธิ์แต่ติดเอกสาร = โชว์แล้วบอกเหตุ (ui-visibility-rule)
 *    ยังไม่มีสเปค = ไม่มีของให้ลบ ⇒ ไม่โชว์
 * ⭐ ราคาทุน/รูปของแถว checklist (mig 0405):
 *    · `canSeeItemCost` — คอลัมน์ราคาทุนขึ้นจอไหม (API ตัดคีย์ `costPrice` ทิ้งให้คนที่ไม่เห็นด้วย)
 *    · `canEditItemCost` — แก้ได้ = แก้สเปคได้ **และ** เห็นราคาทุน (คนที่ไม่เห็นบันทึกแล้วค่าเดิมคงอยู่)
 *    · `canAttachItemImage` — ต้องมีสเปคแล้ว (รูปผูกกับแถวที่บันทึกลงฐาน)
 * ⚠️ ผู้เรียกที่ส่งมาแค่ `role` (จอ/เทสต์เดิม) ถูกถามเป็นผู้ใช้ที่มีแค่ role นั้น — ไม่มีสิทธิ์รายคน
 */
export function productSpecPermissions({ spec, documents = [], role, user } = {}) {
  const canEdit = canEditProductSpec(role);
  const viewer = user ?? (role ? { role } : null);
  const canSeeItemCost = canSeeSpecItemCost(viewer);
  return {
    canEdit,
    delete: {
      visible: canEdit && Boolean(spec),
      reason: spec ? productSpecDeleteBlock({ spec, documents, role }) : null,
    },
    canSeeItemCost,
    canEditItemCost: canEdit && canSeeItemCost,
    canAttachItemImage: canEdit && Boolean(spec),
  };
}

/**
 * สเปคที่ส่งออกจาก API ให้คนคนนี้ — คนที่ไม่เห็นราคาทุนได้ **สำเนา** ที่ไม่มีคีย์ `costPrice` ในแถวไหนเลย
 *
 * ⚠️ ตัดคีย์ทิ้ง (delete) ไม่ใช่ใส่ null — null แปลว่า "ยังไม่กรอก" ซึ่งเป็นข้อมูลคนละอย่างกับ "ไม่มีสิทธิ์เห็น"
 *    และจอส่ง null กลับมาตอนบันทึก = ล้างราคาทุนของคนอื่น
 * ⚠️ `pricingTier` (ช่องเก่าที่ตัดออกจากจอ 22/09 แต่ค่ายังอยู่ในฐาน — ของจริงมีคนพิมพ์ราคาทุนไว้) ตัดทิ้งด้วย
 * ⚠️ ห้ามแก้ก้อนที่รับมา — ก้อนเดียวกันถูกส่งเข้า audit log (ต้องเป็นแถวเต็ม)
 */
export function redactSpecForViewer(spec, user) {
  if (!spec || canSeeSpecItemCost(user)) return spec;
  const { pricingTier: _pricingTier, ...rest } = spec;
  if (!Array.isArray(spec.items)) return rest;
  return {
    ...rest,
    items: spec.items.map((row) => {
      if (!row || typeof row !== 'object') return row;
      const { costPrice: _costPrice, ...kept } = row;
      return kept;
    }),
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

const SPEC_ITEM_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COST_TEXT_PATTERN = /^\d+(\.\d+)?$/;

/* ราคาทุนที่จอส่งมา → ตัวเลขสองตำแหน่ง · `null` = ล้าง · `undefined` = ค่าที่รับไม่ได้
   ⚠️ รับตัวเลข หรือข้อความที่เป็นเลขฐานสิบล้วน (ตัดลูกน้ำ/ช่องว่างหัวท้าย) — '1e3' · 'NaN' · true · [] ไม่รับ
   ⚠️ ปัดก่อนแล้วค่อยเทียบเพดาน — 999999999.995 ปัดเป็นหนึ่งพันล้าน ซึ่ง CHECK ของฐานไม่รับ */
function specItemCost(raw) {
  if (raw === null) return null;
  let number;
  if (typeof raw === 'number') {
    number = raw;
  } else if (typeof raw === 'string') {
    const text = raw.trim().replace(/,/g, '');
    if (!text) return null;
    if (!COST_TEXT_PATTERN.test(text)) return undefined;
    number = Number(text);
  } else {
    return undefined;
  }
  if (!Number.isFinite(number)) return undefined;
  const rounded = Math.round(number * 100) / 100;
  if (rounded < 0 || rounded > SPEC_ITEM_COST_MAX) return undefined;
  return rounded === 0 ? 0 : rounded;
}

/* ตัวชี้รูปที่จอส่งมา → uuid ตัวเล็ก · `null` = เอารูปออก · `undefined` = ค่าที่รับไม่ได้ */
function specItemImageId(raw) {
  if (raw === null) return null;
  if (typeof raw !== 'string') return undefined;
  const text = raw.trim();
  if (!text) return null;
  return UUID_PATTERN.test(text) ? text.toLowerCase() : undefined;
}

/**
 * checklist ทั้งชุด → แถวที่เขียนได้ (ยังไม่มี specId — store เติม)
 *
 * ⚠️ ส่งมาเมื่อไรคือ **ทับทั้งก้อน** — แถวที่หายไปจากที่ส่งมา = แถวที่ถูกลบ
 * ⚠️ คำของแถวที่มีคีย์อ่านจากทะเบียนวันนี้ (กระดาษพูดคำเดียวกันทุกใบ) · แถวที่เพิ่มเองใช้คำที่พิมพ์
 * ⭐ **สามคีย์ที่เป็น "สามสถานะ"** (mig 0405) — ไม่ส่งคีย์มา ≠ ส่ง null:
 *    · `costPrice` / `imageAttachmentId`: ไม่มีคีย์ในแถวที่ส่งมา = **ไม่มีคีย์ในผลลัพธ์** (RPC ยกค่าของแถวเดิมมาให้ —
 *      จอรุ่นก่อน/แท็บค้างที่ไม่รู้จักสองช่องนี้จึงไม่ล้างของคนอื่น) · null หรือค่าว่าง = ล้าง · มีค่า = ตรวจแล้วเขียน
 *    · `id`: ผ่านเฉพาะที่รูปร่างถูก (ที่เหลือทิ้งเงียบ) — store ตัดสินอีกชั้นว่าเป็น id ของแถวในสเปคนี้จริงไหม
 * ⚠️ ห้ามเติมคีย์เหล่านี้เป็นค่าตั้งต้น — เติม `costPrice: null` เมื่อไร คนที่ไม่มีสิทธิ์เห็นราคาทุนกดบันทึก = ล้างทั้งคอลัมน์
 */
export function normalizeSpecItems(rows) {
  if (!Array.isArray(rows)) return { error: 'รูปแบบ checklist ไม่ถูกต้อง' };
  const extras = rows.filter((row) => !row?.itemKey).length;
  if (extras > SPEC_ITEM_EXTRA_MAX) return { error: `เพิ่มแถว checklist เองได้ไม่เกิน ${SPEC_ITEM_EXTRA_MAX} แถว` };
  const seen = new Set();
  const seenImages = new Set();
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
    const out = {
      sortOrder: index,
      itemKey: key,
      itemLabel: label,
      detail,
      preparedByS: Boolean(row?.preparedByS),
      preparedByCustomer: Boolean(row?.preparedByCustomer),
      note,
    };
    if (typeof row?.id === 'string' && SPEC_ITEM_ID_PATTERN.test(row.id)) out.id = row.id;
    if (row?.costPrice !== undefined) {
      const cost = specItemCost(row.costPrice);
      if (cost === undefined) {
        return { error: `ราคาทุน checklist แถวที่ ${index + 1} ต้องเป็นตัวเลขตั้งแต่ 0 ถึง 999,999,999.99` };
      }
      out.costPrice = cost;
    }
    if (row?.imageAttachmentId !== undefined) {
      const imageId = specItemImageId(row.imageAttachmentId);
      if (imageId === undefined) return { error: `รูป checklist แถวที่ ${index + 1} ไม่ถูกต้อง` };
      if (imageId) {
        if (seenImages.has(imageId)) return { error: `รูป checklist แถวที่ ${index + 1} ซ้ำกับแถวก่อนหน้า` };
        seenImages.add(imageId);
      }
      out.imageAttachmentId = imageId;
    }
    value.push(out);
  }
  return { value };
}

/**
 * แถวที่ผ่าน `normalizeSpecItems` แล้ว + แถวที่เก็บอยู่ → แถวที่ส่งเข้า RPC ได้ (mig 0405)
 *
 * · `id` — แถวเดิมหนึ่งแถวให้ id ได้ **ครั้งเดียว** · สองรอบ:
 *   ① id ที่ client ส่งมา: คงไว้เฉพาะเมื่อเป็น id ของแถวที่เก็บอยู่ **ในสเปคนี้** และยังไม่มีแถวก่อนหน้าใช้ไป · นอกนั้น
 *     ตัดคีย์ทิ้ง (PK ของตารางเป็นของทั้งระบบ ไม่ใช่รายสเปค — id จาก client ที่หลุดเข้าไป = ชน PK ของสเปคอื่น
 *     หรือจอง id ล่วงหน้าได้)
 *   ② แถวที่ยังไม่มี id (จอรุ่นก่อน/แท็บค้างไม่ส่ง id มาเลย): รับ id ของแถวเดิมที่ยังว่าง ซึ่ง `itemKey` ตรงกัน (แถวของ
 *     แบบฟอร์ม) · ไม่มีค่อยแถวเดิมที่เพิ่มเอง (`itemKey` ว่างทั้งคู่) ที่ **ชื่อรายการตรงกันเป๊ะ** · ไล่ตามลำดับแถวที่ส่งมา
 *     และตามลำดับแถวที่เก็บอยู่ ⇒ ผลเดิมทุกครั้ง · รอบ ① จบก่อนเสมอ (id ที่ส่งมาชนะการจับด้วยคีย์/ชื่อ)
 *     ⇒ แถวพวกนั้นถึง RPC พร้อม id เดิม แล้ว RPC ยกราคาทุน/รูปให้ด้วย id (กฎเดียวกับขั้น ②③ ของ RPC ใน 0405 —
 *     ที่นั่นคือตาข่ายของผู้เรียกที่ไม่ผ่านฟังก์ชันนี้: โค้ดรุ่นก่อนที่ยังรันอยู่ · worktree อื่นบนฐานเดียวกัน)
 *   ที่เหลือไม่มี id ให้ store ออกใหม่ · ตอนสร้างสเปคส่ง `storedRows = []` ⇒ id จาก client ไม่ถึง RPC เลย
 * · `costPrice` — คนที่แก้ราคาทุนไม่ได้: ตัดคีย์ทิ้ง (ไม่ใช่ error) ⇒ RPC ยกค่าของแถวเดิมมาให้
 * · `explicitImages` — **มีแถวอย่างน้อยหนึ่งแถว** และทุกแถวส่งคีย์ `imageAttachmentId` มา = จอรุ่นที่รู้จักรูปของแถว
 *   "ตั้งใจ" กับตัวชี้ทุกตัว ⇒ store เก็บกวาดรูปที่ไม่มีแถวชี้ได้ · แถวไหนไม่มีคีย์ (จอรุ่นก่อน/แท็บค้าง) = ห้ามเก็บกวาด
 *   🔴 ลิสต์ว่าง = **ไม่** นับว่าส่งครบ — ไม่มีแถวให้ดูว่าผู้เรียกรู้จักรูปของแถวไหม (จอรุ่นก่อนลบทุกแถวแล้วบันทึกก็ส่ง `[]`
 *   เหมือนกัน) ⇒ ไม่เก็บกวาดที่การบันทึกนั้น · รูปที่ค้างถูกเก็บโดยกฎอายุในการบันทึกครั้งถัดไปที่มีแถว หรือตอนลบสเปค
 * @returns {{ rows: object[], explicitImages: boolean }}
 */
export function prepareSpecItemRows(normalizedRows, storedRows, { canEditCost = false } = {}) {
  const list = Array.isArray(normalizedRows) ? normalizedRows : [];
  const stored = (storedRows || []).filter((row) => row?.id);
  const free = new Set(stored.map((row) => row.id));
  const rows = list.map((row) => {
    const out = { ...row };
    if (out.id !== undefined && free.has(out.id)) free.delete(out.id);
    else delete out.id;
    if (!canEditCost) delete out.costPrice;
    return out;
  });
  for (const out of rows) {
    if (out.id !== undefined) continue;
    const twin = stored.find((have) => free.has(have.id) && (out.itemKey
      ? have.itemKey === out.itemKey
      : !have.itemKey && Boolean(out.itemLabel) && have.itemLabel === out.itemLabel));
    if (!twin) continue;
    out.id = twin.id;
    free.delete(twin.id);
  }
  return { rows, explicitImages: list.length > 0 && list.every((row) => row && 'imageAttachmentId' in row) };
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
