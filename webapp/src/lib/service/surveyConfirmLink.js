// ── ใบยืนยันหน้างาน (ประเมินจากแบบ งวด S5 §2.1) — ตรรกะล้วน ไม่แตะ DB/HTTP ───────────────────────────────
//
// ⭐ **ตัวจัดสภาพตัวเดียวของงวด** — ปุ่ม `ขอยืนยันหน้างาน` · GET เติมฟอร์ม · POST สร้างร่าง · ด่านตอนยื่น · แบนเนอร์ของใบต้นทาง
//   ถามที่นี่ที่เดียว (`surveyConfirmZoneStates` → `surveyConfirmPlan`) ⇒ สี่จุดตอบคำเดียวกันก่อนใครพิมพ์อะไร
// ⭐ **ทุกประโยคไทยของงวดนี้อยู่ไฟล์นี้** (F1) — จอ/route ห้ามพิมพ์ลิเทอรัลเอง · ต้องการประโยคใหม่ = มาเติมที่นี่
//   (ข้อยกเว้นสองตัว: ป้าย `SURVEY_ZONE_TAG.confirming` ใน surveyMethodSwitch.js · ป้ายชนิดเธรดใน updateTypes.js)
//
// 🔴 **ไฟล์นี้ไปถึงเบราว์เซอร์** — `surveyJob.js` ดึงไฟล์นี้ และจอ 'use client' ดึง `surveyJob.js` ⇒ ห้ามดึงโมดูลฝั่ง server
//   ลิสต์ที่ดึงได้ (§2.1): surveyMethod · zoneRegistry (`latestSurveyRow`) · survey · zonePickState (`busySurveyRequests`) ·
//   requests/statuses · format
// 🔴 **"ผูกแล้ว" ตัดสินจาก id ของ `children` เท่านั้น** (F7) — ตัวอ่าน (`surveyConfirmRepo.js`) คัดลูกมาด้วยคอลัมน์ลิงก์แล้ว
//   ไฟล์นี้ไม่เอ่ยชื่อคอลัมน์นั้นเลย (ยามลิสต์ปิดใน surveyMethodGuards.test.mjs)
//
// ชื่อที่หน้าตาคล้ายกัน — อย่าสับ: คีย์ payload `confirmOf` (ลิงก์ไปใบต้นทาง) ≠ ตัวช่วย `confirmOf(zone)` ใน zonePickState.js
//   (สภาพยืนยันของพื้นที่) · โมดูลนี้ ≠ คีย์ payload `surveyConfirmLink` · `SURVEY_CONFIRM_LABEL` (สองทางเลือกของหัวหน้า)
//   ≠ ค่าคงที่ `SURVEY_CONFIRM_*_LABEL` ข้างล่าง
import { isDrawingZone } from '@/lib/service/surveyMethod';
import { latestSurveyRow } from '@/lib/service/zoneRegistry';
import { surveyZonePackageText, surveyZoneSize } from '@/lib/service/survey';
import { busySurveyRequests } from '@/lib/service/zonePickState';
import { requestStatusView } from '@/lib/requests/statuses';
import { fmtNumber } from '@/lib/format';

/* ── ค่าคงที่ + ประโยคที่กลุ่มอื่นพิมพ์ (F1) ───────────────────────────────────────────────────── */

/* ใบยืนยันที่ "ยังเปิด" สำหรับด่านแถว 4 — **รวมร่าง** (ร่างของอีกคนถือพื้นที่ชุดเดียวกันอยู่) ต่างจาก REQUEST_OPEN_STATUSES */
export const SURVEY_CONFIRM_OPEN_STATUSES = ['draft', 'pending', 'acknowledged'];
/* ชื่อปุ่ม — `surveyJob.js` เคยถือสำเนาของตัวเอง (CONFIRM_ACTION_LABEL) กลุ่ม D เปลี่ยนมาดึงตัวนี้
   สำเนาที่ปล่อยไว้ตามเดิม (คำของโมดัลส่งผลของหัวหน้า ไม่เปลี่ยนในงวดนี้): SEND_TILE_UNITS ของหน้าใบประเมิน ·
   คำใบ้ไทล์ not_needed ใน surveySendClose.js */
export const SURVEY_CONFIRM_ACTION_LABEL = 'ขอยืนยันหน้างาน';
export const SURVEY_CONFIRM_FORM_HINT = 'ใบยืนยันหน้างาน — ลงหน้างานเท่านั้น';
export const SURVEY_CONFIRM_OF_LABEL = 'ยืนยันผลจากแบบของ';
export const SURVEY_CONFIRM_CHILD_LABEL = 'ใบยืนยันหน้างาน';
export const surveyConfirmHref = (originalId) => `/requests/new?confirms=${encodeURIComponent(originalId)}`;
/** รูปเดียวที่ `?confirms=` เป็นได้ก่อนจอเอาไปต่อเป็น path ของ API (D-4 · F14) — id คำร้องคือ `DR-${randomUUID()}`
 *  (จุด insert เดียวของ dept_requests) · คลาสกว้างกว่านิดโดยตั้งใจ แต่กัน `/` `.` `%` `?` `#` ทุกตัว */
