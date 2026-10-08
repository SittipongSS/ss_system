// ── แถวของรายงานการประเมินพื้นที่ (`service_survey_reports` · mig 0401) — ตัวอ่านที่เบาที่สุดของ PR-2 ─────────
//
// ⭐ **ไฟล์นี้อยู่บนเส้น import ของทุกทางที่แตะใบประเมิน** — GET ใบประเมิน (ช่างเปิดทุกครั้งที่บันทึกหน้างาน) ·
//   GET/PATCH คำร้อง · ส่งผล · ดึงผลกลับ ⇒ **ห้าม import ของหนักที่หัวไฟล์** (สเปก PR-2 §14 · มติ 24)
//   · `sharp` โยนตอนโหลดเมื่อไบนารีของแพลตฟอร์มหาย · `htmlPdf` ลาก puppeteer-core + chromium มาทั้งก้อน
//   · ตัวโหลดข้อมูลเอกสาร (`surveyReportInputs`) ลากตัวประกอบภาพนิ่ง/ตัวจัดหน้าเข้ามา — โหลดด้วย `await import()`
//     ข้างใน `surveyDocumentSummary` เฉพาะตอนที่ต้องตรวจจริง (หัวหน้าฝ่าย + `withChecks`)
//   เทสต์อ่านซอร์สล็อกไว้ (`surveyReportRows.test.mjs`) · ด่าน `check-doc-tracing.mjs` ตรวจซ้ำที่ผล build
//
// 🔴 **dev DB = prod DB** ⇒ ของถาวรเขียนได้บน production deployment เท่านั้น (`surveyReportStoreAllowed` · §0)
//   GET ดูเหมือนอ่านอย่างเดียว แต่ GET แรกของเอกสาร "ตรึง" คอลัมน์ที่เขียนได้ครั้งเดียว — preview deploy หรือเครื่อง dev
//   ที่มี chromium จะตรึงฉบับจริงด้วยตัวเรนเดอร์ของกิ่งและฟอนต์สำรองของเครื่องนั้น แก้คืนไม่ได้
//
// 🔴 **ไม่มี payload ไหนพก `snapshot` · `customerHtml` · `internalHtml`** — ทุก select ที่นี่ใช้ `SURVEY_REPORT_COLUMNS`
//   ไม่มี `*` · สรุปของจอ (`surveyDocumentSummary`) คัดคีย์ทีละตัว ไม่ส่งแถวต่อ ⇒ คอลัมน์ที่เพิ่มวันหน้าไม่หลุดเอง
//   ⚠️ id ของแถวก็ไม่ออก — มันคือที่อยู่ไฟล์ PDF (`pdf/<reportId>/<version>.pdf` · มติ 16)
//
// ⚠️ supabase **ไม่ throw** — ทุก query ที่นี่อ่าน `{ data, error }` · ตัวอ่านทั้งสามไม่โยนออกไปหา route
//   (อ่านเอกสารไม่สำเร็จต้องไม่ลากใบประเมิน/การดึงผลกลับล้มตาม) แต่ **บอกว่าไม่รู้** ไม่ใช่ตอบว่าไม่มี
import { businessDate } from '@/lib/businessDate';
import { canAnswerRequest, canManageRequest } from '@/lib/requests/access';
import { surveyDocAccess } from './surveyAccess';
import { surveyReportCurrent, surveyReportIsStale, surveyReportState } from './surveyReportState';

/** bucket ส่วนตัวของเอกสาร (0401 ⑥) — `img/<sha>.jpg` รูปที่ย่อแล้ว · `pdf/<reportId>/<version>.pdf` */
export const SURVEY_REPORT_BUCKET = 'survey-report';

