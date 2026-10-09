// ── ขั้นออกเลขของรายงานการประเมินพื้นที่ (PR-2 §3 · I0–I8) ─────────────────────────────────────
//
// ⭐ **หนึ่งฟังก์ชัน สองผู้เรียก** — เส้นส่งผล (`via: 'send'` · หลังเขียนคำตอบ กระดิ่ง และ audit แล้ว) กับปุ่ม "ออกเอกสาร"
//   ของใบที่ตอบไปแล้วแต่ยังไม่มีเอกสาร (`via: 'issue_only'` · POST ของ route เอกสาร) ⇒ ด่านและภาพนิ่งเป็นชุดเดียวกันเสมอ
//
//   I0 ยามเขียนถาวร + คำร้องที่ตอบแล้ว   I1 มีฉบับที่ใช้อยู่แล้วไหม (ใช่ = ใช้ซ้ำ ไม่ออกเลขใหม่)
//   I2 อ่านข้อมูลที่ล็อกแล้วใหม่ทั้งชุด        I3 ด่านส่งผล + เหตุที่ตรึงไม่ได้ + หน้าล้น (ทั้งสองฉบับ)
//   I4 รูป: ใช้ของรอบตรวจ เติมเฉพาะที่ขาด    I5 ภาพนิ่งโหมด freeze + เรนเดอร์แห้งสองฉบับ + ยามกันรั่วของฉบับลูกค้า
//   I5b วัดกระดาษจริงใน chromium (เฉพาะ POST)  I6 RPC ออกเลข + เขียนแถว   I7 อ่านแถวกลับ   I8 audit
//
// 🔴 **ไม่มีทางโยน error เข้า route** — การส่งผลสำเร็จไปแล้วก่อนถึงตรงนี้ · ทุกทางล้มกลับมาเป็น `{ state: 'failed', code, reason }`
//   และ **ไม่มีอะไรถูกเขียนก่อน I6 นอกจากรูป `img/<sha>.jpg`** (อ้างด้วยเนื้อไฟล์ รอบหน้าใช้ซ้ำ) ⇒ ตายขั้นไหนก็กดใหม่ได้
//
// 🔴 **เดินต่อได้จากแถวล้วน ๆ** (§11) — ไม่มีสถานะ "กำลังออก" เก็บที่ไหน: รอบถัดไปเริ่ม I0 ใหม่ทุกครั้ง · I1 เจอฉบับที่ใช้อยู่
//   = ใช้ซ้ำ · เลขรันถูกกินใน RPC ทรานแซกชันเดียวกับแถว (0401 ④) ⇒ ล้มก่อนหรือใน RPC ไม่เสียเลข · RPC ซ้อนกัน = ฉบับเดียว
//
// 🔴 **เขียนของถาวรได้บน production เท่านั้น** (§0 · dev DB = prod DB) — ยามปิด = `not_production` ก่อนอ่านอะไรทั้งสิ้น
//   ⇒ แผนที่รูปที่ทำตอนยามปิด (sha ที่ไม่ได้อยู่ใน bucket) ไม่มีวันไปถึงภาพนิ่งโหมด freeze
//
// ⚠️ ไฟล์นี้ **ไม่เขียนบรรทัดเธรด** — เส้นส่งผลมีแถวคำตอบที่ยิงกระดิ่งอยู่แล้ว · บรรทัดแจ้งผู้ขอของปุ่ม "ออกเอกสาร" เป็นของ
//   route เอกสารตัวเดียว (มติ 34 · เทสต์อ่านซอร์สล็อกว่าชื่อชนิดเธรดนั้นไม่อยู่ที่นี่)
// ⚠️ ของหนัก: ตัวย่อรูป (`sharp` · Drive) โหลดด้วย `await import('./surveyReportImages')` ข้างในขั้น I4 เท่านั้น ·
//   chromium ไม่ถูกแตะจากไฟล์นี้เลย — ตัววัดกระดาษ (`measure`) ถูกส่งเข้ามาจาก route เอกสาร
import 'server-only';
import { recordAudit } from '@/lib/audit';
import { genId } from '@/lib/id';
import { surveyPackageSizeSendError } from './packageSizes';
import { surveySendError } from './survey';
import { renderSurveyReportHTML } from './surveyReportDocument';
import { loadSurveyReportInputs } from './surveyReportInputs';
import { paginateSurveyReport, surveyReportOverflowErrors } from './surveyReportLayout';
import { parseSurveyReportNo, surveyReportYymm } from './surveyReportNumber';
import { SURVEY_REPORT_NOT_PRODUCTION, loadSurveyReports, surveyReportStoreAllowed } from './surveyReportRows';
import {
  SURVEY_REPORT_INPUT_LABELS, buildSurveyReportSnapshot, surveyReportFreezeIssues, surveyReportImageFiles,
} from './surveyReportSnapshot';
import {
  SURVEY_REPORT_REASONS, surveyReportCurrent, surveyReportCustomerHtmlIssues, surveyReportIsStale,
  surveyReportRpcConflict, surveyReportRpcError,
} from './surveyReportState';
import { surveyReportSendWarnings, surveyReportView } from './surveyReportView';
import { surveySpotSendError } from './surveySpotPhotos';

/** งบเวลาของรอบเติมรูป (ms จากตอนเริ่ม I4) เมื่อผู้เรียกไม่ส่ง `deadline` — หลังล็อกของเส้นส่งผล 20 วิ · ปุ่ม "ออกเอกสาร" 180 วิ (§5) */
export const SURVEY_REPORT_IMAGE_BUDGET_MS = Object.freeze({ send: 20_000, issue_only: 180_000 });

/** รหัสของผลที่ล้ม — route เอกสารแปลงเป็นสถานะ HTTP (§6) · เส้นส่งผลส่งต่อใน `report.code` */
export const SURVEY_REPORT_ISSUE_CODES = Object.freeze([
  'not_production', 'not_answered', 'read_failed', 'stale_current', 'blocked', 'undecodable', 'images_failed',
  'timeout', 'paper_blocked', 'answer_changed', 'rpc_failed', 'internal',
]);

