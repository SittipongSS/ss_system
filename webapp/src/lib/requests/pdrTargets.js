// ── PDR 2.2/2.3 · ต้นทุนและราคาขายเป้าหมาย "รายสินค้า" (mig 0229) ────────
//
// ⭐ **หนึ่งแถว = สินค้าหนึ่งตัวที่ขอพัฒนา** (มติผู้ใช้ 2026-08-10) — แถวหนึ่งถือ
// ทั้งต้นทุนต่อกิโล (แยกหัวน้ำหอม F / เนื้อสาร FB) และราคาขายต่อชิ้น ⇒ เปิดสินค้า
// ตัวไหนก็เห็นทั้งสองด้านพร้อมกัน ไม่ต้องเดินไปอีกข้อเพื่อดูราคาขายของตัวเดียวกัน
//
// ⚠️ **หมวดมาจากข้อ 1.11 ของใบเดียวกัน** ไม่ใช่ทะเบียนหมวดทั้งหมด — ใบนี้ประกาศไว้
// แล้วว่าขอพัฒนาหมวดอะไรบ้าง · ให้เลือกนอกเหนือจากนั้นได้เมื่อไร 1.11 กับ 2.2 จะ
// ขัดกันเองโดยไม่มีอะไรฟ้อง · **ซ้ำหมวดได้** (Room Spray 50ml กับ 100ml คนละต้นทุน)
//
// ⚠️ **ด่านอยู่ที่นี่ที่เดียว** — route เรียกตัวนี้ ไม่คิดกฎเอง (แพตเทิร์นเดียวกับ
// `normalizeScentBriefs`) · ฟอร์มเรียกตัวเดียวกันไม่ได้เพราะเป็นฝั่ง client แต่ข้อความ
// ที่ผู้ใช้เห็นต้องมาจากที่นี่เสมอ ไม่งั้นสองฝั่งจะพูดคนละคำ

import { ALL_UNITS, VOLUME_UNITS } from '@/lib/master/units';
import { isScentUsable } from '@/lib/master/scents';
import { fmtNumber } from '@/lib/format';

export const MAX_PDR_TARGETS = 20;

/* ⚠️ 500 → 200 (ผลตรวจช่องยาว/สั้น 2026-09-11) — ช่องรายละเอียด F/FB เป็นบรรทัดเดียว
   และของจริงบน prod ยาวสุด 56 ตัวอักษร · เพดาน 500 ในช่องบรรทัดเดียวผิดกติกาฟอร์ม
   (เกิน ~200 = ต้องเป็นช่องยาว) · CHECK ของ 0229 ยังเป็น 500 — แอปเข้มกว่า DB ได้ */
const NOTE_LIMIT = 200;

/* ⭐ **ลักษณะเนื้อ (ข้อ 2.5) รายสินค้า** — ชุดเดียวกับหัวใบเดิม (`PDR_TEXTURES`) ประกาศซ้ำ
   ที่นี่ไม่ได้ เพราะ pdrFields.js import ไฟล์นี้ (วงจร import) ⇒ เก็บ key ตรงนี้ที่เดียว
   แล้ว pdrFields ใช้ตัวนี้เป็นต้นทางของตัวเลือกทั้งสองที่ */
export const PDR_TEXTURE_OPTIONS = Object.freeze([
  { value: 'standard', label: 'STANDARD' },
  { value: 'premium', label: 'PREMIUM' },
]);
export const PDR_TEXTURE_VALUES = Object.freeze(PDR_TEXTURE_OPTIONS.map((o) => o.value));

