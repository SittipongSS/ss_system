// ── บรรทัดในคำร้อง — ตรวจก่อนแตะ DB ───────────────────────────────────────
// วันนี้บรรทัดยังเป็น "วัสดุ" อย่างเดียว (MATERIAL_KINDS) · P1 จะขยายเป็นหลายรูปร่าง
// (วัสดุ · พัฒนากลิ่น · พัฒนาผลิตภัณฑ์ · เอกสาร) ผ่านคอลัมน์ lineKind
import { MATERIAL_KINDS, sourceDeptForMaterialKind } from '@/lib/materialPrices';

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
