// helper บรรทัดใบเสนอราคา (เฟส D) — ใช้ร่วมระหว่าง route สร้าง (deals/[id]/quotations)
// และ route แก้ไข (quotations/[id]): normalize บรรทัดจาก client + seed จาก FG ของโครงการ.
import { genId } from '@/lib/id';
import { quoteLineNet, toMoney } from '@/lib/salesPlanning';

export function productLabel(product) {
  return product?.productDescription || product?.productDescriptionEn || product?.fgCode || 'สินค้า';
}

// คำอธิบายบรรทัด FG มาตรฐานเดียวทั้งระบบ (มติผู้ใช้ 2026-07-15): แบรนด์ · ชื่อสินค้า ·
// ปริมาตร — ส่วน "รหัส" แสดงแยกเป็นป้าย FG นำหน้าทั้งในโปรแกรมและเอกสารพิมพ์
// (ไม่ฝังรหัสใน description กันซ้ำซ้อน). ใช้ตอน seed จากโครงการ + ตอนเลือกสินค้าใน editor.
export function fgLineDescription(product) {
  const brand = product?.brandName || product?.brandNameEn || '';
  const name = product?.productDescription || product?.productDescriptionEn || '';
  const volume = product?.volume ? `${product.volume} ${product.volumeUnit || 'ml'}` : '';
  return [brand, name, volume].filter(Boolean).join(' · ') || productLabel(product);
}

