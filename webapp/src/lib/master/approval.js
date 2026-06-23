// ── Re-approval on edit (org rule: ทุกระบบ) ───────────────────────────────
// Policy: any APPROVED master-data record (customer / product) that is later
// edited — its detail fields OR its attachments — must drop back to 'pending'
// and be re-approved by a Senior AE+ (canApproveMasterData). This keeps an
// approved record from silently changing after sign-off.
//
// Returns a field patch to merge into the update, or null when no reset is
// needed (the record wasn't approved, so it's already awaiting approval). The
// caller stamps `submittedBy/Name` with the editor so the re-submission is
// attributed correctly; approval stamps are cleared.
//
// NOTE: excise_registrations follow the STRICTER rule (locked when approved +
// explicit "ขอแก้ไข" revise) handled in the registration route, not here.
export function resetApprovalOnEdit(record, user) {
  if (record?.approvalStatus !== 'approved') return null;
  return {
    approvalStatus: 'pending',
    submittedBy: user?.id ?? null,
    submittedByName: user?.name ?? null,
    approvedBy: null,
    approvedByName: null,
    approvedAt: null,
    rejectionReason: null,
  };
}