/* คอลัมน์ของแถวเอกสารที่ทุกทางอ่าน — ทุกช่องต้องมีจริงบนฐาน (ด่าน `check:columns` อ่านค่าคงที่นี้)
   🔴 **ไม่มี `snapshot` · `customerHtml` · `internalHtml` · `images`** — ก้อนใหญ่และของภายใน อ่านเฉพาะในขั้นกระดาษ
      (`surveyReportPaper` เลือกเองทีละช่อง) · เทสต์ล็อกรายชื่อนี้กับ CREATE TABLE ของ 0401
   ⭐ `customerName` = ชื่อลูกค้า **จากภาพนิ่งที่ตรึง** (คีย์เดียว ไม่ใช่ทั้งก้อน) — ชื่อไฟล์ของ route เอกสาร
      (`surveyReportFileName` · §6) ต้องตรงกับที่พิมพ์บนกระดาษ ไม่ใช่ชื่อในทะเบียนวันนี้
   ⚠️ ชื่อตารางเขียนเป็นสตริงตรง ๆ ทุกจุด (ไม่ผ่านตัวแปร) — ด่าน `check:columns` มองไม่เห็น `.from(<ตัวแปร>)` */
export const SURVEY_REPORT_COLUMNS = 'id, "requestId", "baseNo", rev, "docNo", status, "supersededAt", "supersededReason", '
  + '"rendererVersion", "frozenAt", "customerPdfPath", "internalPdfPath", '
  + '"approvedById", "approvedByName", "approvedAt", "issuedById", "issuedByName", "issuedAt", "updatedAt", '
  + 'customerName:snapshot->customer->>name';

/* แถวของคำร้องหนึ่งใบที่อ่านต่อรอบ — หนึ่งแถวต่อฉบับ (R) ⇒ 50 = ดึงผลกลับ 50 รอบ ไม่มีใบไหนไปถึง
   ⚠️ ต้องมี `.limit()` เสมอ (ด่าน `check:rowcap`) — ตารางนี้โตตามจำนวนใบที่ส่งผล */
const REPORT_ROWS_LIMIT = 50;

/** ข้อความของทุกทางที่ "จะเขียนของถาวร" บนเครื่องที่ไม่ใช่ production (409 · §0) */
export const SURVEY_REPORT_NOT_PRODUCTION = 'เครื่องนี้ไม่ใช่ระบบจริง (production) — ออกหรือตรึงเอกสารจากเครื่องทดสอบไม่ได้';

/**
 * 🔴 **เขียนของถาวรได้ไหม** — production deployment เท่านั้น (ตัวแปรเดียวกับที่ `api/version` อ่าน)
 * คุม: RPC ออกเลข · อัป `img/` และ `pdf/` ทุกไฟล์ · การตรึง HTML · การเขียนที่อยู่ไฟล์
 * ที่อื่น (preview · เครื่อง dev): PDF/HTML ที่ตรึงแล้วเสิร์ฟได้แบบอ่านอย่างเดียว · ฉบับร่างดูได้ · อะไรที่จะเขียน = 409
 * ⚠️ อ่าน env ทุกครั้งที่ถูกเรียก ไม่จำค่าไว้ตอนโหลดโมดูล — เทสต์ของทุกชิ้นสลับค่าได้โดยไม่ต้องโหลดใหม่
 */
export function surveyReportStoreAllowed() {
  return process.env.VERCEL_ENV === 'production';
}

/**
 * ⭐ **ส่งผลแล้วออกเอกสารด้วยไหม** — ธง `SURVEY_REPORT_ISSUE_AT_SEND=on` **และ** ยามข้างบน (§0 "merges dark")
 * ปิด = เส้นส่งผลไม่ตรวจรูปล่วงหน้า ไม่ตรวจเนื้อเอกสาร ไม่ออกเลข ไม่อ่านแถวเอกสาร และไม่โหลด `sharp` เลย
 * ⚠️ ค่าอื่นทุกค่า (`1` · `true` · ว่าง) = ปิด — ธงเปิดได้ด้วยคำเดียว พิมพ์เพี้ยนต้องไม่กลายเป็นเปิด
 */
