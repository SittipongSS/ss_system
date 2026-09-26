// ── ตัวตัดสินฝั่งจอของฟอร์มคีย์ใบสั่งขายย้อนหลัง (หน้าเต็ม 4 ขั้น · มติเจ้าของ 22/09 · mig 0374) ─────
//
// ⭐ คู่แฝดของ `historicalOrderPlan.js` ฝั่ง server: ไฟล์นี้ **บริสุทธิ์ ไม่มี React ไม่ยิง API**
//    รับ state ของฟอร์มแล้วคืน (ก) body ที่ส่งขึ้น API (ข) ขั้นที่ error แต่ละช่องสังกัด
//    (ค) ลำดับการบันทึกทีละจังหวะ (ง) ทางออกของแต่ละรหัสตอนบันทึกไม่สำเร็จ
//    ⇒ ทดสอบได้โดยไม่ต้องเรนเดอร์อะไรเลย (ชุดเทสต์ของรีโปนี้ไม่มีตัวเรนเดอร์ React)
//
// 🔴 **ไม่มีกฎตรวจข้อมูลชุดที่สองที่นี่** — ด่านจริงคือ `planHistoricalServiceOrder` + RPC ของ 0374
//    ข้อความไทยรายช่องมาจากพรีวิวเสมอ (`errors[{ field, message }]`) · ที่นี่แค่จัดว่า
//    ช่องไหนอยู่ขั้นไหน แล้วพาผู้คีย์กลับไปที่ขั้นนั้น
//
// ⚠️ ข้อยกเว้นเดียว — **ของที่ server มองไม่เห็นตอนพรีวิว** (`historicalWizardLocalIssues`):
//      · VAT ของใบที่ยังไม่เลือก (กฎบ้าน "ไม่มีค่าตั้งต้นให้กับสิ่งที่เป็นการตัดสินใจ") — ตัวเลือกของใบเสนอราคา
//        ⭐ มติเจ้าของ 25/09: ช่อง VAT ย้ายจากขั้น ① ลงกล่องสรุปท้ายตารางรายการ (ขั้น ②) แบบใบเสนอราคา ⇒ ข้อนี้สังกัดขั้น ②
//      · ทีมของดีล เมื่อ **เลือกได้จริง** ตั้งแต่ 2 ทีม (`historicalTeamField`)
//      · **ไฟล์ที่ยังอยู่ในเครื่อง** — เอกสารแทนสัญญาและหลักฐานงวดยกมาอัปได้หลังใบเกิดแล้ว
//        ⇒ พรีวิวไม่มีทางรู้ว่าผู้คีย์แนบหรือยัง แต่ RPC ส่งอนุมัติตีกลับทั้งสองข้อ
//        (`historical_so_contract_file_missing` · `historical_so_opening_evidence_missing`)
//        ⇒ ถามตั้งแต่บนฟอร์ม ไม่ใช่ปล่อยไปตายที่จังหวะสุดท้ายของการบันทึก
//      · เคยเก็บเงินไปแล้วหรือยัง (งวดยกมา) — คำถามที่ไม่มีคำตอบตั้งต้น
//      · **สองช่องวันสัญญา** — ไม่ใช่กฎชุดที่สอง แต่เป็น *กระจก* ของแผน: ข้อความมาจาก
//        `CONTRACT_DATE_MESSAGES` ของ `historicalOrderPlan` ก้อนเดียวกับที่ตีกลับ
//        (เหตุผลที่ต้องมีกระจก อยู่ที่หัว `historicalContractDateIssues`)
//
// 🔴 **กฎเหล็กของข้อยกเว้นชุดนี้ (รีวิว S8): ถามได้เฉพาะข้อที่ "มีช่องให้ตอบอยู่บนจอจริง"**
//    ทั้งสองข้อที่เคยพลาดมาแล้วพังแบบเดียวกัน — ปุ่มบันทึกติดด่าน แล้วเด้งกลับไปขั้นที่ไม่มี
//    ช่องให้แก้ วนไม่รู้จบโดยไม่มี error สักตัว:
//      · ใบยอด 0 บาท (`zeroValue`) — ขั้น ③ ซ่อนทั้งแผ่นเลือกงวดยกมา ตารางงวด และช่องหลักฐาน
//      · ทีมของดีล — `TeamPickerField` คืน `null` เมื่อเหลือตัวเลือก < 2
//    ⇒ ฝั่งคำถามกับฝั่งช่องต้องอ่าน **ธง/ชุดตัวเลือกตัวเดียวกัน** เสมอ
import { NA, fmtDate, fmtMoney, fmtNumber } from '@/lib/format';
import { QUOTE_DISCOUNT_TYPES, QUOTE_VAT_OPTIONS, quoteLineMoney } from '@/lib/salesPlanning';
import { ownerLockedToSelf } from '@/lib/sales/dealOwner';
import { externalDocKindLabel } from '@/lib/sales/contracts';
import { addDays, dueDateByRule, monthEdge, splitCoverageByMonths } from '@/lib/sales/paymentCoverage';
import { MONTH_END_DAY, billingRuleOf, describeBillingRule } from '@/lib/sales/billingRule';
import {
  HISTORICAL_APPROVER_LABEL, HISTORICAL_REF_MAX, INSTALLMENT_LABEL_MAX, INSTALLMENT_NOTE_MAX, OPENING_INSTALLMENT_LABEL,
  charLength, isOpeningInstallment,
} from '@/lib/sales/historicalOrders';
import {
  CONTRACT_DATE_MESSAGES, HISTORICAL_DISCOUNT_MESSAGES, HISTORICAL_LINE_MESSAGES, HISTORICAL_REQUIRED_MESSAGES,
  HISTORICAL_VAT_RATES, historicalLinesMoney, historicalZonePoint,
} from '@/lib/sales/historicalOrderPlan';
import { DEFAULT_SALE_UNIT } from '@/lib/master/units';

export {
  HISTORICAL_REF_MAX, INSTALLMENT_LABEL_MAX, INSTALLMENT_NOTE_MAX, HISTORICAL_VAT_RATES,
  CONTRACT_DATE_MESSAGES, HISTORICAL_DISCOUNT_MESSAGES, HISTORICAL_LINE_MESSAGES, charLength,
};

/* ── ขั้นของฟอร์ม (ม็อก Step1–Step4 · REVISION 2) ────────────────────────────────────
   ⚠️ รางขั้นเป็น "ที่บอกตำแหน่ง" — ข้ามขั้นไม่ได้เพราะขั้นหลังต้องผ่านด่านของขั้นก่อน
   ⚠️ ป้ายขั้น ④ พูดถึงการส่งอนุมัติตรง ๆ: ปุ่มของขั้นนั้นคือ "บันทึกและส่งอนุมัติ" ไม่ใช่ "บันทึก" */
export const HISTORICAL_WIZARD_STEPS = Object.freeze([
  { key: 'contract', label: 'ลูกค้าและสัญญา', hint: 'ลูกค้า · เอกสารแทนสัญญา' },
  { key: 'zones', label: 'ไซต์ โซน และรายการ', hint: 'รายการแบบใบเสนอราคา + ไซต์ · โซน' },
  { key: 'money', label: 'งวดชำระ', hint: 'งวดยกมา + งวดที่ยังต้องเก็บ' },
  { key: 'review', label: 'ตรวจและส่งอนุมัติ', hint: `ส่ง${HISTORICAL_APPROVER_LABEL}อนุมัติ` },
]);
export const HISTORICAL_WIZARD_STEP_ORDER = Object.freeze(HISTORICAL_WIZARD_STEPS.map((s) => s.key));

const text = (value) => (value === null || value === undefined ? '' : String(value)).trim();
const list = (value) => (Array.isArray(value) ? value : []);

/* ป้ายของตัวเลือก VAT — ชุดเดียวกับช่อง "ภาษีมูลค่าเพิ่ม" ของใบเสนอราคา (QUOTE_VAT_OPTIONS) */
const vatLabelOf = (rate) => QUOTE_VAT_OPTIONS.find((option) => option.value === rate)?.label || null;
export const HISTORICAL_VAT_CHOICE_MESSAGE = `เลือก VAT ของใบนี้ — ${QUOTE_VAT_OPTIONS.map((option) => `“${option.label}”`).join(' หรือ ')} (ตัวเลือกเดียวกับใบเสนอราคา)`;
const toSatang = (value) => Math.round((Number(value) || 0) * 100);
/* วันในปฏิทินรูป YYYY-MM-DD — เทียบกันด้วยสตริงได้ตรง ๆ (รูปนี้เรียงตามเวลาอยู่แล้ว) */
const isDateText = (value) => /^\d{4}-\d{2}-\d{2}$/.test(text(value));

let seq = 0;
const nextKey = (prefix) => { seq += 1; return `${prefix}-${seq}`; };

/**
 * แถวโซน = หนึ่งบรรทัดของใบ = **หนึ่งบรรทัดของใบเสนอราคา** (มติเจ้าของ 23/09)
 * ช่องเดียวกับตารางรายการของใบเสนอราคา: สินค้า (รหัส · คำอธิบาย · หน่วย · ราคา/หน่วยจากทะเบียน) ·
 * จำนวน · ส่วนลดรายการ — บวกของที่ใบย้อนหลังมีเพิ่มสองอย่างเท่านั้น: โซนที่ผูก และรอบบริการที่ขายไว้
 * ⭐ มติเจ้าของ 25/09: บรรทัดเกิดจากปุ่ม "เพิ่มรายการ" แบบใบเสนอราคา (ยังไม่มีโซน — เลือกในบรรทัด) หรือ
 *   "เพิ่มหลายโซน" · **`key` คือตัวตนของแถว** ไม่ใช่ `zoneId` (แถวใหม่ยังไม่มีโซน และเปลี่ยนโซนในบรรทัดได้)
 * ⚠️ จำนวนเริ่มที่ **ว่าง** (ใบเสนอราคาเริ่มที่ 1) — จำนวนที่เดาให้คือบั๊กที่มติ 23/09 แก้ · ว่าง = แผนตีกลับ
 * ⚠️ `fgCode` · `description` · `unit` · `unitPrice` มีไว้ **โชว์** อย่างเดียว (มาจาก `quoteLineFromProduct`)
 *   ไม่ถูกส่งขึ้น API — server อ่านราคา/หน่วยจากทะเบียนเอง · `key` มีไว้ให้ React เท่านั้น
 * ⭐ `_lineKind: 'product'` + หน่วยตั้งต้น `DEFAULT_SALE_UNIT` = **บรรทัดสินค้าใหม่ของใบเสนอราคา** (`newProductLine`)
 *   🐞 รีวิว 23/09: แถวที่ติ๊กโซนแล้วแต่ยังไม่เลือกแพ็คเกจ (ทางปกติของบรรทัดใหม่ที่ยังไม่เลือกแพ็คเกจ)
 *      ไม่มี `_lineKind` ⇒ เซลล์เปิดดรอปดาวน์หน่วยให้เลือก ทั้งที่ใบเสนอราคาล็อกเป็น "หน่วย: ชิ้น" ตั้งแต่ยังไม่เลือก
 *      และหน่วยที่เลือก (เช่น "ชุด") ถูกแพ็คเกจทับทิ้งเงียบ ๆ · ไม่ถูกส่งขึ้น API (body เลือกช่องเอง)
 */
export const emptyHistoricalZone = (defaults = {}) => ({
  key: nextKey('zone'),
  _lineKind: 'product',
  zoneId: text(defaults.zoneId),
  siteId: text(defaults.siteId),
  productId: text(defaults.productId),
  fgCode: text(defaults.fgCode) || null,
  description: text(defaults.description),
  unit: text(defaults.unit) || DEFAULT_SALE_UNIT,
  unitPrice: defaults.unitPrice === undefined || defaults.unitPrice === null ? '' : defaults.unitPrice,
  qty: defaults.qty === undefined || defaults.qty === null ? '' : defaults.qty,
  discountType: QUOTE_DISCOUNT_TYPES.includes(defaults.discountType) ? defaults.discountType : null,
  discountValue: QUOTE_DISCOUNT_TYPES.includes(defaults.discountType) ? (defaults.discountValue ?? 0) : 0,
  rounds: text(defaults.rounds),
});

/** งวดที่ยังต้องเก็บ — ไม่มีช่อง `status`/`kind` โดยเจตนา (ดู `historicalWizardBody`) */
export const emptyHistoricalInstallment = (defaults = {}) => ({
  key: nextKey('inst'),
  label: text(defaults.label),
  amount: text(defaults.amount),
  dueDate: text(defaults.dueDate),
  coversFrom: text(defaults.coversFrom),
  coversTo: text(defaults.coversTo),
  note: text(defaults.note),
});

/**
 * state ตั้งต้นของฟอร์มหนึ่งใบ
 * ⚠️ **ไม่มีค่าตั้งต้นให้กับสิ่งที่เป็นการตัดสินใจ** (form-design-rules §2) — ชนิดเอกสาร · VAT ·
 *   "เคยเก็บเงินไปแล้วหรือยัง" เริ่มที่ค่าว่าง/null · AE ตั้งต้นเฉพาะตอนที่ระบบล็อกให้เป็นตัวเอง
 */
export function emptyHistoricalWizard(defaults = {}) {
  return {
    orderId: null,
    status: null,
    updatedAt: null,
    orderNumber: null,
    rejection: null,
    customerId: text(defaults.customerId),
    ownerId: text(defaults.ownerId),
    team: text(defaults.team),
    contract: { docKind: '', ref: '', startDate: '', endDate: '' },
    refs: { quote: '', express: '', invoice: '' },
    vatRate: null,             // null = ยังไม่เลือก (ไม่ใช่ 0 — 0 คือ "รวม VAT แล้ว") · ช่องอยู่ในกล่องสรุปของขั้น ②
    discountType: null,        // ส่วนลดท้ายใบ (มติ 25/09) — null = ไม่ลด · 'percent' | 'amount'
    discountValue: '',
    notes: '',
    zones: [],
    hasOpening: null,          // null = ยังไม่เลือก · true = เคยเก็บแล้ว · false = ยังไม่เคยเก็บ
    /* ⭐ มติ 25/09 (รื้อขั้น ③): "จ่ายครบทั้งใบแล้ว" = งวดยกมาเท่ายอดใบ ครอบเต็มสัญญา ไม่มีงวดต้องเก็บ (3 ใน 4 ใบจริง)
       ⇒ ธงนี้มีความหมายเฉพาะตอน hasOpening = true · ยอด/ช่วงคิดให้ตอนประกอบ body (`historicalInstallmentChain`) */
    openingFull: false,
    opening: { amount: '', coversTo: '', paidOn: '', note: '' },
    openingEvidence: [],       // ref ของหลักฐานที่อยู่บนเซิร์ฟเวอร์แล้ว (โหมดแก้ใบ)
    installments: [],
  };
}

/**
 * ใบที่โหลดมา → state ของฟอร์ม (โหมดแก้ใบ = ฟอร์มตัวเดียวกับตอนสร้าง)
 * ⚠️ อ่านค่าจาก **ใบจริง** ไม่ใช่จากแผนที่พรีวิวคืน — ผู้คีย์ต้องเห็นสิ่งที่ลงฐานไปแล้ว
 * ⚠️ ตัวเลือก VAT เก็บไม่ได้ในคอลัมน์ ⇒ อยู่ใน `metadata.historicalIntake` (RPC เขียนให้)
 * ⭐ บรรทัดโซนเติมกลับ **ช่องต่อช่องแบบใบเสนอราคา** — จำนวน · หน่วย · ราคา/หน่วย · ส่วนลด (ชนิด/ค่า) · รอบ
 *   (ไม่มี "ยอดที่พิมพ์เอง" ให้เติมกลับอีกแล้ว — `metadata.grossAmount` ของรุ่น 0374 ไม่ถูกอ่าน)
 * 🪤 ใบที่คีย์ในโหมด "ราคารวม VAT แล้ว — ถอด VAT" ของรุ่นก่อน (`intake.amountsIncludeVat === true`) โหลดมาเป็น
 *   **ยังไม่เลือก VAT** — โหมดนั้นถูกถอด (มติ 23/09) และตัวเลือกที่เหลือไม่มีตัวไหนแปลว่าเงินก้อนเดียวกัน
 *   ⇒ ผู้คีย์ต้องเลือกใหม่เอง ไม่ใช่ระบบเดาให้
 */
export function wizardStateFromOrder(order = {}, { contract = null, installments = null } = {}) {
  const base = emptyHistoricalWizard();
  const intake = order?.metadata?.historicalIntake || {};
  const doc = contract || order?.serviceContract || null;
  const rows = list(installments === null ? order?.installments : installments);
  const opening = rows.find(isOpeningInstallment) || null;
  const regular = rows.filter((row) => !isOpeningInstallment(row))
    .slice()
    .sort((a, b) => text(a.coversFrom).localeCompare(text(b.coversFrom)) || (Number(a.seq) || 0) - (Number(b.seq) || 0));
  const lines = list(order?.lines).slice().sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0));
  const zoneRows = lines.filter((line) => line.serviceZoneId).map((line) => emptyHistoricalZone({
    zoneId: line.serviceZoneId,
    productId: line.productId,
    fgCode: line.fgCode,
    description: line.description,
    unit: line.unit,
    unitPrice: line.unitPrice,
    qty: line.qty,
    discountType: line.discountType,
    discountValue: line.discountValue,
    rounds: line.serviceRounds,
  }));
  const legacyGrossVat = intake.amountsIncludeVat === true;
  /* ส่วนลดท้ายใบ (มติ 25/09) — ชนิด/ค่าอยู่ใน `metadata.historicalIntake` (คอลัมน์เก็บแค่ยอด)
     🪤 ใบที่มียอดส่วนลดแต่ไม่มีชนิดใน intake (คีย์ก่อนมีช่องนี้ — วันนี้ยังไม่มีสักใบ) = ถอยเป็น "บาท" เท่ายอดเดิม
        ⇒ เปิดแก้แล้วยอดใบไม่ขยับเงียบ ๆ (ทิ้งยอดนั้น = ยอดใบโตขึ้นโดยไม่มีใครแก้) */
  const intakeDiscountType = QUOTE_DISCOUNT_TYPES.includes(intake.discountType) ? intake.discountType : null;
  const storedDiscount = Number(order?.discountAmount) || 0;
  const discountType = intakeDiscountType || (storedDiscount > 0 ? 'amount' : null);
  const discountValue = intakeDiscountType
    ? text(intake.discountValue)
    : (storedDiscount > 0 ? String(storedDiscount) : '');

  return {
    ...base,
    orderId: order?.id || null,
    status: order?.status || null,
    updatedAt: order?.updatedAt || null,
    orderNumber: order?.orderNumber || null,
    /* 🐞 รีวิวขั้น ④ 25/09: RPC แก้ใบพลิกใบที่ถูกตีกลับเป็นร่าง (0374) แต่ล้างคอลัมน์ตีกลับเฉพาะตอนส่ง ⇒ ส่งไม่ผ่านแล้วเปิดใหม่
       = เหตุผลที่ถูกตีกลับหายจากฟอร์ม ⇒ ร่างที่ยังพก `rejectedAt` คือใบที่ถูกตีกลับแล้วยังไม่ได้ส่งใหม่ */
    rejection: order?.status === 'rejected' || (order?.status === 'draft' && order?.rejectedAt)
      ? { by: text(order?.rejectedByName) || null, at: order?.rejectedAt || null, reason: text(order?.rejectionReason) || null }
      : null,
    customerId: text(order?.customerId),
    ownerId: text(order?.deal?.ownerId),
    team: text(order?.deal?.team),
    contract: {
      docKind: text(doc?.externalDocKind),
      ref: text(doc?.externalRef),
      startDate: text(doc?.effectiveDate) || text(doc?.contractDate) || text(order?.orderDate),
      endDate: text(doc?.expiryDate),
    },
    refs: {
      quote: text(order?.historicalQuoteRef),
      express: text(order?.historicalExpressRef),
      invoice: text(order?.historicalInvoiceRef),
    },
    vatRate: !legacyGrossVat && HISTORICAL_VAT_RATES.includes(Number(intake.vatRate)) ? Number(intake.vatRate) : null,
    discountType,
    discountValue,
    notes: text(order?.notes),
    zones: zoneRows,
    hasOpening: rows.length ? Boolean(opening) : null,
    /* งวดยกมาอย่างเดียวไม่มีงวดอื่น = ผลรวมเท่ายอดใบเอง (ตัวตรวจงวดของ 0374) ⇒ คือ "จ่ายครบทั้งใบแล้ว" เสมอ */
    openingFull: Boolean(opening) && regular.length === 0,
    opening: opening
      ? {
        amount: text(opening.amount),
        coversTo: text(opening.coversTo),
        paidOn: text(opening.paidOn),
        note: text(opening.note),
      }
      : base.opening,
    openingEvidence: list(opening?.evidence),
    installments: regular.map((row) => emptyHistoricalInstallment({
      label: row.label, amount: row.amount, dueDate: row.dueDate,
      coversFrom: row.coversFrom, coversTo: row.coversTo, note: row.note,
    })),
  };
}

/* ── ช่องต้นน้ำเปลี่ยน = ของปลายน้ำต้องล้างให้ครบ และต้องถามก่อน ──────────────────────
 *
 * 🐞 UAT 23/09 (ข้อมูลหาย + ทางตัน): สลับลูกค้าที่ขั้น ① เรียก
 *   `patch({ customerId, zones: [], packageProductId: '' })` — **ล้างโซน แต่ทิ้งงวดไว้**
 *   ทั้งที่งวดยกมาและงวดที่เหลือคิดมาจากยอดของโซนชุดที่เพิ่งลบทิ้ง ⇒ ขั้น ③ ยังถือยอดของ
 *   บรรทัดที่ไม่มีอยู่แล้ว แล้วผู้คีย์ไปโผล่ที่ "ยอดงวดรวมไม่เท่ายอดใบ" โดยไม่มีอะไรบอกว่า
 *   ทำไม · และของที่หายไปก็หายเงียบ ๆ โดยไม่เคยถาม
 * ⇒ กติกา: **ล้างให้ครบเป็นชุดเดียว และถามก่อนเสมอเมื่อมีของจะหาย** (กฎบ้าน: การกระทำที่
 *   ทำลายของที่พิมพ์ไว้ต้องมีโมดัลบอกผลลัพธ์) · ตัวตัดสินอยู่ที่นี่ที่เดียว ⇒ คำถามที่ถาม
 *   กับของที่ล้างจริงไม่มีทางไม่ตรงกัน (JSX ที่เขียนเองสองที่จะเพี้ยนกันวันใดวันหนึ่ง)
 *
 * ⚠️ **วันสัญญาไม่อยู่ในชุดนี้** — `DateInput` ยิง onChange ระหว่างพิมพ์ทีละตัว ⇒ ถามตอนนั้น
 *   = โมดัลเด้งกลางคำ · ช่วงสัญญาไม่ได้ทำให้งวดเป็นโมฆะทันที (มันแค่ต้องครอบใหม่ให้เต็ม)
 *   ⇒ ใช้คำเตือนค้างบนขั้น ① แทน (`historicalCoverageWarning`) — บอกว่าจะเกิดอะไร ไม่ล้างให้เอง
 * ⚠️ **ไม่ล้าง `openingEvidence`** — นั่นคือไฟล์ที่อยู่บนเซิร์ฟเวอร์จริงแล้ว (โหมดแก้ใบ)
 *   ล้างจากฟอร์ม = ไฟล์กำพร้าใน bucket โดยที่ผู้คีย์ไม่ได้สั่งลบสักไฟล์
 *
 * @param field 'customer' (ลูกค้า) | 'vat' (ตัวเลือก VAT ของใบ)
 * @returns `{ ask, clears, patch, title, description, detail, confirmLabel }`
 *   - `ask` เท็จ = ยังไม่มีอะไรให้หาย ⇒ ผู้เรียกใช้ `patch` ได้เลยโดยไม่ต้องถาม
 */
export function historicalDownstreamReset(state = {}, field = 'customer') {
  const zoneCount = list(state.zones).length;
  const installmentCount = list(state.installments).length;
  const openingAnswered = state.hasOpening === true || state.hasOpening === false;
  /* งวดทั้งชุดกลับไปเป็น "ยังไม่ตัดสินใจ" ไม่ใช่ false — ไม่มีค่าตั้งต้นให้การตัดสินใจ */
  const moneyPatch = { hasOpening: null, openingFull: false, opening: emptyHistoricalWizard().opening, installments: [] };
  const moneyClears = [
    ...(openingAnswered ? [`คำตอบและยอดของ${OPENING_INSTALLMENT_LABEL}`] : []),
    ...(installmentCount ? [`งวดที่ยังต้องเก็บ ${installmentCount} งวด`] : []),
  ];

  if (field === 'vat') {
    /* 🐞 รีวิว 25/09: VAT ย้ายมาขั้น ② แล้วไม่บล็อกการออกจากขั้น ① อีก ⇒ ใบใหม่ไปคีย์งวดที่ขั้น ③ ก่อนเลือก VAT ได้
       (กดรางข้ามขั้น) · การเลือก VAT **ครั้งแรก** เคยถูกนับเป็น "เปลี่ยน VAT" ⇒ ถามล้างงวดที่เลี่ยงไม่ได้ (ยกเลิก = ไปต่อไม่ได้)
       ⇒ ยังไม่เคยเลือก = ไม่มีอะไรให้คิดใหม่ (ยอดยังไม่เคยมี) ไม่ถาม ไม่ล้าง · โหมดรุ่นก่อนที่ถูกถอด (amountsIncludeVat) ยังถาม */
    const hadVat = HISTORICAL_VAT_RATES.includes(state.vatRate) || state.amountsIncludeVat === true;
    const clears = hadVat ? moneyClears : [];
    return {
      ask: clears.length > 0,
      clears,
      patch: hadVat ? moneyPatch : {},
      title: 'เปลี่ยน VAT แล้วงวดชำระจะถูกล้าง',
      description: `ยอดใบคิดใหม่จาก VAT ที่เลือก ⇒ งวดที่คีย์ไว้จะไม่ตรงยอดใบอีก · ระบบจะล้าง: ${clears.join(' · ')}`,
      detail: 'รายการทุกบรรทัดยังอยู่ครบ — กดยกเลิกเพื่อคง VAT เดิมไว้',
      confirmLabel: 'เปลี่ยน VAT และล้างงวด',
    };
  }

  const clears = [
    ...(zoneCount ? [`รายการ ${zoneCount} บรรทัด (พร้อมโซนที่ผูก)`] : []),
    ...moneyClears,
  ];
  return {
    ask: clears.length > 0,
    clears,
    patch: { zones: [], ...moneyPatch },
    title: 'เปลี่ยนลูกค้าแล้วของขั้น ② และ ③ จะถูกล้าง',
    description: `รายการผูกโซนและแพ็คเกจของลูกค้าเดิม และงวดชำระคิดจากยอดของรายการพวกนั้น ⇒ ระบบจะล้าง: ${clears.join(' · ')}`,
    detail: 'กดยกเลิกเพื่อคงลูกค้าเดิมไว้ — คีย์ผิดลูกค้าทั้งใบให้เริ่มใบใหม่แทน',
    confirmLabel: 'เปลี่ยนลูกค้าและล้างข้อมูล',
  };
}

