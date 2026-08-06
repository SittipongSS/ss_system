export function hasCompatibleProjectCustomer(deal, project) {
  if (!project?.customerId) return false;
  return !deal?.customerId || deal.customerId === project.customerId;
}

export function isDealAvailableForProject(deal, project) {
  return Boolean(
    deal
    && !deal.projectId
    && deal.stage !== 'lost'
    && hasCompatibleProjectCustomer(deal, project)
  );
}

// ดีลที่ "ย้ายมาได้" — อยู่โครงการอื่นของลูกค้าเดียวกัน (มติผู้ใช้ 2026-08-06)
// แยกจาก isDealAvailableForProject เพราะปลายทางต่างกันคนละเรื่อง: ผูกครั้งแรก =
// ต่อ segment ใหม่จาก template · ย้าย = ยกของเดิมทั้งชุดมา แล้วโครงการต้นทางเสียดีลไป
// (API ต้องได้ move: true มาด้วย ไม่งั้นตีกลับ 409 ตามเดิม)
export function isDealMovableToProject(deal, project) {
  return Boolean(
    deal
    && deal.projectId
    && String(deal.projectId) !== String(project?.id || '')
    && deal.stage !== 'lost'
    && hasCompatibleProjectCustomer(deal, project)
  );
}
