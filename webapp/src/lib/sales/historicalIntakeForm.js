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
import { splitCoverageEvenly } from '@/lib/sales/paymentCoverage';
import {
  HISTORICAL_REF_MAX, INSTALLMENT_LABEL_MAX, INSTALLMENT_NOTE_MAX, OPENING_INSTALLMENT_LABEL,
  charLength, isOpeningInstallment,
} from '@/lib/sales/historicalOrders';
import {
  CONTRACT_DATE_MESSAGES, HISTORICAL_LINE_MESSAGES, HISTORICAL_VAT_RATES, historicalLinesMoney, historicalZonePoint,
} from '@/lib/sales/historicalOrderPlan';
import { DEFAULT_SALE_UNIT } from '@/lib/master/units';

export {
  HISTORICAL_REF_MAX, INSTALLMENT_LABEL_MAX, INSTALLMENT_NOTE_MAX, HISTORICAL_VAT_RATES,
  CONTRACT_DATE_MESSAGES, HISTORICAL_LINE_MESSAGES, charLength,
};

/* ── ขั้นของฟอร์ม (ม็อก Step1–Step4 · REVISION 2) ────────────────────────────────────
   ⚠️ รางขั้นเป็น "ที่บอกตำแหน่ง" — ข้ามขั้นไม่ได้เพราะขั้นหลังต้องผ่านด่านของขั้นก่อน
   ⚠️ ป้ายขั้น ④ พูดถึงการส่งอนุมัติตรง ๆ: ปุ่มของขั้นนั้นคือ "บันทึกและส่งอนุมัติ" ไม่ใช่ "บันทึก" */
export const HISTORICAL_WIZARD_STEPS = Object.freeze([
  { key: 'contract', label: 'ลูกค้าและสัญญา', hint: 'ลูกค้า · เอกสาร · VAT' },
  { key: 'zones', label: 'ไซต์ โซน และรายการ', hint: 'เลือกจากทะเบียนไซต์' },
  { key: 'money', label: 'งวดชำระ', hint: 'งวดยกมา + งวดที่ยังต้องเก็บ' },
  { key: 'review', label: 'ตรวจและส่งอนุมัติ', hint: 'ส่ง AE Sup อนุมัติ' },
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
 * ⚠️ จำนวนเริ่มที่ **ว่าง** (ใบเสนอราคาเริ่มที่ 1) — จำนวนที่เดาให้คือบั๊กที่มติ 23/09 แก้ · ว่าง = แผนตีกลับ
 * ⚠️ `fgCode` · `description` · `unit` · `unitPrice` มีไว้ **โชว์** อย่างเดียว (มาจาก `quoteLineFromProduct`)
 *   ไม่ถูกส่งขึ้น API — server อ่านราคา/หน่วยจากทะเบียนเอง · `key` มีไว้ให้ React เท่านั้น
 * ⭐ `_lineKind: 'product'` + หน่วยตั้งต้น `DEFAULT_SALE_UNIT` = **บรรทัดสินค้าใหม่ของใบเสนอราคา** (`newProductLine`)
 *   🐞 รีวิว 23/09: แถวที่ติ๊กโซนแล้วแต่ยังไม่เลือกแพ็คเกจ (ทางปกติเมื่อ "ใช้แพ็คเกจเดียวกันทุกโซน" ยังว่าง)
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
    vatRate: null,             // null = ยังไม่เลือก (ไม่ใช่ 0 — 0 คือ "รวม VAT แล้ว")
    notes: '',
    packageProductId: '',      // แพ็คเกจที่ใช้กับทุกโซน — แต่ละแถวเขียนทับได้
    zones: [],
    hasOpening: null,          // null = ยังไม่เลือก · true = เคยเก็บแล้ว · false = ยังไม่เคยเก็บ
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

  return {
    ...base,
    orderId: order?.id || null,
    status: order?.status || null,
    updatedAt: order?.updatedAt || null,
    orderNumber: order?.orderNumber || null,
    rejection: order?.status === 'rejected'
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
    notes: text(order?.notes),
    packageProductId: text(zoneRows[0]?.productId),
    zones: zoneRows,
    hasOpening: rows.length ? Boolean(opening) : null,
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
  const hasPackage = Boolean(text(state.packageProductId));
  /* งวดทั้งชุดกลับไปเป็น "ยังไม่ตัดสินใจ" ไม่ใช่ false — ไม่มีค่าตั้งต้นให้การตัดสินใจ */
  const moneyPatch = { hasOpening: null, opening: emptyHistoricalWizard().opening, installments: [] };
  const moneyClears = [
    ...(openingAnswered ? [`คำตอบและยอดของ${OPENING_INSTALLMENT_LABEL}`] : []),
    ...(installmentCount ? [`งวดที่ยังต้องเก็บ ${installmentCount} งวด`] : []),
  ];

  if (field === 'vat') {
    const clears = moneyClears;
    return {
      ask: clears.length > 0,
      clears,
      patch: moneyPatch,
      title: 'เปลี่ยน VAT แล้วงวดชำระจะถูกล้าง',
      description: `ยอดใบคิดใหม่จาก VAT ที่เลือก ⇒ งวดที่คีย์ไว้จะไม่ตรงยอดใบอีก · ระบบจะล้าง: ${clears.join(' · ')}`,
      detail: 'รายการของทุกโซนยังอยู่ครบ — กดยกเลิกเพื่อคง VAT เดิมไว้',
      confirmLabel: 'เปลี่ยน VAT และล้างงวด',
    };
  }

  const clears = [
    ...(zoneCount ? [`โซนที่เลือกไว้ ${zoneCount} โซน`] : []),
    ...(hasPackage ? ['แพ็คเกจที่ใช้กับทุกโซน'] : []),
    ...moneyClears,
  ];
  return {
    ask: clears.length > 0,
    clears,
    patch: { zones: [], packageProductId: '', ...moneyPatch },
    title: 'เปลี่ยนลูกค้าแล้วของขั้น ② และ ③ จะถูกล้าง',
    description: `โซนมาจากทะเบียนไซต์ของลูกค้าเดิม และงวดชำระคิดจากยอดของโซนพวกนั้น ⇒ ระบบจะล้าง: ${clears.join(' · ')}`,
    detail: 'กดยกเลิกเพื่อคงลูกค้าเดิมไว้ — คีย์ผิดลูกค้าทั้งใบให้เริ่มใบใหม่แทน',
    confirmLabel: 'เปลี่ยนลูกค้าและล้างข้อมูล',
  };
}

/**
 * คำเตือนของขั้น ① เมื่อแก้วันสัญญาทั้งที่คีย์งวดไว้แล้ว — **บอกว่าจะเกิดอะไร ไม่ล้างให้**
 * (ช่วงครอบของทุกงวดต้องเต็มสัญญาพอดี ⇒ ขยับวันแล้วงวดเดิมยังใช้ได้ แค่ต้องแก้ช่วง)
 */
export function historicalCoverageWarning(state = {}) {
  const rows = list(state.installments).length;
  const opening = state.hasOpening === true;
  if (!rows && !opening) return null;
  const held = [
    ...(opening ? [OPENING_INSTALLMENT_LABEL] : []),
    ...(rows ? [`งวดที่ยังต้องเก็บ ${rows} งวด`] : []),
  ].join(' · ');
  return `แก้วันสัญญาแล้ว ${held} ที่คีย์ไว้ในขั้น ③ ไม่ถูกล้าง — แต่ช่วงครอบบริการต้องเต็มสัญญาพอดี ⇒ กลับไปตรวจขั้น ③ ก่อนส่งอนุมัติ`;
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
    preview = false, intakeKey = null, expectedUpdatedAt = null, acknowledgeDuplicates = false,
    openingEvidenceRefs = null,
  } = options;
  const evidence = openingEvidenceRefs === null ? list(state.openingEvidence) : list(openingEvidenceRefs);
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
    opening: state.hasOpening === true
      ? {
        amount: text(state.opening?.amount),
        coversTo: text(state.opening?.coversTo) || null,
        paidOn: text(state.opening?.paidOn) || null,
        note: text(state.opening?.note) || null,
        evidence,
      }
      : null,
    installments: list(state.installments).map((row) => ({
      label: text(row?.label),
      amount: text(row?.amount),
      dueDate: text(row?.dueDate) || null,
      coversFrom: text(row?.coversFrom) || null,
      coversTo: text(row?.coversTo) || null,
      note: text(row?.note) || null,
    })),
  };
  /* รหัสการคีย์: บังคับเฉพาะตอนสร้างจริง แต่ส่งตั้งแต่พรีวิวด้วย — มันคือตัวที่ทำให้ใบของ
     รหัสนี้เอง (ส่งซ้ำหลังเน็ตหลุด) ไม่ถูกนับเป็น "ใบที่อาจซ้ำ" ของตัวเอง */
  if (intakeKey) body.intakeKey = intakeKey;
  if (expectedUpdatedAt) body.expectedUpdatedAt = expectedUpdatedAt;
  if (acknowledgeDuplicates) body.acknowledgeDuplicates = true;
  return body;
}

