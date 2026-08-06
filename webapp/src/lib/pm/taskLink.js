// การผูกงานกับดีล — "ช่องดีลว่าง = ไม่ผูก" ไม่มีตัวสลับโหมดอีกแล้ว
// (มติผู้ใช้ 2026-08-05: ฝ่ายขายต้องผูกดีลทุกงาน จึงถอดตัวเลือก "ไม่ผูก" ออก ·
//  2026-08-06: บังคับทุกฝ่าย ไม่ใช่เฉพาะฝ่ายขาย — ดู requiresDealLink ใน taskDealScope.js)
export function resolvePersonalTaskLink(form, deals = []) {
  const dealId = form?.dealId || null;
  if (!dealId) return { projectId: null, dealId: null };
  // โครงการ mirror มาจากดีลเสมอ — งานจะได้ขึ้นทั้งหน้าดีลและหน้าโครงการ
  const deal = deals.find((row) => row.id === dealId);
  return { projectId: deal?.projectId || null, dealId };
}