/**
 * คำเตือนของขั้น ① เมื่อแก้วันสัญญาทั้งที่คีย์งวดไว้แล้ว — **บอกว่าจะเกิดอะไร ไม่ล้างให้**
 * (ช่วงครอบของทุกงวดต้องเต็มสัญญาพอดี ⇒ ขยับวันแล้วงวดเดิมยังใช้ได้ แค่ต้องแก้ช่วง)
 */
export function historicalCoverageWarning(state = {}) {
  const mode = historicalOpeningMode(state);
  const rows = mode === 'full' ? 0 : list(state.installments).length;
  const opening = state.hasOpening === true;
  if (!rows && !opening) return null;
  /* ⭐ มติ 25/09 (รื้อขั้น ③): ช่วงของงวดเป็นห่วงโซ่ — งวดแรกเริ่ม/งวดสุดท้ายจบตามสัญญาเอง · จ่ายครบทั้งใบครอบเต็มสัญญาเอง
     ⇒ ที่ต้องกลับไปดูเหลือแค่ "ครอบถึง" ของงวดยกมาบางส่วน และ "ถึง" ของงวดกลางที่อาจเลยช่วงใหม่ (ขึ้นแดงใต้ช่องนั้นเอง) */
  if (mode === 'full') return null;   // จ่ายครบทั้งใบ ครอบตามวันสัญญาเอง — ไม่มีอะไรต้องเตือน (กล่องเหลืองที่ไม่มีอะไรให้ทำ = เสียงรบกวน)
  const held = [
    ...(opening ? [OPENING_INSTALLMENT_LABEL] : []),
    ...(rows ? [`งวดที่ยังต้องเก็บ ${rows} งวด`] : []),
  ].join(' · ');
  return `แก้วันสัญญาแล้ว ${held} ที่คีย์ไว้ในขั้น ③ ไม่ถูกล้าง — งวดแรกเริ่มและงวดสุดท้ายจบตามสัญญาให้เอง · “ครอบถึง” ที่เลยช่วงใหม่จะขึ้นแดงใต้ช่องในขั้น ③`;
}

/**
 * body ของทั้งสองเส้น (POST `…/historical` และ PATCH `…/historical/[id]`) — **ตัวประกอบตัวเดียว**
 * ที่ทั้งพรีวิวและบันทึกเรียก ⇒ ของที่ตรวจแล้วเท่ากับของที่บันทึกเสมอ
 *
 * 🪤 กับดักเงียบที่ตัวประกอบนี้กันไว้ให้ — **ห้าม spread state ดิบ**:
 *   1. `key` ของแถว (ของ React) ไหลขึ้น API แล้วกลายเป็นคีย์แปลกปลอมในแผน
 *   2. งวด/บรรทัดที่มี `status` · `kind` · `frozenAt` = ค่าที่ฐานเป็นคนตั้ง ไม่ใช่ค่าที่จอส่ง
 *   3. `opening` ของใบที่ยังไม่เลือกว่าเคยเก็บเงินไหม ต้องเป็น `null` ไม่ใช่ก้อนว่าง
 *      (ก้อนว่าง = ตัวตรวจอ่านว่า "มีงวดยกมาที่กรอกไม่ครบ" แล้วตีกลับคนละเรื่อง)
 * @param options `{ preview, intakeKey, expectedUpdatedAt, acknowledgeDuplicates, openingEvidenceRefs }`
 *   - openingEvidenceRefs: ref ของหลักฐานงวดยกมาทั้งชุด (ของเดิม + ที่เพิ่งอัป) — โหมดแก้ใบเท่านั้น
 *     ⚠️ RPC แก้ใบเขียนงวดใหม่ทั้งชุด ⇒ ไม่ส่ง = หลักฐานเดิมหาย
 */
export function historicalWizardBody(state = {}, options = {}) {
  const {
    preview = false, intakeKey = null, expectedUpdatedAt = null, acknowledgedDuplicateIds = null, duplicateNote = '',
    openingEvidenceRefs = null, totalAmount,
  } = options;
  const evidence = openingEvidenceRefs === null ? list(state.openingEvidence) : list(openingEvidenceRefs);
  /* ⭐ มติ 25/09 (รื้อขั้น ③): งวดส่งตาม **ห่วงโซ่** ไม่ใช่ค่าดิบของ state — ช่วงของแต่ละงวดต่อจากงวดก่อน · งวดสุดท้าย
     รับยอดที่เหลือและจบวันสิ้นสุดสัญญา · "จ่ายครบทั้งใบแล้ว" = งวดยกมาเท่ายอดใบ ครอบเต็มสัญญา ⇒ สิ่งที่ตรวจ = สิ่งที่จอโชว์
     ยอดใบ: ผู้เรียกส่งมา (มีแผนใช้แผน) · ไม่ส่ง = คิดจากฟอร์มด้วยสูตรเดียวกับ server (`historicalMoneyView`) */
  const total = totalAmount === undefined ? historicalMoneyView(state, null).totalAmount : totalAmount;
  const chain = historicalInstallmentChain(state, { totalAmount: total });
  /* 🐞 รีวิว 25/09: ใบที่กลายเป็น ฿0 **หลัง** ตอบขั้น ③ ไปแล้ว (ส่วนลด 100% ที่ขั้น ②) — ขั้น ③ ซ่อนทุกช่องของใบ ฿0 แต่ body ยังส่ง
     งวดยกมา/งวดเดิม ⇒ แผนตีกลับ "ใบยอด 0 บาทไม่มีงวด" แล้วพาไปขั้นที่ไม่มีอะไรให้แก้ = ทางตัน
     ⇒ รู้ยอดใบแล้วเป็น 0 = ไม่มีงวดให้ส่ง (กติกาเดียวกับตัวตรวจงวดของ 0374) · ของที่คีย์ไว้ยังอยู่ใน state ถ้ายอดกลับมา */
  const zeroTotal = total !== null && total !== undefined && Number.isFinite(Number(total)) && toSatang(total) === 0;
  const body = {
    preview,
    customerId: text(state.customerId) || null,
    ownerId: text(state.ownerId) || null,
    team: text(state.team) || null,
    contract: {
      docKind: text(state.contract?.docKind) || null,
      ref: text(state.contract?.ref) || null,
      startDate: text(state.contract?.startDate) || null,
      endDate: text(state.contract?.endDate) || null,
    },
    refs: {
      quote: text(state.refs?.quote) || null,
      express: text(state.refs?.express) || null,
      invoice: text(state.refs?.invoice) || null,
    },
    vatRate: state.vatRate,
    /* ส่วนลดท้ายใบ (มติ 25/09) — ช่องเดียวกับ "หัก ส่วนลด" ของใบเสนอราคา · ไม่ลด = null ทั้งคู่ */
    discountType: QUOTE_DISCOUNT_TYPES.includes(state.discountType) ? state.discountType : null,
    discountValue: QUOTE_DISCOUNT_TYPES.includes(state.discountType) ? text(state.discountValue) : '',
    notes: text(state.notes) || null,
    /* บรรทัดโซน = บรรทัดใบเสนอราคา: สินค้า · จำนวน · ส่วนลดรายการ (+ โซน · รอบ) — **ไม่ส่งราคา/ยอด**
       ราคา/หน่วยเป็นของทะเบียนสินค้า (server อ่านเอง) · ยอดบรรทัดเป็นของสูตร ไม่ใช่ของที่จอคิด */
    zones: list(state.zones).map((row) => ({
      zoneId: text(row?.zoneId) || null,
      productId: text(row?.productId) || null,
      qty: text(row?.qty),
      discountType: QUOTE_DISCOUNT_TYPES.includes(row?.discountType) ? row.discountType : null,
      discountValue: QUOTE_DISCOUNT_TYPES.includes(row?.discountType) ? text(row?.discountValue) : '',
      rounds: text(row?.rounds),
    })),
    opening: state.hasOpening === true && !zeroTotal
      ? {
        amount: chain.mode === 'full'
          ? (chain.opening?.amount === null || chain.opening?.amount === undefined ? '' : moneyText(chain.opening.amount))
          : text(state.opening?.amount),
        coversTo: chain.mode === 'full' ? (chain.opening?.coversTo || null) : (text(state.opening?.coversTo) || null),
        paidOn: text(state.opening?.paidOn) || null,
        note: text(state.opening?.note) || null,
        evidence,
      }
      : null,
    installments: (zeroTotal ? [] : chain.rows).map((row) => ({
      label: text(row.label),
      amount: row.amount === null ? text(row.amountText) : moneyText(row.amount),
      dueDate: text(row.dueDate) || null,
      coversFrom: row.coversFrom || null,
      coversTo: row.coversTo || null,
      note: text(row.note) || null,
    })),
  };
  /* รหัสการคีย์: บังคับเฉพาะตอนสร้างจริง แต่ส่งตั้งแต่พรีวิวด้วย — มันคือตัวที่ทำให้ใบของ
     รหัสนี้เอง (ส่งซ้ำหลังเน็ตหลุด) ไม่ถูกนับเป็น "ใบที่อาจซ้ำ" ของตัวเอง */
  if (intakeKey) body.intakeKey = intakeKey;
  if (expectedUpdatedAt) body.expectedUpdatedAt = expectedUpdatedAt;
  /* ⭐ มติ 26/09: ยืนยันใบที่อาจซ้ำ **เป็นรายใบ** (id ที่ผู้คีย์เห็นตอนเปิดสวิตช์) + เหตุผลไม่บังคับ — server ตีกลับ 409
     ถ้ามีใบที่อาจซ้ำที่ไม่อยู่ในรายการ · ไม่ส่ง `acknowledgeDuplicates: true` แล้ว (ผ่านกับรายการไหนก็ได้ — รับไว้เฉพาะแท็บรุ่นก่อน) */
  const ackIds = list(acknowledgedDuplicateIds).map(text).filter(Boolean);
  if (ackIds.length) body.acknowledgedDuplicateIds = [...new Set(ackIds)];
  if (text(duplicateNote)) body.duplicateNote = text(duplicateNote);
  return body;
}

/* ── ช่อง → ขั้น ───────────────────────────────────────────────────────────────
   ชื่อช่องมาจาก `planHistoricalServiceOrder` (`err(field, …)`) และจาก local issues ข้างล่าง
   ของที่ไม่รู้จักตกที่ขั้นแรก เพราะขั้นแรกคือที่ที่ผู้คีย์เห็นข้อความได้แน่นอนที่สุด */
const FIELD_STEP = new Map([
  ['customerId', 'contract'], ['ownerId', 'contract'], ['team', 'contract'], ['deal', 'contract'],
  ['contract', 'contract'], ['refs', 'contract'],
  ['notes', 'contract'], ['todayIso', 'contract'],
  /* ⭐ มติ 25/09: VAT กับส่วนลดท้ายใบอยู่ในกล่องสรุปท้ายตารางรายการ (ขั้น ②) แบบใบเสนอราคา */
  ['zones', 'zones'], ['vatRate', 'zones'], ['discount', 'zones'],
  ['opening', 'money'], ['installments', 'money'],
  /* เหตุผลของการยืนยันใบที่อาจซ้ำ (มติ 26/09) — ช่องอยู่ใต้สวิตช์ในการ์ดใบที่อาจซ้ำของขั้น ④ */
  ['duplicateNote', 'review'],
]);

export function stepOfField(field) {
  const name = text(field);
  if (FIELD_STEP.has(name)) return FIELD_STEP.get(name);
  const head = name.split('.')[0];
  if (FIELD_STEP.has(head)) return FIELD_STEP.get(head);
  return 'contract';
}

/** error ของขั้นนั้น — ขั้น ① จึงไม่โชว์ "ต้องเลือกอย่างน้อย 1 โซน" ซึ่งจริงเสมอตอนนั้น */
export function issuesForStep(issues = [], step = 'contract') {
  return list(issues).filter((issue) => stepOfField(issue?.field) === step);
}

/** ขั้นแรกที่ยังมีข้อผิดพลาด — ปุ่ม "กลับไปแก้" ของ 400 พาไปที่นี่ */
export function firstStepWithIssues(issues = []) {
  const steps = new Set(list(issues).map((issue) => stepOfField(issue?.field)));
  return HISTORICAL_WIZARD_STEP_ORDER.find((step) => steps.has(step)) || null;
}

/**
 * ทีมของดีลที่ใบนี้จะเข้า — **คำถาม ช่องบนจอ และค่าที่ส่งขึ้น API มาจากตัวนี้ตัวเดียว**
 *
 * 🔴 กับดักที่ตัวนี้ปิด (รีวิว S8): คำถามเคยนับจาก "AE อยู่กี่ทีม" แต่ช่องบนจอนับจาก
 *    "ทีมที่เลือกได้จริง" ⇒ AC ที่ดูแลทีมเดียวแต่ AE อยู่สองทีม โดนถามข้อที่ **ไม่มีช่องให้ตอบ**
 *    (`TeamPickerField` คืน `null` เมื่อเหลือ < 2 ตัวเลือก) แล้วปุ่มบันทึกเด้งกลับขั้น ① วนไม่จบ
 * 🔴 และการ "เลิกถามเฉย ๆ" ยังไม่พอ: ไม่ส่งทีมขึ้นไป = `attributionTeam` ถอยไป **ทีมหลักของ AE**
 *    ซึ่งอาจเป็นทีมที่ผู้คีย์ไม่ได้ดูแล ⇒ แผนฝั่ง server ตีกลับที่ช่อง AE ("ดีล…อยู่ทีม X ซึ่งคุณ
 *    ไม่ได้ดูแล") โดยฟอร์มยังไม่มีอะไรให้แก้อยู่ดี ⇒ เหลือทีมเดียว = **ตอบให้แล้วล็อกไว้ให้เห็น**
 *
 * @param ownerTeams  ทีมที่ AE ที่เลือกสังกัด
 * @param sharedTeams ทีมที่ผู้คีย์กับ AE มีร่วมกัน (ผู้คีย์ที่ขอบเขตไม่ใช่ทั้งบริษัท) — ว่าง = ไม่จำกัด
 * @param locked      โหมดแก้ใบ — ดีลผูกไปแล้วและ RPC แก้ใบไม่อ่านทีมเลย ⇒ ไม่ถาม ไม่ล็อกทับของเดิม
 */
export function historicalTeamField({ ownerTeams = [], sharedTeams = [], locked = false } = {}) {
  const teams = list(ownerTeams).map(text).filter(Boolean);
  const shared = list(sharedTeams).map(text).filter(Boolean);
  const options = shared.length ? teams.filter((team) => shared.includes(team)) : teams;
  return {
    options,
    /* ถาม = มีคำตอบให้เลือกจริงตั้งแต่ 2 — เกณฑ์เดียวกับที่ช่องบนจอโผล่ */
    ask: !locked && options.length >= 2,
    /* เลือกได้ทีมเดียวทั้งที่ AE อยู่หลายทีม = ค่าที่ฟอร์มต้องเติมเองแล้วโชว์เป็นช่องล็อก */
    lockedTeam: !locked && options.length === 1 && teams.length >= 2 ? options[0] : null,
  };
}

/**
 * สองช่องวันสัญญา — **กระจกของแผนฝั่ง server ไม่ใช่กฎชุดที่สอง** (ข้อความมาจาก
 * `CONTRACT_DATE_MESSAGES` ของ `historicalOrderPlan` ก้อนเดียวกับที่แผนตีกลับ)
 *
 * 🐞 UAT 23/09: ช่องวันเริ่มถูกล้อมด้วย `max={todayIso}` และช่องวันสิ้นสุดด้วย `min={startDate}`
 *    ⇒ `DateInput` **ไม่เรียก onChange เมื่อค่าหลุดขอบ** แล้วเด้งกลับค่าเดิมตอนเบลอ: ผู้คีย์พิมพ์
 *    วันอนาคตแล้วเห็นช่องคืนค่าเก่าโดยไม่มีข้อความสักบรรทัด (และ server ไม่เคยได้เห็นค่านั้นเลย)
 * ⇒ ฟอร์มรับค่าที่พิมพ์เข้ามาก่อน แล้ว **โชว์กฎที่ช่องนั้นทันที** · ลำดับ else-if ตรงกับแผน
 *    (เกินวันนี้ > ก่อนวันเริ่ม > สิ้นสุดไปแล้ว) ไม่งั้นช่องเดียวขึ้นสองเหตุผลพร้อมกัน
 * ⚠️ ไม่รู้วันนี้ = ไม่ตัดสินข้อที่อิง "วันนี้" (ด่านจริงคือแผน ซึ่งตีกลับที่ `todayIso` เอง)
 *
 * 🔴 **`editing` ต้องตรงกับ `ctx.editing` ของแผนเป๊ะ** (มติข้อ 9) — ใบที่มีอยู่แล้ว (ร่าง/ตีกลับ)
 *    ที่สัญญาสิ้นสุดไประหว่างทางคือ **คำเตือน ไม่ใช่ด่าน** · กระจกที่ลืมข้อนี้ = ทางตันตัวเดิม
 *    กลับมาอยู่ฝั่งจอแทน: server ยอมรับ PATCH แล้ว แต่ `goToStep` ไม่เดิน และปุ่มบันทึกเด้ง
 *    กลับขั้น ① ⇒ ใบที่ AE Sup ตีกลับหลังสัญญาหมดอายุ แก้และส่งใหม่ไม่ได้อีกเลย
 *    ⇒ ข้อที่เป็นคำเตือนอยู่ที่ `historicalContractDateWarnings` (ไม่ไหลเข้า local issues)
 */
export function historicalContractDateIssues(state = {}, { todayIso = null, editing = false } = {}) {
  const issues = [];
  const today = isDateText(todayIso) ? text(todayIso) : null;
  const from = text(state?.contract?.startDate);
  const to = text(state?.contract?.endDate);
  /* `live: true` = ข้อที่พูดถึง **ค่าที่ผู้คีย์เพิ่งพิมพ์** ⇒ ขึ้นใต้ช่องทันทีแม้ยังไม่กดไปต่อ (`historicalVisibleIssues`) */
  if (isDateText(from) && today && from > today) {
    issues.push({ field: 'contract.startDate', message: CONTRACT_DATE_MESSAGES.startAfterToday, live: true });
  }
  if (isDateText(to)) {
    if (isDateText(from) && to < from) {
      issues.push({ field: 'contract.endDate', message: CONTRACT_DATE_MESSAGES.endBeforeStart, live: true });
    } else if (today && to < today && !editing) {
      issues.push({ field: 'contract.endDate', message: CONTRACT_DATE_MESSAGES.endBeforeToday, live: true });
    }
  }
  return issues;
}

/**
 * คำเตือนของสองช่องวันสัญญา — **ไม่บล็อกอะไร** แต่ต้องขึ้นบนจอ (เงียบ = ผู้คีย์ไม่รู้ว่าใบนี้พิเศษ)
 * ⚠️ รูปเดียวกับ issues (`{ field, message }`) แต่ **ห้ามไหลเข้า `historicalWizardLocalIssues`** —
 *   ทุกข้อในนั้นบล็อกปุ่ม "ถัดไป" และปุ่มบันทึก
 * ⚠️ ลำดับเดียวกับแผน: "ก่อนวันเริ่ม" เป็น error ที่ชนะข้อนี้ ⇒ ไม่ขึ้นพร้อมกันสองเหตุผลในช่องเดียว
 */
export function historicalContractDateWarnings(state = {}, { todayIso = null, editing = false } = {}) {
  if (!editing) return [];
  const today = isDateText(todayIso) ? text(todayIso) : null;
  const from = text(state?.contract?.startDate);
  const to = text(state?.contract?.endDate);
  if (!today || !isDateText(to) || to >= today) return [];
  if (isDateText(from) && to < from) return [];
  return [{ field: 'contract.endDate', message: CONTRACT_DATE_MESSAGES.endBeforeTodayEditing }];
}

/**
 * ของที่พรีวิวฝั่ง server มองไม่เห็น (ดูหัวไฟล์) — รูปเดียวกับ `plan.errors` ⇒ ใช้ตัวจัดขั้นตัวเดียวกันได้
 * @param ownerTeams / sharedTeams  ส่งต่อให้ `historicalTeamField` ตัวเดียวกับที่ขั้น ① ใช้วาดช่อง
 * @param contractFileCount / evidenceFileCount  ไฟล์ที่ **นับรวมทั้งของที่แนบไว้แล้วบนเซิร์ฟเวอร์**
 * @param zeroValue  ธงใบยอด 0 บาทจากแผนของ server (`plan.zeroValue`) — ตัวเดียวกับที่ขั้น ③ ใช้ซ่อนช่อง
 * @param todayIso  วันนี้ตามนาฬิกาไทย (`businessDate()` ของผู้เรียก) — ไม่ส่ง = ไม่ตรวจข้อที่อิงวันนี้
 */
export function historicalWizardLocalIssues(state = {}, {
  role = null, userId = null, ownerTeams = [], sharedTeams = [], contractFileCount = 0, evidenceFileCount = 0,
  zeroValue = false, todayIso = null, totalAmount,
} = {}) {
  const issues = [];
  const add = (field, message) => issues.push({ field, message });
  /* ⭐ รีวิว 25/09: ช่องบังคับของขั้น ① ตรวจที่จอด้วย (คำเดียวกับแผน — HISTORICAL_REQUIRED_MESSAGES) ⇒ กดถัดไปครั้งเดียวเห็นครบ
     ไม่ใช่ไฟล์ก่อนแล้วค่อยเจอชนิดเอกสาร/วันรอบหน้า · เรียงตามลำดับบนจอ (ปุ่มที่ติดด่านพาไปที่ข้อแรกของขั้น) */
  if (!text(state.customerId)) add('customerId', HISTORICAL_REQUIRED_MESSAGES.customerId);
  if (!text(state.ownerId)) add('ownerId', HISTORICAL_REQUIRED_MESSAGES.ownerId);
  /* AE / Senior AE คีย์ได้เฉพาะของตัวเอง — ช่องบนจอล็อกเป็นตัวเองอยู่แล้ว (form-design-rules §2)
     ที่นี่กันกรณี state เพี้ยน (เช่น hydrate ใบของคนอื่นมาแก้) ก่อนยิงพรีวิวให้เปลือง */
  if (ownerLockedToSelf(role) && text(userId) && text(state.ownerId) && text(state.ownerId) !== text(userId)) {
    add('ownerId', 'AE / Senior AE คีย์ใบย้อนหลังได้เฉพาะของตัวเอง');
  }
  /* ⚠️ ถามจาก **ชุดตัวเลือกที่อยู่บนจอจริง** ไม่ใช่จากจำนวนทีมของ AE (ดูหัว `historicalTeamField`) */
  const teamField = historicalTeamField({ ownerTeams, sharedTeams, locked: Boolean(state.orderId) });
  if (teamField.ask && !teamField.options.includes(text(state.team))) {
    add('team', `AE คนนี้อยู่ ${teamField.options.length} ทีม — เลือกทีมที่ใบนี้เข้า (ทีมของดีลตามที่เลือก)`);
  }

  if (!text(state.contract?.docKind)) add('contract.docKind', HISTORICAL_REQUIRED_MESSAGES.docKind);
  if (!isDateText(state.contract?.startDate)) add('contract.startDate', HISTORICAL_REQUIRED_MESSAGES.startDate);
  if (!isDateText(state.contract?.endDate)) add('contract.endDate', HISTORICAL_REQUIRED_MESSAGES.endDate);
  /* ⚠️ กฎของวันสัญญาที่พิมพ์แล้ว — มันคือช่องที่ผู้คีย์เพิ่งพิมพ์ค้างไว้บนจอ (ดูหัว
     `historicalContractDateIssues`) · ขั้น ① หยิบข้อความชุดนี้ไปแปะใต้ช่องเอง
     🔴 `editing` = ตัวแยกสร้าง/แก้ตัวเดียวกับที่ไฟล์นี้ใช้กับช่องทีม (`locked`) และตรงกับ
        `ctx.editing` ของแผน ⇒ สัญญาที่สิ้นสุดไปแล้วบนใบที่มีอยู่แล้วเป็นคำเตือน ไม่ใช่ด่าน */
  const editing = Boolean(state.orderId);
  for (const issue of historicalContractDateIssues(state, { todayIso, editing })) issues.push(issue);

  /* 🔴 ไฟล์ทั้งสองชุดอัปได้ **หลังใบเกิดแล้ว** (ต้องมีแถวก่อนถึงจะมีโฟลเดอร์ให้แนบ) ⇒ พรีวิวไม่เห็น
     แต่ขั้นส่งอนุมัติตีกลับทั้งคู่ · ถามที่นี่ = ผู้คีย์รู้ตั้งแต่ก่อนกด ไม่ใช่หลังใบร่างเกิดแล้ว */
  /* 🪤 `null` = **ยังไม่รู้** (แผงไฟล์แนบยังไม่รายงานและไม่มีจำนวนที่ hydrate มาให้ถอย) —
     ห้ามนับเป็น 0 แล้วบอกว่า "ยังไม่แนบ" และห้ามปล่อยผ่าน · ดู `historicalContractFileCount` */
  if (contractFileCount === null) {
    add('contract.file', 'ยังอ่านจำนวนไฟล์เอกสารแทนสัญญาไม่ได้ — โหลดหน้านี้ใหม่แล้วลองอีกครั้ง');
  } else if (contractFileCount < 1) {
    add('contract.file', `ต้องแนบไฟล์เอกสารที่ใช้แทนสัญญาอย่างน้อย 1 ไฟล์ — ${HISTORICAL_APPROVER_LABEL}อนุมัติจากไฟล์นี้`);
  }
  /* ขั้น ② — VAT อยู่กล่องสรุปใต้ตารางรายการ (A14) */
  if (!HISTORICAL_VAT_RATES.includes(state.vatRate)) add('vatRate', HISTORICAL_VAT_CHOICE_MESSAGE);
  /* 🪤 โหมด "ราคารวม VAT แล้ว — ถอด VAT 7%" ถูกถอด (มติ 23/09) และ body ไม่ส่งมันแล้ว ⇒ state ที่ยังพกมันมา
     จะกลายเป็น "+ VAT 7% ท้ายใบ" เงียบ ๆ = ยอดใบบวก VAT ซ้ำ ⇒ ต้องเลือกใหม่ ไม่ใช่เดา
     ⚠️ ขั้น ② (กล่องสรุป) ไม่มีแผ่นที่ตั้งธงนี้ (แผ่น VAT = QUOTE_VAT_OPTIONS) · ด่านนี้เหลือไว้กัน state ที่มาจากทางอื่น */
  else if (state.amountsIncludeVat === true) add('vatRate', `โหมด “ราคารวม VAT แล้ว — ถอด VAT” เลิกใช้แล้ว — ${HISTORICAL_VAT_CHOICE_MESSAGE}`);

  /* 🪤 ใบยอด 0 บาท **ไม่มีงวดสักงวด** (ตัวตรวจงวดของแผน + CHECK ของ 0374) ⇒ ขั้น ③ ซ่อนทั้ง
     แผ่นเลือก ตารางงวด และช่องหลักฐาน · ถามต่อที่นี่ = ถามข้อที่ไม่มีช่องให้ตอบ แล้วปุ่มบันทึก
     เด้งกลับขั้น ③ ทุกครั้งไม่รู้จบ ⇒ ธงตัวเดียวกับที่ขั้น ③ ใช้ซ่อนช่อง ต้องปิดคำถามคู่นี้ด้วย
     ⭐ มติ 25/09 (รื้อขั้น ③): จอตรวจทุกช่องของขั้นนี้เอง (ข้อความเดียวกับแผนเมื่อมีคู่) ⇒ กด "ถัดไป" ครั้งเดียวเห็นครบ ·
       ข้อ `live` = กฎของค่าที่เพิ่งพิมพ์ ขึ้นใต้ช่องทันที · ข้อ "ยังว่าง" รอจนกดไปต่อ (`historicalVisibleIssues`) */
  if (!zeroValue) {
    for (const issue of historicalMoneyIssues(state, { evidenceFileCount, todayIso, totalAmount })) issues.push(issue);
  }
  return issues;
}