/* ── ช่อง → ขั้น ───────────────────────────────────────────────────────────────
   ชื่อช่องมาจาก `planHistoricalServiceOrder` (`err(field, …)`) และจาก local issues ข้างล่าง
   ของที่ไม่รู้จักตกที่ขั้นแรก เพราะขั้นแรกคือที่ที่ผู้คีย์เห็นข้อความได้แน่นอนที่สุด */
const FIELD_STEP = new Map([
  ['customerId', 'contract'], ['ownerId', 'contract'], ['team', 'contract'], ['deal', 'contract'],
  ['contract', 'contract'], ['refs', 'contract'], ['vatRate', 'contract'],
  ['notes', 'contract'], ['todayIso', 'contract'],
  ['zones', 'zones'],
  ['opening', 'money'], ['installments', 'money'],
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
  if (isDateText(from) && today && from > today) {
    issues.push({ field: 'contract.startDate', message: CONTRACT_DATE_MESSAGES.startAfterToday });
  }
  if (isDateText(to)) {
    if (isDateText(from) && to < from) {
      issues.push({ field: 'contract.endDate', message: CONTRACT_DATE_MESSAGES.endBeforeStart });
    } else if (today && to < today && !editing) {
      issues.push({ field: 'contract.endDate', message: CONTRACT_DATE_MESSAGES.endBeforeToday });
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
  zeroValue = false, todayIso = null,
} = {}) {
  const issues = [];
  const add = (field, message) => issues.push({ field, message });
  /* ⚠️ วันสัญญาอยู่ก่อนเพื่อน — มันคือช่องที่ผู้คีย์เพิ่งพิมพ์ค้างไว้บนจอ (ดูหัว
     `historicalContractDateIssues`) · ขั้น ① หยิบข้อความชุดนี้ไปแปะใต้ช่องเอง
     🔴 `editing` = ตัวแยกสร้าง/แก้ตัวเดียวกับที่ไฟล์นี้ใช้กับช่องทีม (`locked`) และตรงกับ
        `ctx.editing` ของแผน ⇒ สัญญาที่สิ้นสุดไปแล้วบนใบที่มีอยู่แล้วเป็นคำเตือน ไม่ใช่ด่าน */
  const editing = Boolean(state.orderId);
  for (const issue of historicalContractDateIssues(state, { todayIso, editing })) issues.push(issue);

  /* AE / Senior AE คีย์ได้เฉพาะของตัวเอง — ช่องบนจอล็อกเป็นตัวเองอยู่แล้ว (form-design-rules §2)
     ที่นี่กันกรณี state เพี้ยน (เช่น hydrate ใบของคนอื่นมาแก้) ก่อนยิงพรีวิวให้เปลือง */
  if (ownerLockedToSelf(role) && text(userId) && text(state.ownerId) && text(state.ownerId) !== text(userId)) {
    add('ownerId', 'AE / Senior AE คีย์ใบย้อนหลังได้เฉพาะของตัวเอง');
  }
  if (!HISTORICAL_VAT_RATES.includes(state.vatRate)) add('vatRate', HISTORICAL_VAT_CHOICE_MESSAGE);
  /* 🪤 โหมด "ราคารวม VAT แล้ว — ถอด VAT 7%" ถูกถอด (มติ 23/09) และ body ไม่ส่งมันแล้ว ⇒ state ที่ยังพกมันมา
     จะกลายเป็น "+ VAT 7% ท้ายใบ" เงียบ ๆ = ยอดใบบวก VAT ซ้ำ ⇒ ต้องเลือกใหม่ ไม่ใช่เดา
     ⚠️ ขั้น ① ไม่มีแผ่นที่ตั้งธงนี้แล้ว (แผ่น VAT = QUOTE_VAT_OPTIONS) · ด่านนี้เหลือไว้กัน state ที่มาจากทางอื่น */
  else if (state.amountsIncludeVat === true) add('vatRate', `โหมด “ราคารวม VAT แล้ว — ถอด VAT” เลิกใช้แล้ว — ${HISTORICAL_VAT_CHOICE_MESSAGE}`);

  /* ⚠️ ถามจาก **ชุดตัวเลือกที่อยู่บนจอจริง** ไม่ใช่จากจำนวนทีมของ AE (ดูหัว `historicalTeamField`) */
  const teamField = historicalTeamField({ ownerTeams, sharedTeams, locked: Boolean(state.orderId) });
  if (teamField.ask && !teamField.options.includes(text(state.team))) {
    add('team', `AE คนนี้อยู่ ${teamField.options.length} ทีม — เลือกทีมที่ใบนี้เข้า (ทีมของดีลตามที่เลือก)`);
  }

  /* 🔴 ไฟล์ทั้งสองชุดอัปได้ **หลังใบเกิดแล้ว** (ต้องมีแถวก่อนถึงจะมีโฟลเดอร์ให้แนบ) ⇒ พรีวิวไม่เห็น
     แต่ขั้นส่งอนุมัติตีกลับทั้งคู่ · ถามที่นี่ = ผู้คีย์รู้ตั้งแต่ก่อนกด ไม่ใช่หลังใบร่างเกิดแล้ว */
  /* 🪤 `null` = **ยังไม่รู้** (แผงไฟล์แนบยังไม่รายงานและไม่มีจำนวนที่ hydrate มาให้ถอย) —
     ห้ามนับเป็น 0 แล้วบอกว่า "ยังไม่แนบ" และห้ามปล่อยผ่าน · ดู `historicalContractFileCount` */
  if (contractFileCount === null) {
    add('contract.file', 'ยังอ่านจำนวนไฟล์เอกสารแทนสัญญาไม่ได้ — โหลดหน้านี้ใหม่แล้วลองอีกครั้ง');
  } else if (contractFileCount < 1) {
    add('contract.file', 'ต้องแนบไฟล์เอกสารที่ใช้แทนสัญญาอย่างน้อย 1 ไฟล์ — AE Sup อนุมัติจากไฟล์นี้');
  }
  /* 🪤 ใบยอด 0 บาท **ไม่มีงวดสักงวด** (ตัวตรวจงวดของแผน + CHECK ของ 0374) ⇒ ขั้น ③ ซ่อนทั้ง
     แผ่นเลือก ตารางงวด และช่องหลักฐาน · ถามต่อที่นี่ = ถามข้อที่ไม่มีช่องให้ตอบ แล้วปุ่มบันทึก
     เด้งกลับขั้น ③ ทุกครั้งไม่รู้จบ ⇒ ธงตัวเดียวกับที่ขั้น ③ ใช้ซ่อนช่อง ต้องปิดคำถามคู่นี้ด้วย */
  if (!zeroValue) {
    if (state.hasOpening !== true && state.hasOpening !== false) {
      add('opening', `เลือกว่าเคยเก็บเงินไปแล้วบางส่วนหรือยัง — เคยเก็บแล้ว = คีย์เป็น${OPENING_INSTALLMENT_LABEL} 1 งวด`);
    }
    if (state.hasOpening === true && evidenceFileCount < 1) {
      add('opening.evidence', `${OPENING_INSTALLMENT_LABEL}ต้องมีหลักฐานการเก็บเงินอย่างน้อย 1 ไฟล์ (ใบกำกับ ใบเสร็จ หรือ statement)`);
    }
  }
  return issues;
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
  vat: 'เลือก VAT ของใบในขั้น ① ก่อน ระบบจึงคิดยอดใบได้',
  zones: 'เลือกโซนอย่างน้อย 1 โซนในขั้น ② ก่อน ระบบจึงคิดยอดใบได้',
  lines: 'เลือกแพ็คเกจ / ใส่จำนวนของทุกโซนในขั้น ② ให้ครบก่อน ระบบจึงคิดยอดใบได้',
  /* 🐞 รีวิว 23/09: จำนวน 1.5 / 0 เคยได้เหตุ "lines" (ให้ไปใส่ให้ครบ) ทั้งที่แพ็คเกจกับจำนวนกรอกแล้วทั้งคู่ —
     เหตุจริงโผล่ตอนกด "ถัดไป" เท่านั้น ⇒ ข้อความเดียวกับที่แผนตีกลับ (HISTORICAL_LINE_MESSAGES.qty) */
  qty: `${HISTORICAL_LINE_MESSAGES.qty} — แก้จำนวนของโซนนั้นในขั้น ② ก่อน ระบบจึงคิดยอดใบได้`,
  price: 'แพ็คเกจของบางโซนยังไม่ตั้งราคาในฐานข้อมูลสินค้า — ตั้งราคาที่ทะเบียนสินค้าก่อน ระบบจึงคิดยอดใบได้',
});

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
      vatAmount: serverMoney.vatAmount,
      totalAmount: serverMoney.totalAmount,
    };
  }
  const unknown = (reason) => ({
    ok: false, source: 'local', reason, subtotal: null, vatAmount: null, totalAmount: null,
  });
  const vatRate = state.vatRate;
  if (!HISTORICAL_VAT_RATES.includes(vatRate)) return unknown(HISTORICAL_MONEY_UNKNOWN.vat);
  const zones = list(state.zones);
  if (!zones.length) return unknown(HISTORICAL_MONEY_UNKNOWN.zones);
  const rows = [];
  for (const row of zones) {
    const { input, reason } = zoneRowMoneyInput(row);
    if (!input) return unknown(HISTORICAL_MONEY_UNKNOWN[reason]);
    rows.push(input);
  }
  const money = historicalLinesMoney(rows, vatRate);
  return {
    ok: true,
    source: 'local',
    reason: null,
    subtotal: money.subtotal,
    vatAmount: money.vatAmount,
    totalAmount: money.totalAmount,
  };
}

