// ── ส่วนหัวของแบบฟอร์ม PDR — ด่านล้วน ไม่แตะ DB (mig 0214) ──────────────
//
// ⚠️ ความยาวและช่วงตัวเลขต้อง **ไม่หลวมกว่า CHECK ของ 0214** — หลวมกว่าเมื่อไรก็ได้
// error ดิบจาก Postgres ที่ผู้ใช้อ่านไม่รู้เรื่อง แทนข้อความไทยที่บอกว่าต้องแก้ตรงไหน

const TEXT_LIMITS = {
  pdrRequestType: 40, pdrCustomerBrand: 200, pdrMoodTone: 500, pdrBrandDirection: 500,
  pdrShipTo: 500, pdrCustomerKind: 40, pdrTargetDemographic: 500,
  pdrTargetPsychographic: 500, pdrTargetPainpoint: 500, pdrProductKind: 200,
  pdrMoq: 100, pdrTexture: 40, pdrColor: 200, pdrPackSize: 500,
  pdrBrandSample: 500, pdrSpecialRequirements: 2000,
};

const AMOUNTS = ['pdrProjectValue', 'pdrTargetCost', 'pdrTargetPrice'];
const DATES = ['pdrWantedAt', 'pdrSellFrom'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// ชื่อช่องในฟอร์ม → ชื่อคอลัมน์ · ฟอร์มใช้ชื่อสั้นเพราะอยู่ในบริบท PDR อยู่แล้ว
// ส่วน DB ต้อง prefix เพื่อไม่ให้ปนกับคอลัมน์ของกลไกคำร้อง
const FIELD_TO_COLUMN = {
  requestType: 'pdrRequestType', customerBrand: 'pdrCustomerBrand',
  moodTone: 'pdrMoodTone', brandDirection: 'pdrBrandDirection', shipTo: 'pdrShipTo',
  customerKind: 'pdrCustomerKind', projectValue: 'pdrProjectValue',
  targetDemographic: 'pdrTargetDemographic', targetPsychographic: 'pdrTargetPsychographic',
  targetPainpoint: 'pdrTargetPainpoint', productKind: 'pdrProductKind',
  wantedAt: 'pdrWantedAt', sellFrom: 'pdrSellFrom', targetCost: 'pdrTargetCost',
  targetPrice: 'pdrTargetPrice', moq: 'pdrMoq', texture: 'pdrTexture',
  color: 'pdrColor', packSize: 'pdrPackSize', brandSample: 'pdrBrandSample',
  specialRequirements: 'pdrSpecialRequirements',
};

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
