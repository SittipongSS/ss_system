// ── เอกสารประเมินพื้นที่ (FM-TS-01 · เลข SU) บนจอ — ตัวตัดสินล้วนของ PR-3 (สเปก PR-3 §3 · §4.1 · §5.1) ──────────
//
// ⭐ **สองจอวาดจากไฟล์นี้ และวาดอย่างเดียว** — ส่วน "เอกสารประเมินพื้นที่" บนการ์ดจัดการผล
//   (`surveyDocumentView` ← `surveyControlView`) กับบล็อกบนหน้าคำร้อง (`surveyRequestDocumentView` ← `surveyJobView`)
//   · ข้อความไทยทุกประโยค · ปุ่มไหนขึ้น/จาง · ลิงก์ไหนมี อยู่ที่นี่ที่เดียว ⇒ จอไม่มีกติกาของตัวเอง
//
// 🔑 **ทุกปุ่ม/ลิงก์ตัดสินจาก `document.access.*` ที่ server ให้มา ไม่ใช่ role ฝั่งจอ** (สเปก §0) — มติเจ้าของ 01/10:
//   ฉบับลูกค้าไม่มีข้อมูลภายใน · ฝ่ายขายได้เฉพาะฉบับลูกค้า Rev ที่ใช้อยู่ · ช่างไม่ได้อะไรเลย · Rev เก่ามีแค่รายการ (ไม่มีลิงก์)
//   🔴 `access` เป็นสตริง `'none'` **หรือ** ออบเจ็กต์ — เช็กว่าเป็นออบเจ็กต์ก่อนอ่านธงทุกครั้ง · คีย์ `history` · `nextDocNo` ·
//      `send` · `issue` · `voids` **ไม่มีคีย์เลย** (ไม่ใช่ null) เมื่อคนดูไม่มีสิทธิ์ (`surveyDocumentSummary` ของ surveyReportRows)
//
// ⚠️ **"อ่านไม่สำเร็จ" ต้องไม่กลายเป็น "ไม่มีเอกสาร"** — `unknown: true` = สถานะ `unknown` ของตัวเอง (ป้าย "ไม่ทราบ")
//
// 🔴 **ไฟล์นี้อยู่ใน bundle ของจอ** — ห้าม import `surveyReportState` (ลาก `node:crypto` ผ่าน `pdfInspect`) ·
//   `surveyReportRows` · `surveyReportInputs` · `surveyReportIssue` · `surveyReportPaper` · และห้าม import `surveyControl`
//   (มันเรียกไฟล์นี้) ⇒ ประโยคที่ซ้ำกับค่าคงที่ฝั่ง server ประกาศซ้ำที่นี่ แล้วให้เทสต์ล็อกว่าตรงกัน
//   (`surveyDocumentView.test.mjs` — เทสต์อ่านซอร์สล็อกรายการ import ด้วย)
//
// 🔑 บริสุทธิ์ทั้งไฟล์ — ไม่ยิง I/O ไม่อ่านนาฬิกา · วันเวลาผ่าน `fmtDateTime` (เวลาไทยเสมอ) · ค่าว่างพิมพ์ขีด `—`
import { NA, fmtDateTime } from '@/lib/format';
import { surveyZoneSize } from './survey';

/** ฉบับของเอกสาร ตามลำดับที่จอวาด — คีย์ตรงกับ `access.customer` / `access.internal` และพารามิเตอร์ `version` ของ route */
export const SURVEY_DOC_VERSIONS = Object.freeze(['customer', 'internal']);

/** รหัสของ "ออกเอกสาร" ที่กดซ้ำไปก็ไม่ผ่าน และ **ไม่มี GET ไหนมองเห็น** ⇒ ปุ่มต้องจางต่อจนกว่าจะแก้ที่ต้นเหตุ (มติ 13)
 *  · รหัสอื่น (รวม `blocked`) ให้ `document.issue.blockers` ชุดสดจาก server เป็นคนตัดสิน
 *  ⚠️ รหัสอย่างเดียวไม่พอ — server ตอบ `retry: true` มากับรหัสในลิสต์นี้ได้ (ดู `surveyIssueErrorSticky`) */
export const SURVEY_ISSUE_STICKY_CODES = Object.freeze(['undecodable', 'paper_blocked']);

/** ประโยคของสถานะ `stale` — คำเดียวกับ `SURVEY_REPORT_REASONS.stale_current` (เทสต์ล็อกว่าตรงกัน) · แถวด่านของการ์ดใช้ด้วย */
export const SURVEY_DOC_STALE_TEXT = 'เอกสารฉบับที่ใช้อยู่ไม่ตรงกับผลที่ส่งรอบล่าสุด — แจ้งผู้ดูแลระบบ';

/* สถานะทั้งแปดของ server (`SURVEY_REPORT_STATES`) — ประกาศซ้ำเพราะ import ไม่ได้ · เทสต์ล็อกว่าตรงกัน */
const DOC_STATES = ['not_sent', 'recalled', 'issuing', 'missing', 'issued', 'frozen', 'ready', 'stale'];
/* สถานะที่มี "ฉบับที่ใช้อยู่ของผลรอบนี้" — ลิงก์เปิดไฟล์มีได้เฉพาะสามสถานะนี้ */
const ISSUED_STATES = ['issued', 'frozen', 'ready'];

const VERSION_LABELS = { customer: 'ฉบับลูกค้า', internal: 'ฉบับภายใน' };
const VERSION_NOTES = {
  customer: 'ไม่มีจุดติดตั้งและข้อมูลภายใน · ฝ่ายขายผู้ขอดาวน์โหลดได้ที่หน้าคำร้อง',
  internal: 'มีแถบ “ฉบับภายใน — ห้ามส่งลูกค้า” ทุกหน้า · เฉพาะหัวหน้าฝ่ายบริการและผู้บริหาร',
};

/* ป้ายสถานะ — ทุกป้ายมีคำ ไม่พึ่งสีอย่างเดียว (สเปก §7) · `unknown` = อ่านไม่สำเร็จ ไม่ใช่ "ยังไม่ออก" */
const BADGES = Object.freeze({
  unknown: Object.freeze({ label: 'ไม่ทราบ', tone: 'neutral' }),
  not_sent: Object.freeze({ label: 'ยังไม่ออก', tone: 'neutral' }),
  recalled: Object.freeze({ label: 'ถูกแทนที่', tone: 'warning' }),
  issuing: Object.freeze({ label: 'กำลังออก', tone: 'info' }),
  missing: Object.freeze({ label: 'ยังไม่ออก', tone: 'warning' }),
  issued: Object.freeze({ label: 'ออกแล้ว', tone: 'success' }),
  frozen: Object.freeze({ label: 'ออกแล้ว', tone: 'success' }),
  ready: Object.freeze({ label: 'ออกแล้ว', tone: 'success' }),
  stale: Object.freeze({ label: 'ใช้ไม่ได้', tone: 'danger' }),
});
const NO_BADGE = Object.freeze({ label: '', tone: 'neutral' });

const LABEL_DRAFT = 'ดูตัวอย่าง (ฉบับร่าง)';
const LABEL_PREVIEW = 'ดูตัวอย่าง';
const LABEL_DOWNLOAD = 'ดาวน์โหลด PDF';
const LABEL_ISSUE = 'ออกเอกสาร';
const RECHECK = Object.freeze({ kind: 'reload', label: 'ตรวจอีกครั้ง' });
const RELOAD = Object.freeze({ kind: 'reload', label: 'โหลดใหม่' });
/* ⭐ ทางออกของ "กระดาษพิมพ์ไม่ได้" ที่กดออกเอกสารซ้ำไปก็ไม่ผ่าน (`paper_blocked` · `retry: false`)
   🐞 UAT PR-3 (S23 · S33 · S37): ประโยคของ server ข้อนี้บอกแค่ว่าหน้าไหนล้น ("… · ยังไม่ได้ออกเลขเอกสาร") ไม่บอกว่าต้องทำอะไรต่อ
      ⇒ หัวหน้าเหลือปุ่ม "ออกเอกสาร" ที่จาง กับประโยคที่ไม่มีทางออก · เหตุถาวรอื่น (`undecodable` · `rpc_failed`) ประโยคของ server
      บอกทางออกในตัวแล้ว (ดึงผลกลับ อัปรูปใหม่ / แจ้งผู้ดูแลระบบ — เทสต์ล็อกกับค่าคงที่ฝั่ง server) จึงไม่ต่อบรรทัดนี้ซ้ำ
   ⚠️ คำเดียวกับทางออกของสาขา "ติด n ข้อ" (ดึงผลกลับมาแก้แล้วส่งใหม่) + ทางสำรองเมื่อไม่มีอะไรให้แก้ (ยามกันรั่วของระบบใช้รหัสเดียวกัน) */
const PAPER_BLOCKED_WAY_OUT = 'ดึงผลกลับมาแก้แล้วส่งใหม่ — ถ้าไม่มีอะไรให้แก้ หรือแก้แล้วยังออกไม่ได้ ให้แจ้งผู้ดูแลระบบ';