/* ข้อความไทยของเหตุที่เกิดในขั้นนี้ — เหตุของ RPC อยู่ใน `SURVEY_REPORT_REASONS` (ที่เดียวกับที่การ์ดควบคุมใช้) */
const READ_FAILED = 'อ่านข้อมูลเอกสารของใบนี้ไม่สำเร็จ — กดออกเอกสารอีกครั้ง';
const INTERNAL_FAILED = 'ออกเอกสารไม่สำเร็จ — กดออกเอกสารอีกครั้ง ถ้ายังไม่ได้ให้แจ้งผู้ดูแลระบบ';
const RECALL_HINT = 'ถ้าต้องแก้ ให้ดึงผลกลับมาแก้แล้วส่งใหม่';
const RETRY_HINT = 'แก้แล้วกดออกเอกสารอีกครั้ง';

/* เหตุถาวรของรูป (`SURVEY_IMAGE_FAILURE` ของ surveyReportImages) → คำที่หัวหน้าอ่านออก
   ⚠️ เขียนเป็นสตริงตรง ๆ ไม่ import ค่าคงที่ — โมดูลรูปโหลดแบบ lazy เท่านั้น · เทสต์ล็อกว่าครบทุกเหตุถาวรและ `timeout` ตรงกัน */
const IMAGE_FAILURE_LABELS = Object.freeze({
  no_drive_file: 'ไม่มีไฟล์บน Drive',
  drive_not_found: 'ไฟล์หายจาก Drive',
  drive_forbidden: 'เปิดไฟล์บน Drive ไม่ได้',
  too_large: 'ไฟล์ใหญ่เกิน',
  undecodable: 'ถอดรหัสรูปไม่ได้',
});
const IMAGE_TIMEOUT = 'timeout';

/* ฉบับที่ต้องจัดหน้าและเรนเดอร์ได้ทั้งคู่ — ป้ายนำหน้าเหตุเหมือนรอบตรวจก่อนส่งผล (`surveyReportPrecheck`):
   เลขหน้าของสองฉบับไม่ตรงกัน และ `document.issue.blockers` บนการ์ดต้องพูดคำเดียวกับที่ปุ่มตอบ */
const VERSIONS = [['customer', 'ฉบับลูกค้า'], ['internal', 'ฉบับภายใน']];

const list = (v) => (Array.isArray(v) ? v : []);
const unique = (items) => [...new Set(items)];
const message = (e) => String(e?.message || e || '').trim();

/* ── รูปร่างของผล ─────────────────────────────────────────────────────────────── */

/* 🔴 **id ของแถวเอกสาร = ที่อยู่ไฟล์ PDF** (`pdf/<reportId>/<version>.pdf` · มติ 16) — ผู้ขอ (ฝ่ายขาย) ต้องไม่เห็น
   route เอกสารต้องใช้มันเรียกขั้นกระดาษ ⇒ ติดไปกับผลเป็นคีย์ที่ **ไม่ถูกไล่** (non-enumerable):
   `result.reportId` อ่านได้ แต่ `JSON.stringify` · spread · `Object.keys` ไม่พามันออก payload/audit/เธรดโดยบังเอิญ */
function withReportId(result, reportId) {
  Object.defineProperty(result, 'reportId', { value: reportId || null, enumerable: false });
  return result;
}

const issued = ({ docNo, rev, reused, warnings = [], reportId = null }) => withReportId({
  state: 'issued', code: null, docNo, rev, reused, reasons: [], reason: null, retry: false, warnings,
}, reportId);

/**
 * @param reasons  เหตุทีละข้อ (ข้อความไทย)
 * @param reason   ประโยคเต็มที่ขึ้นจอได้เลย — ไม่ส่ง = เหตุต่อกันด้วย ` | `
 * @param retry    กด "ออกเอกสาร" ซ้ำโดยไม่ต้องดึงผลกลับแล้วมีโอกาสผ่านไหม
 * @param hold     ติดแค่ข้อกันเอกสาร (`blocked`) — ผลได้คีย์ `hold: true` **เฉพาะตอนนี้** · ผลอื่นทุกแบบไม่มีคีย์นี้เลย
 */
const failed = (code, reasons, { reason = null, retry = false, hold = false } = {}) => {
  const lines = unique(list(reasons).map((t) => String(t ?? '').trim()).filter(Boolean));
  return withReportId({
    state: 'failed', code, docNo: null, rev: null, reused: false,
    reasons: lines, reason: reason || lines.join(' | ') || INTERNAL_FAILED, retry, warnings: [],
    ...(hold ? { hold: true } : {}),
  }, null);
};

/* ด่านที่ไม่ผ่าน → `blocked` · มีข้อชนิด `content` = ต้องดึงผลกลับมาแก้ (ใบล็อกแล้ว) · มีแต่ `system` = แก้แล้วกดซ้ำได้
   ⭐ ติดแค่ข้อกันเอกสาร (`hold` — ใบมีพื้นที่ประเมินจากแบบ · `SURVEY_REPORT_DRAWING_HOLD`) = ประโยคไม่มีท่อนทางออก และ `retry: false`:
      ไม่มีอะไรให้แก้ ดึงผลกลับก็ไม่ช่วย กดกี่ครั้งก็ไม่ออก — หายเมื่อระบบรุ่นที่รองรับออก · มีข้ออื่นปนอยู่ = ทางออกของข้อนั้นตามเดิม
   ⚠️ ธง `hold` อ่านจากทุกแถวก่อนยุบข้อความซ้ำ — แถวซ้ำที่ไม่มีธงต้องไม่ทำให้ข้อกันกลายเป็นเหตุที่ "แก้แล้วกดซ้ำได้" */
function blocked(issues) {
  const all = list(issues).filter((i) => i?.text);
  const seen = new Set();
  const rows = all.filter((i) => !seen.has(i.text) && seen.add(i.text));
  const held = new Set(all.filter((i) => i.hold === true).map((i) => i.text));
  const content = rows.some((i) => i.kind === 'content');
  const holdOnly = rows.length > 0 && rows.every((i) => i.kind !== 'content' && held.has(i.text));
  const texts = rows.map((i) => i.text);
  const lead = `ออกเอกสารไม่ได้ — ${texts.join(' | ')}`;
  if (holdOnly) return failed('blocked', texts, { reason: lead, retry: false, hold: true });
  return failed('blocked', texts, {
    reason: `${lead} · ${content ? RECALL_HINT : RETRY_HINT}`,
    retry: !content,
  });
}