/* ── จำนวนไฟล์เอกสารแทนสัญญา  return issues;
}

/* ── จำนวนไฟล์เอกสารแทนสัญญา: "ภาพนิ่งตอน mount" ⇒ ทางตันปิดฟอร์ม (รีวิว R6) ─────────────
 *
 * 🐞 ของเดิม: `serverContractFiles` ถูกตั้งครั้งเดียวตอน hydrate แล้วบวกตะกร้าไฟล์ในเครื่อง ⇒
 *    ขั้น ① สลับไปเรนเดอร์ `AttachmentsPanel` ทันทีที่มี `contractId` ซึ่ง **อัป/ลบไฟล์ขึ้น
 *    server ตรง ๆ** ⇒ ตัวนับไม่ขยับตามของจริงทั้งสองทาง:
 *      · แนบไฟล์สำเร็จ เห็นอยู่ตรงหน้า แต่ด่านยังค้าง "ต้องแนบอย่างน้อย 1 ไฟล์" ⇒ ส่งอนุมัติไม่ได้อีกเลย
 *      · ลบไฟล์ในแผง ตัวนับยังเป็น 1 ⇒ ด่านบนจอผ่าน แต่ RPC ตีกลับ historical_so_contract_file_missing
 * ⇒ กติกา: **จำนวนจากของจริงเสมอ** — แผงรายงานผ่าน `onItemsChange` (นับเฉพาะ `external_doc`
 *   ซึ่งเป็นชนิดเดียวที่ RPC ส่งอนุมัติยอมรับ) · ยังไม่รายงาน = ถอยไปใช้จำนวนที่ hydrate มา ·
 *   ไม่มีทั้งสองอย่าง = **`null` (ยังไม่รู้)** ไม่ใช่ 0 (ดู `historicalWizardLocalIssues`)
 *
 * @param contractId     มีสัญญาแล้วหรือยัง — ไม่มี = ยังเป็นตะกร้าไฟล์ในเครื่องล้วน
 * @param serverCount    จำนวนที่แผงไฟล์แนบรายงานมา (นับแล้วเฉพาะ external_doc) · null = ยังไม่รายงาน
 * @param hydratedCount  จำนวนที่ติดมากับใบตอนเปิดฟอร์ม (โหมดแก้ใบ) · null = ไม่มี
 * @param pendingCount   ไฟล์ในตะกร้าที่ **ยังไม่ได้อัป** (อัปแล้วอยู่ในจำนวนของ server แทน)
 * @returns จำนวนจริง หรือ `null` = ยังไม่รู้
 */
export function historicalContractFileCount({
  contractId = null, serverCount = null, hydratedCount = null, pendingCount = 0,
} = {}) {
  const pending = Number.isFinite(Number(pendingCount)) ? Math.max(0, Number(pendingCount)) : 0;
  if (!text(contractId)) return pending;
  const known = (value) => (value === null || value === undefined || !Number.isFinite(Number(value))
    ? null : Math.max(0, Number(value)));
  const server = known(serverCount) ?? known(hydratedCount);
  if (server === null) return pending > 0 ? pending : null;
  return server + pending;
}

/* ── ยอดใบตอนที่ยังไม่มีแผนจาก server (รีวิว R7) ─────────────────────────────────────
 *
 * 🐞 ของเดิม: ทุกตัวเลขเงินบนจอมาจาก `plan` อย่างเดียว แต่พรีวิวที่ยังมี error **ตอบ 400
 *    โดยไม่คืน plan** ⇒ ผู้คีย์มาถึงขั้น ③ พร้อม `plan === null` เสมอ (ฟอร์มเปล่าไม่มีงวด =
 *    พรีวิวรอบ ②→③ error ที่ `installments` ทุกครั้ง) ⇒ ยอดใบขึ้นขีด · แผ่น "แบ่งงวดที่เหลือ
 *    อัตโนมัติ" เทาทั้งชุด · จอบอกว่า "ตรวจขั้น ② ให้ผ่านก่อน" ทั้งที่ขั้น ② ผ่านแล้ว
 *    ⇒ ต้องคิดยอด N งวดด้วยมือให้ตรงยอดใบ ±1 สตางค์ โดยไม่เห็นยอดใบ (97 ใบของเฟส 3)
 * ⇒ **ไม่ใช่กฎชุดที่สอง**: ยอดใบมาจาก `historicalLinesMoney` ก้อนเดียวกับที่แผนใช้ (สูตรใบเสนอราคา ·
 *   import จาก historicalOrderPlan) — ที่นี่แค่ป้อนของที่อยู่บนฟอร์มให้มันตอนที่ยังไม่มีแผน
 *   ⚠️ ราคา/หน่วยบนฟอร์มคือราคาในทะเบียนตอนเลือกแพ็คเกจ (`quoteLineFromProduct`) — แผนอ่านราคาปัจจุบันเอง
 *      ⇒ ถ้าทะเบียนเพิ่งเปลี่ยนราคา ยอดที่คิดเองกับยอดของแผนต่างกันได้จนกว่าจะกดตรวจ (แผนชนะเสมอ)
 * ⚠️ มีแผน = ใช้แผนเสมอ (แผนคืนมาเฉพาะตอนไม่มี error ⇒ เงินของมันผ่านด่านครบแล้ว)
 * ⚠️ ของที่คิดเองไม่ได้ ต้องตอบ `ok:false` พร้อม **เหตุที่จริง** ไม่ใช่ยอด 0 ที่อ่านเหมือนใบ ฿0
 */
/* 🐞 รีวิว R9: `emptyText` ของช่องเลือกอ่านเป็น **คำตอบ** ("ทะเบียนไม่มีรายการ") ⇒ ตอนทะเบียน
   โหลดไม่ขึ้นมันกลายเป็นคำตอบที่ผิด และผู้คีย์ไปไล่อีกฝ่ายให้สร้างของที่มีอยู่แล้ว
   ⇒ ทุกช่องที่มีสองเหตุ ต้องพูดคนละคำ · ข้อความอยู่ที่นี่ที่เดียวทั้งสามช่อง */
/* ⚠️ ข้อความนี้ชี้ไปที่ **ปุ่มบนก้อนแดงของฟอร์ม** ⇒ เปลี่ยนป้ายปุ่มต้องเปลี่ยนที่นี่ด้วย
   (N4: ปุ่มนั้นเลิกเป็น “โหลดหน้าใหม่” แล้ว เพราะการรีโหลดชนยามของงานที่ยังไม่บันทึก) */
export const REGISTRY_LOAD_FAILED = 'โหลดทะเบียนไม่ขึ้น — กด “ลองอ่านทะเบียนอีกครั้ง” ที่ข้อความแดงด้านบน (ไม่ใช่ว่าทะเบียนไม่มีรายการ)';

export const HISTORICAL_MONEY_UNKNOWN = Object.freeze({
  vat: 'เลือกภาษีมูลค่าเพิ่มในกล่องสรุปท้ายตารางรายการ (ขั้น ②) ก่อน ระบบจึงคิดยอดใบได้',
  zones: 'เพิ่มรายการอย่างน้อย 1 บรรทัดในขั้น ② ก่อน ระบบจึงคิดยอดใบได้',
  lines: 'เลือกแพ็คเกจ / ใส่จำนวนของทุกบรรทัดในขั้น ② ให้ครบก่อน ระบบจึงคิดยอดใบได้',
  /* 🐞 รีวิว 23/09: จำนวน 1.5 / 0 เคยได้เหตุ "lines" (ให้ไปใส่ให้ครบ) ทั้งที่แพ็คเกจกับจำนวนกรอกแล้วทั้งคู่ —
     เหตุจริงโผล่ตอนกด "ถัดไป" เท่านั้น ⇒ ข้อความเดียวกับที่แผนตีกลับ (HISTORICAL_LINE_MESSAGES.qty) */
  qty: `${HISTORICAL_LINE_MESSAGES.qty} — แก้จำนวนของบรรทัดนั้นในขั้น ② ก่อน ระบบจึงคิดยอดใบได้`,
  price: 'แพ็คเกจของบางบรรทัดยังไม่ตั้งราคาในฐานข้อมูลสินค้า — ตั้งราคาที่ทะเบียนสินค้าก่อน ระบบจึงคิดยอดใบได้',
  discount: `${HISTORICAL_DISCOUNT_MESSAGES.value} — แก้ส่วนลดท้ายใบในกล่องสรุป (ขั้น ②) ก่อน ระบบจึงคิดยอดใบได้`,
  discountPercent: `${HISTORICAL_DISCOUNT_MESSAGES.percent} — แก้ส่วนลดท้ายใบในกล่องสรุป (ขั้น ②) ก่อน ระบบจึงคิดยอดใบได้`,
});

/* ส่วนลดท้ายใบของฟอร์ม → ค่าที่ป้อนสูตรได้ · กระจกของด่านในแผน (ชนิด % / บาท · ค่า ≥ 0 · % ไม่เกิน 100 · ว่าง = 0)
   @returns `{ discountType, discountValue }` หรือ `{ invalid: true, reason }` เมื่อแผนจะตีกลับ
     (reason = คีย์ของ HISTORICAL_MONEY_UNKNOWN — % เกิน 100 เป็นคนละเหตุกับ "ไม่ใช่ตัวเลข/ติดลบ" ตรงกับข้อความของแผน) */
function headerDiscountInput(state = {}) {
  const type = QUOTE_DISCOUNT_TYPES.includes(state?.discountType) ? state.discountType : null;
  if (!type) return { discountType: null, discountValue: 0 };
  const raw = text(state?.discountValue);
  const value = raw === '' ? 0 : Number(raw);
  if (!Number.isFinite(value) || value < 0) return { invalid: true, reason: 'discount' };
  if (type === 'percent' && value > 100) return { invalid: true, reason: 'discountPercent' };
  return { discountType: type, discountValue: value };
}

/* ด่านของแถวโซนหนึ่งแถวก่อนคิดเงิน — **ตัวเดียว** ที่ยอดใบ (historicalMoneyView) และเซลล์ "จำนวนเงิน" ของ
   ขั้น ② (historicalZoneLineAmount) ถาม ⇒ แถวที่เซลล์พูดขีด คือแถวเดียวกับที่ทำให้ยอดใบยังคิดไม่ได้
   · ด่านเดียวกับแผน: จำนวนว่าง/ไม่ใช่จำนวนเต็ม = ยังคิดไม่ได้ (ไม่ใช่ 1 แบบใบเสนอราคา — มติ 23/09)
   · ว่าง ≠ ผิดรูป: ว่าง = "ยังไม่ได้ใส่" (lines) · 1.5 / 0 = "ใส่แล้วแต่ใช้ไม่ได้" (qty) — คนละคำตอบ คนละทางแก้
   · ราคาว่าง = แถวยังไม่ได้ผ่าน quoteLineFromProduct (ยังไม่รู้ราคา) ≠ ราคา 0 ในทะเบียน (รู้แล้วว่ายังไม่ตั้ง)
   @returns `{ input }` (ป้อน quoteLineMoney ได้เลย) หรือ `{ reason }` = คีย์ของ HISTORICAL_MONEY_UNKNOWN */
function zoneRowMoneyInput(row) {
  if (!text(row?.productId) || text(row?.qty) === '') return { reason: 'lines' };
  const qty = Number(row.qty);
  if (!Number.isInteger(qty) || qty <= 0) return { reason: 'qty' };
  if (text(row?.unitPrice) === '') return { reason: 'lines' };
  const price = Number(row.unitPrice);
  if (!Number.isFinite(price) || price <= 0) return { reason: 'price' };
  return { input: { qty, unitPrice: price, discountType: row.discountType, discountValue: row.discountValue } };
}

/**
 * จำนวนเงินของแถวโซนหนึ่งแถว — ค่าที่เซลล์ "จำนวนเงิน" ของขั้น ② พูด (สูตรใบเสนอราคา `quoteLineMoney`)
 * ⚠️ `known` เท็จ = เซลล์พูดขีด ไม่ใช่ 0.00 — ใบเสนอราคานับจำนวนว่างเป็น 1 แต่ใบย้อนหลังตีกลับ
 *   (แถวที่ยังไม่เลือกแพ็คเกจ / ยังไม่ใส่จำนวน / จำนวนไม่ใช่จำนวนเต็ม > 0 / แพ็คเกจยังไม่ตั้งราคา ยังไม่มียอดให้พูด)
 * @returns `{ known: true, lineTotal }` หรือ `{ known: false, lineTotal: null, reason, qtyNote }`
 *   - reason: คีย์ของ HISTORICAL_MONEY_UNKNOWN (ตัวเดียวกับที่ยอดใบใช้บอกเหตุ)
 *   - qtyNote: ข้อความใต้ช่องจำนวนของแถวนั้น (เฉพาะจำนวนผิดรูป — เหตุอื่นเห็นได้จากช่องเองอยู่แล้ว)
 */
export function historicalZoneLineAmount(row = {}) {
  const { input, reason } = zoneRowMoneyInput(row);
  if (!input) {
    return { known: false, lineTotal: null, reason, qtyNote: reason === 'qty' ? HISTORICAL_LINE_MESSAGES.qty : null };
  }
  return { known: true, lineTotal: quoteLineMoney(input).lineTotal };
}

/**
 * ราคา/หน่วยของแผนที่ตรวจผ่าน → แถวโซนบนจอ (รีวิว 23/09)
 * 🐞 แผนอ่านราคาจากทะเบียน **ตอนกดตรวจ** (`products.costPrice`) แต่แถวถือราคาที่เติมตอนเลือกแพ็คเกจจาก
 *    ลิสต์สินค้าที่แคชไว้ถึง 2 นาที ⇒ ทะเบียนขยับราคาระหว่างทาง (หรือใบที่ถูกตีกลับแล้วเปิดใหม่) = เซลล์
 *    "จำนวนเงิน" กับยอดไซต์พูดราคาเก่า ขณะที่ยอดใบ/ขั้น ③/④ พูดราคาของแผน — จอเดียวสองตัวเลข
 *    ใบเสนอราคาไม่เป็นเพราะโหลดบรรทัดใหม่จาก server หลังบันทึก ⇒ ที่นี่ทำแบบเดียวกันกับแผน
 * ⚠️ แตะแค่ `unit` · `unitPrice` ของแถวที่แพ็คเกจตรงกับบรรทัดของแผน (จับคู่ด้วยโซน) — ไม่ใช่การแก้ฟอร์ม
 *   ⇒ ผู้เรียกตั้ง state ตรง ๆ **ไม่ผ่าน patch** (patch ปั๊ม dirty และทิ้งแผนที่เพิ่งตรวจผ่าน)
 * ⚠️ แผนที่ยังมี error ไม่ถูกเชื่อ (บล็อกเงินเป็นศูนย์ทั้งก้อน — เหตุเดียวกับ historicalMoneyView)
 * @returns อาร์เรย์เดิม (อ้างอิงเดียวกัน) เมื่อไม่มีอะไรเปลี่ยน — ผู้เรียกใช้ `!==` ตัดสินว่าต้องตั้ง state ไหม
 */
export function historicalZonesWithPlanPrices(zones = [], plan = null) {
  if (!plan || list(plan.errors).length) return zones;
  const byZone = new Map(list(plan.lines).filter((line) => text(line?.zoneId)).map((line) => [text(line.zoneId), line]));
  let changed = false;
  const next = list(zones).map((row) => {
    const line = byZone.get(text(row?.zoneId));
    if (!line || text(line.productId) !== text(row?.productId)) return row;
    const unitPrice = Number(line.unitPrice);
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) return row;
    const unit = text(line.unit) || text(row.unit);
    if (text(row.unitPrice) !== '' && toSatang(row.unitPrice) === toSatang(unitPrice) && text(row.unit) === unit) return row;
    changed = true;
    return { ...row, unit, unitPrice };
  });
  return changed ? next : zones;
}

/**
 * ยอดใบที่จอใช้ได้ตรง ๆ — `{ ok, source, reason, subtotal, vatAmount, totalAmount }`
 * `ok` เท็จ = ยังไม่รู้ยอด (ทุกช่องเป็น null และ `reason` บอกว่าขาดอะไร)
 *
 * ลำดับความน่าเชื่อ: แผนที่ไม่มี error → **ยอดที่ server ส่งมากับ 400 ของพรีวิว** → คิดเองจากฟอร์ม
 * @param serverMoney `{ subtotal, vatAmount, totalAmount }` จาก `data.money` ของพรีวิวที่ตอบ 400
 *   (`null` = server บอกเองว่ายังคิดยอดไม่ได้ ⇒ ถอยไปคิดเอง ซึ่งจะได้ `ok:false` พร้อมเหตุอยู่แล้ว)
 */
export function historicalMoneyView(state = {}, plan = null, serverMoney = null) {
  /* 🪤 เชื่อแผนได้ **เฉพาะแผนที่ไม่มี error** — แผนที่เงินยังไม่ผ่านด่านคืนบล็อกเงินเป็นศูนย์ทั้งก้อน
     (moneyOk เท็จ ⇒ subtotal/vat/total เป็นศูนย์หมด) ⇒ เชื่อตามนั้น = พิมพ์ศูนย์บาทว่าเป็นยอดใบ
     วันนี้เส้นพรีวิวคืนแผนเฉพาะตอนไม่มี error อยู่แล้ว · ด่านนี้กันวันที่ข้อนั้นเปลี่ยน */
  if (plan?.header && !list(plan.errors).length) {
    return {
      ok: true,
      source: 'plan',
      reason: null,
      subtotal: plan.header.subtotal,
      discountAmount: Number(plan.header.discountAmount) || 0,
      vatAmount: plan.header.vatAmount,
      totalAmount: plan.header.totalAmount,
    };
  }
  /* ⭐ R7 (ครึ่ง server): พรีวิวที่ยังไม่ผ่านคืน "ครึ่งเงิน" ของแผนมาด้วย ⇒ ใช้ของ server
     ⇒ จอกับฐานพูดเลขเดียวกันตั้งแต่ก่อนแผนผ่าน · การคิดเองด้านล่างเหลือไว้สำหรับก่อนกดตรวจครั้งแรก
     ⚠️ ผู้เรียกต้องทิ้งค่านี้ทุกครั้งที่ฟอร์มถูกแก้ (`patch`) — ไม่ทิ้ง = ยอดของ payload เก่าค้างบนจอ */
  const fromServer = Number(serverMoney?.totalAmount);
  if (serverMoney && Number.isFinite(fromServer)) {
    return {
      ok: true,
      source: 'server',
      reason: null,
      subtotal: serverMoney.subtotal,
      discountAmount: Number(serverMoney.discountAmount) || 0,
      vatAmount: serverMoney.vatAmount,
      totalAmount: serverMoney.totalAmount,
    };
  }
  const unknown = (reason, partial = {}) => ({
    ok: false, source: 'local', reason,
    subtotal: null, discountAmount: null, vatAmount: null, totalAmount: null, ...partial,
  });
  /* ⭐ ลำดับเหตุตามลำดับบนจอ (มติ 25/09): ตารางรายการอยู่บน กล่องสรุป (ส่วนลด · VAT) อยู่ล่าง
     ⇒ ถามบรรทัดก่อน แล้วค่อยส่วนลดท้ายใบ แล้วค่อย VAT */
  const zones = list(state.zones);
  if (!zones.length) return unknown(HISTORICAL_MONEY_UNKNOWN.zones);
  const rows = [];
  for (const row of zones) {
    const { input, reason } = zoneRowMoneyInput(row);
    if (!input) return unknown(HISTORICAL_MONEY_UNKNOWN[reason]);
    rows.push(input);
  }
  const discount = headerDiscountInput(state);
  if (discount.invalid) return unknown(HISTORICAL_MONEY_UNKNOWN[discount.reason] || HISTORICAL_MONEY_UNKNOWN.discount);
  const vatRate = state.vatRate;
  if (!HISTORICAL_VAT_RATES.includes(vatRate)) {
    /* ⭐ ยังไม่เลือก VAT = ยอดทั้งสิ้นยังไม่รู้ แต่ **ยอดรวมสินค้า/บริการกับส่วนลดรู้แล้ว** — กล่องสรุปของขั้น ②
       ต้องพูดสองแถวนั้นได้ตั้งแต่ก่อนเลือก VAT (ใบเสนอราคาพูดได้เสมอ) · `ok` ยังเท็จ ⇒ ขั้น ③/แถบสรุปไม่เชื่อยอดนี้ */
    const partial = historicalLinesMoney(rows, 0, discount);
    return unknown(HISTORICAL_MONEY_UNKNOWN.vat, { subtotal: partial.subtotal, discountAmount: partial.discountAmount });
  }
  const money = historicalLinesMoney(rows, vatRate, discount);
  return {
    ok: true,
    source: 'local',
    reason: null,
    subtotal: money.subtotal,
    discountAmount: money.discountAmount,
    vatAmount: money.vatAmount,
    totalAmount: money.totalAmount,
  };
}

/**
 * กล่องสรุปท้ายตารางรายการ (ขั้น ② และ ④) — ป้ายของใบเสนอราคา: ยอดรวมสินค้า/บริการ · หัก ส่วนลด ·
 * ยอดหลังหักส่วนลด · ภาษีมูลค่าเพิ่ม (ตัวเลือก VAT) · ยอดรวมทั้งสิ้น
 * ⭐ ตัวเดียวที่สองขั้นอ่าน ⇒ ป้ายไม่มีทางพูดคนละคำระหว่างขั้นคีย์ (กล่องแก้ได้) กับขั้นตรวจ (กล่องอ่านอย่างเดียว)
 * ⭐ ส่วนลดท้ายใบ (มติ 25/09) — แถว "หัก ส่วนลด" / "ยอดหลังหักส่วนลด" ขึ้นเมื่อมีส่วนลดจริง (แบบกล่องของใบเสนอราคา)
 * @param money   `{ ok, subtotal, discountAmount, vatAmount, totalAmount }` (ขั้น ②: historicalMoneyView · ขั้น ④: header ของแผน + ok)
 *   ⚠️ `ok` เท็จแต่มี `subtotal` = ยังไม่เลือก VAT (ยอดรวมสินค้า/ส่วนลดรู้แล้ว) ⇒ พูดสองแถวนั้น ที่เหลือเป็นขีด
 * @param vatRate ตัวเลือก VAT ของใบ (0 = รวม VAT แล้ว ⇒ แถว VAT เป็นขีด เหมือนท้ายตารางใบเสนอราคา)
 * @returns `{ rows: [{ id, label, value }], grandTotal, values }` — ยังไม่รู้ยอด = ขีด/null (ห้ามเป็น 0.00)
 *   - values: `{ subtotal, discount, afterDiscount, vat, total }` เป็นข้อความพร้อมวาง (null = ขีด) ของกล่องแบบแก้ได้
 */