/* ⭐ **ข้อ 2.x รายสินค้า** (มติผู้ใช้ 2026-09-11 · mig 0352) — เดิม MOQ/เนื้อ/สี/ขนาดเป็นช่อง
   ระดับใบ ⇒ ขอสองหมวดในใบเดียว ระบบไม่รู้ว่าอะไรเป็นของสินค้าไหน · ตอนนี้ทุกข้อ
   ที่เป็น "สเปกของสินค้า" อยู่ในแถวเดียวกับต้นทุน/ราคาของสินค้าตัวนั้น
   ⚠️ **ทะเบียนนี้คือที่เดียวของป้าย + เลขข้อ + เพดาน** — ฟอร์ม · จอสรุป · เอกสาร อ่านจาก
   ที่นี่ทั้งหมด (บทเรียนของ pdrFields.js: สามจอเขียนคำเองแล้วเพี้ยนหากันทุกมิติ)
   ⚠️ **ทุกคีย์ต้องอยู่ในสามที่พร้อมกัน** — `emptyPdrTarget` · `pdrTargetValuesFrom` ·
   `normalizePdrTargets` · PATCH แบบฟอร์มลบแล้ว insert แถวใหม่ด้วยคีย์ที่ normalizer คืน
   ⇒ คีย์ที่ตกหล่นที่ใดที่หนึ่ง **หายเงียบตอนกดบันทึก** (มีเทสต์วนทะเบียนนี้คุมไว้) */
export const PDR_TARGET_SPEC = Object.freeze([
  { key: 'moq', no: '2.4', label: 'MOQ ที่คาดหวัง', type: 'amount', valueField: 'moqValue', unitField: 'moqUnit', units: ALL_UNITS, defaultUnit: 'ชิ้น' },
  { key: 'texture', no: '2.5', label: 'ลักษณะเนื้อผลิตภัณฑ์', type: 'select', field: 'texture', values: PDR_TEXTURE_VALUES, options: PDR_TEXTURE_OPTIONS },
  { key: 'color', no: '2.6', label: 'สีเนื้อผลิตภัณฑ์', type: 'text', field: 'color', max: 200 },
  { key: 'size', no: '2.7.1', label: 'ขนาดบรรจุ', type: 'amount', valueField: 'sizeValue', unitField: 'sizeUnit', units: VOLUME_UNITS, defaultUnit: 'ml' },
  { key: 'qty', no: '2.7.2', label: 'จำนวนต่อกลิ่น', type: 'amount', valueField: 'qtyValue', unitField: 'qtyUnit', units: ALL_UNITS, defaultUnit: 'ชิ้น' },
  { key: 'note', no: '2.7.3', label: 'หมายเหตุ', type: 'text', field: 'note', max: 500, long: true },
]);

/* ป้าย + เลขข้อของส่วนที่เหลือของแถว — ใช้ร่วมกันสามจอเหมือนตัวบน */
export const PDR_TARGET_LABELS = Object.freeze({
  scent: { no: '2.1', label: 'กลิ่นของสินค้านี้ (จากทะเบียน)' },
  cost: { no: '2.2', label: 'Target Cost / KG (F/FB ไม่รวมบรรจุภัณฑ์)' },
  price: { no: '2.3', label: 'Target Price / Unit (ราคาขาย บาท/ชิ้น)' },
});

/**
 * ค่าหนึ่งข้อของสเปกรายสินค้า → ข้อความอ่านออก (ว่าง = '') — ใช้ร่วม จอสรุป · เอกสาร · เธรด
 * ⚠️ ตัวเลขผ่าน `fmtNumber` (คั่นหลักพัน) · ตัวเลือกพิมพ์ป้าย ไม่ใช่ key ที่เก็บ
 * ⚠️ ค่าที่ไม่รู้จักพิมพ์ค่าดิบ ไม่ใช่ว่าง — ของเก่าที่บันทึกด้วยชุดอื่นต้องยังอ่านออก
 */
export function pdrTargetSpecText(field, row = {}) {
  if (field.type === 'amount') {
    const v = row[field.valueField];
    if (v == null || String(v).trim() === '') return '';
    return `${fmtNumber(String(v).replace(/,/g, ''))} ${row[field.unitField] || ''}`.trim();
  }
  const text = String(row[field.field] ?? '').trim();
  if (field.type === 'select') return (field.options || []).find((o) => o.value === text)?.label || text;
  return text;
}

