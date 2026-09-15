// ── ตัวตัดสินเดียวของการคีย์ใบสั่งขายย้อนหลัง — พรีวิวกับบันทึกจริงเรียกตัวนี้ตัวเดียว ─────
//
// 🐞 บทเรียน #1685: พรีวิวนำเข้าเคยบอก "จะสร้าง 145" แล้วสร้างได้ 0 เพราะพรีวิวกับตัวเขียนตัดสินคนละที่
//    ⇒ ไฟล์นี้บริสุทธิ์ (ไม่อ่านฐาน ไม่มีเวลาเครื่อง) รับของที่ server โหลดมาแล้วทาง `ctx`
//    แล้วคืนแผนก้อนเดียวที่ทั้งพรีวิวโชว์และ commit ส่งเข้า RPC (historicalRpcPayload)
// ⚠️ RPC `create_historical_sales_order` (0360) ตรวจซ้ำทุกข้อที่ตรวจในฐานได้ — ที่นี่มีไว้ให้ผู้คีย์ได้
//    ข้อความไทยรายช่องก่อนกดบันทึก ไม่ใช่ด่านเดียว
// ⭐ AE บังคับ (คำตอบข้อ 1): `ctx.owner` = ผลของ validateDealOwner (AE/Senior AE ที่ยังใช้งานอยู่)
//    · ทีมของดีลภาชนะ = ทีมตาม AE ที่เลือก
// ⭐ งวด = เฉพาะยอดที่ยังต้องเก็บ (คำตอบข้อ 2) · งวดที่เลยกำหนดแล้วเตือน ไม่ห้าม
import { isQuotableCustomer } from '@/lib/sales/dealCustomerAdopt';
import { customerSnapshotName } from '@/lib/master/customerName';
import { categoryOf } from '@/lib/master/categoryOf';
import { DEFAULT_SALE_UNIT } from '@/lib/master/units';
import {
  DOC_DATE_MAX, DOC_DATE_MIN, HISTORICAL_DEAL_TITLE, HISTORICAL_REF_MAX, INSTALLATION_POINT_MAX,
  INSTALLMENT_LABEL_MAX, ZERO_VALUE_EXEMPT_REASON, charLength, exemptReasonError, historicalRefsOf,
} from '@/lib/sales/historicalOrders';

/* หมวดแพ็คเกจบริการ — !! ต้องเท่ากับ SERVICE_ROUND_CATEGORY ใน lib/sales/serviceOrders.js (เทสต์เทียบ)
   ไม่ import ตรง ๆ เพราะไฟล์นั้นลาก lib/service/intake มาด้วย */
export const SERVICE_PACKAGE_CATEGORY = '02-001';
export const HISTORICAL_VAT_RATES = Object.freeze([0, 7]);

const text = (value) => (value === null || value === undefined ? '' : String(value)).trim();
const has = (obj, key) => Boolean(obj) && Object.prototype.hasOwnProperty.call(obj, key);
const toNumber = (value) => (value === null || value === undefined || value === '' ? Number.NaN : Number(value));
const toSatang = (value) => Math.round(Number(value) * 100);
const fromSatang = (satang) => satang / 100;
const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

/* วันในปฏิทิน YYYY-MM-DD ที่มีจริง — ⚠️ ไม่ตัดสตริงจาก toISOString (ด่าน check:thaitime) */
export function isCalendarDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ''));
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
const inDocRange = (value) => isCalendarDate(value) && value >= DOC_DATE_MIN && value <= DOC_DATE_MAX;

/**
 * ตรวจงวดที่คีย์ (ใช้ทั้งตอนคีย์ใบและตอนคีย์งวดเพิ่ม) — ตรงกับ `historical_so_installments_total` ของ 0360
 * @param rows      งวดจากผู้คีย์
 * @param total     ยอดใบ (รวม VAT) — ส่ง null เพื่อข้ามด่าน "ผลรวมเกินยอดใบ" (RPC ตรวจกับงวดเดิมเอง)
 * @param todayIso  วันนี้ตามเวลาไทย — ใช้เตือนงวดที่เลยกำหนดแล้ว
 * @returns {{ installments, errors, warnings, sum }}
 */