export function historicalTotalsView(money = {}, vatRate = null) {
  const ok = Boolean(money?.ok);
  const vatLabel = HISTORICAL_VAT_RATES.includes(Number(vatRate)) && vatRate !== null ? vatLabelOf(Number(vatRate)) : null;
  const known = (value) => value !== null && value !== undefined && Number.isFinite(Number(value));
  const subtotalKnown = known(money?.subtotal);
  const discountAmount = known(money?.discountAmount) ? Number(money.discountAmount) : 0;
  const hasDiscount = subtotalKnown && discountAmount > 0;
  const values = {
    subtotal: subtotalKnown ? fmtMoney(money.subtotal) : null,
    discount: hasDiscount ? `-${fmtMoney(discountAmount)}` : null,
    afterDiscount: hasDiscount ? fmtMoney(Number(money.subtotal) - discountAmount) : null,
    vat: ok && Number(vatRate) > 0 ? fmtMoney(money.vatAmount) : null,
    total: ok ? fmtMoney(money.totalAmount) : null,
  };
  return {
    rows: [
      { id: 'subtotal', label: 'ยอดรวมสินค้า/บริการ', value: values.subtotal },
      ...(hasDiscount ? [
        { id: 'discount', label: 'หัก ส่วนลด', value: values.discount },
        { id: 'afterDiscount', label: 'ยอดหลังหักส่วนลด', value: values.afterDiscount },
      ] : []),
      {
        id: 'vat',
        label: vatLabel ? `ภาษีมูลค่าเพิ่ม (${vatLabel})` : 'ภาษีมูลค่าเพิ่ม',
        value: values.vat,
      },
    ],
    grandTotal: values.total || NA,
    values,
  };
}

/* ── เปลือกของฟอร์ม: ป้ายปุ่ม · จุดยึดของช่อง · ราง · แถบสรุป · ถ้อยคำของแถบท้าย ──────────
 *
 * 🔴 ทั้งก้อนนี้เกิดจาก UAT 23/09 ซึ่งเจอ **อาการเดียวกันสี่หน้ากาก**: จอพูดถึงของที่ไม่มีอยู่จริง
 *   หรือพูดแทนข้อมูลที่ยังไม่ได้ถาม ⇒ คำบนจอต้องประกอบจากตัวตัดสินที่ตรึงด้วยเทสต์ได้
 *   ไม่ใช่สตริงที่พิมพ์ทิ้งไว้ใน JSX (สตริงใน JSX ไม่มีใครเฝ้าให้ว่ามันยังจริงอยู่ไหม)
 */

/* ป้ายของปุ่มบนแถบท้าย — **ที่เดียวของทั้งฟอร์ม**
   🐞 UAT 23/09: ขั้น ④ สั่งให้กด "ตรวจอีกครั้ง" ซึ่งไม่มีปุ่มนั้นอยู่บนจอเลย ⇒ ผู้คีย์มองหาปุ่ม
      ที่ไม่มีวันเจอ · คำสั่งที่ชี้ปุ่มต้องอ้างค่าคงที่ตัวเดียวกับที่ปุ่มนั้นใช้เป็นป้าย */
export const HISTORICAL_SAVE_BUTTON_LABEL = 'บันทึกและส่งอนุมัติ';
export const HISTORICAL_NEXT_BUTTON_LABEL = 'ถัดไป';

/* ── ขั้นที่ไม่มีแถบสรุปข้างขวา ─────────────────────────────────────────────────────
 * ⭐ ขั้น ② (บรรทัดโซน) และ ④ (ตารางรายการฝั่งอ่าน) คือตารางรายการของใบเสนอราคา ซึ่งต้องการกล่อง ≥ 900px
 *   (`QUOTE_LINES_MIN_WIDTH` — แคบกว่านั้นตารางพับเป็นการ์ดต่อบรรทัด)
 * 🐞 รีวิว/UAT 23/09 (วัดจริง): รางขั้น 13rem + แถบสรุป 330px กินที่จนเนื้อขั้นเหลือ 826px ที่จอ 1440 และ 866px
 *   ที่จอ 1920 ⇒ ตารางสองขั้นนี้เป็นการ์ดเสมอบนเดสก์ท็อป ขณะที่ใบเสนอราคาที่จอเดียวกันเป็นตาราง (956px) —
 *   ขัดมติเจ้าของ 23/09 "ต้องไม่ต่างจาก form ใบเสนอราคา" ตรงจุดที่เห็นชัดที่สุด
 * ⇒ สองขั้นนี้ยุบแถบสรุปออกให้ตารางได้ความกว้างเต็มคอลัมน์ (≈1140px ที่จอ 1440) · ของที่แถบสรุปบอก
 *   มีอยู่ในขั้นเองแล้ว (ขั้น ②: กล่องสรุปท้ายตาราง · ขั้น ④: การ์ดสรุปทั้งใบ) · ขั้น ① ③ ยังมีแถบสรุปตามม็อก
 */
/* ⭐ มติเจ้าของ 25/09 (รื้อขั้น ①): ขั้น ① ถอดแถบสรุปด้วย — ของที่ขั้น ① มีจริงขึ้นเป็นช่องสรุปบนหัวเอกสาร
     (`historicalContractFacts`) · ⭐ มติเจ้าของ 25/09 (รื้อขั้น ③): ขั้น ③ ถอดด้วย — ยอดใบ · หักงวดยกมา · งวดที่ยังต้องเก็บ
     อยู่ในกล่องสรุปท้ายตารางงวดแล้ว (ยอดใบขึ้นสองที่ = เสียงรบกวน) ⇒ **ไม่มีแถบสรุปข้างขวาในขั้นไหนแล้ว**
     ⚠️ `historicalAsideRows` ยังอยู่ — เป็นแหล่งของช่องสรุปบนหัวขั้น ① (แถวชุดเดียว สองที่พูดคำเดียวกัน) */
export const HISTORICAL_FULL_WIDTH_STEPS = Object.freeze([...HISTORICAL_WIZARD_STEP_ORDER]);

/* ── ข้อที่ต้องแก้ขึ้นเมื่อไร (มติเจ้าของ 25/09 — "กล่องแดงขึ้นหลังกด ถัดไป เท่านั้น ใช้ทุกขั้น") ─────────
 * 🐞 ของเดิม: เปิดฟอร์มเปล่ามาก็เจอก้อนแดง "ต้องแก้ 1 ข้อ" ทันที (ไฟล์สัญญายังไม่แนบ) · เปิดขั้น ② ก็เจอ "เลือก VAT"
 *    ก่อนผู้คีย์จะได้แตะอะไร ⇒ เจ้าของบอกว่าจอรกและสับสนเป็นข้อแรก
 * ⇒ กติกา: ขั้นที่ **ผู้คีย์ยังไม่เคยกดไปต่อ** (ถัดไป · แตะขั้นข้างหน้าบนราง · บันทึก) = ไม่มีก้อนแดง และไม่มีข้อความใต้ช่อง
 *   ของช่องที่ "ยังว่าง" · ยกเว้น **ข้อที่พูดถึงค่าที่ผู้คีย์เพิ่งพิมพ์** (`HISTORICAL_LIVE_ISSUE_FIELDS`) — วันสัญญาที่พิมพ์
 *   เกินวันนี้/ก่อนวันเริ่มต้องบอกตรงนั้นทันที (UAT 23/09: ช่องวันเคยกลืนค่าเงียบ ๆ)
 * ⚠️ แค่ **ซ่อนการแสดง** — ด่านของปุ่มยังอ่านข้อครบทุกข้อ (`historicalNextBlock` / ด่านบันทึก) ⇒ กดแล้วติด = ขั้นนั้นถูก
 *   "เปิดเผย" ทันที ก้อนแดง + ข้อความใต้ช่องขึ้นพร้อมกัน แล้วพาไปที่ช่องแรกที่ผิด
 */
/**
 * ขั้นนี้มีของที่ผู้คีย์ใส่ไว้แล้วหรือยัง — ตัวตัดสินว่า error ที่ **พกมาถึง** ขั้นปลายทางควรเปิดเผยทันทีไหม
 * 🐞 UAT 25/09: เดินจากขั้น ② มาขั้น ③ ของใบใหม่ = ก้อนแดง "ต้องมีงวดอย่างน้อย 1 งวด / เลือกว่าเคยเก็บเงินไหม"
 *    รอต้อนรับทั้งที่ยังไม่ได้แตะอะไร (ข้อ "ยังว่าง" ของขั้นข้างหน้าติดมากับพรีวิวทุกครั้ง)
 *    ⇒ เปิดเผยเฉพาะขั้นที่มีของอยู่แล้ว (ใบที่ถูกตีกลับ · กลับไปแก้ขั้นก่อนแล้วเดินมาใหม่) — ขั้นว่างรอกด "ถัดไป" ของมันเอง
 */
export function historicalStepHasInput(state = {}, step = 'contract') {
  if (step === 'zones') return list(state.zones).length > 0;
  if (step === 'money') {
    return state.hasOpening === true || state.hasOpening === false || list(state.installments).length > 0;
  }
  if (step === 'contract') {
    return Boolean(text(state.customerId) || text(state.ownerId) || text(state.contract?.docKind));
  }
  return true;
}

/**
 * @param issues   ข้อของขั้นนั้นทั้งหมด (local + server)
 * @param revealed ผู้คีย์เคยกดไปต่อจากขั้นนี้แล้วหรือยัง
 * @returns `{ issues, summary }` — issues = ข้อที่วาดใต้ช่องได้ · summary = วาดก้อนแดงหัวขั้นไหม
 * ⚠️ ก่อนเปิดเผย ผ่านได้เฉพาะข้อ `live: true` (กฎของค่าที่เพิ่งพิมพ์ — `historicalContractDateIssues`) ·
 *    ข้อ "ยังไม่ได้กรอก" ของช่องเดียวกัน (HISTORICAL_REQUIRED_MESSAGES) ไม่ live ⇒ รอจนกดไปต่อ
 */
export function historicalVisibleIssues(issues = [], { revealed = false } = {}) {
  const all = list(issues);
  if (revealed) return { issues: all, summary: all.length > 0 };
  return { issues: all.filter((issue) => issue?.live === true), summary: false };
}

/**
 * ช่องสรุปบนหัวเอกสารของขั้น ① (มติ 25/09 — แทนแถบสรุปข้างขวา) — **แถวชุดเดียวกับแถบสรุป** (`historicalAsideRows`)
 * ⇒ สองที่พูดคำเดียวกันเสมอ (ลูกค้า · AE · ช่วงสัญญา · ไฟล์) · ค่าว่าง = null (ผู้เรียกวาดเป็นขีด)
 * @param rows ผลของ `historicalAsideRows`
 * @returns `[{ key, label, value }]` ตามลำดับบนหัว
 */
export function historicalContractFacts(rows = []) {
  const byId = new Map(list(rows).map((row) => [row?.id, row]));
  return [
    { key: 'customer', label: 'ลูกค้า' },
    { key: 'owner', label: 'AE ผู้ดูแล' },
    { key: 'span', label: 'ช่วงสัญญา' },
    { key: 'files', label: 'ไฟล์เอกสาร' },
  ].map((fact) => ({ ...fact, value: text(byId.get(fact.key)?.value) || null }));
}

/** ป้ายสถานะบนหัวเอกสารของขั้น ① — ใบที่ยังไม่เกิด / ร่าง / ถูกตีกลับ */
export function historicalDocStatusLabel(state = {}) {
  if (!text(state.orderId)) return 'ยังไม่ออกใบ';
  /* ⭐ ใบที่ถูกตีกลับแล้วบันทึกแก้ = RPC พลิกเป็นร่าง แต่ยังเป็น "ส่งใหม่" จนกว่าจะส่ง — ป้ายเดินตามป้ายตีกลับ (`rejection` รอดการพลิก ·
     รีวิวขั้น ④ 25/09: เคยขึ้นป้ายตีกลับคู่กับ "ฉบับร่าง") */
  if (text(state.status) === 'rejected' || state.rejection) return 'ถูกตีกลับ — แก้แล้วส่งใหม่';
  return 'ฉบับร่าง — ยังไม่ส่งอนุมัติ';
}

/* ── จุดยึดของช่องบน DOM ────────────────────────────────────────────────────────
 *
 * 🐞 UAT 23/09 (ทางตัน): กด "ถัดไป" ตอนยังไม่แนบไฟล์เอกสารแทนสัญญา = **ไม่มีอะไรเกิดขึ้นเลย**
 *    (`if (issuesForStep(localIssues, from).length) { setIssues([]); return; }`) — ปุ่มอ่านเหมือน
 *    ปุ่มตาย ซ้ำยังล้าง error ของ server ที่ค้างอยู่บนจอทิ้งไปด้วย
 * ⇒ กติกา (กฎบ้าน ui-visibility): ติดด่าน = **คาข้อความไว้ + พาไปที่ช่องนั้น + ทำเครื่องหมายว่าผิด**
 * ⚠️ ช่องที่ server ตีกลับกับช่องที่จอตรวจเองต้องได้จุดยึด **เดียวกัน** (VAT ของใบคือแผ่นตัวเลือกใบเดียว —
 *   ทั้งคำตอบที่ยังไม่เลือกและโหมดรุ่นก่อนที่ถูกถอดตกที่ `vatRate`) ไม่งั้นพาไปหา id ที่ไม่มีอยู่จริง
 */
const FIELD_ANCHOR = new Map([
  ['customerId', 'customer'], ['ownerId', 'owner'], ['team', 'team'],
  ['contract.startDate', 'contract-start'], ['contract.endDate', 'contract-end'],
  ['contract.ref', 'contract-ref'], ['contract.file', 'contract-file'],
  ['vatRate', 'vat'], ['discount', 'discount'],
  ['zones', 'zones'],
  ['opening', 'opening'], ['opening.evidence', 'opening-evidence'],
  /* ⭐ มติ 25/09 (รื้อขั้น ③): ทุกช่องของงวดยกมามีจุดยึดของตัวเอง · งวดรายแถวใช้ชื่อช่องตรง ๆ
     (`installments.<i>.<ช่อง>` → hist-f-installments-<i>-<ช่อง>) ซึ่งตารางงวดวาด id เดียวกันด้วยตัวนี้ */
  ['opening.amount', 'opening-amount'], ['opening.coversTo', 'opening-covers-to'],
  ['opening.paidOn', 'opening-paid-on'], ['opening.note', 'opening-note'],
  ['installments', 'installments'],
]);

/** id ของกล่องช่องบนจอ — ผู้เรียกใช้ทั้งตอนวาด (`id=`) และตอนพาไปหา (`getElementById`) */
export function historicalFieldAnchorId(field) {
  const name = text(field);
  if (!name) return null;
  return `hist-f-${FIELD_ANCHOR.get(name) || name.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}`;
}

/**
 * กด "ถัดไป" (หรือแตะขั้นข้างหน้าบนราง) ทั้งที่ขั้นที่ยืนอยู่ยังมีข้อที่จอตรวจเองได้
 * @returns `{ blocked, issues, field, anchorId, message }` — `blocked` เท็จ = เดินต่อได้ตามปกติ
 * ⚠️ ผู้เรียก **ห้ามล้าง error ที่อยู่บนจอ** ตอนติดด่าน — สิ่งที่ต้องทำคือพาไปหาช่องแรกที่ผิด
 */
export function historicalNextBlock(localIssues = [], step = 'contract') {
  const blocking = issuesForStep(localIssues, step);
  const first = blocking[0] || null;
  return {
    blocked: blocking.length > 0,
    issues: blocking,
    field: first ? text(first.field) || null : null,
    anchorId: first ? historicalFieldAnchorId(first.field) : null,
    message: first ? text(first.message) || null : null,
  };
}

/* ชนิดเอกสารที่ยังไม่เลือก = ไม่มีคำ (ป้ายกลางคืนขีดให้ชนิดที่ไม่รู้จัก ซึ่งอ่านเหมือนค่าที่หายไป) */
const docKindText = (kind) => {
  const label = text(kind) ? externalDocKindLabel(kind) : '';
  return label === '—' ? '' : label;
};

/**
 * รางขั้น — **สรุปที่เป็นความจริง ไม่ใช่เศษส่วนที่เดาเอาเอง**
 *
 * 🐞 UAT 23/09 (รางโกหก): ของเดิมส่ง `count: { filled: stepIssues ? 0 : 1, total: 1 }` ⇒ บนฟอร์ม
 *    เปล่า ๆ ขั้น "ไซต์ โซน และแพ็ค" กับ "ตรวจและส่งอนุมัติ" ขึ้น **1/1 (ครบ)** เพราะ error ของสองขั้นนั้น
 *    มาจากพรีวิวของ server ซึ่งยังไม่เคยรักันสักครั้ง ⇒ รางบอกว่างานเสร็จ ทั้งที่ยังไม่ได้เริ่ม
 * ⇒ เลิกใช้เศษส่วน · ขั้นละหนึ่งบรรทัดตามม็อก ("4 โซน" · "ยกมา 1 งวด · ต้องเก็บ 1 งวด")
 *   ⚠️ ไม่นับ "แพ็ค" แล้ว (มติ 23/09) — จำนวนของแต่ละบรรทัดมีหน่วยของสินค้าตัวเอง บวกข้ามบรรทัดไม่มีความหมาย
 *   และจุดสีบอกเฉพาะสิ่งที่รู้จริง: มีข้อต้องแก้ (some) · กรอกแล้ว (full) · ยังว่าง (none)
 * ⚠️ ใช้เฉพาะช่องที่ `SectionRail` มีอยู่แล้ว (label/tone/title) — ไม่เพิ่มช่องให้ primitive กลาง
 *   เพื่อจอเดียว · บรรทัดสรุปถูกส่งเป็น node ของ `label` ที่ผู้เรียกประกอบเอง
 *
 * @param step ขั้นที่ยืนอยู่ — ใช้ตัดสินว่าขั้นข้างหน้า "แตะแล้วไปไม่ได้เพราะอะไร"
 */
const STEP_MARKS = Object.freeze({ contract: '①', zones: '②', money: '③', review: '④' });

export function historicalWizardRail(state = {}, {
  step = 'contract', localIssues = [], serverIssues = [], plan = null, customerLabel = null, revealedSteps = null,
  zeroValue = null, duplicatesPending = false,
} = {}) {
  const all = [...list(localIssues), ...list(serverIssues)];
  const block = historicalNextBlock(localIssues, step);
  const reviewLocal = plan ? firstStepWithIssues(list(localIssues)) : null;
  const here = HISTORICAL_WIZARD_STEP_ORDER.indexOf(step);
  const zones = list(state.zones);
  const installments = list(state.installments);
  const docKind = docKindText(state.contract?.docKind);

  const summaries = {
    contract: [text(customerLabel), docKind].filter(Boolean).join(' · '),
    zones: zones.length ? historicalLinesSummary(zones) : '',
    /* ธงใบ ฿0 ตัวเดียวกับขั้น ③ (`historicalZeroValue`) — ไม่ส่ง = อ่านจากแผนแบบเดิม */
    money: (zeroValue ?? plan?.zeroValue) ? 'ใบยอด 0 บาท — ไม่มีงวด' : (() => {
      const mode = historicalOpeningMode(state);
      if (mode === 'full') return 'จ่ายครบทั้งใบแล้ว · ไม่มีงวดต้องเก็บ';
      return [
        mode === 'part' ? 'ยกมา 1 งวด' : (mode === 'none' ? 'ไม่มีงวดยกมา' : ''),
        installments.length ? `ต้องเก็บ ${fmtNumber(installments.length)} งวด` : '',
      ].filter(Boolean).join(' · ');
    })(),
    /* ขั้น ④ มีของให้สรุปก็ต่อเมื่อพรีวิวผ่านแล้วจริง ๆ — ไม่มีแผน = ยังไม่มีอะไรถูกตรวจ */
    /* ⭐ 25/09 (รื้อขั้น ④): ใบที่อาจซ้ำยังไม่ยืนยัน = ยังไม่พร้อมส่ง — รางต้องไม่พูดว่า "พร้อมส่ง" (ของเดิมพูดทั้งที่ปุ่มติดด่าน) */
    /* 🐞 รีวิวขั้น ④ 25/09: มีข้อที่จอตรวจเองค้าง (เช่นเอาไฟล์ที่อัปไม่ขึ้นออกจากตะกร้าแล้วไม่เหลือไฟล์) = ปุ่มติดด่าน ⇒ รางต้องบอกด้วย */
    review: plan ? (reviewLocal
      ? `ตรวจแล้ว — ขั้น ${STEP_MARKS[reviewLocal]} ต้องแก้ ${fmtNumber(issuesForStep(localIssues, reviewLocal).length)} ข้อ`
      : (duplicatesPending ? 'ตรวจแล้ว — ต้องยืนยันใบที่อาจซ้ำ' : 'ตรวจแล้ว — พร้อมส่ง')) : '',
  };
  /* ขั้น ④ ที่ปุ่มติดด่าน (ข้อค้าง/ใบซ้ำยังไม่ยืนยัน) = จุดสีเหลือง ไม่ใช่ "ครบ" */
  const reviewGated = Boolean(plan) && (Boolean(reviewLocal) || duplicatesPending);

  return HISTORICAL_WIZARD_STEPS.map((item, index) => {
    /* ⭐ มติ 25/09: จุด "มีข้อต้องแก้" บนรางเดินกติกาเดียวกับก้อนแดง — ขั้นที่ยังไม่เคยกดไปต่อไม่ขึ้นสีผิด
       (`revealedSteps` ไม่ส่ง = นับทุกขั้นแบบเดิม) · ข้อความ "ยังไปขั้นนี้ไม่ได้" ของขั้นข้างหน้ายังอ่านข้อครบเสมอ */
    const counted = !revealedSteps || revealedSteps.has(item.key);
    const issues = counted ? issuesForStep(all, item.key).length : 0;
    const summary = text(summaries[item.key]);
    const blocked = index > here && block.blocked ? `ยังไปขั้นนี้ไม่ได้ — ${block.message}` : null;
    return {
      key: item.key,
      label: item.label,
      /* ไม่มีอะไรจะสรุป = บอกว่าขั้นนี้ถามอะไร (ป้ายเดิมของม็อก) ไม่ใช่ปล่อยบรรทัดว่าง */
      summary: summary || item.hint,
      filled: Boolean(summary),
      issues,
      tone: issues || (item.key === 'review' && reviewGated) ? 'some' : (summary ? 'full' : 'none'),
      blocked,
      title: [item.hint, blocked].filter(Boolean).join(' · '),
    };
  });
}

/**
 * แถบ "สรุปใบ" ข้างฟอร์ม (ม็อก Step1–Step4)
 *
 * 🐞 UAT 23/09 (แถบสรุปโกหก): แถว "ลูกค้า" กับ "AE ผู้ดูแล" อ่านจาก `plan?.header` อย่างเดียว ⇒
 *    เลือกลูกค้าแล้วยังขึ้นขีดอยู่ ทั้งที่แถว "ช่วงสัญญา" ใต้มันขยับทันที (แถวนั้นอ่าน state)
 *    ⇒ ครึ่งหนึ่งของแถบค้างอยู่ในอดีตจนกว่าจะมีคนกดตรวจ โดยไม่มีอะไรบอกว่าทำไม
 * ⇒ **ทุกแถวถอยมาที่ state ของฟอร์มเสมอ** · เหลือว่างได้เฉพาะของที่มีแต่ server คิดให้ได้
 *   (ยอดรวมสินค้า/บริการ · ภาษีมูลค่าเพิ่ม) ซึ่งผู้คีย์ไม่ได้พิมพ์เองอยู่แล้ว
 * ⭐ ป้ายเงินเป็นป้ายท้ายตารางของใบเสนอราคา (มติ 23/09) — "ยอดรวมสินค้า/บริการ" · "ภาษีมูลค่าเพิ่ม" · ตัวเลือก VAT
 * @returns `[{ id, label, value }]` — `value` เป็นข้อความพร้อมวาง หรือ null (ผู้เรียกแปลงเป็นขีดเอง)
 */
