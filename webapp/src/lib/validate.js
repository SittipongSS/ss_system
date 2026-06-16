// Lightweight request-body helpers shared by write routes. Behavior-preserving:
// these capture the field-whitelist + empty-string→null coercion that was
// hand-rolled identically across the PATCH handlers — not new validation rules.

// Keep only allowed keys present on body; coerce '' → null for `nullable` keys
// (date inputs send '' when cleared, which must become NULL not '').
export function pickFields(body, allowed, { nullable = [] } = {}) {
  const out = {};
  const nul = new Set(nullable);
  for (const k of allowed) {
    if (body[k] !== undefined) {
      out[k] = (nul.has(k) && body[k] === '') ? null : body[k];
    }
  }
  return out;
}

// First required key that is missing/blank (string trimmed), or null if all present.
export function missingField(body, required) {
  for (const k of required) {
    const v = body?.[k];
    if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) return k;
  }
  return null;
}
