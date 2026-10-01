// ── ภาพนิ่งของรายงานการประเมินพื้นที่ (snapshot v1 · mig 0401) — ตรรกะล้วน ──────────────────
//
// ⭐ **ภาพนิ่งชุดเดียว สองฉบับ** (มติเจ้าของข้อ 1) — ถ่าย ณ ตอน "ส่งผลให้ฝ่ายขาย" แล้วเก็บลง
//   `service_survey_reports.snapshot` · ฉบับลูกค้ากับฉบับภายในต่างกันที่ตัวกรอง (`surveyReportView`) ไม่ใช่ที่ข้อมูล
//   ⇒ สองฉบับพูดตัวเลขไม่ตรงกันไม่ได้ และตัวเลขทุกตัวมาจากตัวคิดตัวเดียวกับจอ (`surveyTotals` · `surveyZoneSize` ฯลฯ)
//
// 🔴 **ไม่อ่านนาฬิกา ไม่แตะฐาน ไม่แตะ Drive** — ผู้เรียก (PR-2 · `loadSurveyReportInputs`) อ่านทุกอย่างมาส่งให้
//   รวมถึง `takenAt` ⇒ เรียกซ้ำด้วยอินพุตเดิมได้ภาพนิ่งเดิมทุกไบต์ · เทสต์และ harness ใช้ไฟล์ fixture แทนฐานได้
//
// 🔴 **เลขที่เอกสารกับวันที่ออกไม่อยู่ในภาพนิ่ง** — เลข SU เกิดใน RPC หลังภาพนิ่งถูกสร้าง ⇒ สองค่านี้เป็นคอลัมน์
//   ของแถว (`docNo` · `issuedAt`) แล้วตัวเรนเดอร์รับแยก · ใส่เลขลงภาพนิ่งเอง = เลขที่ยังไม่ได้ออกจริง
//
// โหมด:
//   `freeze` (ค่าตั้งต้น) ของขาด = `{ errors }` ไม่มีภาพนิ่ง · ต้องมีรูปที่เตรียมแล้วครบ — กระดาษที่ตรึงแล้วแก้ไม่ได้
//             ช่องว่างบนกระดาษจึงซ่อมทีหลังไม่ได้ (แบบเดียวกับ `productSpecFreeze`)
//   `check`   เข้มเท่า `freeze` แต่ยังไม่ต้องมีรูป — รอบตรวจก่อนไปดึงรูปจาก Drive (นาทีที่แพงที่สุดของการส่งผล)
//   `draft`   ของขาดไม่ล้ม: ช่องนั้นเป็น `null` (ตัวเรนเดอร์พิมพ์ขีด) แล้วคืนเหตุทั้งหมดเป็น `warnings`
//
// คีย์ของภาพนิ่ง (v1 — เพิ่มคีย์ได้ · เปลี่ยนความหมาย/ลบคีย์ = ขึ้น v2 เพราะแถวเก่ายังต้องเรนเดอร์ออก):
//   v, takenAt
//   request { id, docNo, title, body, requestedById, requestedByName, team, submittedAt, assignedByName,
//             requestedDueDate/Time, committedDueDate/Time, requestedResultDate, committedResultDate,
//             answeredAt/ById/ByName, closedAt/ByName }
//   deal { code } · customer { id, arCode, name }
//   site { code, name, address, contactName, contactPhone, accessText, accessNote }
//   visit { code, statusLabel, scheduledDate, startTime, endTime, actualDate, actualStartTime, actualEndTime,
//           actualEndDate, closedBySend, timeCredible, assignee{id,name,roleLabel}, helpers[], priorUnable[{date,reason}] }
//   sizes[] { code, nameEn, maxCbm, autoSuggest }
//   zones[] { id, no, zoneCode, name, floor, building, status, cutReason, areaSqm, volumeCbm,
//             parts[{letter,label,widthM,lengthM,heightM,areaSqm,volumeCbm}], wide[img], plan[img ≤ 1],
//             spots[{id,no,label,note,selected,photos[img ≤ 1]}],          (เฉพาะรูปที่กระดาษพิมพ์ — ดู `zoneFiles`)
//             packageSize, packageSizeSuggested, packageSizeManual, packageQty, packageNote,
//             note, surveyedByName, surveyedAt }
//   totals { zones, cutZones, addedZones, areaSqm, volumeCbm, packageQty, packagesBySize, spotsSelected }
//   change { requested, cut, added, assessed }
//   history[] { at, kind, byName, reason, totals }
//   company { name, address, taxId, tel, line, website } · form { code, revision, effectiveDate }
//   img = { attId, sha, w, h }
import { isPreviewableImage } from '@/lib/master/attachmentTypes';
import { normalizeTime } from '@/lib/format';
import { sortPackageSizes } from './packageSizes';
import { accessWindowText } from './sites';
import {
  SEND_BACK_DONE_KIND, SEND_BACK_KIND, SURVEY_DOC_PLAN, SURVEY_DOC_SPOT, SURVEY_DOC_WIDE,
  surveyChangeCounts, surveyPartLetter, surveyRecallRecord, surveySendBackState, surveyTotals,
  surveyZoneName, surveyZoneSize,
} from './survey';
import { SPOT_TRAY_LABEL, spotPhotoGroups } from './surveySpotPhotos';
import { visitTimeCredible } from './surveyVisitTime';
import { VISIT_STATUS_LABELS } from './visitStatus';

