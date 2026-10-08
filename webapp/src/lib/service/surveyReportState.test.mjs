// ── สถานะของเอกสารประเมิน + แผนที่ข้อผิดพลาดของ RPC + ด่านตรวจกระดาษ (สเปก PR-2 §1 · §3 · §4) ─────────────
//
// ⭐ ล็อกสี่เรื่อง:
//   ① สถานะทั้งแปดอนุมานจากแถวล้วน — `stale` เทียบเป็นมิลลิวินาที · `issuing` ต้องมีสวิตช์ + เพิ่งส่งไม่เกิน 180 วิ
//   ② ข้อผิดพลาดของ RPC จับด้วยคำขึ้นต้นของข้อความ · `23505` ต้องอ่านซ้ำก่อนตัดสิน (สี่ทางออก)
//   ③ ผลวัดของ chromium: อะไรกันการตรึง อะไรแค่ลง log — ป้อนด้วย HTML ของตัวเรนเดอร์จริง + PDF ปลอมที่ `pdfInspect` นับได้
//   ④ 🔴 ยามกันรั่วของฉบับลูกค้า: รูปจุด · ชิ้นของฉบับภายใน (markup ของตัวเรนเดอร์) · จำนวนแผ่น — และไฟล์เดียวที่เป็นทั้งภาพกว้าง
//      กับรูปจุดต้องยังผ่าน · คำว่า "ฉบับภายใน" ในข้อความที่คนพิมพ์ต้องไม่ติด
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pdfFonts, pdfPageCount } from '../documents/pdfInspect.js';
import {
  renderSurveyReportHTML, resolveImageTokens, surveyReportImageShas, surveyReportImageToken,
} from './surveyReportDocument.js';
import { paginateSurveyReport } from './surveyReportLayout.js';
import { buildSurveyReportSnapshot } from './surveyReportSnapshot.js';
import {
  SURVEY_REPORT_FIT_MARGIN, SURVEY_REPORT_ISSUING_MS, SURVEY_REPORT_REASONS, SURVEY_REPORT_STATES,
  surveyReportCurrent, surveyReportCustomerHtmlIssues, surveyReportIsStale, surveyReportPaperIssues,
  surveyReportRpcConflict, surveyReportRpcError, surveyReportState,
} from './surveyReportState.js';
import { fakeSha, markedSurveyInputs, surveyReportInputsFromFixture, syntheticSurveyFixture } from './surveyReportTestKit.mjs';
import { surveyReportView } from './surveyReportView.js';

/* ── ของใช้ร่วม ───────────────────────────────────────────────────────── */

const ANSWERED = '2026-10-01T03:00:00.000+00:00';
const NOW = Date.parse(ANSWERED);
const request = (over = {}) => ({ id: 'DR-1', kind: 'site_survey', answeredAt: ANSWERED, ...over });
const report = (over = {}) => ({
  id: 'SVR-1', requestId: 'DR-1', docNo: 'SU-26100001-0', rev: 0, status: 'current',
  approvedAt: ANSWERED, frozenAt: null, customerPdfPath: null, internalPdfPath: null, ...over,
});
const superseded = (over = {}) => report({
  status: 'superseded', supersededAt: '2026-09-30T09:00:00+00:00', supersededReason: 'recall',
  approvedAt: '2026-09-29T02:00:00+00:00', ...over,
});

/* ══ ① สถานะ ═══════════════════════════════════════════════════════════ */

test('สถานะทั้งแปดของ §1 — อนุมานจากแถว', () => {
  const frozen = { frozenAt: '2026-10-01T03:01:00+00:00' };
  const cases = [
    ['not_sent', request({ answeredAt: null }), []],
    ['recalled', request({ answeredAt: null }), [superseded()]],
    ['issuing', request(), [], { now: NOW + 5_000, issueAtSend: true }],
    ['missing', request(), [], { now: NOW + 5_000, issueAtSend: false }],
    ['issued', request(), [report()]],
    ['frozen', request(), [report(frozen)]],
    ['frozen', request(), [report({ ...frozen, customerPdfPath: 'pdf/SVR-1/customer.pdf' })]],
    ['frozen', request(), [report({ ...frozen, internalPdfPath: 'pdf/SVR-1/internal.pdf' })]],
    ['ready', request(), [report({ ...frozen, customerPdfPath: 'pdf/SVR-1/customer.pdf', internalPdfPath: 'pdf/SVR-1/internal.pdf' })]],
    ['stale', request({ answeredAt: '2026-10-01T04:00:00+00:00' }), [report()]],
  ];
  const seen = new Set();
  for (const [want, req, rows, opts] of cases) {
    assert.equal(surveyReportState(req, rows, opts || { now: NOW + 600_000, issueAtSend: true }), want, want);
    seen.add(want);
  }
  assert.deepEqual([...seen].sort(), [...SURVEY_REPORT_STATES].sort(), 'ตารางครอบทุกสถานะ');
});

