// ── ตาราง "รายการชำระภาษีสรรพสามิต" ของ RA แบบตารางเดิม (มติเจ้าของ 03/11/2026 V20–V23 · แผนรื้อสรรพสามิต หมวด 12.13) ──
//
// เจ้าของส่งตารางที่ RA ใช้อยู่ (Google Sheet "รายการชำระภาษีสรรพสามิต M.10/69") ⇒ หน้า /tax/filings วาดแบบเดียวกัน:
//   V20 แถวละสินค้า จัดกลุ่มตาม SO (RA ยังยื่นทีละ SO) · ไม่มีคอลัมน์สถานะทะเบียน (ขาดทะเบียน = ยื่นไม่ได้ ⇒ บอกที่หัวกลุ่ม)
//   V21 วันที่ส่งของ = `deliveryDueDate` ของ SO ค่าสรรพสามิต (SA ใส่ตอนยื่น · `exciseDeliveryDate.js`) · ยังไม่มี = "—"
//       (เจ้าของ 04/11: เลิกโชว์ "PO มาวันที่" แบบตารางเดิม) · เป็นคอลัมน์บอกข้อมูล (เดือนดู V24 ข้างล่าง)
//   V23 มีเฉพาะงานที่ถึง RA แล้ว (คิว RA + บันทึกการยื่น) — SO ที่ SA ยังไม่ออกใบไม่อยู่ในตารางนี้
//   ~~แก้ 03/11 รอบสอง: เดือนของตาราง = เดือนที่ RA ยื่นทำจ่าย (V24)~~ ⇒ ⭐ **มติเจ้าของ 25/11/2026: "รายการชำระภาษีสรรพสามิต M.11/69
//      คือแบ่งตามเดือนที่ส่ง"** — เดือน = เดือนของวันที่ส่งของ (ทุกงาน รวมบันทึกที่ยื่นแล้ว) · ไม่มีวันที่ส่ง = กองท้าย "ยังไม่มีวันที่ส่ง"
//      · ⭐ **ยกเว้นสหมิตร (AR-109): โชว์ "วันที่เอกสาร PO" แทนวันที่ส่งของ** (`confirmDocDate` ของ SO ลูกค้าที่ชนิดเอกสารยืนยันเป็น PO)
//        และแบ่งเดือนด้วยวันนั้น · ตัวเลือกบนจอ "เดือนที่ส่ง" · ช่วง "จาก–ถึง" ใช้วันเดียวกับคอลัมน์
//      **งานกำลังมาดึงรายการจากใบเสนอราคาค่าสรรพสามิตที่อนุมัติแล้ว** (V25 — ใบมีรายการ ปริมาตร ราคา จำนวนอยู่แล้ว)
// ⭐ กลุ่ม = แถวงานเดิมของหน้า (คีย์เดียวกับ `queueWorkRow` / `recordWorkRow`) ⇒ หน้าเติมรายการลงแถวด้วยคีย์ ไม่มีตัวนับสองชุด
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { fetchInChunks } from '@/lib/supabaseInChunks';
import { lineUnitsTotal } from '@/lib/sales/linePacks';
import { productBrandName, productDisplayNameFor } from '@/lib/master/productIdentity';
import { ORDER_SELECT } from '@/lib/tax/orders';
import { loadFilingSource, loadRaFilingQueue } from '@/lib/excise/raFiling';
import { EXCISE_RATE, LOCAL_TAX_RATE_OF_EXCISE, productTaxRates } from '@/lib/tax/exciseBilling';
import { exciseBasePriceIncVat, hasOwnTaxBase } from '@/lib/excise/giftSetExcise';
import { SAHAMIT_AR_CODE } from '@/lib/sahamit/customer';
/* กติกาวันที่/เดือนของงาน (สหมิตร = วันที่ PO) อยู่ไฟล์บริสุทธิ์ — ทะเบียน SO แท็บสรรพสามิตใช้ตัวเดียวกัน (มติ 25/11) */
import { filingDeliveryDate, filingDeliveryMonth, isSahamitFilingOrder, salesOrderPoDocDate } from '@/lib/excise/raFilingMonth';

export { filingDeliveryDate, filingDeliveryMonth, isSahamitFilingOrder, salesOrderPoDocDate };

const VAT_RATE = 0.07;
const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

/** ปริมาณแบบตารางเดิม — "50 ML" · ไม่มีปริมาณ = '' */
export function volumeText(product) {
  const volume = Number(product?.volume);
  if (!(volume > 0)) return '';
  return `${volume} ${String(product?.volumeUnit || 'ml').toUpperCase()}`;
}

