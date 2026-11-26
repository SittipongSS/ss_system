import { attributionTeam } from '@/lib/permissions';

// แผนการโยกเป้า (TG) ตอนโอนงานพนักงาน — pure function แยกออกมาให้เทสได้
// กติกา (นโยบายพนักงานเข้า-ออก): เดือนเก่าไม่โยก, โยกเฉพาะ period >= fromPeriod,
// เป้าฝั่งคนออกไม่ลบแถว (ตั้งเป็น 0 + โน้ตบอกปลายทาง) เพื่อไม่ให้แถว ghost
// ในหน้าวางเป้าโผล่ค้าง (ghost โชว์เฉพาะยอด > 0) แต่ประวัติ audit ยังไล่ได้

// fromRows = แถวเป้ารายเดือนของคนออก (กรอง period >= fromPeriod มาแล้วจาก caller) — มี `team` ของแถว
// toRows   = แถวเป้ารายเดือนของคนรับที่มีอยู่แล้ว (ทุกทีมของคนรับ — จับคู่ด้วย เดือน × ทีม)
// to       = { id, name, team, teams } — `team` ทีมหลัก · `teams` ทุกทีมที่สังกัด
// คืน { zero: [ids ของแถวต้นทางที่ต้องตั้ง 0], add: [{period, team, amount, existingId?}] }
//
// ⭐ ทีมของเป้าที่โยก = **ทีมเดิมของแถว ถ้าคนรับอยู่ทีมนั้น** ไม่งั้นทีมหลักของคนรับ (transferTeam)
//   🐞 ตรวจบัญชีสองทีม 26/11/2026: เดิมทุกแถวไปลงทีมหลักของคนรับ และจับคู่แถวเดิมด้วยเดือนอย่างเดียว
//      ⇒ โอนเป้า SV ให้ AE ที่อยู่ ODM+SV (ทีมหลัก ODM) = ยอดไปบวกในแถว ODM · เป้ารวมทีม SV หดเงียบ ๆ
export function planTargetTransfer(fromRows = [], toRows = [], to = {}) {
  const zero = [];
  const byKey = new Map(); // `${period}|${team}` → { period, team, amount }
  for (const r of fromRows) {
    const amt = Number(r.targetAmount || 0);
    if (amt <= 0) continue; // แถว 0 อยู่แล้ว ไม่ต้องแตะ
    zero.push(r.id);
    const team = transferTeam(to, r.team);
    const key = `${r.period}|${team ?? ''}`;
    const slot = byKey.get(key) || { period: r.period, team, amount: 0 };
    slot.amount += amt;
    byKey.set(key, slot);
  }
  const existingByKey = new Map((toRows || []).map((r) => [`${r.period}|${r.team ?? ''}`, r]));
  const add = [...byKey].map(([key, slot]) => {
    const existing = existingByKey.get(key);
    return {
      period: slot.period,
      team: slot.team,
      amount: existing ? slot.amount + Number(existing.targetAmount || 0) : slot.amount,
      existingId: existing?.id || null,
    };
  });
  return { zero, add };
}

// ทีมที่งานซึ่งถูกโอน (ดีลเปิด · เป้า) ไปลงกับคนรับ — ทีมเดิมของงาน ถ้าคนรับอยู่ทีมนั้น ไม่งั้นทีมหลักของคนรับ
// (กติกาเดียวกับ attributionTeam: ขอทีมที่ไม่ได้สังกัด = ถอยเป็นทีมหลัก)
export function transferTeam(to = {}, workTeam = null) {
  return attributionTeam(to, workTeam) || null;
}

// เดือนถัดไปในรูป YYYY-MM — ค่า default ของ "โยกเป้าตั้งแต่เดือน"
// (เดือนปัจจุบันปล่อยวัดที่ระดับทีมตามคู่มือ)
export function nextMonthKey(now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth() + 2; // เดือนถัดไป (getMonth เป็น 0-based)
  return m > 12 ? `${y + 1}-01` : `${y}-${String(m).padStart(2, '0')}`;
}