export function surveyReportIssueAtSend() {
  return String(process.env.SURVEY_REPORT_ISSUE_AT_SEND ?? '').trim().toLowerCase() === 'on'
    && surveyReportStoreAllowed();
}

const readFailure = (where, error) => {
  console.error(`[surveyReport] ${where}`, error?.message || error);
  return error || new Error(where);
};

/**
 * ทุกฉบับของคำร้องหนึ่งใบ ฉบับล่าสุดก่อน (`rev` มาก → น้อย) — **ไม่โยน**
 *
 * @returns `{ reports, error }` · `error` ไม่ว่าง = อ่านไม่สำเร็จ (`reports` เป็น `[]` ซึ่ง **ไม่ได้แปลว่าไม่มีเอกสาร**)
 *   ⇒ ผู้เรียกต้องดู `error` ก่อนเสมอ: ขั้นออกเลขตอบ `read_failed` · สรุปของจอตอบ `unknown: true`
 * ⚠️ ไม่มี FK ไปคำร้อง (0401 ①) — แถวของคำร้องที่ถูกลบยังอยู่ ผู้เรียกต้องอ่านคำร้องให้เจอก่อนเสิร์ฟอะไร
 */
export async function loadSurveyReports(supabase, requestId) {
  if (!requestId) return { reports: [], error: null };
  try {
    const { data, error } = await supabase
      .from('service_survey_reports').select(SURVEY_REPORT_COLUMNS)
      .eq('requestId', requestId)
      .order('rev', { ascending: false })
      .limit(REPORT_ROWS_LIMIT);
    if (error) return { reports: [], error: readFailure(`อ่านเอกสารประเมินของ ${requestId} ไม่สำเร็จ`, error) };
    return { reports: data || [], error: null };
  } catch (e) {
    return { reports: [], error: readFailure(`อ่านเอกสารประเมินของ ${requestId} ไม่สำเร็จ`, e) };
  }
}

/* จุดเวลาเดียวกันไหม — เทียบเป็นมิลลิวินาที ไม่เทียบสตริง: PostgREST คืน `+00:00` ส่วนค่าที่ route ถือมาจาก
   `toISOString()` ลงท้าย `Z` (กติกาเดียวกับสถานะ `stale` ใน surveyReportState) · แปลงไม่ได้ฝั่งไหน = ไม่เท่า */
function sameInstant(a, b) {
  const x = Date.parse(a);
  const y = Date.parse(b);
  return Number.isFinite(x) && x === y;
}

/**
 * ⭐ **เลขที่เอกสารที่เพิ่งถูกแทนที่** เพราะคำร้องถูกดึงผลกลับ / เปิดใบกลับ — เรียก **หลัง** update คำร้องสำเร็จ
 *
 * @param answeredAt  `answeredAt` ของคำร้องที่อ่านไว้ **ก่อน** update (ตอนนี้ถูกล้างไปแล้ว)
 * @returns `docNo` เมื่อฉบับล่าสุดเป็น `superseded` และ `approvedAt` ของมัน = `answeredAt` ที่ส่งมา · ไม่งั้น `null`
 *
 * 🔴 **ไม่อ่านก่อน update** — RPC ออกเลขถือล็อกแถวคำร้อง: การดึงกลับที่มาถึงกลาง RPC ต้องรอ แล้วทริกเกอร์ 0401 ⑤
 *    แทนที่แถวที่ RPC เพิ่งเขียน ซึ่งการอ่านล่วงหน้าไม่มีทางเห็น ⇒ บรรทัดในเธรดจะไม่เอ่ยเลขที่ฝ่ายขายถืออยู่
 * ⚠️ ฉบับล่าสุดที่ `approvedAt` ไม่ตรง = ของรอบส่งก่อนหน้า (รอบนี้ส่งผลโดยไม่มีเอกสาร) ⇒ `null`:
 *    เธรดต้องไม่อ้างว่าเอกสารเพิ่ง "ใช้ไม่ได้" ทั้งที่มันถูกแทนที่ไปตั้งแต่รอบก่อน
 * ⚠️ ฉบับล่าสุดยังเป็น `current` = ทริกเกอร์ไม่ยิง ⇒ ลง log แล้วตอบ `null` — ไม่อ้างสิ่งที่ฐานไม่ได้ทำ
 * ⚠️ ไม่โยน · อ่านไม่สำเร็จ = `null` (การดึงผลกลับสำเร็จไปแล้ว ต้องไม่ล้มเพราะประโยคเสริมในเธรด)
 */
