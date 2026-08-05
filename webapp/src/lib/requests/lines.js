// ── บรรทัดในคำร้อง — ตรวจก่อนแตะ DB ───────────────────────────────────────
// วันนี้บรรทัดยังเป็น "วัสดุ" อย่างเดียว (MATERIAL_KINDS) · P1 จะขยายเป็นหลายรูปร่าง
// (วัสดุ · พัฒนากลิ่น · พัฒนาผลิตภัณฑ์ · เอกสาร) ผ่านคอลัมน์ lineKind
import { MATERIAL_KINDS, sourceDeptForMaterialKind } from '@/lib/materialPrices';
import {
  REQUEST_DOC_TYPE_VALUES, docTypeLabel, docTypeNeedsDetail,
} from '@/lib/requests/docTypes';

export const MAX_REQUEST_ITEMS = 40;
export const MAX_REQUEST_TIERS = 12;

// items เข้ามาเป็น [{ kind, materialId?, label, spec?, componentId?, tiers: [qty…] }]
// materialId ว่าง = ของใหม่ ผู้เรียก (API) ต้องสร้างวัสดุร่างแล้วเติม id กลับมาก่อนบันทึก
// `hasTiers` มาจากหัวข้อ (requestHasTiers) — false = บังคับราคาเดียว ทิ้งชั้นที่
// client ส่งมาทั้งหมด · มติผู้ใช้ 2026-08-03: **ขอราคา F/FB ไม่มีขั้น MOQ** มีเฉพาะ
// วัสดุ (PM) กับราคาผลิต · หัวน้ำหอม/เนื้อสารคิดเป็นราคาต่อกิโลเดียว ไม่ลดตามจำนวน
export function normalizeRequestItems(input, { dept, hasTiers = true } = {}) {
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
    if (!MATERIAL_KINDS.includes(raw.kind)) return { items: [], error: `${at}: ชนิดวัสดุไม่ถูกต้อง` };
    // ทุกรายการต้องเป็นของฝ่ายเดียวกับหัวคำร้อง — เลขที่ผูกกับฝ่าย ปนกันแล้วส่งผิดคน
    const itemDept = sourceDeptForMaterialKind(raw.kind);
    if (dept && itemDept !== dept) {
      return { items: [], error: `${at}: เป็นของฝ่าย ${itemDept} แต่คำร้องนี้ส่งไปฝ่าย ${dept}` };
    }

    const label = String(raw.label ?? '').trim().replace(/\s+/g, ' ');
    if (!label) return { items: [], error: `${at}: ต้องระบุชื่อวัสดุ` };
    if (label.length > 200) return { items: [], error: `${at}: ชื่อวัสดุยาวเกิน 200 ตัวอักษร` };

    const spec = String(raw.spec ?? '').trim();
    if (spec.length > 2000) return { items: [], error: `${at}: สเปกยาวเกิน 2000 ตัวอักษร` };

    // กันถามวัสดุตัวเดียวกันซ้ำในคำร้องเดียว (ตอบแล้วจะไม่รู้ว่าอันไหนคู่กับอันไหน)
    const dupKey = raw.materialId ? `id:${raw.materialId}` : `new:${label.toLowerCase()}`;
    if (seen.has(dupKey)) return { items: [], error: `${at}: ถามวัสดุตัวนี้ซ้ำในคำร้องเดียวกัน` };
    seen.add(dupKey);

    // หัวข้อที่ไม่มีชั้นจำนวน = ทิ้งของที่ส่งมาเงียบ ๆ ไม่ error — ฟอร์มไม่แสดงช่องนี้
    // อยู่แล้ว ค่าที่หลุดมาได้คือของค้างจากตอนสลับหัวข้อ ไม่ใช่เจตนาของผู้ใช้
    const { tiers, error } = hasTiers
      ? normalizeRequestTiers(raw.tiers)
      : { tiers: [], error: null };
    if (error) return { items: [], error: `${at}: ${error}` };

    items.push({
      kind: raw.kind,
      materialId: raw.materialId || null,
      label,
      spec: spec || null,
      componentId: raw.componentId || null,
      tiers,
      sortOrder: i + 1,
    });
  }
  return { items, error: null };
}

// ชั้นจำนวนที่ขอ — ผู้ขอระบุเองอิสระ ไม่มีชุดค่าบังคับ (มติ 2026-07-26)
// ว่าง = ขอราคาเดียวไม่แบ่งชั้น
export function normalizeRequestTiers(input) {
  const rows = Array.isArray(input) ? input : [];
  if (!rows.length) return { tiers: [], error: null };
  if (rows.length > MAX_REQUEST_TIERS) {
    return { tiers: [], error: `ชั้นจำนวนมากเกินไป (สูงสุด ${MAX_REQUEST_TIERS} ชั้น)` };
  }
  const tiers = [];
  const seen = new Set();
  for (const raw of rows) {
    const qty = Number(typeof raw === 'object' ? raw?.qty : raw);
    if (!Number.isFinite(qty) || qty <= 0) {
      return { tiers: [], error: 'จำนวนที่ขอต้องเป็นตัวเลขมากกว่า 0' };
    }
    if (seen.has(qty)) return { tiers: [], error: `จำนวน ${qty} ซ้ำ` };
    seen.add(qty);
    tiers.push(qty);
  }
  tiers.sort((a, b) => a - b);
  return { tiers, error: null };
}

// ── บรรทัดของ "พัฒนาผลิตภัณฑ์" (P4) ──────────────────────────────────────
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
    const unit = String(raw.unit ?? '').trim();
    if (unit.length > 50) return { items: [], error: `${at}: หน่วยยาวเกิน 50 ตัวอักษร` };

    items.push({
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
export function normalizeDocumentItems(input) {
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
    if (!REQUEST_DOC_TYPE_VALUES.includes(docType)) {
      return { items: [], error: `${at}: ชนิดเอกสารไม่ถูกต้อง` };
    }

    const spec = String(raw.spec ?? '').trim();
    if (spec.length > 2000) return { items: [], error: `${at}: รายละเอียดยาวเกิน 2000 ตัวอักษร` };
    if (docTypeNeedsDetail(docType) && !spec) {
      return { items: [], error: `${at}: เลือก "อื่น ๆ" ต้องระบุว่าขอเอกสารอะไร` };
    }

    // ชนิดซ้ำได้ถ้ารายละเอียดต่างกัน (ขอ COA ของสองล็อต) — ซ้ำทั้งคู่คือของชิ้นเดียวกัน
    const key = `${docType}::${spec.toLowerCase()}`;
    if (seen.has(key)) return { items: [], error: `${at}: ซ้ำกับรายการก่อนหน้า` };
    seen.add(key);

    items.push({
      lineKind: 'document',
      docType,
      // label เป็น NOT NULL — ป้ายอ่านออกของแถวคือชื่อชนิดเอกสาร
      label: docTypeLabel(docType),
      spec: spec || null,
      sortOrder: i + 1,
    });
  }
  return { items, error: null };
}