/** ราคาขายปลีกก่อน VAT ต่อหน่วย — ช่องก่อน VAT ก่อน · มีแต่ราคารวม VAT = ถอด 7% · ไม่มี = null
 *  `frozenIncVat` = ราคารวม VAT ที่ใบเสนอราคาค่าสรรพสามิตตรึงไว้ตอนคิดภาษี (ชนะราคาปัจจุบันของสินค้า — ตรงกับภาษีบนใบ) */
export function retailPriceExVat(product, { frozenIncVat = null } = {}) {
  const frozen = Number(frozenIncVat);
  if (frozen > 0) return round2(frozen / (1 + VAT_RATE));
  /* ชุดของขวัญแจ้งรายชิ้น / ยังไม่เลือก (mig 0430/0431): ช่องก่อน VAT ของสินค้าเป็นราคาทั้งชุด ไม่ใช่ฐานภาษี ⇒ ถอดจากฐานภาษีแทน */
  if (!hasOwnTaxBase(product)) {
    const exVat = Number(product?.retailPriceExVat);
    if (exVat > 0) return round2(exVat);
  }
  const incVat = exciseBasePriceIncVat(product);
  return incVat ? round2(incVat / (1 + VAT_RATE)) : null;
}

/** ราคาขายปลีกรวม VAT ต่อหน่วย — ราคาที่ใบตรึงไว้ก่อน · ไม่มี = ฐานภาษีของสินค้า · ไม่มีเลย = null */
function retailPriceIncVat(product, frozenIncVat) {
  const frozen = Number(frozenIncVat);
  if (frozen > 0) return round2(frozen);
  // ฐานภาษีของสินค้า — ชุดของขวัญแจ้งรายชิ้น = ราคาน้ำหอมในชุด (ภาษี/หน่วยบนแถวคิดจากตัวนี้ ⇒ รีเช็คตรงกัน)
  const incVat = exciseBasePriceIncVat(product);
  return incVat ? round2(incVat) : null;
}

/* สูตรก่อนมติ 26/11/2026 (Q2 28/10): ราคาถอด VAT เต็มความละเอียด × 8.8% แล้วปัดครั้งเดียว — ใช้**รีเช็คใบเก่าเท่านั้น**
   ใบที่คิดก่อนวันนั้นตรึงภาษี/ชิ้นตามสูตรนี้ (= เงินที่ลูกค้าจ่ายจริง · เจ้าของเลือก "ใช้กับใบใหม่เท่านั้น")
   ⇒ ห้ามฟ้อง "ไม่ตรงสูตร" กับใบพวกนั้น ไม่งั้นราวหนึ่งในสามของบรรทัดเก่าแดงทั้งที่ถูกตามกติกาของวันที่ออกใบ */
const legacyTaxPerUnit = (retailIncVat) =>
  round2((Number(retailIncVat) / (1 + VAT_RATE)) * EXCISE_RATE * (1 + LOCAL_TAX_RATE_OF_EXCISE));

/**
 * รีเช็คภาษีต่อหน่วยกับสูตร (เจ้าของ 03/11: "แทรกราคาขายปลีกมาด้วย เพื่อรีเช็คว่าค่าภาษีคำนวณถูก")
 * สูตรเดียวกับทะเบียนสินค้า (`productTaxRates`): ถอด VAT → สรรพสามิต 8% → ท้องถิ่น 10% ของสรรพสามิต ปัดทีละขั้น (มติ 26/11 · V43)
 * ⚠️ ตรงสูตรเดิม (ก่อน 26/11) ก็นับว่าตรง — `legacy: true` บอกว่าเป็นเลขของสูตรเดิม (ใบเก่า)
 * @returns `{ expected, ok, legacy }` · ไม่มีราคาขายปลีก/ไม่มีภาษีต่อหน่วย = null (เทียบไม่ได้)
 */
export function taxPerUnitCheck(retailIncVat, taxPerUnit) {
  const unit = Number(taxPerUnit);
  if (!(Number(retailIncVat) > 0) || !Number.isFinite(unit)) return null;
  const expected = productTaxRates(retailIncVat).taxPerUnit;
  const same = (value) => Math.abs(value - round2(unit)) < 0.005;
  if (same(expected)) return { expected, ok: true, legacy: false };
  const legacy = same(legacyTaxPerUnit(retailIncVat));
  return { expected, ok: legacy, legacy };
}