/**
 * สินค้าหนึ่งแถว → ข้อ 2.1–2.7.3 เป็น `[{ key, no, label, value }]` (value ว่าง = '') —
 * ของกลางของ **จอสรุปกับเอกสาร** ⇒ ลำดับ ป้าย และรูปแบบตัวเลขเป็นชุดเดียวกันเสมอ
 *
 * @param {object} row แถวจาก DB (`findRequest` แนบ `scentCode`/`scentName` มาให้แล้ว)
 * @param {{ scentSource: 'briefs'|'registry'|null }} options ที่มาของกลิ่นของใบ
 *   — 'briefs' พิมพ์ 2.1 ว่า "ตามบรีฟ" (กลิ่นอยู่ในบรีฟรายกลิ่น ไม่ใช่รายแถว) ·
 *   'registry' พิมพ์รหัส · ชื่อกลิ่นที่เลือก · อื่น ๆ = ไม่มีข้อ 2.1
 */
export function pdrTargetFacts(row = {}, { scentSource = null } = {}) {
  const has = (v) => v != null && String(v).trim() !== '';
  const money = (v) => (has(v) ? fmtNumber(String(v).replace(/,/g, '')) : '');
  const facts = [];
  if (scentSource === 'registry') {
    facts.push({
      key: 'scent', no: PDR_TARGET_LABELS.scent.no, label: 'กลิ่น (จากทะเบียน)',
      // ⚠️ ถอยไปใช้ id เมื่อไม่ได้แนบป้ายมา — ว่างเปล่าจะอ่านเหมือนยังไม่เลือก ทั้งที่เลือกแล้ว
      value: [row.scentCode, row.scentName].filter(Boolean).join(' ') || String(row.scentId ?? '').trim(),
    });
  } else if (scentSource === 'briefs') {
    facts.push({ key: 'scent', no: PDR_TARGET_LABELS.scent.no, label: 'กลิ่น', value: 'ตามบรีฟกลิ่นข้อ 2.1 ด้านบน' });
  }
  const cost = PDR_TARGET_KINDS.filter((k) => row[k.onField]).map((k) => {
    const note = String(row[k.noteField] ?? '').trim();
    const price = money(row[k.priceField]);
    return [k.label, note, price ? `${price} บาท/Kg` : ''].filter(Boolean).join(' ');
  });
  facts.push({ key: 'cost', no: PDR_TARGET_LABELS.cost.no, label: PDR_TARGET_LABELS.cost.label, value: cost.join(' · ') });
  facts.push({
    key: 'price', no: PDR_TARGET_LABELS.price.no, label: 'Target Price / Unit (ราคาขาย)',
    value: money(row.pricePerUnit) ? `${money(row.pricePerUnit)} บาท/ชิ้น` : '',
  });
  for (const f of PDR_TARGET_SPEC) facts.push({ key: f.key, no: f.no, label: f.label, value: pdrTargetSpecText(f, row) });
  return facts;
}

/** หัวของสินค้าหนึ่งแถว — "ขนาด · จำนวน" ไว้ต่อท้ายชื่อหมวด (หมวดซ้ำได้ ⇒ ต้องมีตัวแยก) */
export function pdrTargetSizeText(row = {}) {
  const size = PDR_TARGET_SPEC.find((f) => f.key === 'size');
  const qty = PDR_TARGET_SPEC.find((f) => f.key === 'qty');
  return [pdrTargetSpecText(size, row), pdrTargetSpecText(qty, row)].filter(Boolean).join(' · ');
}

// คอลัมน์ทั้งหมดของส่วนสเปก — ใช้วนตอนประกอบ/อ่านแถว
const SPEC_COLUMNS = PDR_TARGET_SPEC.flatMap((f) => (f.type === 'amount' ? [f.valueField, f.unitField] : [f.field]));

