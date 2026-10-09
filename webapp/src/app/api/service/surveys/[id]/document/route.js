// ── เอกสาร "รายงานการประเมินพื้นที่" (SU-YYMMXXXX-R · FM-TS-01) — เปิดไฟล์ · ดูฉบับร่าง · ออกเอกสารภายหลัง (PR-2 §6) ──────
//
//   GET  ?version=customer|internal  ?format=pdf|html (ตั้งต้น pdf)  ?download=1   เปิดฉบับที่ออกแล้ว
//   GET  ?draft=1&format=html&version=…                                              ฉบับร่าง (ลายน้ำ · ไม่มีเลข · ไม่เก็บอะไร)
//   POST {}                                                                          ออกเอกสารของใบที่ส่งผลไปแล้ว / ลองใหม่
//
// 🔴 **ลำดับด่านของ GET คือสัญญา** (เทสต์ล็อกไว้ — ห้ามสลับ):
//   ① `canOpenSurveyDocument` ก่อนอ่านฐานทุกครั้ง (ช่าง `ts` ตกตรงนี้ ไม่มี query สักตัว)
//   ② อ่านคำร้อง — แถวเอกสารไม่มี FK ไปคำร้อง ⇒ คำร้องที่ถูกลบต้องตอบ 404 ไม่ใช่เสิร์ฟของค้าง
//   ③ `surveyDocAccess(user, request)[ฉบับ]` **ก่อนอ่านแถวเอกสาร** — ฝ่ายขายได้ฉบับลูกค้าเท่านั้น ไม่ว่าทางไหน (มติเจ้าของข้อ 6)
//   ④ อ่านแถวเอกสาร → ร่าง / ไม่มี / กำลังออก / ถูกแทนที่ / ค้างผิดรอบ
//   ⑤ กระดาษของรูปแบบที่ขอยังไม่มี → `ensureSurveyReportPaper` (GET แรกคือคนตรึง) · **ไม่เสิร์ฟกระดาษที่ยังไม่ตรึง**
//   ⑥⑦ เสิร์ฟ HTML ที่ตรึง / สตรีม PDF ที่เก็บ   ⑧ audit `view`
//
// 🔴 **ฉบับ → คอลัมน์/ไฟล์ มาจากแผนที่ตายตัวในไฟล์นี้** — ไม่มีที่ไหนประกอบชื่อคอลัมน์หรือที่อยู่ไฟล์จากสตริงของผู้เรียก
//   และ **สตริง `internal` ตรงตัวเท่านั้น** ที่เป็นฉบับภายใน (`surveyDocVersion`) ⇒ `version=Internal` ได้ฉบับลูกค้า
//   คำขอฉบับลูกค้าไม่อ่าน `internalHtml` ไม่ดาวน์โหลด `internal.pdf` ไม่ดึงรูปจุด (เทสต์ "Leak 3")
//
// 🔴 **เขียนของถาวรได้บน production เท่านั้น** (§0 · dev DB = prod DB) — GET ดูเหมือนอ่านอย่างเดียว แต่ GET แรกตรึงคอลัมน์
//   ที่เขียนได้ครั้งเดียว ⇒ ที่อื่นได้ 409 เว้นแต่กระดาษครบอยู่แล้ว (เสิร์ฟแบบอ่านอย่างเดียว) · ฉบับร่างดูได้ทุกที่ (ไม่เขียนอะไร)
//
// ⭐ **chromium ของงานประเมินเปิดที่ไฟล์นี้ที่เดียว** (มติ 3) — ขั้นกระดาษโหลด `htmlPdf` ด้วย `await import()` ข้างในเอง ·
//   เส้นส่งผลไม่เปิด · POST วัดกระดาษทั้งสองฉบับ **ก่อน** ออกเลข (I5b · มติ 29) ด้วยเบราว์เซอร์ตัวเดียวกับขั้นกระดาษ
//   (`next.config.mjs` ต้องมีเส้นนี้ใน `outputFileTracingIncludes` — ไบนารี chromium ไม่ถูก trace เอง)
//
// ⭐ **บรรทัดแจ้งผู้ขอ (`report_issued`) เขียนจาก POST นี้ที่เดียว** (มติ 34 · คำตอบเจ้าของ 01/10) — เฉพาะตอนได้เลขใหม่
//   ก่อนขั้นกระดาษ (กดซ้ำหลังขั้นกระดาษตายจะได้ `reused` แล้วไม่มีวันเขียนอีก) · เส้นส่งผลไม่เขียน: แถว `answer` ของมัน
//   ยิงกระดิ่งชุดเดียวกันอยู่แล้ว
//
// ⚠️ proxy ปล่อย `service:edit|work` ถึง handler (ช่างและ Planner ผ่าน) ⇒ **ด่านจริงคือ handler นี้** — ห้ามถอดเพราะคิดว่า proxy กันให้
// ⚠️ supabase ไม่ throw — ทุกคำสั่งอ่าน `{ data, error }` เอง · ขั้นออกเลขกับขั้นกระดาษไม่โยนเข้ามา (คืน `{ code, reasons }`)
// ⚠️ ชื่อไฟล์ไทยห้ามอยู่ใน `filename="…"` — `Response` โยน TypeError (ByteString) ⇒ ชื่อ ASCII ใน `filename=` ชื่อเต็มใน `filename*`
import { recordAudit } from '@/lib/audit';
import { businessDate } from '@/lib/businessDate';
import { withUser, ok } from '@/lib/http';
import { appendUpdate } from '@/lib/master/updates';
import { printPlaceholderHtml } from '@/lib/printTheme';
import { surveyZoneSize } from '@/lib/service/survey';
import { canOpenSurveyDocument, surveyDocAccess, surveyDocVersion } from '@/lib/service/surveyAccess';
import { surveyNeedsVisit } from '@/lib/service/surveyMethod';
import { renderSurveyReportHTML, resolveImageTokens, surveyReportImageShas } from '@/lib/service/surveyReportDocument';
import { surveyReportImagePath } from '@/lib/service/surveyReportImages';
import { loadSurveyReportInputs } from '@/lib/service/surveyReportInputs';
import { issueSurveyReport } from '@/lib/service/surveyReportIssue';
import { paginateSurveyReport } from '@/lib/service/surveyReportLayout';
import { surveyReportFileName } from '@/lib/service/surveyReportNumber';
import {
  SURVEY_REPORT_PAPER_REASONS, ensureSurveyReportPaper, measureSurveyReportPaper, surveyReportBounded, surveyReportPdfPath,
  surveyReportPrintSession,
} from '@/lib/service/surveyReportPaper';
import {
  SURVEY_REPORT_BUCKET, SURVEY_REPORT_NOT_PRODUCTION, loadSurveyReports, surveyReportIssueAtSend,
} from '@/lib/service/surveyReportRows';
import { SURVEY_REPORT_INPUT_LABELS, buildSurveyReportSnapshot } from '@/lib/service/surveyReportSnapshot';
import { SURVEY_REPORT_REASONS, surveyReportCurrent, surveyReportIsStale, surveyReportState } from '@/lib/service/surveyReportState';
import { surveyReportView } from '@/lib/service/surveyReportView';
import { loadSurveyZones } from '@/lib/service/surveyRepo';
import { surveySendVisitStep } from '@/lib/service/surveySendClose';
import { findSurveyVisit } from '@/lib/service/surveyVisit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// เปิด chromium + ดึงรูปจาก Drive + พิมพ์สองฉบับ + อัป — งบเดียวกับเส้นส่งผล (มติ 15 · แบบ `api/cron/drive-orphans`)
export const maxDuration = 300;

