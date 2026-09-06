// ── "ทีมนี้ถูกใช้ไปแล้วหรือยัง" — ตัวตัดสินว่าลบทีมได้ไหม (มติผู้ใช้ 2026-08-30) ──
//
// ⭐ **ที่มา**: ผู้ใช้ขอปุ่มลบทีมให้แอดมิน · แต่ mig 0310 เขียนกฎไว้ชัดว่า
//    *"ปิดทีม ไม่ใช่ลบทีม — รหัสทีมถูกก๊อปเป็นข้อความลงหลายสิบคอลัมน์ในหลายตาราง
//    ลบแถวทะเบียนแล้วป้ายในรายงานย้อนหลังกลายเป็นรหัสดิบทันที"*
//
// 🔴 **ทั้งสองอย่างเป็นจริงพร้อมกันได้** — สิ่งที่ต้องลบจริง ๆ คือ **ทีมที่ตั้งผิดแล้วยัง
//    ไม่มีใครใช้** (พิมพ์ชื่อผิด · สร้างซ้ำ · ทดลอง) ซึ่งไม่มีประวัติให้พัง · ส่วนทีมที่มี
//    ประวัติแล้ว ปิดทีมคือคำตอบเดิม ⇒ ปุ่มลบต้อง **ถามฐานข้อมูลก่อนเสมอ** ไม่ใช่เชื่อคนกด
//
// ⚠️ ลิสต์ข้างล่างคือ "ที่ที่รหัสทีมไปโผล่" — ตกหล่นตารางไหน = ลบทีมที่ยังถูกอ้างอยู่ได้
//    โดยไม่มีอะไรเตือน ⇒ มีเทสต์ไล่ migration ทุกใบมาเทียบกับลิสต์นี้
//    (`teamUsage.test.mjs`) · เพิ่มคอลัมน์ที่ประทับรหัสทีมเมื่อไร ต้องมาเติมที่นี่ด้วย

/** ตาราง/คอลัมน์ที่ประทับ "รหัสทีม" ไว้เป็นข้อความ */
export const TEAM_STAMPED_COLUMNS = [
  { table: 'projects', column: 'team', label: 'โครงการ' },
  { table: 'sales_deals', column: 'team', label: 'ดีล' },
  { table: 'sales_leads', column: 'team', label: 'ลีด' },
  { table: 'lead_events', column: 'team', label: 'ประวัติลีด' },
  { table: 'sales_targets', column: 'team', label: 'เป้าขาย' },
  { table: 'sales_history', column: 'team', label: 'ยอดขายย้อนหลัง' },
  { table: 'sales_forecast_reviews', column: 'team', label: 'รอบทบทวนคาดการณ์' },
  { table: 'sales_contracts', column: 'team', label: 'สัญญา' },
  { table: 'sales_contract_addenda', column: 'team', label: 'บันทึกเพิ่มเติมของสัญญา' },
  { table: 'inquiries', column: 'team', label: 'ใบสอบถาม' },
  { table: 'costing_requests', column: 'team', label: 'ใบขอราคาผลิต' },
  { table: 'material_price_requests', column: 'team', label: 'ใบขอราคาวัสดุ' },
  { table: 'material_price_asks', column: 'team', label: 'คำขอราคาวัสดุ' },
  { table: 'excise_registrations', column: 'team', label: 'ทะเบียนสรรพสามิต' },
  { table: 'team_members', column: 'teamCode', label: 'สมาชิกทีม' },
];

/**
 * เหตุผลที่ลบทีมนี้ไม่ได้ — คืนข้อความไทย หรือ `''` ถ้าลบได้
 *
 * @param team          แถวทะเบียนทีม
 * @param usage         `[{ label, count }]` ที่ตรวจจากฐานแล้ว (นับเฉพาะที่ > 0)
 * @param memberUserIds บัญชีผู้ใช้ที่ยังมีรหัสทีมนี้ใน app_metadata (ทีมขาย)
 * @param protectedCode รหัสนี้เป็นหนึ่งในสามทีมที่ seed มาแต่แรกไหม (TEAMS)
 */
export function deleteTeamBlocker(team, { usage = [], memberUserIds = [], protectedCode = false } = {}) {
  if (!team) return 'ไม่พบทีม';
  /* 🔴 สามทีมที่ seed มาแต่แรก (KA/ODM/SV) — รหัสถูกก๊อปเป็นข้อความลง 20 คอลัมน์ใน 19
     ตารางไปแล้ว และยังเป็นค่าถอยของฝั่งจอที่อ่านแบบ sync ⇒ ลบแถวออกไม่ได้แม้ยังไม่มีใครใช้
     · ปิดทีมคือคำตอบของกรณีนั้น
     ⚠️ **ทีมขายที่สร้างใหม่ไม่ติดข้อนี้** (มติ 2026-09-07) — ถ้ายังไม่มีใครใช้ก็ลบได้ตามปกติ */
  if (protectedCode) {
    return `${team.name} เป็นทีมตั้งต้นของระบบ — ลบไม่ได้ ใช้ "ปิดทีม" แทน`;
  }
  if (memberUserIds.length) {
    return `ทีมนี้ยังเป็นสังกัดของผู้ใช้ ${memberUserIds.length} คน — ย้ายคนออกก่อน`;
  }
  const used = usage.filter((u) => u.count > 0);
  if (used.length) {
    const detail = used.map((u) => `${u.label} ${u.count}`).join(' · ');
    return `ทีมนี้ถูกใช้ไปแล้ว (${detail}) — ลบไม่ได้เพราะป้ายในรายงานย้อนหลังจะกลายเป็นรหัสดิบ · ใช้ "ปิดทีม" แทน`;
  }
  return '';
}