export const SURVEY_REPORT_SNAPSHOT_VERSION = 1;

const RECALL_KIND = 'recall';

const list = (v) => (Array.isArray(v) ? v : []);
const text = (v) => {
  const s = String(v ?? '').trim();
  return s || null;
};
const isCut = (row) => (row?.status || 'ok') === 'cut';
const round2 = (n) => Math.round(Number(n) * 100) / 100;
const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/** วันล้วน `YYYY-MM-DD` จากคอลัมน์ date (ไม่ใช่จุดเวลา — ไม่มีโซนเวลาเกี่ยว) · อ่านไม่ออก = null */
const dayOnly = (value) => {
  const match = String(value ?? '').match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
};

/** `HH:MM` จากคอลัมน์ time (`HH:MM` หรือ `HH:MM:SS`) */
const hhmm = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  return normalizeTime(raw.split(':').slice(0, 2).join(':'));
};

const UNDECODABLE_MIME = ['image/heic', 'image/heif', 'image/bmp', 'image/x-ms-bmp'];
const UNDECODABLE_EXT = ['heic', 'heif', 'bmp'];

/** HEIC/HEIF/BMP — รับอัปได้ (iPhone ถ่ายเป็น HEIC ตามค่าตั้งต้น) แต่ตัวย่อรูปถอดรหัสไม่ได้ */
function isUndecodable(file) {
  const mime = String(file?.mimeType || '').toLowerCase();
  if (mime) return UNDECODABLE_MIME.includes(mime);
  const ext = String(file?.fileName || '').toLowerCase().split('.').pop();
  return UNDECODABLE_EXT.includes(ext);
}

const DOC_KIND = { [SURVEY_DOC_WIDE]: 'wide', [SURVEY_DOC_PLAN]: 'plan', [SURVEY_DOC_SPOT]: 'spot' };

/* เก่าก่อน — เทียบ `createdAt` เป็นสตริง (รูปเดียวกันทุกแถวจาก PostgREST) · เท่ากัน = เรียงตาม id ให้ผลนิ่ง
   (กติกาเดียวกับ `spotPhotoGroups`) */
const oldestFirst = (a, b) => {
  const x = String(a?.createdAt ?? '');
  const y = String(b?.createdAt ?? '');
  if (x !== y) return x < y ? -1 : 1;
  const i = String(a?.id ?? '');
  const j = String(b?.id ?? '');
  return i < j ? -1 : i > j ? 1 : 0;
};

/**
 * 🔑 **ชุดที่เอกสารพิมพ์ของพื้นที่หนึ่ง — ที่เดียวที่ตัดสินว่ารูปไหนลงกระดาษ** (ตัวดึงรูป · คอลัมน์ `images` · ด่านรูปยังไม่พร้อม ·
 *   ด่าน HEIC ใช้ชุดนี้ชุดเดียว ⇒ ไม่มีด่านไหนล้มเพราะรูปที่ไม่มีฉบับไหนพิมพ์)
 *     ภาพกว้าง  ทุกรูป (เก่าก่อน)
 *     ภาพผัง    **รูปล่าสุดรูปเดียว** — หัวหน้าอัปผังที่แก้แล้วทับโดยไม่ลบของเก่า
 *     รูปจุด    **รูปแรกที่พิมพ์ได้** ของจุดที่ **หัวหน้าเลือก** เท่านั้น
 * 🐞 เดิมด่าน "รูปยังเตรียมไม่เสร็จ" กับด่าน HEIC นับทุกไฟล์ของพื้นที่ ⇒ ผังรูปเก่าที่ยังไม่ได้เตรียม หรือ HEIC บนจุดที่ไม่เลือก
 *   ทำให้ออกเอกสารไม่ได้ทั้งที่กระดาษไม่พิมพ์มัน — และใบที่ส่งผลไปแล้วถูกล็อก หัวหน้าเปลี่ยนไฟล์ไม่ได้ถ้าไม่ดึงผลกลับ
 * @returns `{ wide, plan, planCount, spotRows:[{ spot, photo, photoCount }], unlinked, undecodable, notImages }`
 *   · `plan` = ไฟล์เดียวหรือ `null` · `planCount` / `photoCount` = จำนวนรูปที่พิมพ์ได้ทั้งหมด (ไว้เตือนว่าพิมพ์รูปเดียว)
 *   · `spotRows` ครบทุกจุดตามลำดับบนจอ — รูปผูกด้วย `metadata.spotId` เท่านั้น (ไม่เดาจากลำดับอัป) · จุดที่ไม่เลือก = `photo: null`
 *   · `unlinked` = รูปจุดที่ไม่ผูก หรือผูกกับจุดที่ถูกลบไปแล้ว
 *   · `undecodable` = HEIC/BMP **ที่ทำให้กระดาษขาดรูป**: ภาพกว้าง (พิมพ์ทุกรูป) · ผังรูปล่าสุด (ไม่ถอยไปพิมพ์ผังเก่าเงียบ ๆ —
 *     ผังที่หัวหน้าเพิ่งแก้คือรูปที่ต้องลง) · จุดที่เลือกซึ่งไม่มีรูปอื่นให้พิมพ์
 */
