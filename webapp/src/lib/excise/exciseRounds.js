// ── ใบค่าสรรพสามิตแบ่งรอบ — คงเหลือรายบรรทัด SO + จำนวนของรอบนี้ (แผนรื้อสรรพสามิต หมวด 13 · มติเจ้าของ 02/11 V10–V12) ──
//
// SO ลูกค้าหนึ่งใบออกใบค่าสรรพสามิตได้หลายรอบ (ส่งของไม่ครบในรอบเดียว) · แก้ได้แค่ **จำนวน** ต่อบรรทัด —
// ภาษีต่อชิ้น/ส่วนลด/VAT ยังมาจาก SO ต้นทางตามหมวด 3.4 · ยอดบรรทัด = จำนวน × ภาษีต่อชิ้น (ปัดที่ต่อชิ้นครั้งเดียว ⇒ ไม่มีเศษสะสม)
// คงเหลือ = หน่วยที่ยื่นภาษีของบรรทัด SO − ผลรวมจำนวนบนใบค่าสรรพสามิตที่ยังมีผลของ SO นั้น (ร่าง · ส่ง · ตีกลับ · รับแล้ว)
//
// ⚠️ ไฟล์บริสุทธิ์ — ไม่ยิง query · จอ (หน้าออกใบ/หน้าใบ) กับ server ใช้ตัวคิดตัวเดียวกัน ⇒ ยอดบนจอ = ยอดที่ลงฐาน
// ⚠️ ฐานกันเกินอีกชั้นตอนรับใบ (`accept_excise_quotation_atomic` · mig 0418) — ตัวที่นี่กันตั้งแต่ร่าง
import { quoteLineMoney } from '@/lib/salesPlanning';
import { lineUnitsTotal } from '@/lib/sales/linePacks';

const EPSILON = 0.000001;
const round4 = (value) => Math.round((Number(value) || 0) * 10000) / 10000;

/** บรรทัด SO ที่บรรทัดค่าภาษีนี้ชี้ (`metadata.sourceSalesOrderLineId`) — ไม่มี = '' */
export const roundLineKey = (line) => String(line?.metadata?.sourceSalesOrderLineId || '').trim();

/** จำนวนของใบหนึ่งใบรายบรรทัด SO — Map(บรรทัด SO → หน่วย) · บรรทัดที่ไม่ผูกบรรทัด SO ไม่นับ
 *  (บรรทัดค่าภาษีไม่มีเลขแพ็ค ⇒ หน่วย = qty · นับผ่านตัวนับกลางตามด่าน linePackReaders) */
export function roundQuantitiesOf(lines = []) {
  const byLine = new Map();
  for (const line of lines || []) {
    const key = roundLineKey(line);
    if (!key) continue;
    byLine.set(key, round4((byLine.get(key) || 0) + lineUnitsTotal(line)));
  }
  return byLine;
}

/** ใบนี้ผูกบรรทัด SO ครบทุกบรรทัดไหม — ใบก่อนลิงก์ (ไม่ควรมี) นับรายบรรทัดไม่ได้ */
export const roundLinesLinked = (lines = []) => (lines || []).length > 0 && (lines || []).every((line) => roundLineKey(line));

/**
 * แถวคงเหลือรายบรรทัด SO — ตัวเดียวของหน้าออกใบ หน้าใบ และเส้นเดินงานบน SO
 * @param templateLines บรรทัดค่าภาษี **เต็มจำนวน** ของ SO (buildExciseQuotationLines · qty = หน่วยที่ยื่นภาษีทั้งบรรทัด)
 * @param otherQuotes   ใบค่าสรรพสามิตที่ยังมีผลของ SO นี้ **ยกเว้นใบที่กำลังแก้** — พก `lines`
 * @returns `[{ sourceSalesOrderLineId, fgCode, description, unit, unitPrice, ordered, issued, remaining }]` ตามลำดับบรรทัด SO
 */
