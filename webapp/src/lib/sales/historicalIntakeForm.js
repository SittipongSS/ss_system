// ── ตัวตัดสินฝั่งจอของโมดัลคีย์ใบสั่งขายย้อนหลัง (เฟส 2a) ─────────────────────────────
//
// ⭐ คู่แฝดของ `historicalOrderPlan.js` ฝั่ง server: ไฟล์นี้ **บริสุทธิ์ ไม่มี React ไม่ยิง API**
//    รับ state ของโมดัลแล้วคืน (ก) body ที่ส่งขึ้น API (ข) ขั้นที่ error แต่ละช่องสังกัด
//    (ค) ทางออกของแต่ละรหัสตอนบันทึกไม่สำเร็จ ⇒ ทดสอบได้โดยไม่ต้องเรนเดอร์อะไรเลย
//
// 🔴 **ไม่มีกฎตรวจข้อมูลชุดที่สองที่นี่** — ด่านจริงคือ `planHistoricalOrder` + RPC 0360
//    ข้อความไทยรายช่องมาจากพรีวิวเสมอ (`errors[{ field, message }]`) · ที่นี่แค่จัดว่า
//    ช่องไหนอยู่ขั้นไหน แล้วพาผู้คีย์กลับไปที่ขั้นนั้น
//
// ⚠️ ข้อยกเว้นเดียว — **สี่ช่องที่ API เติมคำตอบให้เงียบ ๆ** (กฎบ้าน "ไม่มีค่าตั้งต้น
//    ให้กับสิ่งที่เป็นการตัดสินใจ" · docs/form-design-rules.md §2):
//      · `amountsIncludeVat` ไม่ส่ง = true    (historicalOrderPlan.js: `!== false`)
//      · `vatRate` ไม่ส่ง = 7                 (historicalOrderPlan.js)
//      · `team` ไม่ส่ง = ทีมหลักของ AE        (attributionTeam ฝั่ง server)
//      · `paymentGateExemptReason` ไม่ส่ง = **ไม่ยกเว้น** (API ไม่มีบูลีนของสวิตช์เลย)
//    ทั้งสี่ตัวถ้าปล่อยให้ server เติมให้ ผู้คีย์จะไม่มีทางรู้ว่าใบไปลงฐาน VAT ไหน/ทีมไหน
//    ⇒ โมดัลบังคับเลือกเอง (`historicalIntakeLocalIssues`) แล้ว **ส่งค่าที่เลือกไปตรง ๆ**
//    🐞 ที่มาของช่องทีม: AE สองทีม (ODM + SV) ไม่ส่ง `team` ⇒ ดีลไปลงทีมหลัก แล้วหัวหน้า
//       อีกทีมมองไม่เห็นใบเลย (ทีมอยู่ในลายนิ้วมือคำขอด้วย ⇒ แก้ทีหลังไม่ได้)
//    🐞 ที่มาของช่องเหตุผล: สวิตช์ยกเว้นเป็นของโมดัลล้วน ๆ — API อ่านแต่ข้อความเหตุผล
//       ⇒ เปิดสวิตช์แล้วเหตุผลว่าง = ส่ง null = **ใบลงฐานโดยไม่มีการยกเว้นเลย เงียบสนิท**
//       (นัดบริการติดด่านเงินทุกครั้ง และเฟส 2a ไม่มีจอยกเว้นย้อนหลัง ⇒ ต้องลบใบคีย์ใหม่)
import {
  EXEMPT_REASON_MAX, EXEMPT_REASON_MIN, INSTALLATION_POINT_MAX, INSTALLMENT_LABEL_MAX,
  HISTORICAL_REF_MAX, ZERO_VALUE_EXEMPT_REASON, charLength, exemptReasonError,
} from '@/lib/sales/historicalOrders';
import { HISTORICAL_VAT_RATES } from '@/lib/sales/historicalOrderPlan';

export {
  EXEMPT_REASON_MAX, EXEMPT_REASON_MIN, INSTALLATION_POINT_MAX, INSTALLMENT_LABEL_MAX,
  HISTORICAL_REF_MAX, ZERO_VALUE_EXEMPT_REASON, charLength, exemptReasonError, HISTORICAL_VAT_RATES,
};

