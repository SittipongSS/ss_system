// ── เลขที่รายงานการประเมินพื้นที่ `SU-YYMMXXXX-R` — ตรรกะล้วน (mig 0401) ─────────────────────
//
// ⭐ มติเจ้าของ 28/09–01/10: เอกสารมีเลขของตัวเอง รูปเดียวกับ QT/SO
//     `SU-` + `YYMM` (เดือนที่ออกฉบับแรก · นาฬิกาไทย) + เลขรัน 4 หลัก + `-R` (ฉบับ)
//     ดึงผลกลับแล้วส่งใหม่ = เลขฐานเดิม R ถัดไป (`SU-26090001-0` → `SU-26090001-1`)
//
// 🔴 **`YYMM` ในเลข ≠ ตัวตัดรอบของเลขรัน** (กับดักเดียวกับเลขคำร้อง · `lib/requests/docNo.js`)
//     เลขรันตัดรอบ **รายปี** — คีย์ `month` ของ `entity_number_counters` คือ `YY`
//     ⇒ `SU-26090001` → (เดือนถัดไป) `SU-26100002` → (ปีใหม่) `SU-27010001`
//
// ⚠️ **เลขจริงออกที่ฐานทางเดียว** — RPC `issue_survey_report` (0401) รับแค่ `p_yymm` แล้วประกอบเลขเองใต้ล็อก
//     `formatSurveyReportNo` ที่นี่มีไว้ให้เทสต์ · ตัวเรนเดอร์ทดลอง (harness) · ตัวอย่างบนหน้าตั้งค่า เท่านั้น
//     ห้ามเอาไป "จองเลข" ฝั่ง JS (บทเรียน RQ: จองก่อนเขียนแถว = เลขหายทุกครั้งที่เขียนไม่ผ่าน)
import { businessMonthKey } from '@/lib/businessDate';
import { documentFileName } from '@/lib/documents/documentShell';

export const SURVEY_REPORT_PREFIX = 'SU';
/** scope ของ `entity_number_counters` — ตรงกับที่ RPC ฮาร์ดโค้ดไว้ (เทสต์ migration ล็อกคู่กัน) */
export const SURVEY_REPORT_COUNTER_SCOPE = 'SU';
export const SURVEY_REPORT_RUNNING_WIDTH = 4;

const YYMM_RE = /^[0-9]{2}(0[1-9]|1[0-2])$/;
const DOC_NO_RE = /^SU-([0-9]{2})(0[1-9]|1[0-2])([0-9]{4})-([0-9]+)$/;
const MAX_RUNNING = 10 ** SURVEY_REPORT_RUNNING_WIDTH - 1;

/** `YYMM` ของจุดเวลาตามนาฬิกาไทย — ค่าที่ส่งเป็น `p_yymm` ให้ RPC */
export const surveyReportYymm = (now = new Date()) => businessMonthKey(now);

/** ปีของรอบเลขรัน (2 หลัก · นาฬิกาไทย) — คีย์ `month` ของตัวนับ ไม่ใช่เดือนในเลข */
export const surveyReportCounterYear = (now = new Date()) => surveyReportYymm(now).slice(0, 2);

/**
 * ประกอบเลขเต็ม — คืน `null` เมื่อประกอบไม่ได้ (เดือนผิด · เลขรันไม่ใช่จำนวนเต็ม 1–9999 · ฉบับติดลบ)
 * ⚠️ ไม่ตัดหลัก ไม่ปัดเศษ: เลขรันที่เกิน 4 หลัก = รอบปีเต็ม ต้องล้มให้เห็น ไม่ใช่วนกลับไปทับเลขเก่า
 */
export function formatSurveyReportNo({ yymm, running, rev = 0 } = {}) {
  const month = String(yymm ?? '');
  if (!YYMM_RE.test(month)) return null;
  if (!Number.isInteger(running) || running < 1 || running > MAX_RUNNING) return null;
  if (!Number.isInteger(rev) || rev < 0) return null;
  const base = `${SURVEY_REPORT_PREFIX}-${month}${String(running).padStart(SURVEY_REPORT_RUNNING_WIDTH, '0')}`;
  return `${base}-${rev}`;
}

/** แกะเลข → `{ docNo, baseNo, yymm, year, month, running, rev }` หรือ `null` เมื่อไม่ใช่เลข SU */
export function parseSurveyReportNo(value) {
  const docNo = String(value ?? '').trim();
  const match = DOC_NO_RE.exec(docNo);
  if (!match) return null;
  const [, year, month, running, rev] = match;
  return {
    docNo,
    baseNo: `${SURVEY_REPORT_PREFIX}-${year}${month}${running}`,
    yymm: `${year}${month}`,
    year,
    month,
    running: Number(running),
    rev: Number(rev),
  };
}