export function historicalAsideRows(state = {}, {
  plan = null, serverMoney = null, customerLabel = null, ownerLabel = null,
  contractFileCount = 0, evidenceFileCount = 0,
} = {}) {
  const zones = list(state.zones);
  /* ⚠️ ยอดก่อน VAT / VAT ถอยมาที่ยอดที่ server ส่งมากับ 400 ของพรีวิว แล้วจึงคิดเอง (รีวิว R7 สองครึ่ง)
     — ขีดค้างตลอดรอบคีย์คือสิ่งที่ทำให้ผู้คีย์ต้องคิดยอดงวดโดยไม่เห็นยอดใบ */
  const money = historicalMoneyView(state, plan, serverMoney);
  const span = contractSpan(state.contract?.startDate, state.contract?.endDate);
  const refs = [state.refs?.quote, state.refs?.express, state.refs?.invoice].map(text).filter(Boolean);
  const docKind = docKindText(state.contract?.docKind);
  const openingRows = plan?.opening || state.hasOpening === true ? 1 : 0;
  const restRows = plan?.installments?.length ?? (state.openingFull === true ? 0 : list(state.installments).length);

  const vat = HISTORICAL_VAT_RATES.includes(state.vatRate) ? vatLabelOf(state.vatRate) : null;

  const openingValue = (() => {
    if (plan?.opening) return `${fmtMoney(plan.opening.amount)} · หลักฐาน ${fmtNumber(evidenceFileCount)} ไฟล์`;
    if (state.hasOpening === false) return 'ไม่มี — ยังไม่เคยเก็บเงิน';
    if (state.hasOpening !== true) return null;
    if (state.openingFull === true) {
      return money.ok ? `ครบทั้งใบ ${fmtMoney(money.totalAmount)} · หลักฐาน ${fmtNumber(evidenceFileCount)} ไฟล์` : 'ครบทั้งใบ';
    }
    return text(state.opening?.amount)
      ? `${fmtMoney(state.opening.amount)} · หลักฐาน ${fmtNumber(evidenceFileCount)} ไฟล์`
      : 'เคยเก็บแล้ว — ยังไม่ใส่ยอด';
  })();

  return [
    { id: 'customer', label: 'ลูกค้า', value: text(plan?.header?.customerName) || text(customerLabel) || null },
    { id: 'owner', label: 'AE ผู้ดูแล', value: text(plan?.header?.ownerName) || text(ownerLabel) || null },
    { id: 'contract', label: 'สัญญา', value: [docKind, text(state.contract?.ref)].filter(Boolean).join(' ') || null },
    {
      id: 'span',
      label: 'ช่วงสัญญา',
      value: span.dated
        ? `${fmtDate(state.contract.startDate)} – ${fmtDate(state.contract.endDate)}${span.monthsText ? ` · ${span.monthsText}` : ''}`
        : null,
    },
    /* `null` = ยังอ่านจำนวนไม่ได้ ⇒ ขีด (เหมือน "ยังไม่มีข้อมูล") · 0 = รู้แล้วว่ายังไม่แนบ */
    {
      id: 'files',
      label: 'ไฟล์',
      value: contractFileCount === null || contractFileCount === undefined
        ? null
        : (contractFileCount ? `แนบแล้ว ${fmtNumber(contractFileCount)} ไฟล์` : 'ยังไม่แนบ'),
    },
    { id: 'refs', label: 'อ้างอิงเดิม', value: refs.join(' · ') || null },
    { id: 'tax', label: 'ภาษี', value: vat },
    { id: 'zones', label: 'รายการ', value: zones.length ? historicalLinesSummary(zones) : null },
    { id: 'subtotal', label: 'ยอดรวมสินค้า/บริการ', value: money.ok ? fmtMoney(money.subtotal) : null },
    /* ส่วนลดท้ายใบ (มติ 25/09) — ขึ้นเฉพาะใบที่มีส่วนลดจริง (แถวขีดทุกใบ = เสียงรบกวน) */
    ...(money.ok && Number(money.discountAmount) > 0
      ? [{ id: 'discount', label: 'ส่วนลดท้ายใบ', value: `-${fmtMoney(money.discountAmount)}` }]
      : []),
    { id: 'vat', label: 'ภาษีมูลค่าเพิ่ม', value: money.ok ? fmtMoney(money.vatAmount) : null },
    { id: 'opening', label: OPENING_INSTALLMENT_LABEL, value: openingValue },
    {
      id: 'rest',
      label: 'งวดที่ยังต้องเก็บ',
      value: openingRows || restRows ? `${fmtNumber(restRows)} งวด` : null,
    },
  ];
}

/**
 * บรรทัดใต้ปุ่มของแถบท้าย
 * 🐞 UAT 23/09: ขั้น ①–③ ที่มีปุ่มเดียวคือ "ถัดไป" เขียนว่า "ส่งให้ AE Sup อนุมัติทันทีที่บันทึก"
 *    — ประโยคของขั้นที่บันทึกจริง ไปยืนอยู่บนขั้นที่ยังไม่บันทึกอะไรสักอย่าง
 */
export function historicalFootNote({ step = 'contract' } = {}) {
  /* ขั้น ④ มีตัวตัดสินของตัวเอง (`historicalReviewFootNote` — lib/sales/historicalReviewView.js · มติ 25/09) */
  if (step === 'review') return '';
  return `ยังไม่บันทึกอะไร — “${HISTORICAL_NEXT_BUTTON_LABEL}” คือการตรวจข้อมูลของขั้นนี้ · ใบเกิดและถูกส่งให้${HISTORICAL_APPROVER_LABEL}ตอนกด “${HISTORICAL_SAVE_BUTTON_LABEL}” ในขั้นสุดท้าย`;
}

/**
 * หัวก้อน error ของขั้นที่ยังกรอกไม่ครบ — **ตัวเลขต้องไม่โกหก**
 * 🐞 UAT 23/09: ฟอร์มเปล่าขึ้น "ยังกรอกไม่ครบ 3 ข้อ" ทั้งที่ช่องดาวแดงยังว่างอยู่ราว 7 ช่อง
 *    (ที่เหลือเป็นหน้าที่ของพรีวิว ซึ่งยังไม่เคยรัน) ⇒ ผู้คีย์อ่านว่า "เหลืออีก 3 ข้อก็จบ"
 * ⇒ พูดเฉพาะสิ่งที่นับได้จริง แล้วบอกตรง ๆ ว่ายังมีด่านของ server อีกชั้น
 */
export function historicalStepIssueNotice(count = 0) {
  return {
    title: `ต้องแก้ ${fmtNumber(Number(count) || 0)} ข้อนี้ก่อนไปขั้นถัดไป`,
    note: `ช่องที่มีดาวแดงต้องกรอกให้ครบด้วย — ระบบตรวจทั้งใบให้ตอนกด “${HISTORICAL_NEXT_BUTTON_LABEL}”`,
  };
}

/**
 * ขั้น ④ ที่ยังไม่มีแผน (แก้ฟอร์มหลังตรวจ) — บอกปุ่ม **ที่มีอยู่จริงบนจอ**
 * 🐞 UAT 23/09: ของเดิมสั่งให้กด "ตรวจอีกครั้ง" ซึ่งไม่เคยมีปุ่มนั้น · ปุ่มจริงคือปุ่มบันทึก
 *    และการกดครั้งแรกตอนยังไม่มีแผนคือ **การตรวจ** (ฟอร์มยิงพรีวิวก่อน ยังไม่บันทึก)
 */
export function historicalReviewStaleNotice() {
  return {
    title: 'ข้อมูลเปลี่ยนหลังตรวจ — ตรวจใหม่ก่อนบันทึก',
    body: `กด “${HISTORICAL_SAVE_BUTTON_LABEL}” ที่แถบท้ายฟอร์มได้เลย — ครั้งแรกระบบจะตรวจข้อมูลให้ก่อน ยังไม่บันทึก`,
  };
}

/* ── ตัวช่วยของขั้น ③ (ปุ่มให้คนกด ไม่ใช่ค่าที่เติมเงียบ ๆ) ─────────────────────────────── */

/* ── ระยะสัญญา: ลงตัวเป็นเดือน หรือไม่ก็ไม่ตอบเลย ────────────────────────────────
   🐞 UAT 23/09 (เรื่องเงิน): ของเดิมเขียนคอมเมนต์ว่า "ช่วงที่ไม่ลงตัวเป็นเดือน = null"
      แต่โค้ด **ปัดลง** (`iso <= to`) ⇒ 1 ม.ค.–15 มี.ค. ตอบ 2 · 1 ม.ค.–30 ธ.ค. ตอบ 11
      แล้วปุ่มลัดยอดโซน (ราคา × แพ็ค × เดือน — ถอดแล้วตามมติ 23/09) เสนอยอด **11/12 ของของจริง**
      ให้ใบที่ขาดไปวันเดียว — ผิดเงียบ ๆ ทั้งใบ เพราะเลขที่เสนอดูสมเหตุสมผลทุกตัว
   ⇒ กติกาเดียวของบ้านนี้: **ลงตัวเป็นเดือนเท่านั้นถึงจะตอบเป็นตัวเลข** ช่วงอื่นตอบ null แล้ว
      ทุกคนที่ถาม (ป้ายใต้ช่องวันสิ้นสุด · ชุดแบ่งงวดของขั้น ③) ต้อง **บอกเหตุแล้วให้ผู้คีย์ทำเอง** ไม่ใช่เดาต่อ
   ⭐ มติเจ้าของ 23/09: ยอดของโซนไม่ได้คิดจากเดือนอีกแล้ว — เป็น จำนวน × ราคา/หน่วย แบบใบเสนอราคา
      (ระยะสัญญาไม่เข้าสูตรเงินที่ไหน) ⇒ สิ่งเดียวที่ช่วงไม่ลงตัวกระทบคือการแบ่งงวดอัตโนมัติ */
export const CONTRACT_PARTIAL_NOTE = 'ช่วงสัญญาไม่ลงตัวเป็นเดือน — แบ่งงวดชำระเอง (ขั้น ③)';

/**
 * จำนวนเดือนเต็มของสัญญา — "n เดือน" แปลว่า **วันสิ้นสุด = วันเริ่ม + n เดือน − 1 วัน**
 * (ม็อก: 1 ม.ค.–31 ธ.ค. 2026 = 12 เดือน · 15 ม.ค.–14 ก.พ. = 1 เดือน) · ช่วงที่เหลือ = null
 * ⚠️ เลขคณิตปฏิทินล้วน (ตรึง T00:00:00Z แล้วบวกลบด้วย setUTC*) ไม่มีโซนเวลาเข้ามาเกี่ยว —
 *   แพตเทิร์นเดียวกับ `addDays` ของ paymentCoverage · **ไม่ตัดสตริงจาก toISOString** (ด่าน check:thaitime)
 * ── กติกาวันสิ้นเดือน (ตัดสินไว้ 23/09 · อย่าเปลี่ยนโดยไม่แก้เทสต์คู่กัน) ─────────────────
 * ขอบของรอบที่ n = `Date.UTC(ปี, เดือน-1+n, วัน)` แล้วถอยหนึ่งวัน · รับได้สองกรณีเท่านั้น:
 *   (ก) **ไม่ล้นเลย** — เดือนปลายทางมีวันที่นั้นอยู่จริง (1 ม.ค.–31 ธ.ค. = 12 · 31 ม.ค.–30 มี.ค. = 2)
 *   (ข) **ล้นพอดีหนึ่งวัน** = วันที่ 31 ไปตกเดือนที่มี 30 วัน ⇒ ขอบคือ "สิ้นเดือนนั้น"
 *        (31 ม.ค.–30 เม.ย. = 3 · 31 มี.ค.–30 เม.ย. = 1) — อ่านอย่างที่คนเขียนสัญญาอ่าน
 *        และไม่กำกวม เพราะ 30 เม.ย. คือวันสุดท้ายของเดือนนั้นพอดี
 * 🪤 **ล้นเกินหนึ่งวันตอบ null เสมอ** — 31 ม.ค. + 1 เดือน ไม่มีวันนั้นใน ก.พ. (JS ล้นไปเป็น
 *    3 มี.ค.) ⇒ ไม่ดัก = ระบบจะบอกว่า 31 ม.ค.–2 มี.ค. คือ "1 เดือน" · 31 ม.ค.–28 ก.พ. ก็ยัง
 *    ถือว่าไม่ลงตัว (จะนับเป็น 1 เดือนหรือไม่ ขึ้นกับกติกาที่ตกลงกับลูกค้า) ⇒ ถามผู้คีย์
 *    ดีกว่าเดาแทนเขาในเรื่องเงิน
 * 🐞 ก่อน 23/09 กติกา (ข) หายไป ⇒ 31 ม.ค.–30 เม.ย. ตอบ null (เดิมตอบ 3) ⇒ ลูกค้าที่สัญญา
 *    เริ่มวันที่ 31 เสียชุดแบ่งงวดทั้งใบ โดยไม่มีอะไรบนจอบอกว่าทำไม
 */
export function contractMonths(startDate, endDate) {
  const from = text(startDate);
  const to = text(endDate);
  if (!isDateText(from) || !isDateText(to) || to < from) return null;
  const [year, month, day] = from.split('-').map(Number);
  const gross = (Number(to.slice(0, 4)) - year) * 12 + (Number(to.slice(5, 7)) - month);
  for (const n of [gross + 1, gross]) {
    if (n < 1) continue;
    const probe = new Date(Date.UTC(year, month - 1 + n, day));
    const exact = probe.getUTCDate() === day;
    /* ล้นพอดีหนึ่งวัน = วันที่ 31 ตกเดือนที่มี 30 วัน ⇒ ถอยหนึ่งวันแล้วได้สิ้นเดือนนั้นพอดี
       (ก.พ. ล้น 2–3 วัน ⇒ `getUTCDate()` เป็น 2/3 ไม่ใช่ 1 ⇒ ตกกติกานี้ตามเจตนา) */
    const endOfShortMonth = day === 31 && probe.getUTCDate() === 1;
    if (!exact && !endOfShortMonth) continue;   // เดือนนั้นไม่มีวันที่นี้ ⇒ ไม่ใช่ขอบเดือนของสัญญานี้
    probe.setUTCDate(probe.getUTCDate() - 1);
    const iso = `${probe.getUTCFullYear()}-${String(probe.getUTCMonth() + 1).padStart(2, '0')}-${String(probe.getUTCDate()).padStart(2, '0')}`;
    if (iso === to) return n;                   // เท่ากันเป๊ะเท่านั้น — "เกือบครบเดือน" ไม่ใช่เดือน
  }
  return null;
}

/**
 * ระยะสัญญาในรูปที่จอใช้ได้ตรง ๆ — `months` เป็นตัวเลขหรือ null และ `note` บอกเหตุเมื่อเป็น null
 * ⭐ แยก "ยังกรอกวันไม่ครบ" (note = null · ขั้น ① ยังไม่ถึงคิวบอกอะไร) ออกจาก
 *   "กรอกครบแล้วแต่ไม่ลงตัวเป็นเดือน" (note = CONTRACT_PARTIAL_NOTE) — สองอย่างนี้คนละข้อความ
 */
export function contractSpan(startDate, endDate) {
  const from = text(startDate);
  const to = text(endDate);
  const span = serviceMonthSpan(from, to);
  const months = span ? span.months : null;
  const dated = isDateText(from) && isDateText(to) && to >= from;
  const partial = months === null && dated;
  const anniversary = Boolean(span?.extraDay);
  return {
    months, dated, partial, anniversary,
    /* ป้ายเดียวของทุกจอ (ขั้น ① ③ ④ · ช่องสรุปหัวขั้น ①) — รีวิว 25/09: สี่ที่เคยพิมพ์ "12 เดือน" เองแล้วลืมวันครบรอบ */
    monthsText: months ? `${fmtNumber(months)} เดือน${anniversary ? ' · จบวันครบรอบ' : ''}` : null,
    note: partial ? CONTRACT_PARTIAL_NOTE : null,
  };
}

/**
 * จำนวนเดือนที่ใช้ **แบ่งงวด** ของช่วงหนึ่ง — `contractMonths` + สัญญาที่จบตรงวันครบรอบ
 * ⭐ มติเจ้าของ 25/09 ข้อ 3: สัญญา 25/09/2025–25/09/2026 (28 จาก 81 กลุ่มในชีต) นับเป็น 12 เดือน แบ่งทุกเดือน/3/6/รายปีได้
 *   โดยงวดสุดท้ายยาวขึ้นหนึ่งวัน (`extraDay`) · ก่อนมตินี้ช่วงแบบนี้ "ไม่ลงตัวเป็นเดือน" แบ่งได้แค่ก้อนเดียว
 * ⚠️ ไม่แก้ `contractMonths` — กติกาวันสิ้นเดือนของมันตรึงด้วยเทสต์ · ที่นี่แค่ลองอีกครั้งด้วยวันก่อนหน้าวันสุดท้าย
 * @returns `{ months, extraDay }` หรือ null (ไม่ลงตัว — ผู้เรียกบอกเหตุ)
 */
export function serviceMonthSpan(startDate, endDate) {
  const from = text(startDate);
  const to = text(endDate);
  if (!isDateText(from) || !isDateText(to) || to < from) return null;
  const exact = contractMonths(from, to);
  if (exact) return { months: exact, extraDay: false };
  const dayBefore = addDays(to, -1);
  const anniversary = dayBefore && dayBefore >= from ? contractMonths(from, dayBefore) : null;
  return anniversary ? { months: anniversary, extraDay: true } : null;
}

/* 🚫 ปุ่มลัด "ใช้ราคาแพ็คเกจ × แพ็ค × เดือน" (`zoneAmountSuggestion` / `zoneAmountSuggestionNote`) ถูกถอดตามมติ 23/09
   🐞 มันคูณเดือนซ้ำบนจำนวนที่นับเดือนไปแล้ว — 1 ชุด × 12 เดือน คีย์เป็นจำนวน 12 แล้วปุ่มเสนอ 3,500 × 12 × 12 = 504,000
   ⇒ ยอดของโซนคือ จำนวน × ราคา/หน่วย − ส่วนลด ตามสูตรใบเสนอราคา (historicalLinesMoney) ไม่มีปุ่มเสนอยอดอีก */

/* ── ทะเบียนไซต์/โซนของลูกค้า → ช่อง "ไซต์ · โซน" ในบรรทัด + หน้าต่าง "เพิ่มหลายโซน" ─────────────────
 *
 * ⭐ **มติเจ้าของ 25/09** ("มันควรจะหน้าตาเหมือนใบเสนอราคา แต่เพิ่มการเชื่อมไซต์ โซน รายรายการ"):
 *   การ์ดไซต์ + ติ๊กโซน + ช่องค้น + ปุ่มย่อ/ขยาย + ช่อง "ใช้แพ็คเกจเดียวกันทุกโซน" ถูกถอดทั้งชุด ⇒ ขั้น ② เหลือ
 *   **ตารางรายการของใบเสนอราคาตารางเดียว** (ปุ่ม "เพิ่มรายการ") · โซนเลือกใน **บรรทัด** (`historicalZonePickerOptions`)
 *   · ลูกค้าโซนเยอะใช้ "เพิ่มหลายโซน" (ค้น → ติ๊ก → แพ็คเกจ/จำนวนครั้งเดียว → หนึ่งบรรทัดต่อโซน · `historicalBulkAddRows`)
 *   🐞 ที่มา: ของเดิมกลับหัวกับใบเสนอราคา — ติ๊กโซนนอกตารางก่อนบรรทัดถึงเกิด · โซนในบรรทัดเป็นตัวหนังสือเปลี่ยนไม่ได้
 *      · ถอนติ๊ก = บรรทัดหายพร้อมจำนวน/ส่วนลดไม่ถาม · error เดียวกันขึ้นสามที่ · ช่องแพ็คเกจทุกโซนเททับทุกบรรทัดเงียบ ๆ
 *
 * 🐞 UAT 23/09 (ของจริงบนฐาน): AR-374 บริษัท เซ็นทรัล ฟู้ด รีเทล มี **26 ไซต์ 43 โซน** — กติกาที่ยังใช้อยู่:
 *     ① ค้นด้วยคำเดียว — รหัสไซต์ · ชื่อไซต์ · ชื่อโซน · รหัสโซน (**ทุกอย่างที่ตาเห็นบนแถว** ตามกฎบ้าน search haystack)
 *     ② ไซต์ที่ตรงชื่อ/รหัสได้ทุกโซนของมัน · ไซต์ที่ตรงเฉพาะบางโซนได้เฉพาะโซนนั้น · ไม่ตรงเลย = ซ่อน
 *     ③ โหลดโซนทีละไซต์แบบพังทีละใบ (จอ) · ไซต์ที่พัง **โชว์เสมอ** แม้กำลังค้น — ยังไม่รู้ว่าข้างในมีโซนที่ตรงไหม
 */
const zoneHaystack = (...parts) => parts.map(text).filter(Boolean).join(' ').toLowerCase();

/**
 * ตัวกางทะเบียนของหน้าต่าง "เพิ่มหลายโซน" + ตัวตัดสินโซนกำพร้าของขั้น ②
 * @param sites        ไซต์จากทะเบียน (ตามลำดับที่ API คืนมา)
 * @param zonesBySite  `{ [siteId]: zone[] }` — ไซต์ที่ยังโหลดไม่สำเร็จไม่มีคีย์ของตัวเอง
 * @param siteErrors   `{ [siteId]: ข้อความ }` ของไซต์ที่โหลดโซนไม่สำเร็จ (โหลดทีละไซต์ ⇒ พังทีละใบ)
 * @param pickedZoneIds โซนที่ถูกเลือกไว้ (หน้าต่าง: ที่ติ๊กในหน้าต่าง · ขั้น ②: โซนที่บรรทัดของใบผูกไว้)
 * @param ready        ทะเบียนโหลดเสร็จแล้วหรือยัง — เท็จ = ยังตัดสิน `orphans` ไม่ได้
 * @returns `{ rows, siteTotal, zoneTotal, shownZones, hiddenPicked, orphans, unresolved }`
 *   rows: `{ site, zones, picked, total, error }`
 *   ⚠️ **ไม่มี `hiddenSites`** — ไซต์หนึ่งใบไม่ถูกใส่ใน `rows` ก็คือใบที่คำค้นซ่อน ⇒ จำนวนคือ `siteTotal − rows.length`
 *
 * 🔴 `orphans` = โซนที่ใบผูกไว้แต่ **ไม่มีอยู่ในทะเบียนที่โหลดมาเลยสักไซต์** (รีวิว R10) — ไซต์ถูกปิดใช้งาน
 *    (`includeInactive=0`) · ไซต์ถูกโอนไปลูกค้ารายอื่น · โซนถูกลบ ⇒ บรรทัดยังอยู่ในตาราง (ปุ่มลบ/เปลี่ยนโซนใช้ได้)
 *    แต่ช่อง "ไซต์ · โซน" ต้องบอกเหตุ ไม่ใช่เด้งเป็นช่องว่าง (`historicalZonePickerOptions` เติมตัวเลือกบอกเหตุให้)
 * 🔴 **N1 (รีวิวรอบสอง 23/09 — ของเดิมทำลายข้อมูล)**: ไซต์เดียวอ่านโซนไม่สำเร็จ (เน็ตกระตุก) เคยทำให้ทุกโซนของ
 *    ไซต์นั้นขึ้นปุ่ม "ถอดออกจากใบ" ⇒ ผู้คีย์ลบบรรทัดจริงเพราะคำขอที่พังชั่วคราว
 *    ⇒ กำพร้าได้เฉพาะเมื่อ **อ่านทะเบียนครบทุกไซต์แล้ว** · ยังมีไซต์ที่อ่านไม่ได้ = ตัดสินไม่ได้ ⇒ กอง `unresolved`
 *      (จอ: ปุ่มลองอ่านไซต์ที่พังใหม่ · ปุ่มลบของบรรทัดนั้นปิดพร้อมเหตุ — `historicalZoneLines().removable`)
 */
export function historicalZoneBrowser({
  sites = [], zonesBySite = {}, siteErrors = {}, query = '', pickedZoneIds = [], ready = true,
} = {}) {
  const q = text(query).toLowerCase();
  const picked = new Set(list(pickedZoneIds).map(text).filter(Boolean));
  const all = list(sites);
  const rows = [];
  let zoneTotal = 0;
  let shownZones = 0;
  let hiddenPicked = 0;

  for (const site of all) {
    const zones = list(zonesBySite?.[site?.id]);
    const error = text(siteErrors?.[site?.id]) || null;
    const pickedHere = zones.filter((zone) => picked.has(text(zone?.id))).length;
    zoneTotal += zones.length;
    const siteHit = !q || zoneHaystack(site?.code, site?.name).includes(q);
    const shown = siteHit ? zones : zones.filter((zone) => zoneHaystack(zone?.name, zone?.code).includes(q));
    if (q && !siteHit && !shown.length && !error) {
      hiddenPicked += pickedHere;
      continue;                                 // ไซต์ที่ไม่อยู่ใน rows = ใบที่คำค้นซ่อน (ดู @returns)
    }
    const shownIds = new Set(shown.map((zone) => text(zone?.id)));
    hiddenPicked += zones.filter((zone) => picked.has(text(zone?.id)) && !shownIds.has(text(zone?.id))).length;
    shownZones += shown.length;
    rows.push({ site, zones: shown, picked: pickedHere, total: zones.length, error });
  }

  /* โซนที่ทะเบียนไม่มีให้เห็นเลย — นับจาก **ทุกโซนของทุกไซต์** ไม่ใช่เฉพาะที่คำค้นโชว์ */
  const known = new Set();
  for (const site of all) for (const zone of list(zonesBySite?.[site?.id])) known.add(text(zone?.id));
  const missing = ready
    ? [...new Set(list(pickedZoneIds).map(text).filter(Boolean))].filter((id) => !known.has(id))
    : [];
  /* 🔴 N1: ยังมีไซต์ที่อ่านโซนไม่สำเร็จ = **ยังไม่รู้** ว่าโซนที่หายไปอยู่ในไซต์นั้นหรือหายจริง */
  const blind = all.some((site) => Boolean(text(siteErrors?.[site?.id])));
  const orphans = blind ? [] : missing;
  const unresolved = blind ? missing : [];

  return { rows, siteTotal: all.length, zoneTotal, shownZones, hiddenPicked, orphans, unresolved };
}

