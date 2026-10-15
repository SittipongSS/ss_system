// ── ตัวเทียบ "ยอดของบรรทัดยังตรงกับสูตรไหม" (อ่านอย่างเดียว · mig 0407 · docs/qt-pack-column.md) ───────────────
//
// ⭐ ทำไมต้องมี
//  (ก) หลักฐานที่รันซ้ำได้ว่า **ทุกบรรทัดที่เก็บไว้ยังเท่ากับสูตร** แพ็ค × จำนวน × ราคา − ส่วนลด ทั้งด้วยสูตร JS
//      (quoteLineNet) และด้วยนิพจน์ของ CHECK *_line_money_rule (คิดแบบทศนิยมแท้) และ **ทุกบรรทัดของใบสั่งขาย
//      พกเลขแพ็คเท่ากับบรรทัดใบเสนอราคาต้นทาง** — จุดบอดของ CHECK คือเลขแพ็ค 1 ที่หายไประหว่างทางก๊อป (ยอดไม่เปลี่ยน)
//  (ข) ที่เดียวใน src/ ที่ **เอ่ยชื่อคอลัมน์ packQty ใน .select()** ⇒ ด่าน check:columns (อ่านสคีมาจากฐานจริง)
//      แดงเฉพาะชื่อนี้จนกว่าเจ้าของจะรัน 0407 = PR รวมเข้า main ก่อนรัน migration ไม่ได้
//
// ⛔ ไม่มีไฟล์ไหนของแอป import ไฟล์นี้ — ผู้ใช้คือ scripts/check-line-pack-parity.mjs กับเทสต์เท่านั้น
// ⛔ อ่านอย่างเดียว: มีแต่ .select() (dev DB = prod DB)
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { quoteLineNet, quoteTotals } from '@/lib/salesPlanning';
import { lineTakesPacks } from '@/lib/sales/linePacks';

/* ชื่อตารางเขียนเป็นค่าตรง ๆ ในบรรทัดเดียวกับ .select() — ด่าน check:columns แกะตารางจากตัวแปรไม่ได้
   และ fetchAllResult ต้องอยู่ในคำสั่งเดียวกัน (ด่าน check:rowcap: ตารางบรรทัดโตเกินเพดาน 1,000 แถวแล้ว) */
export const QUOTATION_LINE_MONEY_SELECT = 'id, "quotationId", "packQty", qty, "unitPrice", "discountType", "discountValue", "discountAmount", "lineTotal"';
export const SALES_ORDER_LINE_MONEY_SELECT = 'id, "salesOrderId", "quotationLineId", "packQty", qty, "unitPrice", "discountType", "discountValue", "discountAmount", "lineTotal"';

/** ทุกบรรทัดใบเสนอราคา เฉพาะคอลัมน์เงิน + เลขแพ็ค → `{ data, error }` (supabase ไม่ throw — ผู้เรียกต้องดู error) */
export async function loadQuotationLineMoney(supabase) {
  return fetchAllResult(() => supabase.from('quotation_lines').select(QUOTATION_LINE_MONEY_SELECT).order('id', { ascending: true }));
}

/** ทุกบรรทัดใบสั่งขาย เฉพาะคอลัมน์เงิน + เลขแพ็ค + บรรทัดใบเสนอราคาต้นทาง → `{ data, error }` */
export async function loadSalesOrderLineMoney(supabase) {
  return fetchAllResult(() => supabase.from('sales_order_lines').select(SALES_ORDER_LINE_MONEY_SELECT).order('id', { ascending: true }));
}

/* บันทึกการแก้ไขของใบเสนอราคา (audit_logs) ตั้งแต่เวลาที่กำหนด — สำหรับตัวจับ packLossInAudit (การบันทึกที่ทำเลขแพ็คของบรรทัดหาย)
   ทุกการบันทึก/ลบใบเสนอราคาเขียนแถวที่นี่พร้อมใบทั้งก้อนก่อน–หลัง (recordAudit ของ PATCH และ DELETE — รุ่นก่อนงวด PR-1 ก็เขียนเหมือนกัน
   และอ่านใบด้วย select * ทั้งสองฝั่ง ⇒ `before.lines` / `after.lines` มีคีย์ packQty เสมอ)
   หน้าละ 100: แต่ละแถวพกใบสองก้อน · ผู้รันจำกัดช่วงด้วยเวลา (สคริปต์พิมพ์ --audit-since ของรอบถัดไปให้) */
export const QUOTATION_AUDIT_SELECT = 'id, action, "entityId", "actorName", summary, "createdAt", before, after';
export const QUOTATION_AUDIT_ACTIONS = Object.freeze(['update', 'delete']);