export function validateHistoricalInstallments(rows, { total = null, todayIso = null } = {}) {
  const errors = [];
  const warnings = [];
  const installments = [];
  if (rows !== undefined && rows !== null && !Array.isArray(rows)) {
    return { installments, errors: [{ field: 'installments', message: 'รูปแบบงวดชำระไม่ถูกต้อง' }], warnings, sum: 0 };
  }
  let sumSatang = 0;
  (rows || []).forEach((row, index) => {
    const n = index + 1;
    const field = `installments.${index}`;
    const push = (message) => errors.push({ field, message: `งวดที่ ${n}: ${message}` });
    if (!row || typeof row !== 'object' || Array.isArray(row)) { push('รูปแบบไม่ถูกต้อง'); return; }
    if (has(row, 'status') && text(row.status) !== 'pending') {
      push('งวดที่คีย์ต้องเป็น "รอบัญชียืนยัน" เท่านั้น — งวดที่เก็บเงินนอกระบบแล้วไม่ต้องคีย์ ใช้สวิตช์ยกเว้นด่านเงินแทน');
    }
    const label = text(row.label);
    if (charLength(label) < 1 || charLength(label) > INSTALLMENT_LABEL_MAX) {
      push(`ชื่องวดต้องมี 1–${INSTALLMENT_LABEL_MAX} ตัวอักษร`);
    }
    const amount = toNumber(row.amount);
    if (!Number.isFinite(amount) || amount < 0) push('ยอดต้องเป็นตัวเลขไม่ติดลบ');
    const dates = {};
    for (const [key, name] of [['dueDate', 'กำหนดชำระ'], ['coversFrom', 'วันเริ่มช่วงครอบ'], ['coversTo', 'วันสิ้นสุดช่วงครอบ']]) {
      const value = text(row[key]);
      dates[key] = value || null;
      if (value && !inDocRange(value)) push(`${name}ต้องเป็นวันที่ระหว่างปี ค.ศ. 2000–2100`);
    }
    if (dates.coversFrom && dates.coversTo && dates.coversFrom > dates.coversTo) {
      push('วันเริ่มช่วงครอบต้องไม่เกินวันสิ้นสุด');
    }
    if (todayIso && dates.dueDate && isCalendarDate(dates.dueDate) && dates.dueDate < todayIso) {
      warnings.push(`งวดที่ ${n} (${label || '—'}) จะขึ้นเลยกำหนดในทะเบียนบัญชีทันที — งวดที่เก็บเงินนอกระบบแล้วไม่ต้องคีย์ ใช้สวิตช์ยกเว้นด่านเงินแทน`);
    }
    if (Number.isFinite(amount) && amount >= 0) sumSatang += toSatang(amount);
    installments.push({
      label,
      amount: Number.isFinite(amount) ? round2(amount) : amount,
      dueDate: dates.dueDate,
      coversFrom: dates.coversFrom,
      coversTo: dates.coversTo,
    });
  });
  if (total !== null && total !== undefined && Number.isFinite(Number(total))) {
    const totalSatang = toSatang(total);
    // RPC ยอมคลาดเคลื่อน 0.01 บาท — ตรงกันที่นี่
    if (sumSatang > totalSatang + 1) {
      errors.push({ field: 'installments', message: `ยอดงวดรวม ${fromSatang(sumSatang)} บาท เกินยอดใบ ${fromSatang(totalSatang)} บาท` });
    }
    for (const row of installments) {
      row.percent = totalSatang > 0 && Number.isFinite(row.amount)
        ? Math.min(100, round2((toSatang(row.amount) / totalSatang) * 100))
        : 0;
    }
  }
  return { installments, errors, warnings, sum: fromSatang(sumSatang) };
}

/* แบ่งยอดตาม VAT (ชีตเป็นยอดรวม VAT — brief §1) ด้วยสตางค์ล้วน ไม่มีเศษทศนิยมลอย
   ยอดรวม VAT: subtotal = ปัด(total × 100 / (100+r)) · เศษของบรรทัดโยนให้บรรทัดยอดสูงสุด ⇒ Σ บรรทัด = subtotal เป๊ะ */