/* ประโยคที่สองจอพูดตรงกัน */
const ISSUING_TEXT = 'กำลังออกเอกสารของใบนี้ — หน้านี้ตรวจให้เองทุก 15 วินาที';
/* คำเดียวกับ `SURVEY_REPORT_NOT_PRODUCTION` ของ surveyReportRows (เทสต์ล็อก) */
const NOT_PRODUCTION_TEXT = 'เครื่องนี้ไม่ใช่ระบบจริง (production) — ออกหรือตรึงเอกสารจากเครื่องทดสอบไม่ได้';
/* ชื่อถาดรูปที่ยังไม่ผูก — คำเดียวกับ `SPOT_TRAY_LABEL` ของ surveySpotPhotos (เทสต์ล็อก) */
const SPOT_TRAY = 'ยังไม่ได้ผูกจุด';
/* คำนำของบรรทัดคำเตือน — คำเดียวกับโมดัลส่งผล (`surveySendConfirm` · เทสต์ล็อก) */
const WARNING_EFFECT_PREFIX = 'ฉบับลูกค้าจะพิมพ์ตามที่กรอกไว้ — ';
/* บรรทัดคำเตือนของหมายเหตุพื้นที่ขึ้นต้นด้วยคำนี้เสมอ (ตัวสร้างทั้งสองของ `surveyReportView`) */
const NOTE_WARNING_HEAD = 'หมายเหตุพื้นที่';

const isRecord = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const trimmed = (value) => (typeof value === 'string' ? value.trim() : '');
/* รายการข้อความสำหรับ **วาด** — เฉพาะสตริงที่มีเนื้อ ไม่ซ้ำ (จอใช้ข้อความเป็น key ของ <li>) · ลำดับเดิม
   ⚠️ ห้ามใช้กับ `seenWarnings` ที่ส่งกลับ server — ชุดนั้นต้องดิบตามตัวอักษร (`surveyControlView` คัดเอง) */
const shownLines = (list) => [...new Set((Array.isArray(list) ? list : [])
  .filter((line) => typeof line === 'string' && line.trim() !== ''))];
const dateText = (value) => (value ? fmtDateTime(value) : NA);
const instantOf = (value) => {
  if (value === null || value === undefined || value === '') return NaN;
  return value instanceof Date ? value.getTime() : Date.parse(String(value));
};
const note = (tone, text, extra = null) => ({ tone, text, items: [], foot: null, action: null, ...(extra || {}) });
const joinFoot = (...parts) => parts.filter(Boolean).join(' · ') || null;

/**
 * ที่อยู่ของเอกสารหนึ่งฉบับ — ที่เดียวที่ประกอบ URL ของ route เอกสาร (จอไม่มี `/document?` ของตัวเอง)
 *
 * @param requestId  id ของใบคำร้อง (ผ่าน `encodeURIComponent`) · ไม่มี = `null`
 * @param version    `'customer'` | `'internal'` — 🔴 ค่าอื่นทุกค่า = ฉบับลูกค้า (server นับเฉพาะสตริง `internal` ตรงตัว
 *                   ว่าเป็นฉบับภายใน · `surveyDocVersion`) ⇒ พิมพ์ผิดไม่มีทางได้ลิงก์ของภายใน
 * @param mode       `'view'` เปิด PDF ในแท็บ · `'download'` ดาวน์โหลด · `'draft'` ฉบับร่าง
 *                   ⚠️ ร่างเป็น HTML เสมอ (`format=html`) — ขอร่างเป็น PDF ได้ 400
 */
export function surveyDocumentHref(requestId, version, mode = 'view') {
  const id = String(requestId ?? '').trim();
  if (!id) return null;
  const v = SURVEY_DOC_VERSIONS.includes(version) ? version : 'customer';
  const base = `/api/service/surveys/${encodeURIComponent(id)}/document?version=${v}`;
  if (mode === 'download') return `${base}&download=1`;
  if (mode === 'draft') return `${base}&draft=1&format=html`;
  return base;
}

/**
 * ดูฉบับร่างได้หรือยัง — กติกาของ route ฉบับร่าง: ทุกพื้นที่ที่ไม่ถูกตัด วัดครบสามช่องทุกส่วน
 * ⚠️ route ใช้กติกานี้กับร่าง **ทุกสถานะ** (รวมใบที่ตอบแล้วแต่ยังไม่มีเอกสาร — ใบที่ตอบผ่านปุ่มทั่วไปก่อน 24/09 ไม่เคยผ่านด่านส่งผล)
 * @returns `{ done, total, ready }` · ไม่เหลือพื้นที่ให้วัด = ยังไม่พร้อม (ร่างของใบเปล่าไม่มีอะไรให้ดู)
 */
export function surveyDraftReadiness(zones) {
  const active = (Array.isArray(zones) ? zones : []).filter((zone) => zone && (zone.status || 'ok') !== 'cut');
  const done = active.filter((zone) => surveyZoneSize(zone.parts).complete).length;
  return { done, total: active.length, ready: active.length > 0 && done === active.length };
}

/**
 * ใบ **จบแล้วและไม่มีวันได้เอกสารฉบับใหม่** — ยกเลิก หรือปิดโดยไม่เคยส่งผล
 * (คู่ `cancelled || closedWithoutAnswer` ของ `surveyControlView` · สองจอของไฟล์นี้ถามตัวเดียวกัน)
 * ⚠️ ใบที่ส่งผลแล้วและฝ่ายขายปิดเรื่อง (`settled`) **ไม่นับ** — เอกสารของใบนั้นยังใช้อยู่และยังออกได้
 */
export function surveyRequestEnded(request) {
  if (!request) return false;
  return !!request.cancelledAt
    || (!request.answeredAt && (!!request.closedAt || request.status === 'closed'));
}

/**
 * คำเตือนชุดนี้เป็นเรื่องของช่องไหน — บรรทัดปิดท้ายบอกที่แก้ตามชนิด (มติ 28)
 * @returns `{ note, other }` · `note` = มีบรรทัดของหมายเหตุพื้นที่ (แก้ที่หน้าพื้นที่) · `other` = มีบรรทัดของช่องอื่น
 *   (ชื่อลูกค้า · ไซต์ · บริษัท · ชื่อพื้นที่ — แก้ที่ต้นทางของช่องนั้น)
 */
export function surveyWarningKinds(lines) {
  const list = shownLines(lines);
  return {
    note: list.some((line) => line.startsWith(NOTE_WARNING_HEAD)),
    other: list.some((line) => !line.startsWith(NOTE_WARNING_HEAD)),
  };
}

/**
 * ข้อผิดพลาดของ "ออกเอกสาร" ที่ปุ่มต้องจางต่อ — เลขชนกัน · เลขของปีเต็ม · ฐานไม่พร้อม (`rpc_failed` ที่ `retry: false`)
 * และรหัสใน `SURVEY_ISSUE_STICKY_CODES` · ที่เหลือกดซ้ำได้
 * 🔴 **`retry: true` ของ server ชนะรหัสเสมอ** — `paper_blocked` มีสองแบบ: กระดาษล้น/ด่านกันรั่ว (`retry: false` · ต้องดึงผลกลับ)
 *   กับตัวพิมพ์เอกสารเปิดไม่ได้/วัดกระดาษไม่ทัน (`retry: true` · ประโยคลงท้าย "กดออกเอกสารอีกครั้ง" · `measurePaper` ของ
 *   surveyReportIssue) · 🐞 ล็อกจากรหัสอย่างเดียว = กล่องบอกให้กดอีกครั้งข้างปุ่มที่จาง และไม่มี GET ไหนล้างให้ (ทางตันจนกว่าจะโหลดหน้าใหม่)
 * @param error `{ code, retry }` — ของ `local.issueError` หรือ `local.sendFailed`
 */
export function surveyIssueErrorSticky(error) {
  if (!isRecord(error)) return false;
  if (error.retry === true) return false;
  return SURVEY_ISSUE_STICKY_CODES.includes(error.code)
    || (error.code === 'rpc_failed' && error.retry === false);
}

/**
 * ลายเซ็นของชุดไฟล์ทั้งใบ — เปลี่ยนเมื่อไฟล์เพิ่ม/หาย/ย้ายหัวข้อ/ผูกจุดใหม่ ⇒ จอรู้ว่า "หัวหน้าแก้อะไรไปแล้ว"
 * (ล้างข้อผิดพลาดที่กดซ้ำได้ · ซ่อนกล่อง "ส่งผลรอบล่าสุดถูกตีกลับ" · ตรวจเอกสารซ้ำหนึ่งรอบ)
 * ⚠️ เรียงก่อนต่อ — ไฟล์ชุดเดิมที่โหลดมาคนละลำดับต้องได้ลายเซ็นเดิม
 * @param filesByZone `{ [zoneRowId]: ไฟล์ของแถวนั้น }`
 */
export function surveyFilesSignature(filesByZone) {
  const lines = [];
  for (const [zoneId, files] of Object.entries(isRecord(filesByZone) ? filesByZone : {})) {
    for (const file of Array.isArray(files) ? files : []) {
      if (!file) continue;
      lines.push(`${zoneId}:${file.id ?? ''}:${file.docType ?? ''}:${file.metadata?.spotId ?? ''}`);
    }
  }
  return lines.sort().join('|');
}

/* ── อ่าน payload ให้ปลอดภัย (สเปก §3.2) ───────────────────────────────────────────── */

/* ของที่จอจำไว้เอง (ไม่มี GET ไหนคืน) **ของคำตอบรอบนี้เท่านั้น** — `local.round` กับ `answeredAt` ต้องเป็นจุดเวลาเดียวกัน
   ⚠️ เทียบเป็นมิลลิวินาที ไม่เทียบสตริง (PostgREST คืน `+00:00` · ค่าจาก `toISOString()` ลงท้าย `Z`) · อ่านไม่ได้ฝั่งไหน = ไม่ใช่รอบนี้ */
