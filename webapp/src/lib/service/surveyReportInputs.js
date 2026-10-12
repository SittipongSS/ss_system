// ── อินพุตของรายงานการประเมินพื้นที่ + รอบตรวจก่อนส่งผล (PR-2 §9) ─────────────────────────────
//
// ⭐ ตัวสร้างภาพนิ่ง (`surveyReportSnapshot.js`) ไม่แตะฐาน — ไฟล์นี้คือคนอ่านทุกอย่างมาส่งให้ **ที่เดียว**
//   สามผู้เรียกจึงเห็นข้อมูลชุดเดียวกัน: รอบตรวจก่อนส่งผล · ขั้นออกเลข (`issueSurveyReport`) · ตัวอย่างฉบับร่าง
//   🐞 ถ้าต่างคนต่างอ่าน: GET ของจอเห็นนัด "ใบล่าสุดสถานะใดก็ได้" · ทะเบียนพื้นที่แค่ `id, code` · ดึงกลับแถวเดียว ·
//      ไม่มีบริษัท/มาตรฐาน ⇒ แถวด่านบนการ์ดจะพูดไม่ตรงกับที่ server ตัดสิน
//
// 🔴 **อ่านไม่สำเร็จ ≠ ไม่มี** (กติกา supabase-never-throws) — `supabase-js` ไม่ throw · คืน `{ data: null, error }`
//   ⇒ ชิ้นที่อ่านพลาดเป็น `null` **และ** ชื่อของมันเข้า `unknown` · ชิ้นที่ไม่มีจริง (ใบไม่มีดีล · นัดไม่มีผู้ช่วย) เป็น `null` เฉย ๆ
//   · ขั้นออกเลขไม่ออกเมื่อ `unknown` ไม่ว่าง: เอกสารที่ตรึงแล้วแก้ไม่ได้ ชื่อผู้ช่วยที่หายเพราะฐานสะดุดครั้งเดียวจะหายตลอดกาล
//   · รอบตรวจก่อนส่งผลไม่ตีกลับเพราะ `unknown` (มติเจ้าของข้อ 2: ปัญหาของระบบไม่ขวางผลไปถึงฝ่ายขาย)
//
// ⚠️ **ไม่ import ของหนัก** — ไฟล์นี้อยู่บนทางของ GET ใบประเมิน (หัวหน้า) และ route ส่งผล: ไม่มี `sharp` ไม่มี chromium
//   มีแต่ตัวอ่านฐานกับตรรกะล้วน · รูปที่ย่อแล้ว (`imageByAttId`) ผู้เรียกเติมเองหลังเตรียมรูป
// ⚠️ **ไม่เขียนอะไรเลย** — ทุกคำสั่งที่นี่เป็น SELECT (สคริปต์ตรวจของจริง `check-survey-report-inputs.mjs` รันตัวนี้ได้ตรง ๆ)
import { getPublishedCompanyProfile } from '@/lib/admin/organizationSettings';
import { documentStandardToForm } from '@/lib/documentStandards';
import { listAttachments } from '@/lib/master/attachments';
import { CUSTOMER_NAME_SELECT, customerNameIn } from '@/lib/master/customerName';
import { ROLE_LABELS, canBeServiceAssignee, canSendSurveyResult, normalizeRole } from '@/lib/permissions';
import { IN_CHUNK_SIZE, fetchInChunks } from '@/lib/supabaseInChunks';
import { loadCrewNames, visitHelperIds } from './crew/visitCrew';
import { loadPackageSizesOrNull } from './packageSizesRepo';
import { SEND_BACK_DONE_KIND, SEND_BACK_KIND } from './survey';
import { surveyMethodMix, surveyNeedsVisit } from './surveyMethod';
import { paginateSurveyReport, surveyReportOverflowErrors } from './surveyReportLayout';
import { surveyReportSignaturesOn } from './surveyReportSignFlag';
import { SURVEY_SIGN_RULE, surveyReportSignerVersions } from './surveyReportSigners';
import {
  SURVEY_REPORT_INPUT_LABELS, SURVEY_REPORT_NO_VISIT, buildSurveyReportSnapshot, surveyReportFreezeIssues,
} from './surveyReportSnapshot';
import { surveyReportSendWarnings, surveyReportView } from './surveyReportView';
import { loadSurveyZones } from './surveyRepo';
import { surveySendVisitStep } from './surveySendClose';

/** คีย์มาตรฐานเอกสารของ FM-TS-01 (แถว seed ของ mig 0401 ⑦ · ลงทะเบียนในหน้าตั้งค่าแล้ว — `DOCUMENT_STANDARD_KEYS`)
 *  กระดาษอ่านจากมาตรฐานนี้แค่บรรทัดแบบฟอร์ม (รหัส · Revision · วันที่มีผล) — **ไม่อ่านสี**: สีชื่อเอกสารเดินตามฉบับ
 *  (ลูกค้า = terracotta · ภายใน = steel — คีย์ตายตัวของ `surveyReportAccentKey` ไม่ได้อ่านมาตรฐานของใบเสนอราคา/ใบสั่งขาย)
 *  แถวที่เผยแพร่ยังถือ `accentKey: 'teal'` ซึ่งไม่มีใครใช้ */
export const SURVEY_REPORT_STANDARD_KEY = 'siteSurvey';

/* คอลัมน์ของนัดที่ภาพนิ่งกับตัวเลือกนัดใช้ — เอ่ยชื่อทีละตัว (ด่าน `check:columns` อ่านค่าคงที่นี้) */
const VISIT_COLUMNS = [
  'id', 'code', 'status', '"scheduledDate"', '"startTime"', '"endTime"',
  '"actualDate"', '"actualStartTime"', '"actualEndTime"', '"actualEndDate"',
  '"assigneeId"', '"assigneeName"', '"assistantIds"', '"unableReason"', '"createdAt"',
].join(', ');

/* คอลัมน์ชุดเดียวกับ `loadSurveySheetContext` (หัวงานของจอประเมิน) ยกเว้นลิงก์แผนที่ซึ่งกระดาษไม่พิมพ์
   — ช่วงเข้าไซต์ต้องมากับแถว (`accessWindowText`) */
const SITE_COLUMNS = 'id, code, name, address, "contactName", "contactPhone", "accessFrom", "accessTo", "accessDays", "accessNote"';

const THREAD_COLUMNS = 'id, kind, body, meta, "authorId", "authorName", "createdAt"';

/* เพดานของแต่ละชิ้น — ใบเดียวไม่มีทางแตะ แต่ทุก query ต้องมีขอบเขตของตัวเอง (ด่าน `check:rowcap`) */
const VISIT_LIMIT = 200;
const HISTORY_LIMIT = 200;