/** แถว audit ของใบเสนอราคา (แก้ไข · ลบ) ตั้งแต่ `sinceIso` เรียงตาม id → `{ data, error }` */
export async function loadQuotationAuditSince(supabase, sinceIso) {
  return fetchAllResult(
    () => supabase.from('audit_logs').select(QUOTATION_AUDIT_SELECT).eq('entityType', 'quotation').in('action', QUOTATION_AUDIT_ACTIONS).gte('createdAt', sinceIso).order('id', { ascending: true }),
    { pageSize: 100 },
  );
}

/* ── ทศนิยมแท้ (BigInt) — เลียนแบบ numeric ของ Postgres โดยไม่ผ่าน floating point ─────────────────────────
   ค่าจาก PostgREST มาเป็นตัวเลข JSON: String(ตัวเลข) คืนทศนิยมสั้นที่สุดที่อ่านกลับได้ค่าเดิม ซึ่งตรงกับค่าที่เก็บ
   ตราบที่มีเลขนัยสำคัญไม่เกิน 15 หลัก · รูป e (เช่น 1e21 / 1e-7) แปลงเป็นทศนิยมแท้ก่อน */
function decimalOf(value) {
  const text = String(value ?? 0).trim();
  const m = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(text);
  if (!m) return null;
  let digits = m[2] + (m[3] || '');
  let scale = (m[3] || '').length - Number(m[4] || 0);
  if (scale < 0) { digits += '0'.repeat(-scale); scale = 0; }
  const n = BigInt(digits);
  return { n: m[1] ? -n : n, scale };
}
const pow10 = (k) => 10n ** BigInt(k);
const absBig = (n) => (n < 0n ? -n : n);
const rescale = (d, scale) => d.n * pow10(scale - d.scale);
/* round(x, 2) ของ numeric: ปัดครึ่งออกจากศูนย์ → จำนวนสตางค์ */
function roundToCents(d) {
  if (d.scale <= 2) return rescale(d, 2);
  const unit = pow10(d.scale - 2);
  const magnitude = absBig(d.n);
  const cents = magnitude / unit + ((magnitude % unit) * 2n >= unit ? 1n : 0n);
  return d.n < 0n ? -cents : cents;
}
const satang = (value) => Math.round((Number(value) || 0) * 100);

/**
 * บรรทัดที่สูตร JS (quoteLineNet — ตัวเดียวกับที่แอปใช้คิดเงิน) ให้ยอดไม่ตรงกับที่เก็บ — เทียบเป็นสตางค์
 * @returns {{ id: string, field: 'lineTotal' | 'discountAmount', stored: number, computed: number }[]}
 */
export function lineMoneyDiffs(rows) {
  const out = [];
  for (const row of rows || []) {
    const net = quoteLineNet(row);
    for (const field of ['lineTotal', 'discountAmount']) {
      if (satang(net[field]) !== satang(row[field])) {
        out.push({ id: row.id, field, stored: Number(row[field] ?? 0), computed: net[field] });
      }
    }
  }
  return out;
}

/**
 * นิพจน์ของ CHECK *_line_money_rule คิดแบบทศนิยมแท้:
 *   abs("lineTotal" - (round(COALESCE("packQty", 1) * qty * "unitPrice", 2) - COALESCE("discountAmount", 0))) <= 0.01
 * @returns `{ refused, inexact, unreadable }` — แถวที่ฐานจะปฏิเสธ · แถวที่ผ่านด้วยค่าคลาด (ไม่ตรงเป๊ะ) · แถวที่อ่านค่าไม่ได้
 *   แต่ละรายการ `{ id, expected, stored }` (expected = ยอดตามสูตรของฐาน เป็นบาท)
 */
export function checkRuleDiffs(rows) {
  const refused = [];
  const inexact = [];
  const unreadable = [];
  for (const row of rows || []) {
    const pack = row.packQty === null || row.packQty === undefined ? 1 : row.packQty;
    const qty = decimalOf(row.qty);
    const price = decimalOf(row.unitPrice);
    const discount = decimalOf(row.discountAmount ?? 0);
    const total = decimalOf(row.lineTotal);
    if (!Number.isInteger(pack) || !qty || !price || !discount || !total || row.lineTotal === null || row.lineTotal === undefined) {
      unreadable.push({ id: row.id, expected: null, stored: row.lineTotal ?? null });
      continue;
    }
    const grossCents = roundToCents({ n: BigInt(pack) * qty.n * price.n, scale: qty.scale + price.scale });
    const scale = Math.max(2, discount.scale, total.scale);
    const expected = grossCents * pow10(scale - 2) - rescale(discount, scale);
    const distance = absBig(rescale(total, scale) - expected);
    const entry = { id: row.id, expected: Number(expected) / Number(pow10(scale)), stored: Number(row.lineTotal) };
    if (distance > pow10(scale - 2)) refused.push(entry);
    else if (distance !== 0n) inexact.push(entry);
  }
  return { refused, inexact, unreadable };
}