/**
 * บรรทัดของใบในขั้น ② — หนึ่งแถว = หนึ่งบรรทัดของ **ตารางรายการแบบใบเสนอราคา** (มติ 23/09 · 25/09)
 * ต่อแถวคืน `{ row, index, zone, site, point, note, name, removable, removeTitle }`
 *   - point: ชื่อจุด (`historicalZonePoint` — สูตรเดียวกับที่แผนเขียนลงบรรทัด) · null เมื่อยังไม่เลือก/หาโซนไม่เจอ
 *   - note:  เหตุที่ยังไม่มีชื่อจุด (กำลังโหลด · ยังอ่านทะเบียนไม่ได้ · ไม่อยู่ในทะเบียน) — แถวที่ **ยังไม่เลือกโซน** = null
 *            (บรรทัดใหม่จากปุ่ม "เพิ่มรายการ" ไม่ใช่ของที่หาย · ช่องว่างของมันพูดเองว่า "เลือกไซต์ · โซน")
 *   - name:  ชื่อบรรทัดของโปรแกรมอ่านหน้าจอ = "รายการ N" (คำเดียวกับใบเสนอราคา · เลขเดียวกับคอลัมน์ "#")
 *   - removable/removeTitle: ปุ่มลบท้ายแถว
 * 🔴 N1: โซนที่ **ยังตัดสินไม่ได้** (มีไซต์ที่อ่านโซนไม่สำเร็จ) ลบไม่ได้ — ยังไม่รู้ว่ามันหายจริงหรือแค่อยู่ในไซต์
 *    ที่อ่านไม่ถึง · ระหว่างโหลดก็เช่นกัน · โซนกำพร้าจริง (อ่านครบแล้วไม่เจอ) ลบได้ (R10)
 * 🐞 รีวิว 25/09: **เส้นทะเบียนไซต์เองพัง** (`failed`) เคยถูกนับเป็น "กำลังโหลด" ตลอดกาล — บรรทัดพูด "กำลังโหลด…"
 *    ทั้งที่ไม่ได้โหลดอะไรอยู่ · ⇒ แยกเหตุ: พัง = บอกว่าพังและชี้ปุ่มลองใหม่ (ยังลบไม่ได้ เหตุเดียวกับ N1)
 */
export function historicalZoneLines({
  zones = [], sites = [], zonesBySite = {}, siteErrors = {}, ready = true, failed = false,
} = {}) {
  const where = new Map();
  for (const site of list(sites)) {
    for (const zone of list(zonesBySite?.[site?.id])) where.set(text(zone?.id), { zone, site });
  }
  const blind = list(sites).some((site) => Boolean(text(siteErrors?.[site?.id])));
  return list(zones).map((row, index) => {
    const zoneId = text(row?.zoneId);
    const found = zoneId ? where.get(zoneId) || null : null;
    const zone = found?.zone || null;
    const site = found?.site || null;
    let note = null;
    let removable = true;
    let removeTitle = null;
    if (zoneId && !found) {
      if (failed) {
        note = `${zoneId} — โหลดทะเบียนไซต์ไม่สำเร็จ`;
        removable = false;
        removeTitle = 'โหลดทะเบียนไซต์ไม่สำเร็จ — กด “ลองโหลดทะเบียนไซต์อีกครั้ง” ด้านบนก่อน จึงจะรู้ว่าโซนนี้ยังอยู่ไหม';
      } else if (!ready) {
        note = 'กำลังโหลดทะเบียนไซต์…';
        removable = false;
        removeTitle = 'รอทะเบียนไซต์โหลดเสร็จก่อน';
      } else if (blind) {
        note = `${zoneId} — ยังอ่านทะเบียนไม่ได้`;
        removable = false;
        removeTitle = 'ยังอ่านทะเบียนไซต์ไม่ครบ — กด “ลองอ่านไซต์ที่พังอีกครั้ง” ก่อน จึงจะรู้ว่าโซนนี้หายจริงไหม';
      } else {
        note = `${zoneId} — ไม่อยู่ในทะเบียนที่โหลดมา (ถูกปิดใช้งาน ย้ายไปลูกค้าอื่น หรือถูกลบ)`;
      }
    }
    return {
      row,
      index,
      zone,
      site,
      point: zone && site ? historicalZonePoint(zone, site) : null,
      note,
      name: `รายการ ${index + 1}`,
      removable,
      removeTitle,
    };
  });
}

/**
 * ตัวเลือกของช่อง "ไซต์ · โซน" ในบรรทัดหนึ่งบรรทัด — `SearchableSelect` (หัวกลุ่ม = ไซต์ · ตัวเลือก = โซน)
 * ⭐ ค้นได้ทุกอย่างที่ตาเห็น: รหัส/ชื่อไซต์ + ชื่อ/รหัสโซน (`search` ของโซนพกชื่อไซต์ด้วย เพราะหัวกลุ่มไม่ถูกกรอง)
 * ⭐ ป้ายของตัวเลือก = ชื่อจุด (`historicalZonePoint`) คำเดียวกับตารางฝั่งอ่านของขั้น ④ และหน้าใบสั่งขาย
 * 🔴 เลือกไม่ได้พร้อมเหตุ (กฎบ้าน: ตัวเลือกที่ติดด่านต้องเห็นว่ามีอยู่):
 *    · โซนที่ **บรรทัดอื่น** ผูกไว้แล้ว — หนึ่งโซนหนึ่งบรรทัด (ด่านเดียวกับแผน `historical_so_zone_duplicate`)
 *    · โซนที่ปิดใช้งานในทะเบียน — ยกเว้นโซนที่ **แถวนี้** ผูกอยู่แล้ว (R10: ถอนออกได้เสมอ ติ๊กใหม่ไม่ได้)
 * 🔴 โซนที่แถวนี้ผูกไว้แต่ไม่อยู่ในตัวเลือก (กำลังโหลด · ไซต์ที่อ่านไม่ได้ · กำพร้า) ⇒ เติมตัวเลือกบอกเหตุไว้บนสุด
 *    ไม่งั้นช่องเด้งเป็น "เลือกไซต์ · โซน" ทั้งที่ใบยังผูกโซนนั้นอยู่ (อ่านเป็นว่ายังไม่ได้เลือก)
 * @param rowKey  `key` ของแถวที่ช่องนี้อยู่ · @param missingNote เหตุจาก `historicalZoneLines().note` ของแถวนั้น
 * @returns `[{ value, label, group?, disabled?, why?, zoneName?, zoneCode?, missing?, search? }]`
 */
export function historicalZonePickerOptions({
  sites = [], zonesBySite = {}, rows = [], rowKey = null, missingNote = null,
} = {}) {
  const self = text(rowKey);
  const usedBy = new Map();
  list(rows).forEach((row, index) => {
    const id = text(row?.zoneId);
    if (id && text(row?.key) !== self && !usedBy.has(id)) usedBy.set(id, index + 1);
  });
  const current = text(list(rows).find((row) => text(row?.key) === self)?.zoneId);
  const options = [];
  let found = false;
  for (const site of list(sites)) {
    const zones = list(zonesBySite?.[site?.id]);
    if (!zones.length) continue;
    options.push({
      value: `site:${text(site?.id)}`,
      label: [text(site?.code), text(site?.name)].filter(Boolean).join(' '),
      group: true,
    });
    for (const zone of zones) {
      const id = text(zone?.id);
      const mine = id === current;
      if (mine) found = true;
      const inactive = zone?.isActive === false;
      const line = usedBy.get(id) || null;
      let why = null;
      if (line) why = `อยู่ในรายการ ${line} แล้ว`;
      else if (inactive) why = mine ? 'ปิดใช้งานในทะเบียน — เปลี่ยนเป็นโซนอื่น หรือให้ TS เปิดใช้งานคืน' : 'ปิดใช้งานในทะเบียน';
      options.push({
        value: id,
        label: historicalZonePoint(zone, site),
        zoneName: text(zone?.name) || id,
        zoneCode: text(zone?.code) || null,
        search: zoneHaystack(site?.code, site?.name, zone?.name, zone?.code),
        disabled: !mine && Boolean(why),
        why,
      });
    }
  }
  if (current && !found) {
    options.unshift({
      value: current,
      label: text(missingNote) || `${current} — ไม่อยู่ในทะเบียนที่โหลดมา`,
      zoneName: current,
      zoneCode: null,
      search: current.toLowerCase(),
      disabled: true,
      missing: true,
      why: null,
    });
  }
  return options;
}

/**
 * ข้อความของ issue หนึ่งข้อในก้อนรวมหัวขั้น ② — ป้ายบรรทัดพูด **เลขบรรทัดปัจจุบัน**
 * 🐞 รีวิว 25/09: ลบบรรทัดบนแล้ว ข้อของบรรทัดล่างที่ยังค้าง (ไม่ได้แก้ช่องนั้น) พูด "รายการ 3: …" ของตอนตรวจ
 *    ถึงแถวที่ตอนนี้เป็น # 2 ⇒ ประกอบป้ายใหม่จาก `rowKey` + `detail` · ข้อที่ผูกแถวไม่ได้ใช้ข้อความของ server ตามเดิม
 * @param lines ผลของ `historicalZoneLines` (ลำดับ = ลำดับบนจอ · มีโซนที่หาเจอแล้วสำหรับชื่อในวงเล็บ)
 */
export function historicalIssueText(issue = {}, lines = []) {
  const key = text(issue?.rowKey);
  if (!key || !text(issue?.detail)) return text(issue?.message);
  const at = list(lines).findIndex((line) => text(line?.row?.key) === key);
  if (at < 0) return text(issue?.message);
  const zoneName = text(list(lines)[at]?.zone?.name);
  return `รายการ ${at + 1}${zoneName ? ` (${zoneName})` : ''}: ${text(issue.detail)}`;
}

/** "N บรรทัด · M โซน" — บรรทัดใหม่ที่ยังไม่เลือกโซนไม่นับเป็นโซน (ราง · แถบสรุป · หัวตาราง ใช้คำนี้คำเดียว) */
export function historicalLinesSummary(zones = []) {
  const rows = list(zones);
  const bound = new Set(rows.map((row) => text(row?.zoneId)).filter(Boolean)).size;
  return `${fmtNumber(rows.length)} บรรทัด · ${fmtNumber(bound)} โซน`;
}

/* ── "เพิ่มหลายโซน" (มติ 25/09 — แทนช่อง "ใช้แพ็คเกจเดียวกันทุกโซน") ─────────────────────────────
   ⭐ หนึ่งโซนที่ติ๊ก = หนึ่งบรรทัดใหม่ต่อท้ายตาราง · ลำดับตามทะเบียน (ไซต์ → โซน) ไม่ใช่ลำดับที่ติ๊ก
   ⚠️ ข้ามเงียบไม่ได้: โซนที่อยู่ในใบแล้ว/ปิดใช้งาน ถูกปิดไว้ในหน้าต่างตั้งแต่ต้น (เห็นเหตุ) · ที่นี่กันซ้ำอีกชั้น
   ⚠️ แพ็คเกจเติมที่จอด้วย `quoteLineFromProduct` ตัวเดียวกับช่องเลือกในบรรทัด (ไฟล์นี้ไม่ลากทะเบียนสินค้ามา) */
export function historicalBulkAddRows({ zoneIds = [], sites = [], zonesBySite = {}, rows = [], qty = '' } = {}) {
  const picked = new Set(list(zoneIds).map(text).filter(Boolean));
  const taken = new Set(list(rows).map((row) => text(row?.zoneId)).filter(Boolean));
  const out = [];
  for (const site of list(sites)) {
    for (const zone of list(zonesBySite?.[site?.id])) {
      const id = text(zone?.id);
      if (!picked.has(id) || taken.has(id) || zone?.isActive === false) continue;
      taken.add(id);
      out.push(emptyHistoricalZone({ zoneId: id, siteId: site?.id, qty: text(qty) }));
    }
  }
  return out;
}

/** จำนวนต่อบรรทัดของหน้าต่าง "เพิ่มหลายโซน" — ว่างได้ (ใส่ทีละบรรทัดทีหลัง) · ใส่แล้วต้องเป็นจำนวนเต็ม > 0 (ด่านเดียวกับแผน) */
export function historicalBulkQtyIssue(qty = '') {
  const raw = text(qty);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? null : HISTORICAL_LINE_MESSAGES.qty;
}

/** ผลของปุ่ม "เพิ่ม N บรรทัด" ก่อนกด (กฎบ้าน: บอกผลลัพธ์ก่อนคลิก) */
export function historicalBulkConsequence({ count = 0, qty = '', unitPrice = null } = {}) {
  if (!count) return 'ยังไม่ได้เลือกโซน';
  const q = Number(text(qty));
  const price = Number(unitPrice);
  const qtyOk = text(qty) !== '' && Number.isInteger(q) && q > 0;
  if (qtyOk && Number.isFinite(price) && price > 0) {
    const each = quoteLineMoney({ qty: q, unitPrice: price }).lineTotal;
    return `จะเพิ่ม ${fmtNumber(count)} บรรทัด · บรรทัดละ ${fmtNumber(q)} × ${fmtMoney(price)} = ${fmtMoney(each)} · รวม ${fmtMoney((toSatang(each) * count) / 100)}`;
  }
  /* 🐞 รีวิว 25/09: จำนวนใส่แล้วแต่แพ็คเกจยังไม่ตั้งราคา เคยพูด "จำนวนใส่ทีละบรรทัด" ทั้งที่ทุกบรรทัดได้จำนวนนั้นไปจริง
     ⇒ บอกจำนวนที่แต่ละบรรทัดได้ + เหตุที่ยังไม่มียอด (แผนตีกลับแพ็คเกจที่ยังไม่ตั้งราคาอยู่แล้ว) */
  if (qtyOk) return `จะเพิ่ม ${fmtNumber(count)} บรรทัด · บรรทัดละจำนวน ${fmtNumber(q)} — แพ็คเกจนี้ยังไม่ตั้งราคาในฐานข้อมูลสินค้า จึงยังไม่มียอด`;
  return `จะเพิ่ม ${fmtNumber(count)} บรรทัด — จำนวนใส่ทีละบรรทัดในตาราง`;
}

/* ── error รายช่องของบรรทัด → ใต้ช่องของแถวนั้น (มติ 25/09 — "error ขึ้นที่เดียว") ────────────────────
   🐞 ของเดิม: ข้อความเดียวกันขึ้น 3–5 ที่ (ก้อนบน · ใต้ติ๊ก · ใต้บรรทัด · หัวการ์ด · ช่องเงิน) · **ค้างอยู่แม้แก้แล้ว**
      จนกว่าจะกด "ถัดไป" อีกรอบ (`patch` ไม่เคยแตะ `issues`) · และจับคู่ข้อความกับแถวด้วย **ลำดับ** ⇒ ลบบรรทัดหนึ่ง
      ข้อความของบรรทัดล่างทั้งหมดเลื่อนไปเกาะบรรทัดผิด
   ⇒ แผนชี้ช่อง (`zones.<i>.<ช่อง>` + `detail` ไม่มีป้ายบรรทัด) · จอผูกข้อความกับ `key` ของแถว **ตอนได้คำตอบ**
     (ลำดับของ body = ลำดับของ state ตอนส่ง — ช่องถูกปิดระหว่างตรวจ) · แก้ช่องไหน ข้อความของช่องนั้นหายทันที */
const LINE_FIELD = /^zones\.(\d+)(?:\.([A-Za-z]+))?$/;
const LINE_SLOT_KEYS = Object.freeze({
  zoneId: ['zoneId'], productId: ['productId'], qty: ['qty'], rounds: ['rounds'],
});
const LINE_ALL_KEYS = ['zoneId', 'productId', 'qty', 'rounds', 'discountType', 'discountValue'];
const INSTALLMENT_FIELD = /^installments\.(\d+)(?:\.([A-Za-z]+))?$/;

/** issue ของ server → ผูก `rowKey` ของแถวที่มันชี้ (เรียกทันทีที่ได้คำตอบ ด้วย `state.zones` / `state.installments` ชุดที่ส่งไปตรวจ)
 *  ⭐ มติ 25/09 (รื้อขั้น ③): งวดใช้กติกาเดียวกับบรรทัด — `installments.<i>.<ช่อง>` ผูกกับ key ของงวดนั้น */
export function historicalIssuesWithRowKeys(issues = [], zones = [], installments = []) {
  const rows = list(zones);
  const insts = list(installments);
  return list(issues).map((issue) => {
    const field = text(issue?.field);
    const line = LINE_FIELD.exec(field);
    const inst = INSTALLMENT_FIELD.exec(field);
    const key = line ? text(rows[Number(line[1])]?.key) : (inst ? text(insts[Number(inst[1])]?.key) : '');
    return key ? { ...issue, rowKey: key } : issue;
  });
}

/** ข้อความรายแถวสำหรับวาดใต้ช่อง — `Map<rowKey, { zoneId?, productId?, qty?, rounds?, row? }>` (ข้อแรกของแต่ละช่อง) */
export function historicalLineIssues(issues = []) {
  const byRow = new Map();
  for (const issue of list(issues)) {
    const match = LINE_FIELD.exec(text(issue?.field));
    const key = text(issue?.rowKey);
    if (!match || !key) continue;
    const slot = LINE_SLOT_KEYS[match[2]] ? match[2] : 'row';
    const entry = byRow.get(key) || {};
    if (!entry[slot]) entry[slot] = text(issue?.detail) || text(issue?.message);
    byRow.set(key, entry);
  }
  return byRow;
}

/**
 * ฟอร์มถูกแก้ → ทิ้ง error ของ server ที่ **พูดถึงช่องที่เพิ่งเปลี่ยน** (ข้อที่เหลือยังจริงอยู่ ห้ามทิ้งเหมารวม)
 * ⚠️ issue ของบรรทัดที่ไม่มี `rowKey` (ผูกแถวไม่ได้) ทิ้งทันทีที่ตารางเปลี่ยน — ลำดับอาจเลื่อนไปแล้ว พูดต่อ = เกาะผิดบรรทัด
 * ⚠️ ด่านจริงยังเป็นพรีวิวของ server — ข้อที่ถูกทิ้งแต่ยังผิดอยู่ จะกลับมาตอนกด "ถัดไป" ครั้งหน้า
 */
export function historicalPruneIssues(issues = [], prev = {}, next = {}) {
  const zonesChanged = prev?.zones !== next?.zones;
  const prevRows = new Map(list(prev?.zones).map((row) => [text(row?.key), row]));
  const nextRows = new Map(list(next?.zones).map((row) => [text(row?.key), row]));
  const kept = list(issues).filter((issue) => {
    const field = text(issue?.field);
    if (field === 'vatRate') return prev?.vatRate === next?.vatRate;
    if (field === 'discount') {
      return prev?.discountType === next?.discountType && text(prev?.discountValue) === text(next?.discountValue);
    }
    if (field === 'zones') return list(next?.zones).length === 0;
    /* ⭐ ขั้น ③ (มติ 25/09): ช่องของงวดยกมาดับเมื่อช่องนั้นเปลี่ยน · เปลี่ยนคำตอบ "จ่ายเงินมาแล้วหรือยัง" = ทั้งก้อนเป็นของเก่า */
    if (field === 'opening' || field.startsWith('opening.')) {
      if (prev?.hasOpening !== next?.hasOpening || prev?.openingFull !== next?.openingFull) return false;
      const slot = field.split('.')[1];
      if (!slot) return true;
      if (slot === 'evidence') return true;
      return text(prev?.opening?.[slot]) === text(next?.opening?.[slot]);
    }
    if (field === 'installments') return prev?.installments === next?.installments && prev?.hasOpening === next?.hasOpening;
    const inst = INSTALLMENT_FIELD.exec(field);
    if (inst) {
      if (prev?.installments === next?.installments && prev?.opening === next?.opening
        && prev?.contract === next?.contract) return true;
      const key = text(issue?.rowKey);
      if (!key) return false;
      const before = list(prev?.installments).find((row) => text(row?.key) === key);
      const after = list(next?.installments).find((row) => text(row?.key) === key);
      if (!after) return false;
      /* ช่วงครอบ/ยอดของงวดขึ้นกับงวดรอบข้าง (ห่วงโซ่) ⇒ ตารางเปลี่ยนตรงไหนก็ตาม ข้อของช่วง/ยอดเป็นของเก่าทั้งหมด */
      if (['coverage', 'coversTo', 'amount', 'row'].includes(inst[2] || 'row')) return false;
      return text(before?.[inst[2]]) === text(after?.[inst[2]]);
    }
    const match = LINE_FIELD.exec(field);
    if (!match || !zonesChanged) return true;
    const key = text(issue?.rowKey);
    const after = key ? nextRows.get(key) : null;
    if (!after) return false;
    const before = prevRows.get(key);
    const keys = LINE_SLOT_KEYS[match[2]] || LINE_ALL_KEYS;
    return keys.every((name) => text(before?.[name]) === text(after?.[name]));
  });
  return kept.length === list(issues).length ? issues : kept;
}

/* ── ขั้น ③ งวดชำระ (มติเจ้าของ 25/09 — "ขอรื้อส่วนงวดชำระด้วย" · ม็อก Step3New/Step3Full/Step3Split) ─────────────
 *
 * 🐞 ของเดิม (UAT 25/09 + ข้อมูลจริง 4 ใบ):
 *   · ปุ่ม "รายเดือน" หารจำนวนวันเท่า ๆ กัน ⇒ ช่วงไม่ตรงเดือน วันครบกำหนดเลื่อนทุกงวด (SO-26090232-0 ลงฐานไปแบบนั้น)
 *     และหลังมีงวดยกมา มันยังแบ่งเป็น "จำนวนเดือนของทั้งสัญญา" ทั้งที่ช่วงเหลือสั้นกว่า
 *   · ทุกงวดกรอก "ครอบบริการ ตั้งแต่–ถึง" เอง ⇒ ช่องโหว่/ซ้อนเกิดง่าย แล้วไปตายที่ตัวตรวจทั้งใบ
 *   · ยอดงวดรวมต้องเท่ายอดใบ ±1 สตางค์ ⇒ ผู้คีย์ต้องหารเองให้ลงตัว
 *   · 3 ใน 4 ใบที่คีย์จริงคือ "จ่ายครบทั้งใบ" แต่ต้องกรอกยอด/ช่วงเองทุกครั้ง
 * ⇒ กติกาใหม่ (ไม่แก้ฐาน — RPC ได้ค่าชุดเดิมทุกช่อง):
 *   ① คำถามสามทาง: จ่ายครบทั้งใบแล้ว (`openingFull`) · จ่ายมาแล้วบางส่วน · ยังไม่เคยจ่าย
 *   ② **ห่วงโซ่**: งวดแรกเริ่มถัดจากงวดยกมา (หรือวันเริ่มสัญญา) · งวดถัดไปเริ่มถัดจาก "ถึง" ของงวดก่อน ⇒ กรอกแค่ "ถึง"
 *   ③ **งวดสุดท้ายคิดให้** (มติข้อ 2): ยอด = ยอดที่ต้องเก็บ − งวดอื่น · ครอบถึงวันสิ้นสุดสัญญา
 *   ④ แบ่งอัตโนมัติตามเดือนปฏิทิน + วันครบกำหนดสี่แบบ (หน้าต่างแบ่งงวด · ดูผลก่อนสร้าง)
 * ⚠️ ห่วงโซ่คำนวณตอนอ่านเสมอ (จอ · body · ตัวตรวจ) — state เก็บเฉพาะค่าที่ผู้คีย์พิมพ์ ⇒ แก้วันสัญญา/งวดยกมาแล้วทั้งตารางขยับตาม
 */
const moneyText = (value) => (Math.round(Number(value) * 100) / 100).toFixed(2);
const satangOrNull = (value) => {
  const raw = text(value);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};

/** 'full' (จ่ายครบทั้งใบแล้ว) · 'part' (จ่ายมาแล้วบางส่วน) · 'none' (ยังไม่เคยจ่าย) · null (ยังไม่ตอบ) */
export function historicalOpeningMode(state = {}) {
  if (state.hasOpening === false) return 'none';
  if (state.hasOpening === true) return state.openingFull === true ? 'full' : 'part';
  return null;
}

/**
 * ใบยอด 0 บาท — แผนรู้ก่อน (ตัวจริง) · ยังไม่มีแผนก็รู้จากยอดที่คิดได้บนฟอร์ม
 * 🐞 ของเดิมอ่าน `plan?.zeroValue` อย่างเดียว ⇒ ก่อนพรีวิวผ่าน ใบ ฿0 ยังถูกถามว่าเคยเก็บเงินไหม แล้วปุ่มบันทึกวนกลับขั้น ③
 */
export function historicalZeroValue(plan = null, money = null) {
  if (plan?.zeroValue) return true;
  return Boolean(money?.ok) && Number(money?.totalAmount) === 0;
}

/**
 * ห่วงโซ่ของงวด — ตัวเดียวที่จอ ตัวตรวจบนจอ และ body อ่าน
 * @param totalAmount ยอดใบ (รวม VAT) หรือ null = ยังคิดไม่ได้
 * @returns `{ mode, contractOk, opening, chainStart, startReason, remaining, rows, overflow, missingTo }`
 *   - opening: `{ seq, amount, coversFrom, coversTo, derived }` หรือ null · derived = "จ่ายครบทั้งใบ" (คิดให้ทั้งก้อน)
 *   - rows: `{ key, seq, index, last, label, amount, amountText, amountDerived, percent, dueDate, overdue,
 *             coversFrom, coversTo, coversToText, coversToDerived, note }`
 *   - remaining: ยอดที่งวดต้องเก็บรวมกัน (บาท) หรือ null · overflow: งวดอื่นรวมกันเกินยอดที่ต้องเก็บ
 */