/* ── ตัวอ่านเล็ก ๆ (supabase ไม่ throw — อ่าน `{ error }` ทุกตัว · throw ของเครือข่ายจบที่เดียวกัน) ───────────── */

/* ⚠️ รายชื่อคอลัมน์เขียนเป็นสตริงตรง ๆ ในแต่ละคำสั่ง (ไม่ผ่านตัวแปร) — ด่าน `check:columns` แกะ `.select(<ตัวแปร>)` ไม่ได้ */
async function settle(query) {
  try {
    const { data, error } = await query();
    if (error) return { data: null, error };
    return { data: data || null, error: null };
  } catch (error) {
    return { data: null, error };
  }
}

/* ทั้งแถว — ภาพนิ่งพกช่องของคำร้องสิบกว่าช่อง และตัวโหลดอินพุตอ่าน `siteId` · `customerId` · `dealId` (ชุดเดียวกับที่เส้นส่งผลอ่าน) */
async function readRequest(supabase, id) {
  const { data, error } = await settle(() => supabase.from('dept_requests').select('*').eq('id', id).maybeSingle());
  return { request: data, error };
}

/* คำตอบปัจจุบันของคำร้อง — ใช้ตัดสินหลัง RPC ชนกันเท่านั้น */
async function readRequestAnswer(supabase, id) {
  const { data, error } = await settle(() => supabase
    .from('dept_requests').select('id, "answeredAt"').eq('id', id).maybeSingle());
  return { request: data, error };
}

async function readReportRow(supabase, reportId) {
  const { data, error } = await settle(() => supabase
    .from('service_survey_reports').select('id, "docNo", rev, status, "issuedAt"')
    .eq('id', reportId).maybeSingle());
  return { row: data, error };
}

/* แผนที่รูปของรอบตรวจก่อนส่งผล — รับได้ทั้งผลของ `prepareSurveyReportImages` ทั้งก้อน (`{ imageByAttId, failed }`)
   และตัวแผนที่เอง (object หรือ Map) · อย่างอื่น = ไม่มี (เตรียมใหม่ทั้งหมด) */
function preparedMap(prepared) {
  if (!prepared || typeof prepared !== 'object') return null;
  if (prepared instanceof Map) return prepared;
  const inner = prepared.imageByAttId;
  if (inner && typeof inner === 'object') return inner;
  return 'failed' in prepared ? null : prepared;
}

/* ── I4 ผลของการเตรียมรูป → เหตุ ─────────────────────────────────────────────── */

function imageFailure(failedFiles) {
  const rows = list(failedFiles).filter(Boolean);
  const name = (f) => String(f.fileName || f.attId || 'ไฟล์ไม่มีชื่อ');
  const permanent = rows.filter((f) => f.permanent === true);
  if (permanent.length) {
    /* ตัวไฟล์เองคือปัญหา (ถอดรหัสไม่ได้ · หายจาก Drive) — ใบล็อกแล้ว หัวหน้าเปลี่ยนไฟล์ไม่ได้ ⇒ ทางออกเดียวคือดึงผลกลับ
       กดออกเอกสารซ้ำจะล้มที่เดิม (§11 แถว 4) */
    return failed('undecodable', permanent.map((f) => `${name(f)} — ${IMAGE_FAILURE_LABELS[f.reason] || 'เปิดไฟล์ไม่ได้'}`), {
      reason: `รูป ${permanent.length} รูปเปิดไม่ได้ (ชื่อไฟล์ ${permanent.map(name).join(' · ')}) — ยังไม่ได้ออกเอกสาร · `
        + 'ดึงผลกลับ อัปรูปใหม่เป็น JPG แล้วส่งผลอีกครั้ง',
      retry: false,
    });
  }
  const names = rows.map(name);
  if (rows.some((f) => f.reason === IMAGE_TIMEOUT)) {
    return failed('timeout', names, {
      reason: `เตรียมรูปของเอกสารยังไม่เสร็จ (เหลือ ${rows.length} รูป) — ยังไม่ได้ออกเอกสาร กดออกเอกสารอีกครั้ง`,
      retry: true,
    });
  }
  return failed('images_failed', names, {
    reason: `ดึงรูปจาก Drive ไม่สำเร็จ ${rows.length} รูป — ยังไม่ได้ออกเอกสาร กดอีกครั้ง`,
    retry: true,
  });
}

/* ── I5b ผลของตัววัดกระดาษ → เหตุ ────────────────────────────────────────────── */

const VERSION_LABEL = Object.fromEntries(VERSIONS);

/**
 * บรรทัดของตัววัดกระดาษ → ท่อนที่ **หัวหน้าอ่าน** — ตัดรายละเอียดของคนแก้ระบบออก เหลือ "ฉบับไหน · หน้าไหน · เป็นอะไร"
 *
 * 🐞 UAT เอกสารประเมินพื้นที่ (2026-10-08 · S37): กล่องยืนยันและการ์ดพิมพ์ "ฉบับลูกค้า: หน้า 3 เนื้อหาเลยเส้นท้ายกระดาษ 6.4px ใต้ td.zn" —
 *    ค่าวัดเป็น px กับชื่อชิ้นของหน้า (tag.class) ไปถึงหัวหน้า ซึ่งทำอะไรกับมันไม่ได้ · ตัววัดยังพิมพ์ "(เหลือ su-img: ใน HTML)" และ
 *    "HTML 4 แผ่น · วัดได้ 4 แผ่น · PDF 5 หน้า" ได้ด้วย (`surveyReportPaperIssues` ของ surveyReportState)
 * ⭐ ของที่ตัด **ไม่หาย**: บรรทัดเต็มยังอยู่ใน `reasons` ของผล และลง log ของ server ที่ `measurePaper`
 * ⚠️ ตัดเฉพาะท่อนท้ายสามรูปที่ตัววัดต่อให้ (ค่าวัด + ชิ้นของหน้า · วงเล็บของ HTML · จำนวนแผ่นของ HTML/PDF) — บรรทัดอื่นผ่านไปตามเดิม
 *    · เทสต์ยิงบรรทัดจริงของตัววัดผ่านฟังก์ชันนี้ (ตัววัดเปลี่ยนถ้อยคำเมื่อไร เทสต์ฟ้อง)
 */
