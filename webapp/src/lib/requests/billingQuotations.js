// ── ใบเสนอราคาที่ขอเอกสารการเงินได้ + ยอดที่ขอ — ด่านล้วน ไม่แตะ DB ──────
//
// ⭐ **คำร้องขอเอกสารการเงินยึดใบเสนอราคา** (มติผู้ใช้ 2026-08-15 · ม-ค) — ของจริง
// ที่ทีมส่งกันในแชทอ้าง `ใบเสนอราคา : Q#260731-0006` แล้วขอ "50% ก่อนผลิต" ⇒ ต้นทาง
// ของทั้งใบคือ QT ไม่ใช่ดีลหรือโครงการ · ดีล/ลูกค้า/AE เติมจาก QT ให้เอง
//
// ⭐ **ต้องเป็นใบที่อนุมัติแล้ว** (ม-ง) — ขอเอกสารการเงินจากใบที่ยังแก้ราคาได้
// = ออกใบวางบิลบนยอดที่ยังไม่นิ่ง · ใบเสนอราคาแยกสองแกน (`status` กับ
// `approvalStatus`) ⇒ ต้องอ่านแกนที่ถูก: `approvalStatus === 'approved'`
// (ดู lib/sales/quotationWorkflow.js — ใบที่รออนุมัติยังเป็น `status='draft'` อยู่)
//
// ⚠️ แพตเทิร์นเดียวกับ `scentDesignOrders.js` เป๊ะ ๆ: ด่านตัวเดียวใช้ทั้งกรองลิสต์
// บนฟอร์มและตรวจที่ server — ป้ายช่องกับของที่เลือกได้จริงต้องตรงกันเสมอ

// ใบที่ตายแล้ว — อนุมัติไปแล้วก็ขอเอกสารไม่ได้ เพราะงานไม่เดินต่อ

/**
 * ดีลที่คำร้องขอเอกสารผูกด้วย — ใบปกติ = ดีลของใบ · ใบค่าสรรพสามิต (ไม่มีดีล · mig 0414) = ดีลของ SO ลูกค้าต้นทาง
 * (มติเจ้าของ 29/10/2026) · ลิสต์ QT/SO ส่ง `sourceDeal` มากับแถวแล้ว · server ตัดสินซ้ำจากแถวจริง (POST /api/sa/requests)
 */
export const billingDealIdOf = (row) => row?.dealId || row?.sourceDeal?.id || '';
const DEAD_QUOTATION_STATUSES = new Set(['rejected', 'cancelled']);

/* ⭐ ใบที่มีใบอื่นแทนแล้ว (มติเจ้าของ 16/11/2026: "ดีลที่ Won แล้ว ควรดึงมาเฉพาะใบที่ Won") — ยังอนุมัติอยู่ แต่ไม่ใช่ใบที่งานเดินต่อ
     · `closed`  = ใบพี่น้องที่ถูกปิดตอนลูกค้ารับใบอื่นในดีลเดียวกัน (accept_quotation_atomic ปิด draft/sent/rejected ทุกใบ)
     · `revised` = ฉบับเก่าที่ออก Rev. ใหม่แทนแล้ว (quotations/[id]/revise)
   ⇒ ดีล Won เหลือเฉพาะใบ `accepted` ในลิสต์เอง (ดีลขายซ้ำมีได้หลายใบ) · ดีลที่ยังไม่ Won คงเดิม (ขอ "50% ก่อนผลิต" ได้ก่อนมี SO)
   ⚠️ คำร้องที่เปิดไว้แล้วบนใบพวกนี้ยังต้องเห็น (ประวัติ) — หน้า QT อ่านผ่าน `billingQuotationRequestsView` ไม่ใช่ซ่อนทั้งบล็อก
   ⚠️ ย้อนการรับ (0388) เปิดใบพี่น้องกลับเป็นสถานะเดิม ⇒ ใบกลับมาอยู่ในลิสต์เองโดยไม่ต้องแก้อะไร */
