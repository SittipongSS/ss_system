import test from 'node:test';
import assert from 'node:assert/strict';
import {
  approveSalesOrderWithSignatureEvidence,
  signatureEvidenceRpcError,
} from './signatureEvidence.js';

test('missing active signature maps to an actionable account link', () => {
  const error = signatureEvidenceRpcError({ message: 'signature_evidence_signature_required' });
  assert.equal(error.status, 409);
  assert.equal(error.code, 'signature_required');
  assert.equal(error.extra.accountUrl, '/account');
});

test('stale and separation errors use safe status codes', () => {
  const stale = signatureEvidenceRpcError({ message: 'signature_evidence_approval_stale' });
  assert.equal(stale.status, 409);
  assert.equal(stale.code, 'approval_stale');

  const separation = signatureEvidenceRpcError({ message: 'signature_evidence_separation_required' });
  assert.equal(separation.status, 403);
  assert.equal(separation.code, 'separation_of_duty');
});

test('admin override validation errors are safe and actionable', () => {
  const required = signatureEvidenceRpcError({ message: 'signature_evidence_override_reason_required' });
  assert.equal(required.status, 400);
  assert.equal(required.code, 'override_reason_required');
  assert.match(required.message, /10–500/);

  const notApplicable = signatureEvidenceRpcError({ message: 'signature_evidence_override_not_applicable' });
  assert.equal(notApplicable.status, 400);
  assert.equal(notApplicable.code, 'override_not_applicable');
});

test('sales order evidence RPC receives the explicit separation override reason', async () => {
  let called;
  const supabase = {
    rpc: async (name, params) => {
      called = { name, params };
      return { data: { document: { id: 'SO-1' }, evidence: { id: 'DSE-1' } }, error: null };
    },
  };

  await approveSalesOrderWithSignatureEvidence(supabase, {
    documentId: 'SO-1',
    evidenceId: 'DSE-1',
    expectedUpdatedAt: '2026-07-20T00:00:00.000Z',
    documentFingerprint: `sha256:${'a'.repeat(64)}`,
    overrideReason: 'ยังไม่มีผู้ตรวจสอบคนที่สอง',
    user: { id: 'USR-1', name: 'Admin Info', role: 'admin', team: 'Admin' },
  });

  assert.equal(called.name, 'approve_sales_order_with_signature_evidence_atomic');
  assert.equal(called.params.p_separation_override_reason, 'ยังไม่มีผู้ตรวจสอบคนที่สอง');
});

test('unknown database details are not exposed', () => {
  const error = signatureEvidenceRpcError({ message: 'postgres internal relation detail' });
  assert.equal(error.status, 500);
  assert.equal(error.code, 'signature_evidence_failed');
  assert.equal(error.message.includes('postgres'), false);
});

/* ── งานบริการรายบรรทัด (mig 0392 P1): การอนุมัติใบสาย SERVICE ถอยทั้งก้อนเมื่องานบริการไม่ครบ ──────────
   🐞 ไม่แปลรหัส = ตกไปข้อความกลาง "บันทึกหลักฐานลายเซ็นไม่สำเร็จ" ซึ่งชี้ไปเรื่องลายเซ็นทั้งที่ไม่เกี่ยว */
test('service setup incomplete (0392 P1) maps to 409 with the DETAIL codes in extra.setupErrors', () => {
  const error = signatureEvidenceRpcError({
    message: 'sales_order_service_setup_incomplete',
    details: 'kind_missing:SOL-a, packs_missing:SOL-a:ZN-1,,period_missing',
  });
  assert.equal(error.status, 409);
  assert.equal(error.code, 'service_setup_incomplete');
  assert.match(error.message, /^อนุมัติไม่ได้ — งานบริการของใบนี้ไม่ครบ/);
  assert.deepEqual(error.extra.setupErrors, ['kind_missing:SOL-a', 'packs_missing:SOL-a:ZN-1', 'period_missing']);
  // ไม่มี DETAIL = ลิสต์ว่าง (route ยังตอบ 409 ด้วยข้อความรวม)
  assert.deepEqual(signatureEvidenceRpcError({ message: 'sales_order_service_setup_incomplete' }).extra.setupErrors, []);
});

test('legacy TS-bound terms (D29) map to 409 with the catalog text — not the signature fallback', () => {
  const error = signatureEvidenceRpcError({ message: 'service_setup_legacy_terms_exist' });
  assert.equal(error.status, 409);
  assert.equal(error.code, 'service_setup_legacy_terms_exist');
  assert.equal(error.message, 'ใบนี้มีรอบขายที่ TS ผูกไว้ด้วยทางเดิม — เปิดงานบริการทับไม่ได้ · แจ้งผู้ดูแลระบบ');
  assert.equal(error.extra.setupErrors, undefined, 'setupErrors ติดไปเฉพาะรหัส incomplete');
});

test('the service-setup incomplete text matches the shared SQL message table on the part the catalog pins', async () => {
  const { SERVICE_SETUP_SQL_MESSAGES } = await import('../sales/serviceSetup.js');
  const legacy = signatureEvidenceRpcError({ message: 'service_setup_legacy_terms_exist' });
  assert.equal(legacy.message, SERVICE_SETUP_SQL_MESSAGES.service_setup_legacy_terms_exist.message);
  assert.equal(legacy.status, SERVICE_SETUP_SQL_MESSAGES.service_setup_legacy_terms_exist.status);
});
