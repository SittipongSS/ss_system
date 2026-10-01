// ── รายงานการประเมินพื้นที่ (FM-TS-01) — สถานะของเอกสาร + ด่านตรวจกระดาษ · ตรรกะล้วน ไม่แตะ DB/HTTP/chromium ──
//
// ① `surveyReportState`             สถานะของเอกสารหนึ่งคำร้อง **อนุมานจากแถว** (+ นาฬิกา) — ไม่มีคอลัมน์สถานะ ไม่มีแถว "ล้มเหลว"
//                                    ⇒ ทุกขั้นที่ตายกลางทางเดินต่อได้จากแถวที่เหลืออยู่ (ออกเลขแล้ว → ตรึงแล้ว → PDF ครบ)
// ② `surveyReportRpcError`          ข้อผิดพลาดของ RPC `issue_survey_report` (mig 0401) → รหัส + ข้อความไทย
//    `surveyReportRpcConflict`      ผลของการอ่านซ้ำเมื่อ RPC ตอบ "มีฉบับที่ใช้อยู่แล้ว" / `23505`
// ③ `surveyReportPaperIssues`       ผลวัดจริงของ chromium ต่อฉบับ: อะไร **ห้ามตรึง** · อะไรแค่ลง log
// ④ `surveyReportCustomerHtmlIssues` ยามกันรั่วของฉบับลูกค้า — ตรวจ HTML ที่กำลังจะตรึง (คอลัมน์เขียนครั้งเดียว)
//
// 🔴 ไฟล์นี้อยู่บนเส้น import ของ GET ใบประเมิน (ที่ช่างเปิด) · GET คำร้อง · ส่งผล · ดึงผลกลับ
//   ⇒ **ห้าม import ของหนัก** (`sharp` · chromium · ตัวเรนเดอร์ที่พกฟอนต์ base64) — token ของรูปจึงประกาศซ้ำที่นี่
//   แล้วให้เทสต์ล็อกว่าตรงกับ `surveyReportImageToken` ของตัวเรนเดอร์ (surveyReportState.test.mjs)
import { pdfFonts, pdfPageCount } from '@/lib/documents/pdfInspect';

/* ══ ① สถานะ ═══════════════════════════════════════════════════════════ */

/** สถานะทั้งแปด — ลำดับตามวงจรของเอกสาร */
export const SURVEY_REPORT_STATES = Object.freeze([
  'not_sent', 'recalled', 'issuing', 'missing', 'issued', 'frozen', 'ready', 'stale',
]);

/** หน้าต่าง "น่าจะยังออกเอกสารอยู่" หลังส่งผล — งบเตรียมรูปของการส่ง 60 วิ + หมดเวลาไฟล์เดียว 30 วิ + RPC
 *  ⚠️ เป็นการเดาจากนาฬิกา: การส่งที่ตายตั้งแต่ต้นจะขึ้น "กำลังออกเอกสาร" ได้นานสุดเท่านี้ก่อนปุ่มกลับมา */
export const SURVEY_REPORT_ISSUING_MS = 180_000;

const list = (v) => (Array.isArray(v) ? v : []);

/** จุดเวลา → มิลลิวินาที · อ่านไม่ได้/ไม่มี = NaN (ผู้เรียกต้องถือว่า "ไม่เท่ากับอะไรเลย") */
function toMs(value) {
  if (value === null || value === undefined || value === '') return NaN;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  return Date.parse(String(value));
}

/** สองจุดเวลาคือจุดเดียวกันไหม — เทียบเป็นมิลลิวินาที (สตริงของ PostgREST กับของแอปเขียนคนละรูปได้)
 *  🔴 อ่านไม่ได้ฝั่งใดฝั่งหนึ่ง = **ไม่เท่า** (NaN) ⇒ ฝั่งปลอดภัย: ไม่เสิร์ฟ ไม่ใช้ซ้ำ */
function sameInstant(a, b) {
  const x = toMs(a);
  return Number.isFinite(x) && x === toMs(b);
}