export async function surveyReportVoided(supabase, { requestId, answeredAt } = {}) {
  if (!requestId || !answeredAt) return null;
  try {
    const { data, error } = await supabase
      .from('service_survey_reports').select(SURVEY_REPORT_COLUMNS)
      .eq('requestId', requestId)
      .order('rev', { ascending: false })
      .limit(1);
    if (error) {
      readFailure(`อ่านเอกสารที่ถูกแทนที่ของ ${requestId} ไม่สำเร็จ`, error);
      return null;
    }
    const latest = (data || [])[0];
    if (!latest) return null;
    if (latest.status !== 'superseded') {
      console.error(`[surveyReport] ${latest.docNo} ยังเป็นฉบับที่ใช้อยู่ทั้งที่คำตอบของ ${requestId} ถูกล้างแล้ว — ทริกเกอร์ 0401 ⑤ ไม่ยิง`);
      return null;
    }
    return sameInstant(latest.approvedAt, answeredAt) ? (latest.docNo || null) : null;
  } catch (e) {
    readFailure(`อ่านเอกสารที่ถูกแทนที่ของ ${requestId} ไม่สำเร็จ`, e);
    return null;
  }
}

// ── สรุปเอกสารของใบ สำหรับจอ (PR-3) — ป้อนทั้ง GET ใบประเมินและ GET คำร้อง (§10) ──────────────────────

const ACCESS_KEYS = ['customer', 'internal', 'issue', 'draft', 'history'];

const currentPart = (row, state) => {
  /* 🔴 `stale` = แถวค้างสถานะ (ทริกเกอร์ไม่ยิง) — ไม่มีอะไรถูกเสิร์ฟหรือใช้ซ้ำ ⇒ `ready` เป็น false ทั้งคู่
     ไม่งั้นจอที่อ่าน `ready` อย่างเดียวจะขึ้นปุ่มดาวน์โหลดที่กดแล้วได้ 409 */
  const served = state !== 'stale';
  return {
    docNo: row.docNo ?? null,
    rev: row.rev ?? null,
    issuedAt: row.issuedAt ?? null,
    issuedByName: row.issuedByName ?? null,
    approvedByName: row.approvedByName ?? null,
    approvedAt: row.approvedAt ?? null,
    frozenAt: row.frozenAt ?? null,
    ready: { customer: served && !!row.customerPdfPath, internal: served && !!row.internalPdfPath },
  };
};

const historyPart = (row) => ({
  docNo: row.docNo ?? null,
  rev: row.rev ?? null,
  issuedAt: row.issuedAt ?? null,
  supersededAt: row.supersededAt ?? null,
  supersededReason: row.supersededReason ?? null,
});

const byRevDesc = (a, b) => Number(b.rev) - Number(a.rev);
/* 🔴 **คำเตือนส่งต่อตามตัวอักษร ห้ามตัด/ขัดเกลา** — จอส่งรายการนี้กลับมาเป็น `seenWarnings` แล้วเส้นส่งผลเทียบกับผลของ
   ตัวตรวจตัวเดียวกันแบบตรงตัว (S5) ⇒ ต่างกันช่องว่างเดียว = 409 "ข้อความเปลี่ยนไป" ทุกครั้งที่กดส่ง · คัดแค่ว่าเป็นสตริง */
