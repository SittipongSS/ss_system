// ── ตาราง "รายการชำระภาษีสรรพสามิต" ของ RA แบบตารางเดิม (มติเจ้าของ 03/11/2026 V20–V23 · แผนรื้อสรรพสามิต หมวด 12.13) ──
//
// เจ้าของส่งตารางที่ RA ใช้อยู่ (Google Sheet "รายการชำระภาษีสรรพสามิต M.10/69") ⇒ หน้า /tax/filings วาดแบบเดียวกัน:
//   V20 แถวละสินค้า จัดกลุ่มตาม SO (RA ยังยื่นทีละ SO) · ไม่มีคอลัมน์สถานะทะเบียน (ขาดทะเบียน = ยื่นไม่ได้ ⇒ บอกที่หัวกลุ่ม)
//   V21 วันที่ส่งของ = `deliveryDueDate` ของ SO ค่าสรรพสามิต (SA ใส่ตอนยื่น · `exciseDeliveryDate.js`) → ของ SO ต้นทาง →
//       ไม่มีทั้งคู่ = "PO มาวันที่" (วันที่ของ SO ต้นทาง) แบบตารางเดิม · เดือนของตาราง = เดือนของวันนี้
//   V23 มีเฉพาะงานที่ถึง RA แล้ว (คิว RA + บันทึกการยื่น) — SO ที่ SA ยังไม่ออกใบไม่อยู่ในตารางนี้
// ⭐ กลุ่ม = แถวงานเดิมของหน้า (คีย์เดียวกับ `queueWorkRow` / `recordWorkRow`) ⇒ หน้าเติมรายการลงแถวด้วยคีย์ ไม่มีตัวนับสองชุด
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { fetchInChunks } from '@/lib/supabaseInChunks';
import { productDisplayName } from '@/lib/master/productIdentity';
import { ORDER_SELECT } from '@/lib/tax/orders';
import { loadFilingSource, loadRaFilingQueue } from '@/lib/excise/raFiling';

const VAT_RATE = 0.07;
const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

/** ปริมาณแบบตารางเดิม — "50 ML" · ไม่มีปริมาณ = '' */
export function volumeText(product) {
  const volume = Number(product?.volume);
  if (!(volume > 0)) return '';
  return `${volume} ${String(product?.volumeUnit || 'ml').toUpperCase()}`;
}

/** ราคาขายปลีกก่อน VAT ต่อหน่วย — ช่องก่อน VAT ก่อน · มีแต่ราคารวม VAT = ถอด 7% · ไม่มี = null */
export function retailPriceExVat(product) {
  const exVat = Number(product?.retailPriceExVat);
  if (exVat > 0) return round2(exVat);
  const incVat = Number(product?.retailPriceIncVat);
  return incVat > 0 ? round2(incVat / (1 + VAT_RATE)) : null;
}

/** แถวสินค้าหนึ่งแถวของตาราง */
export function filingTableLine(product, { quantity = 0, totalTax = 0, fgCode = '', description = '' } = {}) {
  return {
    fgCode: product?.fgCode || fgCode || '',
    brand: product?.brandName || product?.brandNameEn || '',
    description: (product && productDisplayName(product)) || description || fgCode || '',
    volume: volumeText(product),
    quantity: Number(quantity) || 0,
    retailPriceExVat: retailPriceExVat(product),
    totalTax: round2(totalTax || 0),
  };
}

/**
 * วันที่ส่งของของกลุ่ม — `{ date, kind }` · kind 'delivery' = วันที่ส่งของจริง/ที่ตกลง · 'po' = ยังไม่มี ใช้วันที่ของ SO ต้นทาง
 * (ตารางเดิมเขียน "PO มาวันที่ …") · ไม่มีอะไรเลย = `{ date: null, kind: null }`
 */
export function filingDeliveryDate({ exciseOrder = null, salesOrder = null } = {}) {
  const delivery = exciseOrder?.deliveryDueDate || salesOrder?.deliveryDueDate || null;
  if (delivery) return { date: delivery, kind: 'delivery' };
  if (salesOrder?.orderDate) return { date: String(salesOrder.orderDate).slice(0, 10), kind: 'po' };
  return { date: null, kind: null };
}

/** คีย์เดือน 'YYYY-MM' ของกลุ่ม (null = ไม่มีวัน) — ตัวกรองเดือนบนหน้าใช้ตัวนี้ */
export const filingMonthKey = (dateInfo) => (dateInfo?.date ? String(dateInfo.date).slice(0, 7) : null);

/** ด่านที่หัวกลุ่มบอก (แทนคอลัมน์สถานะทะเบียน · V20) — จากบรรทัดของ resolveSoFiling */
export function filingTableBlockers(resolvedLines = []) {
  const blockers = [];
  const missingRegistration = resolvedLines.filter((line) => line.needsRegistration).length;
  const missingBase = resolvedLines.filter((line) => line.taxBaseMissing).length;
  if (missingRegistration) blockers.push(`ยังไม่มีทะเบียน ${missingRegistration} รายการ — เริ่มยื่นไม่ได้`);
  if (missingBase) blockers.push(`ไม่มีราคาขายปลีก ${missingBase} รายการ (ภาษี ฿0)`);
  return blockers;
}