/** แถวสินค้าหนึ่งแถวของตาราง — แบรนด์/ชื่อ **อังกฤษก่อน** แบบตารางเดิมของ RA (เจ้าของดูจอจริง 03/11: "Scent Studio" ไม่ใช่ "เซนท์ สตูดิโอ")
 *  ไม่มีชื่ออังกฤษ = ชื่อไทย (`productDisplayNameFor` ไม่แปลเอง)
 *  `taxPerUnit` = ภาษีรวม/หน่วยที่ใบคิดไว้ (สรรพสามิต + ท้องถิ่น) · ไม่ส่ง = ถอดจากภาษีรวม ÷ จำนวน */
export function filingTableLine(product, { quantity = 0, totalTax = 0, fgCode = '', description = '', retailPriceIncVat: frozenIncVat = null, taxPerUnit = null } = {}) {
  const qty = Number(quantity) || 0;
  const unitTax = Number.isFinite(Number(taxPerUnit)) && taxPerUnit !== null
    ? round2(taxPerUnit)
    : (qty > 0 ? round2((Number(totalTax) || 0) / qty) : null);
  const retailInc = retailPriceIncVat(product, frozenIncVat);
  return {
    fgCode: product?.fgCode || fgCode || '',
    brand: (product && productBrandName(product)) || '',
    description: (product && productDisplayNameFor(product, 'en')) || description || fgCode || '',
    volume: volumeText(product),
    quantity: qty,
    retailPriceIncVat: retailInc,
    retailPriceExVat: retailPriceExVat(product, { frozenIncVat }),
    taxPerUnit: unitTax,
    taxCheck: taxPerUnitCheck(retailInc, unitTax),
    totalTax: round2(totalTax || 0),
  };
}

/** แถวสินค้าจากบรรทัดใบเสนอราคาค่าสรรพสามิต (V25) — สินค้าต้นทาง + จำนวน (หน่วยจริง) + ภาษีก่อน VAT + ราคาที่ใบตรึงไว้ */
export function quoteLineTableLine(line, product) {
  const meta = line?.metadata || {};
  return filingTableLine(product || null, {
    quantity: lineUnitsTotal(line),
    totalTax: Number(line?.lineTotal) || 0,
    fgCode: meta.sourceFgCode || '',
    description: meta.descriptionEn || meta.descriptionTh || line?.description || '',
    retailPriceIncVat: meta.retailPriceIncVat ?? null,
    taxPerUnit: Number(line?.unitPrice) > 0 ? Number(line.unitPrice) : null,
  });
}

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
 * รายการของทุกงาน RA — `[{ key, deliveryDate, deliveryDateKind, month, lines, blockers }]` (คีย์เดียวกับแถวงานของหน้า)
 * · คิวที่พร้อม (SO ค่าสรรพสามิต / ไม่เรียกเก็บ) = ข้อมูลสดจาก SO ตัวโหลดเดียวกับตอนเริ่มยื่น (`loadFilingSource`)
 * · กำลังมา = ยังไม่มี SO ค่าสรรพสามิต ⇒ ไม่มีรายการ (หัวกลุ่มบอกขั้น) · บันทึก = รายการที่ตรึงในบันทึก
 * อ่านพลาด = throw · งานที่โหลดรายการไม่ได้ (เช่น SO ถูกย้อนอนุมัติระหว่างทาง) = กลุ่มพร้อมข้อความ ไม่ล้มทั้งตาราง
 */
