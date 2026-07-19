export class SignatureEvidenceError extends Error {
  constructor(message, status = 500, code = 'signature_evidence_failed', extra = {}) {
    super(message);
    this.name = 'SignatureEvidenceError';
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export function signatureEvidenceRpcError(error) {
  const raw = String(error?.message || error || '');
  const mappings = [
    ['signature_evidence_signature_required', 'กรุณาเพิ่มลายเซ็นอิเล็กทรอนิกส์ในบัญชีของฉันก่อนอนุมัติ', 409, 'signature_required', { accountUrl: '/account' }],
    ['signature_evidence_signature_missing', 'ไม่พบลายเซ็นเวอร์ชันที่ใช้งาน กรุณาตรวจสอบบัญชีของฉัน', 409, 'signature_required', { accountUrl: '/account' }],
    ['signature_evidence_standard_required', 'ยังไม่มีมาตรฐานเอกสารที่เผยแพร่ กรุณาติดต่อผู้ดูแลระบบ', 409, 'document_standard_required', {}],
    ['signature_evidence_standard_missing', 'มาตรฐานเอกสารที่เผยแพร่ไม่สมบูรณ์ กรุณาติดต่อผู้ดูแลระบบ', 409, 'document_standard_required', {}],
    ['signature_evidence_approval_stale', 'เอกสารถูกแก้ไขจากอีกหน้าต่าง กรุณาโหลดข้อมูลล่าสุดแล้วตรวจอีกครั้ง', 409, 'approval_stale', {}],
    ['signature_evidence_approval_state_invalid', 'สถานะอนุมัติเปลี่ยนแล้ว กรุณาโหลดข้อมูลล่าสุด', 409, 'approval_state_changed', {}],
    ['signature_evidence_separation_required', 'อนุมัติ Sale Order ที่ตัวเองสร้างหรือยื่นไม่ได้', 403, 'separation_of_duty', {}],
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

async function approveWithEvidence(supabase, rpc, params) {
  const { data, error } = await supabase.rpc(rpc, params);
  if (error) throw signatureEvidenceRpcError(error);
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
  });
}

export function signatureEvidenceErrorResponse(error) {
  const mapped = error instanceof SignatureEvidenceError ? error : signatureEvidenceRpcError(error);
  return Response.json({ error: mapped.message, code: mapped.code, ...mapped.extra }, { status: mapped.status });
}