/**
 * บรรทัดใบสั่งขายที่เลขแพ็คไม่เท่ากับบรรทัดใบเสนอราคาต้นทาง (`quotationLineId` ที่ยังหาเจอ)
 * — ทางก๊อป QT → SO → SO Rev. ต้องพกเลขนี้ไปทุกทอด รวมเลข 1 ที่ CHECK มองไม่เห็นว่าหาย
 * @returns {{ id: string, quotationLineId: string, salesOrderPack: number | null, quotationPack: number | null }[]}
 */
export function packCopyDiffs(soRows, qtRows) {
  const quotationPackById = new Map((qtRows || []).map((row) => [row.id, row.packQty ?? null]));
  const out = [];
  for (const row of soRows || []) {
    if (!row.quotationLineId || !quotationPackById.has(row.quotationLineId)) continue;
    const quotationPack = quotationPackById.get(row.quotationLineId);
    const salesOrderPack = row.packQty ?? null;
    if (salesOrderPack !== quotationPack) {
      out.push({ id: row.id, quotationLineId: row.quotationLineId, salesOrderPack, quotationPack });
    }
  }
  return out;
}

/**
 * หัวใบเสนอราคาที่ยอด (รวมก่อนส่วนลดท้ายใบ · VAT · ยอดสุทธิ) ไม่ตรงกับที่ quoteTotals คิดจากบรรทัดที่เก็บไว้
 * @param quotes `[{ id, quoteNumber, subtotal, vatAmount, totalAmount, discountType, discountValue, vatRate, lines }]`
 */
export function headerTotalDiffs(quotes) {
  const out = [];
  for (const quote of quotes || []) {
    const totals = quoteTotals(quote.lines || [], {
      discountType: quote.discountType, discountValue: quote.discountValue, vatRate: quote.vatRate,
    });
    const fields = ['subtotal', 'vatAmount', 'totalAmount'].filter((field) => satang(totals[field]) !== satang(quote[field]));
    if (fields.length) out.push({ id: quote.id, number: quote.quoteNumber || null, fields });
  }
  return out;
}

/**
 * เอกสารที่ลายนิ้วมือการอนุมัติซึ่งเก็บไว้ ไม่ตรงกับที่โค้ดปัจจุบันคำนวณจากเนื้อหาที่เก็บไว้
 * @param fingerprintOf `(doc, lines) => string` — quotationApprovalFingerprint / salesOrderApprovalFingerprint
 * @returns `{ checked, diffs: [{ id, number, approvalStatus, status }] }` — นับเฉพาะใบที่มีลายนิ้วมือเก็บไว้
 */
export function fingerprintDiffs(docs, fingerprintOf) {
  let checked = 0;
  const diffs = [];
  for (const doc of docs || []) {
    if (!doc.approvalFingerprint) continue;
    checked += 1;
    if (fingerprintOf(doc, doc.lines || []) !== doc.approvalFingerprint) {
      diffs.push({
        id: doc.id,
        number: doc.quoteNumber || doc.orderNumber || null,
        approvalStatus: doc.approvalStatus ?? null,
        status: doc.status ?? null,
      });
    }
  }
  return { checked, diffs };
}

/* ── "ไม่มีจุดต่าง" ต้องมาจากการเทียบจริง ────────────────────────────────────────────────────────────────────
   🐞 รีวิว 08/10 (js-03): ทุกหัวข้อของสคริปต์นับแต่ "จุดต่าง" ⇒ อ่านได้ 0 แถว (คีย์ที่มองไม่เห็นแถว · ชี้ผิดโปรเจกต์) = "ต่าง 0 จาก 0"
     ทุกหัวข้อ แล้วจบด้วย exit 0 — ขั้นพิสูจน์ของงานเงินผ่านด้วย exit code ทั้งที่ไม่ได้เทียบอะไรเลย
   ⇒ สคริปต์ต้องผ่าน "ด่านความครบ" ก่อนจะพูดว่าไม่มีจุดต่าง: ทุกหัวข้อต้องได้อ่าน/ได้เทียบอย่างน้อยตามขั้นต่ำ (ไม่กำหนด = 1) */
