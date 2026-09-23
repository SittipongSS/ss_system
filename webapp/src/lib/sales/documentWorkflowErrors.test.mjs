import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  WORKFLOW_ERROR_CODES, documentWorkflowError, historicalDealWriteMessage, workflowErrorMessage,
} from './documentWorkflowErrors.js';

// error ที่ RPC ตีกลับ (mig 0164) โยนออกมา ต้องมีในตารางแปล ไม่ใช่ตกไปข้อความกลาง 500
test('QT rejection errors are translated, not swallowed by the generic 500', () => {
  assert.deepEqual(documentWorkflowError(new Error('quotation_reject_forbidden')), {
    code: 'quotation_reject_forbidden',
    message: 'ตีกลับได้เฉพาะผู้อนุมัติของใบเสนอราคานี้',
    status: 403,
  });
  assert.deepEqual(documentWorkflowError({ message: 'P0001: quotation_reject_state_invalid' }), {
    code: 'quotation_reject_state_invalid',
    message: 'ตีกลับได้เฉพาะใบเสนอราคาที่กำลังรออนุมัติ',
    status: 409,
  });
});

test('document workflow database errors become stable Thai HTTP responses', () => {
  assert.deepEqual(
    documentWorkflowError(new Error('quotation_withdraw_forbidden')),
    {
      code: 'quotation_withdraw_forbidden',
      message: 'ดึงกลับได้เฉพาะผู้ยื่นเอกสารเอง',
      status: 403,
    },
  );
  const filingBlocked = documentWorkflowError({ message: 'P0001: sales_order_revision_filing_exists' });
  assert.equal(filingBlocked.code, 'sales_order_revision_filing_exists');
  assert.equal(filingBlocked.status, 409);
  // ด่านนี้เด้งตั้งแต่ขั้น "ย้อนการอนุมัติ" (mig 0166) ไม่ใช่ขั้นออก Rev. — ข้อความจึงห้าม
  // พูดถึงแค่ Rev. และต้องบอกทางออก ไม่งั้นผู้ใช้วนหาปุ่มไม่เจอ (ทุกปุ่มถูกใบยื่นบล็อกหมด)
  assert.match(filingBlocked.message, /ใบยื่นชำระภาษี/);
  assert.match(filingBlocked.message, /ลบใบยื่น/);
});
// A3 (2026-07-26): error ที่ไม่รู้จักเคยส่งข้อความ Postgres ดิบออกหน้าเว็บ — ชื่อ constraint
// และค่าในแถวหลุดให้ผู้ใช้เห็น ตอนนี้ต้องเป็นข้อความกลาง + log ตัวจริงฝั่ง server
test('unknown document workflow errors stay generic and never leak Postgres detail', () => {
  const raw = 'insert or update on table "sales_orders" violates foreign key constraint '
    + '"sales_orders_supersededById_fkey" DETAIL: Key (id)=(SO-26070001) is still referenced.';
  const logged = [];
  const original = console.error;
  console.error = (...args) => logged.push(args);
  let result;
  try {
    result = documentWorkflowError(new Error(raw), { context: 'sales order revise' });
  } finally {
    console.error = original;
  }

  assert.equal(result.status, 500);
  assert.equal(result.code, undefined);
  assert.doesNotMatch(result.message, /constraint|fkey|sales_orders|SO-26070001/);
  assert.match(result.message, /ผู้ดูแลระบบ/);
  // ตัวจริงต้องไปโผล่ฝั่ง server ไม่ใช่หายไปเฉย ๆ
  assert.equal(logged.length, 1);
  assert.match(String(logged[0][0]), /sales order revise/);
  assert.equal(logged[0][1].message, raw);
});