/* ── ขั้นของโมดัล ─────────────────────────────────────────────────────────────
   ⚠️ รางขั้นเป็น "ที่บอกตำแหน่ง" ไม่ใช่ปุ่มกด — ข้ามขั้นไม่ได้เพราะขั้นหลังต้องผ่านด่าน
   ของขั้นก่อน (แพตเทิร์นเดียวกับ LegacySiteModal · IntakeWizard) */
export const HISTORICAL_INTAKE_STEPS = Object.freeze([
  { key: 'doc', label: 'ใบ' },
  { key: 'lines', label: 'จุดติดตั้ง' },
  { key: 'money', label: 'งวดและด่านเงิน' },
  { key: 'review', label: 'ตรวจก่อนบันทึก' },
]);
export const HISTORICAL_INTAKE_STEP_ORDER = Object.freeze(HISTORICAL_INTAKE_STEPS.map((s) => s.key));

const text = (value) => (value === null || value === undefined ? '' : String(value)).trim();
const toNumber = (value) => (value === null || value === undefined || value === '' ? Number.NaN : Number(value));

let seq = 0;
const nextKey = (prefix) => { seq += 1; return `${prefix}-${seq}`; };

/** บรรทัด = จุดติดตั้ง (มติข้อ 8) — `key` มีไว้ให้ React เท่านั้น ไม่ถูกส่งขึ้น API */
export const emptyHistoricalLine = () => ({
  key: nextKey('line'), installationPoint: '', productId: '', qty: '', serviceRounds: '', lineAmount: '',
});

/** งวดที่ยังต้องเก็บ — ไม่มีช่อง `status` โดยเจตนา (ดู `historicalIntakeBody`) */
export const emptyHistoricalInstallment = () => ({
  key: nextKey('inst'), label: '', amount: '', dueDate: '', coversFrom: '', coversTo: '',
});

/**
 * state ตั้งต้นของโมดัลหนึ่งใบ
 * @param defaults ค่าที่ยกมาให้ — ปุ่ม "คีย์ใบถัดไปของลูกค้านี้" ส่งมาแค่ `customerId`
 *   ⚠️ **AE ว่างเสมอ** ลูกค้ารายเดียวมี AE ได้สองคน = คนละดีล · AE ที่ติดมาเงียบ ๆ
 *   แปลว่าใบไปลงผิดดีลโดยไม่มีอะไรบนจอฟ้อง
 */
export function emptyHistoricalIntake(defaults = {}) {
  return {
    customerId: text(defaults.customerId) || '',
    ownerId: '',
    team: '',
    orderDate: '',
    /* ⭐ ภาษาเอกสารมีค่าตั้งต้น "ไทย" ต่างจากอีกสามช่องข้างล่าง — มันไม่ใช่การตัดสินใจ
       ที่ค้างอยู่: สลับภาษาเอกสารของใบย้อนหลังถูกปิดไว้ (docs §4) และพิมพ์ใบย้อนหลัง
       ยังไม่รองรับ ⇒ ค่านี้กำหนดแค่ **ภาษาคำอธิบายสินค้าบนบรรทัด** ซึ่งมีคำตอบตั้งต้น
       ที่ถูกอยู่แล้ว (ชีตเป็นไทยทั้งใบ) · ม็อกก็วาดไว้ว่าเลือก "ไทย" ไว้แล้ว */
    docLanguage: 'th',
    amountsIncludeVat: null,   // null = ยังไม่เลือก (ไม่ใช่ false)
    vatRate: null,             // null = ยังไม่เลือก (ไม่ใช่ 0)
    refs: { quote: '', express: '', invoice: '' },
    notes: '',
    lines: [emptyHistoricalLine()],
    installments: [],
    exempt: false,
    exemptReason: '',
  };
}

/**
 * ใบยอด 0 ไหม — อ่านจากยอดบรรทัดที่ผู้คีย์พิมพ์ตรง ๆ
 * ⚠️ ต้องตรงกับ `zeroValue` ของ `planHistoricalOrder` เป๊ะ: มีบรรทัด · ยอดทุกบรรทัดเป็นตัวเลข
 * ไม่ติดลบ · ผลรวมเป็น 0 (VAT ไม่เคยเปลี่ยน 0 ให้เป็นค่าอื่น จึงคิดจากยอดดิบได้)
 */