export const SURVEY_CONFIRM_ID_PATTERN = /^DR-[0-9A-Za-z-]{1,100}$/;
export const surveyConfirmTitle = (original) => `ยืนยันหน้างาน — ${original?.title || original?.docNo || ''}`.trim().slice(0, 200);

/* {RQ} = เลขที่ของใบ หรือ id เมื่อยังไม่มีเลข — กติกาเดียวทั้งไฟล์ */
const rqOf = (doc) => doc?.docNo || doc?.id || '';
const deptOf = (doc) => doc?.dept || 'TS';

export const SURVEY_CONFIRM_FROM_ORIGINAL = 'จากใบต้นทาง';
export const SURVEY_CONFIRM_ORIGINAL_MISSING = 'ใบต้นทางถูกลบไปแล้ว';
export const SURVEY_CONFIRM_NO_ORIGINAL = 'ไม่พบใบต้นทางของใบยืนยันหน้างาน — อาจถูกลบไปแล้ว';
export const SURVEY_CONFIRM_KIND_ERROR = 'ใบยืนยันหน้างานเปิดได้เฉพาะหัวข้อประเมินพื้นที่';
/* N25 — PATCH update (B-6) ตอบตัวนี้ และ `surveyConfirmSubmitMismatch` คืน **ตัวเดียวกัน** (เทียบด้วย ===) */
export const SURVEY_CONFIRM_VARIANT_ERROR = 'ใบยืนยันหน้างานเปลี่ยนวิธีประเมินไม่ได้ — ลงหน้างานเท่านั้น';
export const surveyConfirmForbiddenText = (original) => `ขอยืนยันหน้างานได้เฉพาะฝ่ายผู้ขอของใบ ${rqOf(original)}`;
export const surveyConfirmAuditSuffix = (original) => ` · ใบยืนยันหน้างานของ ${rqOf(original)}`;
export const surveyConfirmSubtitle = (original) => `ใบยืนยันหน้างานของ ${rqOf(original)} — บันทึกเป็นร่างก่อน เลขที่ออกตอนกดส่ง`;
export const surveyConfirmDealHint = (original) => `ดีล ลูกค้า และสถานที่ยกมาจากใบ ${rqOf(original)} — เปลี่ยนที่นี่ไม่ได้`;
/* วลีที่จอห้ามตัดกลาง (`keepPhrases`) — UAT S5 sales รอบ 1 (27/10): 375 ขึ้น "…ยืนยันหน้า" / "งาน…" ในประโยคปฏิเสธ N2/N3
   (ICU ตัด หน้า|งาน เป็นสองคำ) และ N18 ทิ้ง "ได้" ไว้บรรทัดเดียว — ตัวคำไม่ถูกแตะ */
/* รอบ 2 (27/10): N19 ทิ้ง "ไม่ได้" ขึ้นต้นบรรทัด + ตัด "ประเมิน|จากแบบ" / "ใบ|ยืนยันหน้างาน" · N17 "ก่อน" หลุดวรรค · N4 "แล้ว" ·
   R13 "ราย|อื่น" · N15 "โหลดหน้า|ใหม่" · N11 (toast ตอนบันทึก) "รอใบ|นั้น" — วลีที่ยาวกว่ามาก่อนเสมอ (`phraseRuns`) */
export const SURVEY_CONFIRM_WRAP_KEEP = [
  'เปลี่ยนที่นี่ไม่ได้', 'เพิ่มที่นี่ไม่ได้', 'ประเมินจากแบบ', 'ใบยืนยันหน้างาน', 'หน้างาน', 'บันทึกเป็นร่างก่อน',
  'ถูกลบไปแล้ว', 'รายอื่น', 'โหลดหน้าใหม่', 'ใบนั้น',
];
export const surveyConfirmZonesLockText = (original) => `พื้นที่ชุดนี้ยกมาจากใบ ${rqOf(original)} ทั้งหมด`
  + ' เอาออกหรือเพิ่มที่นี่ไม่ได้ — พื้นที่ที่ยังไม่พร้อม หัวหน้า TS ตัดออกหรือเปลี่ยนเป็นประเมินจากแบบในใบยืนยันหน้างานได้';
export const surveyConfirmOpenLinkText = (open) => `เปิดใบ ${open?.docNo || 'ร่าง'}`;
export const surveyConfirmBackLinkText = (original) => `กลับไปที่ใบ ${rqOf(original)}`;
/* ร่างที่ยังไม่มีเลข = "ร่าง" คำเดียว — ป้ายสถานะของร่างก็คือ "ร่าง" (`REQUEST_STATUS_LABELS.draft`) ⇒ ไม่พิมพ์ "ร่าง · ร่าง" ซ้ำ */
export const surveyConfirmChildLine = (child) => (child?.docNo
  ? `${SURVEY_CONFIRM_CHILD_LABEL}: ${child.docNo} · ${child?.statusLabel || ''}`
  : `${SURVEY_CONFIRM_CHILD_LABEL}: ร่าง`);