export const PARITY_COVERAGE = Object.freeze([
  ['quotationLines', 'บรรทัดใบเสนอราคาที่อ่านได้'],
  ['salesOrderLines', 'บรรทัดใบสั่งขายที่อ่านได้'],
  ['quotations', 'ใบเสนอราคาที่อ่านได้'],
  ['salesOrders', 'ใบสั่งขายที่อ่านได้'],
  ['linkedOrderLines', 'บรรทัดใบสั่งขายที่เทียบกับบรรทัดใบเสนอราคาต้นทางได้'],
  ['quotationFingerprints', 'ลายนิ้วมือใบเสนอราคาที่เทียบได้'],
  ['salesOrderFingerprints', 'ลายนิ้วมือใบสั่งขายที่เทียบได้'],
]);

/**
 * หัวข้อที่ "เทียบน้อยกว่าขั้นต่ำ" — ว่าง = เทียบครบพอจะเชื่อผลได้
 * @param counts จำนวนที่อ่าน/เทียบได้จริง ตามคีย์ของ PARITY_COVERAGE (ขาดคีย์ / ไม่ใช่จำนวนเต็ม ≥ 0 = นับเป็น 0)
 * @param floors ขั้นต่ำที่ผู้รันกำหนด (คีย์เดียวกัน) — ไม่กำหนด หรือกำหนดต่ำกว่า 1 = 1 เสมอ: "เทียบ 0 รายการ" ไม่เคยเป็นหลักฐาน
 * @returns {{ key: string, label: string, got: number, min: number }[]}
 */
export function parityCoverageGaps(counts = {}, floors = {}) {
  const whole = (value) => (Number.isInteger(value) && value >= 0 ? value : 0);
  return PARITY_COVERAGE
    .map(([key, label]) => ({ key, label, got: whole(counts?.[key]), min: Math.max(1, whole(floors?.[key])) }))
    .filter((entry) => entry.got < entry.min);
}

/* ── จำนวนบรรทัดที่มีเลขแพ็คต้องไม่ลดลง (งวด PR-3 · ประตูทางเดียว · docs/qt-pack-column.md) ──────────────────────────────
   เลขแพ็คที่หายจากบรรทัด **พร้อมยอดที่หดตาม** (จำนวน × ราคา กับ NULL) เป็นแถวที่ถูกต้องในสายตาของทุกหัวข้อข้างบน: สูตร JS ตรง · CHECK รับ
   · หัวใบตรงกับบรรทัด — เกิดได้สองทาง: แอปถูกถอยไปรุ่นก่อนงวด PR-1 แล้วมีคนบันทึก/ออก Rev. ใบที่มีเลขแพ็ค หรือมีคนลบเลขด้วยมือ
   ไม่มีอะไรในฐานกันได้ (ต้องใช้ trigger = migration — นอกขอบเขต) ⇒ จำนวนบรรทัดที่มีเลขแพ็คที่ **ลดลงจากรอบก่อน** เป็นสัญญาณหยาบตัวแรก
   ⚠️ สัญญาณนี้แปลว่า **"ต้องดู"** ไม่ใช่ "รุ่นเก่าเขียนทับ": คนขายลบใบร่างหรือลบบรรทัดที่มีเลขแพ็คได้ตามปกติ (จำนวนลด) และของที่หายถูกชดเชยด้วย
      บรรทัดใหม่ได้ (จำนวนไม่ลด) — ตัวที่ชี้บรรทัดจริงคือสามตัวจับถัดลงไป (packLossInAudit · revisionPackLoss · sentWithoutPack)
   ⭐ ต่างจากด่านความครบ: 0 เป็นค่าที่ถูกต้องได้ (วันที่ยังไม่มีใบไหนมีเลขแพ็ค) ⇒ ตรวจเฉพาะเมื่อผู้รันกำหนดขั้นต่ำมา (--expect-min-packed) */
export const PACKED_COVERAGE = Object.freeze([
  ['packedQuotationLines', 'บรรทัดใบเสนอราคาที่มีเลขแพ็ค'],
  ['packedSalesOrderLines', 'บรรทัดใบสั่งขายที่มีเลขแพ็ค'],
]);

/** จำนวนบรรทัดที่มีเลขแพ็ค (ค่าไม่ใช่ null / undefined — `select *` ก่อนรัน 0407 ไม่มีคีย์ = 0) */
export function packedLineCount(rows) {
  return (rows || []).filter((row) => row?.packQty !== null && row?.packQty !== undefined).length;
}

/**
 * หัวข้อที่จำนวนบรรทัดซึ่งมีเลขแพ็ค ต่ำกว่าขั้นต่ำที่ผู้รันกำหนด — ว่าง = ไม่ลดลง หรือผู้รันไม่ได้กำหนด
 * @param counts `{ packedQuotationLines, packedSalesOrderLines }` ที่นับได้จริง (ขาดคีย์ / ไม่ใช่จำนวนเต็ม ≥ 0 = นับเป็น 0)
 * @param floors ขั้นต่ำจาก --expect-min-packed (คีย์เดียวกัน) — **ไม่มีคีย์ = ไม่ตรวจหัวข้อนั้น** · 0 = ตรวจแล้วผ่านเสมอ
 * @returns {{ key: string, label: string, got: number, min: number }[]}
 */
