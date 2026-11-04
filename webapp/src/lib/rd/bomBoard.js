// ── คิว "ลง BOM" ของ RD (/rd/bom) — หนึ่งแถวคือ FG หนึ่งตัวที่ฝ่ายขายส่งมา (mig 0419 · มติเจ้าของ 03/11/2026) ──
//
// ⭐ หน่วยของหน้านี้คือ **สินค้า** — สถานะอยู่บนแถวสินค้า (`bomStatus`) ไม่ใช่ใบคำร้อง
// ⚠️ **ป้ายตัวเลขบนเมนูนับด้วยกติกาเดียวกัน** (`BOM_TODO_STATUSES`) — นับคนละชุดเมื่อไร ป้ายกับหน้าพูดไม่ตรงกัน
// ⚠️ ไฟล์นี้ไม่แตะ DB และไม่รู้ว่า "วันนี้" คือวันไหน — ผู้เรียกส่งวันไทยมา (กติกาเดียวกับ priceBoard)
import { BOM_STATUS_META, bomStatusOf } from '@/lib/master/productBom';
import { isGiftSetCategory } from '@/lib/master/giftSetFormulas';
import { isFragranceOilCategory } from '@/lib/master/fragranceOilScent';

/* งานที่ RD ยังต้องลงมือ = รอรับเรื่อง + กำลังลง — ตีกลับรอฝ่ายขาย · เสร็จแล้วเป็นประวัติ */
export const BOM_TODO_STATUSES = Object.freeze(['queued', 'in_progress']);

/* แท็บของหน้า — ลำดับเดียวกับทางเดินงาน · `done` อยู่ท้าย (ประวัติ) */
export const BOM_BOARD_TABS = Object.freeze([
  { key: 'queued', label: 'รอรับเรื่อง' },
  { key: 'in_progress', label: 'กำลังลง' },
  { key: 'returned', label: 'ตีกลับ รอฝ่ายขาย' },
  { key: 'done', label: 'ลงเสร็จแล้ว' },
]);

/* คอลัมน์ที่ route อ่านจาก `products` — ไม่เอาราคาผลิต (RD ไม่มีสิทธิ์เห็น · redactProductMargin) */
export const BOM_BOARD_PRODUCT_COLUMNS = [
  'id', '"fgCode"', '"productDescription"', '"productDescriptionEn"', '"customerId"', '"customerName"', '"brandName"', '"brandNameEn"',
  '"categoryCode"', '"formulaId"', '"formulaCode"', '"formulaName"', '"scentId"',
  'volume', '"volumeUnit"', '"saleUnit"', '"approvalStatus"', '"isActive"',
  '"bomStatus"', '"bomRound"', '"bomSentAt"', '"bomSentByName"', '"bomAcceptedAt"', '"bomAcceptedByName"',
  '"bomReturnedAt"', '"bomReturnedByName"', '"bomReturnReason"', '"bomDoneAt"', '"bomDoneByName"',
  '"bomCode"', '"bomNote"', '"bomUpdatedAt"',
].join(', ');

const dayOf = (iso) => (iso ? String(iso).slice(0, 10) : null);

/** วันที่รอมาแล้ว นับจากวันที่ส่ง (วันไทยของผู้เรียก) — `null` เมื่อไม่รู้ · รับทั้งแถวของคิว (`sentAt`) และแถวสินค้าดิบ (`bomSentAt`) */
export function bomWaitingDays(row, todayIso) {
  const sent = dayOf(row?.sentAt ?? row?.bomSentAt);
  if (!sent || !todayIso) return null;
  const diff = Math.round((Date.parse(`${todayIso}T00:00:00Z`) - Date.parse(`${sent}T00:00:00Z`)) / 86400000);
  return Number.isFinite(diff) ? Math.max(0, diff) : null;
}

/**
 * สูตร/กลิ่นที่ RD ต้องเห็นตอนลง BOM — ตามหมวด (ตัวเดียวกับที่ด่านส่งใช้นับ)
 * ⭐ รหัส/ชื่อสูตรอ่าน **สดจากทะเบียนสูตร** (`formulasById`) — `products.formulaCode/Name` เป็นสำเนาตอนบันทึก FG
 *    RD แก้ชื่อ/ออกรหัสทีหลังแล้วสำเนาไม่ตาม (กติกาเดียวกับใบสเปค FM-SA-04 · ไฟล์ส่งออกทะเบียนสินค้า) · หาไม่เจอ = ใช้สำเนา
 * ⭐ `tradeName` = ชื่อที่ลูกค้าเรียก **ของกลิ่นเท่านั้น** (มติเจ้าของ 04/11 · ย้อนไป ม-12 "ลูกค้าตั้งชื่อกลิ่นเอง") —
 *    ชื่อที่ลูกค้าเรียกระดับสูตรคือ **ชื่อสินค้า** ของ FG (ช่องสินค้าโชว์อยู่แล้ว) ไม่ใช่ช่องของทะเบียนสูตร
 * @returns {{ kind: 'formula'|'scent'|'set'|'none', items: Array<{ code: string|null, name: string|null, note?: string|null, tradeName?: string|null }> }}
 */