export function splitHistoricalAmounts(grossList, { amountsIncludeVat = true, vatRate = 7 } = {}) {
  const gross = grossList.map(toSatang);
  let lines;
  let subtotal;
  let vat;
  let total;
  if (!vatRate) {
    lines = gross.slice();
    subtotal = gross.reduce((s, v) => s + v, 0);
    vat = 0;
    total = subtotal;
  } else if (amountsIncludeVat) {
    total = gross.reduce((s, v) => s + v, 0);
    subtotal = Math.round((total * 100) / (100 + vatRate));
    vat = total - subtotal;
    lines = gross.map((g) => Math.round((g * 100) / (100 + vatRate)));
    const diff = subtotal - lines.reduce((s, v) => s + v, 0);
    if (diff && lines.length) {
      let largest = 0;
      gross.forEach((g, i) => { if (g > gross[largest]) largest = i; });
      lines[largest] += diff;
    }
  } else {
    lines = gross.slice();
    subtotal = gross.reduce((s, v) => s + v, 0);
    vat = Math.round((subtotal * vatRate) / 100);
    total = subtotal + vat;
  }
  return {
    lineTotals: lines.map(fromSatang),
    subtotal: fromSatang(subtotal),
    vatAmount: fromSatang(vat),
    totalAmount: fromSatang(total),
  };
}

const normRef = (value) => text(value).toLowerCase();

/**
 * @param input  body ของ POST /api/sales-planning/sales-orders/historical (สัญญา API ใน docs)
 * @param ctx    `{ customer, owner, products, containerDeals, existingHistorical, todayIso, replayOrderId }`
 *   - owner: ผลของ validateDealOwner (`{ ok, ownerId, ownerName, team } | { ok:false, error }`)
 *   - containerDeals: ดีลภาชนะทั้งหมดของลูกค้ารายนี้ · existingHistorical: ใบย้อนหลังทั้งหมดของลูกค้ารายนี้
 *   - replayOrderId: id ที่ RPC จะออกให้รหัสการคีย์นี้ — ใบนั้นไม่นับเป็น "ซ้ำ" (ส่งซ้ำหลังเน็ตหลุดต้องได้ใบเดิม)
 * @returns {{ header, lines, installments, deal, exemption, duplicates, warnings, errors }}
 */