test('issuing: ต้องมีสวิตช์ออกตอนส่ง และเพิ่งส่งไม่เกิน 180 วิ — พ้นแล้วปุ่มออกเอกสารต้องกลับมา (missing)', () => {
  assert.equal(SURVEY_REPORT_ISSUING_MS, 180_000);
  const at = (ms, issueAtSend = true) => surveyReportState(request(), [], { now: NOW + ms, issueAtSend });
  assert.equal(at(0), 'issuing');
  assert.equal(at(179_999), 'issuing');
  assert.equal(at(180_000), 'missing');
  assert.equal(at(3_600_000), 'missing');
  assert.equal(at(1_000, false), 'missing', 'สวิตช์ปิด = การส่งไม่ออกเอกสาร ⇒ ไม่มีอะไรให้รอ');
  // นาฬิกาแอปช้ากว่าฐานนิดหน่อย — ยังนับว่าเพิ่งส่ง · คลาดเกินหน้าต่าง = ไม่เดา
  assert.equal(at(-2_000), 'issuing');
  assert.equal(at(-180_000), 'missing');
  // นาฬิกาเป็น Date / ISO ก็ได้
  assert.equal(surveyReportState(request(), [], { now: new Date(NOW + 1_000), issueAtSend: true }), 'issuing');
  assert.equal(surveyReportState(request(), [], { now: '2026-10-01T03:02:59.000Z', issueAtSend: true }), 'issuing');
  assert.equal(surveyReportState(request(), [], { now: '2026-10-01T03:03:00.000Z', issueAtSend: true }), 'missing');
  // เวลาที่อ่านไม่ได้ = ไม่เดาว่ากำลังออก
  assert.equal(surveyReportState(request({ answeredAt: 'ไม่ใช่เวลา' }), [], { now: NOW, issueAtSend: true }), 'missing');
  assert.equal(surveyReportState(request(), [], { now: 'ไม่ใช่เวลา', issueAtSend: true }), 'missing');
  // ไม่ส่งตัวเลือก = สวิตช์ปิด
  assert.equal(surveyReportState(request(), []), 'missing');
});

test('ส่งรอบใหม่หลังดึงผลกลับ: ฉบับเก่าถูกแทนที่หมด ⇒ issuing / missing ไม่ใช่ recalled', () => {
  const rows = [superseded({ rev: 0 }), superseded({ id: 'SVR-2', rev: 1, docNo: 'SU-26100001-1' })];
  assert.equal(surveyReportState(request(), rows, { now: NOW + 1_000, issueAtSend: true }), 'issuing');
  assert.equal(surveyReportState(request(), rows, { now: NOW + 999_000, issueAtSend: true }), 'missing');
  assert.equal(surveyReportState(request({ answeredAt: null }), rows, { now: NOW, issueAtSend: true }), 'recalled');
  // ฉบับที่ใช้อยู่ชนะฉบับที่ถูกแทนที่เสมอ ไม่ว่าลำดับแถว
  const withCurrent = [report({ id: 'SVR-3', rev: 2, docNo: 'SU-26100001-2' }), ...rows];
  assert.equal(surveyReportState(request(), withCurrent), 'issued');
  assert.equal(surveyReportState(request(), [...withCurrent].reverse()), 'issued');
  assert.equal(surveyReportCurrent(withCurrent).id, 'SVR-3');
  assert.equal(surveyReportCurrent(rows), null);
});

test('🔴 stale เทียบเป็นมิลลิวินาที ไม่เทียบสตริง — และฉบับ current ของใบที่ดึงผลกลับแล้วก็ stale', () => {
  // PostgREST คืน +00:00 · แอปเขียน Z · ฐานเก็บละเอียดถึงไมโครวินาที — จุดเวลาเดียวกันทั้งหมด
  for (const approvedAt of ['2026-10-01T03:00:00.000Z', '2026-10-01T03:00:00+00:00', '2026-10-01T10:00:00+07:00', '2026-10-01T03:00:00.000000+00:00']) {
    assert.equal(surveyReportState(request(), [report({ approvedAt })]), 'issued', approvedAt);
    assert.equal(surveyReportIsStale(request(), report({ approvedAt })), false, approvedAt);
  }
  assert.equal(surveyReportState(request(), [report({ approvedAt: '2026-10-01T03:00:00.001+00:00' })]), 'stale');
  assert.equal(surveyReportState(request({ answeredAt: null }), [report()]), 'stale', 'ดึงผลกลับแล้วแต่ทริกเกอร์ไม่แทนที่ฉบับ');
  assert.equal(surveyReportState(null, [report()]), 'stale');
  assert.equal(surveyReportState(request(), [report({ approvedAt: null })]), 'stale', 'อ่านเวลาไม่ได้ = ไม่เสิร์ฟ ไม่ใช้ซ้ำ');
  // stale ชนะทุกสถานะของกระดาษ — PDF ครบก็ยังไม่เสิร์ฟ
  const done = report({ approvedAt: '2026-09-01T00:00:00Z', frozenAt: ANSWERED, customerPdfPath: 'a', internalPdfPath: 'b' });
  assert.equal(surveyReportState(request(), [done]), 'stale');
  assert.equal(surveyReportIsStale(request(), null), false, 'ไม่มีฉบับ = ไม่มีอะไร stale');
});

test('อินพุตแปลก: ไม่มีคำร้อง · แถวไม่ใช่อาเรย์ · แถว null — ไม่ throw', () => {
  assert.equal(surveyReportState(null, null), 'not_sent');
  assert.equal(surveyReportState(undefined, undefined), 'not_sent');
  assert.equal(surveyReportState(request({ answeredAt: null }), [null, undefined]), 'not_sent');
  assert.equal(surveyReportState(request({ answeredAt: null }), 'x'), 'not_sent');
  // สองแถว current (ฐานไม่ยอมให้เกิด) — หยิบ rev สูงสุด
  const two = [report({ id: 'A', rev: 0 }), report({ id: 'B', rev: 1, frozenAt: ANSWERED })];
  assert.equal(surveyReportCurrent(two).id, 'B');
  assert.equal(surveyReportState(request(), two), 'frozen');
});