function roundLocal(local, request) {
  const none = { sendFailed: null, issueError: null, paper: null, printed: [] };
  if (!isRecord(local)) return none;
  const round = instantOf(local.round);
  if (!Number.isFinite(round) || round !== instantOf(request?.answeredAt)) return none;
  return {
    sendFailed: isRecord(local.sendFailed) ? local.sendFailed : null,
    issueError: isRecord(local.issueError) ? local.issueError : null,
    paper: isRecord(local.paper) ? local.paper : null,
    printed: shownLines(local.printed),
  };
}

/* สถานะที่จอใช้ — `null` = ไม่มีอะไรให้วาด (ไม่มี payload · ไม่มีสิทธิ์)
   ① `unknown` — อ่านแถวเอกสารไม่สำเร็จ หรือมีสิทธิ์แต่สถานะไม่ใช่หนึ่งในแปด
   ② `missing` — server ยังเดาว่า "กำลังออก" (นาฬิกา 180 วิ) แต่จอนี้รู้แล้วว่าการส่งรอบนี้ออกเอกสารไม่สำเร็จ
   ③ นอกนั้นตาม server */
function resolvedState(doc, round) {
  if (!doc) return null;
  if (doc.unknown === true) return 'unknown';
  if (!isRecord(doc.access)) return null;
  if (!DOC_STATES.includes(doc.state)) return 'unknown';
  if (doc.state === 'issuing' && round.sendFailed) return 'missing';
  return doc.state;
}

const historyOf = (doc, access) => (access?.history === true && Array.isArray(doc.history) ? doc.history.filter(isRecord) : []);

/* ── ส่วน "เอกสารประเมินพื้นที่" บนการ์ดจัดการผล ─────────────────────────────────────── */

const SUPERSEDED_REASONS = { recall: 'ดึงผลกลับมาแก้', reopen: 'เปิดเรื่องกลับ (ยังไม่จบ)' };

/* รายการ Rev ก่อนหน้า — 🔴 **ไม่มีแถวไหนมีลิงก์** (มติเจ้าของ 01/10 ข้อ 5: PR-3 แค่แสดงรายการ · GET ของฉบับเก่าตอบ 409) */
function historyList(rows) {
  if (!rows.length) return null;
  return {
    label: `Rev ก่อนหน้า (${rows.length})`,
    hideLabel: 'ซ่อน Rev ก่อนหน้า',
    foot: 'Rev ก่อนหน้าใช้ไม่ได้แล้ว และเปิดไฟล์ไม่ได้',
    rows: rows.map((row) => ({
      docNo: trimmed(row.docNo) || NA,
      line: [
        `ออก ${dateText(row.issuedAt)}`,
        `ถูกแทนที่ ${dateText(row.supersededAt)}`,
        SUPERSEDED_REASONS[row.supersededReason] || null,
      ].filter(Boolean).join(' · '),
    })),
  };
}

/* ⭐ **ก่อนส่งผล ส่วนนี้อยู่หลังปุ่มคลี่ · ส่งแล้ว/จบแล้ว/ไม่ทราบ = ปักไว้เหนือปุ่มคลี่** (สเปก §11 · คำถามเจ้าของข้อ 2
   ตัวเลือก a) — เจ้าของเลือก b (เห็นเสมอ) เมื่อไร แก้ที่ฟังก์ชันนี้ที่เดียว
   🔑 **ค่านี้เลือกที่อยู่ของส่วนนี้ใน DOM** (มติเจ้าของ 08/10 ชุดสุดท้าย) — ที่เดียวต่อค่า ไม่สลับด้วย CSS:
   · `fold`   = ส่วนนี้อยู่ในส่วนรอง **ต่อใต้ด่าน** (ด่าน → ส่วนนี้ → ขั้นตอน → เอกสารที่เกี่ยวข้อง)
   · `pinned` = ส่วนนี้อยู่เหนือปุ่มคลี่ เห็นเสมอทุกขนาดจอ
   ⚠️ **ส่วนรองพับที่ไหน ไม่ได้ตัดสินจากค่านี้ค่าเดียว** — `controlFold` ใน `surveyControl.js` ดูว่าใบพ้นช่วง "ก่อนส่งผล" หรือยังด้วย
      (ใบที่ยังไม่ส่งแต่อ่านสถานะไม่สำเร็จ = `pinned` แต่ด่านต้องกางที่ราง) และการ์ดดูว่าจอนี้มีรางไหม (`SURVEY_RAIL_QUERY`) */
function sectionPlacement({ answered, ended, state }) {
  return answered || ended || state === 'unknown' ? 'pinned' : 'fold';
}

/* เนื้อของกล่องยืนยัน "ออกเอกสาร" (สเปก §4.4) — จอคัดลอกไปเก็บตอนเปิดกล่อง (มติ 25) */
function issueConfirm(doc, request) {
  const next = trimmed(doc.nextDocNo);
  const approver = trimmed(request?.answeredByName);
  const warnings = shownLines(doc.issue?.warnings);
  const kinds = surveyWarningKinds(warnings);
  return {
    title: 'ออกเอกสารประเมินพื้นที่',
    message: 'ออกเอกสารจากผลที่ส่งให้ฝ่ายขายไปแล้ว — ไม่ส่งผลซ้ำ ตัวเลขไม่เปลี่ยน',
    detail: 'ใช้เวลาประมาณ 10–60 วินาที (ดึงรูปและจัดหน้ากระดาษ) — อย่าปิดหน้านี้ระหว่างรอ',
    effects: [
      next
        ? `ออกเอกสาร ${next} (Rev ถัดไปของเลขเดิม) — เลขถาวร เอกสารที่ออกแล้วแก้ไม่ได้`
        : 'ออกเลขเอกสาร SU ใหม่ — เลขถาวร เอกสารที่ออกแล้วแก้ไม่ได้',
      `ตรึงฉบับลูกค้าและฉบับภายในจากข้อมูลในใบตอนนี้${approver ? ` · ผู้ตรวจสอบและอนุมัติบนเอกสาร = ${approver} (ผู้ส่งผล)` : ''}`,
      'ผู้ขอ (ฝ่ายขาย) ได้รับแจ้งในกระดิ่งและเธรดของคำร้อง — ดาวน์โหลดฉบับลูกค้าได้ที่หน้าคำร้อง',
      ...warnings.map((line) => `${WARNING_EFFECT_PREFIX}${line}`),
      /* ที่แก้ตามชนิดของบรรทัด — ทะเบียนถูกอ่านใหม่ตอนกด (ช่องอื่นแก้ได้โดยไม่ต้องดึงผลกลับ) · หมายเหตุพื้นที่ล็อกอยู่กับผล */
      ...(kinds.note ? ['หมายเหตุพื้นที่แก้ไม่ได้ขณะผลล็อกอยู่ — ถ้าต้องแก้ ปิดกล่องนี้แล้วดึงผลกลับมาแก้ก่อน'] : []),
      ...(kinds.other ? ['ช่องอื่นแก้ที่ต้นทางของช่องนั้น (ทะเบียนลูกค้า · ไซต์ · บริษัท ไม่ต้องดึงผลกลับ · ชื่อพื้นที่ต้องดึงผลกลับ) แล้วเปิดกล่องนี้ใหม่'] : []),
      'แก้เอกสารหลังออก = ดึงผลกลับแล้วส่งใหม่ (ออกเป็น Rev ถัดไป)',
    ],
    confirmLabel: LABEL_ISSUE,
    busyLabel: 'กำลังออกเอกสาร…',
  };
}

/* เหตุที่ปุ่ม "ออกเอกสาร" จะตีกลับ ชุดสดจาก server — `[{ kind: 'content' | 'system', text, hold }]` ไม่ซ้ำ
   ⭐ `hold` = ข้อกันเอกสารของใบที่มีพื้นที่ประเมินจากแบบ (`hold: true` ตรงตัวใน payload · mig 0408) — ไม่มีอะไรให้แก้ กดซ้ำไม่ช่วย
   ⚠️ ธงอ่านจาก **ทุกแถวก่อนยุบข้อความซ้ำ** (กติกาเดียวกับ `blocked` ของ surveyReportIssue) — แถวซ้ำที่ไม่มีธงต้องไม่ทำให้ข้อกัน
      กลายเป็นเหตุที่ "แก้แล้วกดซ้ำได้" */
function issueBlockers(check) {
  const rows = (Array.isArray(check?.blockers) ? check.blockers : []).filter(isRecord);
  const held = new Set(rows.filter((b) => b.hold === true).map((b) => trimmed(b.text)));
  const seen = new Set();
  return rows
    .map((b) => ({ kind: b.kind === 'content' ? 'content' : 'system', text: trimmed(b.text) }))
    .filter((b) => b.text && !seen.has(b.text) && seen.add(b.text))
    .map((b) => ({ ...b, hold: b.kind !== 'content' && held.has(b.text) }));
}

const sectionBase = (state) => ({
  show: false,
  placement: 'fold',
  state,
  badge: BADGES[state] || NO_BADGE,
  versions: [],
  rows: [],
  status: null,
  printed: null,
  issue: null,
  hint: null,
  history: null,
  relinkNote: null,
  poll: false,
  recheckOnFiles: false,
});