function qtyFromProjectProduct(row) {
  const raw = row?.orderQty || row?.productionQty || 1;
  const n = Number(String(raw).replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : 1;
}

// seed บรรทัดจาก FG ที่ผูกในโครงการของดีล — ราคา freeze จาก master ณ ตอนสร้าง
// (ราคาผลิต — กติกาเดียวกับ enforceMasterPrices)
export async function seedLinesFromProject(supabase, deal) {
  if (!deal.projectId) return [];
  const { data } = await supabase
    .from('project_products')
    .select('*, product:products(id, fgCode, productDescription, productDescriptionEn, brandName, brandNameEn, volume, volumeUnit, costPrice)')
    .eq('projectId', deal.projectId);
  return (data || []).map((row, index) => {
    const qty = qtyFromProjectProduct(row);
    const unitPrice = toMoney(row.product?.[QUOTE_PRICE_FIELD]);
    return {
      id: genId('QTL'),
      productId: row.productId || row.product?.id || null,
      fgCode: row.product?.fgCode || null,
      description: fgLineDescription(row.product),
      qty,
      unitPrice,
      discountType: null,
      discountValue: 0,
      discountAmount: 0,
      lineTotal: qty * unitPrice,
      source: 'project_products',
      sortOrder: index,
      metadata: { projectProductId: row.id },
    };
  });
}

// ราคาขายในใบเสนอราคาทั้งระบบ = "ราคาผลิต" (costPrice) — มติผู้ใช้ 2026-07-19.
// retailPriceIncVat ไม่ใช่ราคาขาย: มีไว้คำนวณภาษีสรรพสามิต (โมดูล tax) เท่านั้น.
export const QUOTE_PRICE_FIELD = 'costPrice';

// ข้อมูลบรรทัด FG มาจากฐานข้อมูลสินค้าเท่านั้น (มติผู้ใช้ 2026-07-15): บรรทัดที่มี
// productId ถูกทับทั้ง "ราคา" (ราคาผลิต — QUOTE_PRICE_FIELD) และ "คำอธิบาย"
// (แบรนด์ · ชื่อสินค้า · ปริมาตร) + รหัส FG ด้วยค่าปัจจุบันจาก master เสมอ —
// **ห้ามกำหนดราคาจากใบเสนอราคาทุกกรณี** flow คือไปตั้งราคาที่ฐานข้อมูลสินค้าแล้วกลับมาบันทึกใบ.
// - master ยังไม่ตั้งราคา (0/ว่าง) = ไม่มีข้อมูล ไม่ใช่ราคา 0 → คงราคาที่บันทึกไว้เดิม
//   ในใบ (previousLines); บรรทัดใหม่ = 0 จนกว่าจะตั้งราคาใน master (ส่ง/Won มี guard
//   ยอด > 0 กันอยู่แล้ว) — ค่าที่ client ส่งมาไม่ถูกใช้เด็ดขาด
// - สินค้าหายจาก master (ถูกลบ) → คงราคา/คำอธิบายเดิมที่บันทึกไว้ในใบ
export async function enforceMasterPrices(supabase, lines = [], previousLines = []) {
  const ids = [...new Set(lines.filter((l) => l.productId).map((l) => l.productId))];
  if (!ids.length) return lines;
  const { data, error } = await supabase
    .from('products')
    .select('id, fgCode, productDescription, productDescriptionEn, brandName, brandNameEn, volume, volumeUnit, costPrice')
    .in('id', ids);
  if (error) throw error;
  const productById = new Map((data || []).map((p) => [p.id, p]));
  const prevById = new Map(
    previousLines.filter((l) => l?.productId).map((l) => [l.productId, l]),
  );
  return lines.map((line) => {
    if (!line.productId) return line;
    const master = productById.get(line.productId);
    const prev = prevById.get(line.productId);
    const masterPrice = master ? toMoney(master[QUOTE_PRICE_FIELD]) : 0;
    const unitPrice = masterPrice > 0
      ? masterPrice
      : toMoney(prev?.unitPrice ?? (master ? 0 : line.unitPrice));
    const description = master ? fgLineDescription(master) : (prev?.description || line.description);
    const fgCode = master ? (master.fgCode || null) : (prev?.fgCode ?? line.fgCode);
    if (unitPrice === line.unitPrice && description === line.description && fgCode === line.fgCode) return line;
    const net = quoteLineNet({ qty: line.qty, unitPrice, discountType: line.discountType, discountValue: line.discountValue });
    return { ...line, unitPrice, description, fgCode, discountAmount: net.discountAmount, lineTotal: net.lineTotal };
  });
}

// เติมคำอธิบาย/รหัสสดจาก master ให้บรรทัด FG เพื่อการแสดงผล+พิมพ์ (ไม่บันทึกลง DB) —
// ใช้เฉพาะใบสถานะที่ยังแก้ได้ (draft/sent/rejected); ใบ final (accepted/closed/revised/
// cancelled) คงข้อมูล ณ วันปิดไว้เป็นหลักฐาน. ราคาไม่เติมที่นี่ (ราคาผูกกับยอดรวม —
// ให้ enforceMasterPrices จัดการตอนบันทึกเท่านั้น ไม่งั้นราคาโชว์ไม่ตรงยอดหัวใบ).
export async function refreshFgLinesForDisplay(supabase, quotes = []) {
  const editable = new Set(['draft', 'sent', 'rejected']);
  const targets = quotes.filter((q) => q && editable.has(q.status) && Array.isArray(q.lines));
  const ids = [...new Set(targets.flatMap((q) => q.lines.filter((l) => l?.productId).map((l) => l.productId)))];
  if (!ids.length) return quotes;
  const { data, error } = await supabase
    .from('products')
    .select('id, fgCode, productDescription, productDescriptionEn, brandName, brandNameEn, volume, volumeUnit')
    .in('id', ids);
  if (error) return quotes; // เสริมการแสดงผลเท่านั้น — อย่าให้ GET ล้มเพราะ join นี้
  const byId = new Map((data || []).map((p) => [p.id, p]));
  for (const q of targets) {
    q.lines = q.lines.map((l) => {
      const p = l?.productId ? byId.get(l.productId) : null;
      return p ? { ...l, description: fgLineDescription(p), fgCode: p.fgCode || l.fgCode } : l;
    });
  }
  return quotes;
}

// normalize บรรทัดจาก client (สร้าง/แก้): คิดส่วนลดรายบรรทัด + ยอดสุทธิที่ server เสมอ
export function normalizeManualLines(lines = []) {
  return lines
    .map((line, index) => {
      // เว้นว่าง/ไม่ระบุ → default 1; ระบุ 0 มาจริง → 0 (ให้ filter qty>0 ตัดออก ไม่ใช่ดันเป็น 1)
      const qty = line.qty === '' || line.qty == null ? 1 : toMoney(line.qty, 0);
      const unitPrice = toMoney(line.unitPrice);
      const discountType = ['percent', 'amount'].includes(line.discountType) ? line.discountType : null;
      const discountValue = discountType ? toMoney(line.discountValue) : 0;
      const net = quoteLineNet({ qty, unitPrice, discountType, discountValue });
      return {
        id: genId('QTL'),
        productId: line.productId || null,
        fgCode: line.fgCode || null,
        description: line.description || line.fgCode || `รายการ ${index + 1}`,
        qty,
        unitPrice,
        discountType,
        discountValue,
        discountAmount: net.discountAmount,
        lineTotal: net.lineTotal,
        source: line.source === 'project_products' ? 'project_products' : 'manual',
        sortOrder: index,
        metadata: line.metadata || {},
      };
    })
    .filter((line) => line.description && line.qty > 0);
}