/**
 * กติกาลายเซ็นจริงของรอบนี้เปิดไหม (PR-SIG §1) — `'required'` = เปิด · ไม่ส่ง (`undefined`/`null`) = ถามสวิตช์
 * `SURVEY_REPORT_SIGNATURES` · ค่าอื่นทุกค่า (รวม `'off'`) = ปิด
 * ⚠️ harness กับสคริปต์ตรวจของจริงส่งค่ามาตรง ๆ — ไม่มีใครต้องสลับ env แทนพวกมัน
 */
function signatureRuleOn(signatureRule) {
  if (signatureRule === SURVEY_SIGN_RULE) return true;
  return signatureRule === undefined || signatureRule === null ? surveyReportSignaturesOn() : false;
}

/* บัญชี "ถูกระงับ" = `banned_until` ยังอยู่ในอนาคต — เกณฑ์เดียวกับ /api/users และ `lib/usersRepo.js` */
const accountDisabled = (user, nowMs) => {
  const until = Date.parse(user?.banned_until ?? '');
  return Number.isFinite(until) && until > nowMs;
};

/* แถวบัญชี (auth) → สิ่งที่ตัวถามสิทธิ์ของ `permissions.js` อ่าน: ตำแหน่ง (แปลงชื่อเก่าแล้ว) กับฝ่าย */
const seatAccount = (authUser) => ({
  role: normalizeRole(authUser?.app_metadata?.role) || null,
  department: authUser?.app_metadata?.department || null,
});
/* ชื่อที่ตั้งไว้บนบัญชี — ไม่ถอยไปใช้อีเมล (ชื่อนี้ขึ้นกระดาษที่ส่งลูกค้า) */
const accountName = (authUser) => String(authUser?.user_metadata?.name ?? '').trim() || null;
const notFound = (error) => error?.status === 404 || /not.?found/i.test(error?.message || '');

/** ขึ้นต้นของบรรทัดเธรด "ปิดพร้อมส่งผล โดย …" (`surveySendCloseBody`) — นัดที่ถูกปิดก่อน PR-2 ไม่มี `meta.closedBySend` (เทสต์ล็อกคู่กัน) */
const SEND_CLOSE_BODY_PREFIX = 'ปิดพร้อมส่งผล';

const cleanId = (id) => (id != null && id !== '' ? String(id) : null);
/* วันล้วน `YYYY-MM-DD` จากคอลัมน์ date ของนัด (ไม่ใช่จุดเวลา — ไม่มีโซนเวลาเกี่ยว) · ไม่มี = '' */
const day = (value) => (String(value ?? '').match(/^\d{4}-\d{2}-\d{2}/) || [''])[0];

/* ใหม่ก่อน: วันเข้าจริง แล้ว `createdAt` · เท่ากัน = id ให้ผลนิ่ง (เลือกนัดเดิมทุกครั้งที่ออกเอกสารซ้ำ) */
const newestFirst = (a, b) => {
  const x = day(a?.actualDate);
  const y = day(b?.actualDate);
  if (x !== y) return x < y ? 1 : -1;
  const i = String(a?.createdAt ?? '');
  const j = String(b?.createdAt ?? '');
  if (i !== j) return i < j ? 1 : -1;
  return String(a?.id ?? '') < String(b?.id ?? '') ? -1 : 1;
};

const oldestFirst = (a, b) => {
  const x = day(a?.actualDate || a?.scheduledDate);
  const y = day(b?.actualDate || b?.scheduledDate);
  if (x !== y) return x < y ? -1 : 1;
  const i = String(a?.createdAt ?? '');
  const j = String(b?.createdAt ?? '');
  if (i !== j) return i < j ? -1 : 1;
  return String(a?.id ?? '') < String(b?.id ?? '') ? -1 : 1;
};

/**
 * นัดที่เอกสารรับรอง — นัด `done` ล่าสุดตามวันเข้าจริง แล้ว `createdAt`
 * 🐞 `findSurveyVisit` คืน "ใบล่าสุดสถานะใดก็ได้" ⇒ ใบที่ไปแล้วเข้าไม่ได้หนึ่งรอบแล้วไปใหม่ หรือถูกยกเลิกแล้วลงคิวใหม่
 *   จะได้นัดที่ไม่มีใครเข้าพื้นที่มาลงชื่อผู้ประเมินบนกระดาษ
 */
export function surveyReportVisitOf(visits) {
  return (Array.isArray(visits) ? visits : []).filter((v) => v?.status === 'done').sort(newestFirst)[0] || null;
}

/** นัดอื่นของใบที่ "ทำไม่ได้" — เก่าก่อน · `[{ date, reason }]` (ภาคผนวกของฉบับภายใน) */
function priorUnableOf(visits, visit) {
  const keep = cleanId(visit?.id);
  return visits
    .filter((v) => v?.status === 'unable' && cleanId(v.id) !== keep)
    .sort(oldestFirst)
    .map((v) => ({ date: v.actualDate || v.scheduledDate || null, reason: v.unableReason || null }));
}

