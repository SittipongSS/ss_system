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
