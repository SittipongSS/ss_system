// การผูกงานกับดีล — "ช่องดีลว่าง = ไม่ผูก" ไม่มีตัวสลับโหมดอีกแล้ว
// (มติผู้ใช้ 2026-08-05: ฝ่ายขายต้องผูกดีลทุกงาน จึงถอดตัวเลือก "ไม่ผูก" ออก
//  ดู requiresDealLink ใน taskDealScope.js — ฝ่ายที่ไม่มีดีลให้เลือกก็แค่ปล่อยว่าง)
export function resolvePersonalTaskLink(form, deals = []) {
  const dealId = form?.dealId || null;
  if (!dealId) return { projectId: null, dealId: null };
  // โครงการ mirror มาจากดีลเสมอ — งานจะได้ขึ้นทั้งหน้าดีลและหน้าโครงการ
  const deal = deals.find((row) => row.id === dealId);
  return { projectId: deal?.projectId || null, dealId };
}