/**
 * 🔑 **อ่านอินพุตทั้งชุดของ `buildSurveyReportSnapshot`** — คืน `{ inputs, unknown: string[] }` · ไม่ throw
 *
 * @param opts.request        แถว `dept_requests` (ขั้นออกเลข = แถวหลังเขียนคำตอบ)
 * @param opts.closedVisit    นัดที่การส่งผลนี้ปิด (แถวหลังปิด) — มี = เอกสารรับรองนัดนี้ และ `visitClosedBySend` เป็นจริง
 *                            · รอบตรวจก่อนส่งผลส่งนัดที่ค้าง **บวกแพตช์ปิด** มา (นัดที่กำลังจะถูกปิด)
 *                            · 🔴 ใบประเมินจากแบบทั้งใบ = **ถูกทิ้ง** (ดูย่อหน้า ⭐ ข้างล่าง)
 * @param opts.pendingAnswer  `{ answeredAt, answeredById, answeredByName }` ที่กำลังจะเขียน (รอบตรวจก่อนส่งผล) — ทับลงแถวใบในอินพุต
 * @param opts.zones          แถวผลวัดที่ผู้เรียกอ่านไว้แล้ว (`loadSurveyZones`) — ไม่ส่ง = อ่านเอง · ไม่ถูกแก้ในที่
 * @param opts.filesByZone    `{ [zoneRowId]: attachments[] }` ที่อ่านไว้แล้ว — ไม่ส่ง = อ่านเอง
 * @param opts.sizes          ทะเบียนขนาดที่อ่านไว้แล้ว · `undefined` = อ่านเอง · `null` = ผู้เรียกอ่านไม่สำเร็จ (`loadPackageSizesOrNull`)
 * @param opts.takenAt        จุดเวลาของภาพนิ่ง (ISO) — ผู้เรียกอ่านนาฬิกา · ไม่ส่ง = `null` (ผู้เรียกเติมเองก่อนสร้างภาพนิ่ง)
 * @param opts.signatureRule  กติกาลายเซ็นจริง: `'required'` | `'off'` | ไม่ส่ง = ตามสวิตช์ `SURVEY_REPORT_SIGNATURES` (`signatureRuleOn`)
 * @param opts.actor          ผู้ใช้ของคำขอนี้ (`{ id, role, department }` จากเซสชัน) — ใช้อย่างเดียว: เมื่อเขาคือผู้ส่งผลของใบที่ตอบแล้ว
 *                            สิทธิ์ส่งผลตัดสินจากเซสชันของเขา ไม่ต้องอ่านบัญชีซ้ำ (ขั้นออกเลขส่งมา — เส้นส่งผลจึงไม่มีคำสั่งอ่านเพิ่ม)
 *
 * ⭐ **กติกาลายเซ็นจริงเปิด** (PR-SIG §3.1) — อินพุตได้สี่คีย์เพิ่ม · ปิด = **ไม่มีคีย์ไหนเลย และไม่อ่านตารางลายเซ็นสักคำสั่ง**:
 *   `signatureRule: 'required'` · `signatures` `{ [userId]: null | { versionId, versionNumber, storagePath, sha256, width, height } }`
 *   ของผู้ประเมินกับผู้ส่งผล (ฉบับที่ใช้อยู่ · `null` = ยังไม่มีลายเซ็น) — **อ่านตารางอย่างเดียว ไม่แตะคลังไฟล์** (ไฟล์เป็นงานของ
 *   `prepareSurveyReportSignatures` ตอนกดส่ง/ออกเอกสาร) · อ่านไม่สำเร็จ หรือฉบับที่ใช้อยู่ไม่มีแถว = `unknown` เอ่ยชื่อ `signatures`
 *   (🔴 ไม่มีวันกลายเป็น "ยังไม่มีลายเซ็น") · `answerPending: true` เมื่อทับผู้ส่งที่กำลังจะเขียน ·
 *   `assigneeAccount` `'active' | 'disabled' | 'missing' | null` จากการอ่านบัญชีผู้ประเมินครั้งเดียวกับที่อ่านตำแหน่ง (ไม่มี query เพิ่ม)
 *   🔴 **`signerEligible` `{ assessor, approver }`** (`true` | `false` | `null` = ไม่รู้) — บัญชีของคนบนที่นั่ง "นั่งที่นั่งนั้นได้" ไหม:
 *     `assessor`  บัญชีที่ผูกกับนัด (`visit.assigneeId`) เป็นบัญชีฝ่ายบริการ (`canBeServiceAssignee`) — จากการอ่านบัญชีครั้งเดียวกับ
 *                 ที่อ่านตำแหน่ง · บัญชีถูกลบ = `false` · อ่านไม่สำเร็จ = `null` (ชื่อ `assigneeRole` อยู่ใน `unknown` แล้ว)
 *     `approver`  ผู้ส่งผลมีสิทธิ์ส่งผลประเมิน (`canSendSurveyResult`) — ผู้ส่งที่กำลังจะเขียน (`pendingAnswer`) = `true`
 *                 (เส้นส่งผลตรวจสิทธิ์ของคนกดก่อนอ่านอะไร · ภาพนิ่งที่ตรึงจริงไม่เคยมาจากอินพุตที่มี `pendingAnswer`)
 *                 · ใบที่ตอบไปแล้ว: ผู้ตอบคือ `opts.actor` = สิทธิ์จากเซสชันของเขา · คนเดียวกับผู้ประเมิน = บัญชีที่อ่านมาแล้ว ·
 *                 ไม่งั้นอ่านบัญชีของ `answeredById` ในสายลายเซ็น · บัญชีถูกลบ = `false` · อ่านไม่สำเร็จ = `null` + `signatures` เข้า `unknown`
 *     ⇒ ที่นั่งที่ไม่ได้ `true` ตรงตัว **ไม่พิมพ์ลายเซ็นของบัญชีนั้น และไม่มีใครไปอ่านไฟล์ของเขาในคลัง** (`surveyReportSigners.js`)
 *     🐞 เดิมสายลายเซ็นอ่าน `user_signatures` ของรหัสอะไรก็ตามที่อยู่บนนัด — รหัสนั้นเป็นช่องที่แก้ได้ผ่าน PATCH นัดและเส้นมอบหมาย
 *        ของคำร้อง ⇒ ลายเซ็นของคนนอกฝ่ายบริการขึ้นที่นั่ง "ผู้ประเมิน" ของกระดาษที่ส่งลูกค้าได้
 *   🔴 **ชื่อผู้ประเมินบนกระดาษ = ชื่อบนบัญชีที่ผูกกับนัด** — `visit.assigneeName` เป็นสำเนาที่ไม่มีอะไรบังคับให้ตรงกับ `assigneeId`
 *     (สองช่องนี้เขียนแยกกันได้) ⇒ เมื่อกติกาเปิดและอ่านบัญชีได้ ชื่อในอินพุตถูกแทนด้วยชื่อบนบัญชี: ลายเซ็นกับชื่อใต้ลายเซ็น
 *     เป็นของคนเดียวกันเสมอ · บัญชีไม่มีชื่อ · อ่านบัญชีไม่ได้ · นัดไม่มีชื่อ = ใช้ชื่อบนนัดตามเดิม (ข้อ "ไม่มีชื่อผู้ประเมิน" ของด่านยังทำงาน)
 *   ⭐ **ใบที่มีพื้นที่ประเมินจากแบบ** (ติดข้อกันเอกสาร) ไม่ถูกถามเรื่องลายเซ็นเลย: ไม่อ่านตารางลายเซ็น ไม่อ่านบัญชีของผู้ส่งผล
 *     ไม่แทนชื่อ — `signatures` เป็น `{}` และธงทั้งสองเป็น `null` (ฉบับร่างพิมพ์คำเดิม · `buildSurveyReportSnapshot`)
 *   ⚠️ ไม่ใช้ `loadActiveSignatureAsset` ของใบเสนอราคา: ตัวนั้นกลืน error เป็น "ไม่มี" และลากเครื่องยนต์ใบเสนอราคาเข้า GET ที่เบา
 *
 * `unknown` = ชื่อชิ้นที่อ่านไม่สำเร็จ (คีย์ของ `SURVEY_REPORT_INPUT_LABELS`) · ชุดเดียวกันอยู่ใน `inputs.unknown` ด้วย
 *   ⇒ `surveyReportFreezeIssues(inputs)` เปลี่ยนข้อ "ไม่มี" ของชิ้นนั้นเป็น "อ่านไม่สำเร็จ" (ชนิด `system`) เอง
 * ⚠️ ทุกชิ้นยิงขนานกัน · ชิ้นที่ต้องรู้นัดก่อน (เธรดของนัด · ผู้ช่วย · ตำแหน่งผู้ประเมิน) ต่อท้ายการอ่านนัดในสายเดียวกัน
 *
 * ⭐ **ใบประเมินจากแบบทั้งใบไม่มีนัดให้รับรอง** (mig 0408 · แผน survey-desk-assessment §2 แถว 30) — ทุกพื้นที่ที่ยังอยู่ในใบ
 *   เป็นจากแบบ (`surveyMethodMix(...).mode === 'drawing'`) ⇒ `visit` เป็น `null` เสมอ: **ทั้งนัด `done` ในฐาน และ `closedVisit`
 *   ที่ผู้เรียกส่งมา** · ตัดสินที่นี่ที่เดียว ⇒ ไม่มีผู้เรียกไหน (รอบตรวจ · ขั้นออกเลข · ฉบับร่าง) ยัดนัดเข้าใบงานโต๊ะได้
 *   🐞 ไม่งั้นนัดที่ค้างจากก่อนสลับวิธี (หรือนัดที่ไปแล้วเข้าไม่ได้แล้วถูกปิด `done` ในนาทีเดียวกัน) จะขึ้นกระดาษเป็น "ผู้ประเมิน"
 *      ของผลที่หัวหน้าประเมินจากแบบแปลน
 *   ⚠️ โหมดอื่นทุกโหมดเลือกนัดแบบเดิม — รวมใบที่ **ไม่เหลือพื้นที่** (ตัดหมด) และตอนอ่านผลวัดไม่สำเร็จ (ไม่รู้ ≠ งานโต๊ะ)
 */
