// ── ส่วนหัวของแบบฟอร์ม PDR — ด่านล้วน ไม่แตะ DB (mig 0214 · 0217) ────────
//
// ⚠️ ความยาวและช่วงตัวเลขต้อง **ไม่หลวมกว่า CHECK ของ 0214/0217** — หลวมกว่าเมื่อไร
// ก็ได้ error ดิบจาก Postgres ที่ผู้ใช้อ่านไม่รู้เรื่อง แทนข้อความไทยที่บอกว่าต้องแก้ตรงไหน
//
// ⭐ **แผนที่ช่อง→คอลัมน์ derive จากทะเบียน** (`pdrFields.js`) ไม่ไล่เขียนมือ —
// เดิมเขียนมือ 21 บรรทัด ⇒ เพิ่มช่องในทะเบียนแล้วลืมมาเติมที่นี่ = ช่องใหม่กรอกได้
// บนจอแต่ไม่เคยถูกบันทึก ซึ่งเป็นบั๊กเดียวกับที่เพิ่งแก้ไปใน #1052 แค่มาอีกทาง
import { PDR_FIELDS } from '@/lib/requests/pdrFields';

const TEXT_LIMITS = {
  pdrRequestType: 40, pdrCustomerBrand: 200, pdrMoodTone: 500, pdrBrandDirection: 500,
  pdrShipTo: 500, pdrCustomerKind: 40, pdrTargetDemographic: 500,
  pdrTargetPsychographic: 500, pdrTargetPainpoint: 500, pdrProductKind: 200,
  pdrMoq: 100, pdrTexture: 40, pdrColor: 200, pdrPackSize: 500,
  pdrBrandSample: 500, pdrSpecialRequirements: 2000,
  // 0217
  pdrPrevProductCode: 200, pdrPackagingArtwork: 40,
  pdrVpAttribute: 2000, pdrVpBenefit: 2000, pdrVpValue: 2000, pdrExportDocNote: 500,
};

// ช่องติ๊กหลายตัว — เก็บเป็น text[] ตามแพตเทิร์นของ dept_request_scents (0213)
const MAX_ITEMS = { pdrPackagingForms: 10, pdrDocuments: 20 };

const AMOUNTS = ['pdrProjectValue', 'pdrTargetCost', 'pdrTargetPrice'];
const DATES = ['pdrWantedAt', 'pdrSellFrom'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// ชื่อช่องในฟอร์ม → ชื่อคอลัมน์ · ฟอร์มใช้ชื่อสั้นเพราะอยู่ในบริบท PDR อยู่แล้ว
// ส่วน DB ต้อง prefix เพื่อไม่ให้ปนกับคอลัมน์ของกลไกคำร้อง
const FIELD_TO_COLUMN = Object.fromEntries(
  PDR_FIELDS.filter((f) => f.column).map((f) => [f.key, f.column]),
);
const FIELD_TYPE = Object.fromEntries(PDR_FIELDS.map((f) => [f.key, f.type]));

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

    // ⚠️ ช่องติ๊กหลายตัว — **ไม่ตรวจว่าค่าอยู่ในชุดตัวเลือกไหม** ตามแพตเทิร์นของ
    // 0213: ชุดตัวเลือกอยู่ฝั่งโค้ดและยังเปลี่ยนได้ · ที่ตรวจคือรูปแบบและจำนวน
    if (FIELD_TYPE[field] === 'multi') {
      const list = (Array.isArray(value) ? value : [])
        .map((v) => String(v ?? '').trim()).filter(Boolean);
      if (list.length > MAX_ITEMS[column]) {
        return { columns: {}, error: `เลือกได้ไม่เกิน ${MAX_ITEMS[column]} รายการ` };
      }
      // ⚠️ ซ้ำต้องตัดทิ้ง ไม่ใช่ตีกลับ — ติ๊กซ้ำเป็นความผิดพลาดของหน้าจอ ไม่ใช่ของคนกรอก
      columns[column] = [...new Set(list)];
      continue;
    }

    if (AMOUNTS.includes(column)) {
      const text = String(value ?? '').replace(/,/g, '').trim();
      if (!text) { columns[column] = null; continue; }
      const num = Number(text);
      // ⚠️ ตัวเลขติดลบหรืออ่านไม่ออกต้องตีกลับ ไม่ใช่เก็บ null เงียบ ๆ — ผู้ใช้พิมพ์
      // อะไรลงไปแล้ว การกลืนทิ้งแปลว่าเขาคิดว่าบันทึกได้
      if (!Number.isFinite(num) || num < 0) {
        return { columns: {}, error: 'ราคาและมูลค่าต้องเป็นตัวเลขไม่ติดลบ' };
      }
      columns[column] = num;
      continue;
    }

    if (DATES.includes(column)) {
      const text = String(value ?? '').trim();
      if (!text) { columns[column] = null; continue; }
      if (!ISO_DATE.test(text)) return { columns: {}, error: 'วันที่ในแบบฟอร์ม PDR ไม่ถูกต้อง' };
      columns[column] = text;
      continue;
    }

    const text = String(value ?? '').trim();
    if (text.length > TEXT_LIMITS[column]) {
      return { columns: {}, error: `ข้อความในแบบฟอร์ม PDR ยาวเกิน ${TEXT_LIMITS[column]} ตัวอักษร` };
    }
    columns[column] = text || null;
  }
  return { columns, error: null };
}