export function planHistoricalOrder(input = {}, ctx = {}) {
  const body = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const {
    customer = null, owner = null, products = [], containerDeals = [], existingHistorical = [],
    todayIso = null, replayOrderId = null,
  } = ctx || {};
  const errors = [];
  const warnings = [];
  const err = (field, message) => errors.push({ field, message });

  // ── ขอบเขต P1 ─────────────────────────────────────────────────────────
  if (body.running === false) {
    err('running', 'รอบนี้คีย์ได้เฉพาะงานบริการที่ยังเดินอยู่ — งานที่จบแล้วยังไม่รับเข้าระบบ (มติข้อ 9)');
  }

  // ── ลูกค้า ───────────────────────────────────────────────────────────
  const customerId = text(body.customerId);
  if (!customerId) err('customerId', 'ต้องเลือกลูกค้า');
  else if (!customer?.id) err('customerId', 'ไม่พบลูกค้า');
  else if (!isQuotableCustomer(customer)) err('customerId', 'ลูกค้ารายนี้ยังไม่อนุมัติหรือถูกพักใช้ — ออกใบไม่ได้');
  const customerName = customer?.id ? customerSnapshotName(customer) : null;

  // ── AE (คำตอบข้อ 1: บังคับ) ───────────────────────────────────────────
  const ownerId = text(body.ownerId);
  let ownerName = null;
  let team = null;
  if (!ownerId) {
    err('ownerId', 'ต้องเลือก AE ผู้รับผิดชอบ — ใบย้อนหลังต้องมี AE ที่ยังถือดีลได้เสมอ (แถวที่ชีตไม่ระบุ AE ให้เลือกเอง)');
  } else if (!owner) {
    err('ownerId', 'ตรวจ AE ผู้รับผิดชอบไม่สำเร็จ — ลองใหม่อีกครั้ง');
  } else if (!owner.ok) {
    err('ownerId', owner.error || 'AE ที่เลือกถือดีลไม่ได้');
  } else {
    ownerName = owner.ownerName || null;
    team = text(owner.team) || null;
  }

  // ── หัวใบ ────────────────────────────────────────────────────────────
  const orderDate = text(body.orderDate);
  if (!isCalendarDate(orderDate) || orderDate < DOC_DATE_MIN || (todayIso && orderDate > todayIso)) {
    err('orderDate', 'วันที่ใบ (วันเริ่มสัญญาจริง) ต้องอยู่ระหว่าง 01/01/2000 ถึงวันนี้');
  }
  const docLanguage = body.docLanguage === 'en' ? 'en' : 'th';
  const amountsIncludeVat = body.amountsIncludeVat !== false;
  const vatRate = body.vatRate === undefined || body.vatRate === null || body.vatRate === '' ? 7 : Number(body.vatRate);
  if (!HISTORICAL_VAT_RATES.includes(vatRate)) err('vatRate', 'อัตรา VAT ต้องเป็น 0 หรือ 7');

  const rawRefs = body.refs && typeof body.refs === 'object' ? body.refs : {};
  const refs = { quote: text(rawRefs.quote) || null, express: text(rawRefs.express) || null, invoice: text(rawRefs.invoice) || null };
  for (const [key, label] of [['quote', 'ใบเสนอราคาเดิม'], ['express', 'เลขเอกสาร Express'], ['invoice', 'ใบกำกับเดิม']]) {
    if (refs[key] && charLength(refs[key]) > HISTORICAL_REF_MAX) {
      err(`refs.${key}`, `${label}ยาวเกิน ${HISTORICAL_REF_MAX} ตัวอักษร`);
    }
  }
  const notes = text(body.notes) || null;

  // ── บรรทัด = จุดติดตั้ง (ข้อ 8 · ข้อ 17) ─────────────────────────────────
  const productsById = new Map((products || []).map((p) => [p.id, p]));
  const rawLines = Array.isArray(body.lines) ? body.lines : [];
  if (!rawLines.length) err('lines', 'ต้องมีอย่างน้อย 1 จุดติดตั้ง');
  const draftLines = [];
  let linesMoneyOk = true;
  rawLines.forEach((line, index) => {
    const n = index + 1;
    const field = `lines.${index}`;
    const push = (message) => err(field, `บรรทัดที่ ${n}: ${message}`);
    if (!line || typeof line !== 'object' || Array.isArray(line)) { push('รูปแบบไม่ถูกต้อง'); linesMoneyOk = false; return; }
    const installationPoint = text(line.installationPoint);
    if (!installationPoint) push('ต้องระบุชื่อสาขา/จุดติดตั้งตามชีต');
    else if (charLength(installationPoint) > INSTALLATION_POINT_MAX) push(`ชื่อสาขา/จุดติดตั้งยาวเกิน ${INSTALLATION_POINT_MAX} ตัวอักษร`);
    if (has(line, 'zoneId')) push('ฝ่ายขายไม่ระบุโซน — TS ผูกโซนจริงในคิวงานเข้าใหม่ (มติข้อ 17)');
    const qty = toNumber(line.qty);
    if (!Number.isFinite(qty) || qty <= 0) { push('จำนวนต้องมากกว่า 0'); linesMoneyOk = false; }
    const lineAmount = toNumber(line.lineAmount);
    if (!Number.isFinite(lineAmount) || lineAmount < 0) { push('ยอดต้องเป็นตัวเลขไม่ติดลบ'); linesMoneyOk = false; }
    let serviceRounds = null;
    if (text(line.serviceRounds)) {
      const rounds = Number(line.serviceRounds);
      if (!Number.isInteger(rounds) || rounds <= 0) push('จำนวนรอบบริการต้องเป็นจำนวนเต็มมากกว่า 0');
      else serviceRounds = rounds;
    }
    const productId = text(line.productId) || null;
    const product = productId ? productsById.get(productId) || null : null;
    if (productId && !product) push('ไม่พบสินค้าที่เลือก');
    if (!productId) {
      warnings.push(`บรรทัดที่ ${n} (${installationPoint || '—'}) ไม่ได้เลือกสินค้า — จุดนี้จะไม่มีรหัส FG ให้ TS เห็น`);
    } else if (product && categoryOf(product.fgCode) !== SERVICE_PACKAGE_CATEGORY) {
      warnings.push(`บรรทัดที่ ${n}: ${product.fgCode || 'สินค้านี้'} ไม่ใช่แพ็คเกจบริการ (หมวด ${SERVICE_PACKAGE_CATEGORY}) — จุดนี้จะไม่นับเป็นรอบบริการ`);
    }
    const productDescription = docLanguage === 'en'
      ? text(product?.productDescriptionEn) || text(product?.productDescription)
      : text(product?.productDescription);
    draftLines.push({
      installationPoint,
      productId,
      fgCode: product?.fgCode || null,
      description: text(line.description) || productDescription || null,
      unit: text(product?.saleUnit) || DEFAULT_SALE_UNIT,
      qty,
      grossAmount: Number.isFinite(lineAmount) ? round2(lineAmount) : lineAmount,
      serviceRounds,
    });
  });

  // ── เงิน ─────────────────────────────────────────────────────────────
  let money = { lineTotals: draftLines.map(() => 0), subtotal: 0, vatAmount: 0, totalAmount: 0 };
  if (linesMoneyOk && HISTORICAL_VAT_RATES.includes(vatRate)) {
    money = splitHistoricalAmounts(draftLines.map((l) => l.grossAmount), { amountsIncludeVat, vatRate });
  }
  const lines = draftLines.map((line, index) => {
    const lineTotal = money.lineTotals[index] ?? 0;
    return {
      ...line,
      lineTotal,
      unitPrice: Number.isFinite(line.qty) && line.qty > 0 ? round2(lineTotal / line.qty) : 0,
    };
  });
  const totalAmount = money.totalAmount;
  const header = {
    customerId: customerId || null,
    customerName,
    ownerId: ownerId || null,
    ownerName,
    team,
    orderDate: orderDate || null,
    docLanguage,
    amountsIncludeVat,
    vatRate,
    notes,
    subtotal: money.subtotal,
    discountAmount: 0,
    vatAmount: money.vatAmount,
    totalAmount,
    actualAmount: Math.max(0, round2(totalAmount - money.vatAmount)),
    refs,
  };

  // ── งวด ──────────────────────────────────────────────────────────────
  const checked = validateHistoricalInstallments(body.installments, { total: linesMoneyOk ? totalAmount : null, todayIso });
  errors.push(...checked.errors);
  warnings.push(...checked.warnings);

  // ── ยกเว้นด่านเงิน (ข้อ 11 · ข้อ 13) ─────────────────────────────────────
  const zeroValue = linesMoneyOk && totalAmount === 0 && rawLines.length > 0;
  let reason = text(body.paymentGateExemptReason) || null;
  let automatic = false;
  if (zeroValue && !reason) { reason = ZERO_VALUE_EXEMPT_REASON; automatic = true; }
  if (reason && !automatic) {
    const reasonError = exemptReasonError(reason);
    if (reasonError) err('paymentGateExemptReason', reasonError);
  }
  if (zeroValue && !notes) err('notes', 'ใบยอด 0 บาทต้องมีหมายเหตุบอกเหตุผล (มติข้อ 11)');
  const exemption = { reason, automatic };

  // ── ดีลภาชนะของคู่ (ลูกค้า × AE) ─────────────────────────────────────────
  let deal = { id: null, code: null, title: HISTORICAL_DEAL_TITLE(customerName), willCreate: true };
  const found = ownerId
    ? (containerDeals || []).find((d) => String(d.ownerId || '') === ownerId && (!d.customerId || d.customerId === customerId))
    : null;
  if (found) {
    deal = { id: found.id, code: found.code || null, title: found.title || null, willCreate: false };
    if (found.stage !== 'won' || found.line !== 'SERVICE' || found.projectId) {
      err('deal', `ดีลของใบย้อนหลัง ${found.code || found.id} ไม่อยู่ในสภาพที่ผูกใบได้ (ต้อง Won · สายบริการ · ไม่มีโครงการ) — แจ้งผู้ดูแลระบบ`);
    }
  } else if (ownerId && owner?.ok && !team) {
    err('ownerId', 'AE คนนี้ยังไม่มีทีม — ตั้งทีมที่หน้าจัดทีมก่อน จึงสร้างดีลของใบย้อนหลังได้ (ทีมตามดีล)');
  }

  // ── คำเตือนรวม ────────────────────────────────────────────────────────
  if (!checked.installments.length && !reason) {
    warnings.push('ไม่มีงวดที่ต้องเก็บและไม่ได้ยกเว้นด่านเงิน — นัดบริการของใบนี้จะติดด่านเงินจนกว่าจะคีย์งวดหรือยกเว้น');
  }
  warnings.push('ด่านสัญญา: หลังบันทึกต้องสร้างเอกสารแทนสัญญา (ชนิดบริการ) ที่ช่วงมีผลครอบวันที่ใบ แล้วผูกกับใบนี้ก่อน TS จึงนัดได้');

  // ── ใบที่อาจซ้ำ (ไม่ใช่ error — ต้องยืนยันก่อนบันทึก) ──────────────────────────
  const refSet = new Set(Object.values(refs).filter(Boolean).map(normRef));
  const duplicates = (existingHistorical || [])
    .filter((row) => row && row.id !== replayOrderId)
    .filter((row) => (orderDate && row.orderDate === orderDate) || historicalRefsOf(row).some((r) => refSet.has(normRef(r))))
    .map((row) => ({
      id: row.id, orderNumber: row.orderNumber || null, orderDate: row.orderDate || null,
      status: row.status || null, refs: historicalRefsOf(row),
    }));

  return { header, lines, installments: checked.installments, deal, exemption, duplicates, warnings, errors };
}