export async function loadSurveyReportInputs(supabase, {
  request, closedVisit = null, pendingAnswer = null, zones = null, filesByZone = null, sizes, takenAt = null, signatureRule, actor = null,
} = {}) {
  const requestId = request?.id ?? null;
  const signRule = signatureRuleOn(signatureRule);
  /* แถวใบในอินพุต = แถวของผู้เรียก ทับด้วยผู้ส่งที่กำลังจะเขียน (รอบตรวจก่อนส่งผล) — ผู้ส่งผลของสายลายเซ็นอ่านจากแถวนี้ */
  const answered = pendingAnswer && request ? { ...request, ...pendingAnswer } : (request || null);
  let assigneeAccount = null;
  /* แถวบัญชีของผู้ประเมินที่อ่านมาได้ — ตัดสิน "เป็นบัญชีฝ่ายบริการไหม" · ชื่อบนกระดาษ · และสายลายเซ็นใช้ซ้ำเมื่อผู้ส่งผลเป็นคนเดียวกัน */
  let assigneeUser = null;
  const failed = new Set();
  const miss = (name, error) => {
    failed.add(name);
    console.error('[survey-report] อ่าน', name, 'ไม่สำเร็จ', requestId, error?.message || error);
    return null;
  };
  /* อ่านหนึ่งชิ้น — `{ error }` กับ throw จบที่เดียวกัน: ชิ้นเป็น `null` + ชื่อเข้า `unknown` */
  const read = async (name, run) => {
    try {
      const res = await run();
      if (res?.error) return miss(name, res.error);
      return res?.data ?? null;
    } catch (error) {
      return miss(name, error);
    }
  };

  /* ── ผลวัด → ไฟล์รายพื้นที่ + ทะเบียนพื้นที่ ──────────────────────────────────── */
  /* แถวผลวัดอ่านครั้งเดียว สองสายใช้ร่วมกัน — สายของนัดต้องรู้ก่อนว่าใบเป็นงานโต๊ะไหม (ประเมินจากแบบทั้งใบ = ไม่มีนัดให้รับรอง)
     ⚠️ สายของนัดรอแค่แถว ไม่รอไฟล์/ทะเบียน: ไม่งั้นเธรดของนัด · ผู้ช่วย · ตำแหน่ง ต้องต่อคิวหลังไฟล์ของทุกพื้นที่ */
  const zoneRows = Array.isArray(zones)
    ? zones
    : read('zones', async () => ({ data: await loadSurveyZones(supabase, requestId) }));
  const zonesChain = (async () => {
    const rows = await zoneRows;
    // อ่านผลวัดไม่สำเร็จ = ไม่รู้ว่าต้องอ่านไฟล์/ทะเบียนของพื้นที่ไหน — ชื่อ `zones` พูดแทนทั้งสามชิ้น
    if (!rows) return { zones: null, filesByZone: null, zoneRegistry: null };
    /* รหัส ZN · ชั้น · อาคาร อ่านสดจากทะเบียน (จอประเมินอ่านแค่ `id, code` — กระดาษพิมพ์ชั้น/อาคารด้วย)
       ⚠️ ห่อ `fetchInChunks`: ลิสต์โตตามข้อมูล (พื้นที่ที่ช่างเพิ่มหน้างานไม่มีเพดาน) — `.in()` ยาวเกิน ~16 KB ตายเงียบ */
    const zoneIds = [...new Set(rows.map((r) => r?.zoneId).filter(Boolean))];
    const [files, registry] = await Promise.all([
      filesByZone && typeof filesByZone === 'object'
        ? filesByZone
        : read('files', async () => {
          const lists = await Promise.all(rows.map((z) => listAttachments('service_survey_zone', z.id, supabase)));
          return { data: Object.fromEntries(rows.map((z, i) => [z.id, lists[i] || []])) };
        }),
      zoneIds.length
        ? read('zoneRegistry', () => fetchInChunks(zoneIds, (chunk) => supabase
          .from('service_zones').select('id, code, floor, building').in('id', chunk)
          .order('id', { ascending: true }).limit(IN_CHUNK_SIZE)))
        : [],
    ]);
    return { zones: rows, filesByZone: files, zoneRegistry: registry };
  })();

  /* ── นัดทุกใบของคำร้อง (อ่านครั้งเดียว) → นัดที่รับรอง · นัดที่ทำไม่ได้ · ปิดพร้อมส่งผลไหม · ผู้ช่วย · ตำแหน่ง ── */
  const visitChain = (async () => {
    const [rows, surveyRows] = await Promise.all([
      requestId
        ? read('visits', () => supabase
          .from('service_visits').select(VISIT_COLUMNS).eq('requestId', requestId)
          .order('createdAt', { ascending: false }).order('id', { ascending: true }).limit(VISIT_LIMIT))
        : [],
      zoneRows,
    ]);
    /* 🔑 ประเมินจากแบบทั้งใบ = ไม่มีนัดให้รับรอง — ทิ้งทั้งนัด `done` ในฐานและนัดที่ผู้เรียกส่งมา (หัวฟังก์ชัน ⭐)
       ⚠️ อ่านผลวัดไม่สำเร็จ (`null`) = ไม่รู้ว่าเป็นงานโต๊ะไหม ⇒ เลือกนัดแบบเดิม · ใบที่ไม่เหลือพื้นที่ (โหมด `empty`) ก็แบบเดิม */
    const desk = !!surveyRows && surveyMethodMix(surveyRows).mode === 'drawing';
    const closing = desk ? null : closedVisit;
    const visit = desk ? null : (closing || surveyReportVisitOf(rows));
    const visitId = cleanId(visit?.id);
    const helperIds = visitHelperIds(visit);
    const assigneeId = cleanId(visit?.assigneeId);

    const [closedBySend, helpers, assigneeRoleLabel] = await Promise.all([
      /* ปิดพร้อมการส่งผลไหม — เวลาจบที่ไม่มีบนนัดต้องอ่านว่า "ไม่ได้กดส่งงาน" ไม่ใช่ "ระบบทำหาย" (`visitTimeCredible`)
         แถว `done` ล่าสุดเป็นตัวตัดสิน: นัดที่ถูกเปิดกลับแล้วช่างส่งงานเอง = ไม่ใช่ปิดพร้อมส่งผลแล้ว */
      (async () => {
        if (closing) return true;
        if (!visitId) return false;
        const thread = await read('visitThread', () => supabase
          .from('entity_updates').select('id, body, meta, "createdAt"')
          .eq('entityType', 'service_visit').eq('entityId', visitId).eq('kind', 'done')
          .order('createdAt', { ascending: false }).limit(1));
        const last = (thread || [])[0] || null;
        return last?.meta?.closedBySend === true || String(last?.body ?? '').startsWith(SEND_CLOSE_BODY_PREFIX);
      })(),
      /* ⚠️ `loadCrewNames` คืน **Map** — ส่งต่อทั้งก้อนไม่ได้ (ตัวสร้างภาพนิ่งรับลิสต์ ⇒ Map กลายเป็น "ไม่มีผู้ช่วย" เงียบ ๆ)
         แปลงตามลำดับบนนัด · `failed` = ไม่ทราบ (ทั้งชิ้นเป็น null) · `gone` (บัญชีถูกลบ) = ไม่พิมพ์ชื่อนั้น */
      (async () => {
        if (!helperIds.length) return [];
        return read('helpers', async () => {
          const names = await loadCrewNames(supabase, helperIds);
          const out = [];
          for (const id of helperIds) {
            const hit = names.get(id);
            if (!hit || hit.failed) return { error: { message: `อ่านชื่อผู้ช่วย ${id} ไม่สำเร็จ` } };
            if (hit.name) out.push({ id, name: hit.name });
          }
          return { data: out };
        });
      })(),
      /* ตำแหน่งของผู้ประเมิน ("เจ้าหน้าที่บริการอาวุโส (Senior)") — ป้ายเดียวกับทะเบียนผู้ใช้ (`ROLE_LABELS`)
         บัญชีถูกลบไปแล้ว = ไม่มีตำแหน่งให้พิมพ์ (กระดาษพิมพ์ฝ่ายอย่างเดียว) ไม่ใช่อ่านพลาด */
      (async () => {
        if (!assigneeId) return null;
        return read('assigneeRole', async () => {
          const { data, error } = await supabase.auth.admin.getUserById(assigneeId);
          if (error) {
            if (notFound(error)) {
              assigneeAccount = 'missing';
              return { data: null };
            }
            return { error };
          }
          assigneeUser = data?.user || null;
          /* สถานะบัญชีของผู้ประเมิน — ใช้แต่งข้อความ "ยังไม่มีลายเซ็น" ให้ตรงความจริง (บัญชีปิดแล้วเพิ่มลายเซ็นเองไม่ได้)
             "ตอนนี้" = จุดเวลาของภาพนิ่งเมื่อผู้เรียกส่งมา (เทสต์และ harness ตรึงนาฬิกาได้) */
          if (!data?.user) assigneeAccount = 'missing';
          else assigneeAccount = accountDisabled(data.user, Date.parse(takenAt ?? '') || Date.now()) ? 'disabled' : 'active';
          const role = normalizeRole(data?.user?.app_metadata?.role);
          return { data: (role && Object.hasOwn(ROLE_LABELS, role) && ROLE_LABELS[role]) || null };
        });
      })(),
    ]);

    /* ── กติกาลายเซ็นจริง: ผู้ประเมินบนกระดาษคือ **บัญชี** ที่ผูกกับนัด (หัวฟังก์ชัน 🔴 สองข้อ) ──────────────────
       ⚠️ ใบที่มีพื้นที่ประเมินจากแบบไม่ถูกถามเรื่องลายเซ็น — ไม่ตั้งธง ไม่แทนชื่อ (อ่านผลวัดไม่สำเร็จ = ไม่รู้ว่าเป็นใบแบบนั้น ⇒ ถามตามปกติ) */
    const sheetSigns = signRule && !(surveyRows && surveyMethodMix(surveyRows).drawing > 0);
    let assessorEligible = null;
    let certified = visit || null;
    if (sheetSigns && assigneeId) {
      if (assigneeUser) {
        assessorEligible = canBeServiceAssignee(seatAccount(assigneeUser));
        const onAccount = accountName(assigneeUser);
        const onVisit = String(certified?.assigneeName ?? '').trim();
        if (onAccount && onVisit && onAccount !== onVisit) certified = { ...certified, assigneeName: onAccount };
      } else if (assigneeAccount === 'missing') {
        assessorEligible = false;
      }
    }

    return {
      visit: certified,
      assessorEligible,
      // อ่านนัดไม่สำเร็จ = ไม่รู้ว่ามีนัดที่ทำไม่ได้ไหม (`null`) — ต่างจาก "ไม่มี" (`[]`) · ใบงานโต๊ะยังเก็บนัดที่ทำไม่ได้ครบทุกใบ
      priorUnable: rows ? priorUnableOf(rows, visit) : null,
      visitClosedBySend: closedBySend,
      helpers,
      assigneeRoleLabel,
    };
  })();

  /* ── ลายเซ็นฉบับที่ใช้อยู่ของผู้ลงนาม (กติกาลายเซ็นจริงเปิดเท่านั้น) — ต่อท้ายสายของนัด: ต้องรู้ผู้ประเมินก่อน ──────────
     สองคำสั่ง ตารางล้วน: ราก `user_signatures` ด้วย `userId` (ไม่ใช่ `id`) → ฉบับ `user_signature_versions` ด้วย `id`
     + บัญชีของผู้ส่งผลของใบที่ตอบไปแล้ว (ตัดสินธง `signerEligible.approver` — หัวฟังก์ชัน) · คืน `{ signatures, approver }`
     🔴 error ของคำสั่งไหนก็ตาม หรือรากชี้ฉบับที่ไม่มีแถว = ทั้งชิ้นอ่านไม่สำเร็จ (`unknown`) — ห้ามตกไปเป็น `null` ("ยังไม่มีลายเซ็น")
        ไม่งั้นฐานสะดุดครั้งเดียวตีกลับการส่งผลด้วยประโยคที่ชี้ให้คนไปเพิ่มลายเซ็นที่มีอยู่แล้ว
     ⭐ **ใบที่มีพื้นที่ประเมินจากแบบ = ไม่อ่านอะไรเลย** — ใบแบบนั้นไม่ถูกถามเรื่องลายเซ็น (ติดข้อกันเอกสาร) ⇒ ตารางลายเซ็นล่มต้องไม่ทำให้
        ฉบับร่างของมันตอบ "อ่านลายเซ็นของผู้ลงนามไม่สำเร็จ" · อ่านผลวัดไม่สำเร็จ (`null`) = ไม่รู้ว่าเป็นใบแบบนั้น ⇒ อ่านตามปกติ
     ⚠️ ลิสต์ id ยาวไม่เกินสอง (ผู้ประเมิน · ผู้ส่งผล) — เพดานของแต่ละคำสั่ง = จำนวน id ที่ถาม */
  const signChain = signRule ? (async () => {
    const [{ visit }, surveyRows] = await Promise.all([visitChain, zoneRows]);
    if (surveyRows && surveyMethodMix(surveyRows).drawing > 0) return { signatures: {}, approver: null };
    const assigneeId = cleanId(visit?.assigneeId);
    const answererId = cleanId(answered?.answeredById);
    /* ผู้ส่งที่กำลังจะเขียน = คนที่กดส่งผลอยู่ตอนนี้ — เส้นส่งผลตรวจ `canSendSurveyResult` ของเขาก่อนอ่านอะไรทั้งนั้น */
    let approver = pendingAnswer && request ? true : null;
    const ids = [...new Set([assigneeId, answererId].filter(Boolean))];
    if (!ids.length) return { signatures: {}, approver };
    const signatures = await read('signatures', async () => {
      const roots = await supabase.from('user_signatures')
        .select('"userId", "activeVersionId"').in('userId', ids).limit(ids.length);
      if (roots.error) return { error: roots.error };
      const activeOf = new Map();
      for (const root of roots.data || []) {
        const versionId = cleanId(root?.activeVersionId);
        if (versionId) activeOf.set(String(root.userId), versionId);
      }
      const versionIds = [...new Set(activeOf.values())];
      const versionOf = new Map();
      if (versionIds.length) {
        const versions = await supabase.from('user_signature_versions')
          .select('id, "versionNumber", "storagePath", sha256, width, height').in('id', versionIds).limit(versionIds.length);
        if (versions.error) return { error: versions.error };
        for (const row of versions.data || []) versionOf.set(String(row.id), row);
      }
      const out = {};
      for (const id of ids) {
        const versionId = activeOf.get(id);
        if (!versionId) { out[id] = null; continue; }
        const row = versionOf.get(versionId);
        if (!row) return { error: { message: `รากลายเซ็นชี้ฉบับ ${versionId} ที่ไม่มีแถว` } };
        const { versionNumber, storagePath, sha256, width, height } = row;
        out[id] = { versionId, versionNumber, storagePath, sha256, width, height };
      }
      /* ใบที่ตอบไปแล้ว: ผู้ตอบยังเป็นคนที่ส่งผลประเมินได้ไหม — ใบที่ตอบผ่านปุ่มทั่วไปก่อน 24/09 ถูกตอบโดยใครก็ได้ที่ตอบคำร้องของฝ่ายได้
         (รวมหัวหน้าฝ่ายขายและเจ้าหน้าที่ที่ไม่ใช่หัวหน้า) ⇒ ลายเซ็นของคนนั้นห้ามขึ้นใต้คำว่า "ผู้ตรวจสอบและอนุมัติ · หัวหน้าฝ่ายบริการ"
         ⚠️ ตัดสินจากตำแหน่ง **ปัจจุบัน** ของบัญชี (ไม่มีประวัติตำแหน่ง ณ วันส่ง) — ไม่ผ่าน = ดึงผลกลับแล้วให้หัวหน้าส่งใหม่ */
      if (approver === null && answered?.answeredAt && answererId) {
        if (cleanId(actor?.id) === answererId) {
          approver = canSendSurveyResult(actor);
        } else if (answererId === assigneeId && assigneeUser) {
          approver = canSendSurveyResult(seatAccount(assigneeUser));
        } else {
          const { data, error } = await supabase.auth.admin.getUserById(answererId);
          if (error && !notFound(error)) return { error };
          approver = !error && data?.user ? canSendSurveyResult(seatAccount(data.user)) : false;
        }
      }
      return { data: out };
    });
    return { signatures, approver: signatures ? approver : null };
  })() : null;

  const [zonePart, visitPart, site, customerRow, deal, history, sizeRows, company, standard, signPart] = await Promise.all([
    zonesChain,
    visitChain,
    request?.siteId
      ? read('site', () => supabase.from('service_sites').select(SITE_COLUMNS).eq('id', request.siteId).maybeSingle())
      : null,
    /* 🔴 ห้าม select แค่ `name` — ลูกค้าที่มีแต่ชื่ออังกฤษจะได้ `null` ทั้งที่ชื่อมีจริง (บทเรียน AR-630 · `customerName.js`) */
    request?.customerId
      ? read('customer', () => supabase.from('customers').select(`${CUSTOMER_NAME_SELECT}, "arCode"`)
        .eq('id', request.customerId).maybeSingle())
      : null,
    request?.dealId
      ? read('deal', () => supabase.from('sales_deals').select('id, code').eq('id', request.dealId).maybeSingle())
      : null,
    /* ตีกลับ · แจ้งแก้แล้ว · ดึงกลับ **ทุกรอบ** (ภาคผนวกของฉบับภายใน) — ตัวโหลดของจออ่านแค่แถวล่าสุด (1 และ 20 แถว)
       ใหม่ก่อนแล้วตัดที่เพดาน: ถ้าเกินจริง ของที่หลุดคือรอบเก่าสุด · ตัวสร้างภาพนิ่งเรียงเก่าก่อนเอง */
    requestId
      ? read('history', () => supabase.from('entity_updates').select(THREAD_COLUMNS)
        .eq('entityType', 'dept_request').eq('entityId', String(requestId))
        .in('kind', ['recall', SEND_BACK_KIND, SEND_BACK_DONE_KIND])
        .order('createdAt', { ascending: false }).limit(HISTORY_LIMIT))
      : [],
    // `null` จากตัวโหลด = อ่านไม่สำเร็จ (ไม่ใช่ทะเบียนว่าง) — กติกาเดียวกับ GET ใบประเมินและ route ส่งผล
    sizes === undefined
      ? read('sizes', async () => {
        const rows = await loadPackageSizesOrNull(supabase);
        return rows ? { data: rows } : { error: { message: 'อ่านทะเบียนขนาดแพ็คเกจไม่สำเร็จ' } };
      })
      : (Array.isArray(sizes) ? sizes : miss('sizes', 'ผู้เรียกอ่านทะเบียนขนาดไม่สำเร็จ')),
    /* บริษัทที่เผยแพร่ — ตัวเดียวกับ QT/SO/สัญญา/PDR · ไม่มีแถวที่เผยแพร่ = ค่าสำรองของ `documentBrand` (ไม่ใช่อ่านพลาด) */
    read('company', async () => ({ data: await getPublishedCompanyProfile(supabase) })),
    read('form', () => supabase.from('document_standard_versions')
      .select('"formCode", revision, "effectiveDate", "titleEn", "versionNumber"')
      .eq('documentKey', SURVEY_REPORT_STANDARD_KEY).eq('status', 'published')
      .order('versionNumber', { ascending: false }).limit(1)),
    signChain,
  ]);

  const form = documentStandardToForm((standard || [])[0] || null);
  // ลำดับตามตารางป้าย ไม่ใช่ตามว่าการอ่านไหนล้มก่อน — ข้อความที่ขึ้นจอและลง log นิ่งทุกรอบ
  const unknown = Object.keys(SURVEY_REPORT_INPUT_LABELS).filter((name) => failed.has(name));
  const inputs = {
    takenAt: takenAt || null,
    request: answered,
    deal: deal ? { code: deal.code || null } : null,
    // ไทยก่อน ไม่มีค่อยตกไปอังกฤษ — ตัวเดียวกับที่ทุกจุดสำเนาชื่อลูกค้าใช้ ห้ามอ่าน `.name` ตรง ๆ
    customer: customerRow
      ? { id: customerRow.id, arCode: customerRow.arCode || null, name: customerNameIn(customerRow, 'th') || null }
      : null,
    site: site || null,
    visit: visitPart.visit,
    visitClosedBySend: visitPart.visitClosedBySend,
    assigneeRoleLabel: visitPart.assigneeRoleLabel,
    helpers: visitPart.helpers,
    priorUnable: visitPart.priorUnable,
    zones: zonePart.zones,
    zoneRegistry: zonePart.zoneRegistry,
    filesByZone: zonePart.filesByZone,
    sizes: sizeRows,
    history,
    company: company
      ? {
        name: company.legalNameTh || null, address: company.address || null, taxId: company.taxId || null,
        tel: company.phone || null, line: company.line || null, website: company.website || null,
      }
      : null,
    // `documentStandardToForm` คืนวันที่มีผลเป็น พ.ศ. แล้ว ("29/09/2569")
    form: form ? { code: form.code, revision: form.revision, effectiveDate: form.effectiveDate } : null,
    unknown,
    /* กติกาลายเซ็นจริง — คีย์ทั้งชุดมีเฉพาะตอนเปิด (ปิด = อินพุตเท่าเดิมทุกคีย์ · ภาพนิ่งไม่มี `signatures`) */
    ...(signRule ? {
      signatureRule: SURVEY_SIGN_RULE,
      signatures: signPart?.signatures ?? null,
      ...(pendingAnswer && request ? { answerPending: true } : {}),
      assigneeAccount,
      signerEligible: { assessor: visitPart.assessorEligible, approver: signPart?.approver ?? null },
    } : {}),
  };
  return { inputs, unknown };
}