const SUPERSEDED_QUOTATION_MESSAGES = {
  closed: 'ใบเสนอราคานี้ถูกปิดตอนลูกค้ารับใบอื่นในดีลเดียวกัน — ขอเอกสารการเงินจากใบที่ลูกค้ารับ',
  revised: 'ใบเสนอราคานี้มี Rev. ใหม่แทนแล้ว — ขอเอกสารการเงินจากฉบับล่าสุด',
};
const supersededMessage = (quotation) => (
  Object.hasOwn(SUPERSEDED_QUOTATION_MESSAGES, quotation?.status) ? SUPERSEDED_QUOTATION_MESSAGES[quotation.status] : null
);

/**
 * ขอเอกสารการเงินจากใบนี้ได้ไหม — คืนข้อความไทย หรือ null ถ้าผ่าน
 *
 * ⚠️ **ข้อความบอกทางออกเสมอ** — "เลือกใบอื่น" ไม่ช่วยคนที่มีใบเดียวในมือ
 */
export function billingQuotationError(quotation) {
  if (!quotation) return 'ต้องเลือกใบเสนอราคา';
  if (quotation.approvalStatus !== 'approved') {
    return 'ใบเสนอราคายังไม่อนุมัติ — อนุมัติใบก่อนจึงขอเอกสารการเงินได้';
  }
  if (DEAD_QUOTATION_STATUSES.has(quotation.status)) {
    return 'ใบเสนอราคานี้ถูกตีกลับหรือยกเลิกไปแล้ว — ขอเอกสารการเงินจากใบนี้ไม่ได้';
  }
  const superseded = supersededMessage(quotation);
  if (superseded) return superseded;
  /* ⭐ **ยอดสุทธิศูนย์ = ของจริงของธุรกิจ ไม่ใช่ข้อมูลพัง** (มติผู้ใช้ 2026-08-15:
     *"บางทีตั้งใจให้ actual เป็น 0 เพราะบางทีเราให้ลูกค้าฟรี"*)
     ตรวจบน prod แล้ว: ใบที่ยอดสุทธิ 0 ทุกใบมีส่วนลด **เท่ากับยอดก่อนภาษีพอดี**
     (ส่วนลดเป็นจำนวนเงินเต็ม หรือ 100%) ⇒ `total = subtotal − discount = 0` ถูกต้อง

     ⚠️ **สองกรณีคนละเรื่อง ต้องบอกคนละคำ** — เดิมพูดรวมว่า "ยอดเป็นศูนย์" ซึ่งอ่าน
     เหมือนระบบพัง ทั้งที่ส่วนใหญ่คือของที่ตั้งใจ:
       · มียอดก่อนภาษี แต่ลดเต็ม  = **ให้ฟรี** — ไม่มีอะไรให้วางบิล (ถูกต้องแล้ว)
       · ไม่มียอดก่อนภาษีเลย      = ใบยังไม่มีรายการ — ต้องไปใส่ของก่อน
     ⚠️ ทั้งคู่ยัง**กันไว้เหมือนกัน** — วางบิล 0 บาทไม่มีความหมาย และคิด % จากศูนย์ไม่ได้
     ที่เปลี่ยนคือ *เหตุผลที่บอก* ไม่ใช่กติกา */
  if (!(Number(quotation.totalAmount) > 0)) {
    return Number(quotation.subtotal) > 0
      ? 'ใบนี้ให้ฟรี (ส่วนลดเต็มจำนวน) — ไม่มียอดให้วางบิล'
      : 'ใบเสนอราคานี้ยังไม่มียอด — ใส่รายการและราคาก่อนจึงขอวางบิลได้';
  }
  return null;
}

/**
 * ตัวเลือกใบเสนอราคาบนฟอร์ม
 *
 * ⭐ **ค่าที่เลือกไว้แล้วต้องอยู่ในลิสต์เสมอ** (`keepId`) — ไม่งั้นใบที่สถานะเพิ่ง
 * เปลี่ยนระหว่างกรอกจะหายจากลิสต์เงียบ ๆ แล้วช่องว่างทั้งที่ค่ายังอยู่ในฟอร์ม
 * · ด่านจริงยังอยู่ที่ server ตอนบันทึก ซึ่งจะบอกเหตุผลตรง ๆ
 */