export function historicalIntakeZeroValue(state = {}) {
  const lines = Array.isArray(state.lines) ? state.lines : [];
  if (!lines.length) return false;
  let sum = 0;
  for (const line of lines) {
    const amount = toNumber(line?.lineAmount);
    if (!Number.isFinite(amount) || amount < 0) return false;
    sum += amount;
  }
  return sum === 0;
}

/**
 * body ของ `POST /api/sales-planning/sales-orders/historical` — **ตัวประกอบตัวเดียว**
 * ที่ทั้งพรีวิวและบันทึกเรียก ⇒ ลายนิ้วมือคำขอของสองรอบตรงกันเสมอ
 *
 * 🪤 กับดักเงียบสามตัวของ API ที่ตัวประกอบนี้กันไว้ให้:
 *   1. บรรทัดที่มีคีย์ `zoneId` (แม้ค่า null) = error ทันที — ฝ่ายขายไม่ระบุโซน (มติข้อ 17)
 *   2. งวดที่มีคีย์ `status` = error — ป้ายบนจอคือ "รอชำระ" ซึ่งเป็นค่าตั้งต้นของ RPC อยู่แล้ว
 *   3. `running:false` = ตีกลับทั้งใบ (งานที่จบแล้วเป็นรอบคีย์ที่สอง)
 *   ⇒ สร้างออบเจกต์ใหม่จากช่องที่รู้จักเท่านั้น **ห้าม spread state ดิบลง lines/installments**
 */
export function historicalIntakeBody(state = {}, options = {}) {
  const { preview = false, intakeKey = null, acknowledgeDuplicates = false } = options;
  const zeroValue = historicalIntakeZeroValue(state);
  const lines = (Array.isArray(state.lines) ? state.lines : []).map((line) => ({
    installationPoint: text(line?.installationPoint),
    productId: text(line?.productId) || null,
    qty: text(line?.qty),
    serviceRounds: text(line?.serviceRounds),
    lineAmount: text(line?.lineAmount),
  }));
  const installments = (Array.isArray(state.installments) ? state.installments : []).map((row) => ({
    label: text(row?.label),
    amount: text(row?.amount),
    dueDate: text(row?.dueDate) || null,
    coversFrom: text(row?.coversFrom) || null,
    coversTo: text(row?.coversTo) || null,
  }));
  /* ⭐ ใบยอด 0 = **ส่ง null เสมอ** แม้ผู้คีย์เคยเปิดสวิตช์และพิมพ์เหตุผลไว้ก่อนยอดกลายเป็น 0
     API ไม่บังคับข้อนี้ (ส่งเหตุผลไป = เก็บเหตุผลนั้นแทนข้อความตายตัวและเลิกถือว่าอัตโนมัติ)
     ⇒ กติกา "ใบยอด 0 ยกเว้นอัตโนมัติ ถอนไม่ได้" (มติข้อ 11) จริงได้เพราะโมดัลทิ้งเหตุผลที่นี่ */
  const reason = zeroValue ? null : (state.exempt ? text(state.exemptReason) || null : null);
  const body = {
    preview,
    running: true,
    customerId: text(state.customerId) || null,
    ownerId: text(state.ownerId) || null,
    team: text(state.team) || null,
    orderDate: text(state.orderDate) || null,
    docLanguage: state.docLanguage === 'en' ? 'en' : 'th',
    amountsIncludeVat: state.amountsIncludeVat,
    vatRate: state.vatRate,
    refs: {
      quote: text(state.refs?.quote) || null,
      express: text(state.refs?.express) || null,
      invoice: text(state.refs?.invoice) || null,
    },
    notes: text(state.notes) || null,
    lines,
    installments,
    paymentGateExemptReason: reason,
  };
  /* รหัสการคีย์: บังคับเฉพาะตอนบันทึก แต่ส่งตั้งแต่พรีวิวด้วย — มันคือตัวที่ทำให้ใบของ
     รหัสนี้เอง (ส่งซ้ำหลังเน็ตหลุด) ไม่ถูกนับเป็น "ใบที่อาจซ้ำ" ของตัวเอง */
  if (intakeKey) body.intakeKey = intakeKey;
  if (acknowledgeDuplicates) body.acknowledgeDuplicates = true;
  return body;
}