/** สวิตช์สองตัวของข้อ 2.2 — ป้ายบนกระดาษคือ "หัวน้ำหอม (F)" กับ "เนื้อสาร (FB)" */
export const PDR_TARGET_KINDS = [
  { key: 'f', label: 'หัวน้ำหอม (F)', onField: 'fOn', noteField: 'fNote', priceField: 'fPricePerKg' },
  { key: 'fb', label: 'เนื้อสาร (FB)', onField: 'fbOn', noteField: 'fbNote', priceField: 'fbPricePerKg' },
];

/** แถวเปล่าของฟอร์ม — ค่าเริ่มต้นคือ "ยังไม่เลือกอะไรเลย" ทั้งสองสวิตช์ปิด
 * ⭐ หน่วยตั้งต้น (ml · ชิ้น) **ไม่ใช่การตัดสินใจแทนคน** — ตัวเลขยังว่าง และหน่วยที่ไม่มี
 * ตัวเลขกำกับจะไม่ถูกบันทึก (ดู `normalizePdrTargets`) · มันแค่ลดการคลิกของเคสที่พบบ่อย */
export const emptyPdrTarget = (categoryCode = '') => ({
  id: null,
  categoryCode,
  scentId: '',
  fOn: false,
  fNote: '',
  fPricePerKg: '',
  fbOn: false,
  fbNote: '',
  fbPricePerKg: '',
  pricePerUnit: '',
  ...Object.fromEntries(PDR_TARGET_SPEC.flatMap((f) => (f.type === 'amount'
    ? [[f.valueField, ''], [f.unitField, f.defaultUnit]]
    : [[f.field, '']]))),
});

/** แถวจาก DB → ค่าที่ฟอร์มใช้ (ทางกลับของ `normalizePdrTargets`) */
export function pdrTargetValuesFrom(row = {}) {
  const text = (v) => (v == null ? '' : String(v));
  return {
    id: row.id || null,
    categoryCode: text(row.categoryCode),
    fOn: !!row.fOn,
    fNote: text(row.fNote),
    fPricePerKg: text(row.fPricePerKg),
    fbOn: !!row.fbOn,
    fbNote: text(row.fbNote),
    fbPricePerKg: text(row.fbPricePerKg),
    pricePerUnit: text(row.pricePerUnit),
    scentId: text(row.scentId),
    ...Object.fromEntries(PDR_TARGET_SPEC.flatMap((f) => (f.type === 'amount'
      // ⚠️ หน่วยว่างในแถวเก่า = ใช้หน่วยตั้งต้น (ตัวเลขว่างอยู่ดี ไม่มีอะไรถูกเขียนแทน)
      ? [[f.valueField, text(row[f.valueField])], [f.unitField, text(row[f.unitField]) || f.defaultUnit]]
      : [[f.field, text(row[f.field])]]))),
  };
}

// ⚠️ ตัวเลขอ่านไม่ออกต้อง **ตีกลับพร้อมบอกว่าแถวไหนช่องไหน** ไม่ใช่กลืนเป็น null
// เงียบ ๆ — บทเรียนเดียวกับช่องเงินของหัวใบ (`lib/requests/pdr.js`)
function amount(value, { at, label }) {
  const typed = String(value ?? '').trim();
  if (!typed) return { value: null, error: null };
  const num = Number(typed.replace(/,/g, ''));
  if (!Number.isFinite(num) || num < 0) {
    const got = typed.length > 40 ? `${typed.slice(0, 40)}…` : typed;
    return { value: null, error: `${at}: ${label} ต้องเป็นตัวเลขไม่ติดลบ — ได้รับ "${got}"` };
  }
  return { value: num, error: null };
}

