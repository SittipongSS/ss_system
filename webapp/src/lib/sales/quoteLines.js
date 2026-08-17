// helper บรรทัดใบเสนอราคา (เฟส D) — ใช้ร่วมระหว่าง route สร้าง (deals/[id]/quotations)
// และ route แก้ไข (quotations/[id]): normalize บรรทัดจาก client + seed จาก FG ของโครงการ.
import { genId } from '@/lib/id';
import { normalizeDiscountValue, quoteLineNet, toMoney } from '@/lib/salesPlanning';
import { DEFAULT_SALE_UNIT, saleUnitOf } from '@/lib/master/units';
import {
  productBrandName,
  productDisplayName,
  productVolumeLabel,
} from '@/lib/master/productIdentity';

export function productLabel(product) {
  return productDisplayName(product) || product?.fgCode || 'สินค้า';
}

// คำอธิบายหลักเก็บเฉพาะ "ชื่อสินค้า · ปริมาตร"; รหัสและแบรนด์อยู่ใน metadata
// เพื่อให้หน้าจอ/เอกสารจัดลำดับชั้นเป็น รหัส · แบรนด์ / ชื่อสินค้า · ปริมาตร.
export function fgLineDescription(product) {
  return [productDisplayName(product), productVolumeLabel(product)]
    .filter(Boolean)
    .join(' · ') || productLabel(product);
}

export function fgLineBrand(product) {
  return productBrandName(product);
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
    .select('*, product:products(id, fgCode, productDescription, productDescriptionEn, brandName, brandNameEn, volume, volumeUnit, saleUnit, costPrice)')
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
      unit: row.product?.saleUnit || DEFAULT_SALE_UNIT,
      unitPrice,
      discountType: null,
      discountValue: 0,
      discountAmount: 0,
      lineTotal: qty * unitPrice,
      source: 'project_products',
      sortOrder: index,
      metadata: {
        projectProductId: row.id,
        productBrand: fgLineBrand(row.product),
      },
    };
  });
}

// ราคาขายในใบเสนอราคาทั้งระบบ = "ราคาผลิต" (costPrice) — มติผู้ใช้ 2026-07-19.
// retailPriceIncVat ไม่ใช่ราคาขาย: มีไว้คำนวณภาษีสรรพสามิต (โมดูล tax) เท่านั้น.
export const QUOTE_PRICE_FIELD = 'costPrice';

// สถานะราคาผลิตของสินค้า **เท่าที่ฝั่ง client รู้** — ใช้ตัดสินว่าจะเตือน
// "ยังไม่ตั้งราคาในฐานข้อมูล" บนบรรทัดใบเสนอราคาหรือไม่.
//
// ลิสต์สินค้าที่หน้าจอโหลด (`GET /api/products`) ไม่ใช่ตาราง products ทั้งตาราง:
// - ผ่านด่านอนุมัติ — เห็นเฉพาะ approved + isActive
// - บางบทบาทถูกตัดคอลัมน์ costPrice ทิ้ง (redactProductMargin)
// **แก้ข้อมูลสินค้าที่อนุมัติแล้วแม้แต่ครั้งเดียว สถานะจะรีเซ็ตเป็น pending**
// (resetApprovalOnEdit) สินค้าจึงหลุดจากลิสต์ทันทีทั้งที่ราคายังอยู่ครบ — เคยทำให้
// ใบเสนอราคาที่บันทึกแล้วขึ้นเตือน "ยังไม่ตั้งราคา" ทั้งที่ราคาถูกต้อง.
// จึงแยก 'unknown' (ไม่มีข้อมูลให้ตัดสิน — เงียบไว้) ออกจาก 'unpriced' (รู้แน่ว่า 0/ว่าง).
// ราคาในใบไม่ได้พึ่งค่านี้: ตอนบันทึก enforceMasterPrices อ่านตรงจากตาราง products
// (ไม่ผ่านด่านอนุมัติ) ราคาจึงไม่หายไม่ว่าสถานะอนุมัติจะเป็นอะไร.
export function masterPriceState(product) {
  if (!product || product[QUOTE_PRICE_FIELD] === undefined) return 'unknown';
  return toMoney(product[QUOTE_PRICE_FIELD]) > 0 ? 'priced' : 'unpriced';
}