function zoneFiles(row, files) {
  const all = list(files);
  const printable = (f) => isPreviewableImage(f) && !isUndecodable(f);
  const images = (docType) => all.filter((f) => f?.docType === docType && isPreviewableImage(f)).sort(oldestFirst);
  const groups = spotPhotoGroups({ spots: list(row?.spots), files: all });

  const wide = images(SURVEY_DOC_WIDE);
  const plans = images(SURVEY_DOC_PLAN);
  const newestPlan = plans[plans.length - 1] || null;
  const undecodable = wide.filter(isUndecodable);
  if (newestPlan && isUndecodable(newestPlan)) undecodable.push(newestPlan);

  const spotRows = groups.rows.map((r) => {
    if (r.spot?.selected !== true) return { spot: r.spot, photo: null, photoCount: 0 };
    const usable = r.photos.filter(printable);
    if (!usable.length) undecodable.push(...r.photos.filter(isUndecodable));
    return { spot: r.spot, photo: usable[0] || null, photoCount: usable.length };
  });

  return {
    wide: wide.filter(printable),
    plan: newestPlan && printable(newestPlan) ? newestPlan : null,
    planCount: plans.filter(printable).length,
    spotRows,
    unlinked: groups.unlinked,
    undecodable,
    notImages: all.filter((f) => DOC_KIND[f?.docType] && !isPreviewableImage(f)),
  };
}

const filesOf = (inputs, row) => list(inputs?.filesByZone?.[row?.id]);
const activeZones = (inputs) => list(inputs?.zones).filter((z) => z && !isCut(z));

/**
 * 🔑 **ไฟล์ที่เอกสารพิมพ์** — ลิสต์เดียวที่ PR-2 ใช้ไปดึงรูปจาก Drive และที่ภาพนิ่งอ้าง (ลำดับเดียวกัน)
 * ชุดของ `zoneFiles`: รูปกว้างทุกรูป · ภาพผังรูปล่าสุด · รูปแรกของจุดที่ **หัวหน้าเลือก** — เฉพาะพื้นที่ที่ไม่ถูกตัด
 * (ผังรูปเก่า · รูปที่สองของจุด · รูปของจุดที่ไม่เลือก · รูปของพื้นที่ที่ตัด ไม่มีฉบับไหนพิมพ์ ⇒ ไม่ดึง ไม่เก็บ ไม่บล็อก)
 * @returns `[{ attId, kind: 'wide'|'plan'|'spot', zoneId, file }]`
 */
export function surveyReportImageFiles(inputs) {
  const out = [];
  for (const row of activeZones(inputs)) {
    const f = zoneFiles(row, filesOf(inputs, row));
    const push = (file, kind) => out.push({ attId: String(file.id), kind, zoneId: row.id, file });
    f.wide.forEach((file) => push(file, 'wide'));
    if (f.plan) push(f.plan, 'plan');
    f.spotRows.forEach((r) => { if (r.photo) push(r.photo, 'spot'); });
  }
  return out;
}

const preparedImage = (inputs, attId) => {
  const store = inputs?.imageByAttId;
  if (!store) return null;
  const hit = store instanceof Map ? store.get(attId) : store[attId];
  return hit && hit.sha ? hit : null;
};

/* ── เหตุที่ตรึงไม่ได้ ───────────────────────────────────────────────── */

/** ไม่มีนัดให้เอกสารรับรอง — ตัวตรวจก่อนส่งผล (`surveyReportPrecheck`) แทนข้อนี้ด้วยเหตุของนัดร่างเมื่อนัดที่ค้างยังเป็นร่าง */
export const SURVEY_REPORT_NO_VISIT = 'ไม่พบนัดประเมินพื้นที่ของใบนี้';

/**
 * ชื่อชิ้นที่ตัวโหลด (`loadSurveyReportInputs` · PR-2) อ่านไม่สำเร็จ → คำที่คนอ่านออก
 * ⚠️ ตัวโหลดใส่ได้เฉพาะชื่อในตารางนี้ (เทสต์ของตัวโหลดล็อก) — ชื่อที่ไม่มีป้ายจะพิมพ์ชื่อดิบขึ้นจอหัวหน้า
 */
export const SURVEY_REPORT_INPUT_LABELS = Object.freeze({
  zones: 'ผลวัดรายพื้นที่',
  files: 'รูปของพื้นที่',
  zoneRegistry: 'ทะเบียนพื้นที่',
  site: 'ข้อมูลสถานที่',
  customer: 'ข้อมูลลูกค้า',
  deal: 'เลขที่ดีล',
  visits: 'นัดประเมิน',
  visitThread: 'เธรดของนัดประเมิน',
  helpers: 'ชื่อผู้ช่วยบนนัด',
  assigneeRole: 'ตำแหน่งของผู้ประเมิน',
  history: 'ประวัติตีกลับและดึงกลับ',
  sizes: 'ทะเบียนขนาดแพ็คเกจ',
  company: 'ข้อมูลบริษัท',
  form: 'มาตรฐานเอกสาร',
});

const unreadText = (name) => `อ่าน${SURVEY_REPORT_INPUT_LABELS[name] || ` ${name} `}ไม่สำเร็จ`;