export function packedCoverageGaps(counts = {}, floors = {}) {
  const whole = (value) => (Number.isInteger(value) && value >= 0 ? value : 0);
  return PACKED_COVERAGE
    .filter(([key]) => floors && Object.hasOwn(floors, key) && Number.isInteger(floors[key]) && floors[key] >= 0)
    .map(([key, label]) => ({ key, label, got: whole(counts?.[key]), min: floors[key] }))
    .filter((entry) => entry.got < entry.min);
}

/* ── เลขแพ็คของบรรทัดไหนหาย (งวด PR-3 · ประตูทางเดียว · รีวิวเงิน 09/10 money-packed-count-is-weak-detector) ─────────────────────
   จำนวนบรรทัดที่มีเลขแพ็ค (ข้างบน) เป็นตัวจับที่อ่อน: (ก) มองไม่เห็นเมื่อของที่หายถูกชดเชย — รุ่นเก่าทำเลขแพ็ค 3 บรรทัดหาย วันเดียวกัน
   คนขายเพิ่มบรรทัดใหม่ 5 บรรทัด ⇒ จำนวนเพิ่ม ผ่าน · (ข) ร้องผิดเมื่อคนขายลบใบร่าง/ลบบรรทัดที่มีเลขแพ็คตามปกติ (ทำได้) ⇒ จำนวนลด
   ⇒ ตัวจับที่ **ชี้บรรทัด** สามตัวข้างล่าง ใช้ความจริงที่ด่านของงวด PR-3 รับประกัน และรุ่นก่อนงวด PR-1 ละเมิด:
     ① packLossInAudit    การบันทึกที่เขียนบรรทัดใหม่ แล้วบรรทัดหมวด 02-001 ออกมาไม่มีเลขแพ็ค ทั้งที่ก่อนบันทึกใบมีเลขแพ็ค
                          (รุ่นตั้งแต่งวด PR-3: ด่าน "ต้องกรอก" ไม่ให้ผ่าน · รุ่น PR-1/PR-2: ไม่บันทึกใบที่มีเลขแพ็คเลย)
     ② revisionPackLoss   ฉบับ Rev. ที่มีบรรทัดหมวด 02-001 ไม่มีเลขแพ็ค ทั้งที่ฉบับต้นทางมีเลขแพ็ค (Rev. ก๊อปบรรทัดตามที่เป็น)
     ③ sentWithoutPack    ใบที่ถูกยื่น/อนุมัติตั้งแต่วันเปิดช่อง แต่มีบรรทัดหมวด 02-001 ไม่มีเลขแพ็ค (ด่านยื่น/อนุมัติของงวด PR-3 ไม่ให้ผ่าน)
   ทุกตัวอ่านอย่างเดียว · หมวดของบรรทัดที่เก็บ = รหัส FG บนบรรทัด / หมวดที่เลือกของบรรทัดพิมพ์เอง (lineTakesPacks — ตัวเดียวกับด่าน) */
const lineHoldsPack = (line) => line?.packQty !== null && line?.packQty !== undefined;
const lineBare = (line) => !lineHoldsPack(line) && lineTakesPacks(line);
const sortKey = (line) => { const key = Number(line?.sortOrder ?? 0); return Number.isFinite(key) ? key : 0; };
const inScreenOrder = (lines) => (lines || []).map((line, index) => ({ line, index })).sort((a, b) => sortKey(a.line) - sortKey(b.line) || a.index - b.index).map((entry) => entry.line);
const quoteNumberOf = (doc) => doc?.quoteNumber || null;