/**
 * ฉบับที่ใช้อยู่ของคำร้อง — แถว `status = 'current'` (ฐานบังคับให้มีได้ใบเดียว · ถ้าเจอเกินหนึ่ง หยิบ rev สูงสุด)
 * @param reports แถวของคำร้องเดียว ลำดับใดก็ได้
 */
export function surveyReportCurrent(reports) {
  let hit = null;
  for (const row of list(reports)) {
    if (row?.status !== 'current') continue;
    if (!hit || Number(row.rev) > Number(hit.rev)) hit = row;
  }
  return hit;
}

/**
 * ฉบับ `current` ที่ **ไม่ใช่ของผลรอบนี้** — `approvedAt` ของแถวไม่ตรงกับ `answeredAt` ของคำร้อง
 * = trigger ที่ต้องแทนที่ฉบับเก่าตอนดึงผลกลับ/เปิดเรื่องกลับไม่ทำงาน (mig 0401 ⑤) ⇒ ห้ามเสิร์ฟ ห้ามใช้ซ้ำ
 * ⚠️ คำร้องที่ `answeredAt` ว่างแต่ยังมีฉบับ current ก็นับ (ดึงผลกลับแล้วแต่ฉบับไม่ถูกแทน)
 */
export function surveyReportIsStale(request, report) {
  if (!report) return false;
  return !sameInstant(report.approvedAt, request?.answeredAt);
}

/**
 * สถานะของเอกสาร (ตารางของ PR-2 §1)
 *
 *   not_sent  ยังไม่เคยส่งผล ไม่มีแถว
 *   recalled  ดึงผลกลับแล้ว แถวที่มีถูกแทนที่หมด — ส่งรอบหน้าได้ Rev ถัดไป
 *   issuing   ส่งผลแล้ว ยังไม่มีฉบับ · สวิตช์ออกตอนส่งเปิด · เพิ่งส่งไม่เกิน 180 วิ — น่าจะกำลังออก
 *   missing   ส่งผลแล้ว ไม่มีเอกสาร (หัวหน้ากด "ออกเอกสาร")
 *   issued    มีเลข + ภาพนิ่ง + รูป แต่ยังไม่มีกระดาษ
 *   frozen    HTML ตรึงแล้ว PDF ยังไม่ครบสองฉบับ
 *   ready     PDF ครบสองฉบับ
 *   stale     ฉบับ current ไม่ใช่ของผลรอบนี้ (ดู `surveyReportIsStale`)
 *
 * @param request  แถว `dept_requests` (อ่านแค่ `answeredAt`)
 * @param reports  แถว `service_survey_reports` ของคำร้องนี้ทุกฉบับ (`status` · `rev` · `approvedAt` · `frozenAt` · `…PdfPath`)
 * @param opts.now          นาฬิกา (ms · Date · ISO) — ไม่ส่ง = ตอนนี้
 * @param opts.issueAtSend  ผลของ `surveyReportIssueAtSend()` — ปิดอยู่ = ไม่มีสถานะ `issuing`
 * @returns หนึ่งใน `SURVEY_REPORT_STATES`
 */
export function surveyReportState(request, reports, { now = Date.now(), issueAtSend = false } = {}) {
  const rows = list(reports).filter(Boolean);
  const current = surveyReportCurrent(rows);

  if (current) {
    if (surveyReportIsStale(request, current)) return 'stale';
    if (!current.frozenAt) return 'issued';
    return current.customerPdfPath && current.internalPdfPath ? 'ready' : 'frozen';
  }

  if (!request?.answeredAt) return rows.length ? 'recalled' : 'not_sent';

  /* อายุของคำตอบ: นาฬิกาแอปกับฐานคลาดกันได้นิดหน่อย ⇒ คำตอบ "จากอนาคต" ภายในหน้าต่างเดียวกันยังนับว่าเพิ่งส่ง
     เกินหน้าต่าง (หรืออ่านเวลาไม่ได้) = `missing` — ปุ่มออกเอกสารต้องกลับมาเสมอ ไม่ค้าง "กำลังออก" ตลอดไป */
  const age = toMs(now) - toMs(request.answeredAt);
  if (issueAtSend && Number.isFinite(age) && Math.abs(age) < SURVEY_REPORT_ISSUING_MS) return 'issuing';
  return 'missing';
}