/**
 * 🔑 **เหตุที่ออกเอกสารไม่ได้ แยกชนิด** — `[{ kind: 'content' | 'system', text }]` (`[]` = ออกได้) · ตัวเดียวสำหรับสามผู้เรียก:
 * รอบตรวจก่อนส่งผล · ปุ่ม "ออกเอกสาร" ของใบที่ส่งไปแล้ว · แถวด่านบนการ์ดควบคุม (หัวหน้าเห็นเหตุก่อนกด ไม่ใช่กดแล้วค่อยรู้)
 *
 *   `content`  ของบนใบเอง — การส่งผลจะล็อกมันไว้ หรือแก้ได้ด้วยการส่งผลใหม่เท่านั้น: ไม่มีพื้นที่ · ขนาด · แพ็คเกจ · ผังที่พิมพ์ได้ ·
 *              HEIC/BMP · รูปจุดที่ยังไม่ผูก · นัด (ไม่มี · ไม่มีวัน · ไม่มีผู้ประเมิน) · ชื่อผู้ส่งผล
 *              ⇒ **ตีกลับการส่งผลก่อนเขียนอะไร** (มติเจ้าของข้อ 2 — แก้ตอนใบยังเปิดอยู่ ถูกกว่าดึงผลกลับ)
 *   `system`   ของนอกใบ — แก้ได้โดยไม่ต้องดึงผลกลับ: หัวข้อผิด · จุดเวลา · ลูกค้า/สถานที่ · รหัสพื้นที่ในทะเบียน · ประวัติ/ทะเบียนขนาด
 *              ที่อ่านไม่ได้ · บริษัท · มาตรฐานเอกสาร · ทุกชิ้นใน `inputs.unknown`
 *              ⇒ **ไม่ตีกลับการส่งผล** (ผลต้องถึงฝ่ายขาย) แต่ขั้นออกเลขไม่ออกจนกว่าจะหาย
 *
 * 🔴 **อ่านไม่สำเร็จ ≠ ไม่มี** (`inputs.unknown` · กติกา supabase-never-throws) — ชิ้นที่อ่านพลาดเป็น `null` เหมือนชิ้นที่ไม่มีเป๊ะ
 *   ⇒ ข้อ "ไม่มี/ไม่พบ" ของชิ้นนั้นถูกข้าม แล้วบอกว่า "อ่าน…ไม่สำเร็จ" (ชนิด `system`) แทน · ไม่งั้นฐานสะดุดครั้งเดียวตอนอ่านนัด
 *   จะกลายเป็น "ไม่พบนัดประเมิน" (ชนิด `content`) แล้วตีกลับการส่งผลทั้งที่ใบไม่มีอะไรผิด
 *
 * ⚠️ ไม่ถามเรื่อง "รูปเตรียมเสร็จหรือยัง" — ด่านนี้รันก่อนไปดึงรูป · ข้อนั้นอยู่ในโหมด `freeze` ของตัวสร้าง
 * ⚠️ พื้นที่ที่ถูกตัดไม่ต้องผ่านข้อไหนเลย (กติกาเดียวกับด่านหกข้อของ `survey.js`)
 * ⚠️ ด่านหกข้อ (`surveySendError`) ตรวจมาก่อนแล้วในเส้นส่งผล — ข้อที่ซ้ำกันที่นี่ (ขนาด · แพ็คเกจ) เป็นตาข่ายของ
 *   ใบที่ตอบไปก่อนมีด่านนั้น และกันตัวสร้างพิมพ์ช่องว่างลงกระดาษ
 * ⚠️ ลำดับของข้อคือลำดับที่ขึ้นจอ — เทสต์ PR-1 อ่านผ่าน `surveyReportFreezeBlockers` ห้ามสลับ
 */