export function surveyReportPaperLineForReader(line) {
  return String(line ?? '')
    .replace(/ \d+(?:\.\d+)?px(?: ใต้ \S+)?$/, '')
    .replace(/ \((?:เหลือ [^)]*ใน HTML|HTML [^)]*)\)$/, '')
    .replace(/ — HTML \d+ แผ่น · .*$/, '')
    .trim();
}

/**
 * เรียกตัววัดที่ route เอกสารส่งมา (ขั้นกระดาษเป็นเจ้าของ — เปิด chromium · แปลง token จาก bucket · `surveyReportPaperIssues`)
 * สัญญา: `measure({ customerHtml, internalHtml, deadline })` → `{ issues: [{ version, kind, text, page }], error }`
 *   · `kind: 'block'` (หรือสตริงล้วน) = ห้ามออกเลข · `kind: 'log'` = ลง log เท่านั้น · `error` (ข้อความ) = วัดไม่ได้เลย
 * @returns `null` = ผ่าน · ไม่งั้นผลที่ล้ม (`paper_blocked`) — **ยังไม่มีเลขถูกออก**
 */
async function measurePaper(measure, payload, label) {
  let result;
  try {
    result = await measure(payload);
  } catch (e) {
    console.error(`[survey-report] วัดกระดาษของ ${label} ไม่สำเร็จ`, message(e));
    return failed('paper_blocked', ['เปิดตัวพิมพ์เอกสารไม่สำเร็จ'], {
      reason: 'ตรวจกระดาษของเอกสารไม่สำเร็จ (ตัวพิมพ์เอกสารเปิดไม่ได้) — ยังไม่ได้ออกเลขเอกสาร กดออกเอกสารอีกครั้ง',
      retry: true,
    });
  }
  const error = result && typeof result === 'object' ? (result.error || null) : 'ตัววัดกระดาษไม่คืนผล';
  if (error) {
    const text = message(error) || 'วัดกระดาษไม่สำเร็จ';
    console.error(`[survey-report] วัดกระดาษของ ${label} ไม่สำเร็จ`, text);
    return failed('paper_blocked', [text], {
      reason: `ตรวจกระดาษของเอกสารไม่สำเร็จ (${text}) — ยังไม่ได้ออกเลขเอกสาร กดออกเอกสารอีกครั้ง`,
      retry: true,
    });
  }
  const blocks = [];
  for (const issue of list(result.issues)) {
    const kind = typeof issue === 'string' ? 'block' : issue?.kind;
    const text = String((typeof issue === 'string' ? issue : issue?.text) ?? '').trim();
    if (!text) continue;
    const line = issue?.version && VERSION_LABEL[issue.version] ? `${VERSION_LABEL[issue.version]}: ${text}` : text;
    // เหลือที่ใต้เนื้อหาน้อย · ฟอนต์นอก Sarabun — ไม่มีอะไรถูกตัด จึงไม่กันการออกเลข (มติ 4)
    if (kind === 'log') console.warn(`[survey-report] กระดาษของ ${label}:`, line);
    else blocks.push(line);
  }
  if (!blocks.length) return null;
  /* ค่าวัดและชื่อชิ้นของหน้าเป็นของคนแก้ระบบ — ลง log เต็มบรรทัด (และอยู่ใน `reasons`) · ประโยคที่หัวหน้าอ่านใช้ท่อนที่ตัดแล้ว */
  console.error(`[survey-report] กระดาษของ ${label} พิมพ์ไม่ได้:`, unique(blocks).join(' | '));
  return failed('paper_blocked', blocks, {
    reason: `กระดาษของเอกสารยังพิมพ์ไม่ได้ — ${unique(blocks.map(surveyReportPaperLineForReader)).join(' | ')} · ยังไม่ได้ออกเลขเอกสาร`,
    retry: false,
  });
}

/* ── I6 RPC ตอบ "มีฉบับที่ใช้อยู่แล้ว" หรือ `23505` → อ่านซ้ำแล้วตัดสิน ───────────────────── */

async function conflictOutcome(supabase, { requestId, answeredAt, warnings, label }) {
  const [again, reports] = await Promise.all([
    readRequestAnswer(supabase, requestId),
    loadSurveyReports(supabase, requestId),
  ]);
  /* อ่านซ้ำไม่สำเร็จ = ยังไม่รู้ว่าเป็นกรณีไหนในสี่กรณี — ไม่เดาว่า "เลขชนกัน" (ข้อความนั้นส่งคนไปหาผู้ดูแลระบบ)
     กดซ้ำ: I1 จะเจอฉบับที่ใช้อยู่แล้วใช้ซ้ำ หรือมาถึงตรงนี้อีกครั้งพร้อมการอ่านที่สำเร็จ */
  if (again.error || reports.error) {
    console.error(`[survey-report] อ่านซ้ำหลัง RPC ชนกันของ ${label} ไม่สำเร็จ`, message(again.error || reports.error));
    return failed('read_failed', [READ_FAILED], { retry: true });
  }
  const verdict = surveyReportRpcConflict({ request: again.request, reports: reports.reports, answeredAt });
  if (verdict.state === 'issued') {
    // อีกคำขอออกไปก่อน (ใต้ล็อกแถวคำร้อง) — ฉบับเดียว เลขเดียว · ผู้แพ้ใช้ซ้ำ
    return issued({
      docNo: verdict.report.docNo, rev: verdict.report.rev, reused: true, warnings, reportId: verdict.report.id,
    });
  }
  return failed(verdict.code, [verdict.reason], { retry: verdict.retry === true });
}

/* ── ตัวหลัก ─────────────────────────────────────────────────────────────────── */