const raise = (label, error) => {
  if (error) throw new Error(`${label}: ${error.message || error}`);
};

/**
 * รายการของทุกงาน RA — `[{ key, deliveryDate, deliveryKind, month, lines, blockers }]` (คีย์เดียวกับแถวงานของหน้า)
 * · คิวที่พร้อม (SO ค่าสรรพสามิต / ไม่เรียกเก็บ) = ข้อมูลสดจาก SO ตัวโหลดเดียวกับตอนเริ่มยื่น (`loadFilingSource`)
 * · กำลังมา = ยังไม่มี SO ค่าสรรพสามิต ⇒ ไม่มีรายการ (หัวกลุ่มบอกขั้น) · บันทึก = รายการที่ตรึงในบันทึก
 * อ่านพลาด = throw · งานที่โหลดรายการไม่ได้ (เช่น SO ถูกย้อนอนุมัติระหว่างทาง) = กลุ่มพร้อมข้อความ ไม่ล้มทั้งตาราง
 */
export async function loadRaFilingTable(supabase, { loadQueue = loadRaFilingQueue, loadSource = loadFilingSource } = {}) {
  const [queue, recordResult] = await Promise.all([
    loadQueue(supabase, { upcoming: true }),
    fetchAllResult(() => supabase.from('orders').select(ORDER_SELECT).order('id', { ascending: true })),
  ]);
  raise('โหลดบันทึกการยื่นไม่สำเร็จ', recordResult.error);
  const records = recordResult.data || [];

  const groups = [];
  const productIds = new Set();
  for (const row of queue || []) {
    if (!row.ready) {
      groups.push({ key: row.key, salesOrderId: row.salesOrder?.id || null, exciseOrder: null, lines: [], blockers: [] });
      continue;
    }
    const loaded = await loadSource(supabase, row.exciseOrder?.id
      ? { exciseSalesOrderId: row.exciseOrder.id }
      : { salesOrderId: row.salesOrder?.id });
    if (loaded.error) {
      groups.push({ key: row.key, salesOrderId: row.salesOrder?.id || null, exciseOrder: null, lines: [], blockers: [loaded.error.message] });
      continue;
    }
    const resolvedLines = loaded.resolved?.lines || [];
    resolvedLines.forEach((line) => line.productId && productIds.add(line.productId));
    groups.push({
      key: row.key,
      salesOrder: loaded.salesOrder,
      exciseOrder: loaded.exciseOrder || null,
      resolvedLines,
      blockers: filingTableBlockers(resolvedLines),
    });
  }
  for (const order of records) {
    groups.push({
      key: `order:${order.id}`,
      salesOrderId: order.salesOrderId || null,
      exciseOrderId: order.exciseSalesOrderId || null,
      items: order.items || [],
      blockers: [],
    });
  }

  /* วันของ SO ที่กลุ่มยังไม่มีแถวเต็ม (กำลังมา · บันทึก) — ชุดเดียวทีละก้อน */
  const orderIds = [...new Set(groups.flatMap((group) => [group.salesOrderId, group.exciseOrderId]).filter(Boolean))];
  const [dateResult, productResult] = await Promise.all([
    fetchInChunks(orderIds, (chunk) => fetchAllResult(() => supabase.from('sales_orders')
      .select('id, "deliveryDueDate", "orderDate"').in('id', chunk).order('id', { ascending: true }))),
    fetchInChunks([...productIds], (chunk) => fetchAllResult(() => supabase.from('products')
      .select('*').in('id', chunk).order('id', { ascending: true }))),
  ]);
  raise('โหลดวันที่ของใบสั่งขายไม่สำเร็จ', dateResult.error);
  raise('โหลดสินค้าไม่สำเร็จ', productResult.error);
  const datesById = new Map((dateResult.data || []).map((row) => [row.id, row]));
  const productById = new Map((productResult.data || []).map((row) => [row.id, row]));

  return groups.map((group) => {
    const salesOrder = group.salesOrder || datesById.get(group.salesOrderId) || null;
    const exciseOrder = group.exciseOrder || (group.exciseOrderId ? datesById.get(group.exciseOrderId) || null : null);
    const dateInfo = filingDeliveryDate({ exciseOrder, salesOrder });
    const lines = group.items
      ? group.items.map((item) => filingTableLine(item.product || null, { quantity: item.quantity, totalTax: item.totalTax }))
      : (group.resolvedLines || []).map((line) => filingTableLine(productById.get(line.productId) || null, line));
    return {
      key: group.key,
      deliveryDate: dateInfo.date,
      deliveryKind: dateInfo.kind,
      month: filingMonthKey(dateInfo),
      lines,
      blockers: group.blockers,
    };
  });
}