/**
 * 🔑 **ทุกอย่างที่ส่วน "เอกสารประเมินพื้นที่" ของการ์ดจัดการผลวาด** (สเปก §3.3 · ตารางสถานะ §4.1)
 *
 * ```
 * { show, placement: 'pinned' | 'fold', state, badge: { label, tone },
 *   versions: [{ key, label, note, status,
 *                preview:  null | { label, href, blocked },     ← null = ไม่วาดปุ่ม · href เป็น null เมื่อ blocked
 *                download: null | { label, href, blocked } }],
 *   rows: [{ key, label, value }],                               ← เลขที่ · ออกเมื่อ · ออกโดย
 *   status: null | { tone, text, items: string[], foot: string | null, action: null | { kind: 'reload', label } },
 *   printed: null | { title, items: string[] },
 *   issue: null | { allowed, confirm: null | { title, message, detail, effects[], confirmLabel, busyLabel } },
 *   hint, history: null | { label, hideLabel, foot, rows: [{ docNo, line }] },
 *   relinkNote, poll, recheckOnFiles }
 * ```
 * ทุกคีย์มีเสมอ (ซ่อนส่วน = `show: false` กับค่าว่าง)
 *
 * ⭐ **กล่องสถานะมีได้ต่อฉบับ** — ใบที่ตรึงแล้วมีไฟล์ฉบับลูกค้าแต่ยังไม่มีฉบับภายใน ต้องพูดคนละประโยคตามปุ่มสลับฉบับ
 *   ⇒ `versions[i].status` = กล่องของฉบับนั้น · `status` ชั้นนอก = ของฉบับแรก (ที่เลือกไว้ตั้งต้น) ·
 *   สถานะที่ไม่ขึ้นกับฉบับ ทั้งสองที่เป็นก้อนเดียวกัน ⇒ จอวาด `(ฉบับที่เลือก).status` ถ้ามีฉบับ ไม่งั้น `status`
 *
 * 🔴 กติกากันรั่ว (มีเทสต์ทุกข้อ): ไม่มี `version=internal` ที่ไหนในผลถ้าไม่มี `access.internal` · แถว Rev เก่าไม่มี href ·
 *   สถานะ `stale` · `issuing` · `missing` · `recalled` · `not_sent` ไม่มี href นอกจากลิงก์ฉบับร่าง ·
 *   ลิงก์ฉบับร่างมีเฉพาะ `access.draft` **และ** วัดครบทุกพื้นที่
 *
 * @param document      คีย์ `document` ของ GET ใบประเมิน
 * @param request       แถว `dept_requests` (อ่าน `id` · `answeredAt` · `answeredByName` · `cancelledAt` · `closedAt` · `status`)
 * @param zones         แถวผลวัดทุกแถว (ตัดสินว่าดูร่างได้ไหม)
 * @param local         ของที่จอจำไว้เอง: `{ round, sendFailed, issueError, paper, printed }` (สเปก §3.2) — ใช้เฉพาะของรอบนี้
 *                      (`sendRefused` ของก้อนเดียวกันเป็นของกล่องแจ้งบนการ์ด — `surveyControlView` อ่านเอง)
 * @param canDecide     คนดูเป็นคนส่งผลได้ (การ์ดวาดให้คนกลุ่มนี้เท่านั้น) — ไม่ใช่ = ซ่อนทั้งส่วน
 * @param failedGates   ชื่อย่อของด่านส่งผลที่ยังติด **ไม่รวมแถวเอกสารเอง** (ส่วนนี้ต้องไม่อ้างตัวเองเป็นเหตุ)
 * @param spotsUnlinked ยังมีรูปจุดค้างในถาด "ยังไม่ได้ผูกจุด" — ทางออกของเหตุชนิดนี้ไม่ต้องดึงผลกลับ (มติ 9)
 * @param drawingHold   ประโยคของข้อกันเอกสาร เมื่อใบมีพื้นที่ที่ประเมินจากแบบ (ยังอยู่ในใบ) · ไม่มี = `null`
 *                      เอกสารของใบแบบนี้ถูกพักไว้ ⇒ ก่อนส่งผล (และตอนดึงกลับมาแก้) กล่องสถานะพูดประโยคเดียวกับโมดัลยืนยันส่งผล
 *                      ไม่สัญญาเลขที่เอกสาร · ผู้เรียกส่งประโยคมา (ไฟล์นี้ import ได้สองไฟล์) · งวด S3 ถอดพร้อมข้อกัน
 * ⚠️ `canWrite` ที่ผู้เรียกส่งมาตามสเปก §3.1 ไม่มีกติกาข้อไหนของส่วนนี้ใช้ (บรรทัด "แก้หมายเหตุได้ไหม" อยู่ที่กล่องแจ้งของการ์ด)
 */
