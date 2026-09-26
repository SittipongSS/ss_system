// ── ตัวตัดสินเดียวของการคีย์ใบสั่งขายย้อนหลัง — พรีวิวกับบันทึกจริงเรียกตัวนี้ตัวเดียว ─────
//
// 🐞 บทเรียน #1685: พรีวิวนำเข้าเคยบอก "จะสร้าง 145" แล้วสร้างได้ 0 เพราะพรีวิวกับตัวเขียนตัดสินคนละที่
//    ⇒ ไฟล์นี้บริสุทธิ์ (ไม่อ่านฐาน ไม่มีเวลาเครื่อง) รับของที่ server โหลดมาแล้วทาง `ctx`
//    แล้วคืนแผนก้อนเดียวที่ทั้งพรีวิวโชว์และ commit ส่งเข้า RPC (historicalServiceRpcArgs)
// ⚠️ RPC ของ 0374 (create/update_historical_sales_order) ตรวจซ้ำทุกข้อที่ตรวจในฐานได้ — ที่นี่มีไว้ให้ผู้คีย์ได้
//    ข้อความไทยรายช่องก่อนกดบันทึก ไม่ใช่ด่านเดียว
// ⭐ AE บังคับ (คำตอบข้อ 1): `ctx.owner` = ผลของ validateDealOwner (AE/Senior AE ที่ยังใช้งานอยู่)
//    · ทีมของดีลภาชนะ = ทีมตาม AE ที่เลือก
//
// ── รุ่นเดียว: v2 `planHistoricalServiceOrder` (มติเจ้าของ 22/09 · mig 0374) — ฟอร์มคีย์หน้าเต็ม ดูหัวข้อ v2 ข้างล่าง
//   · v1 ของโมดัลเดิม (0360 — จุดติดตั้งเป็นข้อความ · สวิตช์ยกเว้นด่านเงิน) ถูกลบแล้ว เส้นเขียนย้ายมารุ่นนี้ครบ
//   · ตัวตรวจงวดของทางคีย์งวดเพิ่ม (0360) ถูกลบพร้อมทางนั้น — งวดทั้งชุดมาจากฟอร์มคีย์ใบ (ตรวจในแผน v2)
import { isQuotableCustomer } from '@/lib/sales/dealCustomerAdopt';
import { customerSnapshotName } from '@/lib/master/customerName';
import { DEFAULT_SALE_UNIT } from '@/lib/master/units';
import { fmtDate, fmtMoney } from '@/lib/format';
import {
  QUOTE_DISCOUNT_TYPES, QUOTE_VAT_OPTIONS, inSalesEditScope, quoteLineMoney, quoteTotals, toMoney,
} from '@/lib/salesPlanning';
import { QUOTE_PRICE_FIELD } from '@/lib/sales/quoteLines';
import { ownerLockedToSelf } from '@/lib/sales/dealOwner';
import { EXTERNAL_DOC_KINDS } from '@/lib/sales/contracts';
import { SERVICE_ROUND_CATEGORY, lineIsServicePackage } from '@/lib/sales/serviceOrders';
import { bindTargetError } from '@/lib/service/intake';
import { termIsActive } from '@/lib/service/terms';
import { coverageContinuityErrors } from '@/lib/sales/paymentCoverage';
import {
  historicalDuplicateAckIssue, historicalDuplicateAckOf, historicalDuplicateMatches, historicalDuplicatesAcknowledged,
} from '@/lib/sales/historicalDuplicates';
import {
  DOC_DATE_MAX, DOC_DATE_MIN, HISTORICAL_DEAL_TITLE, HISTORICAL_REF_MAX, INSTALLATION_POINT_MAX,
  HISTORICAL_APPROVER_LABEL, INSTALLMENT_LABEL_MAX, INSTALLMENT_NOTE_MAX, OPENING_INSTALLMENT_KIND, OPENING_INSTALLMENT_LABEL,
  charLength,
} from '@/lib/sales/historicalOrders';

/* หมวดแพ็คเกจบริการ = SERVICE_ROUND_CATEGORY ของ lib/sales/serviceOrders.js (ส่งต่อ ไม่ประกาศซ้ำ)
   ⚠️ ไฟล์นั้นลาก lib/service/intake มาด้วย — รุ่น v2 ต้องใช้ bindTargetError ของ intake อยู่แล้ว จึงไม่มีเหตุให้แยก */
export const SERVICE_PACKAGE_CATEGORY = SERVICE_ROUND_CATEGORY;
/* ⭐ มติเจ้าของ 23/09: VAT ของใบย้อนหลัง = ตัวเลือกของใบเสนอราคาเป๊ะ ("รวม VAT แล้ว" 0 · "+ VAT 7% ท้ายใบ" 7)
   โหมด "ราคารวม VAT แล้ว — ถอด VAT 7%" ของรุ่น 0374 ถูกถอด: มันหารทุกบรรทัดด้วย 1.07 ⇒ ยอดบรรทัด ≠ จำนวน × ราคา
   ซึ่งใบเสนอราคาไม่มีวันเป็น · อ่านอัตราจากชุดตัวเลือกกลางตัวเดียว (ไม่สะกดเลขซ้ำ) */
export const HISTORICAL_VAT_RATES = Object.freeze(QUOTE_VAT_OPTIONS.map((option) => option.value));
const VAT_CHOICES_TEXT = QUOTE_VAT_OPTIONS.map((option) => `“${option.label}”`).join(' หรือ ');

/* ข้อความของช่องบังคับขั้น ① — ก้อนเดียวที่แผนตีกลับ และฟอร์มสะท้อนคำต่อคำ (`historicalWizardLocalIssues`)
   🐞 รีวิว 25/09: ช่องพวกนี้เคยมีแต่แผนตรวจ ⇒ ไฟล์สัญญา (ตรวจที่จอ) ตีกลับก่อน แล้วกดอีกรอบถึงเจอชนิดเอกสาร/วัน = เจอทีละข้อ
      ซึ่ง form-design-rules §2 ห้าม ⇒ จอถามครบในรอบเดียวด้วยคำเดียวกับที่แผนจะตอบ */
export const HISTORICAL_REQUIRED_MESSAGES = Object.freeze({
  customerId: 'ต้องเลือกลูกค้า',
  ownerId: 'ต้องเลือก AE ผู้รับผิดชอบ — ใบย้อนหลังต้องมี AE ที่ยังถือดีลได้เสมอ',
  docKind: 'ต้องเลือกชนิดเอกสารที่ใช้แทนสัญญา',
  startDate: 'ต้องระบุวันเริ่มสัญญา (ปี ค.ศ. 2000–2100)',
  endDate: 'ต้องระบุวันสิ้นสุดสัญญา (ปี ค.ศ. 2000–2100)',
});

/* ข้อความรายช่องของบรรทัดโซน — ก้อนเดียวที่แผนตีกลับ และเทสต์อ้าง */
export const HISTORICAL_LINE_MESSAGES = Object.freeze({
  staleForm: 'ฟอร์มรุ่นก่อน (แพ็ค · ยอดที่พิมพ์เอง) — โหลดหน้าใหม่ แล้วคีย์โซนนี้เป็น จำนวน × ราคา/หน่วย แบบใบเสนอราคา',
  qty: 'จำนวนต้องเป็นจำนวนเต็มมากกว่า 0',
  unpriced: 'แพ็คเกจนี้ยังไม่ตั้งราคาในฐานข้อมูลสินค้า — ตั้งราคาที่ทะเบียนสินค้าก่อน แล้วค่อยบันทึก',
  priceUnknown: 'อ่านราคาของแพ็คเกจจากฐานข้อมูลสินค้าไม่ได้ — ลองใหม่อีกครั้ง (ถ้ายังไม่ได้ แจ้งผู้ดูแลระบบ)',
  rounds: 'รอบบริการที่ขายไว้ต้องเป็นจำนวนเต็มมากกว่า 0',
});