export function bomFormulaView(product, { scentsById = new Map(), formulasById = new Map(), giftSetRows = [] } = {}) {
  const code = String(product?.categoryCode || '');
  if (isGiftSetCategory(code)) {
    return {
      kind: 'set',
      items: (giftSetRows || []).map((row) => ({
        code: row.formulaCode || null, name: row.formulaName || null, note: row.categoryName || null, tradeName: row.scentTradeName || null,
      })),
    };
  }
  if (isFragranceOilCategory(code)) {
    const scent = product?.scentId ? scentsById.get(product.scentId) : null;
    return scent
      ? { kind: 'scent', items: [{ code: scent.code || null, name: scent.name || null, tradeName: scent.customerTradeName || null }] }
      : { kind: 'none', items: [] };
  }
  if (product?.formulaId) {
    const live = formulasById.get(product.formulaId) || null;
    const scent = product.scentId ? scentsById.get(product.scentId) : null;
    return {
      kind: 'formula',
      items: [{
        code: (live ? live.code : product.formulaCode) || null,
        name: (live ? live.name : product.formulaName) || null,
        note: scent?.name ? `กลิ่น ${scent.name}` : null,
        tradeName: scent?.customerTradeName || null,
      }],
    };
  }
  return { kind: 'none', items: [] };
}

/**
 * แถวของตาราง — สินค้า + ลูกค้า (AR · ไทย/อังกฤษ อ่านสดจากทะเบียน) + สูตร/กลิ่น
 * @param products แถวสินค้าที่ `bomStatus` ไม่ว่าง
 * @param customersById Map(id → { arCode, name, nameEn })
 */
export function bomBoardRows(products = [], { customersById = new Map(), scentsById = new Map(), formulasById = new Map(), giftSetsByProduct = new Map() } = {}) {
  return (products || [])
    .filter((p) => bomStatusOf(p))
    .map((p) => {
      const customer = customersById.get(p.customerId) || null;
      return {
        id: p.id,
        fgCode: String(p.fgCode || '').trim() || null,
        nameTh: p.productDescription || null,
        nameEn: p.productDescriptionEn || null,
        categoryCode: p.categoryCode || null,
        customerId: p.customerId || null,
        customerArCode: customer?.arCode || null,
        // ชื่อไทยจากทะเบียนก่อน (ชื่อที่ประทับบนสินค้าเป็นสำรอง — ลูกค้าเปลี่ยนชื่อได้)
        customerNameTh: customer?.name || p.customerName || null,
        customerNameEn: customer?.nameEn || null,
        // เลขผู้เสียภาษี + สาขา (นิติบุคคลเดียวกันมีหลาย AR ได้ — แยกด้วยเลขนี้) · แบรนด์ของ FG (มติเจ้าของ 03/11)
        customerTaxId: customer?.taxId || null,
        customerBranchCode: customer?.branchCode || null,
        brandName: p.brandName || null,
        brandNameEn: p.brandNameEn || null,
        formula: bomFormulaView(p, { scentsById, formulasById, giftSetRows: giftSetsByProduct.get(p.id) || [] }),
        volume: p.volume ?? null,
        volumeUnit: p.volumeUnit || null,
        saleUnit: p.saleUnit || null,
        approvalStatus: p.approvalStatus || null,
        status: bomStatusOf(p),
        round: Number(p.bomRound) || 0,
        sentAt: p.bomSentAt || null,
        sentByName: p.bomSentByName || null,
        acceptedAt: p.bomAcceptedAt || null,
        acceptedByName: p.bomAcceptedByName || null,
        returnedAt: p.bomReturnedAt || null,
        returnedByName: p.bomReturnedByName || null,
        returnReason: p.bomReturnReason || null,
        doneAt: p.bomDoneAt || null,
        doneByName: p.bomDoneByName || null,
        bomCode: p.bomCode || null,
        bomNote: p.bomNote || null,
        updatedAt: p.bomUpdatedAt || null,
      };
    });
}

/* เรียงในแต่ละแท็บ — งานค้าง: ส่งก่อนขึ้นก่อน (รอนานสุดบนสุด) · ตีกลับ/เสร็จ: ล่าสุดขึ้นก่อน */
const byOldestSent = (a, b) => String(a.sentAt || '').localeCompare(String(b.sentAt || '')) || String(a.id).localeCompare(String(b.id));
const byLatestMove = (a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')) || String(a.id).localeCompare(String(b.id));

/** แถวของแท็บหนึ่ง เรียงแล้ว */
export function bomTabRows(rows = [], tab) {
  const list = (rows || []).filter((row) => row.status === tab);
  return list.sort(BOM_TODO_STATUSES.includes(tab) ? byOldestSent : byLatestMove);
}

/** ยอดบนแถบตัวเลข + ป้ายแท็บ */
export function bomBoardTotals(rows = [], { todayIso = null } = {}) {
  const count = Object.fromEntries(BOM_BOARD_TABS.map((t) => [t.key, 0]));
  let maxDays = null;
  for (const row of rows || []) {
    if (count[row.status] != null) count[row.status] += 1;
    if (BOM_TODO_STATUSES.includes(row.status)) {
      const d = bomWaitingDays(row, todayIso);
      if (d != null) maxDays = maxDays == null ? d : Math.max(maxDays, d);
    }
  }
  return { ...count, todo: count.queued + count.in_progress, maxDays };
}

export const bomStatusLabel = (status) => BOM_STATUS_META[status || 'none']?.label || '';