export function surveyDocumentView({
  document = null, request = null, zones = [], local = null,
  canDecide = false, failedGates = [], spotsUnlinked = false, drawingHold = null,
} = {}) {
  const doc = isRecord(document) ? document : null;
  const access = doc && isRecord(doc.access) ? doc.access : null;
  const hold = trimmed(drawingHold) || null;
  const round = roundLocal(local, request);
  const state = resolvedState(doc, round);
  const base = sectionBase(state);
  if (!state || canDecide !== true) return base;

  const current = isRecord(doc.current) ? doc.current : null;
  const history = historyOf(doc, access);
  const ended = surveyRequestEnded(request);
  /* ใบที่จบแล้วและไม่เคยมีเอกสาร = ไม่แสดงส่วนนี้ (กระดาน S-1) · เคยมี = ยังต้องเห็นรายการ Rev (มติ 31) */
  if (ended && !current && !history.length) return base;

  const shown = {
    ...base,
    show: true,
    placement: sectionPlacement({ answered: !!request?.answeredAt, ended, state }),
    history: historyList(history),
    recheckOnFiles: isRecord(doc.send) || isRecord(doc.issue),
  };

  if (state === 'unknown') {
    return {
      ...shown,
      status: note('warning', 'อ่านสถานะเอกสารไม่สำเร็จ — ยังไม่ทราบว่ามีเอกสารหรือไม่', { action: RELOAD }),
    };
  }

  const lastDocNo = trimmed(history[0]?.docNo);
  const lastRow = lastDocNo ? [{ key: 'docNo', label: 'เลขที่', value: lastDocNo }] : [];

  /* ใบจบแล้ว ไม่มีฉบับที่ใช้อยู่ แต่เคยมีเอกสาร — หัวข้อ · ป้าย · รายการ Rev · ไม่มีปุ่ม ไม่สัญญาฉบับใหม่ (มติ 31) */
  if (ended && !current) {
    return {
      ...shown,
      badge: BADGES.recalled,
      rows: lastRow,
      status: note('neutral', `${lastDocNo || 'เอกสารฉบับก่อน'} ถูกแทนที่แล้ว · ใบนี้ปิดแล้ว — ไม่มีฉบับใหม่`),
    };
  }

  const requestId = request?.id;
  const flagOn = doc.issueAtSend === true;
  const offProduction = doc.storeAllowed === false;
  const canDraft = access.draft === true;
  const draft = surveyDraftReadiness(zones);
  const draftLine = `ดูตัวอย่างได้เมื่อวัดครบทุกพื้นที่ (${draft.done}/${draft.total})`;
  /* ปุ่มร่างที่ขึ้นแต่กดไม่ได้ ต้องมีเหตุในกล่องสถานะ — กล่องพูดเรื่องอื่นอยู่ = ต่อบรรทัดนี้ที่ท้ายกล่อง */
  const draftFoot = canDraft && !draft.ready ? draftLine : null;

  const link = (label, href, blocked) => ({
    label, href: blocked || !href ? null : href, blocked: blocked || !href,
  });
  const draftPreview = (key) => (canDraft
    ? link(LABEL_DRAFT, surveyDocumentHref(requestId, key, 'draft'), !draft.ready)
    : null);
  const blockedPreview = () => link(LABEL_PREVIEW, null, true);
  const blockedDownload = () => link(LABEL_DOWNLOAD, null, true);

  /* แผนของสถานะ: กล่องสถานะ (ก้อนเดียว หรือรายฉบับผ่าน `statusOf`) + ปุ่มของแต่ละฉบับ */
  let status = null;
  let statusOf = null;
  let preview = blockedPreview;
  let download = blockedDownload;
  const out = { ...shown };

  if (state === 'not_sent') {
    const check = isRecord(doc.send) ? doc.send : null;
    const blockers = check ? shownLines(check.blockers) : [];
    const stuck = shownLines(failedGates);
    const stuckText = `ยังติด ${stuck.length} ด่าน: ${stuck.join(' · ')}`;
    if (!draft.ready) {
      status = note('info', draftLine);
    } else if (hold) {
      /* 🐞 เดิมกล่องนี้สัญญา "กดส่งผลเพื่อออกเลขที่เอกสาร" อยู่หลังโมดัลยืนยันที่บอกว่าเอกสารยังออกไม่ได้ — พูดประโยคเดียวกัน
         ⚠️ มาก่อนรายการเหตุของ server: ข้อกันนี้ไม่มีอะไรให้แก้ ปุ่ม "ตรวจอีกครั้ง" ไม่ช่วย */
      status = note('info', hold);
    } else if (blockers.length) {
      status = note('warning', `เอกสารยังออกไม่ได้ — ติด ${blockers.length} ข้อ`, {
        items: blockers,
        foot: `แก้ตามรายการแล้วกด “${RECHECK.label}”${stuck.length ? ` · ด่านอื่น${stuckText}` : ''}`,
        action: RECHECK,
      });
    } else if (stuck.length) {
      status = note('warning', `${flagOn ? 'ดาวน์โหลด PDF ได้' : 'ออกเอกสารได้'}หลังส่งผลให้ฝ่ายขาย — ${stuckText}`);
    } else if (flagOn) {
      status = note('info', check?.unknown === true
        ? 'ตรวจเอกสารล่วงหน้าไม่สำเร็จ — ส่งผลได้ ระบบตรวจอีกครั้งตอนส่ง'
        : 'พร้อมแล้ว — กดส่งผลเพื่อออกเลขที่เอกสาร');
    } else {
      /* สวิตช์ปิด = ยังไม่มีการตรวจเอกสารก่อนส่ง ⇒ ห้ามบอกว่า "พร้อมแล้ว" (สเปก §10) */
      status = note('info', 'ส่งผลก่อน แล้วกด “ออกเอกสาร” ที่นี่ — ระบบตรวจเอกสารตอนกดออก (ถ้าติดเรื่องภาพผัง นัด หรือหน้าล้น ต้องดึงผลกลับมาแก้)');
    }
    preview = draftPreview;
  } else if (state === 'recalled') {
    const next = trimmed(doc.nextDocNo) || 'Rev ถัดไป';
    const head = `${lastDocNo || 'เอกสารฉบับก่อน'} ถูกแทนที่แล้ว — `;
    /* 🐞 ใบที่ดึงกลับมาแก้คือใบที่หัวหน้าแก้ไฟล์บ่อยที่สุด — เหตุที่เอกสารฉบับใหม่ออกไม่ได้ต้องกางที่นี่เหมือนสถานะ `not_sent`
       (ไม่งั้นกล่องนี้สั่ง "ส่งผลอีกครั้ง" ทั้งที่ปุ่มส่งจาง และเหตุเหลือแค่บรรทัดเดียวในแถวด่าน) · วัดไม่ครบพูดก่อน เหมือน `not_sent` */
    const check = isRecord(doc.send) ? doc.send : null;
    const blockers = check && draft.ready && !hold ? shownLines(check.blockers) : [];
    // ใบที่มีพื้นที่จากแบบ: ฉบับถัดไปยังออกไม่ได้ (ข้อกันของงวด S1) — ไม่สัญญา Rev ถัดไป
    const text = hold
      ? `${head}${hold}`
      : flagOn
        ? `${head}ส่งผลอีกครั้งเพื่อออก ${next}`
        : `${head}ส่งผลอีกครั้ง แล้วกด “ออกเอกสาร” เพื่อออก ${next}`;
    status = blockers.length
      ? note('warning', text, { items: blockers, foot: `แก้ตามรายการแล้วกด “${RECHECK.label}”`, action: RECHECK })
      : note('warning', text, { foot: draftFoot });
    out.rows = lastRow;
    preview = draftPreview;
  } else if (state === 'issuing') {
    status = note('info', ISSUING_TEXT);
    /* ⚠️ ปุ่ม "ออกเอกสาร" **วาดแต่จาง** ไม่ซ่อน (มติ 27) — หัวหน้ามีสิทธิ์อยู่ มีแค่นาฬิกาที่ขวาง */
    out.issue = access.issue === true ? { allowed: false, confirm: null } : null;
    out.poll = true;
  } else if (state === 'missing') {
    out.relinkNote = 'ผูกรูปให้ครบก่อนกด “ออกเอกสาร” — ฉบับภายในพิมพ์รูปตามจุดที่ผูกไว้ตอนออก';
    if (access.issue !== true) {
      status = note('info', 'หัวหน้าฝ่ายบริการที่ตอบใบนี้ได้เป็นผู้กดออกเอกสาร');
      preview = () => null;
    } else {
      /* 🔑 ลำดับ (สเปก §4.1): เครื่องไม่ใช่ production → เหตุสดจาก server → ข้อผิดพลาดที่จอจำไว้ (กดออกเอกสารก่อน การส่งทีหลัง)
         → ตรวจล่วงหน้าไม่สำเร็จ → บรรทัดปกติ · **เหตุสดชนะข้อผิดพลาดที่จำไว้เสมอ** */
      const check = isRecord(doc.issue) ? doc.issue : null;
      const blockers = issueBlockers(check);
      const failed = round.issueError
        ? { error: round.issueError, text: trimmed(round.issueError.message) }
        : round.sendFailed ? { error: round.sendFailed, text: trimmed(round.sendFailed.reason) } : null;
      let allowed = false;
      if (offProduction) {
        status = note('warning', NOT_PRODUCTION_TEXT, { foot: draftFoot });
      } else if (blockers.length && blockers.every((b) => b.hold)) {
        /* ⭐ **ติดแค่ข้อกันเอกสารของใบที่มีพื้นที่ประเมินจากแบบ** (ธง `hold` จาก server) — ประโยคของข้อกันอย่างเดียว:
           ไม่มีอะไรให้แก้ ดึงผลกลับก็ไม่ช่วย กดกี่ครั้งก็ไม่ออก (หายเมื่อระบบรุ่นที่รองรับออก) ⇒ ไม่มีปุ่ม "ตรวจอีกครั้ง"
           ไม่มีบรรทัดทางออก และปุ่ม "ออกเอกสาร" จาง (`allowed` ยังเป็นเท็จ) · เหตุของปุ่มที่จางคือประโยคนี้เอง
           🐞 เดิมได้กล่องของเหตุระบบ: "ติด 1 ข้อ · แก้ตามรายการแล้วกด ตรวจอีกครั้ง" — ชวนให้แก้สิ่งที่ไม่มีอะไรให้แก้
           ⚠️ มีเหตุอื่นปนอยู่ = สาขาถัดไป (ทางออกของเหตุนั้นตามเดิม · ข้อกันอยู่ในรายการด้วย) — กติกาเดียวกับ route ออกเอกสาร
           ⚠️ บรรทัดของปุ่มร่างที่จาง (`draftFoot`) ยังต่อท้ายได้ — เป็นเหตุของอีกปุ่มหนึ่ง ไม่ใช่คำแนะนำให้แก้เอกสาร */
        const [first, ...more] = blockers.map((b) => b.text);
        status = note('warning', first, { items: more, foot: draftFoot });
      } else if (blockers.length) {
        const content = blockers.some((b) => b.kind === 'content');
        const wayOut = !content
          ? `แก้ตามรายการแล้วกด “${RECHECK.label}” — ไม่ต้องดึงผลกลับ`
          : spotsUnlinked === true
            ? `รูปจุดผูกได้เลยที่ถาด “${SPOT_TRAY}” ของพื้นที่นั้น (ไม่ต้องดึงผลกลับ) แล้วกด “${RECHECK.label}” · เรื่องอื่นต้องดึงผลกลับมาแก้แล้วส่งใหม่`
            : 'ดึงผลกลับมาแก้แล้วส่งใหม่';
        status = note('warning', `ส่งผลแล้ว แต่ยังออกเอกสารไม่ได้ — ติด ${blockers.length} ข้อ`, {
          items: blockers.map((b) => b.text), foot: joinFoot(wayOut, draftFoot), action: RECHECK,
        });
      } else if (failed) {
        /* ประโยคของ server ตามที่ได้มา — บอกทางออกในตัวแล้ว (ดึงผลกลับ / กดอีกครั้ง / แจ้งผู้ดูแลระบบ) · เว้นกระดาษพิมพ์ไม่ได้
           แบบถาวร ซึ่งต่อทางออกเป็นบรรทัดท้ายกล่อง (`PAPER_BLOCKED_WAY_OUT`) — ปุ่มที่จางต้องบอกว่าต้องทำอะไรต่อ */
        const sticky = surveyIssueErrorSticky(failed.error);
        const wayOut = sticky && failed.error.code === 'paper_blocked' ? PAPER_BLOCKED_WAY_OUT : null;
        status = note('warning', failed.text || 'ออกเอกสารไม่สำเร็จ', { foot: joinFoot(wayOut, draftFoot) });
        allowed = !sticky;
      } else if (check?.unknown === true) {
        status = note('info', 'ส่งผลแล้ว แต่ยังไม่มีเอกสาร — ตรวจล่วงหน้าไม่สำเร็จ กดออกเอกสารได้ ระบบตรวจอีกครั้งตอนกด', { foot: draftFoot });
        allowed = true;
      } else {
        const next = trimmed(doc.nextDocNo);
        status = note('info', `ส่งผลแล้ว แต่ยังไม่มีเอกสาร — กด “ออกเอกสาร” เพื่อออก${next ? ` ${next}` : 'เลขที่ SU'}`, { foot: draftFoot });
        allowed = true;
      }
      out.issue = { allowed, confirm: issueConfirm(doc, request) };
      preview = draftPreview;
    }
  } else if (ISSUED_STATES.includes(state)) {
    const docNo = trimmed(current?.docNo);
    out.rows = [
      { key: 'docNo', label: 'เลขที่', value: docNo || NA },
      { key: 'issuedAt', label: 'ออกเมื่อ', value: dateText(current?.issuedAt) },
      { key: 'issuedBy', label: 'ออกโดย', value: trimmed(current?.issuedByName) || NA },
    ];
    out.printed = round.printed.length ? { title: 'เอกสารฉบับนี้พิมพ์ตามนี้', items: round.printed } : null;
    out.relinkNote = `เอกสาร ${docNo || 'ของใบนี้'} ออกแล้ว — ผูกหรือย้ายรูปจุดตอนนี้ไม่เปลี่ยนเอกสารฉบับนั้น`
      + ' · ถ้าต้องให้เอกสารเปลี่ยน ให้ดึงผลกลับมาแก้แล้วส่งใหม่ (ออกเป็น Rev ถัดไป)';
    const fileReady = (key) => state === 'ready' || current?.ready?.[key] === true;
    const paperReason = trimmed(round.paper?.reason);
    /* ไฟล์ของฉบับนี้ยังไม่มี — GET แรกเป็นคนจัดทำ (ดาวน์โหลด = ลองใหม่ · มติ 6) · เครื่องที่ไม่ใช่ production จัดทำไม่ได้เลย
       ⇒ ถามก่อนข้ออื่น · ระหว่างที่ POST ตามหลังกำลังจัดทำ ลิงก์จางไว้ (กดซ้อน = เปิด chromium อีกตัว) */
    const pending = (key) => {
      if (fileReady(key)) return null;
      if (offProduction) return { blocked: true, status: note('warning', 'ไฟล์ฉบับนี้ยังไม่ถูกจัดทำ — จัดทำได้บนระบบจริง (production) เท่านั้น') };
      if (round.paper?.busy === true) return { blocked: true, status: note('info', 'กำลังจัดทำไฟล์ PDF…') };
      if (paperReason) {
        /* เหตุของ server ตามที่ได้มา ไม่ต่อท้าย (บางประโยคบอก "แจ้งผู้ดูแลระบบ" เองแล้ว) · ทางสำรองอยู่บรรทัดของตัวเอง */
        return {
          blocked: false,
          status: note('warning', paperReason, {
            foot: 'ถ้ากด “ดาวน์โหลด PDF” แล้วขึ้นเหตุเดิม: ดึงผลกลับมาแก้แล้วส่งใหม่ (ออกเป็น Rev ถัดไป) หรือแจ้งผู้ดูแลระบบ',
          }),
        };
      }
      return {
        blocked: false,
        status: note('info', 'ไฟล์ฉบับนี้จัดทำตอนเปิดครั้งแรก — รอประมาณ 10 วินาที', {
          foot: 'ถ้าเปิดไม่ได้ซ้ำด้วยเหตุเดิม: ดึงผลกลับมาแก้แล้วส่งใหม่ หรือแจ้งผู้ดูแลระบบ',
        }),
      };
    };
    statusOf = (key) => pending(key)?.status ?? null;
    preview = (key) => link(LABEL_PREVIEW, surveyDocumentHref(requestId, key, 'view'), pending(key)?.blocked === true);
    download = (key) => link(LABEL_DOWNLOAD, surveyDocumentHref(requestId, key, 'download'), pending(key)?.blocked === true);
  } else {
    /* `stale` — ฉบับที่ใช้อยู่ไม่ใช่ของผลรอบนี้ (ทริกเกอร์แทนที่ไม่ยิง) · ไม่เสิร์ฟ ไม่ออกใหม่จากจอ */
    status = note('danger', SURVEY_DOC_STALE_TEXT);
    out.rows = [
      { key: 'docNo', label: 'เลขที่', value: trimmed(current?.docNo) || NA },
      { key: 'issuedAt', label: 'ออกเมื่อ', value: dateText(current?.issuedAt) },
      { key: 'issuedBy', label: 'ออกโดย', value: trimmed(current?.issuedByName) || NA },
    ];
  }

  out.versions = SURVEY_DOC_VERSIONS.filter((key) => access[key] === true).map((key) => ({
    key,
    label: VERSION_LABELS[key],
    note: VERSION_NOTES[key],
    status: statusOf ? statusOf(key) : status,
    preview: preview(key),
    download: download(key),
  }));
  out.status = statusOf ? (out.versions[0]?.status ?? null) : status;
  /* คำใบ้ของฉบับร่าง — เฉพาะใบที่ยังไม่ส่งผล */
  out.hint = state === 'not_sent' || state === 'recalled'
    ? 'ตัวอย่างก่อนส่งผลมีลายน้ำ “ฉบับร่าง” และยังไม่มีเลขที่ · หมายเหตุพื้นที่พิมพ์ลงฉบับลูกค้าตามที่เขียน — ตรวจก่อนส่งผล'
    : null;
  return out;
}