/**
 * เงินของทั้งใบจากบรรทัดโซน — **สูตรของใบเสนอราคาทุกตัวอักษร** (quoteLineMoney ต่อบรรทัด · quoteTotals ทั้งใบ)
 * ⭐ ตัวเดียวที่แผน (server) และฟอร์ม (ยอดก่อนมีแผน) คิดเงิน ⇒ จอกับฐานพูดเลขเดียวกันโดยโครงสร้าง
 * ⭐ ส่วนลดท้ายใบ (มติเจ้าของ 25/09 — "ส่วนลดรายบรรทัด รายใบก็ควรครบ") = ช่อง "หัก ส่วนลด" ของใบเสนอราคา
 *   คิดจากยอดรวมหลังส่วนลดรายบรรทัด แล้ว VAT คิดจากยอดหลังหักส่วนลด (quoteTotals) · ผู้เรียกต้องตรวจจำนวน/ราคามาแล้ว
 * @param rows `[{ qty, unitPrice, discountType, discountValue }]`
 * @param discount `{ discountType, discountValue }` ของท้ายใบ — ไม่ส่ง = ไม่ลด
 * @returns `{ lines: [{ discountType, discountValue, gross, discountAmount, lineTotal }], subtotal, discountAmount, vatAmount, totalAmount }`
 */
export function historicalLinesMoney(rows = [], vatRate = 0, discount = {}) {
  const lines = (rows || []).map((row) => quoteLineMoney(row || {}));
  const discountType = QUOTE_DISCOUNT_TYPES.includes(discount?.discountType) ? discount.discountType : null;
  const totals = quoteTotals((rows || []).map((row, index) => ({
    qty: row?.qty,
    unitPrice: row?.unitPrice,
    discountType: lines[index].discountType,
    discountValue: lines[index].discountValue,
  })), { vatRate, discountType, discountValue: discountType ? discount.discountValue : 0 });
  return { lines, ...totals };
}

/* ข้อความของส่วนลดท้ายใบ — ก้อนเดียวที่แผนตีกลับ และเทสต์อ้าง */
export const HISTORICAL_DISCOUNT_MESSAGES = Object.freeze({
  type: 'ชนิดส่วนลดท้ายใบต้องเป็น “%” หรือ “บาท”',
  value: 'ส่วนลดท้ายใบต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป',
  percent: 'ส่วนลดท้ายใบแบบ % ใส่ได้ไม่เกิน 100',
});

/* ── ข้อความของสองช่องวันสัญญา — **ก้อนเดียวที่ทั้งแผนและฟอร์มอ่าน** ────────────────
   🐞 UAT 23/09: ช่อง "วันเริ่มสัญญา" ส่ง `max={todayIso}` ให้ `DateInput` ⇒ พิมพ์วันอนาคต
      แล้วค่าถูก **กลืนเงียบ ๆ** ตอนเบลอ (ตัวช่องไม่เรียก onChange เมื่อค่าหลุดขอบ) ผู้คีย์เห็น
      ช่องเด้งกลับค่าเดิมโดยไม่มีเหตุผลสักบรรทัด · ช่อง "วันสิ้นสุด" มีอาการเดียวกันจาก `min`
   ⇒ ฟอร์มเลิกใช้ขอบกลืนค่า แล้ว **โชว์กฎแทน** — แต่ข้อความต้องเป็นก้อนเดียวกับที่แผนตีกลับ
      ไม่งั้นจอกับ server พูดคนละคำเรื่องเดียวกัน (ฟอร์มอ่านผ่าน `historicalContractDateIssues`) */
export const CONTRACT_DATE_MESSAGES = Object.freeze({
  startAfterToday: 'วันเริ่มสัญญาต้องไม่เกินวันนี้ — ใบย้อนหลังคือสัญญาที่เริ่มไปแล้ว',
  endBeforeStart: 'วันสิ้นสุดสัญญาต้องไม่ก่อนวันเริ่ม',
  endBeforeToday: 'สัญญาที่สิ้นสุดไปแล้วยังไม่รับเข้าระบบ — คีย์ได้เฉพาะงานบริการที่ยังเดินอยู่ (มติข้อ 9)',
  /* ใบที่มีอยู่แล้ว (ร่าง/ตีกลับ) ข้ามวันสิ้นสุดระหว่างทาง = **คำเตือน ไม่ใช่ด่าน** — ดูกฎข้อ 9 ที่หัว v2 */
  endBeforeTodayEditing: 'สัญญาสิ้นสุดไปแล้ว — ใบนี้คีย์ค้างไว้ตั้งแต่ก่อนสิ้นสุด แก้แล้วส่งอนุมัติต่อได้ (มติข้อ 9 กันเฉพาะใบที่คีย์ใหม่)',
});

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

/* 🚫 ตัวแบ่งยอดตาม VAT (`splitHistoricalAmounts` — หารทุกบรรทัดด้วย 1.07 เมื่อ "ราคารวม VAT แล้ว") ถูกลบตามมติ 23/09
   ยอดบรรทัดของใบย้อนหลังต้องเป็น จำนวน × ราคา/หน่วย − ส่วนลด เหมือนใบเสนอราคา ⇒ ใช้ historicalLinesMoney แทน */


/* JSON ที่เรียงคีย์ทุกชั้น — ลายนิ้วมือต้องไม่ขึ้นกับลำดับคีย์ที่ client ส่งมา */
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}

/* ══ v2 · ใบย้อนหลังงานบริการ (มติเจ้าของ 22/09/2026 · mig 0374) ═══════════════════════════════════
   ⭐ ตัวตัดสินเดียวของฟอร์มคีย์หน้าเต็ม — พรีวิวทุกขั้น · บันทึกครั้งแรก (create) · แก้ใบร่าง/ตีกลับ (update)
      เรียกตัวนี้ตัวเดียวแล้วส่งแผนก้อนเดียวกันเข้า RPC (historicalServiceRpcArgs)
   ⭐ **ตัดสินเท่าฐานข้อต่อข้อ** — ข้อไหน RPC ของ 0374/0379 ตีกลับ ที่นี่ต้องตีกลับด้วย (พร้อมข้อความไทยรายช่อง):
        เอกสารแทนสัญญา  ↔ historical_so_check_contract     (ชนิด · เลขอ้างอิง ≤200 · วันเริ่ม ≤ วันสิ้นสุด · เริ่มไม่เกินวันนี้)
        โซน × แพ็คเกจ   ↔ historical_so_check_lines (0379)  (โซนของลูกค้าในใบ ยังใช้งาน · ไม่ซ้ำ · สินค้าหมวด 02-001 · จำนวนเต็ม
                                                          · ยอดบรรทัด = จำนวน × ราคา/หน่วย − ส่วนลด ตามสูตรใบเสนอราคา)
        ราคา/หน่วย     ↔ historical_so_write_children (0379) (ราคา = ราคาผลิตในทะเบียน ณ ตอนบันทึก · ยังไม่ตั้งราคา = ตีกลับ)
        งวด            ↔ historical_so_check_installments (งวดยกมา ≤1 · ผลรวม = ยอดใบ · ช่วงครอบต่อเนื่องเต็มสัญญา)
        ใบ ฿0          ↔ zero_value_note_required / zero_value_has_installments
   ⭐ **บรรทัดโซน = บรรทัดใบเสนอราคา** (มติเจ้าของ 23/09 — "3500 x 1 ชุด x 12 เดือน · ต้องไม่ต่างจากฟอร์มใบเสนอราคา"):
        จำนวน × ราคา/หน่วย − ส่วนลดรายการ = จำนวนเงิน · ราคามาจากทะเบียน (ค่าที่จอส่งมาไม่ถูกอ่าน) · หน่วยมาจากสินค้า
        · "1 ชุด 12 เดือน" = จำนวน 12 (แพ็คเกจ) × 3,500 = 42,000 เหมือนที่คีย์ในใบเสนอราคา
        🐞 ก่อนมติ: ช่อง "แพ็ค" + ยอดที่พิมพ์เอง + ปุ่มลัด "ราคา × แพ็ค × เดือน" ⇒ ผู้คีย์สามคนคีย์สามแบบ
           (1 × 42,000 · 12 × 3,500 · ปุ่มลัดเสนอ 3,500 × 12 × 12 = 504,000) — ถอดทั้งชุด
      ส่วนที่ฐานตรวจไม่ได้ (role/ทีมอยู่ใน Supabase Auth) ตัดสินที่นี่ที่เดียว แล้ว route เรียกตัวนี้ทั้งตอนพรีวิวและบันทึก:
        · AE / Senior AE คีย์ได้เฉพาะใบของตัวเอง (ownerLockedToSelf — ช่อง AE ล็อกเป็นตัวเอง)
        · ผู้คีย์ต้องแก้ **ดีลที่ใบจะเข้าไปอยู่จริง** ได้ (ดีลภาชนะของคู่ที่มีอยู่แล้ว หรือดีลใหม่ทีมตาม AE)
          🐞 validateDealOwner ตรวจแค่ว่าผู้คีย์กับ AE มีทีมร่วมกัน แต่ RPC ใช้ดีลภาชนะของคู่ที่มีอยู่แล้ว **ไม่ว่าทีมไหน**
             ⇒ ไม่ตรวจตรงนี้ = AC คีย์ร่างลงดีลทีมอื่นได้ แล้วเปิดแก้/ส่งใบของตัวเองไม่ได้อีกเลย (ร่างกำพร้า)
        · สัญญาต้องยังไม่สิ้นสุด (มติข้อ 9 — คีย์เฉพาะงานที่ยังเดินอยู่) — **ด่านของ "ใบใหม่" เท่านั้น** (`ctx.editing` เท็จ)
          ใบที่มีอยู่แล้ว (ร่าง/ตีกลับ) ตีกลับข้อนี้ไม่ได้ = ทางตัน: หน้ารายละเอียดไม่มีปุ่มยื่นอนุมัติของใบย้อนหลัง
          ทางเดียวคือฟอร์มคีย์ ซึ่งบันทึก (PATCH) ก่อนส่งเสมอ ⇒ ใบตีกลับที่ข้ามวันสิ้นสุดจะแก้ไม่ได้ ส่งไม่ได้ตลอดกาล
          เหลือทางออกแค่ทิ้งใบหรือพิมพ์วันสิ้นสุดปลอม (ซึ่งไหลต่อไปถึงวันหมดอายุสัญญาและรอบขายของโซน)
          ⇒ แก้ใบ = **คำเตือน** (endBeforeTodayEditing) · ฐานไม่ตรวจข้อนี้โดยเจตนาด้วยเหตุผลเดียวกัน (0374 §7a):
          ใบที่ค้างรออนุมัติข้ามวันสิ้นสุดต้องยังอนุมัติได้ · กฎที่เหลือ (ช่วงครอบเต็มสัญญา ฯลฯ) ยังตรวจเท่าเดิม
   ⚠️ บริสุทธิ์ — ไม่อ่านฐาน ไม่อ่านนาฬิกา · ของที่ตัวเขียน (historicalOrderCommit) โหลดมาเข้าทาง `ctx`
   ⚠️ ยอดคิดด้วยสูตรใบเสนอราคา (historicalLinesMoney) · ค่าที่ส่งเข้า RPC คือค่าที่ผ่านตัวนี้แล้ว ไม่ใช่ค่าดิบจากจอ */

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const MAX_INT4 = 2147483647; // serviceRounds เป็น integer ในฐาน — เกินนี้ cast แล้ว error
const dateText = (iso) => fmtDate(iso);
/* ยอดเงินที่จะส่งเข้าฐาน = ปัดสองตำแหน่งแล้ว ⇒ ตรวจ "มากกว่า 0 / ไม่ติดลบ" กับค่าหลังปัดเสมอ
   (ตรวจค่าดิบ = 0.004 ผ่านที่นี่แต่ฐานได้ 0 แล้วตีกลับ) · ตัวเลขไม่ได้ = NaN ให้ด่านจับ */