/* ใบยืนยันที่ TS ปิดโดยไม่ได้ส่งผล — คำเดียวกับขั้นของหน้าใบนั้น (`surveyJob.js` 'closed-unassessed') · ไฟล์นี้ดึง surveyJob.js ไม่ได้ (F1)
   `requestStatusView` เรียกสถานะ closed ว่า "ปิดเรื่อง" ทุกกรณี ⇒ บรรทัดลิงก์บนใบต้นทางเคยพูดว่าใบยืนยันจบแล้วมีผล */
export const SURVEY_CONFIRM_CLOSED_UNASSESSED = 'ปิดโดยไม่ได้ประเมิน';
const childStatusLabel = (c) => (c?.status === 'closed' && !c.answeredAt && !c.cancelledAt
  ? SURVEY_CONFIRM_CLOSED_UNASSESSED
  : requestStatusView(c).label);
export const surveyConfirmOfLine = (confirmOf) => `${SURVEY_CONFIRM_OF_LABEL}: ${confirmOf?.missing ? SURVEY_CONFIRM_ORIGINAL_MISSING : rqOf(confirmOf)}`;

/* ── ตัวช่วยภายใน ─────────────────────────────────────────────────────────────────────────── */

const list = (v) => (Array.isArray(v) ? v : []);
const getOf = (byId) => (id) => (byId instanceof Map ? byId.get(id) : byId?.[id]);
const byOrder = (a, b) => (Number(a?.sortOrder) || 0) - (Number(b?.sortOrder) || 0)
  || String(a?.id ?? '').localeCompare(String(b?.id ?? ''));
/* ใหม่ก่อน — เวลาเปิดใบเทียบเป็นสตริง ISO (รูปเดียวกันทั้งตาราง) · เท่ากันเรียงด้วย id ให้ผลนิ่ง */
const newestFirst = (a, b) => (String(b?.createdAt ?? '') > String(a?.createdAt ?? '') ? 1
  : String(b?.createdAt ?? '') < String(a?.createdAt ?? '') ? -1 : String(a?.id ?? '').localeCompare(String(b?.id ?? '')));
const requestHref = (id) => `/requests/${encodeURIComponent(id)}`;
const openRef = (req) => (req ? { id: req.id, docNo: req.docNo || null, status: req.status || null } : null);
const refuse = (status, code, error, open = null) => ({ ok: false, status, code, error, open });

/* ตัวเลขของแถวหนึ่ง — ใช้ทั้งเทียบ "ตรง/เปลี่ยน" และพิมพ์ (O4: พื้นที่ · ขนาดแพ็คเกจ · จำนวนแพ็คเกจ)
   รับได้สองรูป: แถว `service_survey_zones` (มี `parts`) หรือก้อน `previous` ของ carry (`areaSqm` ตรง ๆ) */
