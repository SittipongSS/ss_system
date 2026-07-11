// helper บรรทัดใบเสนอราคา (เฟส D) — ใช้ร่วมระหว่าง route สร้าง (deals/[id]/quotations)
// และ route แก้ไข (quotations/[id]): normalize บรรทัดจาก client + seed จาก FG ของโครงการ.
import { genId } from '@/lib/id';
import { quoteLineNet, toMoney } from '@/lib/salesPlanning';

export function productLabel(product) {
  return product?.productDescription || product?.productDescriptionEn || product?.fgCode || 'สินค้า';
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
    .select('*, product:products(id, fgCode, productDescription, productDescriptionEn, retailPriceIncVat)')
    .eq('projectId', deal.projectId);
  return (data || []).map((row, index) => {
    const qty = qtyFromProjectProduct(row);
    const unitPrice = toMoney(row.product?.retailPriceIncVat);
    return {
      id: genId('QTL'),
      productId: row.productId || row.product?.id || null,
      fgCode: row.product?.fgCode || null,
      description: productLabel(row.product),
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
