// การผูกงานกับดีล — "ช่องดีลว่าง = ไม่ผูก" ไม่มีตัวสลับโหมดอีกแล้ว
// (มติผู้ใช้ 2026-08-05: ฝ่ายขายต้องผูกดีลทุกงาน จึงถอดตัวเลือก "ไม่ผูก" ออก ·
//  2026-08-06: บังคับทุกฝ่าย ไม่ใช่เฉพาะฝ่ายขาย — ดู requiresDealLink ใน taskDealScope.js)
// ⭐ งวด P3b-3 ยุบโครงการ (17/11/2026): เลิกคืน `projectId` ที่ mirror จากดีล — API งานไม่รับค่านี้ตั้งแต่ P3a
export function resolvePersonalTaskLink(form) {
  return { dealId: form?.dealId || null };
}
