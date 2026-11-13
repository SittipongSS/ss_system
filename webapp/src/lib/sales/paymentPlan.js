// งวดการชำระใบเสนอราคา: เต็มจำนวน / แบ่งงวด.
// pure ทั้งหมด (แถวแสดงผล + คำนวณ + validate) ใช้ทั้ง client และ server.
import { fmtPercent } from '@/lib/format';

// เพดานงวด 12 (มติผู้ใช้ 2026-08-17 — เดิม 6) · ค่าเดียวคุมทั้งปุ่ม "เพิ่มงวด" ฝั่งฟอร์ม
// และด่าน validate ฝั่ง server ห้ามสะกดเลขนี้ซ้ำที่อื่น
export const MAX_INSTALLMENTS = 12;
const EPS = 0.01; // เพดานคลาดเคลื่อน % รวม

const money = (v) => {
  const n = Math.round((Number(v) || 0) * 100) / 100;
  return n < 0 ? 0 : n;
};
const pct = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// เกลี่ย % เท่ากัน n งวด ให้รวมได้ 100 พอดี (เศษไปงวดสุดท้าย)
export function evenPercents(n) {
  const count = Math.max(2, Math.min(MAX_INSTALLMENTS, Math.floor(n) || 2));
  const base = Math.floor((100 / count) * 100) / 100; // 2 ตำแหน่ง
  const arr = Array(count).fill(base);
  arr[count - 1] = Math.round((100 - base * (count - 1)) * 100) / 100;
  return arr;
}

/* แผนที่เป็น "เกลี่ยเท่ากัน" ที่ % ลงตัวไม่ได้ (3 · 6 · 7 · 9 · 11 · 12 งวด) — % ทุกแถวตรงกับ evenPercents(n) พอดี
   🐞 12/11/2026 SO-26110406-0: 12 งวดของ ฿44,940 ได้ % = 8.33 ⇒ ยอดงวด = 44,940 × 8.33% = ฿3,743.50 × 11 + งวดท้าย ฿3,761.50
      แทน ฿3,745.00 เท่ากันทุกงวด (= ฿3,500 + VAT) · ก่อน VAT ของงวด 1 บนโมดัลอนุมัติเลยเป็น ฿3,498.60 แทน ฿3,500.00
      ต้นเหตุ = 8.33% ไม่ใช่ 1/12 — ยอดที่คิดจาก % ที่ปัดแล้วเพี้ยนทุกงวดและงวดท้ายกวาดเศษสะสมไป (ใบ 12 งวด ฿463,524 เพี้ยน ฿169.95)
   ⇒ แผนแบบนี้แบ่ง **ยอดเงิน** เท่ากันแทน: ปัดลงรายสตางค์ งวดสุดท้ายรับเศษ (กติกาเดียวกับ installmentReplan.replanEvenAmounts)
   ⚠️ n ที่ % ลงตัว (2 · 4 · 5 · 8 · 10) ใช้ทางเดิม — ยอดจาก % ถูกอยู่แล้ว และเปลี่ยนวิธีปัดจะทำให้ใบเดิมเพี้ยนหนึ่งสตางค์
   ⚠️ แถวที่คนพิมพ์ % เองไม่เข้าข่าย (ต้องตรง evenPercents ทุกแถว) — ไม่เดาเจตนาจาก % ที่ "ใกล้เคียง" */
function evenSplitCount(rows) {
  const n = rows.length;
  if (n < 2 || n > MAX_INSTALLMENTS || 10000 % n === 0) return 0;
  const even = evenPercents(n);
  return rows.every((r, i) => Math.round(r.percent * 100) === Math.round(even[i] * 100)) ? n : 0;
}

// คำนวณยอดเงินแต่ละงวดจาก % ของ total (งวดสุดท้ายซับเศษปัดให้ยอดรวม = total พอดี)
export function computeInstallments(total, installments) {
  const grand = money(total);
  const rows = (Array.isArray(installments) ? installments : []).map((it, i) => ({
    no: i + 1,
    label: (it?.label ?? '').toString(),
    percent: pct(it?.percent),
    note: (it?.note ?? '').toString(),
  }));
  const evenN = evenSplitCount(rows);
  if (evenN) {
    const grandC = Math.round(grand * 100);
    const baseC = Math.floor(grandC / evenN);
    return rows.map((r, i) => ({ ...r, amount: (i === evenN - 1 ? grandC - baseC * (evenN - 1) : baseC) / 100 }));
  }
  let acc = 0;
  return rows.map((r, i) => {
    let amount;
    if (i === rows.length - 1) {
      amount = money(grand - acc); // งวดสุดท้าย = ที่เหลือ (กันเศษปัด)
    } else {
      amount = money((grand * r.percent) / 100);
      acc += amount;
    }
    return { ...r, amount };
  });
}

// ตารางแสดงเสมอ: ปิดแบ่งงวด = แถวชำระเต็มจำนวน 100% เพียงแถวเดียว
export function paymentScheduleRows(plan) {
  if (plan?.type === 'installment') {
    return Array.isArray(plan.installments) ? plan.installments : [];
  }
  return [{ label: 'ชำระเต็มจำนวน', percent: 100, note: '' }];
}