/**
 * แถว audit ของใบเสนอราคาที่ **เลขแพ็คของบรรทัดหายระหว่างการบันทึก**
 * @param entries แถวของ loadQuotationAuditSince (`{ id, action, entityId, actorName, createdAt, before, after }`)
 * @param since   ISO — แถวก่อนเวลานี้ไม่นับ (กันฐานที่ไม่กรองให้) · ไม่ส่ง = นับทุกแถว
 * @returns
 *   compared  จำนวนแถว 'update' ที่มีบรรทัดทั้งสองฝั่งให้เทียบ (การยื่น/อนุมัติเก็บ `after` ไม่มีบรรทัด — ไม่นับ)
 *   stripped  🔴 การบันทึกที่ก่อนบันทึกใบมีเลขแพ็ค และหลังบันทึกมี **บรรทัดหมวด 02-001 ที่เขียนใหม่โดยไม่มีเลขแพ็ค**
 *             `[{ auditId, at, actor, quotationId, number, rows: [{ row, packQty, lineTotal, now }] }]`
 *             — `row` = เลขรายการตามลำดับบนจอก่อนบันทึก · `packQty` / `lineTotal` = ค่าที่ต้องกู้คืน · `now` = ยอดของบรรทัดตำแหน่งเดียวกันหลังบันทึก
 *   removed   ℹ️ บรรทัดที่มีเลขแพ็คซึ่งถูกเอาออกด้วยการทำงานปกติ (ลบบรรทัด · เปลี่ยนสินค้า/หมวดออกจาก 02-001 · ลบใบทั้งใบ) — รูปเดียวกัน + `how`
 *             ใช้อธิบายว่าทำไมจำนวนบรรทัดที่มีเลขแพ็คลดลง ไม่ใช่ข้อผิด
 */
export function packLossInAudit(entries, { since = null } = {}) {
  const floor = since ? Date.parse(since) : null;
  const stripped = [];
  const removed = [];
  let compared = 0;
  for (const entry of entries || []) {
    if (floor !== null && !(Date.parse(entry?.createdAt) >= floor)) continue;
    const beforeLines = entry?.before?.lines;
    const report = (rows, extra = {}) => ({
      auditId: entry.id, at: entry.createdAt || null, actor: entry.actorName || null,
      quotationId: entry.entityId || entry?.before?.id || null, number: quoteNumberOf(entry.before) || quoteNumberOf(entry.after), rows, ...extra,
    });
    const rowOf = (line, rank, now = null) => ({ row: rank + 1, packQty: line.packQty, lineTotal: Number(line.lineTotal ?? 0), now });
    if (entry?.action === 'delete') {
      const rows = inScreenOrder(Array.isArray(beforeLines) ? beforeLines : []).map((line, rank) => (lineHoldsPack(line) ? rowOf(line, rank) : null)).filter(Boolean);
      if (rows.length) removed.push(report(rows, { how: 'ลบใบ' }));
      continue;
    }
    const afterLines = entry?.after?.lines;
    if (entry?.action !== 'update' || !Array.isArray(beforeLines) || !Array.isArray(afterLines)) continue;
    compared += 1;
    const before = inScreenOrder(beforeLines);
    if (!before.some(lineHoldsPack)) continue;
    const beforeIds = new Set(before.map((line) => line?.id).filter(Boolean));
    /* บรรทัดที่ **ถูกเขียนใหม่** (id ไม่อยู่ในชุดก่อนบันทึก — save_quotation_content ลบแล้วแทรกใหม่ทุกครั้งที่บรรทัดถูกส่งมา) */
    const rewritten = afterLines.filter((line) => !beforeIds.has(line?.id));
    const strippedHere = rewritten.some(lineBare);
    const afterAt = new Map(afterLines.map((line) => [sortKey(line), line]));
    const lostRows = [];
    before.forEach((line, rank) => {
      if (!lineHoldsPack(line)) return;
      const twin = afterLines.find((row) => row?.id && row.id === line.id) || afterAt.get(sortKey(line)) || null;
      if (twin && lineHoldsPack(twin)) return;                                 // ยังมีเลขแพ็ค (ค่าเปลี่ยนได้ — คนขายแก้เอง)
      lostRows.push(rowOf(line, rank, twin ? Number(twin.lineTotal ?? 0) : null));
    });
    if (strippedHere) stripped.push(report(lostRows.length ? lostRows : before.map((line, rank) => (lineHoldsPack(line) ? rowOf(line, rank) : null)).filter(Boolean)));
    else if (lostRows.length) removed.push(report(lostRows, { how: 'ลบบรรทัด / เปลี่ยนสินค้าหรือหมวด' }));
  }
  return { compared, stripped, removed };
}