/* ══ ② ข้อผิดพลาดของ RPC ═══════════════════════════════════════════════ */

/** ข้อความไทยของเหตุที่ออกเลขไม่ได้ — ที่เดียว (ขั้นออกเลข · route เอกสาร · การ์ดควบคุมพูดคำเดียวกัน) */
export const SURVEY_REPORT_REASONS = Object.freeze({
  answer_changed: 'ผลถูกดึงกลับหรือส่งใหม่ระหว่างออกเอกสาร — ยังไม่ได้ออกเอกสาร',
  not_answered: 'ใบนี้ยังไม่ได้ส่งผล หรือถูกยกเลิกแล้ว — ออกเอกสารไม่ได้',
  stale_current: 'เอกสารฉบับที่ใช้อยู่ไม่ตรงกับผลที่ส่งรอบล่าสุด — แจ้งผู้ดูแลระบบ',
  conflict: 'ออกเลขเอกสารไม่สำเร็จ (เลขชนกัน) — แจ้งผู้ดูแลระบบ',
  sequence_exhausted: 'เลข SU ของปีนี้ครบ 9999 แล้ว — แจ้งผู้ดูแลระบบ',
  db_not_ready: 'ฐานข้อมูลยังไม่พร้อม (mig 0401) — แจ้งผู้ดูแลระบบ',
  rpc_failed: 'ออกเลขเอกสารไม่สำเร็จ — กดออกเอกสารอีกครั้ง ถ้ายังไม่ได้ให้แจ้งผู้ดูแลระบบ',
});

const failure = (code, reason, { retry = false, recheck = false, log = null } = {}) => ({ code, reason, retry, recheck, log });

/** ข้อความดิบสำหรับ log — message + details + ชื่อ constraint (ของ `23505`: รู้ว่าชนที่ docNo · (requestId, rev) หรือ PK) */
function rawRpcError(error, code, message) {
  const constraint = /constraint "([^"]+)"/.exec(`${message} ${error?.details ?? ''}`)?.[1] || null;
  return [
    code ? `[${code}]` : null,
    message || '(ไม่มีข้อความ)',
    error?.details ? `· ${error.details}` : null,
    constraint ? `· constraint ${constraint}` : null,
  ].filter(Boolean).join(' ');
}

/**
 * ข้อผิดพลาดของ `supabase.rpc('issue_survey_report')` → ผลที่ขั้นออกเลขใช้ต่อ · จับด้วย **คำขึ้นต้นของข้อความ** ที่ RPC ยก
 *
 * @param error `{ code, message, details }` ของ supabase (หรือ Error / สตริง) — ไม่มี = `null`
 * @returns `null | { code, reason, retry, recheck, log }`
 *   · `code`    `answer_changed` | `not_answered` | `rpc_failed`
 *   · `reason`  ข้อความไทยให้คนอ่าน
 *   · `retry`   กด "ออกเอกสาร" ซ้ำแล้วมีโอกาสผ่านไหม
 *   · `recheck` `true` = **อย่าเพิ่งตอบ** — อ่านแถวเอกสารกับคำร้องใหม่ แล้วให้ `surveyReportRpcConflict` ตัดสิน
 *               (`code`/`reason` ที่ให้มาคือคำตอบเมื่ออ่านซ้ำแล้วไม่เข้ากรณีไหนเลย)
 *   · `log`     ข้อความดิบให้ `console.error` — `null` เมื่อเป็นเรื่องปกติของการแข่งกัน (ไม่ต้องลง log)
 *
 * 🪤 **`23505` ไม่ได้แปลว่า "มีฉบับที่ใช้อยู่แล้ว"** — RPC ล็อกแถวคำร้อง (`FOR UPDATE`) แล้วยก
 *   `survey_report_already_current` เองก่อน insert ⇒ `23505` มาได้จาก docNo UNIQUE (ตัวนับถูกถอย) ·
 *   UNIQUE (requestId, rev) · PK เท่านั้น ซึ่งไม่มีฉบับ current ให้คืน ⇒ ต้องอ่านซ้ำก่อนตัดสินทุกครั้ง
 */