/* งบเวลาของคำขอหนึ่งครั้ง — เผื่อ 30 วิท้ายให้ฟังก์ชันตอบกลับก่อนถูกตัดที่ `maxDuration`
   ส่งให้ตัววัดกระดาษ (I5b) กับขั้นกระดาษเป็น **จุดเวลา** ทั้งคู่: เหลือไม่ถึง 40 วิ = ไม่เปิด chromium (ตอบ `timeout` ให้กดใหม่) */
const REQUEST_BUDGET_MS = 270_000;

/* 🔴 แผนที่ตายตัวของ "ฉบับ → ที่มันอยู่" — คีย์มาจาก `surveyDocVersion` เท่านั้น (สองค่า)
   ⚠️ คำสั่งอ่าน HTML เขียนชื่อคอลัมน์เป็นสตริงตรง ๆ ทีละฉบับ: ด่าน `check:columns` แกะ `.select(<ตัวแปร>)` ไม่ได้
      และคำขอฉบับลูกค้าต้องไม่มีทางเอ่ยชื่อ `internalHtml` ไม่ว่าด้วยค่าอะไรจากผู้เรียก */
const HTML_COLUMN = Object.freeze({ customer: 'customerHtml', internal: 'internalHtml' });
const PDF_PATH_COLUMN = Object.freeze({ customer: 'customerPdfPath', internal: 'internalPdfPath' });
const READ_FROZEN_HTML = Object.freeze({
  customer: (supabase, reportId) => supabase
    .from('service_survey_reports').select('id, "customerHtml"').eq('id', reportId).maybeSingle(),
  internal: (supabase, reportId) => supabase
    .from('service_survey_reports').select('id, "internalHtml"').eq('id', reportId).maybeSingle(),
});
const VERSION_LABEL = Object.freeze({ customer: 'ฉบับลูกค้า', internal: 'ฉบับภายใน' });

const DRAFT_WATERMARK = 'ฉบับร่าง';

const TEXT = Object.freeze({
  unauthorized: 'กรุณาเข้าสู่ระบบก่อนเปิดเอกสาร',
  forbidden: 'คุณไม่มีสิทธิ์เปิดเอกสารนี้',
  issueForbidden: 'ออกเอกสารประเมินได้เฉพาะหัวหน้าฝ่ายบริการที่ตอบใบนี้ได้',
  noRequest: 'ไม่พบใบคำร้อง',
  notSurvey: 'ใบนี้ไม่ใช่ใบประเมินพื้นที่ — ไม่มีเอกสารประเมิน',
  badFormat: 'รูปแบบไฟล์ไม่ถูกต้อง — เปิดได้เป็น PDF หรือ HTML',
  draftPdf: 'ฉบับร่างดูได้บนจอเท่านั้น (HTML) — ยังไม่มีไฟล์ PDF จนกว่าจะออกเอกสาร',
  draftIssued: 'ออกเอกสารแล้ว — เปิดฉบับที่ตรึงไว้',
  draftFailed: 'จัดทำฉบับร่างไม่สำเร็จ — ลองใหม่อีกครั้ง ถ้ายังไม่ได้ให้แจ้งผู้ดูแลระบบ',
  issuing: 'กำลังออกเอกสารของใบนี้ — ลองใหม่อีกครู่',
  none: 'ยังไม่มีเอกสารของใบนี้ — แจ้งหัวหน้าฝ่ายบริการให้กดออกเอกสาร',
  frozenMissing: 'ไม่พบกระดาษที่ตรึงไว้ของเอกสารนี้ — ลองใหม่อีกครั้ง',
  pdfUnreadable: 'อ่านไฟล์ PDF ที่เก็บไว้ไม่สำเร็จ — ลองใหม่อีกครั้ง',
  imageUnreadable: 'อ่านรูปของเอกสารจากที่เก็บไม่สำเร็จ — ลองใหม่อีกครั้ง',
});

