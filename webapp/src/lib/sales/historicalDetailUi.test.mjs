// ── ยามของหน้าใบสั่งขาย (รายละเอียด) เมื่อใบเป็นใบย้อนหลัง (มติ 22/09 · mig 0374) ─────────────────
//
// 🔴 **นี่คือยาม source ไม่ใช่เทสต์พฤติกรรม** — ทุกข้ออ่าน source เป็นสตริงแล้วจับด้วย regex
//    รีโปนี้ไม่มีตัวเรนเดอร์ React ในชุดเทสต์ ⇒ ตรรกะของคำ/ราง/โมดัลถูกยกไปอยู่ที่
//    `historicalOrderCopy.js` (ของจริง เรียกฟังก์ชันตรง ๆ ใน historicalOrderCopy.test.mjs)
//    ที่เหลือใน JSX เหลือแค่กิ่ง ซึ่งยามแบบนี้พอเฝ้าไหว
//
// ⭐ หกข้อนี้พังเงียบได้ทั้งหมด ไม่มี error ไม่มีจอแดง:
//   1. ปุ่มอนุมัติกลับไปเป็น "อนุมัติและนับ Actual" ⇒ AE Sup รับรองสิ่งที่ไม่เป็นความจริง
//   2. ส่งคำขออนุมัติโดยไม่มี `signedFileId`/`expectedUpdatedAt` ⇒ RPC ตอบ 400 ที่ไม่มีใครเข้าใจ
//      (หรือแย่กว่า: ฐานเลือกไฟล์ที่ AE Sup ไม่ได้ดูมาเป็นหลักฐานลงนาม — D4)
//   3. Admin Override ของใบย้อนหลังหลุดไปเปิดโมดัลมือของใบ pipeline (ไม่บอกผล · ไม่ส่งเวอร์ชันของใบ)
//   4. ปุ่ม "แก้ไข" เปิดโหมดแก้ในหน้านี้ (แก้ได้แค่หมายเหตุ) แทนฟอร์มคีย์ใบหน้าเต็ม
//   5. การ์ด/ป้ายของใบปกติ (ยืนยันคำสั่งซื้อ · ชวนตั้งลายเซ็น · ออกสัญญาจากใบนี้) โผล่กับใบที่ไม่มีของพวกนั้น
//   6. โมดัลยกเลิก/ลบไม่บอกว่าเอกสารแทนสัญญาถูกยกเลิกตามไปด้วย (trigger ของ 0374 · ย้อนไม่ได้)
//   7. เหตุที่ API ตีกลับไปโผล่ใน **แถบ error ของหน้า ซึ่งอยู่ใต้โมดัล** ⇒ กดยืนยันแล้วโมดัลค้างเงียบ
//      (ทางแก้หลังอนุมัติของ flow นี้คือ "ผู้จัดการฝ่ายขายยกเลิกใบ" — งวดปกติที่มีเงินยังบล็อก · มติ 24/09)
//   8. โมดัลยกเลิกของใบย้อนหลังพูดเรื่อง "ยอด Actual ถูกนำออก" ของใบปกติ ⇒ ผู้จัดการไม่รู้ว่างวดยกมาที่บัญชีรับรองไว้
//      จะเป็นโมฆะ · หมายเหตุบังคับของงวดยกมาที่รับรองแล้วไม่ได้ถามก่อนส่ง (มติ 24/09 · mig 0387)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { historicalApprovalPrompt } from '../approvalPrompt.js';
import { historicalOverrideNote } from './historicalOrderCopy.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../..');
/* ตัดคอมเมนต์โดยคงจำนวนบรรทัด — ตัวอย่างในคอมเมนต์ต้องไม่ทำให้ยามผ่านเอง */
const code = (rel) => readFileSync(join(SRC, rel), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const PAGE = 'app/sales-planning/sales-orders/[id]/page.js';
const ZONES_CARD = 'components/salesPlanning/HistoricalZonesCard.js';
const CONTRACT_CARD = 'components/salesPlanning/ServiceContractCard.js';

function slice(text, from, to) {
  const start = text.indexOf(from);
  assert.ok(start >= 0, `หา "${from}" ไม่เจอใน source`);
  const end = to ? text.indexOf(to, start + from.length) : -1;
  return text.slice(start, end < 0 ? undefined : end);
}

// ── 1. ป้ายปุ่มอนุมัติ ────────────────────────────────────────────────────────────

test('ปุ่มอนุมัติของใบย้อนหลังเขียนว่า "อนุมัติใบย้อนหลัง" — ป้ายเดียวกับที่ historicalApprovalPrompt คืน', () => {
  const prompt = historicalApprovalPrompt({ subject: 'ใบสั่งขาย SO-1', effects: ['x'] });
  assert.equal(prompt.confirmLabel, 'อนุมัติใบย้อนหลัง');
  const page = code(PAGE);
  assert.match(page, /label: "อนุมัติใบย้อนหลัง"/);
  // โมดัลไม่ได้ประกอบด้วยมือ — มาจากตัวสร้างกลางที่เติม "ไม่นับ Actual" ท้าย effects ให้เสมอ
  assert.match(page, /historicalApprovalPrompt\(\{ \.\.\.facts, override: override \? \{ note: historicalOverrideNote \} : null \}\)/);
  assert.ok(historicalOverrideNote.length > 20);
});

test('🔴 "อนุมัติและนับ Actual" เป็นของใบ pipeline เท่านั้น — กิ่งของใบย้อนหลังต้องมาก่อน', () => {
  const page = code(PAGE);
  const historicalBranch = page.indexOf('historical && canReviewThis && order.status === "pending_approval"');
  const pipelineBranch = page.indexOf('label: "อนุมัติและนับ Actual"');
  assert.ok(historicalBranch > 0, 'ไม่มีกิ่งของใบย้อนหลังในปุ่มหลัก');
  assert.ok(pipelineBranch > historicalBranch, 'กิ่งใบย้อนหลังต้องมาก่อนกิ่งของใบปกติ ไม่งั้นใบย้อนหลังได้ป้ายผิด');
  // ตัวสร้างโมดัลของใบปกติ (approvalPrompt ตรง ๆ) ต้องไม่ถูกเรียกในเส้นของใบย้อนหลัง
  const opener = slice(page, 'const openHistoricalApprove', '\n  const primaryAction');
  assert.doesNotMatch(opener, /approvalPrompt\(\{/);
  assert.doesNotMatch(opener, /Actual/);
});

// ── 2. ทุกจุดที่ยิง approve ของใบย้อนหลังส่งเวอร์ชันของใบ + ไฟล์ที่ตรวจแล้ว ────────────────────

test('🔴 approve ของใบย้อนหลังส่ง expectedUpdatedAt + signedFileId ทั้งปุ่มหลักและ Admin Override', () => {
  const page = code(PAGE);
  const opener = slice(page, 'const openHistoricalApprove', '\n  const primaryAction');
  // จุดยิงเดียวกันทั้งสองปุ่ม (override เป็นแค่พารามิเตอร์) ⇒ ลืมไม่ได้ทีละทาง
  assert.match(opener, /action: \(\) => requestAction\("approve", \{[\s\S]*expectedUpdatedAt: order\.updatedAt,[\s\S]*signedFileId: signedFileCandidate\?\.id,/);
  assert.match(opener, /\.\.\.\(override \? \{ overrideReason: overrideReasonRef\.current \} : \{\}\)/);
  assert.equal((opener.match(/requestAction\("approve"/g) || []).length, 1, 'ต้องมีจุดยิงเดียว');
  // ไฟล์ที่ผูกเป็นหลักฐานลงนาม = ไฟล์ที่โมดัลโชว์ (`signedFileCandidate` จาก loadHistoricalOrderExtras)
  assert.match(page, /const signedFileCandidate = contractFiles\.find\(\(file\) => file\.signedFileCandidate\) \|\| null;/);
  // ไม่มีไฟล์ = ปุ่มกดไม่ได้ พร้อมเหตุ (ไม่ใช่ปล่อยให้ยิงแล้วได้ 400 จากฐาน)
  assert.match(page, /disabledReason: historicalApproveBlocked \|\| undefined/);
  assert.match(page, /const historicalApproveBlocked = signedFileCandidate/);
});

test('Admin Override ของใบย้อนหลังไม่เปิดโมดัลมือของใบ pipeline', () => {
  const page = code(PAGE);
  assert.match(page, /onClick: \(\) => \(historical \? openHistoricalApprove\(true\) : setOverrideForm\(\{ reason: "" \}\)\)/);
  /* โมดัลมือของใบ pipeline ยังอยู่ครบ (ไม่แตะ) แต่ต้องไม่มีทางเปิดจากใบย้อนหลัง —
     approveWithAdminOverride ไม่ส่ง expectedUpdatedAt/signedFileId เลยสักตัว */
  const legacy = slice(page, 'async function approveWithAdminOverride', '\n  }');
  assert.doesNotMatch(legacy, /signedFileId|expectedUpdatedAt/);
});

test('ConfirmDialog ได้ confirmState.children (ลิงก์ไฟล์) + ช่องเหตุผล Override ที่ไม่บังคับ', () => {
  const page = code(PAGE);
  const dialog = slice(page, '<ConfirmDialog', '</ConfirmDialog>');
  assert.match(dialog, /\{confirmState\?\.children\}/);
  assert.match(dialog, /confirmState\?\.overrideReason \? \(/);
  /* 🐞 เหตุที่ RPC ตีกลับต้องอ่านได้ **ในโมดัลที่ยังเปิดอยู่** — แถบ error ของหน้าอยู่ใต้โมดัล */
  assert.match(dialog, /error=\{confirmState\?\.showsError \? error : undefined\}/);
  assert.match(page, /showsError: true,/);
  // ลิงก์ของโมดัล: ไฟล์เอกสารแทนสัญญา (รายไฟล์แนบ) + หลักฐานงวดยกมา (รายงวด/ดัชนี)
  const opener = slice(page, 'const openHistoricalApprove', '\n  const primaryAction');
  assert.match(opener, /\/api\/master\/attachments\/\$\{signedFileCandidate\.id\}\/file/);
  assert.match(opener, /\/payment-file\?installment=\$\{encodeURIComponent\(ref\.installmentId\)\}&i=\$\{ref\.index\}/);
});

// ── 3. ฟอร์มแก้ = ฟอร์มคีย์ใบหน้าเต็ม ────────────────────────────────────────────────

test('ปุ่มหลักของใบย้อนหลังร่าง/ตีกลับ = ลิงก์ไปฟอร์มคีย์ใบ ไม่ใช่โหมดแก้ในหน้านี้', () => {
  const page = code(PAGE);
  assert.match(page, /label: "แก้ไขและส่งอนุมัติ",\s*\n\s*href: historicalEditPath\(order\.id\),/);
  // โหมดแก้ในหน้านี้ปิดกับใบย้อนหลัง ⇒ ปุ่ม "แก้ไขข้อมูล" ในกลุ่มปุ่มรองหายไปเอง (visible: canEditDocument …)
  assert.match(page, /const canEditDocument = canEdit && !historical && \["draft", "rejected"\]\.includes\(order\.status\);/);
  assert.match(page, /const canEditHistorical = canEdit && historical && HISTORICAL_EDITABLE_STATUSES\.includes\(order\.status\);/);
  assert.match(page, /\{ id: "edit", kind: "edit",[^\n]*visible: canEditDocument && !editMode/);
});

test('ปุ่มออกสัญญาไม่ขึ้นกับใบย้อนหลัง — สัญญาของใบคือเอกสารแทนสัญญาที่อนุมัติพร้อมใบ', () => {
  const page = code(PAGE);
  // 25/09 ปุ่มย้ายจากการ์ดจัดการเข้าการ์ดสัญญาของดีลในแท็บ — ด่านเดิมย้ายตามมาเป็น canCreateContract
  assert.match(page, /const canCreateContract = canEdit && !historical &&/);
  // ใบย้อนหลังไม่มีการ์ดสัญญาของดีลเลย (ดีลภาชนะ ⇒ ลิสต์ทั้งดีลพาเอกสารแทนสัญญาของใบพี่น้องมาปน)
  assert.match(page, /\{showDealContracts \? \(\s*\n\s*<DealContractsCard/);
  assert.match(page, /const showDealContracts = !isHistoricalOrder\(order\);/);
});

// ── 4. ของใบปกติที่ต้องไม่โผล่ ────────────────────────────────────────────────────────

test('SignatureReadyNotice ปิดกับใบย้อนหลัง (ใบนี้ไม่เก็บลายเซ็นเลยสักขั้น)', () => {
  assert.match(code(PAGE), /<SignatureReadyNotice\s*\n\s*active=\{!historical && \(\(canReviewThis/);
});

test('การ์ด "ยืนยันคำสั่งซื้อ" ไม่เรนเดอร์กับใบย้อนหลัง · ด่านของมันก็ไม่ทำงาน', () => {
  const page = code(PAGE);
  assert.match(page, /\{historical \? null : \(\s*\n\s*<DetailCard\s*\n\s*icon=\{FileCheck2\}/);
  assert.match(page, /const confirmationGate = !historical && \["draft", "rejected"\]\.includes\(order\.status\)/);
});

// ── 5. ของใหม่ที่ต้องโผล่เฉพาะใบย้อนหลัง ──────────────────────────────────────────────

test('การ์ดโซน + การ์ดช่วงบริการ ขึ้นเฉพาะใบย้อนหลัง', () => {
  const page = code(PAGE);
  assert.match(page, /\{historical \? \(\s*\n\s*<HistoricalZonesCard/);
  // การ์ดช่วงบริการผูกกับ historicalCoverageSegments ซึ่งคืน null ให้ใบปกติเสมอ
  assert.match(page, /const historicalCoverage = historical\s*\n\s*\? historicalCoverageSegments\(installments, \{/);
  assert.match(page, /\{historicalCoverage \? \(\s*\n\s*<DetailCard/);
  assert.match(page, /<CoverageTimeline/);
});

test('รางก้าว + สถานะของใบย้อนหลังมาจาก historicalOrderCopy — ไม่ใช่ราง 4 ขั้นของใบปกติ', () => {
  const page = code(PAGE);
  assert.match(page, /const historicalRail = historical\s*\n\s*\? historicalWorkflowSteps\(order, installments, historicalProgress\.terms, historicalProgress\.plans, todayIso\)/);
  assert.match(page, /const workflowSteps = historicalRail\s*\n\s*\? workflowStepsFromIndex\(historicalRail\.steps, historicalRail\.index, order\.status === "cancelled"\)/);
  assert.match(page, /const historicalCopy = historical \? historicalStatusCopy\(order\.status\) : null;/);
});

test('ป้าย "ย้อนหลัง" + "ไม่นับ Actual" อยู่บนหัวใบ', () => {
  const page = code(PAGE);
  assert.match(page, /\{historical && <StatusBadge size="sm" tone="info" label="ย้อนหลัง" \/>\}/);
  assert.match(page, /\{historical && <StatusBadge size="sm" tone="neutral" label="ไม่นับ Actual" \/>\}/);
});

test('toast หลังอนุมัติใบย้อนหลังไม่พูดเรื่อง Actual ที่ไม่มี', () => {
  assert.match(code(PAGE), /action === "approve" && isHistoricalOrder\(order\)\s*\n\s*\? HISTORICAL_APPROVE_TOAST/);
});

// ── 6. ยกเลิก/ลบ = เอกสารแทนสัญญาถูกยกเลิกตาม ─────────────────────────────────────────

test('โมดัลยกเลิก · ลบฉบับร่าง · บังคับลบ บอกผลต่อเอกสารแทนสัญญา (trigger ของ 0374)', () => {
  const page = code(PAGE);
  assert.match(page, /const cancelContractEffect = historicalCancelEffect\(order, order\?\.serviceContract\);/);
  assert.match(page, /\{cancelContractEffect \? <StatusNotice tone="warning">\{cancelContractEffect\}<\/StatusNotice> : null\}/);
  const remove = slice(page, 'function remove()', '\n  }');
  assert.match(remove, /historicalCancelEffect\(order, order\?\.serviceContract\)/);
  const force = slice(page, 'async function forceRemove()', '\n  }');
  assert.match(force, /historicalCancelEffect\(order, order\?\.serviceContract\)/);
});

test('ตีกลับ/ดึงกลับ ใช้ถ้อยคำของใบย้อนหลัง (ไม่มียอดออกจากกอง "รออนุมัติ")', () => {
  const page = code(PAGE);
  assert.match(page, /detail=\{historical\s*\n\s*\? historicalRejectDetail\(order\)/);
  assert.match(page, /\|\| \(historical \? historicalWithdrawDetail\(order\)/);
});

// ── 6A. ยกเลิกใบ: ปุ่มถามด่านเดียวกับ API · เหตุที่ตีกลับอ่านได้ในโมดัล ──────────────────────────
//
// 🐞 ทางแก้หลังอนุมัติ (HISTORICAL_CORRECTION_PATH) = ผู้จัดการฝ่ายขายยกเลิกใบแล้วคีย์ใหม่ — เดิมใบที่มีเงิน
//    **ติดด่านเป็นค่าเริ่มต้น** (ขั้นอนุมัติดันงวดยกมาขึ้นเป็น "แจ้งชำระแล้ว") จนกว่าบัญชีจะตีกลับ
//    ⭐ มติ 24/09 (mig 0387): งวดยกมาไม่บล็อกแล้ว (โมฆะตามใบ) · งวดปกติที่รับเงินในระบบแล้ว/รอตรวจยังบล็อก
//    ⇒ ถ้าเหตุผลไม่ถึงคนกด ผู้จัดการยังวนหาทางไม่เจอ

test('🔴 ปุ่ม "ยกเลิก SO" ถามด่านตัวเดียวกับ API (historicalCancelBlock) ไม่ใช่ปล่อยให้กดแล้วได้ 400', () => {
  const page = code(PAGE);
  // ตัวตัดสินมาจากบ้านเดียวของใบย้อนหลัง — ห้ามเขียนเงื่อนไข "งวดมีเงิน" ขึ้นใหม่ที่จอ
  assert.match(page, /historicalCancelBlock, historicalCancelNoteError, historicalEditPath, historicalRefsOf, isHistoricalOrder,/);
  assert.match(page, /const historicalCancelBlocked = historicalCancelBlock\(order, installments\);/);
  const action = slice(page, 'id: "cancel",', 'onClick: openCancel');
  assert.match(action, /disabled: !!filingState\.filing \|\| !!historicalCancelBlocked,/);
  assert.match(action, /\(historicalCancelBlocked \|\| undefined\)/, 'เหตุต้องขึ้นบนปุ่มด้วย ไม่ใช่แค่ปิดปุ่ม');
});

/* ⭐ โมดัลยกเลิกของใบย้อนหลัง (มติ 24/09) — หัว · คำนำ · ผลลัพธ์ · ป้ายหมายเหตุ · ปุ่ม มาจาก historicalCancelPrompt ตัวเดียว
   (ของจริงเทสต์ที่ historicalOrderCopy.test.mjs) · หมายเหตุบังคับถามตัวเดียวกับ route (historicalCancelNoteError) ก่อนส่ง */
test('🔴 โมดัลยกเลิกใบย้อนหลัง: คำของใบย้อนหลังทั้งชุด (ไม่ใช่ "ยอด Actual ถูกนำออก") · หมายเหตุบังคับถามก่อนส่ง', () => {
  const page = code(PAGE);
  assert.match(page, /const historicalCancel = historical\s*\? historicalCancelPrompt\(order, \{ installments, reasonCode: cancelForm\?\.code \}\)\s*: null;/);
  assert.match(page, /const cancelMoneyLines = historicalCancel\s*\? historicalCancel\.money\s*: salesOrderMoneyOutcome\(order, installments, "cancel"\);/);
  const modal = slice(page, '{cancelForm && (', '</Modal>');
  assert.match(modal, /title=\{historicalCancel\?\.title \|\| "ยกเลิก ใบสั่งขาย"\}/);
  assert.match(modal, /\{historicalCancel\s*\? historicalCancel\.lead/);
  assert.match(modal, /historicalCancel\?\.notices\?\.length/);
  assert.match(modal, /historicalCancel \? historicalCancel\.noteLabel :/);
  assert.match(modal, /\{historicalCancel\?\.confirmLabel \|\| "ยืนยันยกเลิก SO"\}/);
  const submit = slice(page, 'async function doCancel() {', '\n  }');
  const noteGate = submit.indexOf('historicalCancelNoteError(order, order?.installments, cancelForm.note)');
  assert.ok(noteGate > 0 && noteGate < submit.indexOf('requestAction("cancel"'), 'ถามก่อนส่ง — ตัวเดียวกับ route');
  // toast บอกสิ่งที่เกิดจริงของใบย้อนหลัง (ไม่ใช่ "คำนวณ Actual ใหม่แล้ว")
  const request = slice(page, 'async function requestAction(action, payload = {}) {', '\n  }\n');
  assert.match(request, /action === "cancel" && isHistoricalOrder\(order\)\s*\? historicalCancelToast\(data\)/);
});

test('🔴 โมดัลยกเลิก SO โชว์เหตุที่ API ตีกลับ **ในโมดัล** (แถบของหน้าอยู่ใต้โมดัล) · เปิด/ปิดล้างของรอบก่อน', () => {
  const page = code(PAGE);
  const modal = slice(page, '{cancelForm && (', '</Modal>');
  assert.match(modal, /\{error \? <StatusNotice tone="error">\{error\}<\/StatusNotice> : null\}/);
  // ปิดโมดัลทางเดียว (กากบาท + ปุ่มยกเลิก) ผ่านตัวที่ล้าง error ทิ้งด้วย — ไม่งั้นข้อความเก่าค้างบนหน้า
  assert.match(modal, /onClose=\{closeCancel\}/);
  assert.match(modal, /onClick=\{closeCancel\}/);
  assert.doesNotMatch(modal, /setCancelForm\(null\)/);
  const opener = slice(page, 'const openCancel = () => {', '};');
  assert.match(opener, /setError\(""\);/);
  const closer = slice(page, 'const closeCancel = () => {', '};');
  assert.match(closer, /setCancelForm\(null\);/);
  assert.match(closer, /setError\(""\);/);
});

test('🔴 โมดัลอื่นของใบย้อนหลัง (ตีกลับ · ดึงกลับ · ลบ/บังคับลบ) ก็ต้องโชว์เหตุที่ API ตีกลับในโมดัล', () => {
  const page = code(PAGE);
  const dialogs = page.match(/<ReasonDialog[\s\S]*?\n {6}\/>/g) || [];
  assert.equal(dialogs.length, 2, 'หน้านี้มีโมดัลเหตุผลสองตัว (ตีกลับ · ดึงกลับ/ย้อนการอนุมัติ)');
  for (const dialog of dialogs) assert.match(dialog, /submitError=\{error\}/);
  // โมดัลลบใช้ ConfirmDialog ตัวเดียวกับโมดัลอนุมัติ ⇒ ต้องเปิดธง showsError เองรายใบ
  const remove = slice(page, 'function remove() {', '\n  }');
  assert.match(remove, /showsError: true,/);
  const force = slice(page, 'async function forceRemove() {', '\n  }');
  assert.match(force, /showsError: true,/);
});

/* 🐞 **โมดัลยืนยันทุกตัวของหน้านี้ต้องโชว์เหตุที่ API ตีกลับ แล้วล้างของรอบก่อนตอนเปิด** —
   `ConfirmDialog` ตัวเดียวของหน้านี้ท่อ error ของหน้าเข้าไปเมื่อ `showsError: true` เท่านั้น และแถบ
   error ของหน้าอยู่บนสุดของคอลัมน์ ⇒ **โมดัลบังไว้หมด** · ตัวที่ไม่ตั้งธง = ผู้ใช้กดยืนยันแล้วโมดัล
   ค้างเฉย ๆ ไม่มีอะไรบอกว่าทำไม (`runConfirmed` ไม่ปิดโมดัลเมื่อ action คืน false)
   ⇒ ตัวที่ตั้งธงแล้วไม่ล้าง จะพาข้อความค้างจากคำขออื่น (แผงงวดชำระบันทึกไม่ผ่าน ·
   set_service_contract ได้ 409) ไปขึ้นในกล่องยืนยัน **ก่อนกดด้วยซ้ำ** อ่านเหมือนว่าครั้งนี้ล้มเหลว
   ⚠️ **ยามนี้กันตัวเปิดใหม่ที่ข้ามกฎ** — เทียบจำนวน `setConfirmState({` กับจำนวนธง ⇒ เพิ่มโมดัล
     ใหม่โดยไม่ตั้งธง/ไม่ล้าง error จะแดงทันที ไม่ใช่หลุดเงียบเหมือนสี่ตัวที่เพิ่งตามเก็บ
     (ยื่นอนุมัติ · อนุมัติและนับ Actual · ออก Rev. · ปิดใบสั่งขาย — ทั้งสี่เป็นของใบ pipeline
     ซึ่งรอบก่อนกวาดแต่เส้นใบย้อนหลัง) */
test('🔴 โมดัลยืนยันทุกตัวของหน้า SO โชว์ error ของหน้า (showsError) และล้างของรอบก่อนตอนเปิด', () => {
  const page = code(PAGE);
  const OPENERS = [
    ['function openSubmitConfirm() {', '\n  }'],
    ['if (action === "approve") {', '\n      return;'],
    ['function remove() {', '\n  }'],
    ['async function forceRemove() {', '\n  }'],
    ['const openHistoricalApprove = (override = false) => {', '\n  };'],
    ['{ id: "revise", kind: "revise"', '\n      } }'],
    ['id: "finance-approve"', '\n    },'],
  ];
  /* ทั้งสองฝั่งต้องเท่ากับจำนวนตัวเปิดในลิสต์ — ฝั่งซ้ายกันตัวเปิดใหม่ที่ไม่ตั้งธงเลย
     ฝั่งขวากันตัวที่ตั้งธงแล้วไม่ถูกเติมเข้าลิสต์ (จะไม่มีใครตรวจ `setError("")` ของมัน) */
  assert.equal(
    (page.match(/setConfirmState\(\{/g) || []).length, OPENERS.length,
    'มีตัวเปิด ConfirmDialog เพิ่ม/ลด — โมดัลยืนยันของหน้านี้ต้องโชว์เหตุที่ API ตีกลับทุกตัว '
    + '(ตั้ง showsError: true + ล้าง error ตอนเปิด) แล้วเติมขอบเขตของมันในลิสต์นี้',
  );
  assert.equal(
    (page.match(/showsError: true,/g) || []).length, OPENERS.length,
    'มีโมดัลที่ตั้ง showsError เพิ่ม/ลด — เติมตัวเปิดของมันในลิสต์นี้ด้วย',
  );
  for (const [from, to] of OPENERS) {
    const opener = slice(page, from, to);
    assert.match(opener, /setConfirmState\(\{/, `${from} ไม่ใช่ตัวเปิดโมดัล — ขอบเขตในลิสต์เพี้ยนแล้ว`);
    assert.match(opener, /showsError: true,/,
      `${from} เปิดโมดัลยืนยันโดยไม่ท่อ error ของหน้าเข้าไป — API ตีกลับแล้วโมดัลค้างเงียบ`);
    assert.match(opener, /setError\(""\);/,
      `${from} เปิดโมดัลที่โชว์ error ของหน้าโดยไม่ล้างของรอบก่อน — ข้อความเก่าจะขึ้นในโมดัลใหม่`);
  }
});

// ── 7. การ์ดโซน + การ์ดสัญญา ─────────────────────────────────────────────────────────

test('การ์ดโซนไม่คิดสถานะเอง · ไม่มี inline style · ว่างเพราะโหลดไม่ขึ้นต้องดัง', () => {
  const card = code(ZONES_CARD);
  assert.match(card, /historicalZoneState\(order, zone, \{ plannedSiteIds, loading: loadingPlans \}\)/);
  assert.doesNotMatch(card, /style=\{\{/);
  assert.match(card, /<TableScroll family="editable" surface="embedded"/);
  assert.match(card, /extrasError \? "error" : "warning"/);
});

/* ⭐ มติเจ้าของ 23/09: บรรทัดของใบย้อนหลัง = บรรทัดของใบเสนอราคา ⇒ การ์ดโซนพูด "12 แพ็คเกจ" (จำนวน + หน่วยของ
   บรรทัด) ไม่ใช่ "N แพ็ค" ที่อ่านได้สองความหมาย (1 ชุด × 12 เดือน เคยถูกคีย์ทั้ง 1 และ 12) */
test('⭐ 23/09: การ์ดโซนพูดรายการ · จำนวน + หน่วย · รอบบริการที่ขายไว้ · จำนวนเงิน — ไม่มี "แพ็ค"', () => {
  const card = code(ZONES_CARD);
  const heads = [...slice(card, '<thead>', '</thead>').matchAll(/<th\b[^>]*>([^<]+)<\/th>/g)].map((m) => m[1].trim());
  assert.deepEqual(heads, ['ไซต์ · โซน', 'รายการ', 'จำนวน', 'รอบบริการที่ขายไว้', 'จำนวนเงิน', 'สถานะรอบ']);
  assert.doesNotMatch(card, /packs|แพ็ค/);
  assert.match(card, /const unit = zone\.unit \|\| line\?\.unit \|\| "";/, 'หน่วยมาจากบรรทัด (ของเสริมก่อน แล้วถอยไปที่บรรทัดของใบ)');
  assert.match(card, /`\$\{fmtNumber\(zones\.length\)\} โซน — /, 'บรรทัดหัวนับโซน ไม่นับแพ็ค');
  /* ตารางรายการของหน้าใบบอกไซต์ · โซนของแต่ละบรรทัด (บรรทัดของสี่โซนหน้าตาเหมือนกันทุกช่อง) */
  assert.match(code(PAGE), /showInstallationPoint=\{historical\}/);
});

test('การ์ดสัญญาแสดง "เอกสารแทนสัญญา" ของใบย้อนหลังที่ยังไม่อนุมัติ (ร่างยังไม่มีเลข CT)', () => {
  const card = code(CONTRACT_CARD);
  assert.match(card, /const substituteDraft = isHistoricalOrder\(order\) && isSubstituteContract\(linked\) && linked\?\.status === "draft";/);
  assert.match(card, /externalDocKindLabel\(linked\.externalDocKind\)/);
  assert.match(card, /\/api\/master\/attachments\/\$\{file\.id\}\/file/);
  assert.match(card, /อนุมัติพร้อมใบนี้ตอน AE Sup อนุมัติ/);
  // ใบย้อนหลังที่ยังไม่อนุมัติและไม่มีเอกสารแทนสัญญา = ไม่เสนอลิสต์สัญญาของดีล (ด่านผูก/ถอดปิดอยู่)
  assert.match(card, /const historicalUnlinked = isHistoricalOrder\(order\) && order\?\.status !== "approved" && !linked;/);
  assert.doesNotMatch(card, /style=\{\{/);
});