export function surveyReportRpcError(error) {
  if (!error) return null;
  const message = String(typeof error === 'string' ? error : error.message ?? '').trim();
  const code = typeof error === 'string' ? '' : String(error.code ?? '');
  const raw = rawRpcError(typeof error === 'string' ? null : error, code, message);
  const R = SURVEY_REPORT_REASONS;

  if (message.startsWith('survey_answer_changed')) return failure('answer_changed', R.answer_changed);
  if (message.startsWith('survey_request_invalid')) return failure('not_answered', R.not_answered);
  if (message.startsWith('survey_report_sequence_exhausted')) return failure('rpc_failed', R.sequence_exhausted, { log: raw });
  if (message.startsWith('survey_report_already_current') || code === '23505') {
    return failure('rpc_failed', R.conflict, { recheck: true, log: code === '23505' ? raw : null });
  }
  // ฟังก์ชันไม่อยู่ใน schema cache ของ PostgREST (ยังไม่รัน mig 0401 / ยังไม่ reload) · 42883 = Postgres หาฟังก์ชันไม่เจอ
  if (code === 'PGRST202' || code === '42883') return failure('rpc_failed', R.db_not_ready, { log: raw });
  return failure('rpc_failed', R.rpc_failed, { retry: true, log: raw });
}

/**
 * ตัดสินหลังอ่านซ้ำ — ใช้เมื่อ `surveyReportRpcError(...).recheck` (`survey_report_already_current` หรือ `23505`)
 *
 * @param p.request    คำร้องที่ **อ่านใหม่** (อ่านแค่ `answeredAt`)
 * @param p.reports    แถวเอกสารของคำร้องที่ **อ่านใหม่**
 * @param p.answeredAt ค่า `p_answered_at` ที่ส่งให้ RPC รอบที่ล้ม
 * @returns `{ state: 'issued', reused: true, report }` — มีฉบับที่ใช้อยู่ของผลรอบนี้ (อีกคำขอออกไปก่อน)
 *        | `{ state: 'failed', code, reason, retry }` — `stale_current` · `answer_changed` · `rpc_failed` (เลขชนกัน)
 */
export function surveyReportRpcConflict({ request = null, reports = [], answeredAt = null } = {}) {
  const R = SURVEY_REPORT_REASONS;
  const failed = (code, reason) => ({ state: 'failed', code, reason, retry: false });
  const current = surveyReportCurrent(reports);
  if (current) {
    return surveyReportIsStale(request, current)
      ? failed('stale_current', R.stale_current)
      : { state: 'issued', reused: true, report: current };
  }
  if (!sameInstant(request?.answeredAt, answeredAt)) return failed('answer_changed', R.answer_changed);
  return failed('rpc_failed', R.conflict);
}

/* ══ ③ ผลวัดจริงของกระดาษ ══════════════════════════════════════════════ */

/** เนื้อหาควรจบก่อนเส้นท้ายกระดาษอย่างน้อยเท่านี้ (px) — ระยะของ harness (scripts/render-survey-report.mjs)
 *  ⚠️ ต่ำกว่านี้แต่ยังไม่ถึงเส้น = **ลง log เท่านั้น** ไม่กันการตรึง: ไม่มีอะไรถูกตัด และแผนหน้าปัดงบขึ้นทุกตัวอยู่แล้ว */
export const SURVEY_REPORT_FIT_MARGIN = 8;

const IMAGE_TOKEN = 'su-img:';
const IMAGE_TOKEN_SHA_RE = /su-img:([0-9a-f]{64})/g;
const SHEET_OPEN = '<article class="sheet';

/** นับสตริงย่อย (ไม่ซ้อนทับ) */
function countOf(text, needle) {
  let n = 0;
  for (let at = text.indexOf(needle); at !== -1; at = text.indexOf(needle, at + needle.length)) n += 1;
  return n;
}

const px = (v) => (Math.round(Number(v) * 100) / 100).toString();
const isPaperFont = (name) => /^Sarabun(?:-|$)/.test(name);