export function historicalInstallmentChain(state = {}, { totalAmount = null, todayIso = null } = {}) {
  const mode = historicalOpeningMode(state);
  const start = text(state.contract?.startDate);
  const end = text(state.contract?.endDate);
  const contractOk = isDateText(start) && isDateText(end) && end >= start;
  const totalSatang = totalAmount === null || totalAmount === undefined || !Number.isFinite(Number(totalAmount))
    ? null : toSatang(totalAmount);
  const today = isDateText(todayIso) ? text(todayIso) : null;
  const pct = (satang) => (totalSatang && totalSatang > 0 && satang !== null
    ? Math.round((satang / totalSatang) * 10000) / 100 : null);

  let opening = null;
  let chainStart = null;
  let startReason = null;
  let remainingSatang = null;
  if (mode === 'full') {
    opening = {
      seq: 1, amount: totalSatang === null ? null : totalSatang / 100, percent: totalSatang ? 100 : null,
      coversFrom: contractOk ? start : null, coversTo: contractOk ? end : null, derived: true,
    };
    remainingSatang = 0;
  } else if (mode === 'part') {
    const amount = satangOrNull(state.opening?.amount);
    const to = text(state.opening?.coversTo);
    opening = {
      seq: 1, amount: amount === null ? null : amount / 100, percent: pct(amount),
      coversFrom: contractOk ? start : null, coversTo: isDateText(to) ? to : null, derived: false,
    };
    remainingSatang = totalSatang === null || amount === null ? null : totalSatang - amount;
    if (!contractOk) startReason = 'กรอกวันเริ่ม–วันสิ้นสุดสัญญาในขั้น ① ก่อน';
    else if (!isDateText(to)) startReason = 'กรอก “ครอบบริการ ถึง” ของเงินที่เก็บแล้วก่อน — งวดที่เหลือเริ่มวันถัดจากนั้น';
    else if (to < start || to > end) startReason = `“ครอบบริการ ถึง” ของเงินที่เก็บแล้วต้องอยู่ในช่วงสัญญา ${fmtDate(start)}–${fmtDate(end)}`;
    else if (to === end) startReason = 'เงินที่เก็บแล้วครอบถึงวันสิ้นสุดสัญญาแล้ว — ไม่มีช่วงเหลือให้แบ่ง';
    else chainStart = addDays(to, 1);
  } else if (mode === 'none') {
    remainingSatang = totalSatang;
    if (!contractOk) startReason = 'กรอกวันเริ่ม–วันสิ้นสุดสัญญาในขั้น ① ก่อน';
    else chainStart = start;
  }

  const raw = mode === 'part' || mode === 'none' ? list(state.installments) : [];
  const seqBase = opening ? 2 : 1;
  let cursor = chainStart;
  let others = 0;
  let missingTo = 0;
  const rows = raw.map((row, index) => {
    const last = index === raw.length - 1;
    const coversFrom = cursor;
    const typedTo = text(row?.coversTo);
    const coversTo = last ? (contractOk ? end : null) : (isDateText(typedTo) ? typedTo : null);
    if (!last && !coversTo) missingTo += 1;
    let amountSatang;
    if (last) {
      amountSatang = remainingSatang === null ? null : remainingSatang - others;
    } else {
      amountSatang = satangOrNull(row?.amount);
      if (amountSatang !== null) others += amountSatang;
    }
    cursor = coversTo && (!coversFrom || coversTo >= coversFrom) && coversTo < (contractOk ? end : '9999')
      ? addDays(coversTo, 1) : null;
    const dueDate = text(row?.dueDate);
    return {
      key: text(row?.key),
      seq: seqBase + index,
      index,
      last,
      label: text(row?.label),
      amount: amountSatang === null ? null : amountSatang / 100,
      amountText: text(row?.amount),
      amountDerived: last,
      percent: pct(amountSatang),
      dueDate,
      overdue: Boolean(today && isDateText(dueDate) && dueDate < today),
      coversFrom: coversFrom || null,
      coversTo: coversTo || null,
      coversToText: typedTo,
      coversToDerived: last,
      note: text(row?.note),
    };
  });
  const lastRow = rows[rows.length - 1] || null;
  return {
    mode,
    contractOk,
    opening,
    chainStart,
    startReason,
    remaining: remainingSatang === null ? null : remainingSatang / 100,
    rows,
    overflow: Boolean(lastRow && lastRow.amount !== null && lastRow.amount < 0),
    missingTo,
  };
}

/**
 * ข้อที่จอตรวจเองของขั้น ③ — **ข้อความเดียวกับแผน** เมื่อแผนมีคู่ (ข้อที่แผนไม่มี = กฎของห่วงโซ่ที่จอเป็นเจ้าของ)
 * 🐞 ของเดิมจอถามแค่ "เคยเก็บเงินไหม" + หลักฐาน ⇒ ช่องอื่นไปรู้ตอนพรีวิวทีละรอบ
 * ⚠️ แถวงวดพก `rowKey` + `detail` (ข้อความไม่มีป้ายงวด) — ตารางวาดใต้ช่องของแถวนั้น · ก้อนบนประกอบป้ายงวดปัจจุบัน
 */
export function historicalMoneyIssues(state = {}, { evidenceFileCount = 0, todayIso = null, totalAmount } = {}) {
  const issues = [];
  const add = (field, message, extra = {}) => issues.push({ field, message, ...extra });
  const mode = historicalOpeningMode(state);
  const total = totalAmount === undefined ? historicalMoneyView(state, null).totalAmount : totalAmount;
  const chain = historicalInstallmentChain(state, { totalAmount: total, todayIso });
  const start = text(state.contract?.startDate);
  const end = text(state.contract?.endDate);
  const today = isDateText(todayIso) ? text(todayIso) : null;

  if (!mode) {
    add('opening', 'เลือกว่าลูกค้าจ่ายเงินมาแล้วหรือยัง — จ่ายครบทั้งใบ · จ่ายมาแล้วบางส่วน · ยังไม่เคยจ่าย');
    return issues;
  }
  if (mode === 'full' || mode === 'part') {
    if (mode === 'part') {
      const amount = satangOrNull(state.opening?.amount);
      if (!text(state.opening?.amount)) add('opening.amount', 'ต้องกรอกยอดที่เก็บแล้ว');
      else if (amount === null || amount <= 0) {
        add('opening.amount', 'ยอดที่เก็บแล้วต้องมากกว่า 0 — ถ้ายังไม่เคยเก็บเงิน ไม่ต้องมีงวดยกมา', { live: true });
      } else if (total !== null && total !== undefined && amount >= toSatang(total)) {
        add('opening.amount', `ยอดที่เก็บแล้วเท่ายอดใบ ${fmtMoney(total)} หรือเกิน — ถ้าเก็บครบแล้วเลือก “จ่ายครบทั้งใบแล้ว”`, { live: true });
      }
      const to = text(state.opening?.coversTo);
      if (!to) add('opening.coversTo', 'ต้องระบุว่าเงินที่เก็บแล้วครอบบริการถึงวันไหน');
      else if (chain.contractOk && (to < start || to > end)) {
        add('opening.coversTo', `ครอบบริการถึงต้องอยู่ในช่วงสัญญา ${fmtDate(start)}–${fmtDate(end)}`, { live: true });
      } else if (chain.contractOk && to === end) {
        add('opening.coversTo', 'ครอบถึงวันสิ้นสุดสัญญาแล้ว — ถ้าเก็บครบแล้วเลือก “จ่ายครบทั้งใบแล้ว”', { live: true });
      }
    }
    const paidOn = text(state.opening?.paidOn);
    if (!paidOn) add('opening.paidOn', 'ต้องระบุวันที่รับเงินงวดยกมา');
    else if (today && paidOn > today) add('opening.paidOn', 'วันที่รับเงินงวดยกมาต้องไม่เกินวันนี้', { live: true });
    if (charLength(state.opening?.note) > INSTALLMENT_NOTE_MAX) {
      add('opening.note', `หมายเหตุงวดยกมายาวเกิน ${fmtNumber(INSTALLMENT_NOTE_MAX)} ตัวอักษร`, { live: true });
    }
    if (evidenceFileCount < 1) {
      add('opening.evidence', `${OPENING_INSTALLMENT_LABEL}ต้องมีหลักฐานการเก็บเงินอย่างน้อย 1 ไฟล์ (ใบกำกับ ใบเสร็จ หรือ statement)`);
    }
  }
  if (mode === 'part' || mode === 'none') {
    if (!chain.rows.length) add('installments', 'ยังไม่มีงวด — กด “แบ่งงวดอัตโนมัติ” หรือ “เพิ่มงวด”');
    for (const row of chain.rows) {
      const slot = (name, detail, extra = {}) => add(`installments.${row.index}.${name}`, `งวดที่ ${row.seq}: ${detail}`, {
        detail, rowKey: row.key, ...extra,
      });
      if (!row.label) slot('label', 'ต้องกรอกรายละเอียดงวด');
      else if (charLength(row.label) > INSTALLMENT_LABEL_MAX) slot('label', `รายละเอียดยาวเกิน ${fmtNumber(INSTALLMENT_LABEL_MAX)} ตัวอักษร`, { live: true });
      if (!row.last) {
        if (!row.amountText) slot('amount', 'ต้องกรอกจำนวนเงิน');
        else if (row.amount === null || row.amount < 0) slot('amount', 'ยอดต้องเป็นตัวเลขไม่ติดลบ', { live: true });
      } else if (chain.overflow && chain.remaining !== null && chain.remaining >= 0) {
        /* ยอดที่ต้องเก็บติดลบ (งวดยกมาเกินยอดใบ) = ข้อของช่องยอดที่เก็บแล้ว ไม่ใช่ความผิดของงวดอื่น (รีวิว 25/09) */
        slot('amount', `งวดอื่นรวมกันเกินยอดที่ต้องเก็บ ${fmtMoney(chain.remaining)} อยู่ ${fmtMoney(Math.abs(row.amount))} — ลดยอดงวดก่อนหน้า`, { live: true });
      }
      if (!row.dueDate) slot('dueDate', 'ต้องระบุวันครบกำหนด');
      if (!row.last) {
        if (!row.coversToText) slot('coversTo', 'ต้องระบุวันสิ้นสุดของช่วงที่งวดนี้ครอบ — งวดถัดไปเริ่มวันถัดไปให้เอง');
        else if (row.coversFrom && row.coversTo && row.coversTo < row.coversFrom) {
          slot('coversTo', `ต้องไม่ก่อนวันเริ่มของงวดนี้ (${fmtDate(row.coversFrom)})`, { live: true });
        } else if (chain.contractOk && row.coversTo && row.coversTo >= end) {
          slot('coversTo', `ต้องจบก่อนวันสิ้นสุดสัญญา ${fmtDate(end)} — งวดสุดท้ายครอบถึงวันสิ้นสุดเอง`, { live: true });
        }
      }
      if (charLength(row.note) > INSTALLMENT_NOTE_MAX) slot('note', `หมายเหตุยาวเกิน ${fmtNumber(INSTALLMENT_NOTE_MAX)} ตัวอักษร`, { live: true });
    }
  }
  return issues;
}

/**
 * ข้อที่จอตรวจเอง + ข้อของ server ที่ยังไม่ตรงกับช่องไหนของจอ — **ช่องเดียว = ข้อเดียว** (local ชนะ มันสดกว่า)
 * 🐞 รีวิว 25/09: เทียบกันด้วยชื่อช่องดิบ ⇒ ลบงวดบนแล้ว ข้อของ server ที่ผูกแถว (`installments.2.label` ของตอนตรวจ) ไม่ชนกับข้อสด
 *    (`installments.1.label` ของตอนนี้) ⇒ ข้อเดียวขึ้นสองบรรทัดในก้อนแดง ⇒ แถวที่ผูก key แล้วเทียบด้วย (key ของแถว, ช่อง)
 */
export function historicalMergeIssues(localIssues = [], serverIssues = []) {
  const slotOf = (issue) => {
    const field = text(issue?.field);
    const key = text(issue?.rowKey);
    if (!key) return field;
    const row = INSTALLMENT_FIELD.exec(field) || LINE_FIELD.exec(field);
    return row ? `${key}|${row[2] || 'row'}` : field;
  };
  const local = list(localIssues);
  const taken = new Set(local.map(slotOf));
  return [...local, ...list(serverIssues).filter((issue) => !taken.has(slotOf(issue)))];
}

/** คำเตือนงวดที่ครบกำหนดแล้ว — **ประโยคเดียว** ของขั้น ③ (กล่องเหลืองเหนือตาราง) และขั้น ④ (ในแถวงวดที่ยังต้องเก็บ) */
export function historicalOverdueWarningText(count = 0, todayIso = null) {
  return `${fmtNumber(count)} งวดครบกำหนดก่อนวันนี้${isDateText(todayIso) ? ` (${fmtDate(todayIso)})` : ''}`
    + ` — หลัง${HISTORICAL_APPROVER_LABEL}อนุมัติจะขึ้นเลยกำหนดทันที และนัดบริการรอจนบัญชีรับรอง`;
}

/** ข้อความรายช่องของงวด — `Map<rowKey, { label?, amount?, dueDate?, coversTo?, coverage?, note?, row? }>` */
export function historicalInstallmentIssues(issues = []) {
  const byRow = new Map();
  for (const issue of list(issues)) {
    const match = INSTALLMENT_FIELD.exec(text(issue?.field));
    const key = text(issue?.rowKey);
    if (!match || !key) continue;
    const slot = ['label', 'amount', 'dueDate', 'coversTo', 'coverage', 'note'].includes(match[2]) ? match[2] : 'row';
    const entry = byRow.get(key) || {};
    if (!entry[slot]) entry[slot] = text(issue?.detail) || text(issue?.message);
    byRow.set(key, entry);
  }
  return byRow;
}

/** ป้ายของข้อในก้อนรวมหัวขั้น ③ — พูด **เลขงวดปัจจุบัน** (ลบงวดบนแล้วเลขเลื่อน) · งวดยกมาเป็นงวดที่ 1 เสมอเมื่อมี */
export function historicalInstallmentIssueText(issue = {}, chain = null) {
  const key = text(issue?.rowKey);
  if (!key || !text(issue?.detail) || !chain) return text(issue?.message);
  const row = list(chain.rows).find((item) => item.key === key);
  return row ? `งวดที่ ${row.seq}: ${text(issue.detail)}` : text(issue?.message);
}

/**
 * เปลี่ยนคำตอบ "ลูกค้าจ่ายเงินมาแล้วหรือยัง" — ของที่จะหายต้องถามก่อนเสมอ (กฎบ้าน: การกระทำที่ทำลายของที่พิมพ์ไว้มีโมดัลบอกผล)
 * ⚠️ ตอบครั้งแรกไม่ถาม · จ่ายครบ → บางส่วน ไม่ถาม (ไม่มีอะไรหาย) · ไฟล์หลักฐานที่ยังไม่อัปล้างเมื่อเลือก "ยังไม่เคยจ่าย"
 * ⚠️ ไม่แตะ `openingEvidence` (ref บนเซิร์ฟเวอร์) — เหตุผลเดียวกับ `historicalDownstreamReset`
 * @param pendingEvidence ไฟล์หลักฐานในตะกร้าที่ยังไม่อัป
 * @returns `{ ask, patch, clearsEvidence, title, description, confirmLabel }`
 */
export function historicalOpeningModeChange(state = {}, nextMode, { pendingEvidence = 0 } = {}) {
  const current = historicalOpeningMode(state);
  const rows = list(state.installments).length;
  const base = { ask: false, patch: {}, clearsEvidence: false, title: '', description: '', confirmLabel: '' };
  if (nextMode === current) return base;
  if (nextMode === 'full') {
    return {
      ...base,
      ask: current !== null && rows > 0,
      patch: { hasOpening: true, openingFull: true, installments: [] },
      title: `ลบงวดที่ยังต้องเก็บ ${fmtNumber(rows)} งวด`,
      description: `“จ่ายครบทั้งใบแล้ว” = งวดยกมาเท่ายอดใบ ครอบเต็มสัญญา ⇒ งวดที่ยังต้องเก็บ ${fmtNumber(rows)} งวดที่คีย์ไว้จะถูกลบ`,
      confirmLabel: 'ลบงวดและใช้จ่ายครบ',
    };
  }
  if (nextMode === 'part') {
    return { ...base, patch: { hasOpening: true, openingFull: false } };
  }
  if (nextMode === 'none') {
    const opening = state.opening || {};
    const clears = [
      ...(text(opening.amount) ? [`ยอด ${fmtMoney(opening.amount)}`] : []),
      ...(text(opening.coversTo) ? [`ครอบถึง ${fmtDate(opening.coversTo)}`] : []),
      ...(text(opening.paidOn) ? [`วันที่รับเงิน ${fmtDate(opening.paidOn)}`] : []),
      ...(text(opening.note) ? ['หมายเหตุถึงฝ่ายบัญชี'] : []),
      ...(pendingEvidence > 0 ? [`ไฟล์หลักฐานที่ยังไม่อัป ${fmtNumber(pendingEvidence)} ไฟล์`] : []),
      /* 🐞 รีวิว 25/09: หลักฐานที่อัปขึ้นไปแล้ว (ใบที่เปิดมาแก้) ไม่ผูกกับใบอีกเมื่อไม่มีงวดยกมา — ต้องบอกด้วย */
      ...(list(state.openingEvidence).length
        ? [`หลักฐานที่แนบไว้แล้ว ${fmtNumber(list(state.openingEvidence).length)} ไฟล์ (ไม่ผูกกับใบนี้อีก)`] : []),
    ];
    return {
      ...base,
      ask: current !== null && clears.length > 0,
      patch: { hasOpening: false, openingFull: false, opening: emptyHistoricalWizard().opening },
      clearsEvidence: true,
      title: `ล้าง${OPENING_INSTALLMENT_LABEL}ที่กรอกไว้`,
      description: `“ยังไม่เคยจ่าย” = ไม่มี${OPENING_INSTALLMENT_LABEL} ⇒ ระบบจะล้าง: ${clears.join(' · ')}`,
      confirmLabel: `ล้าง${OPENING_INSTALLMENT_LABEL}`,
    };
  }
  return base;
}

/**
 * ปุ่ม "เพิ่มงวด" — ต่อท้ายหนึ่งงวด · งวดสุดท้ายเดิมเลิกเป็นงวดที่คิดให้ ⇒ **ยอดที่มันโชว์อยู่กลายเป็นค่าที่พิมพ์ไว้**
 * (ไม่งั้นยอดที่เห็นหายไปเฉย ๆ) และช่อง "ถึง" ของมันว่างรอกรอก · งวดใหม่รับยอดที่เหลือ/ถึงวันสิ้นสุดสัญญาแทน
 */
export function historicalAddInstallment(state = {}, { totalAmount = null } = {}) {
  const rows = list(state.installments);
  if (!rows.length) return [emptyHistoricalInstallment()];
  const chain = historicalInstallmentChain(state, { totalAmount });
  const lastChain = chain.rows[chain.rows.length - 1];
  const frozen = rows.map((row, index) => (index === rows.length - 1
    ? { ...row, amount: lastChain?.amount === null || lastChain?.amount === undefined ? text(row.amount) : moneyText(lastChain.amount), coversTo: '' }
    : row));
  return [...frozen, emptyHistoricalInstallment()];
}

/* หน้าต่าง "แบ่งงวดอัตโนมัติ" — รอบการเก็บเงิน · วันครบกำหนด (ไม่มีค่าตั้งต้นทั้งคู่ — แผนชำระจริงไม่ได้เหมือนกันทุกใบ) */
export const HISTORICAL_SPLIT_PERIODS = Object.freeze([
  { value: 'once', label: 'ก้อนเดียว', months: null },
  { value: '1', label: 'ทุกเดือน', months: 1 },
  { value: '3', label: 'ทุก 3 เดือน', months: 3 },
  { value: '6', label: 'ทุก 6 เดือน', months: 6 },
  { value: '12', label: 'ทุกปี', months: 12 },
]);
export const HISTORICAL_DUE_RULES = Object.freeze([
  { value: 'start', label: 'วันเริ่มของแต่ละงวด' },
  { value: 'monthEnd', label: 'สิ้นเดือน' },
  { value: 'day', label: 'ทุกวันที่ …' },
  { value: 'manual', label: 'กรอกเองในตาราง' },
]);

/* ── ชิป "ตามรอบของลูกค้า" ของหน้าต่างแบ่งงวด (กำหนดวางบิล รอบสอง ข้อ 6 · มติเจ้าของ 26/09 · mig 0389) ──────
   ⭐ ลูกค้าที่ตั้งรอบวางบิลแบบ **เงินเข้ารายเดือน เดือนเดียวกับวางบิล** ไว้ที่ทะเบียนแล้ว = แตะครั้งเดียวได้วันครบกำหนด
     ตามวันเงินเข้า (แปลงเป็นกติกาเดิมของตัวคิด: 'day' n · วันที่ 31 = 'monthEnd') — ตัวคิดวันไม่มีสาขาใหม่
   🔴 **ไม่เลือกให้** (กฎบ้าน: ไม่มีค่าตั้งต้นให้การตัดสินใจ) — แผนชำระของใบย้อนหลังมาจากสัญญา ไม่ใช่รอบวางบิลเสมอไป
   ⚠️ เงินเข้าแบบเครดิต (นับ n วันจากวันวางบิล) ไม่มีชิป — ใบย้อนหลังไม่มีวันวางบิลให้นับ ⇒ โชว์ประโยครอบเป็นข้อมูลอย่างเดียว
   🔴 "เดือนถัดไป" (monthOffset 1) **ไม่มีชิป** — เงินเข้าเดือนถัดจากเดือนที่วางบิล ซึ่งใบย้อนหลังไม่มีวันวางบิล
     🐞 รีวิว 26/09: เดิมชิปใช้แค่วันที่เงินเข้า ("วันที่ 10 แรกนับจากวันเริ่มงวด") ⇒ รอบ "วางบิล 25 · เงินเข้า 10 เดือนถัดไป"
       ช่วง 01/10/2026–31/03/2027 ได้ 10/10 · 10/11 … ขณะที่ตัวคิดของลูกค้าเอง (`billingRounds`) ได้ วางบิล 25/10 → 10/11
       = **เร็วไปหนึ่งเดือนทุกงวด และก่อนวันวางบิลของงวดนั้นเอง** ⇒ ขึ้นแดง "เลยกำหนด" + ด่านช่าง (visitGate) บล็อกก่อนเวลา
       — บั๊กเดียวกับ SO-26080050-0 ที่เรื่องนี้มาแก้ · ขัดมติ 3 "ไม่เดาวัน"
     ⚠️ normalizeBillingRule ห้าม offset 0 เมื่อวันเงินเข้า < วันวางบิล ⇒ offset 1 คือรูปปกติของลูกค้าที่จ่ายวันต้นกว่าวันวางบิล
       ทางที่คิดถูก (ถ้าเจ้าของอยากได้): ใช้ `billingRounds(rule, coversFrom, 1)[0].dueDate` รายงวดในตัวคิด = สาขาใหม่ ต้องขอมติก่อน
   ⚠️ งวดยกมาไม่เกี่ยว — หน้าต่างนี้สร้างเฉพาะงวดที่ยังต้องเก็บ (งวดยกมาไม่มีวันวางบิลเสมอ · CHECK ของ 0389) */
export const HISTORICAL_CUSTOMER_DUE_RULE = 'customer';
/* ต้นประโยคเหตุที่ไม่มีชิป — บอกชื่อตัวเลือกที่หายไป ผู้ใช้ไม่ต้องเดาว่าอะไรไม่ขึ้น (กฎบ้าน: ติดด่าน = บอกเหตุ) */
const NO_CUSTOMER_CHIP = 'ไม่มีตัวเลือก "ตามรอบของลูกค้า" เพราะ';

/**
 * รอบวางบิลของลูกค้า → ชิปของหน้าต่างแบ่งงวด
 * @param billingRule ค่า `customers."billingRule"` (รูปผิด/ไม่ตั้ง = ถือว่ายังไม่ตั้ง)
 * @returns `{ hint, option, note }`
 *   · `hint`   = ประโยครอบของลูกค้า ('' = ยังไม่ตั้ง ⇒ ไม่มีอะไรให้โชว์)
 *   · `option` = `{ value, label, dueRule, dueDay }` เฉพาะเงินเข้ารายเดือน เดือนเดียวกับวางบิล · นอกนั้น null
 *   · `note`   = บรรทัดอธิบาย — มีชิป: ชิปทำอะไร (โชว์ตอนเลือก) · ไม่มีชิป: ทำไมไม่มี (บรรทัดของตัวเองใต้ประโยครอบ)
 *     ⚠️ ห้ามมี "—" ใน note ที่ไม่มีชิป — ประโยครอบกับเหตุอยู่ใกล้กัน เคยขึ้นขีดยาวสองตัวในบรรทัดเดียว (รีวิว 26/09)
 */
export function historicalCustomerDueOption(billingRule) {
  const rule = billingRuleOf(billingRule);
  if (!rule) return { hint: '', option: null, note: null };
  const hint = describeBillingRule(rule);
  if (rule.payment.mode !== 'monthly') {
    return { hint, option: null, note: `${NO_CUSTOMER_CHIP}เงินเข้านับจากวันวางบิล ซึ่งใบย้อนหลังไม่มี · เลือกวันครบกำหนดเอง` };
  }
  if (rule.payment.monthOffset === 1) {
    return {
      hint,
      option: null,
      note: `${NO_CUSTOMER_CHIP}เงินเข้าเดือนถัดจากเดือนที่วางบิล ซึ่งใบย้อนหลังไม่มีวันวางบิล · เลือกวันครบกำหนดเอง`,
    };
  }
  const monthEnd = rule.payment.day === MONTH_END_DAY;
  /* ป้ายบอกว่าเป็นวัน **เงินเข้า** — ลูกค้า "วางบิล 5 · เงินเข้า 25" เคยอ่านชิป "(ทุกวันที่ 25)" เป็นวันวางบิล (รีวิว 26/09) */
  const when = monthEnd ? 'เงินเข้าสิ้นเดือน' : `เงินเข้าทุกวันที่ ${rule.payment.day}`;
  return {
    hint,
    option: {
      value: HISTORICAL_CUSTOMER_DUE_RULE,
      label: `ตามรอบของลูกค้า (${when})`,
      dueRule: monthEnd ? 'monthEnd' : 'day',
      dueDay: monthEnd ? '' : String(rule.payment.day),
    },
    note: monthEnd
      ? 'ครบกำหนดสิ้นเดือนของแต่ละงวด (วันเงินเข้าของลูกค้า)'
      : `ครบกำหนดวันที่ ${rule.payment.day} แรกนับจากวันเริ่มของแต่ละงวด (วันเงินเข้าของลูกค้า) · เดือนที่ไม่มีวันนั้นใช้สิ้นเดือน`,
  };
}

