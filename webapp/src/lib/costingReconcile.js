// ── เทียบใบขอราคาที่ส่งมากับของเดิมใน DB ────────────────────────────────
// ฟอร์มสร้างและฟอร์มแก้เป็น component เดียวกัน (กฎ AGENTS.md) จึงส่ง payload
// รูปเดียวกันทั้งสองทาง — ฝั่ง server เป็นคนคิดเองว่าอะไรเพิ่ม/แก้/ลบ
//
// หัวใจคือ "ห้ามทำงานของฝ่ายอื่นหาย": บรรทัดที่ RD/PC ตอบราคาแล้ว และชั้นจำนวน
// ที่ผู้บริหารอนุมัติราคาแล้ว เป็นหลักฐาน ลบทิ้งเงียบ ๆ ไม่ได้ — ต้องแจ้งกลับ
// ให้คนแก้รู้ตัวว่าจะทำอะไรหาย
import { normalizeCostTemplateLines } from '@/lib/master/costTemplate';

// สินค้าในใบ: จับคู่ด้วย id ที่ client ส่งกลับมา (แถวใหม่ไม่มี id)
export function planItemChanges(existingItems = [], payloadItems = []) {
  const byId = new Map(existingItems.map((item) => [item.id, item]));
  const keptIds = new Set();
  const created = [];
  const updated = [];

  for (let i = 0; i < payloadItems.length; i += 1) {
    const raw = payloadItems[i] || {};
    const sortOrder = i + 1;
    const current = raw.id ? byId.get(raw.id) : null;
    if (!current) {
      created.push({ raw, sortOrder });
      continue;
    }
    keptIds.add(current.id);
    // เปลี่ยนประเภทสินค้า = ต้องกางบรรทัดใหม่ทั้งชุด ซึ่งจะล้างราคาที่ตอบไว้แล้ว
    const categoryChanged = raw.categoryCode && raw.categoryCode !== current.categoryCode;
    updated.push({ current, raw, sortOrder, categoryChanged });
  }

  const removed = existingItems.filter((item) => !keptIds.has(item.id));
  return { created, updated, removed };
}

// บรรทัดที่ฝ่ายอื่นตอบราคาแล้ว = งานที่จะหายถ้าลบ/กางใหม่
export function quotedComponentCount(item) {
  return (item?.components || []).filter((c) => c.priceStatus === 'quoted').length;
}

// ชั้นจำนวนที่ผู้บริหารอนุมัติราคาแล้ว
export function pricedTierCount(item) {
  return (item?.tiers || []).filter((t) => t.approvedUnitPrice != null).length;
}

// ตรวจว่าการเปลี่ยนแปลงชุดนี้ทำให้งานที่ทำไปแล้วหายไหม — คืนข้อความไทยข้อแรก
// ที่พบ หรือ null ถ้าปลอดภัย
export function blockingChangeError({ removed = [], updated = [] }) {
  for (const item of removed) {
    const quoted = quotedComponentCount(item);
    if (quoted > 0) {
      return `ลบ "${item.productLabel}" ไม่ได้ — มีราคาที่ฝ่ายอื่นตอบแล้ว ${quoted} บรรทัด`;
    }
    if (pricedTierCount(item) > 0) {
      return `ลบ "${item.productLabel}" ไม่ได้ — มีราคาที่ผู้บริหารอนุมัติแล้ว`;
    }
  }
  for (const { current, categoryChanged } of updated) {
    if (!categoryChanged) continue;
    const quoted = quotedComponentCount(current);
    if (quoted > 0) {
      return `เปลี่ยนประเภทสินค้าของ "${current.productLabel}" ไม่ได้ — ต้องกางบรรทัดใหม่ ซึ่งจะทำให้ราคาที่ตอบแล้ว ${quoted} บรรทัดหายไป`;
    }
  }
  return null;
}

// ชั้นจำนวนของทั้งใบ: รับรายการ qty แล้วบอกว่าต้องเพิ่ม/ลบอะไรของ item หนึ่ง ๆ
// ชั้น MOQ ของใบต้องมีเสมอ ไม่งั้นอนุมัติแล้วไม่มีช่องกรอกราคา
export function planTierChanges(existingTiers = [], quantities = [], moq) {
  const wanted = [...new Set(
    [...quantities, moq].map(Number).filter((q) => Number.isFinite(q) && q > 0),
  )].sort((a, b) => a - b);

  const existingQtys = new Set(existingTiers.map((t) => Number(t.qty)));
  const toAdd = wanted.filter((q) => !existingQtys.has(q));
  const toRemove = existingTiers.filter((t) => !wanted.includes(Number(t.qty)));
  return { wanted, toAdd, toRemove };
}

export function blockingTierError(itemLabel, toRemove = []) {
  const priced = toRemove.filter((t) => t.approvedUnitPrice != null);
  if (priced.length) {
    const qtys = priced.map((t) => Number(t.qty).toLocaleString('th-TH')).join(', ');
    return `ลบชั้นจำนวน ${qtys} ของ "${itemLabel}" ไม่ได้ — ผู้บริหารอนุมัติราคาชั้นนั้นแล้ว`;
  }
  return null;
}

// ตรวจรูปแบบรายการสินค้าที่ส่งมา (ก่อนแตะ DB) — คืน { items, error }
export function normalizeCostingItems(payloadItems, { maxItems = 30 } = {}) {
  if (!Array.isArray(payloadItems) || payloadItems.length === 0) {
    return { items: [], error: 'ต้องระบุสินค้าอย่างน้อย 1 รายการ' };
  }
  if (payloadItems.length > maxItems) {
    return { items: [], error: `สินค้าในใบเดียวมากเกินไป (สูงสุด ${maxItems} รายการ)` };
  }
  const items = [];
  for (let i = 0; i < payloadItems.length; i += 1) {
    const raw = payloadItems[i] || {};
    const at = `รายการที่ ${i + 1}`;
    const productLabel = String(raw.productLabel ?? '').trim().replace(/\s+/g, ' ');
    if (!productLabel) return { items: [], error: `${at}: ต้องระบุชื่อสินค้า` };
    if (!/^\d{2}-\d{3}$/.test(String(raw.categoryCode || ''))) {
      return { items: [], error: `${at}: ต้องเลือกประเภทสินค้า` };
    }
    items.push({
      id: raw.id || null,
      categoryCode: String(raw.categoryCode),
      productLabel: productLabel.slice(0, 300),
      fragranceName: raw.fragranceName ? String(raw.fragranceName).trim().slice(0, 300) : null,
      productId: raw.productId || null,
    });
  }
  return { items, error: null };
}

// ชั้นจำนวนที่ผู้ใช้กรอก — ตัวเลขบวก ไม่ซ้ำ เรียงน้อยไปมาก
export function normalizeTierQuantities(input, { maxTiers = 8 } = {}) {
  const list = Array.isArray(input) ? input : [];
  const nums = [...new Set(
    list.map((q) => Number(String(q).replace(/,/g, ''))).filter((q) => Number.isFinite(q) && q > 0),
  )].sort((a, b) => a - b);
  if (nums.length > maxTiers) {
    return { quantities: [], error: `ชั้นจำนวนมากเกินไป (สูงสุด ${maxTiers} ชั้น)` };
  }
  return { quantities: nums, error: null };
}

// re-export ให้ route เรียกที่เดียว (บรรทัดแม่แบบใช้ตัวตรวจชุดเดียวกับหน้าตั้งค่า)
export { normalizeCostTemplateLines };