// ── FG ต้องเป็นของลูกค้าที่ออกใบให้ (มติผู้ใช้ 2026-08-17) ──────────────────────
//
// FG ผูกกับลูกค้าเสมอ (`products.customerId` — POST /api/products บังคับ) แต่ตัวเลือก
// ในใบเสนอราคาเคยดึง `/api/products` ทั้งทะเบียน ⇒ หยิบ FG ของลูกค้ารายอื่นมาใส่ได้
// เงียบ ๆ. กรองดรอปดาวน์อย่างเดียวไม่พอ — ยิง API ตรงก็ยังใส่ได้ จึงต้องมีด่านที่นี่
//
// ⚠️ **ตรวจเฉพาะบรรทัดที่เพิ่ง (เพิ่ม/เปลี่ยน) สินค้า** ไม่ใช่ทุกบรรทัด: ใบเก่าที่มี
// บรรทัดข้ามลูกค้าค้างอยู่แล้ว ถ้าโดนด่านย้อนหลังจะกลายเป็นใบที่ **บันทึกไม่ได้เลย**
// แม้จะมาแก้หมายเหตุเฉย ๆ — ข้อมูลที่เสียไปแล้วต้องแก้ที่ทะเบียนสินค้า ไม่ใช่ล็อกใบทิ้ง
//
// เคสที่ตัดสินไม่ได้ = ปล่อยผ่าน (ไม่ใช่ปฏิเสธ): ใบไม่มีลูกค้า · บรรทัดพิมพ์เอง
// (ไม่มี productId) · สินค้าหายจาก master · สินค้าทะเบียนเก่าที่ `customerId` ว่าง
export async function customerMismatchedLines(supabase, lines = [], {
  customerId,
  previousLines = [],
} = {}) {
  if (!customerId) return [];
  const known = new Set(previousLines.filter((l) => l?.productId).map((l) => l.productId));
  const ids = [...new Set(
    lines.filter((l) => l?.productId && !known.has(l.productId)).map((l) => l.productId),
  )];
  if (!ids.length) return [];
  const { data, error } = await supabase
    .from('products')
    .select('id, fgCode, customerId, customerName, productDescription')
    .in('id', ids);
  if (error) throw error;
  return (data || [])
    .filter((product) => product.customerId && product.customerId !== customerId)
    .map((product) => ({
      productId: product.id,
      fgCode: product.fgCode || null,
      name: product.productDescription || product.fgCode || product.id,
      ownerName: product.customerName || null,
    }));
}

// ข้อความบอกผู้ใช้ว่าบรรทัดไหนผิดและทำไม — ใช้ร่วมทุก route ที่บันทึกบรรทัดใบเสนอราคา
export function customerMismatchMessage(mismatched = []) {
  const detail = mismatched
    .map((row) => `${row.fgCode || row.name}${row.ownerName ? ` (ของ ${row.ownerName})` : ''}`)
    .join(', ');
  return `สินค้าที่เลือกไม่ใช่ของลูกค้ารายนี้: ${detail} — FG ผูกกับลูกค้าเจ้าของสินค้า `
    + 'เลือกได้เฉพาะ FG ของลูกค้าที่ออกใบให้ (ถ้าเป็นสินค้าของลูกค้ารายนี้จริง '
    + 'ให้แก้เจ้าของสินค้าที่ฐานข้อมูลสินค้าก่อน)';
}

// ข้อมูลบรรทัด FG มาจากฐานข้อมูลสินค้าเท่านั้น (มติผู้ใช้ 2026-07-15): บรรทัดที่มี
// productId ถูกทับทั้ง "ราคา" (ราคาผลิต — QUOTE_PRICE_FIELD) และ "คำอธิบาย"
// (ชื่อสินค้า · ปริมาตร) + snapshot แบรนด์ + รหัส FG ด้วยค่าปัจจุบันจาก master เสมอ —
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
    .select('id, fgCode, productDescription, productDescriptionEn, brandName, brandNameEn, volume, volumeUnit, saleUnit, costPrice')
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
    const productBrand = master
      ? fgLineBrand(master)
      : (prev?.metadata?.productBrand ?? line.metadata?.productBrand ?? '');
    const metadata = { ...(line.metadata || {}), productBrand };
    // หน่วยผูก master เช่นกัน (มติ 2026-07-23) — freeze จากสินค้าตอนบันทึก; สินค้าถูกลบ = คงเดิม
    const unit = master ? (master.saleUnit || DEFAULT_SALE_UNIT) : (prev?.unit ?? line.unit ?? DEFAULT_SALE_UNIT);
    if (
      unitPrice === line.unitPrice
      && description === line.description
      && fgCode === line.fgCode
      && unit === line.unit
      && productBrand === (line.metadata?.productBrand || '')
    ) return line;
    const net = quoteLineNet({ qty: line.qty, unitPrice, discountType: line.discountType, discountValue: line.discountValue });
    return {
      ...line,
      unitPrice,
      description,
      fgCode,
      unit,
      metadata,
      discountAmount: net.discountAmount,
      lineTotal: net.lineTotal,
    };
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
    .select('id, fgCode, productDescription, productDescriptionEn, brandName, brandNameEn, volume, volumeUnit, saleUnit')
    .in('id', ids);
  if (error) return quotes; // เสริมการแสดงผลเท่านั้น — อย่าให้ GET ล้มเพราะ join นี้
  const byId = new Map((data || []).map((p) => [p.id, p]));
  for (const q of targets) {
    q.lines = q.lines.map((l) => {
      const p = l?.productId ? byId.get(l.productId) : null;
      return p ? {
        ...l,
        description: fgLineDescription(p),
        fgCode: p.fgCode || l.fgCode,
        unit: p.saleUnit || l.unit || DEFAULT_SALE_UNIT,
        metadata: { ...(l.metadata || {}), productBrand: fgLineBrand(p) },
      } : l;
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
      const discountValue = normalizeDiscountValue(discountType, line.discountValue);
      const net = quoteLineNet({ qty, unitPrice, discountType, discountValue });
      return {
        id: genId('QTL'),
        productId: line.productId || null,
        fgCode: line.fgCode || null,
        description: line.description || line.fgCode || `รายการ ${index + 1}`,
        qty,
        // บรรทัดที่พิมพ์เองเลือกหน่วยเองได้ (บรรทัดที่ผูกสินค้าถูก enforceMasterPrices ทับ
        // ด้วย master.saleUnit ทีหลังอยู่แล้ว) — clamp กันค่ายาวผิดปกติจาก client ไปดัน
        // คอลัมน์หน่วยบนเอกสาร A4 เสียรูป
        unit: saleUnitOf(line.unit),
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