/* ฉบับที่ต้องจัดหน้าได้ทั้งคู่ก่อนส่งผล — ป้ายนำหน้าเหตุ: เลขหน้าของสองฉบับไม่ตรงกัน (ฉบับภายในมีแผงกับภาคผนวก) */
const VERSIONS = [['customer', 'ฉบับลูกค้า'], ['internal', 'ฉบับภายใน']];

/**
 * 🔑 **รอบตรวจก่อนส่งผล** — คืน `{ blockers: [{ kind, text }], warnings: string[], unknown: string[], signers }`
 *   ตัวเดียวของ route ส่งผล (S5) และของ GET ใบประเมิน (`document.send`) ⇒ แถวด่านบนการ์ดพูดตรงกับที่ server ตัดสิน
 *
 * @param opts.request      แถว `dept_requests` · ยังไม่ส่งผล = ใส่ผู้ส่งที่กำลังจะเขียน (`nowIso` + `user`) ให้ในอินพุต
 *                          (ตัวสร้างภาพนิ่งบังคับ `answeredAt` + `answeredByName`) · ส่งผลแล้ว = ใช้ของบนแถว
 * @param opts.zones · filesByZone · sizes   ที่ผู้เรียกอ่านไว้แล้วสำหรับด่านหกข้อ — ไม่ส่ง = ตัวโหลดอ่านเอง
 * @param opts.open         นัดที่ยังกินสิทธิ์ของใบ (`findSurveyVisit(…, { openOnly: true })`) หรือ null
 * @param opts.today        วันไทยวันนี้ `YYYY-MM-DD` (`businessDate()` ของผู้เรียก) · @param opts.nowIso จุดเวลาของคำขอ
 *
 * - `blockers` = `surveyReportFreezeIssues` ทุกชนิด + (เมื่อภาพนิ่งโหมด `check` ออกได้) หน้าที่ล้นของทั้งสองฉบับ ชนิด `content`
 *    ⭐ การส่งผลตีกลับเฉพาะชนิด `content` · ขั้นออกเลขตีกลับทุกชนิด (ผู้เรียกกรองเอง)
 *    ⚠️ ตัวจัดหน้าไม่อ่านขนาดรูป ⇒ โหมด `check` (ยังไม่มีรูป) จัดหน้าได้ผลเท่าโหมด `freeze`
 *    ⭐ นัดที่ค้างยังเป็นร่าง = เหตุของ `surveySendVisitStep` เอง (ข้อความเดียวกับที่ route ตอบ) แทน "ไม่พบนัดประเมิน"
 *       · ใบประเมินจากแบบทั้งใบที่นัดยังเปิด (ร่าง/นัดไว้) ก็มาทางเดียวกัน — ประโยคงานโต๊ะของ `surveySendVisitStep`
 *       · `needsVisit` คิดจาก `zones` ที่ผู้เรียกส่งมา (`surveyNeedsVisit`) · **ไม่ได้ส่งแถวมา = ต้องมีนัด** (พฤติกรรมเดิม) —
 *         ตัวโหลดยังทิ้งนัดของใบงานโต๊ะเองอีกชั้น ผู้เรียกที่ไม่ได้ส่งแถวจึงไม่ทำให้นัดขึ้นกระดาษ
 *    🔴 **ไม่มีคำไหนในข้อความที่คนพิมพ์เป็นเหตุขัดข้อง** (มติเจ้าของข้อ 3: พิมพ์ตามที่พิมพ์มา — คำต้องห้ามเป็นแค่คำเตือน)
 *       ⇒ สิ่งที่รอบตรวจนี้ปล่อยผ่าน ขั้นออกเลขต้องไม่มาติดหลังใบถูกตอบ (มติข้อ 2): ยามกันรั่วของฉบับลูกค้า
 *       (`surveyReportCustomerHtmlIssues`) จึงดู markup ของตัวเรนเดอร์ ไม่ค้นคำ — หมายเหตุ "ดูรายละเอียดในฉบับภายใน" ผ่านทั้งสองด่าน
 *       🐞 เดิมยามค้นคำว่า "ฉบับภายใน" ทั้ง HTML: รอบตรวจปล่อยผ่าน → ใบถูกตอบ กระดิ่งถึงฝ่ายขาย → เอกสารออกไม่ได้ทุกครั้งที่กด
 *       (เทสต์ของไฟล์นี้ล็อกสองด่านคู่กัน — ใครเพิ่มด่านคำที่ฝั่งใดฝั่งหนึ่ง ต้องเพิ่มอีกฝั่งให้ตรงกัน)
 * - `warnings` = `surveyReportSendWarnings` ของฉบับลูกค้าจากภาพนิ่งโหมด `draft` (ของขาดไม่ล้ม) — จอกางให้หัวหน้าอ่านแล้วส่งกลับ
 *    มาเป็น `seenWarnings` · server ตีกลับเฉพาะเมื่อเจอบรรทัดที่จอไม่ได้ส่งมา
 * - `unknown`  = ชิ้นที่อ่านไม่สำเร็จ — ไม่ว่าง = ผู้เรียกข้ามการตีกลับ (ปัญหาของระบบไม่ขวางการส่งผล)
 * - `signers`  = `surveyReportSignerVersions(inputs)` — ลายเซ็นฉบับที่จะพิมพ์ คนละแถว (กติกาลายเซ็นจริงเปิด + ทุกที่นั่งมีลายเซ็น +
 *    ใบไม่ติดข้อกันของใบจากแบบ) · ไม่งั้น `[]` · เส้นส่งผลเอาไปเตรียมไฟล์ลายเซ็น **ก่อนเขียน** แล้วส่งต่อให้ขั้นออกเลข
 *    🔴 แถวพก `storagePath` — ผู้เรียกที่ประกอบ payload ต้องคัดเฉพาะ `seats` กับ `name` (`documentChecks` คัดคีย์ทีละตัวอยู่แล้ว)
 *    · บรรทัด "ยังไม่มีลายเซ็น" อยู่ใน `blockers` (ชนิด `content` + `sign: true` + `userId` · `surveyReportSignatureIssues`)
 * @param opts.signatureRule  ส่งต่อให้ตัวโหลด (`'required'` | `'off'` | ไม่ส่ง = ตามสวิตช์)
 * ⚠️ ตัวโหลดไม่ throw · ตรรกะล้วนข้างล่าง throw ได้เมื่อข้อมูลผิดรูปจริง ๆ — ผู้เรียกห่อ try/catch แล้วไม่ตีกลับ (สเปก S5)
 */