/* ── ช่อง → ขั้น ───────────────────────────────────────────────────────────────
   ชื่อช่องมาจาก `planHistoricalOrder` (`err(field, …)`) · ของที่ไม่รู้จักตกที่ขั้นแรก
   เพราะขั้นแรกคือที่ที่ผู้คีย์เห็นข้อความได้แน่นอนที่สุด */
const FIELD_STEP = new Map([
  ['running', 'doc'], ['customerId', 'doc'], ['ownerId', 'doc'], ['team', 'doc'],
  ['orderDate', 'doc'], ['docLanguage', 'doc'], ['amountsIncludeVat', 'doc'], ['vatRate', 'doc'],
  ['notes', 'doc'], ['deal', 'doc'],
  ['lines', 'lines'],
  ['installments', 'money'], ['paymentGateExemptReason', 'money'],
]);

export function stepOfIntakeField(field) {
  const name = text(field);
  if (FIELD_STEP.has(name)) return FIELD_STEP.get(name);
  const head = name.split('.')[0];
  if (head === 'refs') return 'doc';
  if (FIELD_STEP.has(head)) return FIELD_STEP.get(head);
  return 'doc';
}

/** error ของขั้นนั้น — ขั้น ① จึงไม่โชว์ "ต้องมีอย่างน้อย 1 จุดติดตั้ง" ซึ่งจริงเสมอตอนนั้น */
export function issuesForStep(issues = [], step = 'doc') {
  return (Array.isArray(issues) ? issues : []).filter((issue) => stepOfIntakeField(issue?.field) === step);
}

/** ขั้นแรกที่ยังมีข้อผิดพลาด — ปุ่ม "กลับไปแก้" ของ 400 พาไปที่นี่ */
export function firstStepWithIssues(issues = []) {
  const steps = new Set((Array.isArray(issues) ? issues : []).map((issue) => stepOfIntakeField(issue?.field)));
  return HISTORICAL_INTAKE_STEP_ORDER.find((step) => steps.has(step)) || null;
}

/**
 * สี่ช่องที่ต้องเลือกเองเพราะ API เติมคำตอบให้เงียบ ๆ (ดูหัวไฟล์)
 * @param ownerTeams ทีมที่ AE ที่เลือกสังกัด — ช่องทีมมีคำตอบให้เลือกจริงเมื่อ ≥ 2 ทีม
 * @returns [{ field, message }] รูปเดียวกับ `plan.errors` ⇒ ใช้ตัวจัดขั้นตัวเดียวกันได้
 */
export function historicalIntakeLocalIssues(state = {}, { ownerTeams = [] } = {}) {
  const issues = [];
  if (state.amountsIncludeVat !== true && state.amountsIncludeVat !== false) {
    issues.push({ field: 'amountsIncludeVat', message: 'เลือกว่ายอดที่คีย์รวม VAT แล้วหรือยัง' });
  }
  if (!HISTORICAL_VAT_RATES.includes(state.vatRate)) {
    issues.push({ field: 'vatRate', message: 'เลือกอัตรา VAT ของใบนี้' });
  }
  const teams = Array.isArray(ownerTeams) ? ownerTeams : [];
  if (teams.length >= 2 && !teams.includes(text(state.team))) {
    issues.push({ field: 'team', message: `AE คนนี้อยู่ ${teams.length} ทีม — เลือกทีมที่ใบนี้เข้า (ทีมของดีลตามที่เลือก)` });
  }
  /* 🔴 สวิตช์เปิดแต่เหตุผลว่าง — API ไม่มีบูลีนของสวิตช์ (อ่านแต่ข้อความ) ⇒ ไม่มีใครตีกลับ
     ใบจะลงฐานแบบ "ไม่ยกเว้น" ทั้งที่ผู้คีย์เปิดสวิตช์ไว้ · ใช้ตัวตรวจตัวเดียวกับ server
     (`exemptReasonError` 10–500) ⇒ ข้อความเดียวกันทั้งสองฝั่ง · ใบยอด 0 ยกเว้นอัตโนมัติ
     และโมดัลทิ้งเหตุผลเสมอ จึงไม่เข้าด่านนี้ */
  if (state.exempt && !historicalIntakeZeroValue(state)) {
    const reasonError = exemptReasonError(state.exemptReason);
    if (reasonError) issues.push({ field: 'paymentGateExemptReason', message: reasonError });
  }
  return issues;
}

