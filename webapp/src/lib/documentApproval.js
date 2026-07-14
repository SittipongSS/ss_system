import { createHash } from 'node:crypto';

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value ?? null;
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = canonicalize(value[key]);
    return result;
  }, {});
}

// Fingerprints are calculated only on the server. They bind an approval to the
// exact commercial content that was reviewed, so later edits invalidate it.
export function documentApprovalFingerprint(content, version = 1) {
  const canonical = JSON.stringify({ version, content: canonicalize(content) });
  return `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
}