export function exciseRoundRows({ templateLines = [], otherQuotes = [] } = {}) {
  const issued = new Map();
  for (const quote of otherQuotes || []) {
    for (const [key, qty] of roundQuantitiesOf(quote?.lines)) issued.set(key, round4((issued.get(key) || 0) + qty));
  }
  return (templateLines || []).map((line) => {
    const key = roundLineKey(line);
    const ordered = round4(lineUnitsTotal(line));
    const used = issued.get(key) || 0;
    return {
      sourceSalesOrderLineId: key,
      fgCode: line.metadata?.sourceFgCode || line.fgCode || '',
      description: line.metadata?.descriptionTh || line.description || '',
      unit: line.unit || '',
      unitPrice: Number(line.unitPrice) || 0,
      ordered,
      issued: used,
      remaining: Math.max(0, round4(ordered - used)),
    };
  });
}

/** สรุปคงเหลือทั้ง SO — `{ remainingLines, remainingUnits, hasRemaining }` */
export function roundRemainingSummary(rows = []) {
  const open = (rows || []).filter((row) => row.remaining > EPSILON);
  return {
    remainingLines: open.length,
    remainingUnits: round4(open.reduce((sum, row) => sum + row.remaining, 0)),
    hasRemaining: open.length > 0,
  };
}

/**
 * ยอดค้าง (หน่วย) ของ SO จากรอบที่ยังมีผล — ยอดสั่งที่ตรึงบนรอบล่าสุด (`metadata.exciseSource.orderedByLine`) − ผลรวมทุกรอบ
 * ไม่คิดใบยื่นทั้ง SO ใหม่ (คิว SA · ป้ายรอบบนจอ RA) · SO ล็อกระหว่างมีรอบ (Q16) ⇒ ยอดตรึงไม่เปลี่ยนใต้ใบ
 * @param rounds ใบค่าสรรพสามิตที่ยังมีผลของ SO เดียว (พก `createdAt` · `metadata` · `lines`)
 * @returns หน่วยที่ยังค้าง · null = ไม่รู้ (ทุกรอบออกก่อนแบ่งรอบ — ไม่มียอดตรึง ⇒ ผู้เรียกถือว่าครบ)
 */
export function roundsRemainingUnits(rounds = []) {
  const latest = [...(rounds || [])].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .find((row) => row?.metadata?.exciseSource?.orderedByLine);
  if (!latest) return null;
  const issued = new Map();
  for (const round of rounds || []) for (const [key, qty] of roundQuantitiesOf(round.lines)) issued.set(key, (issued.get(key) || 0) + qty);
  return round4(Object.entries(latest.metadata.exciseSource.orderedByLine)
    .reduce((sum, [key, qty]) => sum + Math.max(0, (Number(qty) || 0) - (issued.get(key) || 0)), 0));
}

/**
 * คำขอจำนวนจากจอ `{ [sourceSalesOrderLineId]: number }` → `{ value: Map }` · ไม่ส่ง = `{ value: null }` (ใช้ค่าตั้งต้น) · ผิดรูป = `{ error }`
 */
export function parseRoundQuantities(raw) {
  if (raw === undefined || raw === null) return { value: null };
  if (typeof raw !== 'object' || Array.isArray(raw)) return { error: 'จำนวนรายบรรทัดไม่ถูกต้อง' };
  const value = new Map();
  for (const [key, input] of Object.entries(raw)) {
    const id = String(key || '').trim();
    const text = typeof input === 'string' ? input.trim() : input;
    const qty = text === '' ? NaN : Number(text);
    if (!id || !Number.isFinite(qty) || qty < 0) return { error: 'จำนวนรายบรรทัดต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป' };
    value.set(id, round4(qty));
  }
  return { value };
}

