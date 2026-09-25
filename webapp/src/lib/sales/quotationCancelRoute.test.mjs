// ── ยกเลิกใบเสนอราคา: รูปของ route/จอ ที่เทสต์หน่วยมองไม่เห็น (มติเจ้าของ 24/09) ────────────
//
// ⚠️ รีโปนี้ไม่มี React renderer และ route ต่อฐานจริง (dev DB = prod DB) ⇒ ล็อก "รูปของโค้ด" ที่นี่:
//   · ประตูเข้าใบต้องเป็น `loadScoped(...,'edit')` — ห้ามโหลดใบเอง (systemRules กฎ 6 รูดเพดานอยู่)
//   · ปุ่มบนจอกับด่านที่ server ต้องมาจาก `canCancelQuotation` ตัวเดียว (บทเรียน IS-26080011:
//     กติกาเดียวกันเขียนสองที่ = ปุ่มโชว์บนใบที่ API ตีกลับ)
//   · พรีวิว (?dryRun=1) ต้องผ่านด่านเดียวกับตอนกดจริง ไม่ใช่ประตูหลังที่ใครก็อ่านผลกระทบได้
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(join(SRC, rel), 'utf8');
const strip = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const ROUTE = 'app/api/sales-planning/quotations/[id]/cancel/route.js';

test('route ยกเลิกใบ: เข้าใบผ่าน loadScoped โหมดแก้ · ไม่โหลดใบเอง', () => {
  const route = strip(read(ROUTE));
  assert.match(route, /loadScoped\(supabase, 'quotations', id, user, 'edit'\)/);
  assert.doesNotMatch(route, /from\(\s*['"]quotations['"]\s*\)/, 'ห้ามแตะตาราง quotations ตรง ๆ ใน route — เขียนผ่าน quotationCancelRepo');
  assert.match(route, /canEditSalesPlanning\(user\)/);
});

test('route ยกเลิกใบ: ด่านผู้อนุมัติมาก่อนพรีวิว และมาจาก canCancelQuotation ตัวเดียวกับจอ', () => {
  const route = strip(read(ROUTE));
  const gate = route.indexOf('canCancelQuotation(');
  const approver = route.indexOf('canApproveQuotation(user, quote.deal)');
  const dryRun = route.indexOf('isDryRun(req)');
  const preview = route.indexOf('previewQuotationCancel(');
  const write = route.indexOf('cancelQuotation(supabase');
  assert.ok(approver > 0 && gate > approver, 'ผู้อนุมัติ = canApproveQuotation (เจ้าของดีล + ผู้มีอำนาจตัดสิน)');
  assert.ok(dryRun > gate, 'พรีวิวต้องอยู่หลังด่าน');
  assert.ok(preview > gate && write > preview);
  assert.match(route, /resolveExpectedUpdatedAt\(body\)/, 'ด่านกันชนกันต้องใช้เวอร์ชันจากจอ');
  assert.match(route, /unacceptReasonError\(body\.reason\)/, 'เหตุผลบังคับ 10–500 ตัวอักษร เกณฑ์เดียวกับย้อนการรับ');
});

test('GET ใบ: ส่ง canCancel + hasSignatureEvidence ที่ server คิด · DELETE ชี้ทาง "ยกเลิกใบ" ให้คนที่ยกเลิกได้', () => {
  const route = strip(read('app/api/sales-planning/quotations/[id]/route.js'));
  assert.match(route, /canCancel: canCancelQuotation\(/);
  assert.match(route, /hasSignatureEvidence/);
  assert.match(route, /ยกเลิกใบ/);
});

test('ฉบับตรึงล่าสุด (HTML + PDF) ถามด่านเดียวกัน — ใบยกเลิกต้องไม่พิมพ์ออกมาสะอาด', () => {
  for (const rel of [
    'app/api/sales-planning/quotations/[id]/issued/route.js',
    'app/api/sales-planning/quotations/[id]/issued/pdf/route.js',
  ]) {
    const route = strip(read(rel));
    assert.match(route, /issuedLatestRenderBlock\(quote\)/, rel);
    assert.doesNotMatch(route, /render === 'latest' && quote\.approvalStatus !== 'approved'/, `${rel}: ด่านเดิมต้องย้ายไปอยู่ใน lib`);
  }
});

test('จอใบเสนอราคา: ปุ่มยกเลิกใบโชว์ตาม canCancel ของ server · ใบยกเลิกซ่อนออกสัญญา/ดาวน์โหลด PDF', () => {
  const page = read('app/sales-planning/quotations/[id]/page.js');
  assert.match(page, /id: "cancel",\s*\n\s*kind: "cancel"/);
  assert.match(page, /visible: !!quote\?\.canCancel && !editMode/);
  assert.match(page, /\/cancel\?dryRun=1/);
  assert.match(page, /quotationCancelPromptDetail\(/);
  // ⚠️ ใบที่รออนุมัติแล้วถูกยกเลิกยังถือ approvalStatus='pending' ⇒ ทุกกิ่งที่อ่าน approvalStatus ต้องดู status ก่อน
  assert.match(page, /const isCancelled = quote\?\.status === "cancelled";/);
  assert.match(page, /const awaitingApproval = !!quote && !isCancelled && quote\.approvalStatus === "pending";/);
  assert.match(page, /const needsSubmit = !!quote && !isCancelled && quote\.approvalStatus === "not_submitted";/);
  assert.match(page, /visible: quote\?\.approvalStatus === "approved" && !isCancelled && !editMode && canEditCap/);
  assert.match(page, /visible: quote\?\.approvalStatus === "approved" && !isCancelled && !editMode,/);
});

test('แถวเธรดคำร้องที่ยิงตอนยกเลิกใบ ประกาศในทะเบียนชนิดของคำร้อง (quiet — กระดิ่งยิงแยก)', async () => {
  const { UPDATE_KINDS, isQuietUpdateKind } = await import('../master/updateTypes.js');
  assert.ok(UPDATE_KINDS.dept_request.quotation_cancelled);
  assert.equal(isQuietUpdateKind('dept_request', 'quotation_cancelled'), true);
});
