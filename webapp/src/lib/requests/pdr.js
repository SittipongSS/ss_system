// ── ส่วนหัวของแบบฟอร์ม PDR — ด่านล้วน ไม่แตะ DB (mig 0214 · 0218) ────────
//
// ⚠️ ความยาวและช่วงตัวเลขต้อง **ไม่หลวมกว่า CHECK ของ 0214/0218** — หลวมกว่าเมื่อไร
// ก็ได้ error ดิบจาก Postgres ที่ผู้ใช้อ่านไม่รู้เรื่อง แทนข้อความไทยที่บอกว่าต้องแก้ตรงไหน
//
// ⭐ **แผนที่ช่อง→คอลัมน์ derive จากทะเบียน** (`pdrFields.js`) ไม่ไล่เขียนมือ —
// เดิมเขียนมือ 21 บรรทัด ⇒ เพิ่มช่องในทะเบียนแล้วลืมมาเติมที่นี่ = ช่องใหม่กรอกได้
// บนจอแต่ไม่เคยถูกบันทึก ซึ่งเป็นบั๊กเดียวกับที่เพิ่งแก้ไปใน #1052 แค่มาอีกทาง
import { PDR_FIELDS, pdrIsArrayField } from '@/lib/requests/pdrFields';

// ⭐ **เพดานความยาวประกาศที่ทะเบียนช่องเดียว** (`pdrFields.js` · ฟิลด์ `max`) —
// ที่นี่แค่ derive ⇒ ฟอร์มใส่ `maxLength` จากตัวเลขเดียวกับที่ด่านนี้ใช้ตัดสิน
// 🐞 เดิมตารางนี้เขียนมือ 30 บรรทัด และ **ฟอร์มไม่รู้จักมันเลย** ⇒ พิมพ์เกินได้บนจอ
// แล้วไปโดนตีกลับตอนกดบันทึก — โรคเดียวกับช่องเงินที่เพิ่งแก้ไป ต่างแค่ตัวเลข
const TEXT_LIMITS = Object.fromEntries(
  PDR_FIELDS.filter((f) => f.column && f.max).map((f) => [f.column, f.max]),
);

// ช่องติ๊กหลายตัว — เก็บเป็น text[] ตามแพตเทิร์นของ dept_request_scents (0213)
// ⚠️ ทุกคอลัมน์ text[] ของทะเบียนต้องมีเพดานที่นี่ — ไม่มีแล้ว `list.length > undefined`
//    เป็น false เสมอ = ไม่มีเพดานเลยเงียบ ๆ (เทสต์ตรวจให้ครบทุกช่อง)
export const MAX_ITEMS = { pdrPackagingForms: 10, pdrDocuments: 20, pdrProductKinds: 20, pdrArchetypes: 12 };