/* แผน → อาร์กิวเมนต์ของ RPC (คีย์ตรงกับที่ create_historical_sales_order อ่าน) */
export function historicalRpcPayload(plan) {
  const { header, lines, installments, exemption } = plan;
  return {
    p_header: {
      customerId: header.customerId,
      ownerId: header.ownerId,
      team: header.team,
      orderDate: header.orderDate,
      docLanguage: header.docLanguage,
      notes: header.notes,
      subtotal: header.subtotal,
      discountAmount: header.discountAmount,
      vatAmount: header.vatAmount,
      totalAmount: header.totalAmount,
      historicalQuoteRef: header.refs.quote,
      historicalExpressRef: header.refs.express,
      historicalInvoiceRef: header.refs.invoice,
      paymentGateExemptReason: exemption.reason,
    },
    p_lines: lines.map((l) => ({
      installationPoint: l.installationPoint, productId: l.productId, fgCode: l.fgCode,
      description: l.description, unit: l.unit, qty: l.qty, unitPrice: l.unitPrice,
      lineTotal: l.lineTotal, serviceRounds: l.serviceRounds,
    })),
    p_installments: installments.map((i) => ({
      label: i.label, amount: i.amount, dueDate: i.dueDate, coversFrom: i.coversFrom, coversTo: i.coversTo,
    })),
  };
}