/**
 * กล่องสรุปท้ายตารางรายการ (ขั้น ② และ ④) — ป้ายของใบเสนอราคา: ยอดรวมสินค้า/บริการ · ภาษีมูลค่าเพิ่ม (ตัวเลือก VAT) ·
 * ยอดรวมทั้งสิ้น · ⭐ ตัวเดียวที่สองขั้นอ่าน ⇒ ป้ายไม่มีทางพูดคนละคำระหว่างขั้นคีย์กับขั้นตรวจ
 * ⚠️ ใบย้อนหลัง **ไม่มีส่วนลดท้ายใบ** (แผนคิดส่วนลดรายบรรทัดอย่างเดียว) ⇒ ไม่มีแถว "หัก ส่วนลด" ให้ตอบ
 * @param money   `{ ok, subtotal, vatAmount, totalAmount }` (ขั้น ②: historicalMoneyView · ขั้น ④: header ของแผน + ok)
 * @param vatRate ตัวเลือก VAT ของใบ (0 = รวม VAT แล้ว ⇒ แถว VAT เป็นขีด เหมือนท้ายตารางใบเสนอราคา)
 * @returns `{ rows: [{ id, label, value }], grandTotal }` — ยังไม่รู้ยอด = ขีดทุกช่อง (ห้ามเป็น 0.00)
 */