/* ── ทางออกตอนบันทึกไม่สำเร็จ — ตารางรหัสในม็อก (docs §6.1) ─────────────────────────
   ⚠️ ตัดสินจาก `data.code` ไม่ใช่ข้อความ · ข้อความไทยมาจาก server เสมอ (documentWorkflowErrors)
   ⚠️ 403 กับ 503 ของ route **ไม่มี code** — ต้องถอยไปดู status */
const RETRY_HINT = 'ส่งข้อมูลชุดเดิมด้วยรหัสการคีย์เดิม — ห้ามแก้ฟอร์มก่อนกด ไม่งั้นจะกลายเป็นคำขอคนละชุดแล้วชนรหัสแทน';
/* 🔴 ชนการย้ายเจ้าของดีลต่างจากเน็ตหลุดตรงข้อเท็จจริงเดียวที่ผู้คีย์ต้องรู้: RPC raise ข้างใน
   ทรานแซกชัน ⇒ **ยังไม่มีอะไรลงฐาน** · ถ้าใช้คำเดียวกับเน็ตหลุด ผู้คีย์จะกลัวว่าใบลงไปแล้ว
   แล้วปิดโมดัลทิ้งแทนที่จะกดอีกครั้ง (ม็อก: ใบซ้ำกันสองจอ คนละข้อความ) */
const RACE_HINT = 'ส่งข้อมูลชุดเดิมด้วยรหัสการคีย์เดิม — ยังไม่มีอะไรลงฐาน ระบบหาดีลของคู่ลูกค้า × AE ใหม่เอง';
/* รหัสที่ server ตั้งกฎไว้เอง: ส่งก้อนเดิมซ้ำติดเหมือนเดิมทุกครั้ง แต่แก้ฟอร์มแล้วส่งใหม่ได้
   เพราะ RPC raise = ทรานแซกชันถอย รหัสการคีย์ยังไม่ถูกใช้ */
const BLOCKED_HINT = 'ส่งข้อมูลชุดเดิมซ้ำจะติดเหมือนเดิมทุกครั้ง — แก้ข้อมูลตามข้อความข้างบนแล้วบันทึกใหม่ '
  + '(ยังไม่มีอะไรลงฐาน รหัสการคีย์ของรอบนี้ยังใช้ได้)';