/* ── บล็อก "เอกสารประเมินพื้นที่" บนหน้าคำร้อง (สเปก §5.1) ─────────────────────────────── */

const REQUEST_UNKNOWN_TEXT = 'อ่านสถานะเอกสารประเมินไม่สำเร็จ — ยังไม่ทราบว่ามีเอกสารหรือไม่ · ลองโหลดหน้าใหม่';
/* คำเดียวกับ `TEXT.none` ของ route เอกสาร (เทสต์อ่านซอร์สของ route เทียบ) */
const NO_DOCUMENT_HEAD = 'ยังไม่มีเอกสารของใบนี้';
const NO_DOCUMENT_TEXT = `${NO_DOCUMENT_HEAD} — แจ้งหัวหน้าฝ่ายบริการให้กดออกเอกสาร`;
const NEXT_REV_TEXT = 'ฉบับใหม่ (Rev ถัดไป) ออกหลังฝ่ายบริการส่งผลอีกครั้ง';
const DO_NOT_USE_TEXT = 'ห้ามใช้ฉบับที่ส่งลูกค้าไปแล้ว';

/* ⭐ **เวลารอไฟล์มีตัวเลขเดียว** — กล่องแจ้ง ("เปิดครั้งแรกรอ…") กับบรรทัดรอหลังกด พิมพ์ติดกันในบล็อกเดียว
   🐞 UAT R02/R16/R21: เดิมกล่องแจ้งบอก 10 วินาที แล้วบรรทัดใต้ปุ่มบอก "รอประมาณ 15 วินาทีแล้วกดอีกครั้ง" — สองตัวเลขข้างกัน
      และอ่านเหมือนต้องกดอีกครั้งถึงจะได้ไฟล์ ทั้งที่การกดครั้งแรกเปิดไฟล์ในแท็บใหม่ไปแล้ว (กดซ้ำ = ดาวน์โหลดสองรอบ)
   ⇒ สองประโยคใช้ค่าคงที่ตัวเดียวกัน · 15 วินาทีเป็นเวลาที่ **จอล็อกปุ่ม** (`DOC_WAIT_MS` ของ SurveyRequestView) ไม่ใช่เวลาที่คนต้องรอไฟล์ */
const FIRST_OPEN_WAIT_TEXT = 'รอประมาณ 10 วินาที';
/** บรรทัดรอหลังกดปุ่มของไฟล์ที่ยังไม่ถูกจัดทำ — พิมพ์ใต้ปุ่ม และเป็นเหตุที่ปุ่มบอกเมื่อถูกกดซ้ำระหว่างรอ */
const FILE_OPENING_TEXT = `ไฟล์กำลังเปิดในแท็บใหม่ — ${FIRST_OPEN_WAIT_TEXT} · กดอีกครั้งเฉพาะเมื่อไฟล์ไม่ขึ้น`;

/* คำของสถานะปลายทางของใบ — คำเดียวกับป้ายบนหัวใบ ("ยกเลิก" · "ปิดเรื่องแล้ว")
   🐞 UAT R17: ใบที่ **ถูกยกเลิก** เคยได้ประโยค "ใบนี้ปิดแล้ว" ทั้งที่หัวใบกับแถบงานบอกว่ายกเลิก (`surveyRequestEnded` รวมสองแบบ) */
const endedWord = (request) => (request?.cancelledAt || request?.status === 'cancelled' ? 'ยกเลิก' : 'ปิด');

/* ⭐ **ฝ่ายขายเห็นอะไรบนใบที่ตอบแล้วแต่ยังไม่มีเอกสาร** (คำถามเจ้าของข้อ 1 ตัวเลือก a · มติ 17) — บอกเสมอ พร้อมช่องทาง
   ที่คนดูใช้ได้จริง: เธรดเมื่อเธรดยังรับข้อความ · "โดยตรง" เมื่อไม่รับ (ใบปิด/ยกเลิกแล้ว · คนดูไม่ใช่สองฝ่ายของใบ)
   เจ้าของเลือก b/c เมื่อไร แก้ที่ฟังก์ชันนี้ที่เดียว (คืน `null` = ไม่มีบล็อก)
   · `threadLocked` = คำของสถานะที่ล็อกเธรด (`'ปิด'` | `'ยกเลิก'`) · ว่าง = เธรดไม่ได้ล็อกเพราะสถานะของใบ */
function missingTextForOthers({ threadOpen, threadLocked }) {
  if (threadOpen) return `${NO_DOCUMENT_TEXT} (เขียนในเธรดด้านล่างได้)`;
  return `${NO_DOCUMENT_HEAD} — แจ้งหัวหน้าฝ่ายบริการโดยตรงให้กดออกเอกสาร${threadLocked ? ` (ใบนี้${threadLocked}แล้ว เขียนในเธรดไม่ได้)` : ''}`;
}