export function billingQuotationOptions(quotations = [], { keepId = null } = {}) {
  return (Array.isArray(quotations) ? quotations : []).filter((qt) => {
    if (keepId && qt?.id === keepId) return true;
    return billingQuotationError(qt) === null;
  });
}

/**
 * ใบที่ถูกกรองออก แยกตามเหตุผล — ตอบคำถาม "ทำไมใบของฉันไม่อยู่ในลิสต์"
 *
 * ⚠️ นับ**ข้อแรกที่ติด**ตามลำดับที่ `billingQuotationError` ตรวจ — ใบหนึ่งติดได้
 * หลายข้อ นับทุกข้อแล้วผลรวมจะเกินจำนวนใบที่ซ่อนจริง
 */
export function billingQuotationSkips(quotations = []) {
  // ⚠️ `free` แยกจาก `noAmount` — สองอย่างนี้ทางแก้คนละทาง (ให้ฟรีคือจบแล้ว ไม่ต้องแก้
  // อะไร · ใบว่างคือยังไม่ได้ใส่ของ) ⇒ รวมเป็นตัวเลขเดียวเมื่อไร คนอ่านจะนึกว่าพัง 12 ใบ
  const out = { notApproved: 0, dead: 0, closed: 0, revised: 0, free: 0, noAmount: 0, total: 0 };
  for (const qt of Array.isArray(quotations) ? quotations : []) {
    if (billingQuotationError(qt) === null) continue;
    out.total += 1;
    if (qt?.approvalStatus !== 'approved') out.notApproved += 1;
    else if (DEAD_QUOTATION_STATUSES.has(qt?.status)) out.dead += 1;
    else if (supersededMessage(qt)) out[qt.status] += 1;
    else if (Number(qt?.subtotal) > 0) out.free += 1;
    else out.noAmount += 1;
  }
  return out;
}

/** ข้อความบอกว่าซ่อนใบไหนไปเพราะอะไร — คืน '' เมื่อไม่ได้ซ่อนอะไรเลย */
export function billingQuotationSkipHint(skips = {}) {
  const parts = [];
  if (skips.notApproved) parts.push(`ยังไม่อนุมัติ ${skips.notApproved} ใบ`);
  if (skips.dead) parts.push(`ตีกลับ/ยกเลิก ${skips.dead} ใบ`);
  if (skips.closed) parts.push(`ปิดเพราะลูกค้ารับใบอื่น ${skips.closed} ใบ`);
  if (skips.revised) parts.push(`ฉบับเก่าที่มี Rev. ใหม่ ${skips.revised} ใบ`);
  // ⭐ "ให้ฟรี" ไม่ใช่ความผิดพลาด — คำที่ใช้ต้องไม่ชวนให้คนไปตามแก้ของที่ถูกอยู่แล้ว
  if (skips.free) parts.push(`ให้ฟรี ${skips.free} ใบ`);
  if (skips.noAmount) parts.push(`ยังไม่มียอด ${skips.noAmount} ใบ`);
  if (!parts.length) return '';
  return `ซ่อนไว้ ${skips.total || parts.length} ใบ — ${parts.join(' · ')}`;
}

/**
 * บล็อก "เอกสารบัญชีของแต่ละงวด" บนหน้า QT — `{ visible, locked }`
 *
 * ⭐ ใบปกติ: ด่านเดียวกับ POST (`billingQuotationError`) — ผ่าน = โชว์ + เปิดคำร้องได้
 * ⭐ ใบที่มีใบอื่นแทน (`closed` / `revised`): โชว์ต่อแบบอ่านอย่างเดียว (`locked` = เหตุที่เปิดใหม่ไม่ได้)
 *   — คำร้องที่ขอไว้ก่อนใบถูกปิด/ออก Rev. โดยเฉพาะ "ไม่ระบุงวด" ผูกอยู่กับใบนี้ใบเดียว ซ่อนบล็อก = ประวัติหายจากจอ
 * ⚠️ ใบที่ไม่ผ่านด้วยเหตุอื่น (ยังไม่อนุมัติ · ตีกลับ/ยกเลิก · ยอด 0) ซ่อนเหมือนเดิม
 */