/* ══ ② ข้อผิดพลาดของ RPC ═══════════════════════════════════════════════ */

test('แผนที่ข้อผิดพลาดของ RPC — จับด้วยคำขึ้นต้นของข้อความที่ mig 0401 ยก', () => {
  const rpc = (message, code = 'P0001', details = null) => surveyReportRpcError({ code, message, details });

  assert.equal(surveyReportRpcError(null), null);
  assert.equal(surveyReportRpcError(undefined), null);

  const changed = rpc('survey_answer_changed: DR-1');
  assert.deepEqual(changed, {
    code: 'answer_changed', reason: 'ผลถูกดึงกลับหรือส่งใหม่ระหว่างออกเอกสาร — ยังไม่ได้ออกเอกสาร', retry: false, recheck: false, log: null,
  });

  const invalid = rpc('survey_request_invalid: DR-1');
  assert.equal(invalid.code, 'not_answered');
  assert.equal(invalid.retry, false);
  assert.equal(invalid.recheck, false);

  const full = rpc('survey_report_sequence_exhausted: 26');
  assert.equal(full.code, 'rpc_failed');
  assert.equal(full.reason, 'เลข SU ของปีนี้ครบ 9999 แล้ว — แจ้งผู้ดูแลระบบ');
  assert.equal(full.retry, false);
  assert.match(full.log, /survey_report_sequence_exhausted/);

  const missing = rpc('Could not find the function public.issue_survey_report(p_report_id, …) in the schema cache', 'PGRST202');
  assert.equal(missing.code, 'rpc_failed');
  assert.equal(missing.reason, 'ฐานข้อมูลยังไม่พร้อม (mig 0401) — แจ้งผู้ดูแลระบบ');
  assert.equal(missing.retry, false);
  assert.equal(rpc('function public.issue_survey_report(text) does not exist', '42883').reason, missing.reason);

  // อย่างอื่นทั้งหมด (รวมข้อความที่ RPC ยกเมื่อผู้เรียกส่งอาร์กิวเมนต์ผิด) = rpc_failed + ข้อความดิบลง log
  for (const message of ['survey_report_snapshot_required', 'survey_report_month_invalid: 2613', 'survey_report_id_required', 'canceling statement due to statement timeout', '']) {
    const other = rpc(message, message.startsWith('canceling') ? '57014' : 'P0001');
    assert.equal(other.code, 'rpc_failed', message);
    assert.equal(other.reason, SURVEY_REPORT_REASONS.rpc_failed, message);
    assert.equal(other.retry, true, message);
    assert.equal(other.recheck, false, message);
    assert.ok(other.log, message);
  }
  assert.match(rpc('boom', '57014', 'some detail').log, /\[57014\] boom · some detail/);

  // Error ที่ถูกโยน (เครือข่าย) และสตริงเปล่า ๆ ก็อ่านได้
  assert.equal(surveyReportRpcError(new TypeError('fetch failed')).code, 'rpc_failed');
  assert.equal(surveyReportRpcError(new TypeError('fetch failed')).retry, true);
  assert.equal(surveyReportRpcError('survey_answer_changed: DR-9').code, 'answer_changed');

  // คำขึ้นต้นเท่านั้น — ข้อความที่แค่ "เอ่ยถึง" ไม่นับ
  assert.equal(rpc('wrapped: survey_answer_changed: DR-1').code, 'rpc_failed');
});

test('🔴 survey_report_already_current และ 23505 ไม่ตอบทันที — สั่งอ่านซ้ำ (recheck) · 23505 ลงชื่อ constraint ใน log', () => {
  const already = surveyReportRpcError({ code: 'P0001', message: 'survey_report_already_current: DR-1' });
  assert.equal(already.recheck, true);
  assert.equal(already.log, null, 'สองคำขอออกเอกสารพร้อมกันเป็นเรื่องปกติ ไม่ต้องลง log');

  const dup = surveyReportRpcError({
    code: '23505',
    message: 'duplicate key value violates unique constraint "service_survey_reports_docNo_key"',
    details: 'Key ("docNo")=(SU-26100001-0) already exists.',
  });
  assert.equal(dup.recheck, true);
  assert.match(dup.log, /constraint service_survey_reports_docNo_key/);
  assert.match(dup.log, /SU-26100001-0/);
  // คำตอบสำรองเมื่ออ่านซ้ำแล้วไม่เข้ากรณีไหน = เลขชนกัน
  for (const e of [already, dup]) {
    assert.equal(e.code, 'rpc_failed');
    assert.equal(e.reason, 'ออกเลขเอกสารไม่สำเร็จ (เลขชนกัน) — แจ้งผู้ดูแลระบบ');
    assert.equal(e.retry, false);
  }
});

