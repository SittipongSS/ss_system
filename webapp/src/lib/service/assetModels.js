// ── ทะเบียนรุ่นเครื่อง + สีของแต่ละรุ่น (mig 0344 · มติผู้ใช้ 2026-09-03) ───
//
// ⭐ **ชนิด/รุ่น/สี เป็นตัวเลือก ไม่ใช่ช่องพิมพ์อิสระ** — วันนี้ `model` กับ `colour`
//   เป็น text อิสระไม่มีอะไรคุม ⇒ ชีตเก่ามีทั้ง `OV08` และ `OV-08` ปนกัน 48 แถว
//   ทั้งที่เป็นรุ่นเดียวกัน · ทะเบียนนี้คือที่ที่ตัดสินว่ารุ่นไหนมีอยู่จริง
//
// ⭐ **สีผูกกับรุ่น** (มติผู้ใช้) — เลือกรุ่นแล้วเห็นเฉพาะสีที่รุ่นนั้นมีจริง
//   เครื่องกดสบู่มีขาวอย่างเดียว จึงเลือกดำไม่ได้ ⇒ กันของที่ไม่มีอยู่จริงตั้งแต่กรอก
//
// ⭐ **ทะเบียนอยู่ที่หน้าตั้งค่าของโมดูลบริการ · โมดัลเพิ่มเครื่องเป็นที่ "ใช้" ไม่ใช่ที่ "สร้าง"**
//   (กติกาเดียวกับที่ทะเบียนไซต์ไม่มีปุ่มสร้างในโมดัลนัด)
//   แลกกับ: เจอรุ่นใหม่กลางงานต้องออกไปตั้งค่าก่อนแล้วกลับมา — ยอมรับได้เพราะรุ่นใหม่
//   นาน ๆ ครั้ง และกันรุ่นซ้ำ/พิมพ์ผิดได้จริง
//
// ⚠️ ไฟล์นี้ไม่แตะ DB — ใช้ได้ทั้งจอและ API (กติกาเดียวกับ `sites.js`)
import { ASSET_KINDS, ASSET_KIND_LABELS } from './assetKinds';
import { normalizeModelCode } from './machineCode';

export const MODEL_NAME_MAX = 100;
export const MODEL_COLOUR_MAX = 50;
/* เพดานจำนวนสีต่อรุ่น — ไม่ใช่ข้อจำกัดเชิงเทคนิค แต่เป็นเพดานของ "รายการที่ยังเลือกไหว"
   รุ่นที่มี 30 สีแปลว่าคนกำลังใช้ช่องสีเก็บอย่างอื่น (รุ่นย่อย/ล็อต) ซึ่งควรเป็นรุ่นแยก */
export const MODEL_COLOURS_MAX = 12;

/** สีที่พิมพ์กันบ่อย — เป็นแค่ปุ่มลัดในหน้าตั้งค่า ไม่ใช่ชุดปิด (รุ่นใหม่มีสีใหม่ได้เสมอ) */
export const COMMON_COLOURS = ['ขาว', 'ดำ', 'เงิน', 'ทอง', 'เทา'];

/** สีหนึ่งค่า — ตัดช่องว่างหัวท้าย · คืน `null` ถ้าว่าง */
const cleanColour = (value) => String(value ?? '').trim().replace(/\s+/g, ' ') || null;

/**
 * ล้างรายการสีให้เป็นชุดที่เก็บลงฐานได้ — คืน `{ value, error }`
 *
 * ⚠️ **ซ้ำแบบไม่สนตัวพิมพ์/ช่องว่าง** ต้องยุบให้เหลือตัวเดียว — `"ขาว "` กับ `"ขาว"`
 *   เป็นสีเดียวกันในสายตาคน แต่เป็นสองตัวเลือกในดรอปดาวน์ ซึ่งอ่านแล้วงง
 */
export function normalizeColours(raw) {
  if (raw === undefined || raw === null || raw === '') return { value: [], error: null };
  const list = Array.isArray(raw) ? raw : String(raw).split(',');
  const out = [];
  const seen = new Set();
  for (const item of list) {
    const colour = cleanColour(item);
    if (!colour) continue;
    if (colour.length > MODEL_COLOUR_MAX) {
      return { value: null, error: `ชื่อสียาวเกิน ${MODEL_COLOUR_MAX} ตัวอักษร` };
    }
    const key = colour.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(colour);
  }
  if (out.length > MODEL_COLOURS_MAX) {
    return { value: null, error: `ใส่สีได้ไม่เกิน ${MODEL_COLOURS_MAX} สีต่อรุ่น` };
  }
  return { value: out, error: null };
}

/**
 * ตรวจ + ล้างข้อมูลรุ่นก่อนบันทึก — คืน `{ value, error }`
 *
 * 🔑 **ตัวตัดสินตัวเดียวที่ทั้งจอและ API ใช้** (กติกาเดียวกับ `normalizeAssetInput`)
 */
export function normalizeModelInput(input = {}) {
  const kind = String(input.kind ?? '').trim();
  if (!ASSET_KINDS.includes(kind)) return { value: null, error: 'ต้องเลือกชนิดเครื่อง' };

  const name = String(input.name ?? '').trim().replace(/\s+/g, ' ');
  if (!name) return { value: null, error: 'ต้องระบุชื่อรุ่น' };
  if (name.length > MODEL_NAME_MAX) {
    return { value: null, error: `ชื่อรุ่นยาวเกิน ${MODEL_NAME_MAX} ตัวอักษร` };
  }

  const { value: modelCode, error: codeError } = normalizeModelCode(input.modelCode);
  if (codeError) return { value: null, error: codeError };

  const { value: colours, error: colourError } = normalizeColours(input.colours);
  if (colourError) return { value: null, error: colourError };

  const note = String(input.note ?? '').trim();
  if (note.length > 500) return { value: null, error: 'หมายเหตุยาวเกิน 500 ตัวอักษร' };

  return {
    value: {
      kind,
      name,
      modelCode,
      colours,
      isActive: input.isActive === undefined ? true : Boolean(input.isActive),
      note: note || null,
    },
    error: null,
  };
}