function areaOf(row) {
  if (!row) return null;
  if (Array.isArray(row.parts)) {
    const size = surveyZoneSize(row.parts);
    return size.measuredParts > 0 ? size.areaSqm : null;
  }
  const n = Number(row.areaSqm);
  return row.areaSqm != null && Number.isFinite(n) && n > 0 ? n : null;
}
const sizeOf = (row) => String(row?.packageSize ?? '').trim().toUpperCase() || null;
function qtyOf(row) {
  const v = row?.packageQty;
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
const sameNumbers = (a, b) => areaOf(a) === areaOf(b) && sizeOf(a) === sizeOf(b) && qtyOf(a) === qtyOf(b);
/* "48 ตร.ม. · SM 1" — ส่วนที่ขาดพิมพ์ขีดแทนทั้งส่วน · แพ็คเกจใช้ตัวพิมพ์กลาง (ไม่ต่อหน่วย) แล้วยุบ " · " เป็นช่องว่าง */
function numbersText(row) {
  const area = areaOf(row);
  const pkg = surveyZonePackageText({ packageSize: sizeOf(row), packageQty: qtyOf(row) }, { unit: false });
  return `${area === null ? '—' : `${fmtNumber(area)} ตร.ม.`} · ${pkg ? pkg.replace(' · ', ' ') : '—'}`;
}

/* ── ตัวจัดสภาพ ─────────────────────────────────────────────────────────────────────────────── */

/**
 * พื้นที่จากแบบที่ยังใช้อยู่ของใบนี้ อยู่ตรงไหนแล้ว — ผ่านเดียว ตัวจัดสภาพตัวเดียวของงวด
 * @param request      ใบต้นทาง
 * @param rows         แถว `service_survey_zones` ของใบนั้น
 * @param rowsByZone   Map(zoneId → ทุกแถวผลวัดของพื้นที่นั้น ทุกใบ)
 * @param requestsById Map(id → { id, docNo, status, answeredAt, createdAt, committedDueDate, closedAt, surveyConfirm })
 * ดูเฉพาะแถวที่ ไม่ถูกตัด · จากแบบ · มี zoneId — และทั้งสามลิสต์ว่างเว้นแต่ใบส่งผลแล้วและตอบว่า `'needed'` (เทียบตรงตัว)
 *   L = latestSurveyRow(แถวของพื้นที่, { isSent, createdAtOf }) — สองตัวเรียกกลับชุดเดียวกับ zoneRegistryRow
 *     L คือแถวนี้เอง                   → awaiting  (ตัวเลขจากแบบยังเป็นตัวที่ใช้)
 *     L เป็นแถวลงหน้างานของใบอื่น      → confirmed { row, by } (ผูกหรือไม่ผูกก็ตาม — แผน §2 แถว 33)
 *     L เป็นแถวจากแบบของใบอื่น          → moved     { row, to } (ถูกประเมินจากแบบอีกครั้งที่ใบอื่น)
 *   ไม่เข้าทางไหน (อ่านลำดับไม่ได้ · แถวอื่นของใบเดียวกัน) = ไม่ถูกนับ — แบนเนอร์แถว 7 รับกรณีนี้
 * ลำดับในแต่ละลิสต์: sortOrder แล้ว id
 */
export function surveyConfirmZoneStates({ request, rows, rowsByZone, requestsById } = {}) {
  const out = { awaiting: [], confirmed: [], moved: [] };
  if (!request?.answeredAt || request.surveyConfirm !== 'needed') return out;
  const get = getOf(requestsById);
  const reqOf = (id) => get(id) || (id === request.id ? request : undefined);
  const callbacks = {
    isSent: (r) => !!reqOf(r.requestId)?.answeredAt,
    createdAtOf: (r) => reqOf(r.requestId)?.createdAt,
  };
  const active = list(rows).filter((r) => r && r.status !== 'cut' && isDrawingZone(r) && r.zoneId).sort(byOrder);
  for (const row of active) {
    const pool = rowsByZone instanceof Map ? list(rowsByZone.get(row.zoneId)) : [];
    const candidates = pool.some((r) => r?.id === row.id) ? pool : [...pool, row];
    const latest = latestSurveyRow(candidates, callbacks);
    if (!latest) continue;
    if (latest.id === row.id) out.awaiting.push(row);
    else if (latest.requestId === request.id) continue;
    else if (isDrawingZone(latest)) out.moved.push({ row, to: get(latest.requestId) || { id: latest.requestId } });
    else out.confirmed.push({ row, by: get(latest.requestId) || { id: latest.requestId } });
  }
  return out;
}

export const surveyConfirmAwaitingRows = (args) => surveyConfirmZoneStates(args).awaiting;

/**
 * ตัวตัดสินตัวเดียวหลังปุ่ม · GET เติมฟอร์ม · POST สร้างร่าง · ด่านตอนยื่น — ด่านแรกที่โดนชนะ (ตาราง §2.1)
 * @param children แถว dept_requests ที่ผูกกับใบนี้ (ตัวอ่านคัดมาแล้ว)
 * @param selfId   ใบยืนยันที่กำลังยื่น (ไม่ติดด่านตัวเอง)
 * @param stage    'open' (ปุ่ม/เติมฟอร์ม/สร้าง) | 'submit' — ตอนยื่นข้ามแถว 4 แถว 6 ทำหน้าที่แทนโดยไม่นับแถวของตัวเอง
 * @returns { ok: true, carry, title } | { ok: false, status, code, error, open }
 */
export function surveyConfirmPlan({
  original, rows, rowsByZone, requestsById, children = [], selfId = null, stage = 'open',
} = {}) {
  if (!original || original.kind !== 'site_survey') {
    return refuse(404, 'confirm_no_original', SURVEY_CONFIRM_NO_ORIGINAL);
  }
  const rq = rqOf(original);
  const dept = deptOf(original);
  if (original.status === 'cancelled' || !original.answeredAt) {
    return refuse(409, 'confirm_not_sent',
      `ใบ ${rq} ยังไม่มีผลที่ส่งแล้ว (อาจถูกดึงผลกลับมาแก้) — รอ ${dept} ส่งผลก่อนจึงขอยืนยันหน้างานได้`);
  }
  if (original.surveyConfirm !== 'needed') {
    return refuse(409, 'confirm_not_needed',
      `${dept} แจ้งว่าใบ ${rq} ไม่ต้องยืนยันหน้างาน — ถ้ายังต้องการให้เข้าวัด เปิดคำร้องประเมินพื้นที่แบบลงหน้างานตามปกติ`);
  }
  if (stage === 'open') {
    const open = list(children)
      .filter((c) => c && c.id !== selfId && SURVEY_CONFIRM_OPEN_STATUSES.includes(c.status))
      .sort(newestFirst)[0];
    if (open) {
      return refuse(409, 'confirm_open', open.docNo
        ? `มีใบยืนยันหน้างานเปิดอยู่แล้ว — ${open.docNo} (${requestStatusView(open).label})`
        : 'มีร่างใบยืนยันหน้างานที่ยังไม่ส่งอยู่แล้ว — เปิดร่างนั้นเพื่อส่ง หรือลบร่างก่อน', openRef(open));
    }
  }
  const awaiting = surveyConfirmAwaitingRows({ request: original, rows, rowsByZone, requestsById });
  if (!awaiting.length) {
    return refuse(409, 'confirm_none_left', `ใบนี้ไม่มีพื้นที่ที่รอยืนยันหน้างานของ ${rq}`);
  }
  /* แถว 6 — พื้นที่ที่จะยกไปถูกใบอื่นที่ยังเปิดถืออยู่ (ผูกหรือไม่ผูก) ⇒ ตอบก่อนกรอกฟอร์ม ด้วยคำที่ไม่บอกให้ "เอารายการออก"
     (ฟอร์มล็อกพื้นที่ไว้ — N19) · ชุดที่ยกไปเป็นก้อนเดียว (D6): พื้นที่เดียวไม่ว่างก็ติดทั้งใบ (O12 = ก) */
  const held = [];
  for (const row of awaiting) {
    const pool = rowsByZone instanceof Map ? list(rowsByZone.get(row.zoneId)) : [];
    held.push(...pool.filter((r) => r && r.requestId !== selfId));
  }
  const busy = busySurveyRequests(held, requestsById);
  for (const row of awaiting) {
    const holder = busy.get(row.zoneId);
    if (!holder) continue;
    return refuse(409, 'confirm_zone_busy',
      `พื้นที่ ${row.zoneName || row.zoneId}: มีใบสั่งวัดค้างอยู่แล้ว ${rqOf(holder)} — รอใบนั้นจบก่อน`, openRef(holder));
  }
  return {
    ok: true,
    carry: awaiting.map((row) => ({
      zoneId: row.zoneId,
      zoneName: row.zoneName || null,
      sortOrder: row.sortOrder ?? null,
      previous: { areaSqm: areaOf(row), packageSize: sizeOf(row), packageQty: qtyOf(row) },
    })),
    title: surveyConfirmTitle(original),
  };
}

/**
 * ด่านตอนยื่นของร่างใบยืนยัน (R2) — `draft` = แถวคำร้องที่ route ถืออยู่ (`before`: มี `variant` · `submittedAt` · `surveyZones`)
 * คืน null หรือประโยค · ด่านแรกที่โดนชนะ:
 *   variant ไม่ใช่ 'standard'                               → SURVEY_CONFIRM_VARIANT_ERROR (ตัวเดียวกับที่ B-6 ตอบ)
 *   ชุด zoneId ของแถวที่ไม่ถูกตัด ≠ ชุด zoneId ของ plan.carry → N6a (ไม่เคยยื่น) / N6b (ถูกตีกลับ: มี submittedAt)
 *   (แถวที่ไม่มี zoneId = พื้นที่ใหม่ ⇒ ไม่ตรงเสมอ)
 * ⚠️ ไม่ดูวิธีรายแถว — แถวจากแบบบนร่างใบยืนยันเกิดผ่าน route ไม่ได้ (ตีกลับได้จาก pending เท่านั้น · หัวหน้าสลับได้หลังรับเรื่อง ·
 *   วิธีถูกล็อกโดย B-6) วิธีของแถวเป็นงานของตัวตั้งวิธี S4 ที่รันต่อจากด่านนี้ (F9)
 * ⚠️ ใบที่ถูกตีกลับยังถือเลข RQ และลบไม่ได้ (`deleteRequestError`) ทางออกคือยกเลิก — N6b จึงบอกให้ยกเลิก (F12)
 */
export function surveyConfirmSubmitMismatch(plan, draft, original) {
  if (draft?.variant !== 'standard') return SURVEY_CONFIRM_VARIANT_ERROR;
  const mine = list(draft?.surveyZones).filter((z) => z && z.status !== 'cut');
  const want = new Set(list(plan?.carry).map((c) => c.zoneId));
  const have = new Set(mine.map((z) => z.zoneId));
  const same = mine.every((z) => z.zoneId) && have.size === want.size && [...want].every((id) => have.has(id));
  if (same) return null;
  const rq = rqOf(original);
  return draft?.submittedAt
    ? `พื้นที่ของใบนี้ไม่ตรงกับพื้นที่ที่ยังรอยืนยันหน้างานของ ${rq} แล้ว — ยกเลิกใบนี้ แล้วกด “ขอยืนยันหน้างาน” ที่ใบ ${rq} ใหม่`
    : `พื้นที่ของร่างนี้ไม่ตรงกับพื้นที่ที่ยังรอยืนยันหน้างานของ ${rq} แล้ว — ลบร่างนี้ แล้วกด “ขอยืนยันหน้างาน” ที่ใบ ${rq} ใหม่`;
}

/**
 * body ที่ server สร้างให้ POST สร้างร่าง — สำเนาของ `body` ที่ทับ:
 *   kind 'site_survey' · variant 'standard' · dealId/siteId ของใบต้นทาง · zones = carry (ลำดับที่เก็บ = ลำดับในอาร์เรย์:
 *   normalizeSurveyZones นับแถวตาม index และทิ้ง sortOrder ที่โพสต์มา ⇒ ส่งแค่ zoneId) · title = ที่พิมพ์มา หรือ plan.title
 * ที่เหลือ (วันที่ · เวลา · รายละเอียด · ด่วน · ทีม) คงตามที่โพสต์ · ไม่แก้ `body` ตัวเดิม
 * ⚠️ POST สลับ body นี้เข้า **ก่อน** ส่วนวิธีประเมินของ S4 (R1) — 'standard' ต้องอยู่ใน body ก่อนด่านวิธี ·
 *   requestShapeError · surveyZoneSeedPatch อ่านมัน
 */
export function surveyConfirmCreateBody(body, original, plan) {
  const typed = typeof body?.title === 'string' ? body.title.trim() : '';
  return {
    ...(body && typeof body === 'object' ? body : {}),
    kind: 'site_survey',
    variant: 'standard',
    dealId: original?.dealId ?? null,
    siteId: original?.siteId ?? null,
    zones: list(plan?.carry).map(({ zoneId }) => ({ zoneId })),
    title: typed || plan?.title || surveyConfirmTitle(original),
  };
}

/**
 * ก้อนที่ GET หน้าคำร้องแนบเป็น `surveyConfirmLink` (§2.3) — `canManage` = canManageRequest(user, request)
 * @param plan      ผลของ surveyConfirmPlan (ใบนี้ในฐานะใบต้นทาง) · null = ไม่ได้ถาม (ใบยังไม่ส่ง/ไม่ needed)
 * @param states    ผลของ surveyConfirmZoneStates · null = นับ 0
 * @param children  ใบที่ผูกกับใบนี้ (ตัวอ่านคัดมา)
 * @param confirmOf ใบนี้เป็นใบยืนยัน ⇒ `{ id, docNo }` ของใบต้นทาง หรือ `{ id, missing: true }` เมื่อแถวหาย · ไม่ใช่ = null
 * ปุ่ม (`action`) มีเฉพาะคนจัดการใบได้ และแผนผ่าน (ready) หรือติด confirm_open / confirm_zone_busy (blocked + เหตุ)
 */
export function surveyConfirmLinkView({ request, plan = null, states = null, children = [], confirmOf = null, canManage = false } = {}) {
  const s = states || { awaiting: [], confirmed: [], moved: [] };
  const childIds = new Set(list(children).map((c) => c?.id).filter(Boolean));
  const distinct = (entries, pick) => {
    const seen = new Map();
    for (const entry of entries) {
      const req = pick(entry);
      if (req?.id && !seen.has(req.id)) seen.set(req.id, req);
    }
    return [...seen.values()].sort(newestFirst);
  };
  const confirmedBy = distinct(list(s.confirmed), (e) => e.by).map((r) => ({
    id: r.id, docNo: r.docNo || null, href: requestHref(r.id), linked: childIds.has(r.id),
  }));
  const movedTo = distinct(list(s.moved), (e) => e.to).map((r) => ({
    id: r.id, docNo: r.docNo || null, href: requestHref(r.id), linked: childIds.has(r.id), needed: r.surveyConfirm === 'needed',
  }));
  let action = null;
  if (canManage && plan && request?.id) {
    const href = surveyConfirmHref(request.id);
    if (plan.ok) action = { state: 'ready', reason: null, href };
    else if (plan.code === 'confirm_open' || plan.code === 'confirm_zone_busy') action = { state: 'blocked', reason: plan.error, href };
  }
  return {
    unknown: false,
    awaiting: list(s.awaiting).length,
    confirmed: list(s.confirmed).length,
    moved: list(s.moved).length,
    confirmedBy,
    movedTo,
    action,
    children: list(children)
      .filter((c) => c && (canManage || c.status !== 'draft'))
      .sort(newestFirst)
      .map((c) => ({ id: c.id, docNo: c.docNo || null, statusLabel: childStatusLabel(c), href: requestHref(c.id) })),
    confirmOf: surveyConfirmOfView(confirmOf),
  };
}

/**
 * คีย์ `confirmOf` ของก้อน `surveyConfirmLink` — รูปเดียวทั้งก้อนปกติและก้อน `unknown` ของใบยืนยัน (ตัวโหลดใช้ตัวนี้)
 * `{ id, docNo }` · `{ id, missing: true }` (ใบต้นทางหาย) · `{ id }` เฉย ๆ (อ่านใบต้นทางไม่สำเร็จ — รู้แค่ id) · ไม่ใช่ใบยืนยัน = null
 */
export function surveyConfirmOfView(confirmOf) {
  if (!confirmOf?.id) return null;
  return {
    id: confirmOf.id,
    docNo: confirmOf.missing ? null : (confirmOf.docNo || null),
    href: confirmOf.missing ? null : requestHref(confirmOf.id),
    missing: !!confirmOf.missing,
  };
}

/**
 * ชิ้นส่วนประโยคของแบนเนอร์ใบต้นทาง (ตาราง D-1 แถว 1 และ 3–7) — `n` = พื้นที่จากแบบที่ยังใช้อยู่ของใบ
 * → { text: string | null      (null = คงประโยคของวันนี้)
 *     keep: string[] | undefined (undefined = คง keep ของวันนี้ · มีค่าเฉพาะเมื่อ text มีค่า — แถว 4–7 · R5)
 *     note: string | null | undefined (undefined = คงหมายเหตุของวันนี้)
 *     refs: [{ docNo, href }] }
 * ⚠️ `note` ของแถว 1 และ 3 คือหมายเหตุ **หลังเปิดสวิตช์** — ฟังก์ชันนี้ไม่รู้จักสวิตช์ ผู้เรียก (surveyJob.js) เลือกเอง (F5)
 * ⚠️ แถว 4–7 ไม่เอ่ยชื่อปุ่ม (ไม่มีปุ่มให้กด) · ไม่มีวันพิมพ์ "ยืนยันแล้ว 0 พื้นที่"
 */
export function surveyConfirmBannerParts(link, { n = 0 } = {}) {
  const keepToday = { text: null, keep: undefined, refs: [] };
  if (!link) return { ...keepToday, note: undefined };
  if (link.unknown) return { ...keepToday, note: 'อ่านสถานะใบยืนยันหน้างานไม่สำเร็จ — โหลดหน้าใหม่' };
  const a = Number(link.awaiting) || 0;
  const c = Number(link.confirmed) || 0;
  const m = Number(link.moved) || 0;
  if (a > 0) {
    if (!c && !m) return { ...keepToday, note: undefined };
    const parts = [];
    if (c > 0) parts.push(`ยืนยันหน้างานแล้ว ${c} พื้นที่`);
    if (m > 0) parts.push(`ประเมินจากแบบอีกครั้ง ${m} พื้นที่`);
    parts.push(`ยังรอยืนยัน ${a} พื้นที่`);
    return { ...keepToday, note: parts.join(' · ') };
  }
  const head = `มี ${n} พื้นที่ที่ประเมินจากแบบ — `;
  const refsOf = (rows) => list(rows).map((r) => ({ docNo: r.docNo || r.id, href: r.href || requestHref(r.id) }));
  const movedNote = list(link.movedTo).some((r) => r?.needed) ? 'ขอยืนยันหน้างานของพื้นที่ที่เหลือได้ที่ใบนั้น' : null;
  if (c > 0 && !m) {
    return { text: `${head}วัดหน้างานแล้วครบ ใช้ตัวเลขของใบ`, keep: ['วัดหน้างานแล้วครบ'], note: null, refs: refsOf(link.confirmedBy) };
  }
  if (c > 0 && m > 0) {
    const done = `ยืนยันหน้างานแล้ว ${c} พื้นที่`;
    return {
      text: `${head}${done} · อีก ${m} พื้นที่ประเมินจากแบบอีกครั้งในใบ`,
      keep: [done, 'ประเมินจากแบบอีกครั้ง'],
      note: movedNote,
      refs: refsOf(link.movedTo),
    };
  }
  if (m > 0) {
    return { text: `${head}ประเมินจากแบบอีกครั้งในใบ`, keep: ['ประเมินจากแบบอีกครั้ง'], note: movedNote, refs: refsOf(link.movedTo) };
  }
  return { text: `${head}ใช้ตัวเลขเสนอราคาได้เลย`, keep: ['ใช้ตัวเลขเสนอราคาได้เลย'], note: null, refs: [] };
}

/* ── ข้อความบนเธรดของใบต้นทาง ─────────────────────────────────────────────────────────────── */

export const surveyConfirmOpenedText = (child) => `ฝ่ายขายขอยืนยันหน้างาน — เปิดใบ ${rqOf(child)}`;

/* ลำดับบรรทัด — กระดิ่งโชว์แค่ 500 ตัวอักษรแรก ⇒ ตัวเลขที่เปลี่ยนขึ้นก่อน ของที่ตรงไว้ท้าย */
const OUTCOME_ORDER = { confirmed_changed: 0, drawing_again: 1, cut: 2, confirmed_same: 3 };

/**
 * หนึ่งรายการต่อพื้นที่ที่ยกมาของใบยืนยัน — แถวของใบลูกนับว่า "ยกมา" เมื่อ zoneId ตรงกับแถวจากแบบที่ไม่ถูกตัดของใบต้นทาง
 * ผลลัพธ์: cut (ถูกตัดในใบยืนยัน) · drawing_again (ประเมินจากแบบอีกครั้ง) · confirmed_same / confirmed_changed (ลงหน้างาน)
 * เรียง: เปลี่ยน → จากแบบอีกครั้ง → ตัด → ตรง · ภายในผลเดียวกันตามลำดับแถวของใบลูก
 */
export function surveyConfirmSentLines({ child, childRows, originalRows } = {}) {
  const rq = rqOf(child);
  const origByZone = new Map();
  for (const r of list(originalRows)) {
    if (r && r.zoneId && r.status !== 'cut' && isDrawingZone(r) && !origByZone.has(r.zoneId)) origByZone.set(r.zoneId, r);
  }
  const out = [];
  for (const r of list(childRows).filter(Boolean).sort(byOrder)) {
    const before = r.zoneId ? origByZone.get(r.zoneId) : null;
    if (!before) continue;
    const zone = r.zoneName || before.zoneName || r.zoneId;
    if (r.status === 'cut') {
      out.push({ zoneId: r.zoneId, outcome: 'cut', text: `ยังไม่ได้ยืนยันหน้างาน — ${zone} ถูกตัดออกจากใบ ${rq}` });
    } else if (isDrawingZone(r)) {
      out.push({ zoneId: r.zoneId, outcome: 'drawing_again', text: `ยังไม่ได้ยืนยันหน้างาน — ${zone} ประเมินจากแบบอีกครั้ง (${rq})` });
    } else if (sameNumbers(r, before)) {
      out.push({ zoneId: r.zoneId, outcome: 'confirmed_same', text: `ยืนยันหน้างานแล้ว (${rq}) — ${zone}: ตัวเลขตรงกับผลจากแบบ` });
    } else {
      out.push({
        zoneId: r.zoneId, outcome: 'confirmed_changed',
        text: `ยืนยันหน้างานแล้ว (${rq}) — ${zone}: ${numbersText(before)} → ${numbersText(r)}`,
      });
    }
  }
  return out
    .map((line, index) => ({ line, index }))
    .sort((x, y) => OUTCOME_ORDER[x.line.outcome] - OUTCOME_ORDER[y.line.outcome] || x.index - y.index)
    .map(({ line }) => line);
}

/** บรรทัดแรกของการส่งผล (N23) — ส่วนที่เป็นศูนย์ไม่พิมพ์ · ไม่มีบรรทัด = null */
export function surveyConfirmSentSummary(child, lines) {
  const rows = list(lines);
  if (!rows.length) return null;
  const count = (...outcomes) => rows.filter((l) => outcomes.includes(l?.outcome)).length;
  const parts = [
    [count('confirmed_changed'), 'ตัวเลขเปลี่ยน'],
    [count('confirmed_same'), 'ตรงกับผลจากแบบ'],
    [count('drawing_again', 'cut'), 'ยังไม่ได้ยืนยัน'],
  ].filter(([k]) => k > 0).map(([k, label]) => `${label} ${k}`);
  return `ผลใบยืนยันหน้างาน ${rqOf(child)}: ${parts.join(' · ')}`;
}

/**
 * บรรทัดจบของใบยืนยัน — how: 'cancel' | 'close-unassessed' | 'reopened'
 * `stillAwaiting` ผู้เรียกตัดสิน (B-3): จริงเมื่อพื้นที่ที่ไม่ถูกตัดของใบลูกอย่างน้อยหนึ่งยังอยู่ใน awaiting ของใบต้นทาง ·
 *   อ่านไม่ได้ = false (ไม่อ้างสิ่งที่พิสูจน์ไม่ได้) · `reason` ตัดที่ 300 ตัวอักษร · `dept` ไม่ส่ง = ฝ่ายของใบลูก หรือ TS
 */
export function surveyConfirmEndedText(child, how, { reason = '', stillAwaiting = false, dept = null } = {}) {
  const name = `ใบยืนยันหน้างาน ${rqOf(child)}`;
  const tail = stillAwaiting ? ' — พื้นที่ยังรอยืนยันหน้างาน' : '';
  if (how === 'reopened') {
    return `${name} ถูกเปิดกลับมาแก้ — ผลยืนยันหน้างานที่แจ้งไว้ยังไม่นิ่ง รอ ${dept || deptOf(child)} ส่งผลใหม่`;
  }
  if (how === 'close-unassessed') {
    const why = String(reason ?? '').trim().slice(0, 300);
    return `${name} ถูกปิดโดยไม่ได้ประเมิน${tail}${why ? ` · ${why}` : ''}`;
  }
  return `${name} ถูกยกเลิก${tail}`;
}

/** "รอบจากแบบ (RQ-AS-…): 48 ตร.ม. · SM 1" — ไม่มีทั้งขนาดและแพ็คเกจ = null · รับแถวของใบต้นทาง หรือก้อน previous ของ carry */
export function surveyConfirmPreviousRoundText(originalRow, originalDocNo) {
  if (!originalRow) return null;
  if (areaOf(originalRow) === null && sizeOf(originalRow) === null && qtyOf(originalRow) === null) return null;
  const doc = String(originalDocNo ?? '').trim();
  return `รอบจากแบบ${doc ? ` (${doc})` : ''}: ${numbersText(originalRow)}`;
}

/**
 * วลีที่ห้ามขาดของบรรทัด "รอบจากแบบ (…): …" — ส่งให้ `keepPhrases` ของจอ (ตัวหนังสือไม่ถูกแตะ)
 * 🐞 UAT S5 head รอบ 1 K12: ช่องพื้นที่ 768/1440 ตัดเป็น "(RQ-AS-" / "26100345):" และ "30" / "ตร.ม." ⇒ เลขที่พร้อมวงเล็บ+โคลอน
 *    ก้อนหนึ่ง · ตัวเลข+หน่วย/ขนาด+จำนวน ก้อนละท่อน (ท่อนที่มีช่องว่าง) · ตัดได้แค่ระหว่างก้อน
 * รับข้อความจาก `surveyConfirmPreviousRoundText` (server ส่งมาเป็นสตริง) · ไม่ใช่รูปนั้น = [] (จอวาดข้อความเดิม)
 */
export function surveyConfirmPreviousRoundKeep(text) {
  const source = String(text ?? '');
  const at = source.indexOf(': ');
  if (at < 0) return [];
  const doc = source.slice(0, at + 1).match(/\([^()]*\):$/);
  const parts = source.slice(at + 2).split(' · ').filter((part) => part.includes(' '));
  return [...(doc ? [doc[0]] : []), ...parts];
}