export function surveyReportFreezeIssues(inputs = {}) {
  const out = [];
  const content = (line) => { out.push({ kind: 'content', text: line }); };
  const system = (line) => { out.push({ kind: 'system', text: line }); };
  const request = inputs?.request;
  if (!request?.id) return [{ kind: 'system', text: 'ไม่พบใบคำร้อง' }];

  const unknown = [...new Set(list(inputs.unknown).map((name) => String(name ?? '').trim()).filter(Boolean))];
  const told = new Set();
  /* ชิ้นนี้อ่านไม่สำเร็จไหม — ใช่ = บอกครั้งเดียว แล้วผู้เรียกข้ามข้อ "ไม่มี" ของชิ้นนั้น */
  const unread = (name) => {
    if (!unknown.includes(name)) return false;
    if (!told.has(name)) {
      told.add(name);
      system(unreadText(name));
    }
    return true;
  };

  if (request.kind && request.kind !== 'site_survey') system('ใบนี้ไม่ใช่คำร้องประเมินพื้นที่');
  if (!text(inputs.takenAt)) system('ไม่มีจุดเวลาของภาพนิ่ง');
  // ยังไม่ส่งผล: ไม่มีอะไรบนใบให้แก้ (รอบตรวจก่อนส่งใส่ผู้ส่งที่กำลังจะเขียนมาแล้ว — ข้อนี้ไม่ขึ้น)
  if (!request.answeredAt) system('ยังไม่ได้ส่งผลให้ฝ่ายขาย — ยังออกเอกสารไม่ได้');
  else if (!text(request.answeredByName)) content('ไม่มีชื่อผู้ตรวจสอบและอนุมัติ (ผู้ส่งผล)');
  if (!unread('customer') && !text(inputs.customer?.name)) system('ไม่พบข้อมูลลูกค้าของใบนี้');
  if (!unread('site') && !text(inputs.site?.name)) system('ไม่พบข้อมูลสถานที่ของใบนี้');

  const visit = inputs.visit;
  if (!visit) {
    if (!unread('visits')) content(SURVEY_REPORT_NO_VISIT);
  } else {
    if (!dayOnly(visit.actualDate) && !dayOnly(visit.scheduledDate)) content('นัดประเมินไม่มีวันที่ประเมิน');
    if (!text(visit.assigneeName)) content('นัดประเมินไม่มีชื่อผู้ประเมิน');
  }

  if (!unread('history') && !Array.isArray(inputs.history)) system(unreadText('history'));
  if (!unread('sizes') && !Array.isArray(inputs.sizes)) system(unreadText('sizes'));
  if (!unread('company') && !text(inputs.company?.name)) system('ไม่พบข้อมูลบริษัทสำหรับหัวเอกสาร');
  if (!unread('form') && !text(inputs.form?.code)) system('ไม่พบมาตรฐานเอกสารของรายงานการประเมินพื้นที่');

  const active = activeZones(inputs);
  if (!active.length && !unread('zones')) content('ไม่มีพื้นที่ที่ประเมิน');
  const registry = new Map(list(inputs.zoneRegistry).map((z) => [z?.id, z]));
  // อ่านทะเบียน/ไฟล์ไม่สำเร็จ = ตัดสินข้อที่ต้องใช้มันไม่ได้ (ไม่ใช่ "ไม่มีรหัส" · "ไม่มีผัง") — บรรทัด "อ่าน…ไม่สำเร็จ" ท้ายลิสต์พูดแทน
  const registryUnread = unknown.includes('zoneRegistry');
  const filesUnread = unknown.includes('files');
  let unlinked = 0;
  const undecodable = [];
  for (const row of active) {
    const name = surveyZoneName(row);
    if (!surveyZoneSize(row.parts).complete) content(`${name}: ยังไม่มีขนาด ก × ย × ส ครบทุกส่วน`);
    if (!(Number(row.packageQty) > 0) || !text(row.packageSize)) content(`${name}: ยังไม่ได้เคาะแพ็คเกจ (ขนาดและจำนวน)`);
    if (!registryUnread && !text(registry.get(row.zoneId)?.code) && !text(row.zoneCode)) system(`${name}: ไม่พบรหัสพื้นที่ในทะเบียน`);
    if (filesUnread) continue;
    const f = zoneFiles(row, filesOf(inputs, row));
    unlinked += f.unlinked.length;
    undecodable.push(...f.undecodable);
    /* ภาพผังเป็นด่านของการส่งผลอยู่แล้ว (`SURVEY_GATES.plan`) แต่ด่านนั้นนับไฟล์ตามหมวด ไม่ดูว่าพิมพ์ได้ไหม (PDF ก็ผ่าน)
       และใบที่ส่งไปก่อนมีด่านอาจไม่มีผังเลย ⇒ กระดาษจะได้กรอบผังว่าง ๆ ซึ่งฉบับลูกค้าอ่านเป็นหน้าพัง
       ผังรูปล่าสุดเป็น HEIC/BMP = ข้อความของด่าน HEIC พูดแทนแล้ว (ไม่ซ้ำสองบรรทัด) */
    if (!f.plan && !f.undecodable.some((file) => file?.docType === SURVEY_DOC_PLAN)) {
      content(`${name}: ยังไม่มีภาพผังที่ลงเอกสารได้ (ต้องเป็นรูป JPG/PNG)`);
    }
  }
  if (unlinked) content(`รูปจุดติดตั้ง ${unlinked} รูปยังไม่ได้ผูกจุด — ผูกในถาด "${SPOT_TRAY_LABEL}" ก่อน`);
  if (undecodable.length) {
    const names = undecodable.map((f) => f.fileName || f.id).join(' · ');
    content(`รูป ${undecodable.length} รูปเป็น HEIC/BMP — แปลงเป็น JPG แล้วอัปใหม่ (${names})`);
  }
  /* ชิ้นที่ไม่มีข้อ "ไม่มี" คู่กัน (ดีล · ผู้ช่วย · ตำแหน่งผู้ประเมิน · เธรดของนัด · ทะเบียนพื้นที่ · ไฟล์) และชิ้นที่ยังไม่ได้บอก
     🔴 ไม่มีบรรทัดนี้ = อ่านชื่อผู้ช่วยพลาดครั้งเดียว เอกสารถูกตรึงโดยไม่มีผู้ช่วยตลอดกาล และไม่มีด่านไหนทัก */
  unknown.forEach(unread);
  return out;
}

/** ข้อความไทยของ `surveyReportFreezeIssues` ทุกชนิด ตามลำดับเดิม (`[]` = ออกได้) — ตัวสร้างภาพนิ่งและผู้เรียกที่ไม่แยกชนิดใช้ตัวนี้ */
export function surveyReportFreezeBlockers(inputs = {}) {
  return surveyReportFreezeIssues(inputs).map((issue) => issue.text);
}

