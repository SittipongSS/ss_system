// ── บรรทัดในคำร้อง — ตรวจก่อนแตะ DB ───────────────────────────────────────
// รูปร่างบรรทัดที่เหลืออยู่: พัฒนากลิ่น (RD สร้างตอนส่ง ไม่มีตัวตรวจ) · พัฒนาสูตร ·
// เอกสาร — เลือกด้วยคอลัมน์ `lineKind` ผ่านทะเบียนที่ `kinds/lineShapes.js`
//
// ⚠️ **บรรทัดวัสดุถูกถอดทั้งชุดใน mig 0219** (มติ ม-28) พร้อมกับหัวข้อขอราคาและ
// ตาราง `dept_request_item_tiers` — `normalizeRequestItems` / `normalizeRequestTiers`
// เคยอยู่ไฟล์นี้ · ราคาในโมเดลใหม่เป็น **ราคาเดียวไม่มีชั้นจำนวน** ที่ RD ใส่ลงใน
// ใบเดิมตอนลูกค้าคอนเฟิร์ม ไม่ใช่บรรทัดที่ต้องตรวจตอนเปิดใบ
import { ALL_UNITS } from '@/lib/master/units';
import { REQUEST_DOC_VOCABULARY } from '@/lib/requests/docTypes';

export const MAX_REQUEST_ITEMS = 40;

// ── บรรทัดของ "พัฒนาสูตร" (P4) ───────────────────────────────────────────
//
// ⭐ ต่างจากพัฒนากลิ่นตรงที่ **SA สร้างแถวตั้งแต่ตอนเปิด** — คนขอรู้อยู่แล้วว่าอยาก
// ได้หมวดไหน กลิ่นไหน (ต่างจาก direction ของกลิ่นที่ไม่มีใครรู้ล่วงหน้าว่าจะได้กี่ตัว)
//
// ⚠️ **หมวดกับกลิ่นบังคับทั้งคู่** — ไม่ใช่แค่กติกาของฟอร์ม แต่เป็น constraint จริง
// (`dept_request_items_shape` ของ 0204) และเป็น **ตัวตนของสูตรที่จะเกิด** ตาม
// `formulas_identity_uk` ⇒ ขาดข้างใดข้างหนึ่ง = แถวที่ไม่มีทางกลายเป็นสูตรได้
//
// ⚠️ ไม่รับ `label` จาก client — เป็น snapshot ที่ derive จากทะเบียน ผู้เรียก (route)
// เติมให้หลังอ่านชื่อหมวด/ชื่อกลิ่นมาแล้ว (แพตเทิร์นเดียวกับ productFormulaSnapshot)
export function normalizeProductDevItems(input) {
  const rows = Array.isArray(input) ? input : [];
  if (!rows.length) return { items: [], error: 'ต้องมีรายการอย่างน้อย 1 รายการ' };
  if (rows.length > MAX_REQUEST_ITEMS) {
    return { items: [], error: `รายการในคำร้องเดียวมากเกินไป (สูงสุด ${MAX_REQUEST_ITEMS} รายการ)` };
  }

  const items = [];
  const seen = new Set();
  for (let i = 0; i < rows.length; i += 1) {
    const raw = rows[i] || {};
    const at = `รายการที่ ${i + 1}`;

    const categoryCode = String(raw.categoryCode ?? '').trim();
    if (!categoryCode) return { items: [], error: `${at}: ต้องเลือกหมวดสินค้า` };
    if (!/^\d{2}-\d{3}$/.test(categoryCode)) {
      return { items: [], error: `${at}: รหัสหมวดสินค้าไม่ถูกต้อง` };
    }
    const scentId = String(raw.scentId ?? '').trim();
    if (!scentId) return { items: [], error: `${at}: ต้องเลือกกลิ่น` };

    // ⚠️ หมวด × กลิ่น ซ้ำในใบเดียว = ขอของชิ้นเดียวกันสองรอบ · ปล่อยผ่านแล้ว RD
    // จะสร้างสูตรตัวเดียวได้ แถวที่สองค้างตลอดกาลเพราะชนตัวตนของสูตร
    const key = `${categoryCode}::${scentId}`;
    if (seen.has(key)) return { items: [], error: `${at}: หมวดกับกลิ่นซ้ำกับรายการก่อนหน้า` };
    seen.add(key);

    const spec = String(raw.spec ?? '').trim();
    if (spec.length > 2000) return { items: [], error: `${at}: รายละเอียดยาวเกิน 2000 ตัวอักษร` };

    // จำนวนไม่บังคับ — ตอนขอตัวอย่างยังไม่รู้ยอดจริง (ยอดที่นับคือ confirmedQty
    // ตอนลูกค้าตอบ ไม่ใช่ตอนขอ)
    let qty = null;
    if (raw.qty !== undefined && raw.qty !== null && String(raw.qty).trim() !== '') {
      qty = Number(raw.qty);
      if (!Number.isFinite(qty) || qty <= 0) {
        return { items: [], error: `${at}: จำนวนต้องเป็นตัวเลขมากกว่า 0` };
      }
    }
    /* หน่วยมาจากลิสต์กลาง (lib/master/units) — ยังไม่บังคับกรอก แต่ถ้ากรอกต้องเป็นคำที่
       ระบบรู้จัก ไม่งั้นหน่วยบนคำร้องกับบนใบเสนอราคาหลุดกันเงียบ ๆ
       ⭐ ใช้ **ALL_UNITS** (หน่วยขาย ∪ หน่วยบรรจุ) ไม่ใช่ SALE_UNITS อย่างเดียว เพราะช่องนี้
       ถามว่า "ขอเท่าไร" — ของจริงในฐานมีทั้ง 'ชิ้น' และ 'ml' ปนกันอยู่แล้ว บังคับลิสต์เดียว
       จะตัดเคสที่ใช้งานจริงทิ้ง */
    const unit = String(raw.unit ?? '').trim();
    if (unit.length > 50) return { items: [], error: `${at}: หน่วยยาวเกิน 50 ตัวอักษร` };
    if (unit && !ALL_UNITS.includes(unit)) {
      return { items: [], error: `${at}: หน่วย "${unit}" ไม่อยู่ในลิสต์ (${ALL_UNITS.join(' · ')})` };
    }

    items.push({
      // ⭐ id ของแถวเดิม (ถ้ามี) — ผู้เรียกที่ **แก้ใบเดิม** ใช้จับคู่แถวว่าตัวไหน
      // คือตัวไหน · POST ไม่เคยอ่านค่านี้ (มันสร้าง id ของตัวเองเสมอ) และ
      // `requestLineDiff` ยอมรับเฉพาะ id ที่มีอยู่จริงในใบนั้น ⇒ client ปลอม id
      // มาได้ก็กลายเป็นแถวใหม่ ไม่ใช่ทางไปเขียนทับแถวของใบอื่น
      id: String(raw.id ?? '').trim() || null,
      lineKind: 'product_dev',
      categoryCode,
      scentId,
      spec: spec || null,
      qty,
      unit: unit || null,
      sortOrder: i + 1,
    });
  }
  return { items, error: null };
}