// ── ใบสั่งขายย้อนหลัง (mig 0360) ─────────────────────────────────────────────────
// ⭐ ทุกรหัสที่ RPC/CHECK/trigger ของ 0360 โยน ต้องได้ข้อความไทย + สถานะที่ถูก ไม่ใช่ 500 กลาง
test('รหัสของใบสั่งขายย้อนหลังแปลเป็นไทยพร้อมสถานะ', () => {
  const expected = {
    historical_so_actor_forbidden: 403,
    historical_so_intake_key_required: 400,
    historical_so_intake_hash_invalid: 400,
    historical_so_header_invalid: 400,
    historical_so_intake_key_conflict: 409,
    historical_so_customer_required: 400,
    historical_so_owner_required: 400,
    historical_so_team_required: 400,
    historical_so_order_date_invalid: 400,
    historical_so_money_invalid: 400,
    historical_so_money_mismatch: 400,
    historical_so_lines_required: 400,
    historical_so_line_invalid: 400,
    historical_so_installment_invalid: 400,
    historical_so_installment_status_invalid: 400,
    historical_so_installment_over_total: 400,
    historical_so_zero_value_needs_exemption: 400,
    historical_so_zero_value_note_required: 400,
    historical_so_exempt_reason_invalid: 400,
    historical_so_customer_not_found: 404,
    historical_so_customer_inactive: 409,
    historical_so_deal_invalid: 409,
    historical_so_installment_append_state_invalid: 409,
    historical_so_container_deal_race: 409,
    historical_so_deal_payload_required: 500,
    historical_so_deal_origin_dropped: 503,
    sales_orders_origin_shape: 409,
    sales_orders_historical_refs_len: 400,
    sales_orders_historical_intake_hash_format: 400,
    sales_orders_payment_gate_exempt_sane: 400,
    sales_order_lines_installation_point_len: 400,
    sales_deals_historical_shape: 409,
    sales_order_installments_covers_range: 400,
    sales_order_installments_dates_sane: 400,
    origin_immutable: 409,
    sales_order_yearly_sequence_exhausted: 409,
    // ── mig 0374 (AE Sup อนุมัติ · โซนจากทะเบียน · งวดยกมา · เอกสารแทนสัญญาในใบ) ──
    historical_so_zone_invalid: 400,
    historical_so_zone_duplicate: 400,
    historical_so_line_not_package: 400,
    historical_so_contract_invalid: 400,
    historical_so_contract_state_invalid: 409,
    historical_so_contract_file_missing: 409,
    historical_so_signed_file_invalid: 409,
    historical_so_opening_invalid: 400,
    historical_so_opening_evidence_missing: 409,
    historical_so_installment_sum_mismatch: 400,
    historical_so_coverage_broken: 400,
    historical_so_zero_value_has_installments: 400,
    historical_so_edit_state_invalid: 409,
    historical_so_owner_locked: 409,
    historical_so_submit_state_invalid: 409,
    historical_so_approve_forbidden: 403,
    historical_so_approve_state_invalid: 409,
    historical_so_self_approval: 403,
    historical_so_approval_note_invalid: 400,
    historical_so_reopen_forbidden: 409,
    historical_so_not_found: 404,
    contract_already_issued: 409,
    contract_not_draft: 409,
    contract_monthly_sequence_exhausted: 409,
    sales_order_installments_kind_check: 400,
    sales_order_installments_opening_shape: 400,
    sales_order_installments_opening_uk: 409,
    sales_contracts_external_kind: 400,
    mig_0374_old_historical_rows_exist: 409,
  };
  for (const [code, status] of Object.entries(expected)) {
    const mapped = documentWorkflowError({ message: `P0001: ${code}` });
    assert.equal(mapped.code, code, code);
    assert.equal(mapped.status, status, code);
    assert.match(mapped.message, /[\u0E00-\u0E7F]/, `${code} ต้องเป็นข้อความไทย`);
  }
});