const AMOUNTS = ['pdrProjectValue', 'pdrTargetCost', 'pdrTargetPrice'];
const DATES = ['pdrWantedAt', 'pdrSellFrom'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// ชื่อช่องในฟอร์ม → ชื่อคอลัมน์ · ฟอร์มใช้ชื่อสั้นเพราะอยู่ในบริบท PDR อยู่แล้ว
// ส่วน DB ต้อง prefix เพื่อไม่ให้ปนกับคอลัมน์ของกลไกคำร้อง
const FIELD_TO_COLUMN = Object.fromEntries(
  PDR_FIELDS.filter((f) => f.column).map((f) => [f.key, f.column]),
);
const FIELD_TYPE = Object.fromEntries(PDR_FIELDS.map((f) => [f.key, f.type]));

// ⭐ **ข้อความตีกลับต้องบอกชื่อช่อง** (ผู้ใช้เจอเอง 2026-08-10) — ฟอร์มมี ~48 ช่อง
// และ toast เดิมบอกแค่ "ราคาและมูลค่าต้องเป็นตัวเลขไม่ติดลบ" ⇒ ตกด่านแล้วต้องไล่
// กางลิ้นชักหาเองว่าช่องไหนผิด · ป้ายมาจากทะเบียนกลาง ไม่พิมพ์คำซ้ำ
const FIELD_LABEL = Object.fromEntries(PDR_FIELDS.map((f) => [f.key, f.label]));
const at = (field) => `ช่อง "${FIELD_LABEL[field] || field}"`;
// ค่าที่พิมพ์ผิดต้องเห็นในข้อความด้วย — "ได้รับ 1,200.-" บอกทันทีว่าติดตรงไหน
// ⚠️ ตัดให้สั้น: ค่าที่ยาวเป็นพันตัวอักษรจะดัน toast จนบังทั้งจอ
const got = (text) => `ได้รับ "${text.length > 40 ? `${text.slice(0, 40)}…` : text}"`;

/**
 * ค่าจากฟอร์ม PDR → คอลัมน์ที่พร้อม insert — คืน { columns, error }
 *
 * ⚠️ **ไม่มีช่องไหนบังคับ** (มติผู้ใช้) — ใบที่กรอกไม่ครบยังบันทึกได้ · RD เห็นช่องว่าง
 * ตอนเปิดอ่านแล้วตีกลับเองได้ ซึ่งเป็นด่านที่ยืดหยุ่นกว่ากฎบังคับ
 */
export function normalizePdr(input) {
  const raw = input && typeof input === 'object' ? input : {};
  const columns = {};

  for (const [field, column] of Object.entries(FIELD_TO_COLUMN)) {
    const value = raw[field];

    /* ⭐ สวิตช์ (1.7.1 "ส่งตัวอย่างไปที่อยู่เดียวกับลูกค้า") — สามสถานะ
       true | false | NULL (ยังไม่ตอบ) · รับได้ทั้ง boolean และสตริงของฟอร์ม
       ⚠️ ค่าอื่นเป็น NULL ไม่ใช่ false — "ไม่รู้" ต้องไม่กลายเป็น "ตอบว่าไม่" เงียบ ๆ */
    if (FIELD_TYPE[field] === 'switch') {
      columns[column] = value === true || value === 'true' ? true
        : value === false || value === 'false' ? false : null;
      continue;
    }

    // ข้อความเขียนต่อของช่องติ๊ก — ตรวจหลังลูป เพราะต้องรู้ว่าติ๊กตัวไหนไว้
    if (FIELD_TYPE[field] === 'notes') continue;

    // ⚠️ ช่องติ๊กหลายตัว — **ไม่ตรวจว่าค่าอยู่ในชุดตัวเลือกไหม** ตามแพตเทิร์นของ
    // 0213: ชุดตัวเลือกอยู่ฝั่งโค้ดและยังเปลี่ยนได้ · ที่ตรวจคือรูปแบบและจำนวน
    // ⚠️ 'categories' เก็บเหมือน 'multi' (text[]) ต่างกันแค่ที่มาของป้าย
    if (pdrIsArrayField({ type: FIELD_TYPE[field] })) {
      const list = (Array.isArray(value) ? value : [])
        .map((v) => String(v ?? '').trim()).filter(Boolean);
      if (list.length > MAX_ITEMS[column]) {
        return { columns: {}, error: `${at(field)} เลือกได้ไม่เกิน ${MAX_ITEMS[column]} รายการ` };
      }
      // ⚠️ ซ้ำต้องตัดทิ้ง ไม่ใช่ตีกลับ — ติ๊กซ้ำเป็นความผิดพลาดของหน้าจอ ไม่ใช่ของคนกรอก
      columns[column] = [...new Set(list)];
      continue;
    }

    if (AMOUNTS.includes(column)) {
      // ⚠️ ข้อความที่เอาไปทวนในข้อความตีกลับคือ **ของที่ผู้ใช้พิมพ์จริง** ไม่ใช่ตัวที่
      // ถอดลูกน้ำแล้ว — ทวนกลับไปคนละหน้าตากับที่เห็นบนจอ คนอ่านจะหาช่องไม่เจอ
      const typed = String(value ?? '').trim();
      const text = typed.replace(/,/g, '');
      if (!text) { columns[column] = null; continue; }
      const num = Number(text);
      // ⚠️ ตัวเลขติดลบหรืออ่านไม่ออกต้องตีกลับ ไม่ใช่เก็บ null เงียบ ๆ — ผู้ใช้พิมพ์
      // อะไรลงไปแล้ว การกลืนทิ้งแปลว่าเขาคิดว่าบันทึกได้
      if (!Number.isFinite(num) || num < 0) {
        return { columns: {}, error: `${at(field)} ต้องเป็นตัวเลขไม่ติดลบ — ${got(typed)}` };
      }
      columns[column] = num;
      continue;
    }

    if (DATES.includes(column)) {
      const text = String(value ?? '').trim();
      if (!text) { columns[column] = null; continue; }
      if (!ISO_DATE.test(text)) {
        return { columns: {}, error: `${at(field)} เป็นวันที่ที่อ่านไม่ออก — ${got(text)}` };
      }
      columns[column] = text;
      continue;
    }

    const text = String(value ?? '').trim();
    if (text.length > TEXT_LIMITS[column]) {
      return {
        columns: {},
        error: `${at(field)} ยาวเกิน ${TEXT_LIMITS[column]} ตัวอักษร (พิมพ์มา ${text.length})`,
      };
    }
    columns[column] = text || null;
  }

  /* ⭐ ข้อความเขียนต่อ (1.15 Archetype) — `{ key: ข้อความ }` · เก็บเฉพาะตัวที่**ยังติ๊กอยู่**
     ⚠️ ติ๊กออกแล้วข้อความต้องหายตาม — ไม่งั้นติ๊กกลับวันหลังจะได้ข้อความเก่าที่ไม่มีใครเห็น
     ว่ายังค้างอยู่ (แพตเทิร์นเดียวกับ scentotypeNotes ของบรีฟ · `normalizeScentBriefs`) */
  for (const field of PDR_FIELDS.filter((f) => f.type === 'notes' && f.column)) {
    const ticked = new Set(columns[FIELD_TO_COLUMN[field.of]] || []);
    const input = raw[field.key] && typeof raw[field.key] === 'object' && !Array.isArray(raw[field.key])
      ? raw[field.key] : {};
    const kept = {};
    for (const [key, v] of Object.entries(input)) {
      if (!ticked.has(key)) continue;
      const text = String(v ?? '').trim();
      if (!text) continue;
      if (text.length > field.max) {
        return {
          columns: {},
          error: `${at(field.key)} ยาวเกิน ${field.max} ตัวอักษร (พิมพ์มา ${text.length})`,
        };
      }
      kept[key] = text;
    }
    columns[field.column] = kept;
  }

  /* ⭐ 1.7.1 — เปิดสวิตช์ "ส่งไปที่อยู่เดียวกับลูกค้า" = ไม่มีที่อยู่จัดส่งของตัวเอง
     ⚠️ ล้างข้อความทิ้ง ไม่ใช่เก็บไว้เงียบ ๆ — ไม่งั้นปิดสวิตช์วันหลังจะเจอที่อยู่เก่า
     โผล่กลับมาเหมือนเพิ่งพิมพ์ และเอกสาร/เธรดจะพิมพ์คนละที่อยู่กับที่จอบอก */
  for (const field of PDR_FIELDS.filter((f) => f.hideWhenOn && f.column)) {
    if (columns[FIELD_TO_COLUMN[field.hideWhenOn]] === true) columns[field.column] = null;
  }
  return { columns, error: null };
}