/**
 * จำนวนของรอบนี้ + ตรวจกับคงเหลือ — ตัวตัดสินเดียวของออกใบ · แก้จำนวน · คิดใหม่จากใบสั่งขาย · ออก Rev.
 * @param rows      exciseRoundRows (คงเหลือไม่นับใบตัวเอง)
 * @param requested Map ที่จอขอ (parseRoundQuantities) · null = ไม่ได้ขอ
 * @param fallback  จำนวนเดิมของใบ (คิดใหม่/Rev.) · null = ใบใหม่ ⇒ ค่าตั้งต้น = คงเหลือทั้งหมด
 * @returns `{ quantities: Map }` หรือ `{ error }` (ข้อความไทยพร้อมรหัส FG)
 */
export function resolveRoundQuantities({ rows = [], requested = null, fallback = null } = {}) {
  const known = new Set((rows || []).map((row) => row.sourceSalesOrderLineId).filter(Boolean));
  if (requested) {
    const unknown = [...requested.keys()].filter((key) => !known.has(key));
    if (unknown.length) return { error: 'รายการที่ส่งมาไม่ตรงกับใบสั่งขายต้นทาง — โหลดหน้าใหม่แล้วลองอีกครั้ง' };
  }
  const quantities = new Map();
  const over = [];
  for (const row of rows || []) {
    const key = row.sourceSalesOrderLineId;
    let qty;
    if (requested?.has(key)) qty = requested.get(key);
    else if (fallback) qty = fallback.get(key) || 0;
    else qty = row.remaining;
    qty = round4(qty);
    if (qty > row.remaining + EPSILON) over.push(`${row.fgCode || key} (เหลือ ${row.remaining})`);
    quantities.set(key, qty);
  }
  if (over.length) return { error: `จำนวนเกินยอดคงเหลือของใบสั่งขาย: ${over.join(', ')}` };
  if (![...quantities.values()].some((qty) => qty > EPSILON)) {
    return {
      error: roundRemainingSummary(rows).hasRemaining
        ? 'ต้องมีอย่างน้อยหนึ่งรายการที่จำนวนมากกว่า 0'
        : 'ใบสั่งขายนี้ออกใบค่าสรรพสามิตครบทุกรายการแล้ว — ไม่มียอดค้างให้ออกรอบใหม่',
    };
  }
  return { quantities };
}

/**
 * บรรทัดของรอบนี้ = บรรทัดเต็มจำนวน × จำนวนที่เลือก · จำนวน 0 = ตัดออก · ยอดคิดด้วย `quoteLineMoney` ตัวเดียวกับทุกบรรทัดใบเสนอราคา
 * @param quantities Map(บรรทัด SO → จำนวน) · บรรทัดที่ไม่อยู่ใน Map = คงจำนวนเดิมของบรรทัด
 */
export function applyRoundQuantities(templateLines = [], quantities = null) {
  const lines = [];
  for (const line of templateLines || []) {
    const key = roundLineKey(line);
    const qty = quantities && key && quantities.has(key) ? quantities.get(key) : lineUnitsTotal(line);
    if (!(qty > EPSILON)) continue;
    const money = quoteLineMoney({ qty, unitPrice: Number(line.unitPrice) || 0 });
    lines.push({
      ...line,
      sortOrder: lines.length,
      qty,
      discountType: money.discountType,
      discountValue: money.discountValue,
      discountAmount: money.discountAmount,
      lineTotal: money.lineTotal,
    });
  }
  return lines;
}

/** จำนวนรอบนี้จากแถวคงเหลือ + ค่าที่พิมพ์บนจอ — ช่องว่าง/ไม่ใช่ตัวเลข = 0 (จอส่งค่าที่พิมพ์ server ตรวจซ้ำ) */
export function roundQuantitiesFromInputs(rows = [], inputs = {}) {
  const value = new Map();
  for (const row of rows || []) {
    const raw = inputs?.[row.sourceSalesOrderLineId];
    const qty = raw === undefined ? row.remaining : Number(raw);
    value.set(row.sourceSalesOrderLineId, Number.isFinite(qty) && qty > 0 ? round4(qty) : 0);
  }
  return value;
}