export function billingQuotationRequestsView(quotation) {
  const error = billingQuotationError(quotation);
  if (!error) return { visible: true, locked: '' };
  const superseded = quotation?.approvalStatus === 'approved' && supersededMessage(quotation) === error;
  return superseded ? { visible: true, locked: error } : { visible: false, locked: error };
}

// ── ยอดที่ขอ ─────────────────────────────────────────────────────────────
//
// ⭐ **สองโหมด ค่าเดียว** (ม-ค) — กรอกเป็น `%` หรือกรอกเป็นจำนวนเงินตรง ๆ
// ของจริงมีทั้งสองแบบ: *"ขอใบวางบิล 50 % ก่อนผลิต"* กับยอดที่ตกลงกันเป็นก้อน
//
// ⚠️ **เก็บทั้งสามค่า** — `percent` · `amount` · `baseAmount` (ยอดของ QT ณ ตอนเปิดใบ)
// เก็บแค่ผลลัพธ์แล้ววันหลังไม่มีใครตอบได้ว่า 90,508.13 มาจาก 50% ของอะไร ·
// และ QT แก้ทีหลังได้ (revision) ⇒ ฐานต้องเป็น snapshot ไม่ใช่อ่านสดจากใบ
//
// ⚠️ **ไม่ปัดเศษ** — 181,016.25 × 50% = 90,508.125 ซึ่งเป็นเลขที่ทีมส่งกันจริง
// ปัดที่นี่แปลว่าตัวเลขบนคำร้องไม่ตรงกับที่คุยกับลูกค้า · การปัดเป็นเรื่องของบัญชี
// ตอนออกเอกสารจริง ไม่ใช่ของช่องกรอก (จอฟอร์แมตให้อ่านง่ายได้ แต่ค่าที่เก็บคือค่าจริง)
export const BILL_AMOUNT_MODES = ['percent', 'amount'];

