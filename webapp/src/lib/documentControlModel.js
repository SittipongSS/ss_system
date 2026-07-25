export function visibleDocumentActions(actions = []) {
  return actions.filter((action) => action && action.visible !== false);
}

export function normalizeDocumentControlActions({
  primaryAction = null,
  secondaryActions = [],
  dangerActions = [],
} = {}) {
  return {
    primaryAction: primaryAction?.visible === false ? null : primaryAction,
    secondaryActions: visibleDocumentActions(secondaryActions),
    dangerActions: visibleDocumentActions(dangerActions),
  };
}

export function workflowStepsFromIndex(steps = [], currentIndex = 0, cancelled = false) {
  return steps.map((step, index) => ({
    ...step,
    state: cancelled ? "cancelled" : index < currentIndex ? "done" : index === currentIndex ? "current" : "pending",
  }));
}