test('ทุกรหัสที่ 0360 โยนมีในตารางแปล (อ่านไฟล์ migration ตรง ๆ)', () => {
  const sql = readFileSync(new URL('../../../supabase/migrations/0360_sales_order_historical_origin.sql', import.meta.url), 'utf8')
    .replace(/--[^\n]*/g, '');
  const raised = new Set([...sql.matchAll(/RAISE EXCEPTION '([a-z_]+)(?::[^']*)?'/g)].map((m) => m[1]));
  const constraints = new Set([...sql.matchAll(/CONSTRAINT ([a-z_]+)/g)].map((m) => m[1]));
  assert.ok(raised.size >= 20, 'ต้องหา RAISE ของ 0360 เจอ');
  for (const code of [...raised, ...constraints].filter((c) => c !== 'sales_orders_origin_check' && c !== 'sales_deals_origin_check')) {
    assert.ok(WORKFLOW_ERROR_CODES.includes(code), `${code} ยังไม่มีข้อความไทย`);
  }
});

/* 0374 โยนรหัสสามทาง: RAISE ของ RPC/ตัวตรวจ/trigger · CHECK/UNIQUE ที่ไฟล์นั้นประกาศ · รหัสที่ trigger ต่อท้ายเลขใบ
   (`historical_so_reopen_forbidden: SO-…`) — ทุกตัวต้องได้ข้อความไทย ไม่ใช่ 500 กลาง
   ⚠️ จับ [a-z0-9_] (รหัสด่านของไฟล์มีตัวเลข: mig_0374_…) และไม่บังคับให้ปิดด้วย ' ทันที (ด่านนั้นต่อคำอธิบายไทย) */
test('ทุกรหัสที่ 0374 โยนมีในตารางแปล (อ่านไฟล์ migration ตรง ๆ)', () => {
  const sql = readFileSync(new URL('../../../supabase/migrations/0374_historical_so_approval_flow.sql', import.meta.url), 'utf8')
    .replace(/--[^\n]*/g, '');
  const raised = new Set([...sql.matchAll(/RAISE EXCEPTION '([a-z0-9_]+)/g)].map((m) => m[1]));
  const constraints = new Set([...sql.matchAll(/ADD CONSTRAINT ([a-z0-9_]+)/g)].map((m) => m[1]));
  const indexes = new Set([...sql.matchAll(/CREATE UNIQUE INDEX ([a-z0-9_]+)/g)].map((m) => m[1]));
  assert.ok(raised.size >= 25, `ต้องหา RAISE ของ 0374 เจอ (เจอ ${raised.size})`);
  assert.ok(constraints.size >= 4 && indexes.size >= 1, 'ต้องหา CHECK/UNIQUE ของ 0374 เจอ');
  for (const code of [...raised, ...constraints, ...indexes]) {
    assert.ok(WORKFLOW_ERROR_CODES.includes(code), `${code} ยังไม่มีข้อความไทย`);
  }
  // trigger ต่อท้ายเลขใบ — ตัวแปลหาด้วย includes จึงยังจับได้
  assert.equal(documentWorkflowError({ message: 'historical_so_reopen_forbidden: SO-26090001-0' }).status, 409);
  // เลข CT เต็ม/ชนมาจาก approve_external_sales_contract (0322) ที่ขั้นอนุมัติเรียกต่อ
  assert.equal(documentWorkflowError({ message: 'contract_monthly_sequence_exhausted: -' }).code, 'contract_monthly_sequence_exhausted');
});

test('ข้อความของรหัสที่ 0374 เปลี่ยนความหมาย ไม่พูดถึงโมเดลเดิม', () => {
  // ฝ่ายขายทุกตำแหน่งคีย์ได้แล้ว · โมดัลถูกแทนด้วยหน้าฟอร์ม · บรรทัดคือโซนจากทะเบียน
  assert.match(workflowErrorMessage('historical_so_actor_forbidden'), /ฝ่ายขายและแอดมิน/);
  for (const code of ['historical_so_intake_key_required', 'historical_so_intake_hash_invalid', 'historical_so_header_invalid']) {
    assert.doesNotMatch(workflowErrorMessage(code), /โมดัล/, code);
  }
  assert.match(workflowErrorMessage('historical_so_line_invalid'), /โซน/);
  assert.doesNotMatch(workflowErrorMessage('historical_so_line_invalid'), /ไม่ระบุโซน/);
  assert.doesNotMatch(workflowErrorMessage('sales_orders_origin_shape'), /คืนเป็นร่าง/);
  // ทางออกของใบที่อนุมัติแล้วคือยกเลิกแล้วคีย์ใหม่ — ข้อความต้องบอกทางนี้
  assert.match(workflowErrorMessage('historical_so_reopen_forbidden'), /ยกเลิกแล้วคีย์ใหม่/);
});

test('CHECK ที่ฐานตีกลับดิบ ๆ (23514) ก็ยังแปลได้', () => {
  const raw = 'new row for relation "sales_orders" violates check constraint "sales_orders_origin_shape"';
  const mapped = documentWorkflowError({ code: '23514', message: raw });
  assert.equal(mapped.status, 409);
  assert.equal(mapped.code, 'sales_orders_origin_shape');
});

test('ไม่มีคีย์ไหนเป็นสตริงย่อยของอีกคีย์ — ตัวแปลหาด้วย includes ตามลำดับ', () => {
  for (const a of WORKFLOW_ERROR_CODES) {
    for (const b of WORKFLOW_ERROR_CODES) {
      if (a !== b) assert.ok(!b.includes(a), `${a} เป็นสตริงย่อยของ ${b}`);
    }
  }
});

test('ข้อความ "มีดีลของ AE คนนั้นอยู่แล้ว" เป็นของการย้ายเจ้าของดีลเท่านั้น — ตัวคีย์ใบไม่ได้ข้อความนี้', () => {
  assert.ok(!WORKFLOW_ERROR_CODES.includes('sales_deals_historical_container_uk'));
  const unique = { code: '23505', message: 'duplicate key value violates unique constraint "sales_deals_historical_container_uk"' };
  const [message, status] = historicalDealWriteMessage(unique);
  assert.equal(status, 409);
  assert.match(message, /อยู่แล้ว/);
  assert.deepEqual(
    historicalDealWriteMessage({ message: 'new row violates check constraint "sales_deals_historical_shape"' }),
    [workflowErrorMessage('sales_deals_historical_shape'), 409],
  );
  assert.equal(historicalDealWriteMessage({ message: 'origin_immutable: sales_deals DEAL-1' })[1], 409);
  assert.equal(historicalDealWriteMessage({ message: 'something else' }), null);
  assert.equal(workflowErrorMessage('historical_so_container_deal_race'), 'มีการย้ายเจ้าของดีลของลูกค้านี้พร้อมกัน กดบันทึกอีกครั้ง');
  assert.match(workflowErrorMessage('no_such_code'), /ผู้ดูแลระบบ/);
});

/* PR1 (mig 0376): RPC ออก Rev. ย้ายงวดทั้งแถว — Σ งวด ≠ ยอดใบ = RAISE ⇒ ต้องเป็นข้อความไทยที่บอกทางออก ไม่ใช่ 500 กลาง */
test('Σ งวด ≠ ยอดใบตอนออก Rev. (0376) แปลเป็นไทยพร้อมทางออก', () => {
  assert.deepEqual(documentWorkflowError({ message: 'P0001: sales_order_revision_installments_mismatch' }), {
    code: 'sales_order_revision_installments_mismatch',
    message: 'งวดชำระรวมไม่เท่ายอดใบ — ออก Rev. ไม่ได้ ให้แอดมินตรวจงวดก่อน',
    status: 409,
  });
});

/* review MONEY-1 / UI-5 (mig 0378): ด่านเงินของการยกเงินต้องบอกทางที่มีอยู่จริง — คืนเงินได้ทั้งงวดเท่านั้น (ไม่มีคืนบางส่วน)
   และยกซ้ำกับงวดที่แจ้ง/รับรองแล้วบนใบใหม่ = เงินก้อนเดียวนับสองครั้ง ⇒ ข้อความเดียวกับที่จอ (applyCarryIn) บอก */
test('ยกเงินเกินยอดใบ / ยกซ้ำกับงวดที่มีเงินของใบใหม่ (0378) แปลเป็นไทยพร้อมทางออกที่มีจริง', async () => {
  const { CARRY_DUPLICATE_WAY_OUT, CARRY_OVERPAID_WAY_OUT } = await import('./installmentCarry.js');
  const over = documentWorkflowError({ message: 'P0001: installment_carry_overpaid' });
  assert.equal(over.status, 400);
  assert.doesNotMatch(over.message, /ส่วนที่เกิน/, 'คืนบางส่วนไม่มีในระบบ');
  assert.ok(over.message.endsWith(CARRY_OVERPAID_WAY_OUT), over.message);
  const dup = documentWorkflowError({ message: 'P0001: installment_carry_duplicate' });
  assert.equal(dup.code, 'installment_carry_duplicate');
  assert.equal(dup.status, 409);
  assert.match(dup.message, /เงินก้อนเดียวกัน/);
  assert.ok(dup.message.endsWith(CARRY_DUPLICATE_WAY_OUT), dup.message);
});