const num = (v) => {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * ค่าตั้งต้นของช่อง "ยอดที่ขอวางบิล" — คืน `{ mode, input }`
 *
 * 🐞 **บั๊กที่ฟังก์ชันนี้ปิด (ผู้ใช้เจอ 2026-08-24 ตอนกดแก้ใบวางบิล)**: ช่องนี้เลือก
 * โหมดจาก `billPercent` แต่เติมตัวเลขจาก `billAmount` เสมอ ⇒ ใบที่เก็บ **ทั้งคู่**
 * (ซึ่งคือทุกใบที่บันทึกแล้ว — server เขียนคู่เสมอ) เปิดโหมดแก้แล้วได้
 * "49998.96" อยู่ในช่อง **เปอร์เซ็นต์** พร้อม error "สัดส่วนที่ขอต้องอยู่ระหว่าง 0–100%"
 * ทั้งที่ไม่มีใครพิมพ์อะไรเลย
 * · ฝั่งสร้างไม่เคยเจอเพราะ prefill จากปุ่ม "ขอใบวางบิลงวดนี้" ส่ง `billAmount`
 *   มาอย่างเดียว (`billPercent` ว่าง) ⇒ โหมดกับตัวเลขบังเอิญตรงกัน
 *
 * ⭐ ตัดสิน **ครั้งเดียวจากที่เดียว** แล้วให้ทั้งโหมดและตัวเลขมาจากผลลัพธ์เดียวกัน
 * — สองบรรทัดที่ตัดสินใจแยกกันคือรูปเดิมของบั๊กนี้
 */
export function billFieldInit({ billPercent = null, billAmount = null } = {}) {
  // รู้จำนวนเงินมาแต่ไม่รู้สัดส่วน = คนถือตัวเลขบาทอยู่ในมือ (มาจากงวดของ SO)
  const mode = billAmount != null && billPercent == null ? 'amount' : 'percent';
  const picked = mode === 'percent' ? billPercent : billAmount;
  return { mode, input: picked == null ? '' : String(picked) };
}

/**
 * ยอดที่ขอ จากโหมดที่ผู้ใช้เลือก — คืน `{ percent, amount, error }`
 *
 * `percent` และ `amount` เป็น null ได้ทั้งคู่เมื่อยังกรอกไม่ครบ (ระหว่างพิมพ์)
 * — ตัวที่บล็อกการบันทึกคือ `error` เท่านั้น
 */
export function billAmountFor({ mode = 'percent', percent, amount, baseAmount } = {}) {
  const base = num(baseAmount);
  // ⚠️ ตัวคำนวณไม่เห็น `subtotal` ⇒ แยกไม่ออกว่าให้ฟรีหรือใบว่าง — ใช้คำกลางที่จริง
  // ทั้งสองแบบ · เหตุผลที่ละเอียดกว่ามาจาก `billingQuotationError` ซึ่งเห็นทั้งแถว
  if (!(base > 0)) return { percent: null, amount: null, error: 'ใบเสนอราคานี้ไม่มียอดให้วางบิล' };

  if (mode === 'amount') {
    const value = num(amount);
    if (value == null) return { percent: null, amount: null, error: null };
    if (value <= 0) return { percent: null, amount: null, error: 'ยอดที่ขอต้องมากกว่า 0' };
    // ⚠️ **ขอเกินยอดใบได้ไม่ได้** — วางบิลเกินที่เสนอราคาไว้คือความผิดพลาดที่ต้อง
    // หยุดตั้งแต่ตอนกรอก ไม่ใช่ให้บัญชีมาจับตอนออกเอกสาร
    if (value > base) return { percent: null, amount: null, error: 'ยอดที่ขอเกินยอดของใบเสนอราคา' };
    return { percent: (value / base) * 100, amount: value, error: null };
  }

  const pct = num(percent);
  if (pct == null) return { percent: null, amount: null, error: null };
  if (pct <= 0 || pct > 100) return { percent: null, amount: null, error: 'สัดส่วนที่ขอต้องอยู่ระหว่าง 0–100%' };
  return { percent: pct, amount: (base * pct) / 100, error: null };
}

/**
 * ยอดที่จะเขียนลงแถว — ตัวคืนดีระหว่างค่าที่ client ส่งมากับฐานจริงของใบ
 *
 * ⭐ **`amount` เป็นตัวจริง `percent` เป็นตัวอธิบาย** — บัญชีเอา `amount` ไปออกเอกสาร
 * ⇒ ด่านทั้งหมดตรวจที่ `amount` แล้วคิด `percent` กลับให้
 *
 * ⭐ **แต่ % ที่ผู้ใช้พิมพ์เองต้องรอด** — คิดกลับจากทศนิยมได้ `50.000000000000004`
 * ซึ่งเป็นเลขที่ไม่มีใครพิมพ์และอ่านแล้วเหมือนระบบพัง ⇒ ถ้า % ที่ส่งมาคูณกับฐานแล้ว
 * ตรงกับยอด (ในระยะคลาดเคลื่อนของ float) ให้ใช้ % ตัวนั้น
 *
 * ⚠️ **ฐานมาจากแถวจริงเสมอ ไม่ใช่จาก client** — ผู้เรียกต้องส่ง `baseAmount` ที่อ่าน
 * มาจากใบเสนอราคา ไม่ใช่ค่าที่ฟอร์มแนบมา
 */
export function resolveBillAmount({ percent, amount, baseAmount } = {}) {
  const base = num(baseAmount);
  const value = num(amount);
  // ⚠️ ตัวคำนวณไม่เห็น `subtotal` ⇒ แยกไม่ออกว่าให้ฟรีหรือใบว่าง — ใช้คำกลางที่จริง
  // ทั้งสองแบบ · เหตุผลที่ละเอียดกว่ามาจาก `billingQuotationError` ซึ่งเห็นทั้งแถว
  if (!(base > 0)) return { percent: null, amount: null, error: 'ใบเสนอราคานี้ไม่มียอดให้วางบิล' };
  if (value == null || value <= 0) return { percent: null, amount: null, error: 'ต้องระบุยอดที่ขอวางบิล' };
  if (value > base) return { percent: null, amount: null, error: 'ยอดที่ขอเกินยอดของใบเสนอราคา' };

  const sent = num(percent);
  const keepSent = sent != null && sent > 0 && sent <= 100
    && Math.abs((base * sent) / 100 - value) < 1e-6;
  return {
    percent: keepSent ? sent : (value / base) * 100,
    amount: value,
    error: null,
  };
}