const strings = (list) => (Array.isArray(list) ? list : []).filter((t) => typeof t === 'string');

/* ผลตรวจที่ล้ม — `unknown: true` ไม่ใช่รายการว่างเฉย ๆ: "ตรวจไม่ได้" กับ "ไม่มีอะไรขวาง" ต้องหน้าตาไม่เหมือนกันบนจอ */
const checkUnknown = () => ({ blockers: [], warnings: [], unknown: true });

/**
 * ตรวจเนื้อเอกสารของใบ ณ ตอนนี้ — ตัวตรวจเดียวกับที่เส้นส่งผล (S5) และขั้นออกเลข (I2–I3) ใช้ ⇒ จอแค่พิมพ์ผล
 *
 * ⭐ **ทำไม server ต้องเป็นคนตรวจ** — GET ใบประเมินถือนัด "ที่ค้างหรือใบล่าสุด" · อ่านทะเบียนโซนแค่ `id, code` ·
 *    แถวดึงกลับแถวเดียว · ไม่มีข้อมูลบริษัท/แบบฟอร์ม ⇒ ด่านที่จอประกอบเองจากของพวกนี้จะเถียงกับ server
 * ⚠️ โมดูลของตัวตรวจและตัวอ่านประกอบ **โหลดในนี้** (`await import`) — ทางที่ไม่ตรวจไม่ต้องแบกมันเลย
 * ⚠️ ไม่มีวันทำให้ GET ล้ม — อ่านประกอบพลาด = `null` (ผู้เรียกตอบ `unknown: true` ล้วน) · ตัวตรวจล้ม = `unknown: true`
 *    คู่กับด่านที่คิดได้แล้ว
 *
 * @param given     แถวที่ผู้เรียกอ่านไว้แล้ว `{ zones, filesByZone, sizes, open }` — ช่องที่ไม่ส่ง (`undefined`) อ่านเอง
 *                  (`sizes: null` = อ่านทะเบียนไม่สำเร็จ · `open: null` = ไม่มีนัดค้าง ⇒ ทั้งคู่เป็นค่าที่ "ส่งมาแล้ว")
 * @param forIssue  `false` = ก่อนส่งผล: ต้องรู้นัดที่ค้าง (ตัวตรวจใส่นัดที่การส่งจะปิดลงเอกสาร) · ผลวัด/ไฟล์/ทะเบียนที่ไม่ได้
 *                  ส่งมา ตัวโหลดของตัวตรวจอ่านเองและตั้งชื่อชิ้นที่อ่านพลาดให้
 *                  `true`  = ใบตอบแล้วไม่มีเอกสาร: ตรวจแบบที่ปุ่ม "ออกเอกสาร" จะตรวจ — ไม่มีนัดให้ปิด (`open: null`) และ
 *                  **รวมด่านส่งผล** ที่ขั้นออกเลขวิ่งซ้ำหลังล็อก (I3 · ใบที่ตอบผ่านปุ่มทั่วไปก่อน 24/09 ไม่เคยผ่านมัน)
 *                  ⇒ ต้องมีผลวัด/ไฟล์/ทะเบียนในมือ จึงอ่านเองที่นี่แล้วส่งต่อให้ตัวตรวจ (ไม่อ่านซ้ำ)
 */
