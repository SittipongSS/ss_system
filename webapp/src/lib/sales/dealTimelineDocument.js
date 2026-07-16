export function dealTimelineDocument(deal = {}, overview = {}) {
  const tasks = Array.isArray(overview.projectTasks) ? overview.projectTasks : [];
  const projectProducts = Array.isArray(overview.projectProducts) ? overview.projectProducts : [];
  const project = overview.project;

  if (project) {
    return {
      ...project,
      // เอกสารนี้เป็นบริบท "ดีล" — ผู้ดูแลใช้เจ้าของดีลสดเสมอ (เปลี่ยนเจ้าของดีลแล้ว
      // ไม่ค้างชื่อเก่า). โครงการมีได้หลายดีล จึงไม่ sync ค่ากลับไปที่ตัวโครงการ.
      aeOwner: deal.ownerName || project.aeOwner || '',
      tasks,
      projectProducts,
      categoryFallback: project.productMainCategory || project.productSubCategory || deal.categoryCode || '',
      rev: null,
      revDate: null,
    };
  }

  return {
    id: `deal-${deal.id || 'timeline'}`,
    code: deal.code || '',
    docNumber: deal.code || '',
    name: deal.title || '',
    productName: deal.title || '',
    customerName: deal.customerName || deal.customer?.name || '',
    aeOwner: deal.ownerName || deal.metadata?.aeOwner || '',
    // ผู้จัดทำ = AC เท่านั้น — ไม่ fallback เป็นเจ้าของดีล (AE) ที่ทำให้เอกสารระบุ
    // AE เป็น "ผู้จัดทำ (AC)" ผิด. ว่างไว้ถ้ายังไม่ได้ระบุ AC.
    preparedBy: deal.metadata?.preparedBy || '',
    aeSupervisor: deal.metadata?.aeSupervisor || '',
    startDate: deal.startDate || '',
    dueDate: deal.endDate || deal.expectedCloseDate || '',
    status: deal.stage || '',
    metadata: {
      ...(deal.metadata || {}),
      brand: deal.metadata?.brand || deal.brand || '',
    },
    categoryFallback: deal.categoryCode || '',
    projectProducts,
    tasks,
    rev: null,
    revDate: null,
  };
}