export function historicalTotalsView(money = {}, vatRate = null) {
  const ok = Boolean(money?.ok);
  const vatLabel = HISTORICAL_VAT_RATES.includes(Number(vatRate)) && vatRate !== null ? vatLabelOf(Number(vatRate)) : null;
  return {
    rows: [
      { id: 'subtotal', label: 'ยอดรวมสินค้า/บริการ', value: ok ? fmtMoney(money.subtotal) : null },
      {
        id: 'vat',
        label: vatLabel ? `ภาษีมูลค่าเพิ่ม (${vatLabel})` : 'ภาษีมูลค่าเพิ่ม',
        value: ok && Number(vatRate) > 0 ? fmtMoney(money.vatAmount) : null,
      },
    ],
    grandTotal: ok ? fmtMoney(money.totalAmount) : NA,
  };
}

/**
 * ผลรวมงวดทั้งใบตามที่ฟอร์มถืออยู่ (สตางค์ล้วน) — **ตัวช่วยคิดของขั้น ③ ไม่ใช่ด่าน**
 * ด่านจริงคือ `plan.check` + CHECK ของ 0374 · ที่นี่มีไว้บอกผู้คีย์ว่ายังขาด/เกินเท่าไร
 * ตอนที่พรีวิวยังไม่ผ่าน (ซึ่งคือตอนที่เขาต้องการตัวเลขนี้ที่สุด — รีวิว R7)
 * @returns `{ sum, diff }` — `diff` = ยอดใบ − ผลรวมงวด (บวก = ยังขาด) · ไม่รู้ยอดใบ = null ทั้งคู่
 */