test('อ่านซ้ำหลังชนกัน: สี่ทางออกของ §3', () => {
  // ① มีฉบับที่ใช้อยู่ของผลรอบนี้ (อีกคำขอออกไปก่อน) → ใช้ซ้ำ
  const row = report();
  assert.deepEqual(surveyReportRpcConflict({ request: request(), reports: [superseded(), row], answeredAt: ANSWERED }), {
    state: 'issued', reused: true, report: row,
  });
  // ② ไม่มีฉบับที่ใช้อยู่ และคำตอบเปลี่ยนไปแล้ว (ดึงผลกลับ / ส่งรอบใหม่ระหว่าง RPC)
  for (const answeredAt of [null, '2026-10-01T05:00:00+00:00']) {
    assert.deepEqual(surveyReportRpcConflict({ request: request({ answeredAt }), reports: [superseded()], answeredAt: ANSWERED }), {
      state: 'failed', code: 'answer_changed', reason: SURVEY_REPORT_REASONS.answer_changed, retry: false,
    });
  }
  assert.equal(surveyReportRpcConflict({ request: null, reports: [], answeredAt: ANSWERED }).code, 'answer_changed', 'คำร้องหายไป');
  // ③ ฉบับที่ใช้อยู่ไม่ใช่ของผลรอบนี้
  assert.deepEqual(surveyReportRpcConflict({ request: request(), reports: [report({ approvedAt: '2026-09-01T00:00:00Z' })], answeredAt: ANSWERED }), {
    state: 'failed', code: 'stale_current', reason: SURVEY_REPORT_REASONS.stale_current, retry: false,
  });
  // ④ ไม่มีฉบับที่ใช้อยู่ คำตอบเดิม = เลขชนกันจริง (docNo / (requestId, rev) / PK)
  assert.deepEqual(surveyReportRpcConflict({ request: request({ answeredAt: '2026-10-01T03:00:00.000Z' }), reports: [superseded()], answeredAt: ANSWERED }), {
    state: 'failed', code: 'rpc_failed', reason: 'ออกเลขเอกสารไม่สำเร็จ (เลขชนกัน) — แจ้งผู้ดูแลระบบ', retry: false,
  });
  assert.equal(surveyReportRpcConflict().code, 'answer_changed', 'ไม่มีอะไรให้เทียบ = ไม่อ้างว่าออกแล้ว');
});

/* ══ ③ ผลวัดจริงของกระดาษ ══════════════════════════════════════════════ */

/* กระดาษจากตัวเรนเดอร์จริง (แฝดสังเคราะห์ของ RQ-AS-26090186: ลูกค้า 4 แผ่น · ภายใน 6 แผ่น) */
function paper(inputs, version) {
  const built = buildSurveyReportSnapshot(inputs, { mode: 'freeze' });
  assert.equal(built.errors, undefined, (built.errors || []).join(' | '));
  const view = surveyReportView(built.snapshot, { version });
  const layout = paginateSurveyReport(view);
  return { snapshot: built.snapshot, view, layout, html: renderSurveyReportHTML({ view, layout, docNo: null, issuedAt: null }) };
}
const twin = () => surveyReportInputsFromFixture(syntheticSurveyFixture());
const dataUri = () => 'data:image/jpeg;base64,AAAA';

/** PDF ปลอมรูปเดียวกับที่ Chrome เขียน — dictionary ของหน้าและฟอนต์เป็นข้อความเปล่า */
function fakePdf(pages, fonts = ['AAAAAA+Sarabun-Regular', 'BBBBBB+Sarabun-Bold'], { type3 = 0 } = {}) {
  const parts = ['%PDF-1.4', '1 0 obj\n<< /Type /Pages /Count 0 >>\nendobj'];
  for (let i = 0; i < pages; i += 1) parts.push(`${i + 2} 0 obj\n<< /Type /Page /Parent 1 0 R >>\nendobj`);
  for (const name of fonts) parts.push(`<< /Type /Font /Subtype /Type0 /BaseFont /${name} >>`);
  for (let i = 0; i < type3; i += 1) parts.push('<< /Type /Font /Subtype /Type3 >>');
  return Buffer.from(`${parts.join('\n')}\n%%EOF`, 'latin1');
}
/** ผลวัดที่ผ่าน: เส้นท้ายกระดาษที่ 1054 เนื้อหาจบที่ 900 */
const fitOf = (pages, over = {}) => Array.from({ length: pages }, (_, i) => ({
  page: i + 1, height: 1123, rule: 1054, last: 900, lastBlock: 'p.note', body: 900, marks: {}, ...(over[i + 1] || {}),
}));
const blocks = (issues) => issues.filter((i) => i.kind === 'block');
const logs = (issues) => issues.filter((i) => i.kind === 'log');

test('กระดาษที่ผ่าน: ไม่มีข้อกัน ไม่มี log — ทั้งสองฉบับของตัวเรนเดอร์จริง', () => {
  for (const [version, pages] of [['customer', 4], ['internal', 6]]) {
    const p = paper(twin(), version);
    assert.equal(p.layout.pageCount, pages);
    const html = resolveImageTokens(p.html, dataUri);
    assert.deepEqual(surveyReportPaperIssues({ html, fit: fitOf(pages), brokenImages: 0, buffer: fakePdf(pages) }), [], version);
  }
});

test('🔴 token ของรูปที่เหลือใน HTML กันการตรึง — และ token ที่ไฟล์นี้ประกาศต้องตรงกับของตัวเรนเดอร์', () => {
  const sha = fakeSha('pin');
  assert.equal(surveyReportImageToken({ sha }), `su-img:${sha}`, 'คำนำหน้า token เปลี่ยน = ต้องแก้ surveyReportState.js ด้วย');
  const p = paper(twin(), 'customer');
  const shas = surveyReportImageShas(p.html);
  assert.ok(shas.length > 0);

  // ไม่แปลงเลย
  const raw = surveyReportPaperIssues({ html: p.html, fit: fitOf(4), brokenImages: 0, buffer: fakePdf(4) });
  assert.equal(blocks(raw).length, 1);
  assert.match(blocks(raw)[0].text, /su-img:/);
  assert.equal(blocks(raw)[0].page, null);
  // แปลงไม่ครบหนึ่งรูป (รูปหายจากถัง)
  const partial = resolveImageTokens(p.html, (s) => (s === shas[0] ? null : dataUri()));
  assert.equal(blocks(surveyReportPaperIssues({ html: partial, fit: fitOf(4), brokenImages: 0, buffer: fakePdf(4) })).length, 1);
  // token ผิดรูป (sha ไม่ครบ 64 ตัว) ที่ตัวแปลงมองไม่เห็น ก็ยังกัน
  const odd = `${resolveImageTokens(p.html, dataUri)}<img src="su-img:xyz">`;
  assert.equal(blocks(surveyReportPaperIssues({ html: odd, fit: fitOf(4), brokenImages: 0, buffer: fakePdf(4) })).length, 1);
});