/**
 * ฉบับ Rev. ที่มีบรรทัดหมวด 02-001 ไม่มีเลขแพ็ค ทั้งที่ **ฉบับต้นทางมีเลขแพ็ค**
 * การออก Rev. ก๊อปบรรทัดตามที่เป็น และการบันทึกร่างฉบับใหม่ต้องมีเลขแพ็คครบ ⇒ รูปนี้เกิดจาก (ก) รุ่นก่อนงวด PR-1 ออก Rev. หรือบันทึกทับ —
 * หลังรัน mig 0410 ฐานปฏิเสธทางนั้นในการออก Rev. / การบันทึกครั้งเดียว จึงเหลือแค่ข้อมูลที่เขียนก่อน 0410 หรือภายใต้ทางออกของ SQL Editor (หัวไฟล์ 0410)
 * หรือ (ข) ฉบับ Rev. ของรุ่นปัจจุบันที่บรรทัดหมวด 02-001 เป็นสินค้าที่ต้นทางไม่เคยมีเลขแพ็ค (ย้ายรหัสเข้าหมวด · เพิ่มสินค้าใหม่ · เปลี่ยนสินค้า)
 * รอคนขายกรอกก่อนยื่น — ตัวจับนี้ดูทั้งใบ ส่วนยามของ 0410 เทียบสินค้าเดียวกัน (docs/qt-pack-column.md หัวข้อ "ยามในฐาน — mig 0410")
 * (ฉบับต้นทางเป็น "มีฉบับแก้ไขใหม่" แล้วแก้ไม่ได้ — กรณี (ก) บรรทัดของมันคือค่าที่ต้องกู้คืน)
 * @param quotes ใบเสนอราคาทุกใบพร้อม `lines` (select *)
 * @returns `{ checked, diffs: [{ id, number, sourceId, sourceNumber, rows: [{ row, lineTotal }], sourcePacked }] }` — checked = ฉบับ Rev. ที่หาต้นทางเจอ
 */
export function revisionPackLoss(quotes) {
  const byId = new Map((quotes || []).map((quote) => [quote.id, quote]));
  const diffs = [];
  let checked = 0;
  for (const quote of quotes || []) {
    const source = quote?.revisedFromId ? byId.get(quote.revisedFromId) : null;
    if (!source) continue;
    checked += 1;
    const sourcePacked = (source.lines || []).filter(lineHoldsPack).length;
    if (!sourcePacked) continue;
    const rows = inScreenOrder(quote.lines).map((line, rank) => (lineBare(line) ? { row: rank + 1, lineTotal: Number(line.lineTotal ?? 0) } : null)).filter(Boolean);
    if (rows.length) diffs.push({ id: quote.id, number: quoteNumberOf(quote), sourceId: source.id, sourceNumber: quoteNumberOf(source), rows, sourcePacked });
  }
  return { checked, diffs };
}

/**
 * ใบที่ถูก **ยื่นอนุมัติหรืออนุมัติตั้งแต่วันเปิดช่อง** แต่มีบรรทัดหมวด 02-001 ที่ไม่มีเลขแพ็ค
 * ด่านยื่น/อนุมัติของงวด PR-3 ไม่ให้ใบแบบนี้ผ่าน ⇒ รูปนี้ = ใบถูกยื่น/อนุมัติจากรุ่นที่ไม่มีด่าน (รุ่นเก่า) หรือบรรทัดถูกเขียนทับหลังจากนั้น
 * @param launchIso เวลาที่งวด PR-3 ขึ้น production (ISO) — ใบที่ยื่น/อนุมัติก่อนหน้านั้นไม่นับ (มติ A4: ใบเก่าที่ไม่มีใครแตะคงเดิม)
 * @returns `{ checked, diffs: [{ id, number, approvalStatus, status, requestedAt, approvedAt, rows: [{ row, lineTotal }] }] }`
 */
export function sentWithoutPack(quotes, launchIso) {
  const floor = Date.parse(launchIso);
  const since = (value) => Boolean(value) && Date.parse(value) >= floor;
  const diffs = [];
  let checked = 0;
  for (const quote of quotes || []) {
    if (!since(quote?.approvalRequestedAt) && !since(quote?.approvedAt)) continue;
    checked += 1;
    const rows = inScreenOrder(quote.lines).map((line, rank) => (lineBare(line) ? { row: rank + 1, lineTotal: Number(line.lineTotal ?? 0) } : null)).filter(Boolean);
    if (rows.length) {
      diffs.push({
        id: quote.id, number: quoteNumberOf(quote), approvalStatus: quote.approvalStatus ?? null, status: quote.status ?? null,
        requestedAt: quote.approvalRequestedAt || null, approvedAt: quote.approvedAt || null, rows,
      });
    }
  }
  return { checked, diffs };
}