const money2 = (value) => {
  const number = toNumber(value);
  return Number.isFinite(number) ? round2(number) : Number.NaN;
};

/* ชื่อจุดบนบรรทัด = '<รหัสไซต์> <ชื่อไซต์> · <ชื่อโซน>' ตัด 200 — สูตรเดียวกับตัวเขียนบรรทัดของ 0374 (โชว์ในพรีวิว)
   ⭐ export ให้บรรทัดโซนของฟอร์ม (ขั้น ②) พูดชื่อจุดคำเดียวกับตารางฝั่งอ่านของขั้น ④ และหน้าใบสั่งขาย */
export function historicalZonePoint(zone, site) {
  const siteText = [text(site?.code), text(site?.name)].filter(Boolean).join(' ');
  return [...`${siteText} · ${text(zone?.name)}`].slice(0, INSTALLATION_POINT_MAX).join('').trim();
}

/* ของใน Map หรือ object ธรรมดา (route ส่งแบบไหนก็ได้) */
const pick = (source, key) => (source instanceof Map ? source.get(key) : source?.[key]) || null;

/**
 * @param input `{ customerId, ownerId, team, contract: { docKind, ref, startDate, endDate }, refs,
 *   vatRate, discountType, discountValue (ส่วนลดท้ายใบ), notes, zones: [{ zoneId, productId, qty, discountType, discountValue, rounds }],
 *   opening: null | { amount, coversTo, paidOn, note, evidence? },
 *   installments: [{ label, amount, dueDate, coversFrom, coversTo, note? }], acknowledgeDuplicates }`
 *   - โซนหนึ่งแถว = บรรทัดใบเสนอราคาหนึ่งบรรทัด: จำนวน · ส่วนลดรายการ (ไม่ลด/percent/amount) · รอบบริการที่ขายไว้
 *     ⚠️ **ไม่มีราคา/ยอดจากจอ** — ราคา/หน่วยอ่านจาก `ctx.products[].costPrice` (QUOTE_PRICE_FIELD) เสมอ
 *   - vatRate = ตัวเลือกของใบเสนอราคา (0 "รวม VAT แล้ว" · 7 "+ VAT 7% ท้ายใบ") · opening.coversFrom = วันเริ่มสัญญาเสมอ
 * @param ctx `{ actor, customer, owner, products, zones, sites, containerDeals, existingHistorical, liveTermsByZone,
 *   todayIso, selfOrderId, editing }`
 *   - products: สินค้าที่เลือก — ต้อง select `costPrice` มาด้วย (ไม่มีคีย์ = "อ่านราคาไม่ได้" ไม่ใช่ราคา 0)
 *   - actor: ผู้คีย์ `{ id, role, team, teams }` (user ของ route) · owner: ผลของ validateDealOwner
 *   - zones: แถว service_zones ของโซนที่เลือก (`id, siteId, name, code, isActive`) · sites: ไซต์ของโซนเหล่านั้น
 *     (`id, code, name, customerId, kind, isActive`) — หรือพก `zone.site` มาเองก็ได้
 *   - containerDeals: ดีลภาชนะทั้งหมดของลูกค้ารายนี้ (`id, code, title, ownerId, customerId, stage, line, projectId, team`)
 *     ⚠️ ต้องมี `team` — ด่านขอบเขตของผู้คีย์อ่านทีมของดีลที่ใบจะเข้าไปอยู่จากช่องนี้ (ไม่มี = AC/Senior AE ตีกลับทุกใบ)
 *   - existingHistorical: ใบย้อนหลังทั้งหมดของลูกค้ารายนี้ (`id, orderNumber, orderDate, status, historical*Ref`)
 *   - liveTermsByZone: Map|object zoneId → `[{ term, order }]` (order: `id, orderNumber, status, supersededById`)
 *   - selfOrderId: id ของใบนี้ (แก้ใบ) หรือ id ที่ RPC จะออกให้รหัสการคีย์นี้ (สร้าง) — ไม่นับเป็นใบซ้ำ/รอบขายของใบอื่น
 *   - editing: กำลังแก้ใบที่มีอยู่แล้ว (PATCH) หรือไม่ — ข้อเดียวที่ต่าง: สัญญาสิ้นสุดไปแล้ว = คำเตือน ไม่ใช่ error (มติข้อ 9)
 *     ⚠️ ดูจาก `selfOrderId` แทนไม่ได้ — ตอนสร้างก็มีค่า (id ที่ RPC จะออกให้รหัสการคีย์นี้)
 * @returns {{ header, contract, lines, opening, installments, deal, duplicates, acknowledgeDuplicates, liveTerms,
 *   check, zeroValue, warnings, errors }}
 */