export async function loadRaFilingTable(supabase, { loadQueue = loadRaFilingQueue, loadSource = loadFilingSource } = {}) {
  const [queue, recordResult, sahamitResult] = await Promise.all([
    loadQueue(supabase, { upcoming: true }),
    fetchAllResult(() => supabase.from('orders').select(ORDER_SELECT).order('id', { ascending: true })),
    /* รหัสลูกค้าสหมิตร (AR-109) — วันที่ของสหมิตรเป็นวันที่เอกสาร PO (มติ 25/11) */
    supabase.from('customers').select('id').eq('arCode', SAHAMIT_AR_CODE).limit(1),
  ]);
  raise('โหลดบันทึกการยื่นไม่สำเร็จ', recordResult.error);
  raise('โหลดลูกค้าสหมิตรไม่สำเร็จ', sahamitResult.error);
  const sahamitCustomerId = sahamitResult.data?.[0]?.id || null;
  const records = recordResult.data || [];

  const groups = [];
  const productIds = new Set();
  for (const row of queue || []) {
    if (!row.ready) {
      groups.push({ key: row.key, salesOrderId: row.salesOrder?.id || null, quoteId: row.exciseQuote?.id || null, viaExcise: true, blockers: [] });
      continue;
    }
    const loaded = await loadSource(supabase, row.exciseOrder?.id
      ? { exciseSalesOrderId: row.exciseOrder.id }
      : { salesOrderId: row.salesOrder?.id });
    if (loaded.error) {
      groups.push({ key: row.key, salesOrderId: row.salesOrder?.id || null, exciseOrder: null, viaExcise: Boolean(row.exciseOrder?.id), lines: [], blockers: [loaded.error.message] });
      continue;
    }
    const resolvedLines = loaded.resolved?.lines || [];
    resolvedLines.forEach((line) => line.productId && productIds.add(line.productId));
    groups.push({
      key: row.key,
      salesOrder: loaded.salesOrder,
      exciseOrder: loaded.exciseOrder || null,
      viaExcise: Boolean(row.exciseOrder?.id),
      resolvedLines,
      blockers: filingTableBlockers(resolvedLines),
    });
  }
  for (const order of records) {
    groups.push({
      key: `order:${order.id}`,
      record: order,
      salesOrderId: order.salesOrderId || null,
      exciseOrderId: order.exciseSalesOrderId || null,
      viaExcise: Boolean(order.exciseSalesOrderId),
      items: order.items || [],
      blockers: [],
    });
  }

  /* V25: งานกำลังมา = บรรทัดของใบเสนอราคาค่าสรรพสามิต (ใบอนุมัติแล้ว · ยังไม่มี SO ค่าสรรพสามิต) */
  const quoteIds = [...new Set(groups.map((group) => group.quoteId).filter(Boolean))];
  const { data: quoteLines, error: quoteLineError } = await fetchInChunks(quoteIds, (chunk) => fetchAllResult(() => supabase
    .from('quotation_lines')
    .select('id, "quotationId", qty, "packQty", "unitPrice", "lineTotal", description, metadata, "sortOrder"')
    .in('quotationId', chunk)
    .order('quotationId', { ascending: true })
    .order('sortOrder', { ascending: true })
    .order('id', { ascending: true })));
  raise('โหลดรายการใบเสนอราคาค่าสรรพสามิตไม่สำเร็จ', quoteLineError);
  const linesByQuote = new Map();
  for (const line of quoteLines || []) {
    if (line.metadata?.lineKind && line.metadata.lineKind !== 'excise_charge') continue;
    linesByQuote.set(line.quotationId, [...(linesByQuote.get(line.quotationId) || []), line]);
    if (line.metadata?.sourceProductId) productIds.add(line.metadata.sourceProductId);
  }

  /* วันของ SO ที่กลุ่มยังไม่มีแถวเต็ม (กำลังมา · บันทึก) — ชุดเดียวทีละก้อน */
  const orderIds = [...new Set(groups.flatMap((group) => [group.salesOrderId, group.exciseOrderId]).filter(Boolean))];
  const [dateResult, productResult] = await Promise.all([
    fetchInChunks(orderIds, (chunk) => fetchAllResult(() => supabase.from('sales_orders')
      .select('id, "deliveryDueDate", "customerId", "confirmDocType", "confirmDocDate"').in('id', chunk).order('id', { ascending: true }))),
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
    const deliveryDate = filingDeliveryDate({ exciseOrder, salesOrder, viaExcise: group.viaExcise, sahamitCustomerId });
    let lines;
    if (group.items) {
      lines = group.items.map((item) => filingTableLine(item.product || null, {
        quantity: item.quantity,
        totalTax: item.totalTax,
        taxPerUnit: round2((Number(item.exciseRatePerUnit) || 0) + (Number(item.localTaxRatePerUnit) || 0)) || null,
      }));
    }
    else if (group.quoteId) lines = (linesByQuote.get(group.quoteId) || []).map((line) => quoteLineTableLine(line, productById.get(line.metadata?.sourceProductId)));
    else lines = (group.resolvedLines || []).map((line) => filingTableLine(productById.get(line.productId) || null, line));
    return {
      key: group.key,
      deliveryDate,
      /* 'po' = วันในคอลัมน์คือวันที่เอกสาร PO ของสหมิตร (จอเขียนนำว่า "PO") · 'delivery' = วันที่ส่งของ */
      deliveryDateKind: isSahamitFilingOrder(salesOrder, sahamitCustomerId) ? 'po' : 'delivery',
      month: filingDeliveryMonth(deliveryDate),
      lines,
      blockers: group.blockers,
    };
  });
}