/**
 * ตัวเลือกของสคริปต์ check-line-pack-parity
 *   --before-migration                   ฐานยังไม่มีคอลัมน์ packQty (อ่านด้วย select *)
 *   --expect-min-lines=<QT>,<SO>         ขั้นต่ำของบรรทัดใบเสนอราคา , บรรทัดใบสั่งขาย ที่ต้องอ่านได้
 *   --expect-min-fingerprints=<QT>,<SO>  ขั้นต่ำของลายนิ้วมือใบเสนอราคา , ใบสั่งขาย ที่ต้องเทียบได้
 *   --expect-min-packed=<QT>,<SO>        จำนวนบรรทัดที่มีเลขแพ็คของรอบก่อน (ใบเสนอราคา , ใบสั่งขาย) — น้อยกว่า = **ต้องดู** (ลบใบ/ลบบรรทัดตามปกติก็ลดได้)
 *   --pack-launch=<เวลา ISO>             เวลาที่งวด PR-3 ขึ้น production (มีเขตเวลา เช่น 2026-10-12T03:00:00Z) — เปิดหัวข้อที่ชี้บรรทัด:
 *                                        ใบที่ยื่น/อนุมัติตั้งแต่นั้นต้องไม่มีบรรทัดหมวด 02-001 ที่ขาดเลขแพ็ค + ไล่ audit หาการบันทึกที่ทำเลขแพ็คหาย
 *   --audit-since=<เวลา ISO>             ไล่ audit ตั้งแต่เวลานี้แทนวันเปิดช่อง (รอบก่อนผ่านแล้ว — สคริปต์พิมพ์ค่าของรอบถัดไปให้) · ต้องใส่คู่กับ --pack-launch
 * (รอบหลัง deploy / หลังถอยรุ่น ใส่จำนวนของรอบก่อน — สคริปต์พิมพ์ให้ท้ายผล — จำนวนลดลง = อ่านไม่ครบ หรือเลขแพ็คหาย)
 * @returns `{ beforeMigration, floors, problems, packLaunch, auditSince }` — problems ไม่ว่าง = ตัวเลือกผิด ผู้เรียกต้องหยุด (ไม่เดาแทน)
 *   · `packLaunch` / `auditSince` = ISO แบบ UTC ที่แปลงแล้ว หรือ null เมื่อไม่ได้ใส่
 */
export function parseParityArgs(argv = []) {
  const floors = {};
  const problems = [];
  let beforeMigration = false;
  /* เวลา: ต้องมีวันที่ เวลา และเขตเวลาครบ — "2026-10-12" เฉย ๆ ตีความได้สองแบบ (เที่ยงคืน UTC / เที่ยงคืนไทย) ต่างกัน 7 ชั่วโมงของการบันทึก */
  const TIMES = { '--pack-launch': 'packLaunch', '--audit-since': 'auditSince' };
  const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2})$/;
  const times = { packLaunch: null, auditSince: null };
  const PAIRS = {
    '--expect-min-lines': ['quotationLines', 'salesOrderLines'],
    '--expect-min-fingerprints': ['quotationFingerprints', 'salesOrderFingerprints'],
    '--expect-min-packed': ['packedQuotationLines', 'packedSalesOrderLines'],
  };
  for (const arg of argv) {
    if (arg === '--before-migration') { beforeMigration = true; continue; }
    const at = String(arg).indexOf('=');
    const name = at < 0 ? String(arg) : String(arg).slice(0, at);
    if (Object.hasOwn(TIMES, name)) {
      const text = at < 0 ? '' : String(arg).slice(at + 1);
      const parsed = ISO_WITH_ZONE.test(text) ? Date.parse(text) : NaN;
      if (Number.isNaN(parsed)) { problems.push(`${name} ต้องเป็นเวลา ISO ที่มีเขตเวลา (เช่น 2026-10-12T03:00:00Z หรือ 2026-10-12T10:00:00+07:00) — ได้ "${arg}"`); continue; }
      times[TIMES[name]] = new Date(parsed).toISOString();
      continue;
    }
    const keys = PAIRS[name];
    if (!keys) { problems.push(`ไม่รู้จักตัวเลือก: ${arg}`); continue; }
    const parts = at < 0 ? [] : String(arg).slice(at + 1).split(',');
    if (parts.length !== 2 || !parts.every((part) => /^\d+$/.test(part))) {
      problems.push(`${name} ต้องเป็นจำนวนเต็มสองตัวคั่นด้วยจุลภาค (ใบเสนอราคา,ใบสั่งขาย) — ได้ "${arg}"`);
      continue;
    }
    keys.forEach((key, index) => { floors[key] = Number(parts[index]); });
  }
  if (times.auditSince && !times.packLaunch) problems.push('--audit-since ต้องใส่คู่กับ --pack-launch (วันเปิดช่องเป็นตัวตัดสินว่าใบไหนต้องมีเลขแพ็ค)');
  if (times.auditSince && times.packLaunch && Date.parse(times.auditSince) < Date.parse(times.packLaunch)) {
    problems.push('--audit-since ต้องไม่ก่อน --pack-launch (ก่อนวันเปิดช่องไม่มีเลขแพ็คให้หาย)');
  }
  return { beforeMigration, floors, problems, ...times };
}