/* ── ชิ้นส่วนของภาพนิ่ง ──────────────────────────────────────────────── */

function requestPart(r = {}) {
  return {
    id: r.id ?? null, docNo: text(r.docNo), title: text(r.title), body: text(r.body),
    requestedById: r.requestedById != null ? String(r.requestedById) : null,
    requestedByName: text(r.requestedByName), team: text(r.team),
    submittedAt: r.submittedAt || null, assignedByName: text(r.assignedByName),
    requestedDueDate: dayOnly(r.requestedDueDate), requestedDueTime: hhmm(r.requestedDueTime),
    committedDueDate: dayOnly(r.committedDueDate), committedDueTime: hhmm(r.committedDueTime),
    requestedResultDate: dayOnly(r.requestedResultDate), committedResultDate: dayOnly(r.committedResultDate),
    answeredAt: r.answeredAt || null,
    answeredById: r.answeredById != null ? String(r.answeredById) : null,
    answeredByName: text(r.answeredByName),
    closedAt: r.closedAt || null, closedByName: text(r.closedByName),
  };
}

function sitePart(site) {
  return {
    code: text(site?.code), name: text(site?.name), address: text(site?.address),
    contactName: text(site?.contactName), contactPhone: text(site?.contactPhone),
    // ข้อความเดียวกับที่หน้าจัดคิว/จอหน้างานใช้ ("ศ. · 09:00–17:00") — โน้ตภายในของไซต์ (`site.note`) ไม่เข้าภาพนิ่ง
    accessText: text(accessWindowText(site)), accessNote: text(site?.accessNote),
  };
}

function visitPart(inputs) {
  const v = inputs.visit || {};
  const closedBySend = inputs.visitClosedBySend === true;
  const times = {
    scheduledDate: dayOnly(v.scheduledDate), startTime: hhmm(v.startTime), endTime: hhmm(v.endTime),
    actualDate: dayOnly(v.actualDate), actualStartTime: hhmm(v.actualStartTime),
    actualEndTime: hhmm(v.actualEndTime), actualEndDate: dayOnly(v.actualEndDate),
  };
  return {
    code: text(v.code), statusLabel: VISIT_STATUS_LABELS[v.status] || null,
    ...times,
    closedBySend,
    /* ตรึงคำตัดสินไว้ในภาพนิ่ง — กติกา "เวลาเชื่อได้ไหม" เปลี่ยนทีหลังแล้วกระดาษที่ออกไปต้องไม่เปลี่ยน */
    timeCredible: visitTimeCredible(times, { closedBySend }),
    assignee: {
      id: v.assigneeId != null ? String(v.assigneeId) : null,
      name: text(v.assigneeName),
      roleLabel: text(inputs.assigneeRoleLabel),
    },
    helpers: list(inputs.helpers).map((h) => text(typeof h === 'string' ? h : h?.name)).filter(Boolean),
    priorUnable: list(inputs.priorUnable)
      .map((p) => ({ date: dayOnly(p?.date), reason: text(p?.reason) }))
      .filter((p) => p.date || p.reason),
  };
}

const sizesPart = (sizes) => sortPackageSizes(list(sizes)).map((s) => ({
  code: String(s.code ?? '').trim().toUpperCase(), nameEn: text(s.nameEn), maxCbm: num(s.maxCbm),
  autoSuggest: s.autoSuggest !== false,
}));

/* ยอดที่ฝ่ายขายถือไปแล้วก่อนถูกดึงกลับ — เฉพาะเลขที่เอาไปตั้งราคา (กติกาเดียวกับ `surveyTotalsDiff`) */
function historyTotals(totals) {
  if (!totals || typeof totals !== 'object') return null;
  const by = totals.packagesBySize && typeof totals.packagesBySize === 'object' && Object.keys(totals.packagesBySize).length
    ? { ...totals.packagesBySize } : null;
  return {
    zones: Number(totals.zones) || 0, areaSqm: Number(totals.areaSqm) || 0,
    volumeCbm: Number(totals.volumeCbm) || 0, packageQty: Number(totals.packageQty) || 0,
    packagesBySize: by,
  };
}

/* ตีกลับ · แจ้งแก้แล้ว · ดึงกลับ — เรียงเก่าก่อน (แถวใหม่สุดเป็นแถวที่ล้นไปหน้าถัดไปของภาคผนวก)
   ⚠️ เหตุผลแกะด้วยตัวแกะเดียวกับที่จอใช้ (`surveyRecallRecord` · `surveySendBackState`) — แกะเองอีกชุด = เพี้ยนหากัน */
function historyPart(rows) {
  return list(rows)
    .filter((r) => r && [RECALL_KIND, SEND_BACK_KIND, SEND_BACK_DONE_KIND].includes(r.kind))
    .slice().sort(oldestFirst)
    .map((row) => {
      if (row.kind === RECALL_KIND) {
        const rec = surveyRecallRecord(row);
        return { at: rec.at, kind: RECALL_KIND, byName: text(rec.byName), reason: text(rec.reason), totals: historyTotals(rec.totals) };
      }
      const state = surveySendBackState([row]);
      const rec = row.kind === SEND_BACK_KIND ? state.sentBack : state.done;
      const reason = row.kind === SEND_BACK_KIND && list(rec?.items).length > 1 ? rec.items.join(' · ') : rec?.note;
      return { at: rec?.at || null, kind: row.kind, byName: text(rec?.byName), reason: text(reason), totals: null };
    });
}