/**
 * ตรวจฉบับหนึ่งหลัง chromium พิมพ์ + วัดแล้ว — แผ่นเป็น `overflow: hidden` ของล้นถูกตัดเงียบ ต้องวัดถึงจะรู้
 *
 * @param p.html          HTML ที่ **ส่งให้ chromium** (token `su-img:` ถูกแปลงเป็น data URI แล้ว)
 * @param p.fit           ผลของ `measureSheets` — `[{ page, rule, last, lastBlock }]` (lib/documents/htmlPdf.js)
 * @param p.brokenImages  จำนวนรูปที่เบราว์เซอร์ถอดรหัสไม่ได้
 * @param p.buffer        PDF ที่พิมพ์ได้
 * @returns `[{ kind, text, page }]` — `page` = เลขหน้า หรือ `null` เมื่อเป็นเรื่องของทั้งฉบับ
 *   · `kind: 'block'` **ห้ามตรึง ห้ามเก็บ PDF** — ยังมี token ของรูปเหลือ · รูปถอดรหัสไม่ได้ ·
 *      จำนวนแผ่นใน HTML / แผ่นที่วัดได้ / หน้าของ PDF ไม่เท่ากัน (รวมนับหน้า PDF ไม่ได้) ·
 *      แผ่นไม่มีเส้นท้ายกระดาษ · เนื้อหาเลยเส้นท้ายกระดาษ
 *   · `kind: 'log'`   ตรึงได้ ลง log — เหลือที่ใต้เนื้อหาน้อยกว่า `SURVEY_REPORT_FIT_MARGIN` ·
 *      PDF ฝังฟอนต์นอกจาก Sarabun หรือมี Type3 (มีอักขระที่ฟอนต์ฝังไม่มี ⇒ ขึ้นเป็นกล่องสี่เหลี่ยม)
 */
export function surveyReportPaperIssues({ html, fit, brokenImages = 0, buffer } = {}) {
  const issues = [];
  const block = (text, page = null) => issues.push({ kind: 'block', text, page });
  const log = (text, page = null) => issues.push({ kind: 'log', text, page });
  const source = String(html ?? '');
  const sheets = list(fit);

  const tokens = countOf(source, IMAGE_TOKEN);
  if (tokens) block(`รูป ${tokens} รูปยังไม่ถูกฝังลงกระดาษ (เหลือ ${IMAGE_TOKEN} ใน HTML)`);
  if (Number(brokenImages) > 0) block(`รูปถอดรหัสไม่ได้ ${Number(brokenImages)} รูป`);

  /* สามตัวเลขต้องเท่ากัน: แผ่นที่ตัวเรนเดอร์เขียน · แผ่นที่เบราว์เซอร์วัดเจอ · หน้าที่ PDF มีจริง
     (แผ่นที่สูงเกินหน้ากระดาษทำให้ PDF มีหน้าเกิน — HTML กับผลวัดยังเท่ากันอยู่ จึงต้องนับที่ PDF ด้วย) */
  const articles = countOf(source, SHEET_OPEN);
  const hasPdf = !!buffer && buffer.length > 0;
  const pdfPages = hasPdf ? pdfPageCount(buffer) : null;
  if (!hasPdf) {
    block('ไม่มีไฟล์ PDF ให้ตรวจ');
  } else if (pdfPages === null) {
    block(`นับหน้าของ PDF ไม่ได้ (HTML ${articles} แผ่น · วัดได้ ${sheets.length} แผ่น)`);
  } else if (!articles || articles !== sheets.length || articles !== pdfPages) {
    block(`จำนวนแผ่นไม่ตรงกัน — HTML ${articles} แผ่น · วัดได้ ${sheets.length} แผ่น · PDF ${pdfPages} หน้า`);
  }

  sheets.forEach((m, i) => {
    const page = Number(m?.page) || i + 1;
    const rule = m?.rule;
    const last = m?.last;
    if (rule === null || rule === undefined || !Number.isFinite(Number(rule))) {
      block(`หน้า ${page} ไม่มีเส้นท้ายกระดาษ`, page);
      return;
    }
    if (last === null || last === undefined || !Number.isFinite(Number(last))) {
      block(`หน้า ${page} วัดขอบล่างของเนื้อหาไม่ได้`, page);
      return;
    }
    const room = Number(rule) - Number(last);
    const under = m.lastBlock ? ` ใต้ ${m.lastBlock}` : '';
    if (room < 0) block(`หน้า ${page} เนื้อหาเลยเส้นท้ายกระดาษ ${px(-room)}px${under}`, page);
    else if (room < SURVEY_REPORT_FIT_MARGIN) log(`หน้า ${page} เหลือที่ใต้เนื้อหา ${px(room)}px (น้อยกว่า ${SURVEY_REPORT_FIT_MARGIN}px)${under}`, page);
  });

  if (hasPdf) {
    const fonts = pdfFonts(buffer);
    const foreign = list(fonts?.names).filter((name) => !isPaperFont(name));
    const type3 = Number(fonts?.type3) || 0;
    if (foreign.length || type3) {
      log(`PDF มีฟอนต์นอกจาก Sarabun — ${[...foreign, type3 ? `Type3 × ${type3}` : null].filter(Boolean).join(' · ')} (มีอักขระที่ฟอนต์ฝังไม่มี)`);
    }
  }
  return issues;
}