/**
 * กติกาวันครบกำหนดที่ส่งเข้า `historicalSplitPreview` — ชิปของลูกค้าแปลงเป็นกติกาเดิม ส่วนตัวเลือกอื่นผ่านตรง
 * ⚠️ เลือกชิปของลูกค้าไว้แล้วรอบหายไป (ลูกค้าล้างรอบ/โหลดใหม่ไม่ขึ้น) = กลับเป็น "ยังไม่เลือก" — ไม่เดาวันต่อ
 * @returns `{ dueRule, dueDay }`
 */
export function historicalEffectiveDueRule({ dueRule = null, dueDay = '', customerOption = null } = {}) {
  if (dueRule !== HISTORICAL_CUSTOMER_DUE_RULE) return { dueRule, dueDay };
  if (!customerOption) return { dueRule: null, dueDay: '' };
  return { dueRule: customerOption.dueRule, dueDay: customerOption.dueDay };
}

/* ข้อความกลางเมื่อโหลดรอบวางบิลของลูกค้าไม่ขึ้น — วิซาร์ดใช้เป็น fallbackError · หน้าต่างแบ่งงวดใช้เทียบ */
export const HISTORICAL_TERMS_LOAD_FAILED = 'โหลดรอบวางบิลของลูกค้าไม่สำเร็จ';

/**
 * บรรทัดบอกเหตุในหน้าต่างแบ่งงวดเมื่อโหลดรอบไม่ขึ้น — **ติดเหตุจากเซิร์ฟเวอร์มาด้วย** (รีวิว 26/09: เดิมโชว์ข้อความกลางเสมอ
 * ⇒ ภาพหน้าจอที่ส่งมาแยก 400 / 500 / เน็ตหลุด ไม่ออก) · ไม่บล็อกอะไร ตัวเลือกวันครบกำหนดเดิมใช้ได้ครบ
 * @param detail `customerTerms.detail` (ข้อความของ ApiError — 500 ของเส้นขึ้นต้น "อ่านรอบวางบิลของลูกค้าไม่สำเร็จ: …" อยู่แล้ว)
 */
export function historicalCustomerTermsError(detail) {
  const reason = text(detail);
  let head = HISTORICAL_TERMS_LOAD_FAILED;
  if (reason && reason !== HISTORICAL_TERMS_LOAD_FAILED) {
    head = reason.includes('รอบวางบิล') ? reason : `${HISTORICAL_TERMS_LOAD_FAILED} (${reason})`;
  }
  return `${head} · เลือกวันครบกำหนดเองได้ตามเดิม`;
}

/**
 * ตัวเลือกรอบการเก็บเงินของช่วงที่เหลือ — ตัวที่ใช้ไม่ได้ **โชว์พร้อมเหตุ ไม่ซ่อน** (กฎบ้าน)
 * @returns `{ span, options: [{ value, label, count, disabled, reason }], note }`
 */
export function historicalSplitOptions({ from = null, to = null, gridStart = null } = {}) {
  const span = from && to ? historicalRemainingSpan({ from, to, gridStart }) : null;
  const options = HISTORICAL_SPLIT_PERIODS.map((period) => {
    if (!period.months) return { ...period, count: 1, disabled: false, reason: null };
    if (!span) return { ...period, count: null, disabled: true, reason: 'ช่วงที่เหลือไม่ลงตัวเป็นเดือน' };
    if (span.months % period.months !== 0) {
      return { ...period, count: null, disabled: true, reason: `ช่วงที่เหลือ ${fmtNumber(span.months)} เดือน แบ่งไม่ลงตัว` };
    }
    return { ...period, count: span.months / period.months, disabled: false, reason: null };
  });
  const blocked = options.filter((option) => option.disabled);
  let note = null;
  if (from && to && !span) {
    note = `ช่วงที่เหลือ ${fmtDate(from)}–${fmtDate(to)} ไม่ลงตัวเป็นเดือน — ใช้ “ก้อนเดียว” หรือกด “เพิ่มงวด” แล้วกำหนดช่วงเอง`;
  } else if (blocked.length) {
    note = `${blocked.map((option) => option.label).join(' · ')}: ${blocked[0].reason}`;
  }
  if (span?.extraDay) {
    note = [note, 'ช่วงที่เหลือจบตรงวันครบรอบ — งวดสุดท้ายยาวขึ้น 1 วัน'].filter(Boolean).join(' · ');
  }
  return { span, options, note };
}

/**
 * ผลของหน้าต่างแบ่งงวด **ก่อนกดสร้าง** — ตัวอย่าง · จำนวน · ยอดต่องวด · จำนวนงวดที่เลยกำหนดแล้ว
 * ⚠️ ยอดหารเป็นสตางค์ เศษลงงวดสุดท้าย (และงวดสุดท้ายเป็นงวดที่ห่วงโซ่คิดให้อยู่แล้ว ⇒ ผลรวมเท่ายอดเป๊ะ)
 * @returns `{ blocked, rows, count, each, lastAmount, overdue }` — `blocked` = เหตุที่ยังสร้างไม่ได้ (ข้อความพร้อมโชว์) หรือ null
 */
export function historicalSplitPreview({
  from = null, to = null, amount = null, period = null, dueRule = null, dueDay = '', todayIso = null, gridStart = null,
} = {}) {
  const empty = { blocked: null, rows: [], count: 0, each: null, lastAmount: null, overdue: 0 };
  if (!from || !to) return { ...empty, blocked: 'ยังไม่รู้ช่วงที่เหลือ' };
  if (amount === null || amount === undefined || !Number.isFinite(Number(amount))) return { ...empty, blocked: 'ยังไม่รู้ยอดที่ต้องเก็บ' };
  if (!(Number(amount) > 0)) return { ...empty, blocked: 'ยอดที่เหลือเป็น 0 — ไม่มีอะไรให้แบ่งเป็นงวด' };
  if (!period) return { ...empty, blocked: 'เลือกรอบการเก็บเงินก่อน' };
  if (!dueRule) return { ...empty, blocked: 'เลือกวันครบกำหนดก่อน' };
  const dayNumber = Number(text(dueDay));
  if (dueRule === 'day' && !(Number.isInteger(dayNumber) && dayNumber >= 1 && dayNumber <= 31)) {
    return { ...empty, blocked: 'ใส่วันที่ครบกำหนด 1–31' };
  }
  const { span, options } = historicalSplitOptions({ from, to, gridStart });
  const option = options.find((item) => item.value === period);
  if (!option || option.disabled) return { ...empty, blocked: option?.reason || 'รอบการเก็บเงินนี้ใช้กับช่วงที่เหลือไม่ได้' };
  const spans = option.months
    ? splitCoverageByMonths({
      startDate: from, endDate: to, months: span.months, stepMonths: option.months, gridStart: span.gridStart, offset: span.offset,
    })
    : [{ coversFrom: from, coversTo: to, anchor: from }];
  if (!spans.length) return { ...empty, blocked: 'แบ่งช่วงนี้ตามเดือนไม่ได้' };
  const totalSatang = toSatang(amount);
  const each = Math.floor(totalSatang / spans.length);
  const today = isDateText(todayIso) ? text(todayIso) : null;
  const rows = spans.map((item, index) => {
    const last = index === spans.length - 1;
    const satang = last ? totalSatang - each * (spans.length - 1) : each;
    const dueDate = dueDateByRule(item.coversFrom, dueRule, dayNumber, item.anchor);
    return {
      label: spans.length === 1 ? 'ชำระครั้งเดียว' : `งวด ${index + 1}/${spans.length}`,
      amount: satang / 100,
      dueDate,
      coversFrom: item.coversFrom,
      coversTo: item.coversTo,
      overdue: Boolean(today && dueDate && dueDate < today),
    };
  });
  return {
    blocked: null,
    rows,
    count: rows.length,
    each: each / 100,
    lastAmount: rows[rows.length - 1].amount,
    overdue: rows.filter((row) => row.overdue).length,
  };
}

/**
 * จำนวนเดือนของช่วงที่เหลือ **บนตารางเดือนของสัญญา** — ช่วงที่เหลือเริ่มตรงขอบเดือนของสัญญา (หลังงวดยกมาที่ครบเดือน)
 * = นับต่อจากตารางนั้น ไม่ใช่เริ่มนับใหม่จากวันที่ของช่วงที่เหลือ
 * 🐞 รีวิว 25/09: สัญญา 31/03/2025–30/03/2026 จ่ายถึง 30/06/2025 ⇒ ช่วงที่เหลือเริ่ม 01/07 (ขอบที่ล้นของวันที่ 31) ·
 *    นับใหม่จาก 01/07 ได้ "ไม่ลงตัวเป็นเดือน" ทั้งที่ป้ายบอก "ครบ 3 เดือนพอดี" และตารางของสัญญาแบ่งได้เป๊ะ
 * @returns `{ months, extraDay, gridStart, offset }` หรือ null
 */
export function historicalRemainingSpan({ from = null, to = null, gridStart = null } = {}) {
  const start = text(from);
  const end = text(to);
  const grid = text(gridStart);
  if (isDateText(grid) && isDateText(start) && grid < start) {
    const whole = serviceMonthSpan(grid, end);
    if (whole) {
      for (let k = 1; k < whole.months; k += 1) {
        const edge = monthEdge(grid, k);
        if (edge === start) return { months: whole.months - k, extraDay: whole.extraDay, gridStart: grid, offset: k };
        if (!edge || edge > start) break;
      }
    }
  }
  const own = serviceMonthSpan(start, end);
  return own ? { ...own, gridStart: start, offset: 0 } : null;
}

/** บรรทัดผลลัพธ์ข้างปุ่มสร้าง (กฎบ้าน: บอกผลก่อนกด) */
export function historicalSplitConsequence(preview = {}, { replacing = 0 } = {}) {
  if (preview.blocked) return `ยังสร้างไม่ได้ — ${preview.blocked}`;
  const same = preview.count === 1 || toSatang(preview.lastAmount) === toSatang(preview.each);
  const money = same
    ? `งวดละ ${fmtMoney(preview.each)}`
    : `งวดละ ${fmtMoney(preview.each)} · งวดสุดท้าย ${fmtMoney(preview.lastAmount)}`;
  const replace = replacing ? ` · แทนที่งวดที่คีย์ไว้ ${fmtNumber(replacing)} งวด` : '';
  return `จะสร้าง ${fmtNumber(preview.count)} งวด ${money}${replace}`;
}

/** งวดจากหน้าต่างแบ่งงวด → แถวของ state (ห่วงโซ่คิดช่วงเริ่ม/งวดสุดท้ายซ้ำเองอยู่แล้ว — ค่าที่เก็บตรงกับที่คิดได้) */
export function historicalSplitRows(preview = {}) {
  return list(preview.rows).map((row) => emptyHistoricalInstallment({
    label: row.label,
    amount: moneyText(row.amount),
    dueDate: row.dueDate,
    coversFrom: row.coversFrom,
    coversTo: row.coversTo,
  }));
}

/* ── ลำดับการบันทึก (มติ 22/09 · ปุ่มเดียวเดินหลายจังหวะ) ────────────────────────────────
   🔴 **ทำไมต้องหลายจังหวะ**: ไฟล์เอกสารแทนสัญญาต้องเป็นแถว attachments ของ *สัญญา* และหลักฐาน
   งวดยกมาต้องอยู่ใต้โฟลเดอร์ `sales-orders/<ใบ>/payments/` ⇒ ทั้งคู่เกิดก่อนใบไม่ได้
       ① persist (สร้าง/แก้)  → ② อัปไฟล์สัญญา → ③ อัปหลักฐานงวดยกมา
       → ④ แก้ใบอีกครั้งเพื่อผูก ref ของหลักฐานกับงวด → ⑤ ส่งอนุมัติ
   ⭐ กดใหม่หลังพังกลางทาง **ต้องไม่อัปไฟล์ซ้ำ** (กฎบ้าน retry-must-not-reupload) ⇒ ไฟล์ที่อัปแล้ว
     ถูกนับออกจาก `pendingContractFiles` / `pendingEvidence` ของรอบถัดไป
   ⭐ ใบที่ถูกตีกลับต้องผ่าน ① ก่อนเสมอ — ด่านอัปหลักฐานการชำระไม่รับใบสถานะ 'rejected'
     (privateEvidence) และ RPC แก้ใบพลิกใบกลับเป็นร่างให้ ⇒ ลำดับนี้เป็นเรื่องข้อมูล ไม่ใช่ความสวยงาม */
export const HISTORICAL_SAVE_STAGES = Object.freeze(['persist', 'contractFiles', 'evidence', 'persistEvidence', 'submit']);

/** ความคืบหน้าตั้งต้นของการกดบันทึกหนึ่งรอบ — `pending*` นับเฉพาะไฟล์ที่ยังไม่ได้อัป */
export function emptySaveProgress({ orderId = null, pendingContractFiles = 0, pendingEvidence = 0 } = {}) {
  return {
    orderId: orderId || null,
    persisted: false,
    pendingContractFiles,
    pendingEvidence,
    /* ไม่มีหลักฐานใหม่ให้อัป = ref ที่ผูกกับงวดอยู่แล้วถูกส่งไปตั้งแต่จังหวะ ① ⇒ ไม่ต้องแก้ใบซ้ำ */
    evidencePersisted: pendingEvidence === 0,
    submitted: false,
  };
}

/** จังหวะถัดไปที่ต้องทำ — `null` = จบแล้ว */
export function nextSaveStage(progress = {}) {
  if (progress.submitted) return null;
  if (!progress.persisted) return 'persist';
  if (Number(progress.pendingContractFiles) > 0) return 'contractFiles';
  if (Number(progress.pendingEvidence) > 0) return 'evidence';
  if (!progress.evidencePersisted) return 'persistEvidence';
  return 'submit';
}

/**
 * ความคืบหน้าหลังจังหวะหนึ่งสำเร็จ
 * ⚠️ `persist` จำ `orderId` ที่ RPC ออกให้ไว้เสมอ — กดใหม่รอบถัดไปต้องเป็น "แก้ใบ" ไม่ใช่ "สร้างใหม่"
 *   (สร้างซ้ำด้วยรหัสการคีย์เดิมได้ใบเดิมคืนก็จริง แต่ถ้าผู้คีย์แก้ฟอร์มระหว่างนั้นจะชนรหัสแทน)
 */
export function saveProgressAfter(progress = {}, stage, patch = {}) {
  const base = { ...progress, ...patch };
  if (stage === 'persist') return { ...base, persisted: true };
  if (stage === 'contractFiles') return { ...base, pendingContractFiles: 0 };
  if (stage === 'evidence') return { ...base, pendingEvidence: 0, evidencePersisted: false };
  if (stage === 'persistEvidence') return { ...base, evidencePersisted: true };
  if (stage === 'submit') return { ...base, submitted: true };
  return base;
}

/* ── ทางออกตอนบันทึกไม่สำเร็จ ───────────────────────────────────────────────
   ⚠️ ตัดสินจาก `data.code` ไม่ใช่ข้อความ · ข้อความไทยมาจาก server เสมอ (documentWorkflowErrors)
   ⚠️ 403 กับ 503 ของ route **ไม่มี code** — ต้องถอยไปดู status */
const RETRY_HINT = `กด “${HISTORICAL_SAVE_BUTTON_LABEL}” อีกครั้งด้วยข้อมูลชุดเดิม — ระบบจำใบที่สร้างไปแล้วและไฟล์ที่อัปแล้ว จะไม่เกิดใบซ้ำหรืออัปไฟล์ซ้ำ`;
/* 🔴 ชนการหาดีลภาชนะต่างจากเน็ตหลุดตรงข้อเท็จจริงเดียวที่ผู้คีย์ต้องรู้: RPC raise ข้างใน
   ทรานแซกชัน ⇒ **ยังไม่มีอะไรลงฐาน** · ใช้คำเดียวกับเน็ตหลุด = ผู้คีย์กลัวว่าใบลงไปแล้วแล้วทิ้งฟอร์ม */
const RACE_HINT = `กด “${HISTORICAL_SAVE_BUTTON_LABEL}” อีกครั้งได้เลย — ยังไม่มีอะไรลงฐาน ระบบหาดีลของคู่ลูกค้า × AE ใหม่เอง`;
/* รหัสที่ server ตั้งกฎไว้เอง: ส่งก้อนเดิมซ้ำติดเหมือนเดิมทุกครั้ง แต่แก้ฟอร์มแล้วบันทึกใหม่ได้ */
const BLOCKED_HINT = 'ส่งก้อนเดิมซ้ำจะติดเหมือนเดิมทุกครั้ง — แก้ข้อมูลตามข้อความนี้แล้วกดส่งใหม่';

/* ⭐ รีวิวขั้น ④ 25/09: รหัสของขั้น ① / ② พาไปขั้นที่มีช่องให้แก้ — ของเดิมทุกอย่างนอกขั้น ③ ตกขั้น ① (400) หรือค้างขั้น ④ */
const HISTORICAL_CONTRACT_CODES = new Set([
  'historical_so_contract_file_missing', 'historical_so_contract_invalid', 'historical_so_check_contract',
  'historical_so_customer_required', 'historical_so_customer_not_found', 'historical_so_customer_inactive',
  'historical_so_owner_required', 'historical_so_owner_locked', 'historical_so_team_required',
  'historical_so_zero_value_note_required',
]);
const HISTORICAL_LINE_CODES = new Set([
  'historical_so_money_mismatch', 'historical_so_money_invalid', 'historical_so_zone_duplicate', 'historical_so_zone_invalid',
  'historical_so_line_invalid', 'historical_so_line_money_mismatch', 'historical_so_line_not_package',
  'historical_so_line_price_not_registry', 'historical_so_line_unpriced', 'historical_so_lines_required',
  'historical_so_check_lines', 'historical_so_header_invalid',
]);

const HISTORICAL_MONEY_CODES = new Set([
  'historical_so_opening_evidence_missing', 'historical_so_opening_invalid', 'historical_so_installment_invalid',
  'historical_so_installment_sum_mismatch', 'historical_so_installments_total', 'historical_so_coverage_broken',
  'historical_so_zero_value_has_installments', 'historical_so_check_installments',
]);

export function historicalSaveExit(error) {
  const status = Number(error?.status) || 0;
  const data = (error && typeof error.data === 'object' && error.data) || {};
  const code = text(data.code) || null;
  const message = text(data.error) || text(error?.message) || 'บันทึกใบสั่งขายย้อนหลังไม่สำเร็จ';
  const base = {
    kind: 'unknown', code, message, hint: null, goToStep: null,
    duplicates: null, existingOrderId: null, errors: null,
    canRetry: false, canEdit: false, canOpenExisting: false,
  };

  if (code === 'historical_so_intake_key_conflict') {
    return {
      ...base,
      kind: 'intake_key_conflict',
      /* ⭐ id ที่ server คำนวณจากรหัสการคีย์เดิม — ทางออกเดียวที่ไม่เสียงานที่พิมพ์ไว้คือเปิดใบนั้นในฟอร์มแก้ */
      existingOrderId: text(data.orderId) || null,
      canOpenExisting: true,
      hint: 'ใบของรหัสการคีย์รอบนี้เกิดไปแล้วแต่เนื้อไม่ตรงกัน — เปิดใบที่สร้างไว้ในฟอร์มแก้ไข แล้วแก้ต่อที่นั่น',
    };
  }
  if (code === 'historical_so_container_deal_race') {
    return { ...base, kind: 'container_deal_race', canRetry: true, hint: RACE_HINT };
  }
  if (code === 'historical_so_duplicate_unacknowledged') {
    return {
      ...base,
      kind: 'duplicate',
      duplicates: list(data.duplicates),
      goToStep: 'review',
    };
  }
  if (Array.isArray(data.errors) && data.errors.length) {
    const errors = data.errors;
    return { ...base, kind: 'invalid', errors, canEdit: true, goToStep: firstStepWithIssues(errors) };
  }
  /* ⭐ รหัสของงวด/งวดยกมา/หลักฐาน (RPC ของ 0374) พาไปขั้น ③ ที่มีช่องให้แก้ — ของเดิมพาไปขั้น ①/④ ซึ่งไม่มีช่องนั้น */
  const moneyStep = HISTORICAL_MONEY_CODES.has(code);
  const codeStep = moneyStep ? 'money' : (HISTORICAL_CONTRACT_CODES.has(code) ? 'contract' : (HISTORICAL_LINE_CODES.has(code) ? 'zones' : null));
  /* 400 ที่ไม่มี `errors[]` (เช่น `historical_so_money_mismatch`) — ข้อความของ server คือเหตุผลเดียวที่มี
     ⇒ ต้องพกมันไปโชว์ที่ขั้นปลายทางด้วย ไม่งั้น "กลับไปแก้" = จอเปล่า */
  if (status === 400) return { ...base, kind: 'invalid', canEdit: true, goToStep: codeStep || 'contract' };
  if (status === 403) return { ...base, kind: 'forbidden' };
  if (status === 503) return { ...base, kind: 'schema' };
  /* 🔴 รหัสอื่นที่มากับ 404/409/500 (`historical_so_edit_state_invalid` · `workflow_stale` …) — มาจากกฎ
     ฝั่ง server ที่ raise ข้างในทรานแซกชัน ⇒ **ห้ามเสนอ "บันทึกอีกครั้ง"** เพราะก้อนเดิมได้รหัสเดิมวนไม่รู้จบ */
  /* `unmapped` = รหัสที่ตารางรหัส → ขั้นไม่รู้จัก ⇒ แผงบันทึกให้แจ้งผู้ดูแลพร้อมรหัส (historicalSaveResultView) */
  if (code) return { ...base, kind: 'blocked', canEdit: true, goToStep: codeStep || 'review', hint: BLOCKED_HINT, unmapped: !codeStep };
  /* 5xx / เน็ตหลุด (ไม่มี response) = อาจลงฐานไปแล้ว — กดซ้ำได้ใบเดิมคืน (replayed) */
  if (!status || status >= 500) return { ...base, kind: 'unknown', canRetry: true, hint: RETRY_HINT };
  /* 4xx ที่ไม่มีทั้งรหัสและ `errors[]` — ไม่มีทางออกเฉพาะให้เดา */
  return { ...base, kind: 'unknown' };
}

/* ⭐ ทางออกที่เรนเดอร์จริงบนจอ (ปุ่มในแผงบันทึก) ตัดสินที่ `historicalSaveResultView` (lib/sales/historicalReviewView.js ·
   รีวิวขั้น ④ 25/09) — ของเดิม `historicalExitActions` มีปุ่มหลัก "บันทึกอีกครั้ง" ตัวที่สองที่เรียกบันทึกตรง **ข้ามด่านใบซ้ำ** ⇒ ถอดแล้ว
   · ใบซ้ำ (409) ไม่ใช่จอผิดพลาด — ฟอร์มรีเฟรชการ์ดใบที่อาจซ้ำแล้วปิดสวิตช์ (ดู catch ของ `runSave`) */

/**
 * ด่านใบซ้ำของขั้น ④ — ปุ่มบันทึก **โชว์แต่กดไม่ผ่าน** จนกว่าจะเปิดสวิตช์ (กฎบ้าน:
 * ไม่มีสิทธิ์ = ไม่โชว์ · ติดด่าน = โชว์แล้วบอกเหตุ)
 * 🔴 ตัวด่านอยู่ที่นี่ไม่ใช่ใน JSX เพราะเงื่อนไขในวงเล็บของ JSX ลบทิ้งได้โดยไม่มีเทสต์ไหนแดง
 *    และการพลาดข้อนี้แปลว่าใบซ้ำลงฐานจริง (พรีวิวไม่ถือว่าใบซ้ำเป็น error)
 */
export function historicalDuplicateGate({ duplicates = [], acknowledged = false, localIssues = [] } = {}) {
  const count = list(duplicates).length;
  const missing = list(localIssues).length;
  const gated = (count > 0 && !acknowledged) || missing > 0;
  /* ⚠️ ไม่พูดว่า "ยังกรอกไม่ครบ N ข้อ" — N นับเฉพาะข้อที่จอตรวจเองได้ ไม่ใช่ทุกช่องที่บังคับ
     (ช่องบังคับที่เหลือเป็นหน้าที่ของพรีวิว) ⇒ ตัวเลขนั้นอ่านเป็นคำสัญญาที่ระบบรักษาไม่ได้ */
  const blockedNote = missing > 0
    ? `ยังมี ${missing} ข้อที่ต้องแก้ก่อนบันทึก — กดแล้วระบบพาไปที่ช่องนั้น`
    : (gated ? 'เปิดสวิตช์นี้ก่อนจึงบันทึกได้ — ระบบพบใบที่อาจซ้ำของลูกค้ารายนี้' : null);
  return {
    gated,
    blockedNote,
    buttonTitle: gated ? (missing > 0 ? 'ยังมีข้อที่ต้องแก้' : 'เปิด “ตรวจแล้ว ไม่ใช่ใบซ้ำ” ก่อน') : null,
    /* ⚠️ บรรทัดใต้ปุ่มของขั้น ④ ไม่อยู่ที่นี่แล้ว — `historicalReviewFootNote` นับคำเตือนเป็นกลุ่ม (ของเดิมนับบรรทัด: งวดเลยกำหนด 10 งวด = 10 ข้อ) */
  };
}

/**
 * รหัสการคีย์ของฟอร์มหนึ่งรอบ — ออกใหม่เฉพาะตอนเปิดฟอร์มคีย์ใบใหม่
 * ⚠️ ห้ามออกใหม่ระหว่างกดบันทึกซ้ำ: รหัสเดิม + ข้อมูลเดิม = ได้ใบเดิมคืน (replayed)
 */
export function newHistoricalIntakeKey() {
  const source = globalThis.crypto;
  if (source && typeof source.randomUUID === 'function') return source.randomUUID();
  /* ทางถอยสำหรับสภาพแวดล้อมที่ไม่มี crypto — ต้องไม่ซ้ำภายในหน้าเดียวก็พอ
     (ด่านจริงคือ unique ของ `historicalIntakeHash` ฝั่งฐาน) */
  return `hist-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