export function historicalSaveExit(error) {
  const status = Number(error?.status) || 0;
  const data = (error && typeof error.data === 'object' && error.data) || {};
  const code = text(data.code) || null;
  const message = text(data.error) || text(error?.message) || 'บันทึกใบสั่งขายย้อนหลังไม่สำเร็จ';
  const base = {
    kind: 'unknown', code, message, hint: null, goToStep: null,
    duplicates: null, existingOrderId: null, errors: null,
    canRetry: false, canEdit: false, canOpenExisting: false, keySpent: false,
  };

  if (code === 'historical_so_intake_key_conflict') {
    return {
      ...base,
      kind: 'intake_key_conflict',
      existingOrderId: text(data.existingOrderId) || null,
      canOpenExisting: true,
      keySpent: true,
      hint: 'แก้แล้วบันทึกซ้ำจะชนอีกทุกครั้ง — รหัสการคีย์ของรอบนี้ใช้ต่อไม่ได้ · '
        + 'ต้องคีย์ใหม่: ปิดโมดัล (ยืนยันทิ้งข้อมูล) แล้วกด "SO ย้อนหลัง" อีกครั้ง = รหัสการคีย์ใหม่',
    };
  }
  if (code === 'historical_so_container_deal_race') {
    return { ...base, kind: 'container_deal_race', canRetry: true, hint: RACE_HINT };
  }
  if (code === 'historical_so_duplicate_unacknowledged') {
    return {
      ...base,
      kind: 'duplicate',
      duplicates: Array.isArray(data.duplicates) ? data.duplicates : [],
      goToStep: 'review',
    };
  }
  if (Array.isArray(data.errors) && data.errors.length) {
    const errors = data.errors;
    return { ...base, kind: 'invalid', errors, canEdit: true, goToStep: firstStepWithIssues(errors) };
  }
  /* 400 ที่ไม่มี `errors[]` (เช่น `historical_so_money_mismatch`) — ข้อความของ server คือ
     เหตุผลเดียวที่มี ⇒ โมดัลต้องพกมันไปโชว์ที่ขั้นปลายทางด้วย ไม่งั้น "กลับไปแก้" = จอเปล่า */
  if (status === 400) return { ...base, kind: 'invalid', canEdit: true, goToStep: 'doc' };
  if (status === 403) return { ...base, kind: 'forbidden' };
  if (status === 503) return { ...base, kind: 'schema' };
  /* 🔴 รหัสอื่นที่มากับ 404/409/500 (`historical_so_deal_invalid` · `historical_so_customer_inactive`
     · `sales_deals_historical_shape` · `workflow_stale` …) — ทั้งหมดมาจากกฎฝั่ง server ที่ raise
     ข้างในทรานแซกชัน ⇒ **ห้ามเสนอ "บันทึกอีกครั้ง"** เพราะก้อนเดิมจะได้รหัสเดิมวนไม่รู้จบ
     (เคยตกถังเน็ตหลุด: ปุ่มเดียวบนจอคือปุ่มที่ไม่มีวันผ่าน ทางออกจริงคือปิด = เสียใบทั้งใบ) */
  if (code) return { ...base, kind: 'blocked', canEdit: true, goToStep: 'doc', hint: BLOCKED_HINT };
  /* 5xx / เน็ตหลุด (ไม่มี response) = อาจลงฐานไปแล้ว — กดซ้ำด้วยรหัสเดิมได้ใบเดิมคืน */
  if (!status || status >= 500) return { ...base, kind: 'unknown', canRetry: true, hint: RETRY_HINT };
  /* 4xx ที่ไม่มีทั้งรหัสและ `errors[]` — ไม่มีทางออกเฉพาะให้เดา ปิดพร้อมข้อความของ server */
  return { ...base, kind: 'unknown' };
}

/* ── ทางออกที่เรนเดอร์จริงบนจอ "บันทึกไม่สำเร็จ" ───────────────────────────────────
   🔴 แยกออกมาเป็นข้อมูลเพราะ JSX สี่ก้อนที่เขียน `{exit.canX && (` ถอดออกทีละอันได้โดย
   ชุดเทสต์ยังเขียว — ตัวตัดสินถูกคุ้มอยู่แล้ว แต่ "ปุ่มที่ผู้ใช้เห็น" ไม่มีใครคุ้ม
   ⚠️ "ปิด" มาก่อนเสมอ (ซ้ายสุด) · ปุ่มเติมสีคือตัวท้ายสุดของแถว */
const EXIT_ACTION_LABELS = Object.freeze({
  close: 'ปิด', edit: 'กลับไปแก้', open: 'เปิดใบที่สร้างไว้', retry: 'บันทึกอีกครั้ง',
});