/**
 * 🔑 **บล็อกเอกสารประเมินบนหน้าคำร้อง** — `null` = ไม่มีบล็อก หรือ
 *
 * ```
 * { state, badge: { label, tone }, docNo, issuedText, issuedByName,
 *   text: null | { tone, text }, foot: string | null, waitText: string | null,
 *   buttons: [{ id, label, href, ready: boolean, blocked: string | null }], sheetLink: boolean }
 * ```
 * · `docNo` / `issuedText` (วันเวลาที่ออก) / `issuedByName` = ค่าล้วน (ไม่มี = `—`) ของฉบับที่ใช้อยู่ · สถานะอื่นเป็น `null` ทั้งสาม
 * · `buttons[].id` = คีย์ของฉบับ (`customer` | `internal`) · `ready: false` = ไฟล์ยังไม่ถูกจัดทำ กดแล้วจอล็อกปุ่ม 15 วิ
 *   · `blocked` = เหตุที่กดไม่ได้ (ปุ่มยังวาด และบอกเหตุนี้เมื่อกด) — `href` เป็น `null` เสมอเมื่อ blocked
 *     ⚠️ เหตุนี้คือประโยคเดียวกับ `text.text` เสมอ ⇒ จอบอกเหตุตอนกดด้วย **โทนเดียวกับ `text.tone`** (ไม่ใช่ "ผิดพลาด" ทุกกรณี)
 * · `waitText` = บรรทัดที่จอพิมพ์ใต้ปุ่มระหว่างล็อก 15 วิ (และเป็นเหตุของปุ่มที่ถูกล็อก) · `null` = ไม่มีปุ่มไหนที่กดแล้วต้องรอ
 * · `sheetLink` = วาดลิงก์ "เปิดใบประเมิน" (หัวหน้าไปกดออกเอกสารที่ใบประเมิน — หน้านี้ไม่มีปุ่มออกเอกสาร)
 *
 * 🔴 ฝ่ายขายได้ปุ่มเดียว (ฉบับลูกค้า) — ปุ่มมาจากธง `access` ของ server ทีละฉบับ ไม่มีทางได้ `version=internal` โดยไม่มีสิทธิ์
 * 🔴 **Planner ไม่มีบล็อกทุกกรณี** — เขาได้แค่ `{ access: 'none', voids }` (โมดัล "ยังไม่จบ" อ่าน `surveyReopenDocumentLine`)
 *    · `{ access: 'none', unknown: true }` ขึ้นบล็อก "ไม่ทราบ" เฉพาะฝั่งผู้ขอกับหัวหน้า (มติ 30)
 *
 * @param surveyDocument คีย์ `surveyDocument` ของ GET คำร้อง (ไม่มี `send` / `issue` — เส้นนี้ไม่ตรวจเนื้อเอกสาร)
 * @param request        แถว `dept_requests`
 * @param viewer         `{ canOpenSheet, isRequesterSide, canDecide }` — เปิดใบประเมินได้ · อยู่ฝั่งผู้ขอ (`_mine`) · ส่งผลได้
 *                       ⚠️ ใช้ตัดสิน **ข้อความ** เท่านั้น (ช่องทางแจ้ง · บล็อก "ไม่ทราบ") ไม่เคยใช้ตัดสินลิงก์
 * @param pollStopped    เปลือกเลิกตรวจซ้ำแล้ว (อ่านใบพังติดกันครบเพดาน · `refreshStalled` ของ `app/requests/[id]`)
 *                       ⇒ สถานะ "กำลังออก" บนจอเป็นของเก่าที่ไม่มีใครตรวจต่อ — บล็อกกลายเป็น "ไม่ทราบ" (ดูสาขา `issuing`)
 */
export function surveyRequestDocumentView({ surveyDocument = null, request = null, viewer = {}, pollStopped = false } = {}) {
  const doc = isRecord(surveyDocument) ? surveyDocument : null;
  const access = doc && isRecord(doc.access) ? doc.access : null;
  const state = resolvedState(doc, roundLocal(null, request));
  if (!state || state === 'not_sent') return null;

  const isRequesterSide = viewer?.isRequesterSide === true;
  const block = (extra) => ({
    state,
    badge: BADGES[state] || NO_BADGE,
    docNo: null,
    issuedText: null,
    issuedByName: null,
    text: null,
    foot: null,
    waitText: null,
    buttons: [],
    sheetLink: false,
    ...extra,
  });

  if (state === 'unknown') {
    /* ไม่ทราบ ≠ ไม่มี — แต่บอกเฉพาะใบที่ตอบแล้ว (ใบที่ยังไม่ตอบไม่มีเอกสารให้ถามหา) และเฉพาะคนที่อาจมีสิทธิ์จริง */
    const mayHaveAccess = isRequesterSide || viewer?.canDecide === true;
    if (!request?.answeredAt || (!access && !mayHaveAccess)) return null;
    return block({ text: { tone: 'warning', text: REQUEST_UNKNOWN_TEXT } });
  }

  const current = isRecord(doc.current) ? doc.current : null;
  const lastDocNo = trimmed(historyOf(doc, access)[0]?.docNo);
  const ended = surveyRequestEnded(request);
  /* ใบที่จบแล้วและไม่เคยมีเอกสาร = ไม่มีบล็อก · ฝ่ายขายไม่ได้คีย์ `history` ⇒ สถานะ `recalled` เป็นตัวบอกว่าเคยมี */
  if (ended && !current && state !== 'recalled' && !lastDocNo) return null;

  const requestId = request?.id;
  const keys = SURVEY_DOC_VERSIONS.filter((key) => access[key] === true);
  const withInternal = access.internal === true;
  const labelOf = (key) => (withInternal ? `${LABEL_DOWNLOAD} ${VERSION_LABELS[key]}` : LABEL_DOWNLOAD);
  const blockedButtons = (reason) => keys.map((key) => ({
    id: key, label: labelOf(key), href: null, ready: false, blocked: reason,
  }));
  const blockedBlock = (tone, text, extra = null) => block({
    text: { tone, text }, buttons: blockedButtons(text), ...(extra || {}),
  });
  const closedStatus = ['closed', 'cancelled'].includes(request?.status);
  /* เธรดของคำร้องรับข้อความจากสองฝ่ายของใบ และเฉพาะตอนใบยังเดิน (`updateAccess` · dept_request.canPost) */
  const threadOpen = isRequesterSide && !closedStatus;
  /* เลขของฉบับที่ถูกแทนที่บอกได้เฉพาะคนที่ได้รายการ Rev (หัวหน้าฝ่าย) — คนอื่นได้คำกลาง ๆ */
  const replaced = `${lastDocNo ? `เอกสาร ${lastDocNo} ` : 'เอกสารฉบับก่อน'}ถูกแทนที่แล้ว`;

  if (ended && !current) {
    /* จบแล้ว เหลือแต่ฉบับที่ถูกแทนที่ — ไม่มีปุ่ม ไม่สัญญาฉบับใหม่ (มติ 31) · คำของสถานะตรงกับหัวใบ (ปิด / ยกเลิก) */
    return block({
      badge: BADGES.recalled,
      text: { tone: 'warning', text: `${replaced} — ${DO_NOT_USE_TEXT} · ใบนี้${endedWord(request)}แล้ว ไม่มีฉบับใหม่` },
    });
  }

  if (ISSUED_STATES.includes(state)) {
    const offProduction = doc.storeAllowed === false;
    const fileReady = (key) => state === 'ready' || current?.ready?.[key] === true;
    const offText = 'ไฟล์ยังไม่ถูกจัดทำ — จัดทำได้บนระบบจริง (production) เท่านั้น';
    /* ไฟล์ที่จัดทำแล้วเสิร์ฟได้ทุกเครื่อง (อ่านอย่างเดียว) — จางเฉพาะปุ่มของไฟล์ที่ยังไม่มีบนเครื่องที่จัดทำไม่ได้ */
    const buttons = keys.map((key) => {
      const ready = fileReady(key);
      const blocked = !ready && offProduction ? offText : null;
      return {
        id: key, label: labelOf(key), href: blocked ? null : surveyDocumentHref(requestId, key, 'download'), ready, blocked,
      };
    });
    const waiting = buttons.some((b) => !b.ready);
    const live = buttons.some((b) => !b.blocked);
    /* ไฟล์ยังไม่ถูกจัดทำและเครื่องนี้จัดทำได้ — บอกให้รอ + ทางไปต่อเมื่อเปิดไม่ได้
       🐞 เดิมประโยคเดียวทุกคน ("แจ้งหัวหน้าฝ่ายบริการ…") ⇒ **หัวหน้าฝ่ายเอง** (`access.issue` — คนที่ประโยคนี้ส่งคนอื่นไปหา) ถูกบอกให้
          แจ้งตัวเอง และไม่มีลิงก์ไปใบประเมิน ซึ่งเป็นที่เดียวที่ทางแก้อยู่ (ดึงผลกลับ · ส่งใหม่) — `sheetLink` เดิมขึ้นเฉพาะสถานะ `missing`
       ⇒ หัวหน้าได้ทางออกชุดเดียวกับบรรทัดสำรองของส่วนเอกสารบนใบประเมิน + ลิงก์ "เปิดใบประเมิน" เมื่อเปิดใบได้ */
    const waitingHere = waiting && !offProduction;
    const isHead = access.issue === true;
    const ifFails = isHead
      ? 'ถ้าเปิดไม่ได้ซ้ำด้วยเหตุเดิม: ดึงผลกลับมาแก้แล้วส่งใหม่ที่ใบประเมิน หรือแจ้งผู้ดูแลระบบ'
      : `ถ้าเปิดไม่ได้ แจ้งหัวหน้าฝ่ายบริการ${threadOpen ? 'ในเธรดด้านล่าง' : 'โดยตรง'}`;
    return block({
      docNo: trimmed(current?.docNo) || NA,
      issuedText: dateText(current?.issuedAt),
      issuedByName: trimmed(current?.issuedByName) || NA,
      text: !waiting ? null
        : offProduction ? { tone: 'warning', text: offText }
          : { tone: 'info', text: `เปิดครั้งแรก${FIRST_OPEN_WAIT_TEXT} (ระบบจัดทำไฟล์) · ${ifFails}` },
      foot: live
        ? `ดาวน์โหลดแล้วส่งให้ลูกค้าเอง — ระบบไม่ส่งอีเมลหรือลิงก์ให้ลูกค้า${withInternal ? ' · ฉบับภายในห้ามส่งลูกค้า' : ''}`
        : null,
      /* มีปุ่มที่กดได้และไฟล์ยังไม่ถูกจัดทำ = กดแล้วจอล็อกปุ่มของไฟล์ที่ยังไม่พร้อมไว้ 15 วิ พร้อมบรรทัดนี้ */
      waitText: buttons.some((b) => !b.ready && !b.blocked) ? FILE_OPENING_TEXT : null,
      buttons,
      sheetLink: waitingHere && isHead && viewer?.canOpenSheet === true,
    });
  }

  if (state === 'missing') {
    if (access.issue === true) {
      return blockedBlock('info', `${NO_DOCUMENT_HEAD} — กด “${LABEL_ISSUE}” ที่ใบประเมิน`, {
        sheetLink: viewer?.canOpenSheet === true,
      });
    }
    return blockedBlock('info', missingTextForOthers({ threadOpen, threadLocked: closedStatus ? endedWord(request) : '' }));
  }
  if (state === 'issuing') {
    /* 🐞 UAT (R04/R13 · อ่านใบพังทุกรอบ): เปลือกเลิกตรวจซ้ำหลังพังติดกันครบเพดาน แต่บล็อกยังพิมพ์ "กำลังออก … หน้านี้ตรวจให้เอง
       ทุก 15 วินาที" ค้างไว้ — ไม่มีอะไรบอกว่าเลิกตรวจแล้ว ⇒ สถานะที่จอถืออยู่ไม่มีใครยืนยันต่อ = "ไม่ทราบ" ประโยคเดียวกับ
       การอ่านสถานะไม่สำเร็จ (ทางออกเดียวกัน: โหลดหน้าใหม่) · ไม่มีปุ่ม ตามแถว "ไม่ทราบ" ของตาราง §5.1 */
    if (pollStopped === true) {
      return block({ state: 'unknown', badge: BADGES.unknown, text: { tone: 'warning', text: REQUEST_UNKNOWN_TEXT } });
    }
    return blockedBlock('info', ISSUING_TEXT);
  }
  if (state === 'recalled') return blockedBlock('warning', `${replaced} — ${DO_NOT_USE_TEXT} · ${NEXT_REV_TEXT}`);
  return blockedBlock('danger', SURVEY_DOC_STALE_TEXT);
}