export async function surveyReportPrecheck(supabase, {
  request, user = null, zones = null, filesByZone = null, sizes, open = null, today = null, nowIso = null, signatureRule,
} = {}) {
  const needsVisit = Array.isArray(zones) ? surveyNeedsVisit(zones) : true;
  const step = surveySendVisitStep(open, { today, needsVisit });
  const closing = step.action === 'close' ? { ...open, ...step.patch } : null;
  const pendingAnswer = request && !request.answeredAt
    ? { answeredAt: nowIso, answeredById: user?.id ?? null, answeredByName: user?.name ?? null }
    : null;

  const { inputs, unknown } = await loadSurveyReportInputs(supabase, {
    request, closedVisit: closing, pendingAnswer, zones, filesByZone, sizes, takenAt: nowIso, signatureRule,
    // คนดู/คนกดที่เป็นผู้ส่งผลของใบที่ตอบแล้ว = สิทธิ์ส่งผลจากเซสชันของเขา (ไม่อ่านบัญชีซ้ำทุกครั้งที่เขาเปิดใบของตัวเอง)
    actor: user,
  });

  let blockers = surveyReportFreezeIssues(inputs);
  if (step.action === 'block') {
    blockers = [
      { kind: 'content', text: step.error },
      ...blockers.filter((issue) => issue.text !== SURVEY_REPORT_NO_VISIT),
    ];
  }

  const checked = buildSurveyReportSnapshot(inputs, { mode: 'check' });
  if (checked.snapshot) {
    for (const [version, label] of VERSIONS) {
      const layout = paginateSurveyReport(surveyReportView(checked.snapshot, { version }));
      for (const line of surveyReportOverflowErrors(layout)) blockers.push({ kind: 'content', text: `${label}: ${line}` });
    }
  }

  const draft = buildSurveyReportSnapshot(inputs, { mode: 'draft' });
  const warnings = surveyReportSendWarnings(surveyReportView(draft.snapshot, { version: 'customer' }));

  return { blockers, warnings: Array.isArray(warnings) ? warnings : [], unknown, signers: surveyReportSignerVersions(inputs) };
}