/**
 * 🔑 **ด่านเดียวของการแก้ทะเบียนรุ่น** — คืนข้อความไทยเมื่อทำไม่ได้ หรือ `null` เมื่อผ่าน
 *
 * @param mode      `'create' | 'update' | 'delete'`
 * @param ctx.canEdit  ผู้ใช้แก้ทะเบียนบริการได้ไหม (ผู้เรียกคำนวณมาให้)
 * @param ctx.before   แถวเดิม (โหมดแก้/ลบ)
 * @param ctx.usedBy   จำนวนเครื่องที่อ้างรุ่นนี้อยู่
 *
 * ⚠️ fail-closed: ไม่ส่งบริบทมา = ปฏิเสธ
 */
export function assetModelError(mode, input = {}, ctx = {}) {
  const { canEdit = false, before = null, usedBy = 0 } = ctx;
  if (!canEdit) return 'ไม่มีสิทธิ์แก้ทะเบียนรุ่นเครื่อง';

  if (mode === 'delete') {
    if (!before) return 'ไม่พบรุ่นนี้ในทะเบียน';
    /* ⭐ **รุ่นที่ใช้อยู่ลบไม่ได้ — ปิดใช้งานได้อย่างเดียว** (กติกาเดียวกับโซนที่มี
       ประวัติการขาย · แม่แบบต้นทุนที่ซ่อนแทนลบ) · เครื่องที่ออกรหัสไปแล้วถือ
       `modelCode` ของรุ่นนี้ไว้ในรหัสตัวเอง ⇒ ลบทะเบียนทิ้ง = รหัสที่พิมพ์ติดเครื่อง
       อ่านกลับไม่เจอต้นทาง */
    if (usedBy > 0) {
      return `รุ่นนี้มีเครื่องใช้อยู่ ${usedBy} ตัว — ลบไม่ได้ ปิดใช้งานแทนเพื่อไม่ให้เลือกเพิ่ม`;
    }
    return null;
  }

  const { value, error } = normalizeModelInput(input);
  if (error) return error;

  if (mode === 'update') {
    if (!before) return 'ไม่พบรุ่นนี้ในทะเบียน';
    /* 🔴 **รหัส 4 ตัวแก้ไม่ได้เมื่อมีเครื่องแล้ว** — มันอยู่ในรหัสเครื่องที่ออกไปแล้ว
       ⇒ แก้ทะเบียนอย่างเดียวจะได้ทะเบียนที่ไม่ตรงกับของที่ติดอยู่หน้างาน
       ⚠️ ชนิดก็เช่นกัน: เครื่องเก็บ `kind` ของตัวเองไว้ตอนสร้าง การย้ายชนิดของรุ่น
          ทำให้ทะเบียนบอกคนละอย่างกับแถวเครื่อง */
    if (usedBy > 0 && value.modelCode !== before.modelCode) {
      return `รุ่นนี้มีเครื่องใช้อยู่ ${usedBy} ตัว — แก้รหัส 4 ตัวไม่ได้ เพราะรหัสเครื่องที่ออกไปแล้วจะไม่ตรงกับทะเบียน`;
    }
    if (usedBy > 0 && value.kind !== before.kind) {
      return `รุ่นนี้มีเครื่องใช้อยู่ ${usedBy} ตัว — ย้ายชนิดไม่ได้`;
    }
  }
  return null;
}

/** ตัวเลือก "ชนิด" ของฟอร์ม — ตามทะเบียนชนิดกลาง ไม่สะกดเองซ้ำ */
export const assetKindOptions = () => ASSET_KINDS.map((kind) => ({
  value: kind, label: ASSET_KIND_LABELS[kind] || kind,
}));

/**
 * รุ่นที่เลือกได้ของชนิดหนึ่ง — เรียงตามชื่อ
 * ⚠️ **กรองรุ่นที่ปิดใช้งานออก** — ปิดใช้งานคือ "ไม่ให้เลือกเพิ่ม" ไม่ใช่ "ลบ"
 *   ⇒ เครื่องเก่าที่ใช้รุ่นนั้นยังอ่านชื่อรุ่นได้ปกติ
 */
export function modelOptions(models = [], kind = null) {
  return (models || [])
    .filter((m) => m && m.isActive !== false && (!kind || m.kind === kind))
    .slice()
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'th'))
    .map((m) => ({ value: m.id, label: m.name, hint: m.modelCode }));
}

/**
 * สีที่รุ่นหนึ่งมี — คืน `[]` ถ้ารุ่นไม่แยกสี
 * ⚠️ `[]` กับ "ยังไม่ได้เลือกรุ่น" ต้องแยกกันที่จอ: อย่างแรกซ่อนช่องสี อย่างหลังปิดช่องไว้
 */
export function modelColours(models = [], modelId = null) {
  const model = (models || []).find((m) => m && m.id === modelId);
  return Array.isArray(model?.colours) ? model.colours : [];
}

/** นับเครื่องที่อ้างแต่ละรุ่น — `{ [modelId]: จำนวน }` (จอทะเบียนรุ่นโชว์คอลัมน์ "ใช้อยู่") */
export function modelUsage(assets = []) {
  const out = {};
  for (const asset of assets || []) {
    const id = asset?.modelId;
    if (!id) continue;
    out[id] = (out[id] || 0) + 1;
  }
  return out;
}
