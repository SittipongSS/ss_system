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

/**
 * ตัวเลือกของสคริปต์ check-line-pack-parity
 *   --before-migration                   ฐานยังไม่มีคอลัมน์ packQty (อ่านด้วย select *)
 *   --expect-min-lines=<QT>,<SO>         ขั้นต่ำของบรรทัดใบเสนอราคา , บรรทัดใบสั่งขาย ที่ต้องอ่านได้
 *   --expect-min-fingerprints=<QT>,<SO>  ขั้นต่ำของลายนิ้วมือใบเสนอราคา , ใบสั่งขาย ที่ต้องเทียบได้
 * (รอบหลัง deploy ใส่จำนวนของรอบก่อน merge — สคริปต์พิมพ์ให้ท้ายผล — จำนวนลดลง = อ่านไม่ครบ)
 * @returns `{ beforeMigration, floors, problems }` — problems ไม่ว่าง = ตัวเลือกผิด ผู้เรียกต้องหยุด (ไม่เดาแทน)
 */
export function parseParityArgs(argv = []) {
  const floors = {};
  const problems = [];
  let beforeMigration = false;
  const PAIRS = {
    '--expect-min-lines': ['quotationLines', 'salesOrderLines'],
    '--expect-min-fingerprints': ['quotationFingerprints', 'salesOrderFingerprints'],
  };
  for (const arg of argv) {
    if (arg === '--before-migration') { beforeMigration = true; continue; }
    const at = String(arg).indexOf('=');
    const name = at < 0 ? String(arg) : String(arg).slice(0, at);
    const keys = PAIRS[name];
    if (!keys) { problems.push(`ไม่รู้จักตัวเลือก: ${arg}`); continue; }
    const parts = at < 0 ? [] : String(arg).slice(at + 1).split(',');
    if (parts.length !== 2 || !parts.every((part) => /^\d+$/.test(part))) {
      problems.push(`${name} ต้องเป็นจำนวนเต็มสองตัวคั่นด้วยจุลภาค (ใบเสนอราคา,ใบสั่งขาย) — ได้ "${arg}"`);
      continue;
    }
    keys.forEach((key, index) => { floors[key] = Number(parts[index]); });
  }
  return { beforeMigration, floors, problems };
}
