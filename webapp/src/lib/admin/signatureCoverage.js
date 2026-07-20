// Phase 5B go-live readiness: ใครยัง "เซ็นไม่ได้" เพราะไม่มีลายเซ็นอิเล็กทรอนิกส์.
//
// mig 0125 บังคับว่าผู้อนุมัติต้องมี active signature version ก่อนอนุมัติใบเสนอราคา/SO
// (RPC โยน signature_evidence_signature_required → 409). ลายเซ็นเป็นของส่วนตัวราย
// บุคคลตาม ADR 0006 — admin อัปแทนไม่ได้และไม่ควรได้ ไม่งั้นหลักฐานการเซ็นหมดความหมาย
// ดังนั้นรายงานนี้ "อ่านอย่างเดียว" ทำได้แค่ชี้ว่าต้องตามใคร ไม่มีปุ่มแก้ให้
//
// cohort = role ที่มีโอกาสชนด่านนี้:
//   admin / ae_supervisor  — อนุมัติได้ทั้งใบเสนอราคา (superuser) และ SO (reviewer)
//   senior_ae / ae         — อนุมัติใบเสนอราคาได้เมื่อเป็น "เจ้าของดีล" (canApproveQuotation)
// ac สร้างใบได้แต่อนุมัติไม่ได้เลย → ไม่อยู่ใน cohort

export const SIGNATURE_COHORT_ROLES = ['admin', 'ae_supervisor', 'senior_ae', 'ae'];

// role ที่อนุมัติได้เสมอไม่ว่าจะถือดีลหรือไม่ — ขาดลายเซ็นเมื่อไหร่คือความเสี่ยงทันที
const ALWAYS_APPROVER_ROLES = ['admin', 'ae_supervisor'];

export function isSignatureCohortRole(role) {
  return SIGNATURE_COHORT_ROLES.includes(role);
}

// AE/Senior AE จะชนด่านก็ต่อเมื่อถือดีลอยู่จริง — แยก "ต้องมีแน่ ๆ" ออกจาก
// "ยังไม่ต้องรีบ" เพื่อไม่ให้รายชื่อค้างเต็มไปด้วยคนที่ไม่ได้อนุมัติอะไรเลย
export function signatureRequirement(role, openDealCount) {
  if (ALWAYS_APPROVER_ROLES.includes(role)) return 'required';
  return openDealCount > 0 ? 'required' : 'optional';
}

// จัดอันดับความเร่งด่วน: ใบที่รออนุมัติอยู่ตอนนี้ = บล็อกงานจริงแล้ว
export function coverageSeverity(row) {
  if (row.hasSignature) return 'ready';
  if (row.pendingQuotations > 0) return 'blocking';
  if (row.requirement === 'required') return 'at_risk';
  return 'optional';
}

// users: [{ id, name, email, role, team }] จาก auth directory
// activeSignatureUserIds: Set ของ userId ที่มี activeVersionId
// dealCounts / pendingCounts: Map userId → number
export function buildSignatureCoverage({ users, activeSignatureUserIds, dealCounts, pendingCounts }) {
  const rows = users
    .filter((user) => isSignatureCohortRole(user.role))
    .map((user) => {
      const openDeals = dealCounts.get(user.id) || 0;
      const pendingQuotations = pendingCounts.get(user.id) || 0;
      const row = {
        id: user.id,
        name: user.name,
        email: user.email || null,
        role: user.role,
        team: user.team || null,
        hasSignature: activeSignatureUserIds.has(user.id),
        openDeals,
        pendingQuotations,
        requirement: signatureRequirement(user.role, openDeals),
      };
      return { ...row, severity: coverageSeverity(row) };
    });

  const required = rows.filter((row) => row.requirement === 'required');
  return {
    rows: rows.sort(sortByUrgency),
    summary: {
      cohort: rows.length,
      required: required.length,
      requiredReady: required.filter((row) => row.hasSignature).length,
      blocking: rows.filter((row) => row.severity === 'blocking').length,
      blockedQuotations: rows.reduce((sum, row) => (row.hasSignature ? sum : sum + row.pendingQuotations), 0),
    },
  };
}

const SEVERITY_ORDER = { blocking: 0, at_risk: 1, optional: 2, ready: 3 };

function sortByUrgency(a, b) {
  const bySeverity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
  if (bySeverity) return bySeverity;
  const byPending = b.pendingQuotations - a.pendingQuotations;
  if (byPending) return byPending;
  return String(a.name || '').localeCompare(String(b.name || ''), 'th');
}

// go-live ผ่านเมื่อทุกคนที่ "ต้องมี" มีครบ — ใช้เป็นไฟเขียวบนหัวรายงาน
export function isGoLiveReady(summary) {
  return summary.required > 0 && summary.requiredReady === summary.required;
}