/**
 * งวดของแผนที่ **บันทึกแล้ว** — ยอดที่เก็บไว้ในแผน (`installments[].amount` จาก normalizePaymentPlan ตอนบันทึก QT)
 * ⭐ ยอดที่เก็บไว้ = ยอดที่พิมพ์ลงใบเสนอราคาให้ลูกค้า (quotationMasterTemplate อ่าน `row.amount`) และอยู่ในลายนิ้วมืออนุมัติ
 *   ⇒ งวดของ SO / ภาพก่อนกด / ป้าย "ปรับแผนหลังอนุมัติ" ต้องยึดตัวนี้ ไม่คิดใหม่จาก % — กติกาคิดเงินเปลี่ยน (เช่นเกลี่ยเท่ากัน 12/11)
 *   แล้วใบเดิมต้องไม่ขยับเงียบ ๆ ทั้งที่เอกสารที่ส่งลูกค้าไปแล้วยังเป็นยอดเดิม
 * ⭐ ใช้ยอดที่เก็บไว้เมื่อ **ทุกแถวมียอด และรวมได้เท่า total ถึงสตางค์** — ไม่งั้นคิดใหม่ด้วย computeInstallments
 *   (แผนแบบเต็มจำนวน · แผนเก่าที่ไม่มียอด · ยอดใบเปลี่ยนแต่แผนยังไม่ถูกบันทึกใหม่)
 *   วัด prod 12/11/2026: แผนแบ่งงวด 239 ใบ ยอดที่เก็บไว้ = ยอดคิดใหม่ด้วยกติกาเดิมครบทุกใบ และ Σ = ยอดใบทุกใบ ⇒ ตัวนี้ไม่เปลี่ยนตัวเลขของใบไหนในวันที่ขึ้น
 * ⚠️ ฟอร์มที่กำลังแก้ % ต้องเรียก computeInstallments ตรง ๆ — ยอดที่เก็บไว้เป็นของการบันทึกครั้งก่อน
 */
export function planInstallmentAmounts(plan, total) {
  const schedule = paymentScheduleRows(plan);
  const computed = computeInstallments(total, schedule);
  if (plan?.type !== 'installment' || !schedule.length) return computed;
  const storedC = schedule.map((r) => {
    const n = r?.amount === null || r?.amount === undefined || r?.amount === '' ? NaN : Number(r.amount);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
  });
  if (storedC.some((c) => c === null)) return computed;
  if (storedC.reduce((s, c) => s + c, 0) !== Math.round(money(total) * 100)) return computed;
  return computed.map((r, i) => ({ ...r, amount: storedC[i] / 100 }));
}

// ตรวจความถูกต้องของแผน — คืน { ok, error }
export function validatePaymentPlan(plan) {
  if (!plan || plan.type === 'full') return { ok: true, error: null };
  if (plan.type !== 'installment') return { ok: false, error: 'ประเภทการชำระไม่ถูกต้อง' };
  const rows = Array.isArray(plan.installments) ? plan.installments : [];
  // ยอมรับ 1 งวด 100% เพื่อรองรับข้อมูลเดิม แม้ UI ใหม่จะใช้ type:'full' แสดงแถวเต็มจำนวน
  if (rows.length < 1) return { ok: false, error: 'แบ่งงวดต้องมีอย่างน้อย 1 งวด' };
  if (rows.length > MAX_INSTALLMENTS) return { ok: false, error: `แบ่งงวดได้ไม่เกิน ${MAX_INSTALLMENTS} งวด` };
  const sum = rows.reduce((s, r) => s + pct(r.percent), 0);
  if (rows.some((r) => pct(r.percent) < 0)) return { ok: false, error: 'เปอร์เซ็นต์ต้องไม่ติดลบ' };
  // ข้อความนี้ขึ้นจอตรง ๆ (แถบเตือนของฟอร์มใบเสนอราคา ทั้งฝั่ง client และ server)
  // ⇒ จัดรูปแบบผ่าน fmtPercent ให้ได้ 2 ตำแหน่งเสมอ · `sum` ที่ใช้เทียบกับ EPS ยังเป็นตัวเลขดิบ
  if (Math.abs(sum - 100) > EPS) return { ok: false, error: `เปอร์เซ็นต์รวมต้องเท่ากับ 100% (ตอนนี้ ${fmtPercent(sum)})` };
  return { ok: true, error: null };
}

// sanitize แผนจาก body ให้พร้อมเก็บ DB
export function normalizePaymentPlan(raw, total) {
  const paymentMethod = String(raw?.paymentMethod || '').trim() || null;
  if (!raw || raw.type === 'full') return { type: 'full', ...(paymentMethod ? { paymentMethod } : {}) };
  if (raw.type !== 'installment') return { type: 'full' };
  const installments = computeInstallments(total, raw.installments).map((r) => ({
    no: r.no,
    label: r.label.trim() || `งวดที่ ${r.no}`,
    percent: Math.round(pct(r.percent) * 100) / 100,
    amount: r.amount,
    note: r.note.trim() || null,
  }));
  return { type: 'installment', ...(paymentMethod ? { paymentMethod } : {}), installments };
}