/* ── ข้อความของสองจอ ───────────────────────────────────────────────────────────── */

/**
 * toast หลังกด "ออกเอกสาร" / หลัง POST ตามหลังการส่งผล — คืน `{ kind, msg }` (+ `duration` เมื่อไม่ใช่ค่าตั้งต้น)
 * ⚠️ **ค่าตั้งต้น = ไม่มีคีย์ `duration`** — `normalizeToast` แปลง `null` เป็น 0 มิลลิวินาที
 *
 * @param report `report` ของ POST เอกสาร (`{ docNo, reused, reason }`) หรือ `{ docNo }` ของฉบับที่ **พบตอนโหลดใหม่** หลังคำตอบหาย
 *   · มี `reason` = ออกเลขแล้วแต่ไฟล์ยังไม่เสร็จ · `reused: true` = ฉบับเดิม ไม่ได้ออกเลขใหม่ · `reused: false` = เลขใหม่
 *   · ไม่มี `reused` = จอบอกไม่ได้ว่าการกดครั้งไหนเป็นคนออกเลข ⇒ ประโยคกลาง ไม่อ้างว่าแจ้งผู้ขอ และไม่อ้างว่าไม่ได้ออกเลขใหม่
 */
export function surveyIssueDoneToast(report) {
  const docNo = trimmed(report?.docNo);
  const no = docNo ? ` ${docNo}` : '';
  if (trimmed(report?.reason)) {
    return {
      kind: 'warning', duration: 9000,
      msg: `ออกเลข${no} แล้ว แต่ไฟล์ PDF ยังไม่เสร็จ — ดูเหตุที่ส่วน “เอกสารประเมินพื้นที่”`,
    };
  }
  if (report?.reused === true) return { kind: 'info', msg: `เอกสาร${no} ออกไว้แล้ว — ไม่ได้ออกเลขใหม่` };
  if (report?.reused === false) {
    return { kind: 'success', duration: 6000, msg: `ออกเอกสาร${no} แล้ว — ผู้ขอได้รับแจ้งในเธรดของคำร้อง` };
  }
  return { kind: 'info', msg: `ออกเอกสาร${no} แล้ว` };
}

/**
 * ⭐ toast ของปุ่ม "ตรวจอีกครั้ง" / "โหลดใหม่" ของส่วนเอกสาร — ปุ่มที่มีงานเดียวคือให้ server ตรวจซ้ำ ต้องบอกผลของการกดเสมอ
 *
 * @param section `view.document` **ก่อนกด** (อ่าน `state` กับ `status` — คำบนปุ่ม · จำนวนข้อที่ติด)
 * @param outcome `'failed'` = อ่านใบไม่สำเร็จ · `'same'` = อ่านได้ และคำตอบเรื่องเอกสารของ server เหมือนเดิมทุกตัวอักษร
 *                (คำตอบเปลี่ยน = จอเปลี่ยนให้เห็นเอง ไม่มี toast — ผู้เรียกไม่เรียกฟังก์ชันนี้)
 * @returns `{ kind, msg }`
 *   · `failed` = แดง ใช้คำเดียวกับปุ่มที่กด ("ตรวจอีกครั้งไม่สำเร็จ — ลองใหม่" · "โหลดใหม่ไม่สำเร็จ — ลองใหม่")
 *   · `same` + มีรายการข้อ = "ตรวจแล้ว — ยังติด n ข้อ" · ไม่มีรายการ = "ตรวจแล้ว — ผลยังเหมือนเดิม"
 *   · `same` + สถานะ `unknown` = server ตอบได้ แต่ยังอ่านสถานะเอกสารไม่สำเร็จเหมือนเดิม
 *     🐞 UAT PR-3 (S29): เดิมได้ "ตรวจแล้ว — ผลยังเหมือนเดิม" ทั้งที่ปุ่มที่กดชื่อ "โหลดใหม่" และกล่องยังบอกว่าอ่านไม่สำเร็จ —
 *        toast ไม่ได้บอกว่าการอ่านรอบนี้ก็ไม่สำเร็จ ⇒ ใช้คำของปุ่ม แล้วบอกผลตรง ๆ (โทนเตือน เหมือนกล่องสถานะ)
 */
export function surveyRecheckToast(section, outcome) {
  const status = isRecord(section?.status) ? section.status : null;
  const label = trimmed(status?.action?.label) || RECHECK.label;
  if (outcome === 'failed') return { kind: 'error', msg: `${label}ไม่สำเร็จ — ลองใหม่` };
  if (section?.state === 'unknown') return { kind: 'warning', msg: `${label}แล้ว — ยังอ่านสถานะเอกสารไม่สำเร็จ` };
  const stuck = Array.isArray(status?.items) ? status.items.length : 0;
  return { kind: 'info', msg: stuck ? `ตรวจแล้ว — ยังติด ${stuck} ข้อ` : 'ตรวจแล้ว — ผลยังเหมือนเดิม' };
}

/** toast หลังดึงผลกลับ — ประโยคเดิม + เลขเอกสารที่เพิ่งใช้ไม่ได้ (`supersededReport` ของ route ดึงผลกลับ · `null` = ไม่มี) */
export function surveyRecallDoneText(supersededReport) {
  const docNo = trimmed(supersededReport);
  return `ดึงผลกลับมาแก้แล้ว — ฝ่ายขายได้รับแจ้งพร้อมตัวเลขเดิม${docNo ? ` · เอกสาร ${docNo} ใช้ไม่ได้แล้ว` : ''}`;
}

/**
 * บรรทัดเรื่องเอกสารในโมดัล "ยังไม่จบ" ของหน้าคำร้อง (กติกาโมดัลบอกผลลัพธ์ · #1223) — `null` = ไม่มีอะไรต้องบอก
 * ⭐ ใช้ได้กับทุกคนที่กดปุ่มนี้ได้ รวม Planner ที่ได้แค่ `{ access: 'none', voids }`
 * ⚠️ ใบที่ยังไม่ตอบ การเปิดกลับไม่แทนที่อะไร (ทริกเกอร์ 0401 ยิงเฉพาะตอน `answeredAt` จากมีค่าเป็นว่าง) ⇒ บรรทัด "ไม่ทราบ" ไม่ขึ้น
 */
export function surveyReopenDocumentLine(surveyDocument, request) {
  if (!isRecord(surveyDocument)) return null;
  const voids = trimmed(surveyDocument.voids);
  if (voids) return `เอกสาร ${voids} จะถูกแทนที่ — ใช้ไม่ได้ทันทีที่กด ${DO_NOT_USE_TEXT} · ${NEXT_REV_TEXT}`;
  if (surveyDocument.unknown === true && request?.answeredAt) {
    return 'อ่านสถานะเอกสารประเมินไม่สำเร็จ — ถ้าใบนี้มีเอกสาร SU เอกสารนั้นจะใช้ไม่ได้เมื่อกด';
  }
  return null;
}