/**
 * ค่าจากฟอร์ม → แถวที่พร้อม insert — คืน `{ targets, error }`
 *
 * ⚠️ **ไม่มีแถวไหนบังคับให้กรอกครบ** (กติกาเดียวกับหัวใบ PDR) — ใบร่างที่ยังไม่รู้
 * ราคาก็ต้องบันทึกได้ · ที่ตีกลับคือค่าที่ *กรอกแล้วผิด* ไม่ใช่ค่าที่ยังไม่กรอก
 *
 * @param {object[]} input แถวจากฟอร์ม
 * @param {object} options
 * @param {string[]} [options.categoryCodes] หมวดที่ใบนี้ติ๊กไว้ในข้อ 1.11 — ส่งมาเมื่อไร
 *   จะบังคับว่าแถวต้องเป็นหนึ่งในนั้น (ไม่ส่ง = ไม่ตรวจ เช่นตอนแก้ใบเก่า)
 */
export function normalizePdrTargets(input, { categoryCodes = null, pickScent = false } = {}) {
  const rows = Array.isArray(input) ? input : [];
  if (rows.length > MAX_PDR_TARGETS) {
    return { targets: [], error: `รายการสินค้าใน 2.2 มากเกินไป (สูงสุด ${MAX_PDR_TARGETS} รายการ)` };
  }
  const allowed = Array.isArray(categoryCodes) && categoryCodes.length
    ? new Set(categoryCodes.map((c) => String(c).trim()).filter(Boolean))
    : null;

  const targets = [];
  for (let i = 0; i < rows.length; i += 1) {
    const raw = rows[i] || {};
    const at = `รายการที่ ${i + 1}`;

    const categoryCode = String(raw.categoryCode ?? '').trim();
    if (!categoryCode) return { targets: [], error: `${at}: ยังไม่ได้เลือกประเภทสินค้า` };
    if (categoryCode.length > 40) return { targets: [], error: `${at}: รหัสประเภทสินค้าไม่ถูกต้อง` };
    // ⚠️ ผูกกับ 1.11 — เอาหมวดออกจาก 1.11 แล้วแถวที่ค้างอยู่ต้องถูกทัก ไม่ใช่เงียบ
    if (allowed && !allowed.has(categoryCode)) {
      return {
        targets: [],
        error: `${at}: ประเภทสินค้านี้ไม่ได้อยู่ในข้อ 1.11 แล้ว — เอารายการออก หรือติ๊กหมวดนี้กลับเข้า 1.11`,
      };
    }

    // ⚠️ **ไม่คืน `id` ที่ผู้เรียกส่งมา** — 🐞 เดิมคืน `id: raw.id || null` แล้ว route
    // ประกอบแถวด้วย `{ id: DPT-…, ...t }` ⇒ `null` ทับ id ที่เพิ่งสร้าง ⇒ insert ตกที่
    // PRIMARY KEY แล้วทั้งใบพังเป็น 500 (เจอตอนกดบันทึกจริง 2026-08-10)
    // id ของแถวเป็นเรื่องของฝั่งที่เขียนลง DB เท่านั้น ไม่ใช่ของที่ฟอร์มส่งมาบอก
    const row = { sortOrder: i + 1, categoryCode };

    for (const kind of PDR_TARGET_KINDS) {
      const on = !!raw[kind.onField];
      row[kind.onField] = on;
      if (!on) {
        // ⚠️ **ปิดสวิตช์แล้วต้องล้างค่าทิ้ง** ไม่ใช่เก็บไว้เฉย ๆ — ค่าที่ค้างจะไปโผล่บน
        // กระดาษของสิ่งที่ใบนี้ไม่ได้ขอ (และ CHECK ของ 0229 ก็ปฏิเสธอยู่แล้ว)
        row[kind.noteField] = null;
        row[kind.priceField] = null;
        continue;
      }
      const note = String(raw[kind.noteField] ?? '').trim();
      if (note.length > NOTE_LIMIT) {
        return { targets: [], error: `${at}: รายละเอียด${kind.label} ยาวเกิน ${NOTE_LIMIT} ตัวอักษร` };
      }
      row[kind.noteField] = note || null;
      const price = amount(raw[kind.priceField], { at, label: `ราคา${kind.label} (บาท/Kg)` });
      if (price.error) return { targets: [], error: price.error };
      row[kind.priceField] = price.value;
    }

    const unit = amount(raw.pricePerUnit, { at, label: 'ราคาขาย (บาท/ชิ้น)' });
    if (unit.error) return { targets: [], error: unit.error };
    row.pricePerUnit = unit.value;

    /* ⭐ ข้อ 2.1 กลิ่นจากทะเบียน — เฉพาะรูปทรงที่ประกาศ `pdrScents: 'registry'`
       ⚠️ รูปทรงอื่นล้างทิ้งเสมอ ไม่ใช่เชื่อค่าที่ส่งมา — ใบพัฒนากลิ่นไม่มีช่องนี้ ค่าที่
       หลุดมาจะไปโผล่บนกระดาษเหมือนใบนี้ขอกลิ่นเดิม
       ⚠️ ที่นี่ตรวจแค่รูป · กลิ่นมีจริงไหม ใช้ได้ไหม และเป็นของลูกค้าเจ้าของใบไหม ต้องถาม
       DB ⇒ route เป็นคนตรวจด้วย `pdrTargetScentError` */
    const scentId = String(raw.scentId ?? '').trim();
    if (scentId.length > 100) return { targets: [], error: `${at}: รหัสกลิ่นไม่ถูกต้อง` };
    row.scentId = pickScent && scentId ? scentId : null;

    for (const f of PDR_TARGET_SPEC) {
      if (f.type === 'amount') {
        const got = amount(raw[f.valueField], { at, label: f.label });
        if (got.error) return { targets: [], error: got.error };
        row[f.valueField] = got.value;
        const u = String(raw[f.unitField] ?? '').trim();
        // ⚠️ หน่วยที่ไม่มีตัวเลขกำกับไม่มีความหมาย — ไม่เก็บ (ฟอร์มเติมหน่วยตั้งต้นให้ทุกแถว)
        if (got.value == null) { row[f.unitField] = null; continue; }
        if (u && !f.units.includes(u)) {
          return { targets: [], error: `${at}: หน่วยของ${f.label} "${u}" ไม่อยู่ในลิสต์ (${f.units.join(' · ')})` };
        }
        row[f.unitField] = u || f.defaultUnit;
        continue;
      }
      const text = String(raw[f.field] ?? '').trim();
      if (f.type === 'select') {
        if (text && !f.values.includes(text)) return { targets: [], error: `${at}: ${f.label} ไม่ถูกต้อง` };
        row[f.field] = text || null;
        continue;
      }
      if (text.length > f.max) {
        return { targets: [], error: `${at}: ${f.label} ยาวเกิน ${f.max} ตัวอักษร (พิมพ์มา ${text.length})` };
      }
      row[f.field] = text || null;
    }

    targets.push(row);
  }
  return { targets, error: null };
}