test('รูปที่เบราว์เซอร์ถอดรหัสไม่ได้กันการตรึง', () => {
  const html = resolveImageTokens(paper(twin(), 'customer').html, dataUri);
  const got = surveyReportPaperIssues({ html, fit: fitOf(4), brokenImages: 2, buffer: fakePdf(4) });
  assert.deepEqual(got, [{ kind: 'block', text: 'รูปถอดรหัสไม่ได้ 2 รูป', page: null }]);
});

test('🔴 จำนวนแผ่นของ HTML · ผลวัด · หน้าของ PDF ต้องเท่ากันทั้งสาม', () => {
  const html = resolveImageTokens(paper(twin(), 'customer').html, dataUri);
  const run = (fit, buffer, source = html) => blocks(surveyReportPaperIssues({ html: source, fit, brokenImages: 0, buffer }));

  // แผ่นสูงเกินหน้ากระดาษ ⇒ PDF มีหน้าเกิน ทั้งที่ HTML กับผลวัดยังเท่ากัน
  const spill = run(fitOf(4), fakePdf(5));
  assert.equal(spill.length, 1);
  assert.match(spill[0].text, /HTML 4 แผ่น · วัดได้ 4 แผ่น · PDF 5 หน้า/);
  // วัดได้ไม่ครบ / ไม่ได้วัด
  assert.match(run(fitOf(3), fakePdf(4))[0].text, /วัดได้ 3 แผ่น/);
  assert.match(run(null, fakePdf(4))[0].text, /วัดได้ 0 แผ่น/);
  // HTML ที่ไม่มีแผ่นเลยไม่ผ่านแม้ตัวเลขอื่นเป็นศูนย์เท่ากัน
  assert.equal(run([], fakePdf(1), '<html><body></body></html>').length, 1);
  // ไม่มี PDF / นับหน้าไม่ได้ (PDF ที่บีบ object ไว้) = กัน — ของที่ตรึงแล้วแก้ไม่ได้ จึงไม่เดาว่าครบ
  assert.match(run(fitOf(4), null)[0].text, /ไม่มีไฟล์ PDF/);
  assert.match(run(fitOf(4), Buffer.alloc(0))[0].text, /ไม่มีไฟล์ PDF/);
  assert.match(run(fitOf(4), Buffer.from('%PDF-1.7 compressed'))[0].text, /นับหน้าของ PDF ไม่ได้/);
  // puppeteer รุ่นใหม่คืน Uint8Array — ต้องนับได้เหมือน Buffer
  assert.deepEqual(run(fitOf(4), new Uint8Array(fakePdf(4))), []);
  // `/Pages` (ต้นไม้ของหน้า) ไม่ถูกนับเป็นหน้า — ไม่งั้น PDF ปลอมข้างบนจะนับเกินหนึ่ง
  assert.equal(pdfPageCount(fakePdf(4)), 4);
});

test('🔴 แผ่นที่ไม่มีเส้นท้ายกระดาษ หรือเนื้อหาเลยเส้น กันการตรึง — บอกหน้า', () => {
  const html = resolveImageTokens(paper(twin(), 'customer').html, dataUri);
  const run = (over) => surveyReportPaperIssues({ html, fit: fitOf(4, over), brokenImages: 0, buffer: fakePdf(4) });

  assert.deepEqual(run({ 2: { rule: null } }), [{ kind: 'block', text: 'หน้า 2 ไม่มีเส้นท้ายกระดาษ', page: 2 }]);
  assert.deepEqual(run({ 3: { rule: undefined } }), [{ kind: 'block', text: 'หน้า 3 ไม่มีเส้นท้ายกระดาษ', page: 3 }]);

  const over = run({ 3: { last: 1060.4, lastBlock: 'td.zn' } });
  assert.deepEqual(over, [{ kind: 'block', text: 'หน้า 3 เนื้อหาเลยเส้นท้ายกระดาษ 6.4px ใต้ td.zn', page: 3 }]);

  assert.equal(blocks(run({ 1: { last: null } }))[0].page, 1);
  // หลายหน้าพังพร้อมกัน — รายงานครบทุกหน้า
  assert.deepEqual(blocks(run({ 1: { rule: null }, 4: { last: 2000 } })).map((i) => i.page), [1, 4]);
});

test('ระยะใต้เนื้อหาน้อยกว่า 8px แต่ยังไม่ถึงเส้น = ลง log เท่านั้น ไม่กันการตรึง (มติ 4)', () => {
  assert.equal(SURVEY_REPORT_FIT_MARGIN, 8);
  const html = resolveImageTokens(paper(twin(), 'customer').html, dataUri);
  const run = (last) => surveyReportPaperIssues({ html, fit: fitOf(4, { 2: { last } }), brokenImages: 0, buffer: fakePdf(4) });

  assert.deepEqual(run(1046), [], 'เหลือ 8 พอดี = ผ่านเงียบ');
  const tight = run(1050);
  assert.equal(blocks(tight).length, 0);
  assert.deepEqual(logs(tight).map((i) => i.page), [2]);
  assert.match(tight[0].text, /หน้า 2 เหลือที่ใต้เนื้อหา 4px/);
  assert.equal(blocks(run(1054)).length, 0, 'จบที่เส้นพอดี = ยังไม่มีอะไรถูกตัด');
  assert.equal(blocks(run(1054.01)).length, 1);
});