export function planHistoricalServiceOrder(input = {}, ctx = {}) {
  const body = isPlainObject(input) ? input : {};
  const {
    actor = null, customer = null, owner = null, products = [], zones = [], sites = [], containerDeals = [],
    existingHistorical = [], liveTermsByZone = null, todayIso = null, selfOrderId = null, editing = false,
  } = ctx || {};
  const errors = [];
  const warnings = [];
  /* ⭐ มติ 25/09 (รื้อขั้น ④): คำเตือนมีหัวข้อกำกับ (`warningItems`) ⇒ ขั้น ④ รวมเป็นกลุ่มในแถวของมันได้ (เคยขึ้นทีละบรรทัด 10 ข้อ)
     โดยไม่ต้องแกะข้อความ · `warnings` (สตริงล้วน) คงเดิมทุกตัวอักษร — ผู้อ่านเดิม (หน้าใบ · commit) ไม่ขยับ
     ⚠️ ไม่เข้าอาร์กิวเมนต์ของ RPC (historicalServiceRpcArgs เลือกทีละช่อง) ⇒ ลายนิ้วมือของคำขอไม่เปลี่ยน */
  const warningItems = [];
  const warn = (topic, message, data = {}) => { warnings.push(message); warningItems.push({ topic, text: message, ...data }); };
  const err = (field, message) => errors.push({ field, message });
  const today = isCalendarDate(todayIso) ? todayIso : null;
  // ไม่รู้วันนี้ = ตัดสินข้อ "ไม่เกินวันนี้" ไม่ได้ ⇒ ไม่ปล่อยผ่าน (ผู้เรียกลืมส่ง businessDate())
  if (!today) err('todayIso', 'ตรวจวันที่ไม่ได้ — ระบบไม่รู้วันนี้ (แจ้งผู้ดูแลระบบ)');

  // ── ลูกค้า ───────────────────────────────────────────────────────────
  const customerId = text(body.customerId);
  if (!customerId) err('customerId', HISTORICAL_REQUIRED_MESSAGES.customerId);
  else if (!customer?.id) err('customerId', 'ไม่พบลูกค้า');
  else if (!isQuotableCustomer(customer)) err('customerId', 'ลูกค้ารายนี้ยังไม่อนุมัติหรือถูกพักใช้ — ออกใบไม่ได้');
  const customerName = customer?.id ? customerSnapshotName(customer) : null;

  // ── AE (คำตอบข้อ 1: บังคับ) + สิทธิ์ของผู้คีย์ต่อคู่นี้ ─────────────────────────
  const ownerId = text(body.ownerId);
  const actorId = text(actor?.id);
  let ownerName = null;
  let team = null;
  let ownerOk = false;
  if (!actorId) {
    err('ownerId', 'ตรวจสิทธิ์ผู้คีย์ไม่สำเร็จ — ลองใหม่อีกครั้ง');
  } else if (!ownerId) {
    err('ownerId', HISTORICAL_REQUIRED_MESSAGES.ownerId);
  } else if (ownerLockedToSelf(actor?.role) && ownerId !== actorId) {
    // form-design-rules §2: AE / Senior AE เป็นเจ้าของงานของตัวเอง — ช่องนี้ล็อกเป็นตัวเองบนจอ
    err('ownerId', 'AE / Senior AE คีย์ใบย้อนหลังได้เฉพาะของตัวเอง — ใบของ AE คนอื่นให้ AC ของทีมหรือ AE Sup คีย์');
  } else if (!owner) {
    err('ownerId', 'ตรวจ AE ผู้รับผิดชอบไม่สำเร็จ — ลองใหม่อีกครั้ง');
  } else if (!owner.ok) {
    err('ownerId', owner.error || 'AE ที่เลือกถือดีลไม่ได้');
  } else {
    ownerName = owner.ownerName || null;
    team = text(owner.team) || null;
    ownerOk = true;
  }

  // ── ดีลภาชนะของคู่ (ลูกค้า × AE) = ดีลที่ใบจะเข้าไปอยู่จริง ─────────────────────────
  let deal = { id: null, code: null, title: HISTORICAL_DEAL_TITLE(customerName), team, willCreate: true };
  const found = ownerId
    ? (containerDeals || []).find((d) => String(d?.ownerId || '') === ownerId && (!d.customerId || d.customerId === customerId))
    : null;
  if (found) {
    deal = { id: found.id, code: found.code || null, title: found.title || null, team: text(found.team) || null, willCreate: false };
    if (found.stage !== 'won' || found.line !== 'SERVICE' || found.projectId) {
      err('deal', `ดีลของใบย้อนหลัง ${found.code || found.id} ไม่อยู่ในสภาพที่ผูกใบได้ (ต้อง Won · สายบริการ · ไม่มีโครงการ) — แจ้งผู้ดูแลระบบ`);
    }
  }
  if (ownerOk && !found && !team) {
    err('ownerId', 'AE คนนี้ยังไม่มีทีม — ตั้งทีมที่หน้าจัดทีมก่อน จึงสร้างดีลของใบย้อนหลังได้ (ทีมตามดีล)');
  } else if (ownerOk && !inSalesEditScope(actor, { team: deal.team, ownerId: found ? found.ownerId : ownerId })) {
    err('ownerId', `ดีลของคู่ลูกค้า×AE นี้อยู่ทีม ${deal.team || '—'} ซึ่งคุณไม่ได้ดูแล — ให้หัวหน้าทีมนั้นหรือ AE Sup คีย์`);
  }

  // ── เอกสารแทนสัญญา (มติ 22/09 ข้อ 3 — กรอกในฟอร์ม) ────────────────────────────────
  const rawContract = isPlainObject(body.contract) ? body.contract : {};
  const docKind = text(rawContract.docKind) || null;
  if (!docKind) err('contract.docKind', HISTORICAL_REQUIRED_MESSAGES.docKind);
  else if (!EXTERNAL_DOC_KINDS.includes(docKind)) err('contract.docKind', 'ชนิดเอกสารแทนสัญญาไม่ถูกต้อง');
  const contractRef = text(rawContract.ref) || null;
  if (contractRef && charLength(contractRef) > HISTORICAL_REF_MAX) {
    err('contract.ref', `เลขที่เอกสารแทนสัญญายาวเกิน ${HISTORICAL_REF_MAX} ตัวอักษร`);
  }
  const startDate = text(rawContract.startDate);
  const endDate = text(rawContract.endDate);
  const startOk = inDocRange(startDate);
  const endOk = inDocRange(endDate);
  if (!startOk) err('contract.startDate', HISTORICAL_REQUIRED_MESSAGES.startDate);
  else if (today && startDate > today) err('contract.startDate', CONTRACT_DATE_MESSAGES.startAfterToday);
  if (!endOk) err('contract.endDate', HISTORICAL_REQUIRED_MESSAGES.endDate);
  else if (startOk && endDate < startDate) err('contract.endDate', CONTRACT_DATE_MESSAGES.endBeforeStart);
  /* มติข้อ 9 กันที่ "ประตูเข้า" ไม่ใช่ที่ใบที่เข้ามาแล้ว — ใบใหม่ตีกลับ · ใบที่มีอยู่แล้วเตือนอย่างเดียว
     (ทางตันที่กันอยู่: ใบร่าง/ตีกลับต้องผ่านฟอร์มคีย์ ซึ่ง PATCH ก่อนส่งเสมอ — ดูกฎข้อ 9 ที่หัว v2) */
  else if (today && endDate < today) {
    if (editing) warn('contractEnded', CONTRACT_DATE_MESSAGES.endBeforeTodayEditing);
    else err('contract.endDate', CONTRACT_DATE_MESSAGES.endBeforeToday);
  }
  const contractOk = startOk && endOk && startDate <= endDate;
  const contract = { docKind, ref: contractRef, startDate: startOk ? startDate : null, endDate: endOk ? endDate : null };

  // ── เลขเอกสารเดิม · หมายเหตุ ───────────────────────────────────────────
  const rawRefs = isPlainObject(body.refs) ? body.refs : {};
  const refs = { quote: text(rawRefs.quote) || null, express: text(rawRefs.express) || null, invoice: text(rawRefs.invoice) || null };
  for (const [key, label] of [['quote', 'ใบเสนอราคาเดิม'], ['express', 'เลขเอกสาร Express'], ['invoice', 'ใบกำกับเดิม']]) {
    if (refs[key] && charLength(refs[key]) > HISTORICAL_REF_MAX) err(`refs.${key}`, `${label}ยาวเกิน ${HISTORICAL_REF_MAX} ตัวอักษร`);
  }
  const notes = text(body.notes) || null;

  // ── VAT — ตัวเลือกของใบเสนอราคา · ไม่มีค่าตั้งต้น (กฎฟอร์ม: สิ่งที่เป็นการตัดสินใจห้ามเติมเอง) ────────
  let vatRate = null;
  if (body.amountsIncludeVat === true) {
    /* 🪤 แท็บที่เปิดค้างจากรุ่นก่อน 23/09 ยังส่งโหมด "ราคารวม VAT แล้ว — ถอด VAT 7%" มาได้ — ห้ามตีความเงียบ ๆ
       (ตีเป็น 7% = ยอดใบบวก VAT ซ้ำบนราคาที่รวม VAT แล้ว · ตีเป็น 0 = ยอดคนละก้อนกับที่ผู้คีย์เห็น) */
    err('vatRate', `โหมด “ราคารวม VAT แล้ว — ถอด VAT” เลิกใช้แล้ว (ฟอร์มรุ่นก่อน) — โหลดหน้าใหม่ แล้วเลือก ${VAT_CHOICES_TEXT} แบบใบเสนอราคา`);
  } else if (body.vatRate === undefined || body.vatRate === null || body.vatRate === '') {
    err('vatRate', `ต้องเลือก VAT ของใบ — ${VAT_CHOICES_TEXT} (ตัวเลือกเดียวกับใบเสนอราคา)`);
  } else if (!HISTORICAL_VAT_RATES.includes(Number(body.vatRate))) {
    err('vatRate', `VAT ของใบต้องเป็น ${VAT_CHOICES_TEXT}`);
  } else {
    vatRate = Number(body.vatRate);
  }
  const vatOk = vatRate !== null;

  // ── ส่วนลดท้ายใบ — ช่อง "หัก ส่วนลด" ของกล่องสรุปใบเสนอราคา (มติเจ้าของ 25/09) ─────────────
  //   ⚠️ ฐาน (0374) ตรวจแค่ว่ายอดหัวใบลงตัว (ยอดรวม − ส่วนลด + VAT = ยอดทั้งสิ้น) ไม่ได้ตรวจสูตร %/บาท
  //      ⇒ ที่นี่คือด่านของสูตร · ชนิด/ค่าเก็บใน metadata.historicalIntake คู่กับ VAT (คอลัมน์มีแค่ discountAmount)
  //   ⚠️ เลือกชนิดแล้วเว้นค่าว่าง = ไม่ลด (0) ไม่ใช่ error — ศูนย์ไม่ใช่การตัดสินใจที่ต้องบังคับให้พิมพ์
  let discountType = null;
  let discountValue = 0;
  let discountOk = true;
  const rawDiscountType = body.discountType;
  if (rawDiscountType !== undefined && rawDiscountType !== null && rawDiscountType !== '') {
    const rawValue = text(body.discountValue);
    const value = rawValue === '' ? 0 : toNumber(rawValue);
    if (!QUOTE_DISCOUNT_TYPES.includes(rawDiscountType)) {
      err('discount', HISTORICAL_DISCOUNT_MESSAGES.type);
      discountOk = false;
    } else if (!Number.isFinite(value) || value < 0) {
      err('discount', HISTORICAL_DISCOUNT_MESSAGES.value);
      discountOk = false;
    } else if (rawDiscountType === 'percent' && value > 100) {
      err('discount', HISTORICAL_DISCOUNT_MESSAGES.percent);
      discountOk = false;
    } else {
      discountType = rawDiscountType;
      discountValue = round2(value);
    }
  }

  // ── โซนจากทะเบียน × แพ็คเกจ (มติ 22/09 ข้อ 1 — หนึ่งโซน = หนึ่งบรรทัด) ───────────────────
  const productsById = new Map((products || []).map((p) => [p?.id, p]));
  const zonesById = new Map((zones || []).map((z) => [z?.id, z]));
  const sitesById = new Map((sites || []).map((s) => [s?.id, s]));
  const rawZones = Array.isArray(body.zones) ? body.zones : [];
  if (!rawZones.length) err('zones', 'ต้องมีรายการอย่างน้อย 1 บรรทัด — กด “เพิ่มรายการ” หรือ “เพิ่มหลายโซน” แล้วเลือกไซต์ · โซนจากทะเบียนของลูกค้า');
  const seenZones = new Set();
  const draftLines = [];
  const liveTerms = [];
  let linesMoneyOk = rawZones.length > 0;
  rawZones.forEach((row, index) => {
    const n = index + 1;
    const field = `zones.${index}`;
    if (!isPlainObject(row)) { err(field, `รายการ ${n}: รูปแบบไม่ถูกต้อง`); linesMoneyOk = false; return; }
    const zoneId = text(row.zoneId);
    const zone = zoneId ? zonesById.get(zoneId) || null : null;
    const site = zone ? sitesById.get(zone.siteId) || zone.site || null : null;
    /* ⭐ ป้ายของบรรทัด = เลขบรรทัดที่ตาเห็นในคอลัมน์ "#" ของตาราง (+ ชื่อโซนเมื่อรู้แล้ว) — มติ 25/09 ขั้น ② เป็นตาราง
       แบบใบเสนอราคา ⇒ "โซน Lobby: …" หาไม่เจอบนจอที่เลือกโซนในบรรทัด · error ชี้ **ช่อง** ด้วย (`zones.<i>.<ช่อง>`)
       ให้จอวางข้อความใต้ช่องนั้นช่องเดียว · `detail` = ข้อความไม่มีป้ายบรรทัด (ของใต้ช่อง — ป้ายซ้ำกับแถวที่มันอยู่) */
    const label = zone ? `รายการ ${n} (${text(zone.name) || zone.id})` : `รายการ ${n}`;
    const push = (message, sub = null) => errors.push({
      field: sub ? `${field}.${sub}` : field,
      message: `${label}: ${message}`,
      detail: message,
    });

    if (!zoneId) {
      push('ต้องเลือกไซต์ · โซนจากทะเบียนไซต์ของลูกค้า — ห้ามพิมพ์ชื่อจุดเอง', 'zoneId');
    } else {
      if (seenZones.has(zoneId)) push('เลือกโซนนี้ซ้ำ — หนึ่งโซนเป็นหนึ่งบรรทัดของใบ', 'zoneId');
      seenZones.add(zoneId);
      if (customerId) {
        /* ด่านเดียวกับที่ TS ผูกโซน (bindTargetError) · ฐานต้องการ isActive = true จริง ⇒ ค่าที่ไม่ใช่ true
           (ไม่ได้ select มา) นับเป็นปิดใช้งาน ไม่ใช่เดาว่าใช้งานอยู่ */
        const problem = bindTargetError({
          order: { customerId },
          zone: zone ? { ...zone, isActive: zone.isActive === true } : null,
          site: site ? { ...site, isActive: site.isActive === true } : null,
        });
        if (problem) push(problem, 'zoneId');
      }
    }

    const productId = text(row.productId);
    const product = productId ? productsById.get(productId) || null : null;
    if (!productId) push('ต้องเลือกแพ็คเกจบริการ', 'productId');
    else if (!product) push('ไม่พบแพ็คเกจที่เลือกในทะเบียนสินค้า', 'productId');
    else if (!lineIsServicePackage(product)) {
      push(`${product.fgCode || 'สินค้านี้'} ไม่ใช่แพ็คเกจบริการ (หมวด ${SERVICE_ROUND_CATEGORY}) — ใบย้อนหลังคีย์ได้เฉพาะแพ็คเกจบริการ`, 'productId');
    }

    /* ── บรรทัดแบบใบเสนอราคา: จำนวน × ราคา/หน่วย (ทะเบียน) − ส่วนลดรายการ (มติเจ้าของ 23/09) ──
       🪤 แท็บรุ่นก่อนส่ง `packs` + `lineAmount` (ยอดที่พิมพ์เอง) — ห้ามเดาว่า packs คือจำนวน
          (1 แพ็ค × 12 เดือน เคยถูกคีย์ทั้งเป็น 1 และ 12) ⇒ ตีกลับให้โหลดหน้าใหม่ */
    const staleForm = row.qty === undefined && (has(row, 'packs') || has(row, 'lineAmount'));
    if (staleForm) { push(HISTORICAL_LINE_MESSAGES.staleForm); linesMoneyOk = false; }
    /* จำนวนว่าง = ตีกลับ ไม่ใช่ 1 (ใบเสนอราคานับว่างเป็น 1) — การเดาจำนวนแทนผู้คีย์คือบั๊กที่มติ 23/09 แก้ */
    const qty = toNumber(row.qty);
    const qtyOk = Number.isInteger(qty) && qty > 0;
    if (!staleForm && !qtyOk) { push(HISTORICAL_LINE_MESSAGES.qty, 'qty'); linesMoneyOk = false; }
    /* ราคา/หน่วย = ราคาผลิตในทะเบียนเสมอ (QUOTE_PRICE_FIELD — ตัวเดียวกับใบเสนอราคา) · ค่าที่จอส่งมาไม่ถูกอ่าน
       ⚠️ ต่างจากใบเสนอราคาข้อเดียว: ใบนั้นคงราคาเดิมเมื่อทะเบียนยังไม่ตั้งราคา แล้วไปตีกลับตอนส่ง ·
          ใบนี้บันทึกกับส่งอนุมัติในจังหวะเดียว ⇒ ยังไม่ตั้งราคา = ตีกลับตั้งแต่ตอนนี้ (ฐานตีกลับด้วย — 0379) */
    let unitPrice = 0;
    let priceOk = false;
    if (product && lineIsServicePackage(product)) {
      if (!has(product, QUOTE_PRICE_FIELD)) push(HISTORICAL_LINE_MESSAGES.priceUnknown, 'productId');
      else if (toMoney(product[QUOTE_PRICE_FIELD]) <= 0) push(HISTORICAL_LINE_MESSAGES.unpriced, 'productId');
      else { unitPrice = toMoney(product[QUOTE_PRICE_FIELD]); priceOk = true; }
    }
    if (!priceOk) linesMoneyOk = false;
    let serviceRounds = null;
    if (text(row.rounds)) {
      const rounds = Number(row.rounds);
      if (!Number.isInteger(rounds) || rounds <= 0 || rounds > MAX_INT4) push(HISTORICAL_LINE_MESSAGES.rounds, 'rounds');
      else serviceRounds = rounds;
    }

    // รอบขายที่ยังมีผลของใบอื่นบนโซนเดียวกัน — เตือน ไม่บล็อก (ต่อสัญญาช่วงคาบเกี่ยวเป็นเรื่องปกติ · AE Sup ตัดสิน)
    const seenOrders = new Set();
    for (const entry of (zoneId ? pick(liveTermsByZone, zoneId) || [] : [])) {
      const term = entry?.term || null;
      const order = entry?.order || null;
      if (!term || !order?.id || order.id === selfOrderId || seenOrders.has(order.id)) continue;
      if (!today || !termIsActive(term, order, today)) continue;
      seenOrders.add(order.id);
      const orderNumber = order.orderNumber || order.id;
      const until = term.endDate ? dateText(term.endDate) : 'ไม่ระบุวันสิ้นสุด';
      liveTerms.push({ zoneId, index, orderId: order.id, orderNumber, endDate: term.endDate || null });
      warn('liveTerm', `${label}: โซนนี้มีรอบขายของ ${orderNumber} อยู่แล้ว (ถึง ${until}) — ตรวจว่าไม่ซ้ำสัญญา`,
        { index, orderNumber, endDate: term.endDate || null });
    }

    draftLines.push({
      zoneId: zoneId || null,
      zoneName: zone ? text(zone.name) || null : null,
      zoneCode: zone ? text(zone.code) || null : null,
      siteId: site?.id || null,
      siteName: site ? text(site.name) || null : null,
      siteCode: site ? text(site.code) || null : null,
      installationPoint: zone && site ? historicalZonePoint(zone, site) : null,
      productId: productId || null,
      fgCode: product?.fgCode || null,
      description: text(product?.productDescription) || null,
      unit: text(product?.saleUnit) || DEFAULT_SALE_UNIT,
      qty: qtyOk ? qty : null,
      unitPrice,
      // ส่วนลดรายการตามที่จอส่ง — ทำให้เป็นค่าที่บันทึกได้จริงตอนคิดเงิน (quoteLineMoney) ข้างล่าง
      rawDiscountType: row.discountType ?? null,
      rawDiscountValue: row.discountValue ?? 0,
      serviceRounds,
    });
  });

  // ── เงิน — สูตรใบเสนอราคา (historicalLinesMoney) · ส่วนลดรายบรรทัด + ส่วนลดท้ายใบ (มติ 25/09) ─────────
  const moneyOk = linesMoneyOk && vatOk && discountOk && draftLines.length > 0;
  const money = moneyOk
    ? historicalLinesMoney(draftLines.map((line) => ({
      qty: line.qty, unitPrice: line.unitPrice, discountType: line.rawDiscountType, discountValue: line.rawDiscountValue,
    })), vatRate, { discountType, discountValue })
    : null;
  const lines = draftLines.map(({ rawDiscountType, rawDiscountValue, ...line }, index) => {
    const m = money?.lines[index] || null;
    /* แผนที่เงินยังไม่ผ่านด่าน = ศูนย์ทั้งก้อน (เหมือนเดิม) · ส่วนลดคงรูปที่บันทึกได้ไว้ให้พรีวิวเห็น */
    const discount = m || quoteLineMoney({ qty: 0, unitPrice: 0, discountType: rawDiscountType, discountValue: rawDiscountValue });
    return {
      ...line,
      discountType: discount.discountType,
      discountValue: discount.discountValue,
      discountAmount: m ? m.discountAmount : 0,
      lineTotal: m ? m.lineTotal : 0,
    };
  });
  const totalAmount = money ? money.totalAmount : 0;
  const subtotal = money ? money.subtotal : 0;
  const vatAmount = money ? money.vatAmount : 0;
  const zeroValue = moneyOk && totalAmount === 0;
  const header = {
    customerId: customerId || null,
    customerName,
    ownerId: ownerId || null,
    ownerName,
    team,
    // วันที่ใบ = วันเริ่มสัญญาจริง (มติข้อ 5 เดิม · RPC ตั้งเอง) · ภาษาเอกสารไทย (ใบย้อนหลังไม่พิมพ์)
    orderDate: contract.startDate,
    docLanguage: 'th',
    vatRate,
    // ส่วนลดท้ายใบ (มติ 25/09) — ชนิด/ค่าไปอยู่ใน metadata.historicalIntake · คอลัมน์เก็บแค่ยอด (discountAmount)
    discountType,
    discountValue: discountType ? discountValue : 0,
    notes,
    subtotal,
    // ยอดของส่วนลดท้ายใบ (ยอดบรรทัดหักส่วนลดรายบรรทัดไปแล้ว) — quoteTotals ตัวเดียวกับใบเสนอราคา
    discountAmount: money ? money.discountAmount : 0,
    vatAmount,
    totalAmount,
    actualAmount: Math.max(0, round2(totalAmount - vatAmount)),
    refs,
  };

  // ── งวดยกมา (มติ 22/09 ข้อ 2 — เงินที่เก็บแล้วก่อนเข้าระบบ บัญชีรับรองครั้งเดียว) ───────────────
  let opening = null;
  let rowDatesOk = true;
  if (body.opening !== undefined && body.opening !== null) {
    const raw = body.opening;
    if (!isPlainObject(raw)) {
      err('opening', 'รูปแบบงวดยกมาไม่ถูกต้อง');
      rowDatesOk = false;
    } else {
      const amount = money2(raw.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        err('opening.amount', 'ยอดที่เก็บแล้วต้องมากกว่า 0 — ถ้ายังไม่เคยเก็บเงิน ไม่ต้องมีงวดยกมา');
      }
      const coversTo = text(raw.coversTo);
      if (!inDocRange(coversTo)) {
        err('opening.coversTo', 'ต้องระบุว่าเงินที่เก็บแล้วครอบบริการถึงวันไหน');
        rowDatesOk = false;
      } else if (contractOk && (coversTo < startDate || coversTo > endDate)) {
        err('opening.coversTo', `ครอบบริการถึงต้องอยู่ในช่วงสัญญา ${dateText(startDate)}–${dateText(endDate)}`);
      }
      const paidOn = text(raw.paidOn);
      if (!isCalendarDate(paidOn) || paidOn < DOC_DATE_MIN) err('opening.paidOn', 'ต้องระบุวันที่รับเงินงวดยกมา');
      else if (today && paidOn > today) err('opening.paidOn', 'วันที่รับเงินงวดยกมาต้องไม่เกินวันนี้');
      const note = text(raw.note) || null;
      if (note && charLength(note) > INSTALLMENT_NOTE_MAX) err('opening.note', `หมายเหตุงวดยกมายาวเกิน ${INSTALLMENT_NOTE_MAX} ตัวอักษร`);
      opening = {
        kind: OPENING_INSTALLMENT_KIND,
        label: OPENING_INSTALLMENT_LABEL,
        amount,
        dueDate: null,                               // งวดยกมาไม่มีวันครบกำหนด (CHECK opening_shape)
        coversFrom: contract.startDate,              // เริ่มครอบ = วันเริ่มสัญญาเสมอ (ล็อกบนจอ)
        coversTo: coversTo || null,
        paidOn: paidOn || null,
        note,
        // ไฟล์อยู่ใต้โฟลเดอร์ของใบ ⇒ มีได้หลังใบเกิดแล้ว · route กรองอีกชั้นก่อนส่ง (เฉพาะทางแก้ใบ)
        evidence: Array.isArray(raw.evidence) ? raw.evidence : [],
      };
    }
  }

  // ── งวดที่ยังต้องเก็บ ─────────────────────────────────────────────────────
  const installments = [];
  if (body.installments !== undefined && body.installments !== null && !Array.isArray(body.installments)) {
    err('installments', 'รูปแบบงวดชำระไม่ถูกต้อง');
  }
  const rawRows = Array.isArray(body.installments) ? body.installments : [];
  /* ⭐ มติ 25/09 (รื้อขั้น ③): เลขงวดในข้อความ = **เลขงวดของใบ** (งวดยกมาเป็นงวดที่ 1 เมื่อมี — 0379 เรียงแบบนั้น) ⇒ ตรงกับ
     คอลัมน์ "งวด" ของตารางบนจอและหน้าใบสั่งขาย · ข้อความรายช่องชี้ `installments.<i>.<ช่อง>` + `detail` (ไม่มีป้ายงวด)
     แบบเดียวกับบรรทัดโซน ⇒ จอวาดใต้ช่องของแถวนั้นที่เดียว (ของเดิม `installments.<i>` ขึ้นเป็นก้อนเดียวไม่รู้ช่องไหน) */
  const seqBase = body.opening !== undefined && body.opening !== null ? 2 : 1;
  rawRows.forEach((row, index) => {
    const n = seqBase + index;
    const push = (slot, detail) => errors.push({ field: `installments.${index}.${slot}`, message: `งวดที่ ${n}: ${detail}`, detail });
    if (!isPlainObject(row)) { push('row', 'รูปแบบไม่ถูกต้อง'); rowDatesOk = false; installments.push(null); return; }
    const label = text(row.label);
    if (charLength(label) < 1 || charLength(label) > INSTALLMENT_LABEL_MAX) push('label', `ชื่องวดต้องมี 1–${INSTALLMENT_LABEL_MAX} ตัวอักษร`);
    const amount = money2(row.amount);
    if (!Number.isFinite(amount) || amount < 0) push('amount', 'ยอดต้องเป็นตัวเลขไม่ติดลบ');
    const dueDate = text(row.dueDate);
    if (!dueDate) push('dueDate', 'ต้องระบุวันครบกำหนด');
    else if (!inDocRange(dueDate)) push('dueDate', 'วันครบกำหนดต้องเป็นวันที่ระหว่างปี ค.ศ. 2000–2100');
    const coversFrom = text(row.coversFrom);
    const coversTo = text(row.coversTo);
    if (!coversFrom || !coversTo) { push('coversTo', 'ต้องระบุช่วงครอบบริการ ตั้งแต่–ถึง'); rowDatesOk = false; }
    else if (!inDocRange(coversFrom) || !inDocRange(coversTo)) { push('coversTo', 'ช่วงครอบบริการต้องเป็นวันที่ระหว่างปี ค.ศ. 2000–2100'); rowDatesOk = false; }
    else if (coversFrom > coversTo) { push('coversTo', 'วันเริ่มช่วงครอบต้องไม่เกินวันสิ้นสุด'); rowDatesOk = false; }
    const note = text(row.note) || null;
    if (note && charLength(note) > INSTALLMENT_NOTE_MAX) push('note', `หมายเหตุยาวเกิน ${INSTALLMENT_NOTE_MAX} ตัวอักษร`);
    if (today && isCalendarDate(dueDate) && dueDate < today) {
      warn('overdue', `งวดที่ ${n} (${label || '—'}) ครบกำหนดแล้ว (${dateText(dueDate)}) — หลัง${HISTORICAL_APPROVER_LABEL}อนุมัติจะขึ้นเลยกำหนดในทะเบียนบัญชีทันที และนัดบริการติดด่านเงินจนกว่าบัญชีรับรอง`, { seq: n, dueDate });
    }
    installments.push({
      kind: 'regular',
      label,
      amount,
      dueDate: dueDate || null,
      coversFrom: coversFrom || null,
      coversTo: coversTo || null,
      paidOn: null,
      note,
    });
  });

  // ── ผลรวมงวด = ยอดใบ · ใบ ฿0 ไม่มีงวด (ตัวตรวจงวดของ 0374) ─────────────────────────────
  const allRows = [...(opening ? [opening] : []), ...installments.filter(Boolean)];
  // ฐานนับทุกแถวที่ส่งไป (รวมแถวที่ผิดรูป) — นับจากของที่ส่งมา ไม่ใช่จากแถวที่ผ่าน
  const rowCount = (body.opening !== undefined && body.opening !== null ? 1 : 0) + rawRows.length;
  const sumSatang = allRows.reduce((s, row) => s + (Number.isFinite(row.amount) ? toSatang(row.amount) : 0), 0);
  const totalSatang = toSatang(totalAmount);
  let sumMatches = null;
  if (moneyOk) {
    if (zeroValue) {
      if (rowCount) err('installments', 'ใบยอด 0 บาทไม่มีงวด — ไม่มีเงินให้เก็บ (ด่านเงินของนัดบริการผ่านเองเมื่อยอดใบเป็น 0)');
      if (!notes) err('notes', 'ใบยอด 0 บาทต้องมีหมายเหตุบอกเหตุผล (มติข้อ 11)');
      sumMatches = rowCount === 0;
    } else if (!rowCount) {
      err('installments', 'ต้องมีงวดอย่างน้อย 1 งวด — งวดยกมา (เงินที่เก็บแล้ว) กับงวดที่ยังต้องเก็บ รวมกันต้องเท่ายอดใบ');
      sumMatches = false;
    } else {
      // ฐานยอมคลาดเคลื่อน 0.01 บาท (= 1 สตางค์)
      sumMatches = Math.abs(sumSatang - totalSatang) <= 1;
      if (!sumMatches) {
        const gap = sumSatang - totalSatang;
        err('installments', `ยอดงวดรวม ${fmtMoney(fromSatang(sumSatang))} ไม่เท่ากับยอดใบ ${fmtMoney(totalAmount)} — ${gap < 0 ? 'ขาด' : 'เกิน'} ${fmtMoney(fromSatang(Math.abs(gap)))}`);
      }
    }
  }

  // ── ช่วงครอบต่อเนื่องเต็มสัญญา (ลูปท้ายของตัวตรวจงวด · ตัวเดียวกับ coverageContinuityErrors) ─────────
  //   ฐานข้ามข้อนี้เมื่อไม่มีงวด (ใบ ฿0) · งวดที่ช่วงครอบใช้ไม่ได้รายงานรายงวดไปแล้วข้างบน
  let coverageErrors = [];
  if (contractOk && rowDatesOk && allRows.length) {
    coverageErrors = coverageContinuityErrors(allRows, { start: startDate, end: endDate });
    for (const gap of coverageErrors) {
      if (gap.kind === 'missing') continue;
      const row = gap.index === null ? null : allRows[gap.index];
      const isOpening = row?.kind === OPENING_INSTALLMENT_KIND;
      const regularIndex = isOpening || !row ? -1 : installments.indexOf(row);
      const field = isOpening ? 'opening.coversTo' : regularIndex >= 0 ? `installments.${regularIndex}.coverage` : 'installments';
      const who = isOpening ? OPENING_INSTALLMENT_LABEL : regularIndex >= 0 ? `งวดที่ ${seqBase + regularIndex}` : 'งวด';
      const range = `${dateText(gap.since)}–${dateText(gap.until)}`;
      const message = {
        start: gap.since === startDate
          ? `ช่วงบริการต้องเริ่มวันเริ่มสัญญา ${dateText(startDate)} — ยังไม่มีงวดครอบ ${range}`
          : `ช่วงครอบเริ่มก่อนวันเริ่มสัญญา (${range})`,
        gap: `ช่วงบริการขาดตอน ${range} — ต้องมีงวดครอบให้ต่อเนื่อง`,
        overlap: `ช่วงครอบซ้อนกับงวดก่อนหน้า ${range}`,
        end: gap.since > endDate
          ? `ช่วงครอบเกินวันสิ้นสุดสัญญา (${range})`
          : `ช่วงบริการยังไม่ถึงวันสิ้นสุดสัญญา ${dateText(endDate)} — ขาด ${range}`,
      }[gap.kind];
      if (regularIndex >= 0) errors.push({ field, message: `${who}: ${message}`, detail: message });
      else err(field, `${who}: ${message}`);
    }
  }
  const coverageContinuous = contractOk && rowDatesOk && allRows.length ? coverageErrors.length === 0 : null;

  // ── คำเตือนรวม ────────────────────────────────────────────────────────
  if (moneyOk && !zeroValue && !opening) {
    warn('noOpening', 'ไม่มีงวดยกมา — TS ตั้งรอบได้ แต่นัดบริการติดด่านเงินจนกว่าบัญชีรับรองงวดแรก');
  }

  // ── ใบที่อาจซ้ำ (ไม่ใช่ error — ต้องยืนยันก่อนบันทึก) · ไม่นับใบนี้เองและใบที่ยกเลิกแล้ว ─────────────
  /* ⭐ `matchedOn` (มติ 25/09 รื้อขั้น ④) — บอกว่าตรงกันที่ไหน · ตัวจับคู่ตัวเดียวกับที่หน้าใบตรวจซ้ำตอนผู้อนุมัติเปิด
     (`historicalDuplicateMatches` — มติ 26/09) ⇒ "ใบที่อาจซ้ำ" ของผู้คีย์กับของผู้อนุมัติเป็นกติกาเดียวกัน */
  const duplicates = historicalDuplicateMatches({
    rows: existingHistorical, selfOrderId, startDate: contract.startDate, refs,
  });
  /* ⭐ มติ 26/09: ยืนยันเป็นรายใบ (id ที่ผู้คีย์เห็น) + เหตุผลไม่บังคับ ≤500 — ยาวเกิน = error ของขั้น ④ */
  const duplicateAck = historicalDuplicateAckOf(body);
  if (duplicates.length) {
    const noteIssue = historicalDuplicateAckIssue(duplicateAck);
    if (noteIssue) err(noteIssue.field, noteIssue.message);
  }

  return {
    header,
    contract,
    lines,
    opening,
    installments: installments.filter(Boolean),
    deal,
    duplicates,
    /* ครบทุกใบที่อาจซ้ำ **ตอนนี้** (ใบที่ server เพิ่งพบแต่ผู้คีย์ไม่เคยเห็น = ยังไม่ครบ ⇒ 409) · ของที่บันทึกลงใบประกอบที่ route */
    acknowledgeDuplicates: historicalDuplicatesAcknowledged(duplicates, duplicateAck),
    duplicateAck,
    liveTerms,
    check: {
      installmentSum: fromSatang(sumSatang),
      sumMatches,
      coverageContinuous,
      coverageErrors,
    },
    zeroValue,
    warnings,
    warningItems,
    errors,
  };
}