async function documentChecks(supabase, { request, user, now, given, precheck, forIssue }) {
  const failed = (e) => console.error(`[surveyReport] ตรวจเนื้อเอกสารของ ${request?.docNo || request?.id} ไม่สำเร็จ`, e?.message || e);
  try {
    const nowIso = new Date(now).toISOString();
    const today = businessDate(nowIso);
    let zones = Array.isArray(given.zones) ? given.zones : null;
    let filesByZone = given.filesByZone && typeof given.filesByZone === 'object' ? given.filesByZone : null;
    let { sizes } = given;
    let open = null;

    if (forIssue) {
      if (!zones) zones = await (await import('./surveyRepo')).loadSurveyZones(supabase, request.id);
      const rows = zones;
      [filesByZone, sizes] = await Promise.all([
        filesByZone || import('@/lib/master/attachments').then(async ({ listAttachments }) => {
          const files = await Promise.all(rows.map((z) => listAttachments('service_survey_zone', z.id, supabase)));
          return Object.fromEntries(rows.map((z, i) => [z.id, files[i] || []]));
        }),
        sizes !== undefined
          ? sizes
          : import('./packageSizesRepo').then(({ loadPackageSizesOrNull }) => loadPackageSizesOrNull(supabase)),
      ]);
    } else {
      open = given.open !== undefined
        ? given.open
        : await (await import('./surveyVisit')).findSurveyVisit(supabase, request.id, { openOnly: true });
    }

    /* ด่านส่งผล (เฉพาะใบที่ตอบแล้ว) — ลำดับเดียวกับเส้นส่งผล · `closesVisit: false`: ไม่มีนัดให้ปิดแทนช่างอีก
       ⚠️ ทะเบียนขนาดอ่านไม่สำเร็จ (`null`) = เรื่องของระบบ แก้ได้โดยไม่ต้องดึงผลกลับ ⇒ `system` ไม่ใช่ `content` */
    const blockers = [];
    if (forIssue) {
      const [{ surveySendError }, { surveyPackageSizeSendError }, { surveySpotSendError }] = await Promise.all([
        import('./survey'), import('./packageSizes'), import('./surveySpotPhotos'),
      ]);
      blockers.push(...[
        { kind: 'content', text: surveySendError(zones, filesByZone, { canSend: true }) },
        { kind: sizes == null ? 'system' : 'content', text: surveyPackageSizeSendError(zones, sizes) },
        { kind: 'content', text: surveySpotSendError(zones, filesByZone, { closesVisit: false }) },
      ].filter((gate) => gate.text));
    }

    /* ตัวตรวจล้ม (โยน · คืนของผิดรูป) ≠ ไม่มีอะไรขวาง — ด่านที่คิดได้แล้วข้างบนยังออก คู่กับ `unknown: true` */
    let result = null;
    try {
      const run = precheck || (await import('./surveyReportInputs')).surveyReportPrecheck;
      result = await run(supabase, { request, user, zones, filesByZone, sizes, open, today, nowIso });
    } catch (e) {
      failed(e);
    }
    const usable = !!result && typeof result === 'object';

    /* คัดเฉพาะ `kind` กับ `text` — ของอื่นที่ตัวตรวจอาจแนบมาในวันหน้าไม่ไหลออก payload เอง */
    if (usable) {
      blockers.push(...(Array.isArray(result.blockers) ? result.blockers : [])
        .map((b) => ({ kind: b?.kind === 'content' ? 'content' : 'system', text: String(b?.text ?? '') }))
        .filter((b) => b.text.trim()));
    }

    const seen = new Set();
    return {
      blockers: blockers.filter((b) => (seen.has(b.text) ? false : seen.add(b.text))),
      warnings: usable ? strings(result.warnings) : [],
      unknown: !usable || (Array.isArray(result.unknown) ? result.unknown.length > 0 : !!result.unknown),
    };
  } catch (e) {
    failed(e);
    return null;
  }
}