test('ฟอนต์นอกจาก Sarabun หรือ Type3 = ลง log เท่านั้น', () => {
  const html = resolveImageTokens(paper(twin(), 'customer').html, dataUri);
  const run = (buffer) => surveyReportPaperIssues({ html, fit: fitOf(4), brokenImages: 0, buffer });

  assert.deepEqual(pdfFonts(fakePdf(1)).names, ['Sarabun-Bold', 'Sarabun-Regular'], 'คำนำหน้า subset ถูกตัดก่อนเทียบ');
  const foreign = run(fakePdf(4, ['AAAAAA+Sarabun-Regular', 'CCCCCC+OpenSans-Regular']));
  assert.equal(blocks(foreign).length, 0);
  assert.equal(logs(foreign).length, 1);
  assert.match(foreign[0].text, /OpenSans-Regular/);
  assert.doesNotMatch(foreign[0].text, /Sarabun-Regular/);

  const type3 = run(fakePdf(4, ['AAAAAA+Sarabun-Regular'], { type3: 2 }));
  assert.deepEqual(type3.map((i) => i.kind), ['log']);
  assert.match(type3[0].text, /Type3 × 2/);
  // ชื่อที่แค่ขึ้นต้นคล้าย ไม่นับเป็นฟอนต์ของกระดาษ
  assert.equal(logs(run(fakePdf(4, ['Sarabunesque-Regular']))).length, 1);
});

test('ไม่ส่งอะไรเลยก็ไม่ throw — และไม่ผ่าน', () => {
  assert.ok(blocks(surveyReportPaperIssues()).length > 0);
  assert.ok(blocks(surveyReportPaperIssues({})).length > 0);
});

/* ══ ④ ยามกันรั่วของฉบับลูกค้า ═════════════════════════════════════════ */

/* ชิ้นของฉบับภายในที่ยามค้น — กลุ่มและลำดับเดียวกับ `INTERNAL_MARKUP` ของ surveyReportState.js (ตัวนั้นไม่ export)
   สตริงตรงตัวตามที่ตัวเรนเดอร์พิมพ์ · เทสต์ล็อกทั้งสองทาง: ยามจับทุกตัว และตัวเรนเดอร์จริงยังพิมพ์ทุกตัว */
const INTERNAL_PIECES = [
  ['แถบฉบับภายใน', ['<div class="band">', '<span class="band-t">', '<span class="band-r">']],
  ['ป้ายฉบับที่ท้ายกระดาษ', ['<span><b>ฉบับภายใน</b> · หน้า 1 / 4</span>']],
  ['แผงข้อมูลภายใน', ['<main class="content i1">', '<div class="ipanel">', '<dl class="igrid">', '<div class="istrip">']],
  ['บรรทัดอธิบายคอลัมน์จุด', ['<p class="intro tnote">']],
  ['ส่วนจุดติดตั้ง', ['<figure class="ph sp">', '<span class="sp-b">', '<span class="sp-note">']],
  ['ภาคผนวกภายใน', ['data-kind="appendix"', '<div class="leadrow">', '<table class="kv">', '<section class="sign-last"', 'data-m="signs"']],
];

test('ฉบับลูกค้าของตัวเรนเดอร์จริงผ่าน — แฝดสังเคราะห์และชุดที่ทุกช่องพกเครื่องหมาย', () => {
  const p = paper(twin(), 'customer');
  assert.deepEqual(surveyReportCustomerHtmlIssues(p), []);

  const { inputs, leak, allowed } = markedSurveyInputs();
  const marked = paper(inputs, 'customer');
  assert.deepEqual(surveyReportCustomerHtmlIssues(marked), []);
  // กันเทสต์ผ่านเพราะกระดาษไม่มีรูป
  const shas = surveyReportImageShas(marked.html);
  assert.ok(shas.includes(allowed.widePhotoSha) && shas.includes(allowed.planPhotoSha));
  assert.equal(shas.includes(leak.spotPhotoSelectedSha), false);
});

test('🔴 HTML ฉบับภายในที่ถูกส่งมาเป็นฉบับลูกค้า ติดทั้งสามข้อ: รูปจุด · ชิ้นของฉบับภายใน · จำนวนแผ่น', () => {
  const { inputs, leak } = markedSurveyInputs();
  const customer = paper(inputs, 'customer');
  const internal = paper(inputs, 'internal');
  assert.ok(surveyReportImageShas(internal.html).includes(leak.spotPhotoSelectedSha), 'ฉบับภายในต้องมีรูปจุดจริง');
  assert.ok(internal.layout.pageCount > customer.layout.pageCount);

  const got = surveyReportCustomerHtmlIssues({ html: internal.html, snapshot: internal.snapshot, layout: customer.layout });
  assert.equal(got.length, 3);
  assert.match(got[0], /รูปที่ไม่ใช่ภาพกว้าง\/ภาพผัง/);
  assert.ok(got[0].includes(leak.spotPhotoSelectedSha.slice(0, 12)));
  // ทุกกลุ่มของ `INTERNAL_MARKUP` เจอในฉบับภายในของตัวเรนเดอร์จริง — กลุ่มไหนหายไปจากข้อความ = ตัวเรนเดอร์เปลี่ยน markup แล้วยามตาบอด
  assert.equal(got[1], `ฉบับลูกค้ามีชิ้นของฉบับภายใน (${INTERNAL_PIECES.map(([name]) => name).join(' · ')})`);
  assert.match(got[2], new RegExp(`${internal.layout.pageCount} แผ่น .*${customer.layout.pageCount} หน้า`));

  // แผนหน้าของฉบับภายในก็ช่วยไม่ได้ — รูปกับคำยังติด
  const sameLayout = surveyReportCustomerHtmlIssues(internal);
  assert.equal(sameLayout.length, 2);
});