/* ══ ④ ยามกันรั่วของฉบับลูกค้า ═════════════════════════════════════════ */

/* 🔴 ชิ้นที่ตัวเรนเดอร์พิมพ์ให้ **ฉบับภายในเท่านั้น** — จับด้วย markup ของตัวเรนเดอร์ ไม่ใช่คำไทยในเนื้อความ
   ข้อความที่คนพิมพ์ (หมายเหตุพื้นที่ · ชื่อพื้นที่ · ชื่อไซต์ · ชื่อลูกค้า) ผ่าน `esc` ทุกตัว: `<` `>` `"` ถูกแปลง
   ⇒ พิมพ์อย่างไรก็สร้างสตริงพวกนี้ไม่ได้ · มติเจ้าของข้อ 3: ข้อความของผู้สำรวจพิมพ์ตามที่พิมพ์มา
   🐞 เดิมค้นคำว่า "ฉบับภายใน" ทั้ง HTML — หมายเหตุ "รายละเอียดดูฉบับภายใน" ผ่านรอบตรวจก่อนส่งผล แล้วมาติดที่นี่หลังคำร้อง
     ถูกตอบไปแล้ว: กดออกเอกสารกี่ครั้งก็ติด ทางออกเดียวคือดึงผลกลับ (ขัดมติข้อ 2 — ปัญหาของกระดาษต้องตีกลับก่อนเขียน)
   ⚠️ ตัวเรนเดอร์อยู่คนละไฟล์ (ของหนัก ห้าม import) — เทสต์ล็อกว่าทุกแถวเจอใน HTML ฉบับภายในของตัวเรนเดอร์จริง
     และไม่เจอสักแถวในฉบับลูกค้า (surveyReportState.test.mjs) */
const INTERNAL_MARKUP = Object.freeze([
  ['แถบฉบับภายใน', /<div class="band">|class="band-[tr]"/],
  ['ป้ายฉบับที่ท้ายกระดาษ', /<span><b>[^<]*<\/b> · หน้า \d/],
  ['แผงข้อมูลภายใน', /class="content i1"|class="i(?:panel|grid|strip)"/],
  ['บรรทัดอธิบายคอลัมน์จุด', /class="intro tnote"/],
  ['ส่วนจุดติดตั้ง', /class="ph sp"|class="sp-(?:b|note)"/],
  ['ภาคผนวกภายใน', /data-kind="appendix"|class="leadrow"|<table class="kv">|class="sign-last"|data-m="signs"/],
]);

/**
 * sha ของรูปที่ฉบับลูกค้าพิมพ์ได้ — **ภาพกว้างกับภาพผังของพื้นที่ที่ไม่ถูกตัด** เท่านั้น
 * 🔴 ห้ามสร้างชุดนี้จาก `images[].kind` — ลิสต์นั้นเก็บหนึ่งแถวต่อ sha พร้อม kind ที่เจอครั้งแรก · ภาพกว้างกับรูปจุด
 *   ย่อขนาดเดียวกัน (1000px) และของจริงมีไฟล์เดียวถูกใช้เป็นทั้งภาพกว้างและรูปจุด ⇒ ตัดด้วย kind = บล็อกเอกสารที่ถูกต้อง
 */