/* รหัสของขั้นออกเลข → สถานะ HTTP (§6 POST) · รหัสที่ไม่อยู่ในตาราง = 500 */
const ISSUE_STATUS = Object.freeze({
  not_production: 409, not_answered: 409, stale_current: 409, blocked: 409, undecodable: 409,
  paper_blocked: 409, answer_changed: 409, images_failed: 502, timeout: 503,
  read_failed: 500, rpc_failed: 500, internal: 500,
});
/* รหัสของขั้นกระดาษ → สถานะ HTTP (§6 GET ข้อ 5) · ที่เหลือ = 500 */
const PAPER_STATUS = Object.freeze({ not_production: 409, image_missing: 502, storage_failed: 502, timeout: 503 });

const errorText = (e) => String(e?.message || e || '').split('\n')[0].slice(0, 300);

/**
 * คำตอบตอนเปิดเอกสารไม่ได้ — ภาษาไทยเสมอ
 * ⭐ จอเปิดเอกสารด้วยแท็บใหม่ ⇒ JSON ดิบคือสิ่งที่คนเห็นเต็มจอ · คำขอที่รับ `text/html` ได้หน้าแจ้งเหตุ
 *   (`printPlaceholderHtml` ตัวเดียวกับหน้าต่างพิมพ์อื่น · แบบ `specPaperErrorResponse`) · คำขอจาก `apiFetch` ได้ `{ error }`
 * @param extra คีย์เสริมของคำตอบ JSON (เช่น `code` · `retry`) — หน้า HTML ไม่พิมพ์
 */
function docError(req, message, status = 500, extra = null) {
  const text = String(message ?? '').trim() || 'เปิดเอกสารไม่สำเร็จ';
  const accept = req?.headers?.get?.('accept') || '';
  if (!/text\/html/i.test(accept)) return Response.json({ error: text, ...(extra || {}) }, { status });
  return new Response(printPlaceholderHtml({
    title: 'เปิดเอกสารประเมินพื้นที่ไม่ได้', message: text, tone: 'error', closeButton: true,
  }), {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'private, no-store' },
  });
}

/**
 * `Content-Disposition` ของไฟล์เอกสาร — `filename=` เป็น ASCII ล้วน (`<docNo>-<ฉบับ>.<นามสกุล>`) ·
 * ชื่อเต็มที่มีชื่อลูกค้า (ไทย) อยู่ใน `filename*` เท่านั้น
 * 🐞 ใส่ชื่อไทยลง `filename="…"` ตรง ๆ = `Response` โยน TypeError แล้วทั้งเส้นเป็น 500 (เกิดจริงกับไฟล์ FC · #1584)
 */