test('🔴 แต่ละข้อจับได้เดี่ยว ๆ บน HTML ฉบับลูกค้าที่ถูกแทรก', () => {
  const { inputs, leak } = markedSurveyInputs();
  const p = paper(inputs, 'customer');
  const check = (html, layout = p.layout) => surveyReportCustomerHtmlIssues({ html, snapshot: p.snapshot, layout });
  const inject = (extra) => p.html.replace('</main>', `${extra}</main>`);

  // ① รูปจุด — ที่เลือก · ที่ไม่เลือก · รูปของพื้นที่ที่ตัด · sha ที่ไม่อยู่ในภาพนิ่งเลย
  for (const sha of [leak.spotPhotoSelectedSha, leak.spotPhotoThreeSha, leak.cutZonePhotoSha, fakeSha('นอกภาพนิ่ง')]) {
    const got = check(inject(`<img src="su-img:${sha}">`));
    assert.equal(got.length, 1, sha);
    assert.ok(got[0].includes(sha.slice(0, 12)));
  }
  // รูปเดียวกันสองที่นับครั้งเดียว
  const twice = check(inject(`<img src="su-img:${leak.spotPhotoThreeSha}"><img src="su-img:${leak.spotPhotoThreeSha}">`));
  assert.match(twice[0], / 1 รูป/);
  // ② ชิ้นของฉบับภายใน — markup แต่ละตัวจับได้เดี่ยว ๆ และบอกชื่อกลุ่มของมัน
  for (const [name, pieces] of INTERNAL_PIECES) {
    for (const piece of pieces) {
      assert.deepEqual(check(inject(piece)), [`ฉบับลูกค้ามีชิ้นของฉบับภายใน (${name})`], piece);
    }
  }
  // ป้ายท้ายกระดาษจับจากโครง ไม่ใช่จากคำ — แถบเปลี่ยนชื่อ (ป้ายตัดจาก `view.band.title`) ก็ยังติด
  assert.deepEqual(check(inject('<span><b>INTERNAL</b> · หน้า 1 / 4</span>')), ['ฉบับลูกค้ามีชิ้นของฉบับภายใน (ป้ายฉบับที่ท้ายกระดาษ)']);
  // ตัวหนาธรรมดาที่ไม่ใช่ป้ายท้ายกระดาษไม่ติด
  assert.deepEqual(check(inject('<b>ฉบับภายใน</b>')), []);
  // ③ จำนวนแผ่น — เกิน · ขาด
  const extraSheet = p.html.replace('</body>', '<article class="sheet su-page" data-page="99"></article></body>');
  assert.match(check(extraSheet)[0], new RegExp(`${p.layout.pageCount + 1} แผ่น`));
  assert.equal(check(p.html, { ...p.layout, pageCount: p.layout.pageCount + 1 }).length, 1);
});

test('🔴 ชิ้นของฉบับภายในทุกตัวที่ยามค้น ตัวเรนเดอร์จริงพิมพ์ลงฉบับภายใน และไม่พิมพ์ลงฉบับลูกค้าสักตัว', () => {
  const { inputs } = markedSurveyInputs();
  const customer = paper(inputs, 'customer').html;
  const internal = paper(inputs, 'internal').html;
  for (const piece of INTERNAL_PIECES.flatMap(([, pieces]) => pieces)) {
    // ป้ายท้ายกระดาษพกเลขหน้า — เทียบถึงแค่ "· หน้า "
    const probe = piece.startsWith('<span><b>') ? piece.slice(0, piece.indexOf(' · หน้า ') + ' · หน้า '.length) : piece;
    assert.ok(internal.includes(probe), `ฉบับภายในไม่มี ${probe} แล้ว — ตัวเรนเดอร์เปลี่ยน markup ต้องแก้ INTERNAL_MARKUP ตาม`);
    assert.equal(customer.includes(probe), false, `ฉบับลูกค้ามี ${probe}`);
  }
});

test('🔴 คำว่า "ฉบับภายใน" ในข้อความที่คนพิมพ์ไม่ติดยาม — หมายเหตุพื้นที่ · ชื่อพื้นที่ · ชื่อไซต์ · ชื่อลูกค้า (มติ 2 · มติ 3)', () => {
  const typed = [
    ['หมายเหตุพื้นที่', (inputs) => { inputs.zones[0].note = 'รายละเอียดจุดวางเครื่องดูฉบับภายใน'; }],
    ['ชื่อพื้นที่', (inputs) => { inputs.zones[0].zoneName = 'ห้องเก็บเอกสารฉบับภายใน'; }],
    ['ชื่อไซต์', (inputs) => { inputs.site.name = 'อาคารฉบับภายใน'; }],
    ['ชื่อลูกค้า', (inputs) => { inputs.customer.name = 'บริษัท ฉบับภายใน จำกัด'; }],
    // พิมพ์ markup ของแถบ/ป้ายท้ายกระดาษมาตรง ๆ ก็ไม่ติด — `esc` แปลง `<` `>` `"` ก่อนลงกระดาษ
    ['หมายเหตุที่พิมพ์ markup', (inputs) => {
      inputs.zones[0].note = '<div class="band"><span class="band-t">ฉบับภายใน</span></div><span><b>ฉบับภายใน</b> · หน้า 1</span>';
    }],
  ];
  for (const [what, edit] of typed) {
    const inputs = twin();
    edit(inputs);
    const p = paper(inputs, 'customer');
    assert.ok(p.html.includes('ฉบับภายใน'), `${what}: ข้อความต้องลงกระดาษฉบับลูกค้าจริง`);
    assert.deepEqual(surveyReportCustomerHtmlIssues(p), [], what);
  }
});