function partsPart(parts) {
  return list(parts).map((p, index) => {
    const size = surveyZoneSize([p]);
    if (!size.complete) return null; // แถวว่าง/วัดไม่ครบ ไม่ลงกระดาษ — แต่ตัวอักษรยังนับตามตำแหน่งบนจอ
    return {
      letter: surveyPartLetter(index), label: text(p?.label),
      widthM: Number(p.widthM), lengthM: Number(p.lengthM), heightM: Number(p.heightM),
      areaSqm: size.areaSqm, volumeCbm: size.volumeCbm,
    };
  }).filter(Boolean);
}

/**
 * @param inputs {
 *   takenAt        จุดเวลาที่ถ่ายภาพนิ่ง (ISO) — ผู้เรียกอ่านนาฬิกาเอง
 *   request        แถว `dept_requests` (หลังเขียนคำตอบแล้ว · รอบตรวจก่อนส่งให้ใส่ answeredAt/ById/ByName ที่กำลังจะเขียน)
 *   deal           `{ code }` | null
 *   customer       `{ id, arCode, name }` (ชื่อผ่าน `customerNameIn` มาแล้ว)
 *   site           แถว `service_sites` (code · name · address · contact* · access*)
 *   visit          แถว `service_visits` ที่เอกสารรับรอง (นัดที่การส่งผลนี้ปิด ไม่งั้นนัด `done` ล่าสุด)
 *   visitClosedBySend  นัดถูกปิดพร้อมการส่งผล
 *   assigneeRoleLabel  ตำแหน่งของผู้ประเมิน (`ROLE_LABELS[role]`)
 *   helpers        `[{ id, name }]` ผู้ช่วยบนนัด (ไม่รวมคนไป)
 *   priorUnable    `[{ date, reason }]` นัดก่อนหน้าที่ทำไม่ได้
 *   zones          แถว `service_survey_zones` **ตามลำดับบนจอ** (`sortOrder`, `id`) — ทุกแถวรวมที่ถูกตัด
 *   zoneRegistry   `[{ id, code, floor, building }]` จาก `service_zones`
 *   filesByZone    `{ [zones[].id]: attachments[] }`
 *   imageByAttId   `{ [attachmentId]: { sha, w, h, bytes } }` (หรือ Map) รูปที่ย่อและเก็บแล้ว — โหมด `freeze` บังคับ
 *   sizes          แถว `service_package_sizes`
 *   history        แถว `entity_updates` ของใบ ชนิด recall / send_back / send_back_done (ทุกรอบ)
 *   company        `{ name, address, taxId, tel, line, website }`
 *   form           `{ code, revision, effectiveDate }` (เช่น FM-TS-01 · 00 · 29/09/2569)
 *   unknown        `string[]` ชื่อชิ้นที่ตัวโหลดอ่านไม่สำเร็จ (`SURVEY_REPORT_INPUT_LABELS`) — มี = โหมด freeze/check ไม่ออกภาพนิ่ง
 * }
 * @param opts.mode `'freeze'` (ค่าตั้งต้น) | `'check'` | `'draft'` — ดูหัวไฟล์
 * @returns `{ snapshot, images, warnings }` หรือ `{ errors }` (โหมด freeze/check เมื่อมีเหตุขัดข้อง)
 *   · `images` = `[{ sha, attId, kind, w, h, bytes }]` ไม่ซ้ำ sha — ลงคอลัมน์ `images` ของแถว
 */
