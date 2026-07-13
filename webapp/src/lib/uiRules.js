// System-wide interaction rules. Keep data semantics here so forms do not
// independently decide whether a selector should expose search.
export const ENTITY_SELECT_RULES = Object.freeze({
  customer: Object.freeze({ searchable: true }),
  product: Object.freeze({ searchable: true }),
  brand: Object.freeze({ searchable: false }),
});

export const searchableForEntity = (entity, fallback = true) =>
  entity && ENTITY_SELECT_RULES[entity]
    ? ENTITY_SELECT_RULES[entity].searchable
    : fallback;

// Rows with a known detail URL are navigable from the non-interactive area.
// Buttons, links and form controls inside the row retain their own action.
export const isInteractiveTarget = (target) =>
  Boolean(target?.closest?.("a,button,input,select,textarea,[role='button'],[role='link'],[data-no-row-navigation]"));

