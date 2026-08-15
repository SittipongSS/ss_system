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
const DEAD_QUOTATION_STATUSES = new Set(['rejected', 'cancelled']);

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
  // ⚠️ ยอด 0 ไม่ใช่ข้อมูลไม่ครบ แต่เป็นใบที่คำนวณ % ไม่ได้ ⇒ บอกตรง ๆ ดีกว่าให้
  // ผู้ใช้กรอก 50% แล้วได้ 0 บาทโดยไม่มีอะไรเตือน
  if (!(Number(quotation.totalAmount) > 0)) {
    return 'ใบเสนอราคานี้ยอดเป็นศูนย์ — คิดยอดที่ขอวางบิลไม่ได้';
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
  const out = { notApproved: 0, dead: 0, zeroAmount: 0, total: 0 };
  for (const qt of Array.isArray(quotations) ? quotations : []) {
    if (billingQuotationError(qt) === null) continue;
    out.total += 1;
    if (qt?.approvalStatus !== 'approved') out.notApproved += 1;
    else if (DEAD_QUOTATION_STATUSES.has(qt?.status)) out.dead += 1;
    else out.zeroAmount += 1;
  }
  return out;
}

/** ข้อความบอกว่าซ่อนใบไหนไปเพราะอะไร — คืน '' เมื่อไม่ได้ซ่อนอะไรเลย */
export function billingQuotationSkipHint(skips = {}) {
  const parts = [];
  if (skips.notApproved) parts.push(`ยังไม่อนุมัติ ${skips.notApproved} ใบ`);
  if (skips.dead) parts.push(`ตีกลับ/ยกเลิก ${skips.dead} ใบ`);
  if (skips.zeroAmount) parts.push(`ยอดเป็นศูนย์ ${skips.zeroAmount} ใบ`);
  if (!parts.length) return '';
  return `ซ่อนไว้ ${skips.total || parts.length} ใบ — ${parts.join(' · ')}`;
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
 * ยอดที่ขอ จากโหมดที่ผู้ใช้เลือก — คืน `{ percent, amount, error }`
 *
 * `percent` และ `amount` เป็น null ได้ทั้งคู่เมื่อยังกรอกไม่ครบ (ระหว่างพิมพ์)
 * — ตัวที่บล็อกการบันทึกคือ `error` เท่านั้น
 */
export function billAmountFor({ mode = 'percent', percent, amount, baseAmount } = {}) {
  const base = num(baseAmount);
  if (!(base > 0)) return { percent: null, amount: null, error: 'ใบเสนอราคานี้ยอดเป็นศูนย์ — คิดยอดที่ขอวางบิลไม่ได้' };

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
  if (!(base > 0)) return { percent: null, amount: null, error: 'ใบเสนอราคานี้ยอดเป็นศูนย์ — คิดยอดที่ขอวางบิลไม่ได้' };
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