/**
 * แถวนี้ถือว่า "กรอกแล้ว" ไหม — ใช้นับความคืบหน้าบนหัวหมวด
 *
 * ⚠️ เลือกหมวดอย่างเดียวยังไม่นับ — ปุ่มเพิ่มรายการสร้างแถวที่มีหมวดอยู่แล้วเสมอ
 * ⇒ นับตั้งแต่ตอนกดเพิ่มจะได้เกจที่เต็มเองโดยไม่มีใครกรอกอะไร (บทเรียนเดียวกับ
 * ชื่อเรียกบรีฟที่ระบบเติมให้)
 */
export function pdrTargetFilled(row = {}) {
  const has = (v) => v != null && String(v).trim() !== '';
  return !!(row.fOn || row.fbOn || has(row.pricePerUnit)
    || has(row.scentId) || SPEC_COLUMNS.some((c) => !/Unit$/.test(c) && has(row[c])));
}

/**
 * ด่านกดส่งของใบที่เลือกกลิ่นจากทะเบียน (พัฒนาสูตร NPD) — คืนข้อความไทย หรือ null
 *
 * ⭐ มติผู้ใช้ 2026-09-11: **กลิ่นบังคับก่อนกดส่ง ร่างเว้นว่างได้** · สูตรในทะเบียนมี
 * ตัวตนเป็น หมวด × กลิ่น (`formulas_identity_uk`) ⇒ สินค้าที่ไม่มีกลิ่น RD ส่งสูตร
 * เข้าทะเบียนไม่ได้ · กลิ่นที่ยังไม่มีต้องเกิดที่คำร้องพัฒนากลิ่นก่อน (ม-40)
 */
