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
export async function seedLinesFromProject(supabase, deal) {
  if (!deal.projectId) return [];
  const { data } = await supabase
    .from('project_products')
    .select('*, product:products(id, fgCode, productDescription, productDescriptionEn, brandName, brandNameEn, volume, volumeUnit, retailPriceIncVat)')
    .eq('projectId', deal.projectId);
  return (data || []).map((row, index) => {
    const qty = qtyFromProjectProduct(row);
    const unitPrice = toMoney(row.product?.retailPriceIncVat);
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

// ราคา FG มาจากฐานข้อมูลสินค้าเท่านั้น (มติผู้ใช้ 2026-07-15): บรรทัดที่มี productId
// ถูกทับราคาด้วย retailPriceIncVat ปัจจุบันเสมอ — client แก้ราคาเองไม่ได้ ต้องแก้ที่
// ฐานข้อมูลสินค้า. สินค้าที่หายจาก master (ถูกลบ) → คงราคาเดิมที่บันทึกไว้ในใบ
// (fallback ต่อ productId จาก previousLines) เพื่อไม่ให้ยอดเอกสารเดิมพัง.
export async function enforceMasterPrices(supabase, lines = [], previousLines = []) {
  const ids = [...new Set(lines.filter((l) => l.productId).map((l) => l.productId))];
  if (!ids.length) return lines;
  const { data, error } = await supabase
    .from('products')
    .select('id, retailPriceIncVat')
    .in('id', ids);
  if (error) throw error;
  const priceById = new Map((data || []).map((p) => [p.id, toMoney(p.retailPriceIncVat)]));
  const prevById = new Map(
    previousLines.filter((l) => l?.productId).map((l) => [l.productId, toMoney(l.unitPrice)]),
  );
  return lines.map((line) => {
    if (!line.productId) return line;
    const master = priceById.get(line.productId);
    const unitPrice = master !== undefined ? master : (prevById.get(line.productId) ?? line.unitPrice);
    if (unitPrice === line.unitPrice) return line;
    const net = quoteLineNet({ qty: line.qty, unitPrice, discountType: line.discountType, discountValue: line.discountValue });
    return { ...line, unitPrice, discountAmount: net.discountAmount, lineTotal: net.lineTotal };
  });
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
