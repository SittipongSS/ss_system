export function dealTimelineDocument(deal = {}, overview = {}) {
  const tasks = Array.isArray(overview.projectTasks) ? overview.projectTasks : [];
  const projectProducts = Array.isArray(overview.projectProducts) ? overview.projectProducts : [];
  const project = overview.project;

  if (project) {
    return {
      ...project,
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
    preparedBy: deal.metadata?.preparedBy || deal.ownerName || '',
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
