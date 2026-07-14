// เงื่อนไขการชำระเงินใบเสนอราคา (QT create page): เต็มจำนวน / แบ่งงวด.
// pure ทั้งหมด (คำนวณ + validate + สรุปข้อความ) — ใช้ทั้ง client (ปุ่มคำนวณ) และ
// server (validate ก่อน insert). ไม่มี side-effect / ไม่แตะ DB.

export const MAX_INSTALLMENTS = 6;
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

// คำนวณยอดเงินแต่ละงวดจาก % ของ total (งวดสุดท้ายซับเศษปัดให้ยอดรวม = total พอดี)
export function computeInstallments(total, installments) {
  const grand = money(total);
  const rows = (Array.isArray(installments) ? installments : []).map((it, i) => ({
    no: i + 1,
    label: (it?.label ?? '').toString(),
    percent: pct(it?.percent),
    note: (it?.note ?? '').toString(),
  }));
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

// ตรวจความถูกต้องของแผน — คืน { ok, error }
export function validatePaymentPlan(plan) {
  if (!plan || plan.type === 'full') return { ok: true, error: null };
  if (plan.type !== 'installment') return { ok: false, error: 'ประเภทการชำระไม่ถูกต้อง' };
  const rows = Array.isArray(plan.installments) ? plan.installments : [];
  if (rows.length < 2) return { ok: false, error: 'แบ่งงวดต้องมีอย่างน้อย 2 งวด' };
  if (rows.length > MAX_INSTALLMENTS) return { ok: false, error: `แบ่งงวดได้ไม่เกิน ${MAX_INSTALLMENTS} งวด` };
  const sum = rows.reduce((s, r) => s + pct(r.percent), 0);
  if (rows.some((r) => pct(r.percent) < 0)) return { ok: false, error: 'เปอร์เซ็นต์ต้องไม่ติดลบ' };
  if (Math.abs(sum - 100) > EPS) return { ok: false, error: `เปอร์เซ็นต์รวมต้องเท่ากับ 100% (ตอนนี้ ${Math.round(sum * 100) / 100}%)` };
  return { ok: true, error: null };
}

// sanitize แผนจาก body ให้พร้อมเก็บ DB (คืน null ถ้าไม่ระบุ/เต็มจำนวน)
export function normalizePaymentPlan(raw, total) {
  if (!raw || raw.type === 'full') return { type: 'full' };
  if (raw.type !== 'installment') return { type: 'full' };
  const installments = computeInstallments(total, raw.installments).map((r) => ({
    no: r.no,
    label: r.label.trim() || `งวดที่ ${r.no}`,
    percent: Math.round(pct(r.percent) * 100) / 100,
    amount: r.amount,
    note: r.note.trim() || null,
  }));
  return { type: 'installment', installments };
}

// สรุปเป็นข้อความไทยสำหรับช่อง paymentTerms (พิมพ์บนเอกสาร) — แก้ทับได้
export function paymentPlanSummary(plan, total) {
  if (!plan || plan.type === 'full') return 'ชำระเต็มจำนวน';
  const rows = computeInstallments(total, plan.installments);
  return rows
    .map((r) => {
      const p = Math.round(r.percent * 100) / 100;
      const amt = r.amount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const label = r.label.trim() || `งวดที่ ${r.no}`;
      const note = r.note.trim() ? ` (${r.note.trim()})` : '';
      return `${label} ${p}% = ${amt} บาท${note}`;
    })
    .join(' · ');
}