function contentDisposition({ docNo, customerName, version, ext, download }) {
  const ascii = `${docNo || 'SU'}-${version}.${ext}`.replace(/[^\x20-\x7E]/g, '').replace(/["\\]/g, '');
  const full = `${surveyReportFileName(docNo || 'SU', customerName, version)}.${ext}`;
  // `encodeURIComponent` ปล่อย ' ( ) * ไว้ — สี่ตัวนี้ไม่อยู่ใน attr-char ของ RFC 5987 (' คือตัวคั่นของ `filename*` เอง)
  const encoded = encodeURIComponent(full).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${download ? 'attachment' : 'inline'}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

const BASE_HEADERS = Object.freeze({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });

/* เนื้อของคำตอบเป็นสตรีมเสมอ (§6) — ที่บันทึกไว้ในรีโปมีแต่เพดานของ "คำขอ" 4.5 MB · ไฟล์ใหญ่ต้องไม่ถูกกันเป็นก้อนเดียว */
function streamOf(data) {
  if (data && typeof data.stream === 'function') return { body: data.stream(), size: Number(data.size) || null };
  const bytes = data instanceof Uint8Array ? data : null;
  if (!bytes || !bytes.byteLength) return null;
  return { body: new Blob([bytes]).stream(), size: bytes.byteLength };
}

async function bytesOf(data) {
  if (data instanceof Uint8Array) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  if (data && typeof data.arrayBuffer === 'function') return Buffer.from(await data.arrayBuffer());
  return Buffer.alloc(0);
}

/* อ่านคำร้องทั้งแถว — ด่านสิทธิ์อ่าน `dept` · `requestedById` · `team` · ฉบับร่างต้องใช้ทั้งแถว (ภาพนิ่งพกสิบกว่าช่อง) */
async function readRequest(supabase, id) {
  try {
    const { data, error } = await supabase.from('dept_requests').select('*').eq('id', id).maybeSingle();
    if (error) return { request: null, error };
    return { request: data || null, error: null };
  } catch (error) {
    return { request: null, error };
  }
}

/* เหตุของขั้นกระดาษที่คนเปิดเห็นได้ — แถวที่ยังไม่ตรึงถูกวัด **ทั้งสองฉบับ** เสมอ ⇒ เหตุของฉบับภายใน ("ฉบับภายใน: หน้า 5 …")
   โผล่ในคำขอฉบับลูกค้าได้ · คนที่ไม่มีสิทธิ์ฉบับภายในได้ข้อความกลางของรหัสนั้นแทน (มติเจ้าของข้อ 6: ไม่ว่าทางไหน) */
function paperReason(paper, access) {
  const lines = (Array.isArray(paper?.reasons) ? paper.reasons : []).map((t) => String(t ?? '').trim()).filter(Boolean);
  const shown = access?.internal ? lines : lines.filter((line) => !line.startsWith(VERSION_LABEL.internal));
  if (shown.length) return shown.join(' | ');
  return SURVEY_REPORT_PAPER_REASONS[paper?.code] || SURVEY_REPORT_PAPER_REASONS.paper_failed;
}

/* ══ ฉบับร่าง (หัวหน้าเท่านั้น · มติ 27) ════════════════════════════════════════════════════
   ไม่เก็บอะไร · ไม่มีเลข · ไม่เปิด chromium · ไม่โหลด `sharp` — รูปเป็นลิงก์ไปหา proxy ไฟล์แนบเดิม
   (`/api/master/attachments/<attId>/file`) ซึ่งเบราว์เซอร์ของหัวหน้าเปิดด้วย session ของตัวเอง */

const draftImageSrc = (img) => (img?.attId ? `/api/master/attachments/${encodeURIComponent(String(img.attId))}/file` : null);
const isCutZone = (zone) => (zone?.status || 'ok') === 'cut';

async function serveDraft({ supabase, req, user, request, reports, version, formatParam }) {
  if (formatParam === 'pdf') return docError(req, TEXT.draftPdf, 400);
  // มีฉบับที่ใช้อยู่แล้ว (ตรงรอบหรือค้างผิดรอบก็ตาม) = ไม่มีร่างให้ดู — ของจริงอยู่ที่ฉบับที่ตรึง
  if (surveyReportCurrent(reports)) return docError(req, TEXT.draftIssued, 409);

  /* ⚠️ `loadSurveyZones` โยนเมื่ออ่านไม่สำเร็จ (ไม่ใช่ `[]`) — "อ่านไม่ได้" ต้องไม่กลายเป็น "ยังไม่ได้วัดสักพื้นที่" */
  let zones;
  try {
    zones = await loadSurveyZones(supabase, request.id);
  } catch (e) {
    console.error('[survey-report] อ่านผลวัดของฉบับร่างไม่สำเร็จ', request.id, errorText(e));
    return docError(req, TEXT.draftFailed, 500);
  }
  // ดูตัวอย่างได้เมื่อทุกพื้นที่ที่ยังอยู่ในใบ (ไม่ถูกตัด) วัดครบสามช่องทุกส่วน — กระดาน S-1
  const active = zones.filter((zone) => !isCutZone(zone));
  const measured = active.filter((zone) => surveyZoneSize(zone.parts).complete);
  if (!active.length || measured.length !== active.length) {
    return docError(req, `ดูตัวอย่างได้เมื่อวัดครบทุกพื้นที่ (${measured.length}/${active.length})`, 409);
  }

  /* ใบที่ยังไม่ส่งผล = ร่างของ "สิ่งที่จะออกถ้ากดส่งตอนนี้" — ชุดเดียวกับรอบตรวจก่อนส่งผล (`surveyReportPrecheck`):
     ผู้ตรวจสอบและอนุมัติ = คนที่กำลังดู · นัดที่การส่งผลจะปิด = นัดที่เอกสารรับรอง
     ใบที่ส่งผลแล้ว (ยังไม่มีเอกสาร) = ของบนแถวล้วน ๆ ชุดเดียวกับที่ปุ่ม "ออกเอกสาร" จะใช้
     ⚠️ อ่านนัดที่ค้างไม่สำเร็จ = ร่างออกโดยไม่มีนัดนั้น (ช่องผู้ประเมินเป็นขีด) ไม่ล้มทั้งร่าง
     ⚠️ ใบประเมินจากแบบทั้งใบ (`surveyNeedsVisit` = ไม่ต้องมีนัด): นัดที่ค้างไม่ถูกปิดในร่าง และตัวโหลดไม่รับรองนัดไหนเลย
        ⇒ นัดที่ค้างจากก่อนสลับวิธีไม่ขึ้นกระดาษเป็นผู้ประเมิน */
  const nowIso = new Date().toISOString();
  let closing = null;
  let pendingAnswer = null;
  if (!request.answeredAt) {
    pendingAnswer = { answeredAt: nowIso, answeredById: user?.id ?? null, answeredByName: user?.name ?? null };
    try {
      const open = await findSurveyVisit(supabase, request.id, { openOnly: true });
      const step = surveySendVisitStep(open, { today: businessDate(nowIso), needsVisit: surveyNeedsVisit(zones) });
      if (step.action === 'close') closing = { ...open, ...step.patch };
    } catch (e) {
      console.error('[survey-report] อ่านนัดที่ค้างของฉบับร่างไม่สำเร็จ', request.id, errorText(e));
    }
  }

  const { inputs, unknown } = await loadSurveyReportInputs(supabase, {
    request, closedVisit: closing, pendingAnswer, zones, takenAt: nowIso,
  });
  /* 🔴 อ่านไม่สำเร็จ ≠ ไม่มี — ร่างที่ชื่อผู้ช่วย/ไซต์/บริษัทหายเพราะฐานสะดุดครั้งเดียว จะทำให้หัวหน้าเข้าใจว่าข้อมูลขาดจริง */
  if (unknown.length) {
    const labels = unknown.map((name) => SURVEY_REPORT_INPUT_LABELS[name] || name).join(' · ');
    return docError(req, `อ่านข้อมูลของเอกสารไม่สำเร็จ (${labels}) — ลองใหม่อีกครั้ง`, 500);
  }

  let html;
  try {
    const built = buildSurveyReportSnapshot(inputs, { mode: 'draft' });
    const view = surveyReportView(built.snapshot, { version });
    const layout = paginateSurveyReport(view);
    html = renderSurveyReportHTML({ view, layout, docNo: null, watermark: DRAFT_WATERMARK, imageSrc: draftImageSrc });
  } catch (e) {
    console.error('[survey-report] จัดทำฉบับร่างไม่สำเร็จ', request.id, e?.stack || errorText(e));
    return docError(req, TEXT.draftFailed, 500);
  }
  // ไม่ลง audit — ไม่มีเอกสารถูกเปิด มีแต่ตัวอย่างจากข้อมูลที่หัวหน้าเห็นบนจออยู่แล้ว
  return new Response(new Blob([html]).stream(), {
    status: 200,
    headers: { ...BASE_HEADERS, 'Content-Type': 'text/html; charset=utf-8' },
  });
}

/* ══ เสิร์ฟฉบับที่ออกแล้ว ════════════════════════════════════════════════════════════════ */

/* รูปของ HTML ที่ตรึง — `img/<sha>.jpg` จากถัง → data URI (HTML ที่ตรึงพก token `su-img:<sha>` · ไม่มีลิงก์ที่เซ็น · §0)
   ⚠️ ดึงเฉพาะ sha ที่ HTML **ของฉบับนี้** อ้าง ⇒ คำขอฉบับลูกค้าไม่แตะรูปจุดติดตั้ง */
const IMAGE_BATCH = 6;
async function frozenImages(supabase, shas) {
  const found = new Map();
  let failed = 0;
  const one = async (sha) => {
    const path = surveyReportImagePath(sha);
    try {
      // ใต้เพดานเวลา (30 วิ) — ถังที่ไม่ตอบต้องจบเป็น 502 ไม่ใช่ค้างจนฟังก์ชันถูกตัดที่ `maxDuration`
      const { data, error } = await surveyReportBounded(
        (signal) => supabase.storage.from(SURVEY_REPORT_BUCKET).download(path, {}, { signal }),
      );
      const bytes = error || !data ? null : await bytesOf(data);
      if (!bytes?.length) {
        console.error(`[survey-report] อ่านรูป ${path} ไม่สำเร็จ`, errorText(error) || '(ไม่มีข้อมูล)');
        failed += 1;
        return;
      }
      found.set(sha, `data:image/jpeg;base64,${bytes.toString('base64')}`);
    } catch (e) {
      console.error(`[survey-report] อ่านรูป ${path} ไม่สำเร็จ`, errorText(e));
      failed += 1;
    }
  };
  for (let i = 0; i < shas.length; i += IMAGE_BATCH) await Promise.all(shas.slice(i, i + IMAGE_BATCH).map(one));
  return { found, failed };
}

async function serveHtml({ supabase, req, report, version, download }) {
  let row;
  try {
    const { data, error } = await READ_FROZEN_HTML[version](supabase, report.id);
    if (error) {
      console.error(`[survey-report] อ่านกระดาษที่ตรึงของ ${report.docNo} ไม่สำเร็จ`, errorText(error));
      return { response: docError(req, SURVEY_REPORT_PAPER_REASONS.read_failed, 500) };
    }
    row = data;
  } catch (e) {
    console.error(`[survey-report] อ่านกระดาษที่ตรึงของ ${report.docNo} ไม่สำเร็จ`, errorText(e));
    return { response: docError(req, SURVEY_REPORT_PAPER_REASONS.read_failed, 500) };
  }
  const frozen = String(row?.[HTML_COLUMN[version]] ?? '');
  if (!frozen.trim()) return { response: docError(req, TEXT.frozenMissing, 500) };

  const { found, failed } = await frozenImages(supabase, surveyReportImageShas(frozen));
  if (failed) return { response: docError(req, TEXT.imageUnreadable, 502) };
  const html = resolveImageTokens(frozen, (sha) => found.get(sha) || null);
  return {
    response: new Response(new Blob([html]).stream(), {
      status: 200,
      headers: {
        ...BASE_HEADERS,
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': contentDisposition({
          docNo: report.docNo, customerName: report.customerName, version, ext: 'html', download,
        }),
      },
    }),
    served: true,
  };
}

async function servePdf({ supabase, req, report, version, download, captured }) {
  // ที่อยู่จากคอลัมน์ของฉบับนี้ · เพิ่งเก็บในคำขอนี้เอง (แถวที่ถืออยู่ยังเก่า) = ที่อยู่ตายตัวของฉบับเดียวกัน
  const path = report[PDF_PATH_COLUMN[version]] || surveyReportPdfPath(report.id, version);
  let file = null;
  try {
    // ใต้เพดานเวลา (30 วิ) — เหตุเดียวกับรูปของ HTML ข้างบน
    const { data, error } = await surveyReportBounded(
      (signal) => supabase.storage.from(SURVEY_REPORT_BUCKET).download(path, {}, { signal }),
    );
    if (error || !data) console.error(`[survey-report] อ่าน PDF ของ ${report.docNo} ไม่สำเร็จ`, errorText(error) || '(ไม่มีข้อมูล)');
    else file = streamOf(data);
  } catch (e) {
    console.error(`[survey-report] อ่าน PDF ของ ${report.docNo} ไม่สำเร็จ`, errorText(e));
  }
  if (!file) return { response: docError(req, TEXT.pdfUnreadable, 502) };
  return {
    response: new Response(file.body, {
      status: 200,
      headers: {
        ...BASE_HEADERS,
        'Content-Type': 'application/pdf',
        'Content-Disposition': contentDisposition({
          docNo: report.docNo, customerName: report.customerName, version, ext: 'pdf', download,
        }),
        ...(file.size ? { 'Content-Length': String(file.size) } : {}),
        // บอกว่าไฟล์นี้เพิ่งถูกพิมพ์ในคำขอนี้ (ไม่มีใครพิมพ์ไว้ก่อน) — สัญญาเดียวกับ PDF ของใบเสนอราคา
        ...(captured ? { 'X-Pdf-Fallback': 'on-demand' } : {}),
      },
    }),
    served: true,
  };
}

// GET /api/service/surveys/[id]/document
export const GET = withUser(async ({ user, supabase, req, ctx }) => {
  const { id } = await ctx.params;
  try {
    if (!user) return docError(req, TEXT.unauthorized, 401);
    // ① ตัดคนนอกก่อนแตะฐาน — ยิง id ไปเรื่อย ๆ ต้องบอกไม่ได้ว่าใบไหนมีเอกสาร
    if (!canOpenSurveyDocument(user)) return docError(req, TEXT.forbidden, 403);

    const params = new URL(req.url).searchParams;
    const version = surveyDocVersion(params.get('version'));
    const draft = params.get('draft') === '1';
    const download = params.get('download') === '1';
    const formatParam = params.get('format');

    // ② คำร้องต้องยังอยู่ (แถวเอกสารไม่มี FK)
    const read = await readRequest(supabase, id);
    if (read.error) {
      console.error('[survey-report] อ่านคำร้องของเอกสารไม่สำเร็จ', id, errorText(read.error));
      return docError(req, SURVEY_REPORT_PAPER_REASONS.read_failed, 500);
    }
    const request = read.request;
    if (!request) return docError(req, TEXT.noRequest, 404);

    // ③ ด่านของฉบับที่ขอ — ก่อนอ่านแถวเอกสารเสมอ · ฉบับร่างใช้คีย์ `draft` (หัวหน้าที่ตอบใบนี้ได้ · เห็นทั้งสองฉบับ)
    const access = surveyDocAccess(user, request);
    if (!access[draft ? 'draft' : version]) return docError(req, TEXT.forbidden, 403);
    if (request.kind !== 'site_survey') return docError(req, TEXT.notSurvey, 404);
    if (formatParam && formatParam !== 'pdf' && formatParam !== 'html') return docError(req, TEXT.badFormat, 400);
    const format = formatParam === 'html' ? 'html' : 'pdf';

    // ④ แถวเอกสาร — อ่านไม่สำเร็จ ≠ ไม่มี (`reports` เป็น `[]` คู่กับ `error`)
    const { reports, error: reportsError } = await loadSurveyReports(supabase, request.id);
    if (reportsError) return docError(req, SURVEY_REPORT_PAPER_REASONS.read_failed, 500);

    if (draft) return await serveDraft({ supabase, req, user, request, reports, version, formatParam });

    const current = surveyReportCurrent(reports);
    if (!current) {
      const state = surveyReportState(request, reports, { issueAtSend: surveyReportIssueAtSend() });
      if (state === 'issuing') return docError(req, TEXT.issuing, 409);
      // มีแต่ฉบับที่ถูกแทนที่ — ไฟล์เก่าไม่เปิด (มติ 11 · คำตอบเจ้าของ Q4: PR-2 แค่แสดงรายการให้หัวหน้า)
      if (reports.length) return docError(req, `เอกสาร ${reports[0].docNo || 'SU'} ถูกแทนที่แล้ว — รอฉบับใหม่`, 409);
      return docError(req, TEXT.none, 404);
    }
    if (surveyReportIsStale(request, current)) {
      // ทริกเกอร์แทนที่ (0401 ⑤) ไม่ยิง — ฉบับนี้ไม่ใช่ของผลรอบล่าสุด ⇒ ไม่เสิร์ฟ แก้ด้วยมือ
      console.error(`[survey-report] ${current.docNo} ยังเป็นฉบับที่ใช้อยู่แต่ไม่ตรงกับผลรอบล่าสุดของ ${request.docNo || request.id} — ไม่เสิร์ฟ`);
      return docError(req, SURVEY_REPORT_REASONS.stale_current, 409);
    }

    // ⑤ กระดาษของรูปแบบนี้ยังไม่มี → ทำเดี๋ยวนี้ (GET แรกคือคนตรึง) · ขอฉบับไหนเก็บ PDF ฉบับนั้น
    const missing = format === 'pdf' ? !current[PDF_PATH_COLUMN[version]] : !current.frozenAt;
    let paper = null;
    if (missing) {
      paper = await ensureSurveyReportPaper(supabase, {
        reportId: current.id, want: version, deadline: Date.now() + REQUEST_BUDGET_MS, user,
      });
      /* HTML ต้องการแค่ "ตรึงแล้ว" (PDF เก็บไม่สำเร็จก็ยังเสิร์ฟ HTML ที่ตรึงได้) · PDF ต้องการไฟล์ของฉบับนี้
         ⚠️ ไม่มีทางไหนเสิร์ฟกระดาษที่ยังไม่ตรึง */
      const ready = format === 'pdf'
        ? paper?.code === null && paper?.ready?.[version] === true
        : paper?.state === 'frozen' || paper?.state === 'ready';
      if (!ready) {
        const code = paper?.code || 'paper_failed';
        const text = code === 'not_production' ? SURVEY_REPORT_NOT_PRODUCTION : paperReason(paper, access);
        return docError(req, text, PAPER_STATUS[code] || 500, { code });
      }
    }
    const captured = Array.isArray(paper?.captured) && paper.captured.includes(version);

    // ⑥ ⑦
    const out = format === 'html'
      ? await serveHtml({ supabase, req, report: current, version, download })
      : await servePdf({ supabase, req, report: current, version, download, captured });
    if (!out.served) return out.response;

    /* ⑧ ใครเปิดฉบับไหน — best effort (`recordAudit` กลืน error เอง) · ส่งเฉพาะคีย์ที่นับไว้ ห้ามส่งแถว/ภาพนิ่ง/HTML
       (`after` ถูกเก็บตามตัว) */
    await recordAudit({
      user, action: 'view', entityType: 'service_survey_report', entityId: current.id,
      after: { docNo: current.docNo, version, format, captured },
      summary: `เปิดเอกสารประเมิน ${current.docNo} (${VERSION_LABEL[version]} · ${format === 'html' ? 'HTML' : 'PDF'})`,
      request: req,
    });
    return out.response;
  } catch (e) {
    console.error('[survey-report] GET เอกสารล้มกลางทาง', id, e?.stack || errorText(e));
    return docError(req, 'เปิดเอกสารไม่สำเร็จ — ลองใหม่อีกครั้ง', 500);
  }
});

/* ══ POST — ออกเอกสารของใบที่ส่งผลไปแล้ว และลองใหม่ ═══════════════════════════════════════ */

/**
 * ⭐ บรรทัดเดียวในเธรดของคำร้องที่บอกผู้ขอว่าเอกสารมาแล้ว (มติ 34) — ยิงกระดิ่งผ่านทางปกติของเธรด
 *   (ผู้ขอ + คนที่เคยเขียนในเธรดนี้ ลบคนกด) · meta พกแค่ `{ docNo, rev }`
 *   หัวกระดิ่ง = `ออกเอกสารประเมินแล้ว · คำร้อง <ชื่อเรื่อง>` — เลข `RQ-…` ขึ้นเฉพาะใบที่ไม่มีชื่อเรื่อง (`entityTitle` หยิบ
 *   ชื่อเรื่องก่อนเลขที่ เหมือนบรรทัด `answer`) · ที่นี่ไม่ตั้งหัวเอง: เปลี่ยนลำดับ = แก้ lib/notifications.js ซึ่งกระทบกระดิ่งคำร้องทุกชนิด
 * 🔴 **ห้ามใส่ id ของแถวเอกสาร** — ผู้ขออ่านแถวเธรดได้ และ id คือที่อยู่ไฟล์ PDF (มติ 16)
 * ⚠️ เขียนไม่สำเร็จ **ไม่เปลี่ยนคำตอบของ POST** — เลขออกไปแล้ว: ลง audit ของคำร้อง + log แล้วเดินต่อ
 */
async function tellRequester(supabase, { request, docNo, rev, user, req }) {
  let failure = null;
  try {
    const { error } = await appendUpdate(supabase, {
      entityType: 'dept_request', entityId: request.id, kind: 'report_issued',
      body: `ออกเอกสารประเมิน ${docNo} แล้ว — ดาวน์โหลดได้ที่หน้าคำร้อง`,
      meta: { docNo, rev },
      user,
    });
    if (error) failure = errorText(error);
  } catch (e) {
    failure = errorText(e) || 'ไม่ทราบสาเหตุ';
  }
  if (!failure) return;
  console.error(`[survey-report] ออก ${docNo} แล้ว แต่ลงเธรดแจ้งผู้ขอของ ${request.docNo || request.id} ไม่สำเร็จ`, failure);
  try {
    await recordAudit({
      user, action: 'update', entityType: 'dept_request', entityId: request.id,
      summary: `ออกเอกสารประเมิน ${docNo} แล้ว แต่ลงเธรดแจ้งผู้ขอไม่สำเร็จ — ${failure}`,
      request: req,
    });
  } catch (e) {
    console.error('[survey-report] บันทึก audit ของบรรทัดแจ้งผู้ขอที่ล้มไม่สำเร็จ', errorText(e));
  }
}

// POST /api/service/surveys/[id]/document
export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  const { id } = await ctx.params;
  // เบราว์เซอร์เดียวของทั้งคำขอ — ขั้นวัด (I5b) กับขั้นกระดาษใช้ร่วมกัน · สร้างไว้เฉย ๆ ไม่โหลดอะไรจนกว่าจะพิมพ์ครั้งแรก
  const session = surveyReportPrintSession();
  try {
    if (!user) return docError(req, TEXT.unauthorized, 401);
    if (!canOpenSurveyDocument(user)) return docError(req, TEXT.issueForbidden, 403);

    const read = await readRequest(supabase, id);
    if (read.error) {
      console.error('[survey-report] อ่านคำร้องก่อนออกเอกสารไม่สำเร็จ', id, errorText(read.error));
      return docError(req, SURVEY_REPORT_PAPER_REASONS.read_failed, 500);
    }
    const request = read.request;
    if (!request) return docError(req, TEXT.noRequest, 404);
    /* 🔑 คู่เดียวกับปุ่มส่งผล: หัวหน้าฝ่ายบริการ **และ** ตอบใบนี้ได้ — ช่าง · Planner · ฝ่ายขายผ่าน proxy มาถึงตรงนี้แล้วได้ 403 */
    if (!surveyDocAccess(user, request).issue) return docError(req, TEXT.issueForbidden, 403);
    if (request.kind !== 'site_survey') return docError(req, TEXT.notSurvey, 404);

    const deadline = Date.now() + REQUEST_BUDGET_MS;

    /* ── ขั้นออกเลข (I0–I8) — อ่านคำร้องใหม่เอง · ด่านทุกตัว · รูป · วัดกระดาษจริงก่อน RPC ───────────────
       ⚠️ งบของรอบเติมรูปปล่อยเป็นค่าตั้งต้นของขั้นนั้น (180 วิ) · ตัววัดได้ **จุดเวลาของทั้งคำขอ** แทนงบรูปที่ขั้นออกเลขส่งต่อมา —
          ไม่งั้นรูปที่กินเวลาเกือบหมดงบจะทำให้ตัววัดเห็นว่า "เหลือไม่ถึง 40 วิ" ทั้งที่ฟังก์ชันยังเหลือเวลา */
    const issued = await issueSurveyReport(supabase, {
      requestId: request.id,
      user,
      via: 'issue_only',
      measure: ({ customerHtml, internalHtml }) => measureSurveyReportPaper(supabase, {
        customerHtml, internalHtml, deadline, session,
      }),
      req,
    });
    if (issued.state !== 'issued') {
      // `reason` เป็นประโยคเต็มพร้อมทางออกแล้ว (ดึงผลกลับ / กดอีกครั้ง) — ไม่ต่อท้ายซ้ำ
      return docError(req, issued.reason, ISSUE_STATUS[issued.code] || 500, {
        code: issued.code, reasons: issued.reasons, retry: issued.retry === true,
        // ติดแค่ข้อกันเอกสารของใบที่มีพื้นที่ประเมินจากแบบ (mig 0408) — คีย์มีเฉพาะตอนนั้น ผลอื่นรูปเดิมทุกคีย์
        ...(issued.hold === true ? { hold: true } : {}),
      });
    }

    /* ── แจ้งผู้ขอ — เฉพาะเลขใหม่ · **ก่อน** ขั้นกระดาษ (I5b วัดผ่านแล้ว กระดาษล้มได้แค่เพราะ chromium/ที่เก็บ
       และกดซ้ำหลังจากนั้นได้ `reused` ซึ่งไม่เขียนบรรทัดนี้อีก) */
    if (issued.reused === false) {
      await tellRequester(supabase, { request, docNo: issued.docNo, rev: issued.rev, user, req });
    }

    /* ── ขั้นกระดาษ (P1–P7) — เดินเสมอ แม้ได้ฉบับเดิม: จอเรียก POST นี้ต่อจากการส่งผลที่ออกเลขแล้ว
       เพื่อให้หัวหน้าที่ยังอยู่หน้าจอเห็นปัญหาของกระดาษทันที */
    const paper = issued.reportId
      ? await ensureSurveyReportPaper(supabase, { reportId: issued.reportId, want: 'both', deadline, user, session })
      : { state: null, code: 'read_failed', reasons: [SURVEY_REPORT_PAPER_REASONS.read_failed] };

    /* 200 เสมอเมื่อมีเลขแล้ว — กระดาษที่ยังไม่เสร็จบอกด้วย `reason` (GET ถัดไปหรือกดอีกครั้งทำต่อจากแถว)
       🔴 คัดคีย์ทีละตัว — id ของแถว (= ที่อยู่ไฟล์) ต้องไม่ออก payload */
    const report = {
      state: paper?.state || 'issued',
      docNo: issued.docNo,
      rev: issued.rev,
      reused: issued.reused === true,
      warnings: Array.isArray(issued.warnings) ? issued.warnings : [],
    };
    if (paper?.code) {
      report.reason = paper.code === 'not_production' ? SURVEY_REPORT_NOT_PRODUCTION : paperReason(paper, { internal: true });
    }
    return ok({ report });
  } catch (e) {
    console.error('[survey-report] POST ออกเอกสารล้มกลางทาง', id, e?.stack || errorText(e));
    return docError(req, 'ออกเอกสารไม่สำเร็จ — กดออกเอกสารอีกครั้ง ถ้ายังไม่ได้ให้แจ้งผู้ดูแลระบบ', 500);
  } finally {
    await session.close();
  }
});