export function historicalInstallmentSum(state = {}, totalAmount = null) {
  const rows = list(state.installments);
  let satang = state.hasOpening === true ? toSatang(state.opening?.amount) : 0;
  for (const row of rows) satang += toSatang(row?.amount);
  const sum = satang / 100;
  if (totalAmount === null || totalAmount === undefined || !Number.isFinite(Number(totalAmount))) {
    return { sum, diff: null };
  }
  return { sum, diff: (toSatang(totalAmount) - satang) / 100 };
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
export const HISTORICAL_FULL_WIDTH_STEPS = Object.freeze(['zones', 'review']);
export const historicalStepShowsAside = (step) => !HISTORICAL_FULL_WIDTH_STEPS.includes(step);

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
  ['vatRate', 'vat'],
  ['zones', 'zones'],
  ['opening', 'opening'], ['opening.evidence', 'opening-evidence'],
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
export function historicalWizardRail(state = {}, {
  step = 'contract', localIssues = [], serverIssues = [], plan = null, customerLabel = null,
} = {}) {
  const all = [...list(localIssues), ...list(serverIssues)];
  const block = historicalNextBlock(localIssues, step);
  const here = HISTORICAL_WIZARD_STEP_ORDER.indexOf(step);
  const zones = list(state.zones);
  const installments = list(state.installments);
  const docKind = docKindText(state.contract?.docKind);

  const summaries = {
    contract: [text(customerLabel), docKind].filter(Boolean).join(' · '),
    zones: zones.length ? `${fmtNumber(zones.length)} โซน` : '',
    money: plan?.zeroValue ? 'ใบยอด 0 บาท — ไม่มีงวด' : [
      state.hasOpening === true ? 'ยกมา 1 งวด' : (state.hasOpening === false ? 'ไม่มีงวดยกมา' : ''),
      installments.length ? `ต้องเก็บ ${fmtNumber(installments.length)} งวด` : '',
    ].filter(Boolean).join(' · '),
    /* ขั้น ④ มีของให้สรุปก็ต่อเมื่อพรีวิวผ่านแล้วจริง ๆ — ไม่มีแผน = ยังไม่มีอะไรถูกตรวจ */
    review: plan ? 'ตรวจแล้ว — พร้อมส่ง AE Sup' : '',
  };

  return HISTORICAL_WIZARD_STEPS.map((item, index) => {
    const issues = issuesForStep(all, item.key).length;
    const summary = text(summaries[item.key]);
    const blocked = index > here && block.blocked ? `ยังไปขั้นนี้ไม่ได้ — ${block.message}` : null;
    return {
      key: item.key,
      label: item.label,
      /* ไม่มีอะไรจะสรุป = บอกว่าขั้นนี้ถามอะไร (ป้ายเดิมของม็อก) ไม่ใช่ปล่อยบรรทัดว่าง */
      summary: summary || item.hint,
      filled: Boolean(summary),
      issues,
      tone: issues ? 'some' : (summary ? 'full' : 'none'),
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
  const restRows = plan?.installments?.length ?? list(state.installments).length;

  const vat = HISTORICAL_VAT_RATES.includes(state.vatRate) ? vatLabelOf(state.vatRate) : null;

  const openingValue = (() => {
    if (plan?.opening) return `${fmtMoney(plan.opening.amount)} · หลักฐาน ${fmtNumber(evidenceFileCount)} ไฟล์`;
    if (state.hasOpening === false) return 'ไม่มี — ยังไม่เคยเก็บเงิน';
    if (state.hasOpening !== true) return null;
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
        ? `${fmtDate(state.contract.startDate)} – ${fmtDate(state.contract.endDate)}${span.months ? ` · ${fmtNumber(span.months)} เดือน` : ''}`
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
    { id: 'zones', label: 'โซน', value: zones.length ? `${fmtNumber(zones.length)} โซน` : null },
    { id: 'subtotal', label: 'ยอดรวมสินค้า/บริการ', value: money.ok ? fmtMoney(money.subtotal) : null },
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
export function historicalFootNote({ step = 'contract', gate = null } = {}) {
  if (step === 'review') return text(gate?.footNote);
  return `ยังไม่บันทึกอะไร — “${HISTORICAL_NEXT_BUTTON_LABEL}” คือการตรวจข้อมูลของขั้นนี้ · ใบเกิดและถูกส่งให้ AE Sup ตอนกด “${HISTORICAL_SAVE_BUTTON_LABEL}” ในขั้นสุดท้าย`;
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
  const months = contractMonths(from, to);
  const dated = isDateText(from) && isDateText(to) && to >= from;
  const partial = months === null && dated;
  return { months, dated, partial, note: partial ? CONTRACT_PARTIAL_NOTE : null };
}

/* 🚫 ปุ่มลัด "ใช้ราคาแพ็คเกจ × แพ็ค × เดือน" (`zoneAmountSuggestion` / `zoneAmountSuggestionNote`) ถูกถอดตามมติ 23/09
   🐞 มันคูณเดือนซ้ำบนจำนวนที่นับเดือนไปแล้ว — 1 ชุด × 12 เดือน คีย์เป็นจำนวน 12 แล้วปุ่มเสนอ 3,500 × 12 × 12 = 504,000
   ⇒ ยอดของโซนคือ จำนวน × ราคา/หน่วย − ส่วนลด ตามสูตรใบเสนอราคา (historicalLinesMoney) ไม่มีปุ่มเสนอยอดอีก */

/* ── ตัวกางทะเบียนไซต์/โซนของขั้น ② ──────────────────────────────────────────────
 *
 * 🐞 UAT 23/09 (ของจริงบนฐาน): AR-374 บริษัท เซ็นทรัล ฟู้ด รีเทล มี **26 ไซต์ 43 โซน**
 *   ⇒ ขั้น ② กางการ์ด 26 ใบรวด ไม่มีช่องค้น และไซต์เดียวที่โหลดโซนไม่สำเร็จทำให้ทั้งลิสต์ว่าง
 *   (Promise.all ตัวเดียวพังทั้งก้อน) · ตัวตัดสินสามข้อนี้จึงอยู่ที่นี่ ไม่ใช่ใน JSX:
 *     ① ค้นด้วยคำเดียว — รหัสไซต์ · ชื่อไซต์ · ชื่อโซน · รหัสโซน (**ทุกอย่างที่ตาเห็นบนแถว**
 *        ตามกฎบ้าน search haystack · เห็นแล้วค้นไม่เจอ = บั๊ก)
 *     ② ไซต์ที่ตรงชื่อ/รหัสกางทั้งใบ (ทุกโซนของมันคือคำตอบ) · ไซต์ที่ตรงเฉพาะบางโซน
 *        โชว์เฉพาะโซนนั้น · ไม่ตรงเลย = ซ่อน แล้วรายงานจำนวนที่ซ่อนไว้ให้เห็น — เลขนั้นคือ
 *        `siteTotal − rows.length` (จอพูดว่า "แสดง N จาก M ไซต์") ไม่ใช่คีย์ของตัวเองในผลลัพธ์
 *     ③ **โซนที่เลือกไว้แล้วแต่ถูกคำค้นซ่อน** ต้องถูกนับมาบอก — ยอดรวมท้ายจอนับมันอยู่
 *        ถ้าไม่บอก ผู้คีย์จะอ่านว่า "ยอดมาจากไหนไม่รู้"
 * ⚠️ ไซต์ที่โหลดโซนไม่สำเร็จ **โชว์เสมอ** แม้กำลังค้นอยู่ — ยังไม่รู้ว่าข้างในมีโซนที่ตรงไหม
 *   การซ่อนมันคือการตอบแทนข้อมูลที่ไม่มี (กฎบ้าน: บอกเหตุ ไม่ใช่เงียบ)
 */
export const ZONE_SITE_AUTO_OPEN_MAX = 4;

const zoneHaystack = (...parts) => parts.map(text).filter(Boolean).join(' ').toLowerCase();

/**
 * @param sites        ไซต์จากทะเบียน (ตามลำดับที่ API คืนมา)
 * @param zonesBySite  `{ [siteId]: zone[] }` — ไซต์ที่ยังโหลดไม่สำเร็จไม่มีคีย์ของตัวเอง
 * @param siteErrors   `{ [siteId]: ข้อความ }` ของไซต์ที่โหลดโซนไม่สำเร็จ (โหลดทีละไซต์ ⇒ พังทีละใบ)
 * @param pickedZoneIds โซนที่ติ๊กไว้แล้ว — ใช้ตัดสินว่ากางใบไหนและนับใบที่คำค้นซ่อน
 * @param ready        ทะเบียนโหลดเสร็จแล้วหรือยัง — เท็จ = ยังตัดสิน `orphans` ไม่ได้
 * @returns `{ rows, siteTotal, zoneTotal, shownZones, hiddenPicked, orphans, unresolved }`
 *   rows: `{ site, zones, picked, total, error, defaultOpen }`
 *   ⚠️ **ไม่มี `hiddenSites`** — ไซต์หนึ่งใบไม่ถูกใส่ใน `rows` ก็คือใบที่คำค้นซ่อน ⇒ จำนวนคือ
 *      `siteTotal − rows.length` เป๊ะ ๆ อยู่แล้ว · คีย์ที่ไม่มีใครอ่านคือของที่รอเพี้ยนจากจอ
 *
 * 🔴 `orphans` = โซนที่ใบผูกไว้แต่ **ไม่มีอยู่ในทะเบียนที่โหลดมาเลยสักไซต์** (รีวิว R10) —
 *    ไซต์ถูกปิดใช้งาน (`includeInactive=0`) · ไซต์ถูกโอนไปลูกค้ารายอื่น · โซนถูกลบโดยแอดมิน
 *    ⇒ แถวไม่ถูกเรนเดอร์สักแถว แต่ `state.zones` ยังนับมันอยู่ และตัวติ๊กคือทางเดียวที่ถอดออกได้
 *    ⇒ ทางตัน: แก้ใบให้ผ่านไม่ได้จนกว่าฝ่าย TS จะเปิดคืน · ต้องมีปุ่มถอดของตัวเองบนจอ
 *
 * 🔴 **N1 (รีวิวรอบสอง 23/09 — ของเดิมทำลายข้อมูล)**: `orphans` เคยสร้างจาก "ทุกไซต์" โดย
 *    **ไม่ดู `siteErrors` เลย** ⇒ ไซต์เดียวอ่านโซนไม่สำเร็จ (เน็ตกระตุก · 500 ชั่วคราว) =
 *    ทุกโซนของไซต์นั้นขึ้นก้อนแดงพร้อมปุ่ม "ถอดโซนนี้ออกจากใบ" ⇒ ผู้คีย์ทำตามที่จอสั่งแล้ว
 *    **ลบบรรทัดจริงของใบเพราะคำขอที่พังชั่วคราว** (ถอดแล้วยอดใบเปลี่ยน ไม่มีทางกู้นอกจากคีย์ใหม่)
 *    ⇒ กติกาใหม่: กำพร้าได้เฉพาะเมื่อ **อ่านทะเบียนครบทุกไซต์แล้ว** · ยังมีไซต์ที่อ่านไม่ได้
 *      = ตัดสินไม่ได้ ⇒ ไปกอง `unresolved` ซึ่งจอต้องวาดเป็น "ยังอ่านทะเบียนไม่ได้" พร้อม
 *      ปุ่มลองอ่านใหม่ของไซต์ **ห้ามมีปุ่มถอด**
 *    ⚠️ ทำไมต้องตัดสินทั้งกอง ไม่ใช่รายไซต์: โซนที่ติ๊กไว้มีแต่รหัสโซน · แถวที่ hydrate มากับใบ
 *      ไม่มี `siteId` ติดมาด้วย (`wizardStateFromOrder` อ่านจากบรรทัด SO ซึ่งมีแต่ `serviceZoneId`)
 *      ⇒ แมตช์ "โซนนี้อยู่ไซต์ไหน" เองไม่ได้เมื่อไซต์นั้นคือไซต์ที่อ่านไม่สำเร็จ
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
    rows.push({
      site,
      zones: shown,
      picked: pickedHere,
      total: zones.length,
      error,
      /* กางเองเมื่อ "มีเรื่องต้องทำในใบนี้" — พัง · ตรงคำค้น · มีโซนที่ติ๊กไว้ · หรือลูกค้ามีไซต์ไม่กี่ใบ
         (ม็อกมี 2 ไซต์ ⇒ ของเดิมกางหมดคือถูกแล้วสำหรับลูกค้าทั่วไป · 26 ใบต่างหากที่ต้องพับ) */
      defaultOpen: Boolean(error) || Boolean(q) || pickedHere > 0 || all.length <= ZONE_SITE_AUTO_OPEN_MAX,
    });
  }

  /* โซนที่ทะเบียนไม่มีให้เห็นเลย — นับจาก **ทุกโซนของทุกไซต์** ไม่ใช่เฉพาะที่คำค้นโชว์
     (คำค้นซ่อนของไว้เฉย ๆ ⇒ `hiddenPicked` เป็นคนบอก ไม่ใช่ `orphans`) */
  const known = new Set();
  for (const site of all) for (const zone of list(zonesBySite?.[site?.id])) known.add(text(zone?.id));
  const missing = ready
    ? [...new Set(list(pickedZoneIds).map(text).filter(Boolean))].filter((id) => !known.has(id))
    : [];
  /* 🔴 N1: ยังมีไซต์ที่อ่านโซนไม่สำเร็จ = **ยังไม่รู้** ว่าโซนที่หายไปอยู่ในไซต์นั้นหรือหายจริง
     ⇒ ห้ามตอบ "กำพร้า" (ปุ่มถอด = ลบบรรทัดจริง) · ตอบ "ยังอ่านทะเบียนไม่ได้" แล้วรอปุ่มลองอีกครั้ง */
  const blind = all.some((site) => Boolean(text(siteErrors?.[site?.id])));
  const orphans = blind ? [] : missing;
  const unresolved = blind ? missing : [];

  return { rows, siteTotal: all.length, zoneTotal, shownZones, hiddenPicked, orphans, unresolved };
}

/**
 * บรรทัดของใบในขั้น ② — หนึ่งแถวโซนที่ติ๊กไว้ = หนึ่งบรรทัดของ **ตารางรายการแบบใบเสนอราคา** ใต้การ์ดไซต์
 * (มติเจ้าของ 23/09 · รีวิว 23/09: ตารางแยกจากการ์ดไซต์ ⇒ คอลัมน์ # · รายการ · … · ปุ่มลบ เท่าใบเสนอราคาเป๊ะ
 * และโซนที่ผูกกลายเป็นบรรทัด "ไซต์ · โซน" ใต้คำอธิบาย แบบเดียวกับตารางฝั่งอ่านของขั้น ④ และหน้าใบสั่งขาย)
 *
 * ต่อแถวคืน `{ row, index, zone, site, point, note, name, removable, removeTitle }`
 *   - point: ชื่อจุด (`historicalZonePoint` — สูตรเดียวกับที่แผนเขียนลงบรรทัด) · null เมื่อยังหาโซนไม่เจอ
 *   - note:  เหตุที่ยังไม่มีชื่อจุด (กำลังโหลด · ยังอ่านทะเบียนไม่ได้ · ไม่อยู่ในทะเบียน) — ขึ้นแทนชื่อ
 *   - name:  ชื่อบรรทัดของโปรแกรมอ่านหน้าจอ ("รายการของโซน <ชื่อโซน>" · หาโซนไม่เจอ = "รายการ N")
 *   - removable/removeTitle: ปุ่มลบท้ายแถว (= ถอนติ๊กโซน)
 * 🔴 N1: โซนที่ **ยังตัดสินไม่ได้** (มีไซต์ที่อ่านโซนไม่สำเร็จ) ลบไม่ได้ — ยังไม่รู้ว่ามันหายจริงหรือแค่อยู่ในไซต์
 *    ที่อ่านไม่ถึง (ปุ่มลบ = ลบบรรทัดจริง) · ระหว่างโหลดก็เช่นกัน · โซนกำพร้าจริง (อ่านครบแล้วไม่เจอ) ลบได้ (R10)
 */
export function historicalZoneLines({
  zones = [], sites = [], zonesBySite = {}, siteErrors = {}, ready = true,
} = {}) {
  const where = new Map();
  for (const site of list(sites)) {
    for (const zone of list(zonesBySite?.[site?.id])) where.set(text(zone?.id), { zone, site });
  }
  const blind = list(sites).some((site) => Boolean(text(siteErrors?.[site?.id])));
  return list(zones).map((row, index) => {
    const found = where.get(text(row?.zoneId)) || null;
    const zone = found?.zone || null;
    const site = found?.site || null;
    let note = null;
    let removable = true;
    let removeTitle = null;
    if (!found) {
      if (!ready) {
        note = 'กำลังโหลดทะเบียนไซต์…';
        removable = false;
        removeTitle = 'รอทะเบียนไซต์โหลดเสร็จก่อน';
      } else if (blind) {
        note = `${text(row?.zoneId)} — ยังอ่านทะเบียนไม่ได้`;
        removable = false;
        removeTitle = 'ยังอ่านทะเบียนไซต์ไม่ครบ — กด “ลองอ่านไซต์ที่พังอีกครั้ง” ก่อน จึงจะรู้ว่าโซนนี้หายจริงไหม';
      } else {
        note = `${text(row?.zoneId)} — ไม่อยู่ในทะเบียนที่โหลดมา`;
      }
    }
    return {
      row,
      index,
      zone,
      site,
      point: zone && site ? historicalZonePoint(zone, site) : null,
      note,
      name: zone ? `รายการของโซน ${text(zone.name) || text(zone.id)}` : `รายการ ${index + 1}`,
      removable,
      removeTitle,
    };
  });
}

/**
 * "แบ่งงวดที่เหลืออัตโนมัติ" — ช่วงต่อกันสนิทถึงวันสิ้นสุดสัญญา และยอดรวมเท่ายอดที่เหลือเป๊ะ
 * ⚠️ เศษสตางค์ลงงวดสุดท้าย (เหมือน `splitCoverageEvenly` ที่ให้งวดสุดท้ายกินเศษวัน) — ผลรวมต้องตรง
 *   ยอดใบเสมอ ไม่งั้นตัวตรวจงวดตีกลับ "ยอดงวดรวมไม่เท่ายอดใบ" ทันทีที่กดปุ่มนี้
 */
export function splitRemaining({ startDate, endDate, count, amount, label = 'งวด' } = {}) {
  const spans = splitCoverageEvenly({ startDate, endDate, count });
  if (!spans.length) return [];
  const total = toSatang(amount);
  const each = Math.floor(total / spans.length);
  return spans.map((span, index) => {
    const last = index === spans.length - 1;
    const satang = last ? total - each * (spans.length - 1) : each;
    return emptyHistoricalInstallment({
      label: spans.length === 1 ? label : `${label} ${index + 1}/${spans.length}`,
      amount: String(satang / 100),
      dueDate: span.coversFrom,
      coversFrom: span.coversFrom,
      coversTo: span.coversTo,
    });
  });
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
const RETRY_HINT = 'กดบันทึกอีกครั้งด้วยข้อมูลชุดเดิม — ระบบจำใบที่สร้างไปแล้วและไฟล์ที่อัปแล้ว จะไม่เกิดใบซ้ำหรืออัปไฟล์ซ้ำ';
/* 🔴 ชนการหาดีลภาชนะต่างจากเน็ตหลุดตรงข้อเท็จจริงเดียวที่ผู้คีย์ต้องรู้: RPC raise ข้างใน
   ทรานแซกชัน ⇒ **ยังไม่มีอะไรลงฐาน** · ใช้คำเดียวกับเน็ตหลุด = ผู้คีย์กลัวว่าใบลงไปแล้วแล้วทิ้งฟอร์ม */
const RACE_HINT = 'กดบันทึกอีกครั้งได้เลย — ยังไม่มีอะไรลงฐาน ระบบหาดีลของคู่ลูกค้า × AE ใหม่เอง';
/* รหัสที่ server ตั้งกฎไว้เอง: ส่งก้อนเดิมซ้ำติดเหมือนเดิมทุกครั้ง แต่แก้ฟอร์มแล้วบันทึกใหม่ได้ */
const BLOCKED_HINT = 'บันทึกก้อนเดิมซ้ำจะติดเหมือนเดิมทุกครั้ง — แก้ข้อมูลตามข้อความข้างบนแล้วบันทึกใหม่';

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
  /* 400 ที่ไม่มี `errors[]` (เช่น `historical_so_money_mismatch`) — ข้อความของ server คือเหตุผลเดียวที่มี
     ⇒ ต้องพกมันไปโชว์ที่ขั้นปลายทางด้วย ไม่งั้น "กลับไปแก้" = จอเปล่า */
  if (status === 400) return { ...base, kind: 'invalid', canEdit: true, goToStep: 'contract' };
  if (status === 403) return { ...base, kind: 'forbidden' };
  if (status === 503) return { ...base, kind: 'schema' };
  /* 🔴 รหัสอื่นที่มากับ 404/409/500 (`historical_so_edit_state_invalid` · `workflow_stale` …) — มาจากกฎ
     ฝั่ง server ที่ raise ข้างในทรานแซกชัน ⇒ **ห้ามเสนอ "บันทึกอีกครั้ง"** เพราะก้อนเดิมได้รหัสเดิมวนไม่รู้จบ */
  if (code) return { ...base, kind: 'blocked', canEdit: true, goToStep: 'review', hint: BLOCKED_HINT };
  /* 5xx / เน็ตหลุด (ไม่มี response) = อาจลงฐานไปแล้ว — กดซ้ำได้ใบเดิมคืน (replayed) */
  if (!status || status >= 500) return { ...base, kind: 'unknown', canRetry: true, hint: RETRY_HINT };
  /* 4xx ที่ไม่มีทั้งรหัสและ `errors[]` — ไม่มีทางออกเฉพาะให้เดา */
  return { ...base, kind: 'unknown' };
}

/* ── ทางออกที่เรนเดอร์จริงบนจอ ───────────────────────────────────────────────
   🔴 แยกออกมาเป็นข้อมูลเพราะ JSX ที่เขียน `{exit.canX && (` ถอดออกทีละอันได้โดยชุดเทสต์ยังเขียว —
   ตัวตัดสินถูกคุ้มอยู่แล้ว แต่ "ปุ่มที่ผู้ใช้เห็น" ไม่มีใครคุ้ม */
const EXIT_ACTION_LABELS = Object.freeze({
  edit: 'กลับไปแก้', open: 'เปิดใบที่สร้างไว้ในฟอร์มแก้ไข', retry: 'บันทึกอีกครั้ง',
});

export function historicalExitActions(exit) {
  const actions = [];
  if (exit?.canEdit) {
    const errors = list(exit.errors);
    actions.push({
      key: 'edit',
      label: EXIT_ACTION_LABELS.edit,
      errors,
      goToStep: exit.goToStep || firstStepWithIssues(errors) || 'contract',
      /* ไม่มี error รายช่อง = ข้อความของ server คือสิ่งเดียวที่อธิบายได้ว่าทำไมถึงกลับมา */
      carryMessage: errors.length ? null : (text(exit.message) || null),
    });
  }
  if (exit?.canOpenExisting && exit?.existingOrderId) {
    actions.push({ key: 'open', label: EXIT_ACTION_LABELS.open, orderId: exit.existingOrderId });
  }
  if (exit?.canRetry) actions.push({ key: 'retry', label: EXIT_ACTION_LABELS.retry });
  return actions;
}

/**
 * จอไหนหลังบันทึกไม่สำเร็จ — **ใบซ้ำไม่ใช่จอผิดพลาด** แต่เป็นการกลับไปขั้น ④ พร้อมรายการใหม่
 * 🔴 ทางออกของรหัสใบซ้ำตั้ง `canRetry/canEdit/canOpenExisting` เป็นเท็จหมดโดยเจตนา — หลุดไปทางอื่น
 *    เมื่อไร ผู้คีย์จะไม่มีปุ่มที่พากลับไปติ๊กยืนยันเลย
 */
export function historicalSaveFailureState(exit) {
  if (exit?.kind === 'duplicate') {
    return {
      step: 'review',
      exit: null,
      duplicates: list(exit.duplicates),
      acknowledged: false,
      error: exit.message,
    };
  }
  return {
    step: exit?.goToStep || 'review',
    exit: exit || null,
    duplicates: null,
    acknowledged: null,
    error: exit?.message || '',
  };
}

/**
 * ด่านใบซ้ำของขั้น ④ — ปุ่มบันทึก **โชว์แต่กดไม่ผ่าน** จนกว่าจะเปิดสวิตช์ (กฎบ้าน:
 * ไม่มีสิทธิ์ = ไม่โชว์ · ติดด่าน = โชว์แล้วบอกเหตุ)
 * 🔴 ตัวด่านอยู่ที่นี่ไม่ใช่ใน JSX เพราะเงื่อนไขในวงเล็บของ JSX ลบทิ้งได้โดยไม่มีเทสต์ไหนแดง
 *    และการพลาดข้อนี้แปลว่าใบซ้ำลงฐานจริง (พรีวิวไม่ถือว่าใบซ้ำเป็น error)
 */
export function historicalDuplicateGate({ duplicates = [], acknowledged = false, warnings = [], localIssues = [] } = {}) {
  const count = list(duplicates).length;
  const warnCount = list(warnings).length;
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
    footNote: gated
      ? `ยังบันทึกไม่ได้ — ${blockedNote} · คำเตือน ${warnCount} ข้อ`
      : `ไม่มีข้อผิดพลาด · คำเตือน ${warnCount} ข้อ`,
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