/**
 * ชื่อไฟล์ PDF (ไม่มีนามสกุล) — `SU-26090001-0_บริษัท เอสล่า จำกัด_ประเมินพื้นที่` · ฉบับภายในต่อ `_ภายใน`
 * ใช้ตัวประกอบชื่อไฟล์กลางของเอกสารทุกใบ (ตัดอักขระต้องห้าม · จำกัดความยาวเป็นไบต์)
 *
 * 🔴 **ป้ายฉบับต้องรอดเสมอ — ชื่อลูกค้าเป็นฝ่ายถูกตัด** · ตัวประกอบกลางตัดจากท้ายเมื่อเกิน 180 ไบต์ (ไทย 3 ไบต์/ตัว)
 *   ชื่อลูกค้าของจริงยาว 51 ตัว (RQ-AS-26090186) ก็เกินแล้ว ⇒ เดิมทั้งสองฉบับได้ชื่อไฟล์เดียวกัน "…_ประเมิน"
 *   และ `_ภายใน` หายทั้งคำ — ไฟล์ฉบับภายในที่ชื่อเหมือนฉบับลูกค้าคือทางที่มันจะถูกแนบส่งลูกค้าผิดใบ
 *   (เจอตอนเรนเดอร์ของจริงใน harness · 01/10/2026)
 * 🔑 **ชื่อลูกค้าถูกตัดที่เดียวกันทั้งสองฉบับ ที่ขอบคำ** — งบของชื่อคิดจากฉบับภายใน (ป้ายยาวกว่า) แล้วใช้กับฉบับลูกค้าด้วย
 *   ⇒ สองไฟล์ต่างกันแค่ `_ภายใน` · ตัดที่ขอบคำ (`Intl.Segmenter`) ไม่ใช่กลางคำ: เดิมได้ "…เทนนิส คลั" กับ "…เทนน"
 *   (คนละจุดต่อฉบับ และทิ้งสระหน้า เ แ โ ใ ไ ค้างท้ายได้) — คำเดียวที่ยาวเกินงบทั้งคำ = ตัดที่ขอบอักขระ (grapheme)
 */
const INTERNAL_TAIL = ['ประเมินพื้นที่', 'ภายใน'];
const CUSTOMER_TAIL = ['ประเมินพื้นที่'];

/* กติกาเดียวกับ `filePart` ของตัวประกอบกลาง (อักขระต้องห้าม · ช่องว่างซ้ำ) — ทำก่อนเพื่อให้ขอบคำที่หาได้ตรงกับที่ถูกพิมพ์ */
const cleanPart = (value) => String(value ?? '').replace(/[\\/:*?"<>|]/g, ' ').replace(/[\s_]+/g, ' ').trim();
/* ท้ายชื่อที่ถูกตัดต้องไม่ค้างเครื่องหมายเปิด/ตัวเชื่อม หรือสระหน้าที่ไม่มีพยัญชนะตาม */
const trimDangling = (value) => value.replace(/[\s\-–—&+,.(\[{'"เแโใไ]+$/u, '');

function segments(value, granularity) {
  if (typeof Intl === 'undefined' || typeof Intl.Segmenter !== 'function') return [...value];
  return [...new Intl.Segmenter('th', { granularity }).segment(value)].map((s) => s.segment);
}

/** ชื่อลูกค้าที่ยาวที่สุดซึ่งลงชื่อไฟล์ของ **ฉบับภายใน** ได้โดยป้ายฉบับยังครบ — ตัดที่ขอบคำ */
function fittedCustomerName(docNo, customerName) {
  const full = cleanPart(customerName);
  const suffix = INTERNAL_TAIL.join('_');
  const fits = (name) => !name || documentFileName(docNo, name, ...INTERNAL_TAIL).endsWith(`${name}_${suffix}`);
  if (fits(full)) return full;
  const longest = (parts) => {
    let best = '';
    let acc = '';
    for (const part of parts) {
      acc += part;
      const candidate = trimDangling(acc);
      if (candidate === best) continue;
      if (!fits(candidate)) break;
      best = candidate;
    }
    return best;
  };
  return longest(segments(full, 'word')) || longest(segments(full, 'grapheme'));
}

export function surveyReportFileName(docNo, customerName, version = 'customer') {
  const tail = version === 'internal' ? INTERNAL_TAIL : CUSTOMER_TAIL;
  return documentFileName(docNo, fittedCustomerName(docNo, customerName), ...tail);
}