/**
 * 🔑 **สรุปเอกสารของใบ ตามสิทธิ์ของคนดู** — ป้อนคีย์ `document` ของ GET ใบประเมิน และ `surveyDocument` ของ GET คำร้อง
 *
 * ```
 * ไม่มีสิทธิ์:  { access: 'none' }                       ← ไม่อ่านแถวเอกสารเลย (ช่าง `ts` เปิด GET ใบประเมินทุกวัน)
 * มีสิทธิ์:    { access: { customer, internal, issue, draft, history },
 *               issueAtSend, storeAllowed,
 *               state,                                    สถานะ §1 (`surveyReportState`) · `null` เมื่ออ่านไม่สำเร็จ
 *               current: null | { docNo, rev, issuedAt, issuedByName, approvedByName, approvedAt, frozenAt,
 *                                 ready: { customer, internal } },
 *               history: [{ docNo, rev, issuedAt, supersededAt, supersededReason }],   ← คีย์มีเฉพาะ access.history
 *               nextDocNo,                                ← คีย์มีเฉพาะ access.issue · เลขฐานเดิม R ถัดไปเมื่อไม่มีฉบับที่ใช้อยู่
 *               send:  null | { blockers: string[], warnings: string[], unknown },     ← คีย์มีเฉพาะ access.issue
 *               issue: null | { blockers: [{ kind, text }], warnings: string[], unknown },
 *               unknown: true }                           ← เฉพาะเมื่ออ่านแถวเอกสารไม่สำเร็จ
 * ```
 *
 * ⭐ `send`  — ธงออกเอกสารตอนส่งผลเปิด + ใบยังไม่ตอบและไม่ถูกยกเลิก: สิ่งที่จะตีกลับการส่ง (เนื้อหา + หน้าล้น) และ
 *            คำเตือนที่จอต้องส่งกลับมาเป็น `seenWarnings` · ตัวตรวจเดียวกับ S5 ของเส้นส่งผล
 * ⭐ `issue` — สถานะ `missing` (ตอบแล้ว ไม่มีเอกสาร): ทุกเหตุที่ปุ่ม "ออกเอกสาร" จะตีกลับ + คำเตือนของกล่องยืนยัน
 *            `kind: 'content'` = ต้องดึงผลกลับมาแก้แล้วส่งใหม่ · `'system'` = แก้แล้วกดออกเอกสารซ้ำได้
 * ⚠️ ทั้งสองตัวคิดเฉพาะ `withChecks` (GET ใบประเมิน) และเฉพาะคนที่ออกเอกสารได้ — ราคาคือการอ่านขนานของตัวโหลดข้อมูลเอกสาร
 * ⚠️ ตรวจล้ม = `unknown: true` ในก้อนนั้น ไม่ใช่ GET ล้ม
 *
 * 🔴 **ผู้ขอ (ฝ่ายขาย) ไม่ได้คีย์ `history` · `nextDocNo` · `send` · `issue`** — ไม่ใช่ค่าว่าง แต่ไม่มีคีย์เลย
 * 🔴 ไม่มีคีย์ไหนพกภาพนิ่ง · HTML · id ของแถว · ที่อยู่ไฟล์ (เทสต์ไล่คีย์ทุกชั้นของ payload ทุกตำแหน่ง)
 *
 * @param opts.withChecks  คิด `send` / `issue` ด้วย (GET ใบประเมิน) — โหลดตัวตรวจด้วย `await import()` เฉพาะตอนนี้
 * @param opts.withVoids   เติม `voids: 'SU-…-n' | null` = ฉบับที่ใช้อยู่ซึ่ง "ยังไม่จบ"/ดึงผลกลับจะทำให้ใช้ไม่ได้ (GET คำร้อง)
 *                         ให้ทุกคนที่ตอบหรือจัดการใบนี้ได้ — Planner เปิดใบกลับได้โดยไม่มีสิทธิ์เอกสาร ⇒ เขาได้
 *                         `{ access: 'none', voids }` พอให้โมดัลบอกผลของการกด (กติกา #1223)
 * @param opts.now         นาฬิกาของสถานะ `issuing` และของตัวตรวจ (เทสต์ตรึงได้)
 * @param opts.zones · opts.filesByZone · opts.sizes · opts.open  แถวที่ route อ่านไว้แล้ว — ไม่ส่ง = อ่านเองตอนตรวจ
 * @param opts.precheck    ตัวตรวจแทน (เทสต์) — ไม่ส่ง = `surveyReportPrecheck` ของ `surveyReportInputs`
 */