async function run(supabase, opts, ctx) {
  const {
    requestId = null, user = null, closedVisit = null, prepared = null, deadline = null, measure = null,
    storeAllowed, now, newId, prepareImages, imageOptions, render,
  } = opts;
  const renderHtml = typeof render === 'function' ? render : renderSurveyReportHTML;
  const { via } = ctx;

  /* ── I0 ยามเขียนถาวร → คำร้อง ──────────────────────────────────────────────
     ⚠️ ยามมาก่อนการอ่านใด ๆ: เครื่องที่ไม่ใช่ production ไม่ควรแม้แต่เริ่มดึงรูป (อัปขึ้น bucket ของจริง) */
  const storeOk = (storeAllowed === undefined ? surveyReportStoreAllowed() : storeAllowed) === true;
  if (!storeOk) return failed('not_production', [SURVEY_REPORT_NOT_PRODUCTION]);

  /* เส้นส่งผล: ใช้แถวที่การเขียนคำตอบคืนมา (ของสดใต้มือ) · ปุ่ม "ออกเอกสาร": อ่านใหม่เสมอ — แถวที่ route ถือมาเพื่อตรวจสิทธิ์
     อาจเก่ากว่าการดึงผลกลับที่เพิ่งเกิด
     🔴 `answeredAt` เก็บเป็น **สตริงเดิมที่ PostgREST คืน** — RPC เทียบด้วย `IS DISTINCT FROM` · ห้ามผ่าน `Date` (ไมโครวินาทีหาย) */
  const id = requestId ?? opts.request?.id ?? null;
  let request = via === 'send' ? (opts.request || null) : null;
  if (!request) {
    if (!id) return failed('not_answered', [SURVEY_REPORT_REASONS.not_answered]);
    const read = await readRequest(supabase, id);
    if (read.error) {
      console.error('[survey-report] อ่านคำร้องก่อนออกเอกสารไม่สำเร็จ', id, message(read.error));
      return failed('read_failed', [READ_FAILED], { retry: true });
    }
    request = read.request;
  }
  ctx.request = request;
  if (!request?.id || request.kind !== 'site_survey' || request.cancelledAt || !request.answeredAt) {
    return failed('not_answered', [SURVEY_REPORT_REASONS.not_answered]);
  }
  const label = request.docNo || request.id;
  const answeredAt = request.answeredAt;

  /* ── I1 มีฉบับที่ใช้อยู่แล้วไหม ──────────────────────────────────────────────
     ⚠️ อ่านไม่สำเร็จ ≠ ไม่มี (`loadSurveyReports` คืน `[]` คู่กับ `error`) — เดินต่อ = ไปชน RPC แล้วได้เหตุที่อ่านไม่ออก */
  const existing = await loadSurveyReports(supabase, request.id);
  if (existing.error) return failed('read_failed', [READ_FAILED], { retry: true });
  const current = surveyReportCurrent(existing.reports);
  if (current) {
    if (surveyReportIsStale(request, current)) {
      /* ฉบับที่ใช้อยู่ไม่ใช่ของคำตอบรอบนี้ = ทริกเกอร์แทนที่ (0401 ⑤) ไม่ยิง — ไม่ใช้ซ้ำ ไม่ออกทับ (RPC ก็จะปฏิเสธ) แก้ด้วยมือ */
      console.error(`[survey-report] ${current.docNo} ยังเป็นฉบับที่ใช้อยู่แต่ไม่ตรงกับคำตอบรอบล่าสุดของ ${label} — ทริกเกอร์ 0401 ⑤ ไม่ยิง`);
      return failed('stale_current', [SURVEY_REPORT_REASONS.stale_current]);
    }
    return issued({ docNo: current.docNo, rev: current.rev, reused: true, reportId: current.id });
  }

  /* ── I2 อ่านข้อมูลที่ล็อกแล้วใหม่ทั้งชุด ─────────────────────────────────────────
     ไม่รับแถวที่ผู้เรียกอ่านไว้ก่อนเขียนคำตอบ: ช่างเขียนผลวัดแทรกได้ระหว่างอ่านด่านกับล็อก (`survey.js` อ่านแล้วค่อยเขียน)
     🔴 ชิ้นไหนอ่านไม่สำเร็จ = **ไม่ออก** — กระดาษที่ตรึงแล้วแก้ไม่ได้ ชื่อผู้ช่วยที่หายเพราะฐานสะดุดครั้งเดียวจะหายตลอดกาล */
  const takenAt = now().toISOString();
  const { inputs, unknown } = await loadSurveyReportInputs(supabase, { request, closedVisit, takenAt });
  if (list(unknown).length) {
    const lines = unknown.map((name) => `อ่าน${SURVEY_REPORT_INPUT_LABELS[name] || ` ${name} `}ไม่สำเร็จ`);
    return failed('blocked', lines, {
      reason: `ออกเอกสารไม่ได้ — ${lines.join(' | ')} · กดออกเอกสารอีกครั้ง`, retry: true,
    });
  }

  /* ── I3 ด่านทุกตัว บนข้อมูลหลังล็อก (ทั้งสองเส้น · มติ 21) ──────────────────────────────
     ใบที่ตอบผ่านปุ่มทั่วไปก่อน 24/09 ไม่เคยผ่านด่านส่งผล · `closesVisit: false` — ไม่มีนัดให้ปิดแทนช่างอีกแล้ว
     ลำดับและชนิดเดียวกับ `document.issue.blockers` ของการ์ด (`surveyDocumentSummary`) — ปุ่มกับการ์ดต้องพูดตรงกัน */
  const gates = [
    { kind: 'content', text: surveySendError(inputs.zones, inputs.filesByZone, { canSend: true }) },
    { kind: 'content', text: surveyPackageSizeSendError(inputs.zones, inputs.sizes) },
    { kind: 'content', text: surveySpotSendError(inputs.zones, inputs.filesByZone, { closesVisit: false }) },
  ].filter((gate) => gate.text);
  const issues = [...gates, ...surveyReportFreezeIssues(inputs)];
  const checked = buildSurveyReportSnapshot(inputs, { mode: 'check' });
  if (checked.snapshot) {
    for (const [version, name] of VERSIONS) {
      const layout = paginateSurveyReport(surveyReportView(checked.snapshot, { version }));
      for (const line of surveyReportOverflowErrors(layout)) issues.push({ kind: 'content', text: `${name}: ${line}` });
    }
  } else if (!issues.length) {
    // ตัวสร้างปฏิเสธด้วยเหตุที่ด่านข้างบนไม่ได้บอก — ไม่ควรเกิด (ใช้ตัวตรวจเดียวกัน) แต่ต้องไม่เดินต่อไปดึงรูป
    issues.push(...list(checked.errors).map((text) => ({ kind: 'system', text })));
  }
  if (issues.length) return blocked(issues);

  /* ── I4 รูป: ใช้ของรอบตรวจก่อนส่งผล เติมเฉพาะไฟล์ที่ยังไม่มี ───────────────────────────
     ⚠️ ไฟล์ที่อัประหว่างรอบตรวจกับล็อก หรือใบเก่าที่ไม่เคยผ่านรอบตรวจ = เตรียมที่นี่ · `have` กันดึงซ้ำ */
  const files = surveyReportImageFiles(inputs);
  let images;
  try {
    const prepare = prepareImages || (await import('./surveyReportImages')).prepareSurveyReportImages;
    images = await prepare(supabase, files, {
      ...(imageOptions && typeof imageOptions === 'object' ? imageOptions : {}),
      deadline: deadline ?? SURVEY_REPORT_IMAGE_BUDGET_MS[via],
      have: preparedMap(prepared),
      storeAllowed: true, // ผ่านยามของ I0 มาแล้ว — ส่งต่อคำตัดสินเดียวกัน ไม่ให้ขั้นรูปถามซ้ำแล้วได้คนละคำตอบ
    });
  } catch (e) {
    console.error(`[survey-report] เตรียมรูปของ ${label} ล้ม`, message(e));
    images = null;
  }
  if (!images || typeof images !== 'object') {
    return failed('images_failed', ['เตรียมรูปของเอกสารไม่สำเร็จ'], {
      reason: 'เตรียมรูปของเอกสารไม่สำเร็จ — ยังไม่ได้ออกเอกสาร กดอีกครั้ง', retry: true,
    });
  }
  if (list(images.failed).length) return imageFailure(images.failed);

  /* ── I5 ภาพนิ่ง + เรนเดอร์แห้งทั้งสองฉบับ (ยังไม่มีเลข) ─────────────────────────────────
     ทุกอย่างที่จะทำให้กระดาษออกไม่ได้ต้องโผล่ **ก่อน** เลขถูกกิน: ตัวเรนเดอร์โยน · หน้าล้น · ฉบับลูกค้ามีของภายใน */
  const built = buildSurveyReportSnapshot({ ...inputs, imageByAttId: images.imageByAttId || {} }, { mode: 'freeze' });
  if (!built.snapshot) {
    // ด่านผ่านมาแล้วที่ I3 บนอินพุตเดียวกัน ⇒ เหลือเหตุเดียวคือรูปยังไม่ครบ
    return failed('images_failed', list(built.errors), {
      reason: `${list(built.errors).join(' | ') || 'รูปของเอกสารยังไม่ครบ'} กดออกเอกสารอีกครั้ง`, retry: true,
    });
  }
  const paper = {};
  const overflow = [];
  for (const [version, name] of VERSIONS) {
    const view = surveyReportView(built.snapshot, { version });
    const layout = paginateSurveyReport(view);
    overflow.push(...surveyReportOverflowErrors(layout).map((line) => ({ kind: 'content', text: `${name}: ${line}` })));
    // เลขที่กับวันที่ออกยังไม่มี — อยู่บรรทัดเดียวในหัวกระดาษและท้ายกระดาษ ไม่เปลี่ยนความสูงของอะไร
    paper[version] = { view, layout, html: renderHtml({ view, layout, docNo: null }) };
  }
  if (overflow.length) return blocked(overflow);

  /* 🔴 ยามกันรั่วของฉบับลูกค้า — รูปจุดติดตั้ง · ชิ้นของฉบับภายใน (markup ของตัวเรนเดอร์) · จำนวนแผ่น · ตรวจซ้ำอีกครั้งก่อนตรึง
     (ขั้นกระดาษ P4b) · ยามนี้ดู **ตัวเรนเดอร์** ไม่ดูข้อความที่คนพิมพ์: หมายเหตุที่เขียนว่า "ดูฉบับภายใน" ผ่านรอบตรวจก่อนส่งผลมาแล้ว
     ต้องออกเอกสารได้ (มติ 2 · มติ 3) ⇒ ที่ติดตรงนี้คือความผิดของระบบ ไม่มีอะไรให้ผู้ใช้แก้ — ข้อความจึงให้แจ้งผู้ดูแลระบบ */
  const leaks = surveyReportCustomerHtmlIssues({
    html: paper.customer.html, snapshot: built.snapshot, layout: paper.customer.layout,
  });
  if (leaks.length) {
    console.error(`[survey-report] ยามกันรั่วของฉบับลูกค้าหยุดการออกเอกสารของ ${label}:`, leaks.join(' | '));
    return failed('paper_blocked', leaks, {
      reason: `ฉบับลูกค้ายังออกไม่ได้ — ${leaks.join(' | ')} · ยังไม่ได้ออกเลขเอกสาร แจ้งผู้ดูแลระบบ`,
      retry: false,
    });
  }

  /* คำเตือนที่ติดไปกับผล = คำเตือนของเส้นส่งผล (§8 · ชุดเดียวกับที่หัวหน้ารับทราบใน `seenWarnings`) + ของตัวสร้างภาพนิ่ง
     (ผังหลายรูป · จุดหลายรูป · ไฟล์ที่ไม่ใช่รูป) */
  const warnings = unique([...list(surveyReportSendWarnings(paper.customer.view)), ...list(built.warnings)]);

  /* ── I5b วัดกระดาษจริง (เฉพาะเมื่อ route เอกสารส่งตัววัดมา) — เลยเส้นท้ายกระดาษหรือ chromium ล้ม = ยังไม่กินเลข ── */
  if (typeof measure === 'function') {
    const stop = await measurePaper(measure, {
      customerHtml: paper.customer.html, internalHtml: paper.internal.html, deadline,
    }, label);
    if (stop) return stop;
  }

  /* ── I6 ออกเลข + เขียนแถว ในทรานแซกชันเดียว (0401 ④) ─────────────────────────────────
     · `p_answered_at` = สตริงเดิม · `p_row.snapshot` เป็น object (ห้าม JSON.stringify — RPC ตรวจ `jsonb_typeof = 'object'`)
     · RPC อ่านแค่สี่คีย์ของ `p_row` · ผู้อนุมัติ (`approved*`) ฐานคัดจาก `answeredBy*` ของคำร้องใต้ล็อกเอง ·
       ผู้ออก (`issued*`) = คนที่กด */
  const reportId = newId();
  let rpc;
  try {
    rpc = await supabase.rpc('issue_survey_report', {
      p_report_id: reportId,
      p_request_id: request.id,
      p_answered_at: answeredAt,
      p_yymm: surveyReportYymm(now()),
      p_row: {
        snapshot: built.snapshot,
        images: list(built.images),
        issuedById: user?.id != null ? String(user.id) : null,
        issuedByName: user?.name ?? null,
      },
    });
  } catch (e) {
    rpc = { data: null, error: e };
  }

  let docNo = typeof rpc?.data === 'string' && rpc.data.trim() ? rpc.data.trim() : null;
  let row = null;
  if (rpc?.error || !docNo) {
    const mapped = surveyReportRpcError(rpc?.error || { message: 'issue_survey_report ไม่คืนเลขที่เอกสาร' });
    if (mapped.log) console.error(`[survey-report] RPC ออกเลขของ ${label} ล้ม`, mapped.log);
    if (mapped.recheck) return conflictOutcome(supabase, { requestId: request.id, answeredAt, warnings, label });
    if (!mapped.retry) return failed(mapped.code, [mapped.reason], { retry: false });
    /* เหตุที่ไม่รู้จัก (เครือข่ายหลุด · หมดเวลา) — RPC อาจ **commit ไปแล้วแต่คำตอบหาย** (§11 แถว 7)
       ถามหาแถวด้วย id ที่เราเพิ่งสร้าง: เจอ = ของรอบนี้แน่นอน ⇒ เดินต่อเป็น "ออกแล้ว" (audit ไม่ขาด · ผู้เรียกรู้ว่าเป็นเลขใหม่)
       ไม่เจอ/อ่านไม่ได้ = ล้มตามเดิม · รอบหน้า I1 เจอแถว (ถ้ามี) แล้วใช้ซ้ำ — ไม่มีเลขที่สอง */
    const back = await readReportRow(supabase, reportId);
    if (back.row?.status === 'superseded') return failed('answer_changed', [SURVEY_REPORT_REASONS.answer_changed]);
    if (!back.row?.docNo) return failed(mapped.code, [mapped.reason], { retry: true });
    row = back.row;
    docNo = row.docNo;
  }

  /* ── I7 อ่านแถวกลับ — อ่านไม่ได้ก็ยัง "ออกแล้ว" ด้วยเลขที่ RPC คืน (แถวอยู่ในฐานแล้ว) ───────────── */
  if (!row) {
    const back = await readReportRow(supabase, reportId);
    if (back.error) console.error(`[survey-report] อ่านแถวของ ${docNo} กลับไม่สำเร็จ`, message(back.error));
    row = back.row;
  }
  const rowRev = row?.rev;
  const rev = rowRev !== null && rowRev !== undefined && Number.isInteger(Number(rowRev))
    ? Number(rowRev)
    : (parseSurveyReportNo(docNo)?.rev ?? null);

  /* ── I8 audit — 🔴 ส่งเฉพาะคีย์ที่นับไว้ ห้ามส่งแถว/ภาพนิ่ง/HTML (`after` ถูกเก็บตามตัว · lib/audit.js) ───── */
  try {
    await ctx.audit({
      user,
      action: 'create',
      entityType: 'service_survey_report',
      entityId: reportId,
      after: {
        id: reportId, docNo, rev, requestId: request.id, via,
        imageCount: list(built.images).length, warningCount: warnings.length,
      },
      summary: `ออกเอกสารประเมิน ${docNo} ของ ${label}`
        + (via === 'issue_only' ? ' (กดออกเอกสารภายหลัง)' : ' (พร้อมส่งผล)')
        + (warnings.length ? ` · คำเตือน ${warnings.length} ข้อ` : ''),
      request: ctx.req,
    });
  } catch (e) {
    console.error(`[survey-report] บันทึก audit ของ ${docNo} ไม่สำเร็จ`, message(e));
  }

  return issued({ docNo, rev, reused: false, warnings, reportId });
}