export function buildSurveyReportSnapshot(inputs = {}, { mode = 'freeze' } = {}) {
  const blockers = surveyReportFreezeBlockers(inputs);
  const strict = mode !== 'draft';
  if (strict && blockers.length) return { errors: blockers };

  const warnings = strict ? [] : [...blockers];
  const needImages = mode === 'freeze';
  const rows = list(inputs.zones).filter(Boolean);
  const registry = new Map(list(inputs.zoneRegistry).map((z) => [z?.id, z]));
  const images = [];
  const seenSha = new Set();
  let missingImages = 0;

  const imgOf = (file, kind) => {
    const attId = String(file.id);
    const hit = preparedImage(inputs, attId);
    if (!hit) {
      missingImages += 1;
      return { attId, sha: null, w: null, h: null };
    }
    if (!seenSha.has(hit.sha)) {
      seenSha.add(hit.sha);
      images.push({ sha: hit.sha, attId, kind, w: num(hit.w), h: num(hit.h), bytes: num(hit.bytes) });
    }
    return { attId, sha: hit.sha, w: num(hit.w), h: num(hit.h) };
  };

  let zoneNo = 0;
  const zones = rows.map((row) => {
    const cut = isCut(row);
    const no = cut ? null : (zoneNo += 1);
    const reg = registry.get(row.zoneId) || null;
    const size = surveyZoneSize(row.parts);
    const name = surveyZoneName(row);
    // พื้นที่ที่ตัด: ไม่มีฉบับไหนพิมพ์รูป/จุดของมัน — เก็บแค่ตัวตนกับเหตุผล (ภาคผนวก ข)
    const f = cut
      ? { wide: [], plan: null, planCount: 0, spotRows: [], notImages: [] }
      : zoneFiles(row, filesOf(inputs, row));

    /* 🔑 ภาพนิ่งพกเฉพาะรูปที่กระดาษพิมพ์ (ชุดของ `zoneFiles`) — `plan` กับ `spots[].photos` ยังเป็นลิสต์ (รูปร่าง v1)
       แต่มีได้อย่างมากหนึ่งรูป · รูปที่ไม่พิมพ์เหลือเป็นคำเตือนให้หัวหน้ารู้ว่ากระดาษเลือกรูปไหน
       คำเตือนเดินตามลำดับบนกระดาษ: ผัง → จุด → ไฟล์ที่ไม่ลงเอกสาร */
    const wide = f.wide.map((file) => imgOf(file, 'wide'));
    const plan = f.plan ? [imgOf(f.plan, 'plan')] : [];
    if (f.planCount > 1) warnings.push(`${name}: มีภาพผัง ${f.planCount} รูป — เอกสารพิมพ์รูปล่าสุดรูปเดียว`);
    /* ⭐ เลขจุด `k.n` นับจาก **ทุกจุด** ของพื้นที่ (เลือกหรือไม่เลือก) — ตรงกับเลขที่หัวหน้ามาร์กบนภาพผัง
       ⇒ ฉบับภายในที่พิมพ์เฉพาะจุดที่เลือกจะเห็นเลขข้ามได้ (1.1, 1.3) ซึ่งถูกต้อง
       ⚠️ จุดที่ไม่เลือกไม่พกรูป — ไม่มีฉบับไหนพิมพ์ */
    const spots = f.spotRows.map((r, i) => {
      const selected = r.spot?.selected === true;
      const spotNo = `${no}.${i + 1}`;
      const photos = r.photo ? [imgOf(r.photo, 'spot')] : [];
      if (r.photoCount > 1) warnings.push(`${name}: จุด ${spotNo} มีรูป ${r.photoCount} รูป — เอกสารพิมพ์รูปแรกรูปเดียว`);
      return {
        id: r.spot?.id != null ? String(r.spot.id) : null, no: spotNo,
        label: text(r.spot?.label), note: text(r.spot?.note), selected, photos,
      };
    });
    for (const file of f.notImages) warnings.push(`${name}: ไฟล์ ${file.fileName || file.id} ไม่ใช่รูป — ไม่ลงเอกสาร`);

    return {
      id: row.id ?? null, no,
      zoneCode: text(reg?.code) || text(row.zoneCode),
      name,
      floor: text(reg?.floor) || text(row.floor),
      building: text(reg?.building),
      status: row.status || 'ok', cutReason: text(row.cutReason),
      areaSqm: size.areaSqm, volumeCbm: size.volumeCbm,
      parts: partsPart(row.parts),
      wide, plan, spots,
      packageSize: text(row.packageSize)?.toUpperCase() || null,
      packageSizeSuggested: text(row.packageSizeSuggested)?.toUpperCase() || null,
      packageSizeManual: row.packageSizeManual === true,
      packageQty: Number(row.packageQty) > 0 ? Number(row.packageQty) : null,
      packageNote: text(row.packageNote),
      note: text(row.note), surveyedByName: text(row.surveyedByName), surveyedAt: row.surveyedAt || null,
    };
  });

  if (needImages && missingImages) return { errors: [`รูป ${missingImages} รูปยังเตรียมไม่เสร็จ — ยังไม่ได้ออกเอกสาร`] };

  const t = surveyTotals(rows);
  const c = surveyChangeCounts(rows);
  const company = inputs.company || {};
  const form = inputs.form || {};

  const snapshot = {
    v: SURVEY_REPORT_SNAPSHOT_VERSION,
    takenAt: text(inputs.takenAt),
    request: requestPart(inputs.request || {}),
    deal: { code: text(inputs.deal?.code) },
    customer: {
      id: inputs.customer?.id != null ? String(inputs.customer.id) : null,
      arCode: text(inputs.customer?.arCode), name: text(inputs.customer?.name),
    },
    site: sitePart(inputs.site),
    visit: visitPart(inputs),
    sizes: sizesPart(inputs.sizes),
    zones,
    totals: {
      zones: t.zones, cutZones: t.cutZones, addedZones: t.addedZones,
      areaSqm: round2(t.areaSqm), volumeCbm: round2(t.volumeCbm),
      packageQty: t.packageQty, packagesBySize: { ...t.packagesBySize }, spotsSelected: t.spotsSelected,
    },
    change: { requested: c.requested, cut: c.cut, added: c.added, assessed: c.assessed },
    history: historyPart(inputs.history),
    company: {
      name: text(company.name), address: text(company.address), taxId: text(company.taxId),
      tel: text(company.tel), line: text(company.line), website: text(company.website),
    },
    form: { code: text(form.code), revision: text(form.revision), effectiveDate: text(form.effectiveDate) },
  };

  return { snapshot, images, warnings };
}
