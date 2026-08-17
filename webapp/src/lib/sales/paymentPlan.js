// งวดการชำระใบเสนอราคา: เต็มจำนวน / แบ่งงวด.
// pure ทั้งหมด (แถวแสดงผล + คำนวณ + validate) ใช้ทั้ง client และ server.

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

// ตารางแสดงเสมอ: ปิดแบ่งงวด = แถวชำระเต็มจำนวน 100% เพียงแถวเดียว
export function paymentScheduleRows(plan) {
  if (plan?.type === 'installment') {
    return Array.isArray(plan.installments) ? plan.installments : [];
  }
  return [{ label: 'ชำระเต็มจำนวน', percent: 100, note: '' }];
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
  if (Math.abs(sum - 100) > EPS) return { ok: false, error: `เปอร์เซ็นต์รวมต้องเท่ากับ 100% (ตอนนี้ ${Math.round(sum * 100) / 100}%)` };
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