export async function surveyDocumentSummary(supabase, request, user, {
  withChecks = false, withVoids = false, now = new Date(),
  zones, filesByZone, sizes, open, precheck = null,
} = {}) {
  if (!request?.id) return { access: 'none' };
  const granted = surveyDocAccess(user, request) || {};
  const access = Object.fromEntries(ACCESS_KEYS.map((key) => [key, granted[key] === true]));
  const hasAccess = ACCESS_KEYS.some((key) => access[key]);
  const mayVoid = withVoids && (canAnswerRequest(user, request) || canManageRequest(user, request));
  if (!hasAccess && !mayVoid) return { access: 'none' };

  const { reports: rows, error } = await loadSurveyReports(supabase, request.id);
  const reports = [...rows].sort(byRevDesc);
  const current = surveyReportCurrent(reports);
  /* ฉบับที่จะถูกแทนที่ — กติกาเดียวกับ `surveyReportVoided`: ฉบับที่ใช้อยู่ **ของคำตอบรอบนี้** เท่านั้น
     (แถวค้างสถานะ `stale` ไม่ถูกเอ่ย: บรรทัดในเธรดหลังกดก็จะไม่เอ่ยเช่นกัน — โมดัลกับเธรดต้องพูดตรงกัน)
     ⚠️ อ่านไม่สำเร็จ = ไม่รู้ ⇒ `voids: null` คู่กับ `unknown: true` ไม่ใช่ `null` เฉย ๆ */
  const tail = {
    ...(mayVoid ? { voids: current && !surveyReportIsStale(request, current) ? (current.docNo ?? null) : null } : {}),
    ...(error ? { unknown: true } : {}),
  };
  if (!hasAccess) return { access: 'none', ...tail };

  const issueAtSend = surveyReportIssueAtSend();
  const state = error ? null : surveyReportState(request, reports, { now, issueAtSend });
  const out = {
    access,
    issueAtSend,
    storeAllowed: surveyReportStoreAllowed(),
    state,
    current: current ? currentPart(current, state) : null,
  };

  if (access.history) out.history = reports.filter((row) => row.status === 'superseded').map(historyPart);

  if (access.issue) {
    /* เลขของฉบับถัดไป — รู้ได้เมื่อคำร้องเคยมีเอกสารและตอนนี้ไม่มีฉบับที่ใช้อยู่ (RPC ใช้เลขฐานเดิม R ถัดไป · 0401 ④)
       ⚠️ ฉบับแรกของคำร้อง = `null`: เลขรันออกใต้ล็อกที่ฐาน ห้ามเดาฝั่ง JS (`surveyReportNumber.js`) */
    const latest = reports[0];
    out.nextDocNo = !current && latest?.baseNo && Number.isInteger(Number(latest.rev))
      ? `${latest.baseNo}-${Number(latest.rev) + 1}`
      : null;
    out.send = null;
    out.issue = null;

    const wantSend = issueAtSend && !request.answeredAt && !request.cancelledAt;
    const wantIssue = state === 'missing';
    if (withChecks && (wantSend || wantIssue)) {
      const checks = await documentChecks(supabase, {
        request, user, now, precheck, forIssue: wantIssue,
        given: { zones, filesByZone, sizes, open },
      }) || checkUnknown();
      if (wantIssue) {
        out.issue = { blockers: checks.blockers, warnings: checks.warnings, unknown: checks.unknown };
      } else {
        /* เส้นส่งผลตีกลับเฉพาะเรื่องเนื้อหา (มติ 9) — เรื่องของระบบไม่เคยขวางผลไปถึงฝ่ายขาย จึงไม่ขึ้นเป็นเหตุขวาง */
        out.send = {
          blockers: checks.blockers.filter((b) => b.kind === 'content').map((b) => b.text),
          warnings: checks.warnings,
          unknown: checks.unknown,
        };
      }
    }
  }

  return { ...out, ...tail };
}