/* เหตุที่เป็นเรื่องปกติของจังหวะ (ไม่ใช่ความผิดพลาดของระบบ) — ไม่ลง log ไม่ลง audit
   · `answer_changed`  ผลถูกดึงกลับ/ส่งใหม่คั่นกลาง: รอบส่งถัดไปออกเอง (§3)
   · `not_production`  เครื่องทดสอบ: ห้ามเขียนอะไรลงฐานของจริงแม้แต่แถว audit */
const QUIET_CODES = new Set(['answer_changed', 'not_production']);

/* ล้มหลังส่งผลสำเร็จ (§12) — ใบตอบแล้วแต่ไม่มีเอกสาร: ต้องมีรอยให้ย้อนดูว่าทำไม · ปุ่ม "ออกเอกสาร" ไม่ต้อง (คนกดเห็นเหตุบนจอ) */
async function reportFailure(ctx, result) {
  if (QUIET_CODES.has(result.code)) return;
  const label = ctx.request?.docNo || ctx.request?.id || ctx.requestId || '(ไม่ทราบใบ)';
  if (result.code !== 'not_answered') {
    console.error(`[survey-report] ออกเอกสารของ ${label} ไม่สำเร็จ (${ctx.via} · ${result.code})`, result.reason);
  }
  const entityId = ctx.request?.id ?? ctx.requestId ?? null;
  if (ctx.via !== 'send' || !entityId) return;
  try {
    await ctx.audit({
      user: ctx.user,
      action: 'update',
      entityType: 'dept_request',
      entityId,
      summary: `ออกเอกสารประเมินไม่สำเร็จหลังส่งผล ${label} — ${result.reason}`,
      request: ctx.req,
    });
  } catch (e) {
    console.error(`[survey-report] บันทึก audit ของการออกเอกสารที่ล้ม (${label}) ไม่สำเร็จ`, message(e));
  }
}