test('🔴 ไฟล์เดียวที่เป็นทั้งภาพกว้างของพื้นที่หนึ่งและรูปจุดของอีกพื้นที่ ยังออกเอกสารได้ — ชุดที่อนุญาตไม่ได้มาจาก images[].kind', () => {
  const { inputs } = markedSurveyInputs();
  // รูปจุดของพื้นที่ 1 เป็นไบต์เดียวกับภาพกว้างของพื้นที่ 3 ⇒ sha เดียวกัน · `images[]` จำ kind ที่เจอก่อน (spot ไม่ใช่ wide ก็ได้)
  const shared = inputs.imageByAttId['mk-z3-w1'];
  inputs.imageByAttId = { ...inputs.imageByAttId, 'mk-z1-s-sel': { ...shared } };
  const p = paper(inputs, 'customer');
  assert.ok(surveyReportImageShas(p.html).includes(shared.sha));
  assert.ok(p.snapshot.zones.some((z) => z.spots.some((s) => s.photos.some((img) => img.sha === shared.sha))), 'sha นี้เป็นรูปจุดด้วยจริง');
  assert.deepEqual(surveyReportCustomerHtmlIssues(p), []);

  // กลับกัน: sha ที่ `images[]` ติดป้าย wide ไว้ แต่ในภาพนิ่งเป็นแค่รูปจุด — ต้องยังกัน
  const forged = structuredClone(p.snapshot);
  const spotOnly = fakeSha('mk-z3-s1');
  forged.images = [{ sha: spotOnly, attId: 'mk-z3-s1', kind: 'wide', w: 1, h: 1, bytes: 1 }];
  const leaked = p.html.replace('</main>', `<img src="su-img:${spotOnly}"></main>`);
  assert.equal(surveyReportCustomerHtmlIssues({ html: leaked, snapshot: forged, layout: p.layout }).length, 1);
});

test('รูปของพื้นที่ที่ตัดไม่อยู่ในชุดที่อนุญาต แม้ภาพนิ่ง (รูปร่างเก่า/แก้มือ) จะพกรูปของมันมา', () => {
  const p = paper(markedSurveyInputs().inputs, 'customer');
  const snapshot = structuredClone(p.snapshot);
  const cut = snapshot.zones.find((z) => z.status === 'cut');
  const sha = fakeSha('รูปของพื้นที่ที่ตัด');
  cut.wide = [{ attId: 'x', sha, w: 1000, h: 750 }];
  const html = p.html.replace('</main>', `<img src="su-img:${sha}"></main>`);
  assert.equal(surveyReportCustomerHtmlIssues({ html, snapshot, layout: p.layout }).length, 1);
});

test('🔴 fail-closed: ไม่มี HTML · ไม่มีภาพนิ่ง · ไม่มีแผนหน้า = มีข้อผิด', () => {
  const p = paper(twin(), 'customer');
  assert.equal(surveyReportCustomerHtmlIssues().length, 1);
  assert.equal(surveyReportCustomerHtmlIssues({ html: '', snapshot: p.snapshot, layout: p.layout }).length, 1);
  assert.equal(surveyReportCustomerHtmlIssues({ html: '   ', snapshot: p.snapshot, layout: p.layout }).length, 1);
  assert.match(surveyReportCustomerHtmlIssues({ html: p.html, snapshot: null, layout: p.layout })[0], /ไม่มีภาพนิ่ง/);
  assert.match(surveyReportCustomerHtmlIssues({ html: p.html, snapshot: {}, layout: p.layout })[0], /ไม่มีภาพนิ่ง/);
  assert.match(surveyReportCustomerHtmlIssues({ html: p.html, snapshot: p.snapshot, layout: null })[0], /ไม่มีแผนหน้า/);
  assert.match(surveyReportCustomerHtmlIssues({ html: p.html, snapshot: p.snapshot, layout: { pageCount: 0 } })[0], /ไม่มีแผนหน้า/);
});

/* ══ ไฟล์นี้ต้องเบา ════════════════════════════════════════════════════ */

test('🔴 surveyReportState.js ไม่ import ของหนัก — อยู่บนเส้นของ GET ใบประเมิน · GET คำร้อง · ส่งผล · ดึงผลกลับ', () => {
  const src = readFileSync(new URL('./surveyReportState.js', import.meta.url), 'utf8');
  const imports = [...src.matchAll(/^import[^;]*?from\s+'([^']+)'/gm)].map((m) => m[1]);
  assert.deepEqual(imports, ['@/lib/documents/pdfInspect'], 'เพิ่ม import ใหม่ต้องตัดสินว่าไม่หนักก่อน');
  assert.doesNotMatch(src, /import\(/, 'ไม่มี dynamic import');
  assert.doesNotMatch(src, /server-only/);
});