export function historicalExitActions(exit) {
  const actions = [{ key: 'close', label: EXIT_ACTION_LABELS.close }];
  if (exit?.canEdit) {
    const errors = Array.isArray(exit.errors) ? exit.errors : [];
    actions.push({
      key: 'edit',
      label: EXIT_ACTION_LABELS.edit,
      errors,
      goToStep: exit.goToStep || firstStepWithIssues(errors) || 'doc',
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
 * จอไหนหลังบันทึกไม่สำเร็จ — **ใบซ้ำไม่ใช่จอ "บันทึกไม่สำเร็จ"** แต่เป็นการกลับไปขั้น ④
 * 🔴 ทางออกของรหัสใบซ้ำตั้ง `canRetry/canEdit/canOpenExisting` เป็นเท็จหมดโดยเจตนา —
 *    ถ้ามันหลุดไปจอ "บันทึกไม่สำเร็จ" ปุ่มเดียวที่เหลือคือ "ปิด" = ผู้คีย์เสียใบทั้งใบ
 */
export function historicalSaveFailureState(exit) {
  if (exit?.kind === 'duplicate') {
    return {
      step: 'review',
      exit: null,
      duplicates: Array.isArray(exit.duplicates) ? exit.duplicates : [],
      acknowledged: false,
      error: exit.message,
    };
  }
  return { step: 'failed', exit: exit || null, duplicates: null, acknowledged: null, error: '' };
}

/* ── ป้ายบนปุ่ม/แถบท้าย ──────────────────────────────────────────────────────── */

/**
 * ด่านใบซ้ำของขั้น ④ — ปุ่มบันทึก **โชว์แต่กดไม่ผ่าน** จนกว่าจะเปิดสวิตช์ (กฎบ้าน:
 * ไม่มีสิทธิ์ = ไม่โชว์ · ติดด่าน = โชว์แล้วบอกเหตุ)
 * 🔴 ตัวด่านอยู่ที่นี่ไม่ใช่ใน JSX เพราะเงื่อนไขในวงเล็บของ JSX ลบทิ้งได้โดยไม่มีเทสต์ไหนแดง
 *    และการพลาดข้อนี้แปลว่าใบซ้ำลงฐานจริง (พรีวิวไม่ถือว่าใบซ้ำเป็น error)
 */
export function historicalDuplicateGate({ duplicates = [], acknowledged = false, warnings = [] } = {}) {
  const count = Array.isArray(duplicates) ? duplicates.length : 0;
  const warnCount = Array.isArray(warnings) ? warnings.length : 0;
  const gated = count > 0 && !acknowledged;
  return {
    gated,
    blockedNote: gated ? 'เปิดสวิตช์นี้ก่อนจึงบันทึกได้ — ระบบพบใบที่อาจซ้ำของลูกค้ารายนี้' : null,
    buttonTitle: gated ? 'เปิด “ตรวจแล้ว ไม่ใช่ใบซ้ำ” ก่อน' : null,
    footNote: gated
      ? `ยังบันทึกไม่ได้ — เปิด “ตรวจแล้ว ไม่ใช่ใบซ้ำ” ก่อน · ข้อผิดพลาด 0 · คำเตือน ${warnCount} ข้อ`
      : `ไม่มีข้อผิดพลาด · คำเตือน ${warnCount} ข้อ`,
  };
}

const countPart = (label, n) => (n > 0 ? `${label} ${n}` : null);

/** "บันทึก · ใบ 1 · จุดติดตั้ง 2 · งวด 1 · ดีลใหม่ 1" — ท่อนที่เป็น 0 หายไป ไม่พิมพ์ "งวด 0" */
export function historicalSaveLabel(plan) {
  const parts = [
    'ใบ 1',
    countPart('จุดติดตั้ง', (plan?.lines || []).length),
    countPart('งวด', (plan?.installments || []).length),
    plan?.deal?.willCreate ? 'ดีลใหม่ 1' : null,
  ].filter(Boolean);
  return `บันทึก · ${parts.join(' · ')}`;
}

/** บรรทัดสรุปของจอจบ — อ่านจาก response ของการบันทึกตรง ๆ ไม่ยิง GET ตาม */
export function historicalDoneSummary(result) {
  const order = result?.order || {};
  const parts = [
    text(order.orderNumber) || '—',
    `${(result?.lines || []).length} จุดติดตั้ง`,
  ];
  const installments = (result?.installments || []).length;
  if (installments) parts.push(`งวด ${installments} รอชำระ`);
  const dealCode = text(result?.deal?.code);
  if (dealCode) parts.push(`ดีล ${dealCode}${result?.dealCreated ? ' (สร้างใหม่)' : ''}`);
  return parts.join(' · ');
}

/**
 * รหัสการคีย์ของโมดัลหนึ่งรอบ — ออกใหม่เฉพาะตอนเปิดโมดัลคีย์ใบใหม่
 * ⚠️ ห้ามออกใหม่ระหว่างกดบันทึกซ้ำ: รหัสเดิม + ข้อมูลเดิม = ได้ใบเดิมคืน (replayed)
 */
export function newHistoricalIntakeKey() {
  const source = globalThis.crypto;
  if (source && typeof source.randomUUID === 'function') return source.randomUUID();
  /* ทางถอยสำหรับสภาพแวดล้อมที่ไม่มี crypto — ต้องไม่ซ้ำภายในหน้าเดียวก็พอ
     (ด่านจริงคือ unique ของ `historicalIntakeHash` ฝั่งฐาน) */
  return `hist-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
