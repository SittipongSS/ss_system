// แผนการโยกเป้า (TG) ตอนโอนงานพนักงาน — pure function แยกออกมาให้เทสได้
// กติกา (นโยบายพนักงานเข้า-ออก): เดือนเก่าไม่โยก, โยกเฉพาะ period >= fromPeriod,
// เป้าฝั่งคนออกไม่ลบแถว (ตั้งเป็น 0 + โน้ตบอกปลายทาง) เพื่อไม่ให้แถว ghost
// ในหน้าวางเป้าโผล่ค้าง (ghost โชว์เฉพาะยอด > 0) แต่ประวัติ audit ยังไล่ได้

// fromRows = แถวเป้ารายเดือนของคนออก (กรอง period >= fromPeriod มาแล้วจาก caller)
// toRows   = แถวเป้ารายเดือนของคนรับที่มีอยู่แล้ว (ทีมเดียวกับคนรับ)
// to       = { id, name, team }
// คืน { zero: [ids ของแถวต้นทางที่ต้องตั้ง 0], add: [{period, amount, existingId?}] }
export function planTargetTransfer(fromRows = [], toRows = [], to = {}) {
  const zero = [];
  const byPeriod = new Map();
  for (const r of fromRows) {
    const amt = Number(r.targetAmount || 0);
    if (amt <= 0) continue; // แถว 0 อยู่แล้ว ไม่ต้องแตะ
    zero.push(r.id);
    byPeriod.set(r.period, (byPeriod.get(r.period) || 0) + amt);
  }
  const existingByPeriod = new Map((toRows || []).map((r) => [r.period, r]));
  const add = [...byPeriod].map(([period, amount]) => {
    const existing = existingByPeriod.get(period);
    return {
      period,
      amount: existing ? amount + Number(existing.targetAmount || 0) : amount,
      existingId: existing?.id || null,
    };
  });
  return { zero, add };
}

// เดือนถัดไปในรูป YYYY-MM — ค่า default ของ "โยกเป้าตั้งแต่เดือน"
// (เดือนปัจจุบันปล่อยวัดที่ระดับทีมตามคู่มือ)
export function nextMonthKey(now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth() + 2; // เดือนถัดไป (getMonth เป็น 0-based)
  return m > 12 ? `${y + 1}-01` : `${y}-${String(m).padStart(2, '0')}`;
}