/**
 * แผน v2 → อาร์กิวเมนต์ของ RPC (คีย์ตรงกับที่ 0374 อ่าน — เทสต์เทียบไฟล์ SQL)
 * @param mode 'create' | 'update'
 *   - create: ยังไม่มีหลักฐานงวดยกมา (ไฟล์ต้องอยู่ใต้โฟลเดอร์ของใบ ซึ่งยังไม่เกิด)
 *   - update: ส่งหลักฐานงวดยกมา **ทั้งชุดเสมอ** — ตัวเขียนของฐานเขียนงวดใหม่ทั้งชุด ไม่ส่ง = หลักฐานเดิมหาย
 * ⚠️ ไม่ส่งรหัส FG/คำอธิบาย/หน่วย — ฐานอ่านจากทะเบียนสินค้าเอง (ไม่รับจาก payload)
 * ⭐ บรรทัดส่งรูปเดียวกับบรรทัดใบเสนอราคาที่ถูกก๊อปลงใบสั่งขาย (0363): จำนวน · ราคา/หน่วย · ส่วนลด 3 ช่อง · ยอดบรรทัด
 *   ตัวเขียนของ 0379 บังคับให้มี discountAmount/discountValue และราคา = ราคาในทะเบียน ณ ตอนบันทึก
 * ⚠️ p_intake_key/p_intake_hash/p_actor_* /p_new_deal/p_expected_updated_at ประกอบที่ route (ต้องมีตัวตน/เวลา)
 */