/* JSON ที่เรียงคีย์ทุกชั้น — ลายนิ้วมือต้องไม่ขึ้นกับลำดับคีย์ที่ client ส่งมา */
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}

/**
 * ต้นทางของลายนิ้วมือคำขอ (historicalIntakeHash) — แฮชทำฝั่ง server (historicalOrderCommit)
 * ครอบทุกค่าที่ลงฐาน: ส่งซ้ำด้วยรหัสการคีย์เดิมแต่ต่างแม้ช่องเดียว = RPC ตอบ intake_key_conflict
 */
export function historicalIntakeFingerprintSource(plan) {
  const { header, lines, installments, exemption } = plan;
  return stableStringify({
    customerId: header.customerId,
    ownerId: header.ownerId,
    team: header.team,
    subtotal: header.subtotal,
    discountAmount: header.discountAmount,
    vatAmount: header.vatAmount,
    totalAmount: header.totalAmount,
    orderDate: header.orderDate,
    docLanguage: header.docLanguage,
    refs: header.refs,
    notes: header.notes,
    paymentGateExemptReason: exemption.reason,
    lines: lines.map((l) => [
      l.installationPoint, l.productId, l.fgCode, l.description, l.unit, l.qty, l.unitPrice, l.lineTotal, l.serviceRounds,
    ]),
    installments: installments.map((i) => [i.label, i.amount, i.dueDate, i.coversFrom, i.coversTo]),
  });
}