export function pdrTargetsSubmitError(rows = []) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return 'ต้องมีสินค้าที่ขอพัฒนาอย่างน้อย 1 รายการก่อนส่ง (แบบฟอร์ม PDR หมวด 2)';
  const missing = list.findIndex((r) => !String(r?.scentId ?? '').trim());
  if (missing >= 0) {
    return `สินค้ารายการที่ ${missing + 1} ยังไม่ได้เลือกกลิ่นจากทะเบียน — ต้องเลือกก่อนส่ง (กลิ่นที่ยังไม่มีต้องเปิดคำร้องพัฒนากลิ่นก่อน)`;
  }
  return null;
}

/**
 * กลิ่นที่แถวอ้างใช้ได้ไหม — ด่านฝั่ง route (ต้องถาม DB ก่อน แล้วส่งแถวกลิ่นเข้ามา)
 *
 * ⚠️ ตัวกรองบนจอกันคนกดผิด แต่ไม่กันคนยิง API ตรง · กลิ่นข้ามลูกค้าเป็นข้อห้ามระดับ
 * โมเดล (มติ 9) และกลิ่นร่าง/เก็บเข้ากรุไปทำสูตรไม่ได้
 * @param rows แถวที่ normalize แล้ว · @param scents แถวกลิ่นจาก DB ของ id ที่อ้าง
 */
export function pdrTargetScentError(rows = [], scents = [], { customerId = null } = {}) {
  const byId = new Map((scents || []).map((x) => [x.id, x]));
  for (const [i, row] of (rows || []).entries()) {
    if (!row?.scentId) continue;
    const scent = byId.get(row.scentId);
    const at = `สินค้ารายการที่ ${i + 1}`;
    if (!scent) return `${at}: ไม่พบกลิ่นนี้ในทะเบียน — อาจถูกลบไปแล้ว เลือกใหม่`;
    // ⚠️ กลิ่นมีเจ้าของเสมอ (`scents.customerId` อยู่ในคีย์ตัวตน · มติ 9) ⇒ ไม่ผ่อนให้
    //    กลิ่นที่ "ไม่มีเจ้าของ" — ใบที่ยังไม่รู้ลูกค้า (ไม่มีดีล) ต่างหากที่ข้ามข้อนี้
    if (customerId && scent.customerId !== customerId) {
      return `${at}: กลิ่น ${scent.code || scent.name} เป็นของลูกค้ารายอื่น — เลือกได้เฉพาะกลิ่นของลูกค้าเจ้าของดีล`;
    }
    if (!isScentUsable(scent)) {
      return `${at}: กลิ่น ${scent.code || scent.name} ยังใช้ทำสูตรไม่ได้ (รอเข้าทะเบียน/เลิกใช้) — เลือกกลิ่นอื่น`;
    }
  }
  return null;
}

// จำนวนกลิ่นไม่ซ้ำในแถวสินค้า — ข้อ 1.12 ของใบที่เลือกกลิ่นจากทะเบียน · 0 = ยังไม่รู้ (null)
export function pdrTargetsScentCount(rows = []) {
  const ids = new Set((rows || []).map((r) => String(r?.scentId ?? '').trim()).filter(Boolean));
  return ids.size || null;
}

export function pdrTargetsProgress(rows = []) {
  const list = Array.isArray(rows) ? rows : [];
  return { total: list.length, filled: list.filter(pdrTargetFilled).length };
}
