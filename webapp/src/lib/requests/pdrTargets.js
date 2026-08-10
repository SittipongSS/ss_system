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

export const MAX_PDR_TARGETS = 20;

const NOTE_LIMIT = 500;

/** สวิตช์สองตัวของข้อ 2.2 — ป้ายบนกระดาษคือ "หัวน้ำหอม (F)" กับ "เนื้อสาร (FB)" */
export const PDR_TARGET_KINDS = [
  { key: 'f', label: 'หัวน้ำหอม (F)', onField: 'fOn', noteField: 'fNote', priceField: 'fPricePerKg' },
  { key: 'fb', label: 'เนื้อสาร (FB)', onField: 'fbOn', noteField: 'fbNote', priceField: 'fbPricePerKg' },
];

/** แถวเปล่าของฟอร์ม — ค่าเริ่มต้นคือ "ยังไม่เลือกอะไรเลย" ทั้งสองสวิตช์ปิด */
export const emptyPdrTarget = (categoryCode = '') => ({
  id: null,
  categoryCode,
  fOn: false,
  fNote: '',
  fPricePerKg: '',
  fbOn: false,
  fbNote: '',
  fbPricePerKg: '',
  pricePerUnit: '',
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
export function normalizePdrTargets(input, { categoryCodes = null } = {}) {
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

    const row = { id: raw.id || null, sortOrder: i + 1, categoryCode };

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
  return !!(row.fOn || row.fbOn || has(row.pricePerUnit));
}

export function pdrTargetsProgress(rows = []) {
  const list = Array.isArray(rows) ? rows : [];
  return { total: list.length, filled: list.filter(pdrTargetFilled).length };
}
