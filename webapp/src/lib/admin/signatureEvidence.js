export class SignatureEvidenceError extends Error {
  constructor(message, status = 500, code = 'signature_evidence_failed', extra = {}) {
    super(message);
    this.name = 'SignatureEvidenceError';
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

// action = 'approve' (ค่าเดิม) หรือ 'submit' — ใช้เลือกคำในข้อความให้ตรงกับปุ่มที่ผู้ใช้กด
// (ตั้งแต่ mig 0153 การยื่นก็ต้องมีลายเซ็น ข้อความ "ก่อนอนุมัติ" จะทำให้ผู้ใช้สับสน)
export function signatureEvidenceRpcError(error, { action = 'approve' } = {}) {
  const raw = String(error?.message || error || '');
  const act = action === 'submit' ? 'ยื่นอนุมัติ' : 'อนุมัติ';
  const mappings = [
    ['signature_evidence_signature_required', `กรุณาเพิ่มลายเซ็นอิเล็กทรอนิกส์ในบัญชีของฉันก่อน${act}`, 409, 'signature_required', { accountUrl: '/account' }],
    ['signature_evidence_signature_missing', 'ไม่พบลายเซ็นเวอร์ชันที่ใช้งาน กรุณาตรวจสอบบัญชีของฉัน', 409, 'signature_required', { accountUrl: '/account' }],
    ['signature_evidence_submit_state_invalid', 'สถานะเอกสารเปลี่ยนแล้ว — ยื่นอนุมัติได้เฉพาะฉบับร่างหรือใบที่ถูกตีกลับ', 409, 'submit_state_invalid', {}],
    ['signature_evidence_signing_role_invalid', 'บทบาทการลงนามไม่ถูกต้อง', 500, 'signing_role_invalid', {}],
    ['signature_evidence_standard_required', 'ยังไม่มีมาตรฐานเอกสารที่เผยแพร่ กรุณาติดต่อผู้ดูแลระบบ', 409, 'document_standard_required', {}],
    ['signature_evidence_standard_missing', 'มาตรฐานเอกสารที่เผยแพร่ไม่สมบูรณ์ กรุณาติดต่อผู้ดูแลระบบ', 409, 'document_standard_required', {}],
    ['signature_evidence_approval_stale', 'เอกสารถูกแก้ไขจากอีกหน้าต่าง กรุณาโหลดข้อมูลล่าสุดแล้วตรวจอีกครั้ง', 409, 'approval_stale', {}],
    ['signature_evidence_approval_state_invalid', 'สถานะอนุมัติเปลี่ยนแล้ว กรุณาโหลดข้อมูลล่าสุด', 409, 'approval_state_changed', {}],
    ['signature_evidence_separation_required', 'อนุมัติ ใบสั่งขายที่ตัวเองสร้างหรือยื่นไม่ได้', 403, 'separation_of_duty', {}],
    ['signature_evidence_override_reason_required', 'Admin Override ต้องระบุเหตุผล 10–500 ตัวอักษร', 400, 'override_reason_required', {}],
    ['signature_evidence_override_not_applicable', 'ใช้ Admin Override ได้เฉพาะ SO ที่ตนเองสร้างหรือยื่น', 400, 'override_not_applicable', {}],
    ['signature_evidence_forbidden', 'ไม่มีสิทธิ์อนุมัติเอกสารนี้', 403, 'forbidden', {}],
    ['signature_evidence_lines_required', 'ต้องมีอย่างน้อย 1 รายการก่อนอนุมัติ', 400, 'document_incomplete', {}],
    ['signature_evidence_document_incomplete', 'ข้อมูลเอกสารยังไม่ครบสำหรับการอนุมัติ', 400, 'document_incomplete', {}],
    ['signature_evidence_deal_invalid', 'ดีลไม่อยู่ในสถานะที่อนุมัติเอกสารได้', 400, 'deal_invalid', {}],
    ['signature_evidence_document_state_invalid', 'สถานะเอกสารไม่รองรับการอนุมัติ', 400, 'document_state_invalid', {}],
    ['signature_evidence_document_not_found', 'ไม่พบเอกสาร', 404, 'document_not_found', {}],
    ['signature_evidence_fingerprint_invalid', 'ข้อมูลยืนยันเอกสารไม่ถูกต้อง', 400, 'fingerprint_invalid', {}],
  ];
  const match = mappings.find(([token]) => raw.includes(token));
  if (match) return new SignatureEvidenceError(match[1], match[2], match[3], match[4]);
  return new SignatureEvidenceError('บันทึกหลักฐานลายเซ็นไม่สำเร็จ');
}

// action ต้องไหลถึง mapper ตรงนี้: ผู้เรียกที่ catch แล้วส่ง { action } ให้
// signatureEvidenceErrorResponse ไม่ทันแล้ว เพราะ error ถูกแปลงเป็น SignatureEvidenceError
// ที่นี่ก่อน (mapper ถัดไปจะข้ามไป) → ข้อความจะเป็น "ก่อนอนุมัติ" ทั้งที่ผู้ใช้กดยื่น
async function approveWithEvidence(supabase, rpc, params, action = 'approve') {
  const { data, error } = await supabase.rpc(rpc, params);
  if (error) throw signatureEvidenceRpcError(error, { action });
  if (!data?.document || !data?.evidence) {
    throw new SignatureEvidenceError('บันทึกหลักฐานลายเซ็นไม่สำเร็จ');
  }
  return data;
}

export function approveQuotationWithSignatureEvidence(supabase, input) {
  return approveWithEvidence(supabase, 'approve_quotation_with_signature_evidence_atomic', {
    p_quote_id: input.documentId,
    p_evidence_id: input.evidenceId,
    p_expected_updated_at: input.expectedUpdatedAt,
    p_document_fingerprint: input.documentFingerprint,
    p_approval_notes: input.note || null,
    p_actor_id: input.user.id,
    p_actor_name: input.user.name || null,
    p_actor_role: input.user.role || null,
    p_actor_team: input.user.team || null,
  });
}

export function approveSalesOrderWithSignatureEvidence(supabase, input) {
  return approveWithEvidence(supabase, 'approve_sales_order_with_signature_evidence_atomic', {
    p_order_id: input.documentId,
    p_evidence_id: input.evidenceId,
    p_expected_updated_at: input.expectedUpdatedAt,
    p_document_fingerprint: input.documentFingerprint,
    p_approval_note: input.note || null,
    p_actor_id: input.user.id,
    p_actor_name: input.user.name || null,
    p_actor_role: input.user.role || null,
    p_actor_team: input.user.team || null,
    p_separation_override_reason: input.overrideReason || null,
  });
}

/* บัญชีตรวจใบผ่าน + ตรึงลายเซ็นในช่อง "ฝ่ายบัญชี" (mig 0251)
   ⚠️ ทำงานบนแกน `financeStatus` ไม่ใช่ `status` — ไม่แตะสายอนุมัติเอกสารและไม่แตะ
   `approvalFingerprint` ที่ตรึงไว้ตอน AE Supervisor อนุมัติ
   ⚠️ ส่ง `department` ไปด้วยเพราะ RPC ตรวจฝ่าย ไม่ใช่ role อย่างเดียว — role `staff`
   ของฝ่ายอื่นก็ถือ `payments:confirm` ในชั้นแอป */
export function financeApproveSalesOrderWithSignatureEvidence(supabase, input) {
  return approveWithEvidence(supabase, 'finance_approve_sales_order_with_signature_evidence_atomic', {
    p_order_id: input.documentId,
    p_evidence_id: input.evidenceId,
    p_expected_updated_at: input.expectedUpdatedAt,
    p_document_fingerprint: input.documentFingerprint,
    p_finance_note: input.note || null,
    p_actor_id: input.user.id,
    p_actor_name: input.user.name || null,
    p_actor_role: input.user.role || null,
    p_actor_team: input.user.team || null,
    p_actor_department: input.user.department || null,
  });
}

export function submitSalesOrderWithSignatureEvidence(supabase, input) {
  return approveWithEvidence(supabase, 'submit_sales_order_with_signature_evidence_atomic', {
    p_order_id: input.documentId,
    p_evidence_id: input.evidenceId,
    p_expected_updated_at: input.expectedUpdatedAt,
    p_document_fingerprint: input.documentFingerprint,
    p_actor_id: input.user.id,
    p_actor_name: input.user.name || null,
    p_actor_role: input.user.role || null,
    p_actor_team: input.user.team || null,
  }, 'submit');
}

// ยื่นอนุมัติใบเสนอราคา (mig 0155) — not_submitted → pending + หลักฐานผู้เสนอราคา
export function submitQuotationWithSignatureEvidence(supabase, input) {
  return approveWithEvidence(supabase, 'submit_quotation_with_signature_evidence_atomic', {
    p_quote_id: input.documentId,
    p_evidence_id: input.evidenceId,
    p_expected_updated_at: input.expectedUpdatedAt,
    p_document_fingerprint: input.documentFingerprint,
    p_actor_id: input.user.id,
    p_actor_name: input.user.name || null,
    p_actor_role: input.user.role || null,
    p_actor_team: input.user.team || null,
  }, 'submit');
}

export function signatureEvidenceErrorResponse(error, options) {
  const mapped = error instanceof SignatureEvidenceError ? error : signatureEvidenceRpcError(error, options);
  return Response.json({ error: mapped.message, code: mapped.code, ...mapped.extra }, { status: mapped.status });
}
