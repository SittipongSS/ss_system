export function resolvePersonalTaskLink(form, deals = []) {
  if (form?.linkType === 'project') {
    return { projectId: form.projectId || null, dealId: null };
  }
  if (form?.linkType === 'deal') {
    const dealId = form.dealId || null;
    const deal = dealId ? deals.find((row) => row.id === dealId) : null;
    return { projectId: deal?.projectId || null, dealId };
  }
  return { projectId: null, dealId: null };
}

export function taskLinkType(task) {
  if (task?.dealId) return 'deal';
  if (task?.projectId) return 'project';
  return 'none';
}