function customerImageShas(snapshot) {
  const allowed = new Set();
  for (const zone of list(snapshot?.zones)) {
    if (!zone || (zone.status || 'ok') === 'cut') continue;
    for (const img of [...list(zone.wide), ...list(zone.plan)]) if (img?.sha) allowed.add(img.sha);
  }
  return allowed;
}

/**
 * ตรวจ HTML ฉบับลูกค้าก่อนออกเลข และ **อีกครั้งก่อนตรึง** — HTML ที่ตรึงอาจถูกเรนเดอร์โดย deploy ที่ใหม่กว่า
 * ตัวที่ออกเลข (ตัวเรนเดอร์เปลี่ยนได้ระหว่างนั้น) และคอลัมน์ HTML เขียนได้ครั้งเดียว
 *
 * @param p.html      HTML ฉบับลูกค้าที่ยังเป็น token (`su-img:<sha>`) — ตัวที่จะตรึง
 * @param p.snapshot  ภาพนิ่งของแถว (`zones[].wide` · `zones[].plan` · `zones[].status`)
 * @param p.layout    แผนหน้าของ **ฉบับลูกค้า** (`paginateSurveyReport(surveyReportView(snapshot))`)
 * @returns ข้อความไทยของทุกข้อที่ผิด — `[]` = ผ่าน · มีสักข้อ = ห้ามออกเลข/ห้ามตรึง
 *   ① sha ทุกตัวใน HTML อยู่ในชุดที่ฉบับลูกค้าพิมพ์ได้ (รูปจุดติดตั้งไม่อยู่)
 *   ② ไม่มีชิ้นของฉบับภายใน (แถบ · ป้ายท้ายกระดาษ · แผงภายใน · ส่วนจุด · ภาคผนวก) — ดูจาก markup ของตัวเรนเดอร์
 *      (`INTERNAL_MARKUP`) · คำว่า "ฉบับภายใน" ในข้อความที่คนพิมพ์ **ไม่ติด**
 *   ③ จำนวนแผ่นเท่ากับ `pageCount` ของแผนหน้าฉบับลูกค้า (ฉบับภายในมีหน้ามากกว่าเสมอ — ภาคผนวก)
 * ⚠️ fail-closed: ไม่มี HTML · ไม่มีภาพนิ่ง · ไม่มีแผนหน้า = มีข้อผิด
 */
export function surveyReportCustomerHtmlIssues({ html, snapshot, layout } = {}) {
  const issues = [];
  const source = String(html ?? '');
  if (!source.trim()) return ['ไม่มี HTML ของฉบับลูกค้าให้ตรวจ'];

  if (!snapshot || !Array.isArray(snapshot.zones)) {
    issues.push('ไม่มีภาพนิ่งของเอกสารให้เทียบรูปของฉบับลูกค้า');
  } else {
    const allowed = customerImageShas(snapshot);
    const foreign = [...new Set([...source.matchAll(IMAGE_TOKEN_SHA_RE)].map((m) => m[1]))].filter((sha) => !allowed.has(sha));
    if (foreign.length) {
      issues.push(`ฉบับลูกค้ามีรูปที่ไม่ใช่ภาพกว้าง/ภาพผังของพื้นที่ ${foreign.length} รูป (${foreign.map((sha) => sha.slice(0, 12)).join(' · ')})`);
    }
  }

  const internal = INTERNAL_MARKUP.filter(([, re]) => re.test(source)).map(([name]) => name);
  if (internal.length) issues.push(`ฉบับลูกค้ามีชิ้นของฉบับภายใน (${internal.join(' · ')})`);

  const sheets = countOf(source, SHEET_OPEN);
  const planned = Number(layout?.pageCount);
  if (!Number.isInteger(planned) || planned < 1) issues.push('ไม่มีแผนหน้าของฉบับลูกค้าให้เทียบจำนวนแผ่น');
  else if (sheets !== planned) issues.push(`ฉบับลูกค้ามี ${sheets} แผ่น แต่แผนหน้าของฉบับลูกค้ามี ${planned} หน้า`);

  return issues;
}