/**
 * 🔑 **ออกเลขเอกสารประเมินของคำร้องที่ตอบแล้ว** — ไม่โยน · ไม่คืนกลางทางโดยไม่มีผล
 *
 * @param supabase  service-role client (อ่านตาราง · `rpc('issue_survey_report')` · ที่เก็บรูป)
 * @param opts.requestId   id ของคำร้อง (ปุ่ม "ออกเอกสาร" — อ่านคำร้องใหม่เสมอ)
 * @param opts.request     แถว `dept_requests` **หลังเขียนคำตอบ** (เส้นส่งผล) — `answeredAt` ต้องเป็นสตริงที่ฐานคืนมา
 * @param opts.user        คนที่กด (ผู้ออกเอกสาร `issued*`) · ผู้อนุมัติ (`approved*`) ฐานคัดจากคำตอบของคำร้องเอง
 * @param opts.closedVisit นัดที่การส่งผลนี้เพิ่งปิด (แถวหลังปิด) หรือ `null`
 * @param opts.via         `'send'` | `'issue_only'` — ค่าอื่นทุกค่า = `'issue_only'`
 * @param opts.prepared    ผลของรอบตรวจรูปก่อนส่งผล (`{ imageByAttId, failed }` หรือตัวแผนที่) — ไฟล์ที่มีแล้วไม่ถูกดึงซ้ำ
 * @param opts.deadline    งบของรอบเติมรูป (epoch ms · Date · หรือจำนวน ms จากนี้) — ไม่ส่ง = `SURVEY_REPORT_IMAGE_BUDGET_MS[via]`
 *                         · ส่งต่อให้ตัววัดกระดาษด้วย
 * @param opts.measure     ตัววัดกระดาษของ route เอกสาร (I5b) — ไม่ส่ง = ไม่วัด (เส้นส่งผลไม่เปิด chromium · มติ 3)
 *                         `measure({ customerHtml, internalHtml, deadline })`
 *                         → `{ issues: [{ version, kind: 'block' | 'log', text, page }], error: string | null }`
 *                         (HTML ยังเป็น token `su-img:<sha>` — ตัววัดแปลงจาก bucket เอง)
 * @param opts.req         `Request` ของ route (IP ใน audit) — ไม่บังคับ
 * จุดเสียบของเทสต์และ harness: `storeAllowed` (ไม่ส่ง = `surveyReportStoreAllowed()` · `true` ตรงตัวเท่านั้นจึงเขียน) ·
 *   `audit` (ไม่ส่ง = `recordAudit`) · `now` (`() => Date`) · `newId` · `prepareImages` (แทนตัวเตรียมรูป) ·
 *   `imageOptions` (ตัวเลือกเสริมที่ส่งต่อให้ตัวเตรียมรูป เช่น `getFileStream`) ·
 *   `render` (แทน `renderSurveyReportHTML` ของเรนเดอร์แห้งที่ I5 — เทสต์ใช้จำลองตัวเรนเดอร์ที่พิมพ์ของภายในลงฉบับลูกค้า)
 *
 * @returns คีย์ครบทุกครั้ง: `{ state, code, docNo, rev, reused, reasons, reason, retry, warnings }`
 *   · `state: 'issued'` — `docNo` · `rev` · `reused` (`true` = มีฉบับที่ใช้อยู่แล้ว ไม่ได้ออกเลขใหม่) · `warnings` · `code: null`
 *   · `state: 'failed'` — `code` (หนึ่งใน `SURVEY_REPORT_ISSUE_CODES`) · `reasons` (ทีละข้อ) · `reason` (ประโยคเต็มขึ้นจอได้เลย
 *     รวมคำแนะนำทางออกแล้ว — ผู้เรียกไม่ต้องต่อท้ายเอง) · `retry` (กดออกเอกสารซ้ำได้โดยไม่ต้องดึงผลกลับ)
 *     · `hold: true` — คีย์เสริม **เฉพาะ** `blocked` ที่ติดแค่ข้อกันเอกสารของใบที่มีพื้นที่ประเมินจากแบบ (ไม่มีทางออกให้คนกด:
 *       `reason` ไม่มีท่อนคำแนะนำ · `retry: false`) — ผลอื่นทุกแบบไม่มีคีย์นี้
 *   · `reportId` ติดมากับผลที่ `issued` แบบ **ไม่ถูกไล่** (ดู `withReportId`) — ใช้เรียกขั้นกระดาษ ห้ามใส่ลง payload/เธรด
 *
 * ⚠️ ล้มด้วย `via: 'send'` = เขียน audit ของคำร้อง "ออกเอกสารประเมินไม่สำเร็จหลังส่งผล …" ด้วย (ยกเว้น `answer_changed`)
 */
export async function issueSurveyReport(supabase, opts = {}) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const ctx = {
    via: o.via === 'send' ? 'send' : 'issue_only',
    user: o.user || null,
    request: o.request || null,
    requestId: o.requestId ?? o.request?.id ?? null,
    audit: typeof o.audit === 'function' ? o.audit : recordAudit,
    req: o.req || null,
  };
  let result;
  try {
    result = await run(supabase, {
      ...o,
      now: typeof o.now === 'function' ? o.now : () => new Date(),
      newId: typeof o.newId === 'function' ? o.newId : () => genId('SVR'),
    }, ctx);
  } catch (e) {
    console.error('[survey-report] ขั้นออกเลขล้มกลางทาง', ctx.requestId, e?.stack || message(e));
    result = failed('internal', [INTERNAL_FAILED], { retry: true });
  }
  if (result.state === 'failed') {
    try {
      await reportFailure(ctx, result);
    } catch (e) {
      console.error('[survey-report] บันทึกการออกเอกสารที่ล้มไม่สำเร็จ', message(e));
    }
  }
  return result;
}