export function historicalServiceRpcArgs(plan, mode = 'create') {
  if (mode !== 'create' && mode !== 'update') throw new Error(`historicalServiceRpcArgs: mode ต้องเป็น create หรือ update (ได้ ${mode})`);
  const { header, contract, lines, opening, installments } = plan;
  const rows = [
    ...(opening ? [{
      kind: OPENING_INSTALLMENT_KIND,
      label: OPENING_INSTALLMENT_LABEL,
      amount: opening.amount,
      dueDate: null,
      coversFrom: opening.coversFrom,
      coversTo: opening.coversTo,
      paidOn: opening.paidOn,
      note: opening.note,
      ...(mode === 'update' ? { evidence: Array.isArray(opening.evidence) ? opening.evidence : [] } : {}),
    }] : []),
    ...installments.map((row) => ({
      kind: 'regular',
      label: row.label,
      amount: row.amount,
      dueDate: row.dueDate,
      coversFrom: row.coversFrom,
      coversTo: row.coversTo,
      paidOn: null,
      note: row.note,
    })),
  ];
  return {
    p_header: {
      customerId: header.customerId,
      ownerId: header.ownerId,
      team: header.team,
      notes: header.notes,
      subtotal: header.subtotal,
      discountAmount: header.discountAmount,
      vatAmount: header.vatAmount,
      totalAmount: header.totalAmount,
      historicalQuoteRef: header.refs.quote,
      historicalExpressRef: header.refs.express,
      historicalInvoiceRef: header.refs.invoice,
      // ของที่คอลัมน์เก็บไม่ได้ แต่ฟอร์มแก้ต้องได้คืน (ตัวเลือก VAT · ชนิด/ค่าของส่วนลดท้ายใบ)
      // → sales_orders.metadata.historicalIntake (0374 เขียน `p_header->'intake'` ทั้งก้อน — ไม่ต้องแก้ฐาน)
      intake: { vatRate: header.vatRate, discountType: header.discountType, discountValue: header.discountValue },
    },
    p_lines: lines.map((line) => ({
      zoneId: line.zoneId,
      productId: line.productId,
      qty: line.qty,
      unitPrice: line.unitPrice,
      discountType: line.discountType,
      discountValue: line.discountValue,
      discountAmount: line.discountAmount,
      lineTotal: line.lineTotal,
      serviceRounds: line.serviceRounds,
    })),
    p_installments: rows,
    p_contract: {
      docKind: contract.docKind,
      ref: contract.ref,
      startDate: contract.startDate,
      endDate: contract.endDate,
    },
  };
}

/**
 * ต้นทางของลายนิ้วมือคำขอ (historicalIntakeHash) ของรุ่น v2 = อาร์กิวเมนต์ create ทั้งก้อน เรียงคีย์ทุกชั้น
 * ⇒ ครอบทุกค่าที่ลงฐานตอนสร้าง (ไม่มีหลักฐาน — ตอนสร้างยังไม่มีไฟล์) · ส่งซ้ำด้วยรหัสการคีย์เดิมแต่ต่างแม้ช่องเดียว
 *   = RPC ตอบ intake_key_conflict · แฮชทำฝั่ง server
 */
export function historicalServiceFingerprintSource(plan) {
  return stableStringify(historicalServiceRpcArgs(plan, 'create'));
}