// ── บรรทัดของ "ขอเอกสาร" (P5) ────────────────────────────────────────────
//
// ⭐ 1 บรรทัด = 1 ชนิดเอกสาร — ขอหลายอย่างในใบเดียวได้ และแต่ละอย่างเดินคนละจังหวะ
// (IFRA มาก่อน COA ได้) ⇒ สถานะอยู่ที่แถว เหมือนทุกสายในระบบนี้
//
// ⚠️ **ไม่มีช่อง "ต้องใช้ภายใน" รายแถว** — `dueAt` ของ 0204 แปลว่า "ฝ่ายรับปากว่าจะ
// ส่งวันไหน" ซึ่งเป็นคำสัญญาของ *ผู้ตอบ* · ยัดความหมาย "ผู้ขอต้องใช้ภายใน" ลงช่อง
// เดียวกันเมื่อไร สองฝ่ายจะเขียนทับกันแล้วไม่มีใครรู้ว่าเลขที่เห็นเป็นของใคร
// วันที่ต้องการคำตอบระดับใบมีอยู่แล้ว (`requestedDueDate`) ใช้ตัวนั้นไปก่อน
// ⭐ ตัวตรวจ **ตัวเดียว** ของบรรทัดชนิด "เอกสาร" ทุกคำศัพท์ — RD ขอ IFRA/COA/MSDS
// ฝ่ายบัญชีขอใบวางบิล/ใบกำกับ · กฎเหมือนกันทุกข้อ ต่างแค่ลิสต์ชนิดกับ lineKind
// ⇒ คำศัพท์เข้ามาทาง vocab ไม่ใช่ก๊อปฟังก์ชันไปแก้ลิสต์ (ก๊อปแล้วแก้กฎที่เดียวลืมอีกที่)
export function normalizeDocLines(input, vocab) {
  const rows = Array.isArray(input) ? input : [];
  if (!rows.length) return { items: [], error: 'ต้องมีรายการอย่างน้อย 1 รายการ' };
  if (rows.length > MAX_REQUEST_ITEMS) {
    return { items: [], error: `รายการในคำร้องเดียวมากเกินไป (สูงสุด ${MAX_REQUEST_ITEMS} รายการ)` };
  }

  const items = [];
  const seen = new Set();
  for (let i = 0; i < rows.length; i += 1) {
    const raw = rows[i] || {};
    const at = `รายการที่ ${i + 1}`;

    const docType = String(raw.docType ?? '').trim();
    if (!docType) return { items: [], error: `${at}: ต้องเลือกชนิดเอกสาร` };
    if (!vocab.values.includes(docType)) {
      return { items: [], error: `${at}: ชนิดเอกสารไม่ถูกต้อง` };
    }

    const spec = String(raw.spec ?? '').trim();
    if (spec.length > 2000) return { items: [], error: `${at}: รายละเอียดยาวเกิน 2000 ตัวอักษร` };
    if (vocab.needsDetail(docType) && !spec) {
      return { items: [], error: `${at}: เลือก "อื่น ๆ" ต้องระบุว่าขอเอกสารอะไร` };
    }

    // ชนิดซ้ำได้ถ้ารายละเอียดต่างกัน (ขอ COA ของสองล็อต) — ซ้ำทั้งคู่คือของชิ้นเดียวกัน
    const key = `${docType}::${spec.toLowerCase()}`;
    if (seen.has(key)) return { items: [], error: `${at}: ซ้ำกับรายการก่อนหน้า` };
    seen.add(key);

    items.push({
      // id ของแถวเดิม — เหตุผลเดียวกับบรรทัดพัฒนาสูตรข้างบน
      id: String(raw.id ?? '').trim() || null,
      lineKind: vocab.lineKind,
      docType,
      // label เป็น NOT NULL — ป้ายอ่านออกของแถวคือชื่อชนิดเอกสาร
      label: vocab.label(docType),
      spec: spec || null,
      sortOrder: i + 1,
    });
  }
  return { items, error: null };
}

// ผู้เรียกเดิมไม่ต้องแก้ — ชุดคำศัพท์ของ RD คือค่าตั้งต้น
export function normalizeDocumentItems(input) {
  return normalizeDocLines(input, REQUEST_DOC_VOCABULARY);
}
