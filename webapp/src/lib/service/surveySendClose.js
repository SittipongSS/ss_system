// ── "ส่งผล" ปิดนัดประเมินที่ยังเปิดอยู่ให้ด้วย (มติเจ้าของ 24/09 ข้อ 2) ───────────
//
// ⭐ **มติ 24/09 แทนมติ 16/09** ("กดส่งผลไม่ได้ปิดนัด") — เจ้าของ: *"ส่งผลแล้วปิดนัดให้ด้วย แต่ต้องมีด่าน
//    งานที่ต้องส่งด้วย เช่น ขนาด พื้นที่ รูป แพ็ค ที่ตกลงไว้"*
//    🐞 ทำไมต้องเปลี่ยน: ส่งผลตอนช่างยังไม่กด "ส่งงาน" ⇒ ใบล็อก แถบส่งงานหายจากจอประเมิน ปุ่มส่งงานบน
//       งานวันนี้เงียบ และฟอร์มแก้นัดแก้สถานะ "กำลังทำ" ไม่ได้ ⇒ นัดค้างเปิดตลอดกาล ปิดจากจอไหนก็ไม่ได้
//
// 🔑 **ด่านไม่ได้อยู่ที่นี่** — ด่านส่งผล (`surveySendError`) ครอบด่านส่งงานของช่าง (`surveyFieldSubmitError`)
//    ทั้งหมดอยู่แล้ว (ขนาด · ภาพกว้าง · จุดที่ติดตั้งได้ + ภาพผัง · เลือกจุด · แพ็คเกจที่เคาะ) และเข้มกว่า
//    ⇒ route ส่งผลถามด่านนั้นตัวเดียวก่อนเรียกไฟล์นี้ · ห้ามเขียนด่านซ้ำที่นี่ (เทสต์ตรึงว่าครอบจริง)
//
// ⭐ **ตัวตัดสินชุดเดียวของจอกับ server** (`surveySendVisitStep`) — โมดัลยืนยันบอกว่าจะปิดนัดไหน
//    ด้วยคำตอบเดียวกับที่ route ใช้ปิดจริง · เขียนแยกเมื่อไร โมดัลจะสัญญาอย่างหนึ่งแล้วทำอีกอย่าง
//
// ⭐ **รู้จักวิธีประเมินรายพื้นที่** (ประเมินจากแบบ · mig 0408) — ผู้เรียกทุกตัวส่ง `needsVisit`
//    (= `surveyNeedsVisit` ของแถวพื้นที่) · ใบงานโต๊ะไม่ปิดนัดที่ยังไม่มีใครไปเป็น "เข้าแล้ว"
//    · ด่าน "พื้นที่ลงหน้างานต้องมีนัดที่เข้าพื้นที่" (`surveySendSiteVisitError`) อยู่ไฟล์นี้เพราะเป็นเรื่องของ **นัด**
//      ไม่ใช่ด่านรายหัวข้อของพื้นที่ — ชุดหกข้อยังอยู่ที่ `survey.js` ที่เดียวเหมือนเดิม
//
// 🔴 **ไม่ประทับเวลาจบเป็นเวลาที่กดส่งผล** — วันส่งผล ≠ วันเข้าพื้นที่ (มติ 21/09) ห่างกันได้หลายวัน
//    ⇒ เวลาจบ "ตอนนี้" = ชั่วโมงงานเพี้ยน และถ้าเช้ากว่าเวลาเริ่ม ฐานตีกลับ · เก็บเวลาที่ช่างประทับไว้จริงเท่านั้น
// 🔴 **ปิดเป็น "เข้าแล้ว" อย่างเดียว** — จอประเมินไม่มี "ทำไม่ครบ" (พื้นที่ที่วัดไม่ได้ใช้ "ตัดพื้นที่นี้ออก")
//    และนัดที่ "ทำไม่ได้" ผ่านด่านส่งผลไม่ได้อยู่แล้ว (ไม่มีขนาด/รูป) · ห้ามเดาเป็นสถานะอื่น
//
// ⭐ **ใบที่มีพื้นที่จากแบบ ส่งผลต้องตอบว่า "ต้องยืนยันหน้างานไหม"** (งวด S2a · แผน survey-desk-assessment §3.2)
//    · `surveySendMethodError` = ด่านของ route (จอเห็นสัดส่วนวิธีประเมินชุดเดียวกับฐานไหม · เลือกแล้วหรือยัง)
//    · `surveySendMethodText` = ท่อนที่ต่อท้ายบรรทัดส่งผลในเธรด / กระดิ่ง / audit
//    · `surveySendConfirm({ method })` = หัวโมดัล ตัวเลือก และรายการผลของใบแบบนี้
//    🔴 ทั้งสามตัว **อ่านจากแถวพื้นที่ ไม่อ่านสวิตช์** — ใบที่มีพื้นที่จากแบบไปแล้วต้องส่งผลได้แม้สวิตช์ถูกปิดทีหลัง ·
//       ใบลงหน้างานล้วนได้ `null` / `''` / ผลเท่าเดิมทุกคีย์
import { fmtDate } from '@/lib/format';
import { surveyZoneName } from './survey';
import { isDrawingZone, surveyMethodMix, surveyNeedsVisit } from './surveyMethod';
import {
  SURVEY_CONFIRM_LABEL, SURVEY_CONFIRM_MISSING, SURVEY_METHOD_LABEL, SURVEY_ZONE_TAG, surveyZoneNamesText,
} from './surveyMethodSwitch';
import { VISIT_STATUS_LABELS, isOpenVisit } from './visitStatus';

/** สถานะที่ส่งผลปิดให้ได้ — ชุดเดียวกับ `isOpenVisit` (เงื่อนไขของคำสั่ง update ต้องตรงกับตัวตัดสิน) */
export const SEND_CLOSABLE_VISIT_STATES = ['scheduled', 'in_progress'];

const codeOf = (visit) => visit?.code || visit?.id || 'นัด';
// กติกาเดียวกับ `isCut` ใน `survey.js` — ไม่มี status = ยังใช้อยู่
const isCut = (row) => (row?.status || 'ok') === 'cut';
const dayOf = (value) => (value ? String(value).slice(0, 10) : null);
const timeOf = (value) => (value ? String(value).slice(0, 5) : null);
/* ลิสต์ข้อความที่มาจากนอกไฟล์ (body ของคำขอ · ผลของตัวตรวจ) — เก็บเฉพาะสตริงที่มีเนื้อ ไม่ตัด ไม่แก้ตัวอักษร */
const textList = (value) => (Array.isArray(value) ? value : []).filter((t) => typeof t === 'string' && t.trim() !== '');
// คำตอบ "ต้องยืนยันหน้างานไหม" ที่ใช้ได้ — สองค่าของ `SURVEY_CONFIRM_LABEL` ตรงตัว (ค่าที่ฐานรับ: CHECK ของ mig 0408)
const isConfirmChoice = (value) => typeof value === 'string' && Object.hasOwn(SURVEY_CONFIRM_LABEL, value);

/**
 * ส่งผลแล้วนัดของใบจะเป็นยังไง — คืน `{ action: 'none' | 'block' | 'close', ... }`
 *
 * @param visit   นัดที่ **ยังกินสิทธิ์ของใบ** (`findSurveyVisit(…, { openOnly: true })`) หรือ null
 * @param today   วันไทยวันนี้ `YYYY-MM-DD` (`businessDate()` ของผู้เรียก — ไฟล์นี้ไม่อ่านนาฬิกาเอง)
 * @param needsVisit  ใบนี้ต้องมีนัดลงหน้างานไหม — `surveyNeedsVisit(แถวพื้นที่ของใบ)` (mig 0408 · ประเมินจากแบบ)
 *   🔴 **บังคับส่ง ไม่มีค่าตั้งต้น** — ไม่ใช่ boolean = โยน `TypeError` ทันที · ผู้เรียกที่ลืมต้องแดงในเทสต์ของตัวเอง
 *      ไม่ใช่ถูกเดาเป็น "ต้องมีนัด" แล้วปิดนัดของใบงานโต๊ะเป็น "เข้าแล้ว" เงียบ ๆ
 *
 * - `none`  — ไม่มีนัดค้าง / นัดปิดไปแล้ว (เข้าแล้ว · ทำไม่ได้ · ยกเลิก · เลื่อนแล้ว) ⇒ ไม่แตะนัด
 * - `block` — นัดยังเป็น **ร่าง** (ยังไม่ขึ้นตารางช่าง) ⇒ ส่งผลไม่ได้ พร้อมทางออก
 *   ⚠️ ปิดร่างเป็น "เข้าแล้ว" = บันทึกว่าไปหน้างานทั้งที่นัดไม่เคยขึ้นตารางใคร · ยกเลิกร่างให้เอง = ตัดสินแทนผู้จัดคิว
 * - `close` — นัดนัดไว้/กำลังทำ ⇒ ปิดเป็น "เข้าแล้ว" ไปพร้อมกัน · `patch` ไม่มีคีย์เวลาเลย (เวลาที่ช่างประทับไว้อยู่ครบ)
 *   · วันเข้าจริง = ที่ช่างกดเริ่มไว้ · ไม่เคยกดเริ่ม = วันนัด (วันนัดยังไม่มาถึง = วันนี้ — ไปวัดก่อนวันนัด)
 *
 * ⭐ **ใบงานโต๊ะ (`needsVisit === false` = ประเมินจากแบบทั้งใบ)** — นัดที่ยังเปิดคือของค้างจากก่อนสลับวิธี:
 *   · ร่าง **และนัดไว้** = `block` — ยังไม่มีใครไปหน้างาน ⇒ ปิดเป็น "เข้าแล้ว" = บันทึกการเข้าพื้นที่ที่ไม่เคยเกิด
 *     บนใบที่ไม่ต้องมีใครไป · ทางออกคือยกเลิกนัดผ่าน "เปลี่ยนวิธีประเมิน" (ประโยคบอกรหัสนัดและทางออก)
 *   · กำลังทำ = `close` ด้วย patch ชุดเดิม — ช่างกดเริ่มที่หน้างานไปแล้วจริง
 *   · นอกนั้น (ไม่มีนัด · ปิดไปแล้ว) = `none`
 */
export function surveySendVisitStep(visit, { today = null, needsVisit } = {}) {
  if (typeof needsVisit !== 'boolean') {
    throw new TypeError('surveySendVisitStep: ต้องส่ง needsVisit เป็น true/false — คำนวณจาก surveyNeedsVisit(แถวพื้นที่ของใบ)');
  }
  if (!visit) return { action: 'none', visit: null };
  const code = codeOf(visit);
  if (!needsVisit && (visit.status === 'draft' || visit.status === 'scheduled')) {
    return {
      action: 'block',
      visit,
      error: `ใบนี้ประเมินจากแบบทั้งใบ แต่นัด ${code} ยังเปิดอยู่ — กด “เปลี่ยนวิธีประเมิน” แล้วยืนยันยกเลิกนัดก่อนส่งผล (ระบบจะไม่ปิดนัดที่ยังไม่มีใครไปเป็น “เข้าแล้ว” ให้)`,
    };
  }
  if (visit.status === 'draft') {
    return {
      action: 'block',
      visit,
      error: `นัด ${code} ยังเป็นร่าง (ยังไม่ขึ้นตารางช่าง) — ปล่อยขึ้นตารางหรือยกเลิกนัดที่หน้าจัดคิวก่อน แล้วค่อยส่งผล`,
    };
  }
  if (!isOpenVisit(visit)) return { action: 'none', visit };
  const sched = dayOf(visit.scheduledDate);
  const now = dayOf(today);
  const actualDate = dayOf(visit.actualDate)
    || (sched && now && sched > now ? now : sched)
    || now;
  return { action: 'close', visit, patch: { status: 'done', actualDate } };
}

/** ข้อ "เอกสาร" ของโมดัลยืนยันเมื่อใบมีพื้นที่จากแบบ — เอกสารของใบแบบนี้ถูกพักไว้จนกว่างวด S3 จะปรับแบบเอกสาร */
export const SURVEY_SEND_PAPER_HOLD_EFFECT = 'เอกสารประเมิน (เลข SU) ของใบที่ประเมินจากแบบยังออกไม่ได้ — ระบบกำลังปรับแบบเอกสาร · ผลถึงฝ่ายขายตามปกติ';

/**
 * ⭐ **โมดัลยืนยัน "ส่งผล" ต้องบอกทุกอย่างที่เกิดจากการกดครั้งเดียว** (กติกาโมดัลบอกผลลัพธ์ · #1223)
 *    — คืน `{ effects: string[], confirmLabel }` ให้จอวาดเป็นรายการข้อ ๆ
 *
 * @param docNo        เลขที่ใบคำร้อง (ใบที่จะเป็น "ตอบแล้ว")
 * @param closesVisit  `view.send.closesVisit` ของการ์ดควบคุม (มาจาก `surveySendVisitStep` ตัวเดียวกับที่ route
 *                     ปิดจริง) · null = ส่งผลไม่แตะนัด
 *
 * 🔴 ข้อ "ปิดนัด" ต้องบอก **เวลาที่จะเหลืออยู่บนนัด** ตามจริง — ส่งผลไม่ประทับเวลาจบ (วันส่งผล ≠ วันเข้าพื้นที่)
 *    ⇒ นัดที่ปิดทางนี้ไม่มีเวลาจบเสมอ · ไม่เคยกดเริ่ม = ไม่มีเวลาเข้าจริงด้วย · บอกก่อนกด ไม่ใช่ให้ไปเจอเองบนนัด
 * ⚠️ ป้ายปุ่มพูดตามผล: ปิดนัดด้วย = "ส่งผลและปิดนัด" · ไม่แตะนัด = "ส่งผล"
 * @param sendBackPending  `view.send.sendBackPending` (`{ itemCount }` | null) — 🐞 review 26/09: ส่งกลับให้ช่างแก้ค้างอยู่
 *                     ⇒ ข้อเตือนต่อท้ายข้อ "ล็อก" (ผลของการล็อกเอง: ช่างแก้ต่อไม่ได้ · ไม่เขียนอะไรลงเธรด — ใบที่ล็อกซ่อนเรื่องค้างที่ `surveySendBackOnSheet` ของ GET · ดึงกลับ = ค้างตามจริง) · ไม่เปลี่ยนป้ายปุ่ม
 * @param issuesDocument  การส่งผลครั้งนี้ **ออกเอกสารประเมิน (เลข SU) ด้วย** (`document.issueAtSend` ของ GET · PR-2 §8)
 *                     ⇒ ข้อ "ออกเอกสาร" ต่อจากข้อปิดนัด · ไม่ส่ง = ไม่มีข้อนี้ (ผลเท่าก่อน PR-2 ทุกตัวอักษร — เทสต์ล็อก)
 * @param replacesDocNo   เลขเอกสารฉบับก่อนที่ถูกแทนที่ไปตอนดึงผลกลับ (`SU-…-n`) — ส่งรอบใหม่ = ออก Rev ถัดไปแทนฉบับนั้น
 * @param warnings        `document.send.warnings` (string[]) — ข้อความที่จะพิมพ์บนฉบับลูกค้าตามที่กรอก (มติเจ้าของ 01/10 ข้อ 3:
 *                     เตือน ไม่บล็อก) · หนึ่งคำเตือน = หนึ่งข้อ · จอส่งลิสต์ **ชุดเดียวกันนี้** กลับไปเป็น `seenWarnings`
 *                     ⚠️ ป้ายปุ่มไม่เปลี่ยนตามสามตัวนี้ — ป้ายพูดเรื่องนัด (ปิด/ไม่ปิด) ซึ่งต่างกันรายใบ · เอกสารออกทุกใบเมื่อเปิดสวิตช์
 *                     · คำเตือนที่ซ้ำกันตามตัวอักษรขึ้นข้อเดียว (PR-3 — จอใช้ข้อความเป็น key ของข้อ) · ลิสต์ที่ส่งกลับ server ยังดิบ
 * @param documentUnknown `view.send.documentUnknown` — GET อ่านสถานะเอกสารไม่สำเร็จ (`{ access: 'none', unknown: true }`) ⇒ จอไม่รู้ว่า
 *                     การส่งครั้งนี้ออกเอกสารด้วยไหม · โมดัลต้องบอกผลแบบมีเงื่อนไข (PR-3 มติ 12 · #1223) · ไม่ส่ง = ไม่มีข้อนี้
 * @param method       ใบที่มีพื้นที่ **ประเมินจากแบบ** (งวด S2a · แผน survey-desk-assessment §3.2) —
 *                     `{ mix: surveyMethodMix(แถว), confirm: 'needed' | 'not_needed' | null, openVisit: null | { code, status } }`
 *                     ⭐ ไม่ส่ง หรือ `mix.drawing === 0` = **ผลเท่าเดิมทุกคีย์** (ไม่มี `title` · ไม่มี `choice`)
 *                     มีพื้นที่จากแบบ ⇒ ผลได้ `title` (หัวโมดัล) กับ `choice` (คำถาม "ต้องยืนยันหน้างานไหม" · `value` ว่างจนกว่า
 *                     หัวหน้าจะเลือก — ไม่เลือกให้ล่วงหน้า) · ข้อ "พื้นที่จากแบบ" กับป้ายบนทะเบียนต่อจากข้อส่งกลับ ·
 *                     ข้อปิดนัดของใบจากแบบทั้งใบ · ข้อ "เอกสารยังออกไม่ได้" แทนข้อออกเอกสาร · ป้ายปุ่มใช้กติกาเดิม
 */
export function surveySendConfirm({
  docNo = null, closesVisit = null, sendBackPending = null, sizeReview = null,
  issuesDocument = false, replacesDocNo = null, warnings = null, documentUnknown = false,
  method = null,
} = {}) {
  /* ใบที่มีพื้นที่จากแบบ (งวด S2a) — ทุกกิ่งข้างล่างที่ถามสามตัวนี้ได้ `false` / `null` เมื่อไม่ส่ง `method`
     หรือใบไม่มีพื้นที่จากแบบ ⇒ ลิสต์และคีย์ของผลเท่าเดิมทุกตัวอักษร */
  const drawingZones = Number(method?.mix?.drawing) || 0;
  const byDrawing = drawingZones > 0;
  const allDrawing = byDrawing && method.mix.mode === 'drawing';
  const confirm = byDrawing && isConfirmChoice(method.confirm) ? method.confirm : null;

  const effects = [
    `${docNo ? `ใบ ${docNo}` : 'ใบนี้'} เป็น “ตอบแล้ว” — ฝ่ายขายได้แจ้งเตือนและเอาตัวเลขไปตั้งราคาได้ทันที`,
    'ผลประเมินล็อก แก้ไม่ได้ จนกว่าหัวหน้าจะกด “ดึงผลกลับมาแก้”',
  ];
  /* ⭐ ขนาดที่ตั้งไว้ก่อนมีข้อเสนอของระบบ (back-fill ST ของ mig 0398 · UAT PR-P 01/10) — ฝ่ายขายจะได้ขนาดนี้ไปตั้งราคา
     ⇒ บอกก่อนกดว่าพื้นที่ไหนยังไม่มีใครเทียบกับข้อเสนอ (เตือน ไม่บล็อก · ข้อความจาก `surveyPackageReviewText` ตัวเดียวกับการ์ด) */
  if (sizeReview?.text) effects.push(`${sizeReview.text} — ฝ่ายขายจะได้ขนาดตามนี้ · ถ้ายังไม่ได้ตรวจ ปิดกล่องนี้แล้วตรวจที่แท็บสรุปส่งผลก่อน`);
  if (sendBackPending) {
    const n = Number.isInteger(sendBackPending.itemCount) && sendBackPending.itemCount > 0 ? ` ${sendBackPending.itemCount} ข้อ` : '';
    effects.push(`เรื่องที่ส่งกลับให้ช่างแก้${n} ยังรอช่างแจ้งว่าแก้แล้ว — ส่งผลแล้วช่างแก้ต่อไม่ได้ (ดึงผลกลับมาแก้ = เรื่องนี้กลับมารอช่างอีกครั้ง)`);
  }
  if (byDrawing) {
    effects.push(`${drawingZones} พื้นที่${SURVEY_METHOD_LABEL.drawing} — หน้าคำร้องและเอกสารจะระบุว่า “${SURVEY_METHOD_LABEL.drawing}”`);
    // ยังไม่เลือก = ยังไม่มีข้อนี้ (ป้ายบนทะเบียนขึ้นกับคำตอบ — โมดัลไม่เดาแทนหัวหน้า)
    if (confirm === 'needed') {
      effects.push(`ทะเบียนพื้นที่ของลูกค้าขึ้นป้าย “${SURVEY_ZONE_TAG.awaiting}” จนกว่า TS จะส่งผลของใบยืนยันหน้างาน`);
    } else if (confirm === 'not_needed') {
      effects.push(`ทะเบียนพื้นที่ของลูกค้าขึ้นป้าย “${SURVEY_ZONE_TAG.drawing}” (${SURVEY_CONFIRM_LABEL.not_needed})`);
    }
  }
  if (allDrawing) {
    /* จากแบบทั้งใบ: นัดที่ส่งผลปิดให้ได้มีแบบเดียวคือนัดที่ช่างกดเริ่มไว้ (`surveySendVisitStep`) — หนึ่งนัดหนึ่งข้อ ไม่ซ้อนกับข้อปิดนัดเดิม
       ⚠️ "ไม่มีนัดที่เปิดอยู่" พูดเฉพาะตอนไม่มีจริง (`openVisit` ว่าง) — นัดร่าง/นัดไว้ที่ค้างอยู่ถูกด่านส่งผลตีกลับด้วยประโยคของมันเอง */
    if (closesVisit) effects.push(`นัด ${codeOf(closesVisit)} ที่ช่างกดเริ่มงานไว้จะถูกปิดเป็น “${VISIT_STATUS_LABELS.done}”`);
    else if (!method.openVisit) effects.push('ไม่มีการปิดนัด — ใบนี้ไม่มีนัดที่เปิดอยู่');
  } else if (closesVisit) {
    effects.push(surveySendVisitEffect(closesVisit));
  }
  /* ⭐ ส่งผล = ออกเอกสารประเมินด้วย (PR-2) — เลขเอกสารถาวร แก้ไม่ได้หลังออก ⇒ ต้องอยู่ในรายการผลก่อนกด (#1223)
     · คำเตือนของข้อความบนฉบับลูกค้าตามมาทีละข้อ: หัวหน้าอ่านแล้วส่งต่อ หรือปิดกล่องกลับไปแก้
     ⚠️ ใบที่มีพื้นที่จากแบบ: เอกสารยังถูกพักไว้ (งวด S1 · งวด S3 เป็นคนถอดกิ่งนี้) ⇒ บอกตรง ๆ ว่ายังไม่ออก แทนข้อ "ออกเอกสาร"
        ไม่ว่าสวิตช์ออกเอกสารตอนส่งผลจะเปิดหรือปิด */
  if (byDrawing) {
    effects.push(SURVEY_SEND_PAPER_HOLD_EFFECT);
  } else if (issuesDocument) {
    const replaced = String(replacesDocNo ?? '').trim();
    effects.push((replaced
      ? `ออกเอกสารประเมินฉบับใหม่ (Rev ถัดไป) แทน ${replaced} ที่ใช้ไม่ได้แล้ว`
      : 'ออกเอกสารประเมิน (เลข SU) ไปพร้อมกัน')
      + ' — ฝ่ายขายดาวน์โหลดฉบับลูกค้าได้ที่หน้าคำร้อง · เอกสารที่ออกแล้วแก้ไม่ได้ (แก้ = ดึงผลกลับแล้วส่งใหม่เป็น Rev ถัดไป)');
  }
  for (const line of [...new Set(textList(warnings))]) effects.push(`ฉบับลูกค้าจะพิมพ์ตามที่กรอกไว้ — ${line}`);
  // ใบที่มีพื้นที่จากแบบบอกไปแล้วข้างบนว่าเอกสารยังไม่ออก — "อาจออกเลข SU ด้วย" จะขัดกับข้อนั้น
  if (documentUnknown === true && !byDrawing) {
    effects.push('อ่านสถานะเอกสารประเมินไม่สำเร็จ — ถ้าระบบเปิดออกเอกสารตอนส่งผลอยู่ การส่งครั้งนี้จะออกเลข SU ด้วย');
  }
  effects.push('ใบจะจบเมื่อฝ่ายขายกด “ปิดเรื่อง”');
  const confirmLabel = closesVisit ? 'ส่งผลและปิดนัด' : 'ส่งผล';
  if (!byDrawing) return { effects, confirmLabel };
  return {
    effects,
    confirmLabel,
    title: allDrawing ? 'ส่งผลประเมินจากแบบให้ฝ่ายขาย' : 'ส่งผลให้ฝ่ายขาย',
    choice: {
      question: 'ต้องเข้ายืนยันหน้างานภายหลังไหม',
      value: confirm,
      missing: SURVEY_CONFIRM_MISSING,
      options: [
        {
          value: 'needed',
          label: SURVEY_CONFIRM_LABEL.needed,
          hint: 'ฝ่ายขายใช้ตัวเลขเสนอราคาได้เลย · พื้นที่ติดป้าย “รอยืนยันหน้างาน” จนกว่า TS จะส่งผลของใบยืนยันหน้างาน · ฝ่ายขายเป็นคนกดขอเมื่อพื้นที่พร้อม',
        },
        {
          value: 'not_needed',
          label: SURVEY_CONFIRM_LABEL.not_needed,
          hint: 'ใช้ผลจากแบบเป็นผลสุดท้าย เช่น บูธงานอีเวนต์ · ฝ่ายขายจะไม่มีปุ่มขอยืนยันหน้างาน',
        },
      ],
    },
  };
}

/** ข้อ "ปิดนัด" ของโมดัลยืนยัน — แยกตามสิ่งที่ช่างกดไว้แล้ว (เริ่มงานแล้ว / ยังไม่เคยเริ่ม) */
function surveySendVisitEffect(closesVisit) {
  const head = `ปิดนัด ${codeOf(closesVisit)} เป็น “${VISIT_STATUS_LABELS.done}” ไปพร้อมกัน`;
  const day = dayOf(closesVisit.actualDate);
  const start = timeOf(closesVisit.startTime);
  if (closesVisit.status === 'in_progress' && start) {
    return `${head} — ช่างยังไม่ได้กดส่งงาน · เก็บเวลาเริ่ม ${start} น. ที่ช่างกดไว้ ไม่ใส่เวลาจบให้`;
  }
  const who = closesVisit.status === 'in_progress' ? 'ช่างยังไม่ได้กดส่งงาน' : 'ช่างยังไม่เคยกดเริ่มงาน';
  return `${head} — ${who} · บันทึกวันเข้าเป็น ${day ? fmtDate(day) : 'วันนัด'} ไม่มีเวลาเข้าจริง`;
}

/** ข้อความ toast หลังส่งผลสำเร็จ — บอกผลกับนัดด้วย ("ส่งผลแล้ว" เฉย ๆ ไม่บอกว่านัดบนตารางช่างปิดแล้ว) */
export function surveySendDoneText(closedVisit = null) {
  return closedVisit
    ? `ส่งผลให้ฝ่ายขายแล้ว · ปิดนัด ${codeOf(closedVisit)} เป็น “${VISIT_STATUS_LABELS.done}”`
    : 'ส่งผลให้ฝ่ายขายแล้ว';
}

/**
 * ⭐ **toast หลังส่งผล เมื่อการส่งอาจออกเอกสารด้วย** (PR-3 · สเปก §3.5) — คืน `{ kind, msg }` (+ `duration` เมื่อไม่ใช่ค่าตั้งต้น)
 *
 * @param res                   คำตอบ 200 ของ route ส่งผล (`{ closedVisit, report }`)
 * @param opts.expectedDocument โมดัลบอกไว้ว่าการส่งครั้งนี้ออกเอกสาร (`view.send.issuesDocument`)
 *
 * · `report` ไม่มี/`off` และโมดัลไม่ได้สัญญาเอกสาร = ข้อความเดิม (`surveySendDoneText`)
 * · `report` ไม่มี/`off` แต่โมดัลสัญญาไว้ = สวิตช์ถูกปิดหลังเปิดหน้า (ถอยรุ่น) ⇒ เตือนว่าเอกสารยังไม่ออก พร้อมทางไปกดออกเอง
 * · `issued` = บอกเลข · `failed` = ส่งผลสำเร็จแต่เอกสารยังไม่ออก (เหตุอยู่ที่ส่วนเอกสารบนการ์ด)
 * ⚠️ มีแค่เลขกับนัด — ช่อง toast มีช่องเดียวและหายใน ~3.6 วิ · คำเตือนของเอกสารที่หัวหน้ายังไม่ได้อ่านไปอยู่ที่ส่วนเอกสาร (มติ 11 · 29)
 * ⚠️ **ค่าตั้งต้น = ไม่มีคีย์ `duration`** — `normalizeToast` แปลง `null` เป็น 0 มิลลิวินาที
 */
export function surveySendDoneToast(res, { expectedDocument = false } = {}) {
  const closedVisit = res?.closedVisit || null;
  const visitPart = closedVisit ? ` · ปิดนัด ${codeOf(closedVisit)} เป็น “${VISIT_STATUS_LABELS.done}”` : '';
  const report = res?.report;
  const docNo = typeof report?.docNo === 'string' ? report.docNo.trim() : '';
  if (report?.state === 'issued' && docNo) {
    return { kind: 'success', duration: 6000, msg: `ส่งผลให้ฝ่ายขายแล้ว · ออกเอกสาร ${docNo}${visitPart}` };
  }
  /* `issued` ที่ไม่มีเลข = ผลที่อ่านไม่ออก (ไม่ควรเกิด — `surveySendReport` ตอบ `failed` แทน) ⇒ ไม่อ้างว่าออกแล้ว */
  if (report?.state === 'failed' || report?.state === 'issued') {
    return {
      kind: 'warning', duration: 9000,
      msg: `ส่งผลให้ฝ่ายขายแล้ว · เอกสารยังไม่ออก — ดูเหตุที่ส่วน “เอกสารประเมินพื้นที่”${visitPart}`,
    };
  }
  if (expectedDocument === true) {
    return {
      kind: 'warning', duration: 9000,
      msg: `ส่งผลให้ฝ่ายขายแล้ว · เอกสารยังไม่ออก — กด “ออกเอกสาร” ที่ส่วน “เอกสารประเมินพื้นที่”${visitPart}`,
    };
  }
  return { kind: 'success', msg: surveySendDoneText(closedVisit) };
}

/**
 * บรรทัดในเธรดของนัด — คนเปิดนัดทีหลังต้องอ่านออกว่า **ใครปิด ปิดทางไหน และเวลาจริงมีแค่ไหน**
 * ⚠️ บอกตรง ๆ ว่าไม่มีเวลาจบ/ไม่มีเวลาเข้า — ช่องว่างบนนัดต้องมีคำอธิบาย ไม่งั้นอ่านเหมือนระบบทำหาย
 */
export function surveySendCloseBody(visit, user) {
  const who = String(user?.name ?? '').trim() || 'หัวหน้าฝ่ายบริการ';
  const start = timeOf(visit?.actualStartTime);
  const day = dayOf(visit?.actualDate);
  const facts = [VISIT_STATUS_LABELS.done];
  if (day) facts.push(`เข้าจริง ${fmtDate(day)}`);
  facts.push(start
    ? `เริ่ม ${start} น. (ไม่มีเวลาจบ: ช่างไม่ได้กดส่งงาน)`
    : 'ไม่มีเวลาเข้าจริง (ไม่เคยกดเริ่มงาน)');
  return `ปิดพร้อมส่งผล โดย ${who} — ${facts.join(' · ')}`;
}

/**
 * ปิดนัดตามคำตอบของ `surveySendVisitStep` — คืน `{ closed, error, status }`
 *
 * - `closed` = แถวนัดหลังปิด **เมื่อคำขอนี้เป็นคนปิด** (ผู้เรียกลงเธรด/audit ตามตัวนี้) · null = ไม่ได้ปิดเอง
 * - `error` + `status` (409 | 500) = ต้องหยุด **ก่อน** ตอบใบคำร้อง
 *
 * 🔑 **ปิดแบบมีเงื่อนไข** (`.in('status', …)`) — ช่างกด "ส่งงาน"/"ไปแล้วเข้าไม่ได้" ระหว่างที่หัวหน้ากดส่งผล
 *    ได้จริง · เขียนทับไม่ดูสถานะ = ทับ "ทำไม่ได้" ของช่างเป็น "เข้าแล้ว" เงียบ ๆ
 *    ได้ 0 แถว ⇒ อ่านใหม่: ช่างปิดเป็น "เข้าแล้ว" ไปก่อน = ไปต่อได้ (ผลเท่ากัน) · สถานะอื่น = 409 ให้โหลดใหม่
 * ⚠️ supabase ไม่ throw — ทุกคำสั่งตรวจ `{ error }` เอง
 */
export async function closeSurveyVisitForSend(supabase, { step, nowIso } = {}) {
  if (step?.action !== 'close') return { closed: null, error: null, status: null };
  const visit = step.visit;
  const code = codeOf(visit);
  const { data, error } = await supabase
    .from('service_visits')
    .update({ ...step.patch, updatedAt: nowIso })
    .eq('id', visit.id)
    .in('status', SEND_CLOSABLE_VISIT_STATES)
    .select();
  if (error) {
    return { closed: null, error: `ปิดนัด ${code} ไม่สำเร็จ — ยังไม่ได้ส่งผล กดส่งผลอีกครั้ง (${error.message})`, status: 500 };
  }
  if (Array.isArray(data) && data.length) return { closed: data[0], error: null, status: null };

  const { data: current, error: readError } = await supabase
    .from('service_visits').select('id, code, status').eq('id', visit.id).maybeSingle();
  if (readError) {
    return { closed: null, error: `อ่านนัด ${code} ไม่สำเร็จ — ยังไม่ได้ส่งผล (${readError.message})`, status: 500 };
  }
  if (current?.status === 'done') return { closed: null, error: null, status: null };
  return { closed: null, error: visitMovedError(code, current, 'ระหว่างที่กดส่งผล'), status: 409 };
}

/** ประโยค 409 ของ "นัดที่จอบอกว่าจะปิด ไม่ได้อยู่ในสภาพนั้นแล้ว" — ชุดเดียวของทั้งสองจังหวะ (ระหว่างกด · หลังเปิดหน้า) */
function visitMovedError(code, current, when) {
  const now = current ? `เปลี่ยนเป็น “${VISIT_STATUS_LABELS[current.status] || current.status}”` : 'ถูกลบ';
  return `นัด ${code} เพิ่ง${now} ${when} — ยังไม่ได้ส่งผล โหลดหน้าใหม่แล้วตรวจก่อนส่งอีกครั้ง`;
}

/**
 * นัดที่โมดัลสัญญาว่าจะปิด **ไม่ค้างแล้ว** ตอน server อ่าน — ไปต่อได้ไหม · คืน `{ error, status }` หรือ null
 *
 * 🐞 (รีวิว 24/09) เดิมเช็ค `closeVisitId` เฉพาะตอนยังมีนัดค้าง ⇒ นัดที่โมดัลบอกว่า "ปิดนัด SV-… เป็น “เข้าแล้ว”"
 *   กลายเป็น "ทำไม่ได้" (ช่างกดไปแล้วเข้าไม่ได้ ใบถอยไปลงคิว · ฝ่ายขายได้แจ้งว่ายังไม่ได้คำตอบ) **ก่อน** หัวหน้ากด
 *   ⇒ ไม่เจอนัดค้าง = ตอบใบไปเฉย ๆ · คำสัญญาของโมดัลไม่ถูกทำ และฝ่ายขายได้สองข้อความที่ขัดกัน
 * ⭐ อ่านนัดตัวนั้นใหม่ (ของใบนี้เท่านั้น) — **"เข้าแล้ว" = ไปต่อ** (ช่างส่งงานเอง หรือรอบก่อนของปุ่มนี้ปิดไว้แล้ว
 *   แต่ตอบใบล้ม ⇒ กดซ้ำต้องจบได้) · สถานะอื่น/หาไม่เจอ = 409 ประโยคเดียวกับจังหวะแข่งกันตอนปิด
 * ⚠️ supabase ไม่ throw — ตรวจ `{ error }` เอง
 */
async function namedVisitGoneError(supabase, { requestId, closeVisitId }) {
  const { data: current, error } = await supabase
    .from('service_visits').select('id, code, status')
    .eq('id', closeVisitId).eq('requestId', requestId).maybeSingle();
  if (error) {
    return { error: `อ่านนัด ${closeVisitId} ไม่สำเร็จ — ยังไม่ได้ส่งผล (${error.message})`, status: 500 };
  }
  if (current?.status === 'done') return null;
  return { error: visitMovedError(current?.code || closeVisitId, current, 'หลังเปิดหน้า'), status: 409 };
}

const SEND_ALREADY_ANSWERED = 'ใบนี้ถูกส่งผลไปแล้ว — โหลดหน้าใหม่เพื่อดูผลล่าสุด';
/* ประโยคเดียวของ "ใบที่จอเห็นไม่ใช่ใบที่ฐานถืออยู่ในเรื่องวิธีประเมิน" — ทั้งตอนจองแถวไม่ติด (`sendMissError`)
   และตอนสัดส่วนวิธีประเมินที่จอส่งมาไม่ตรงกับแถว (`surveySendMethodError`) */
export const SEND_METHOD_MOVED = 'วิธีประเมินของใบเปลี่ยนไปแล้ว — โหลดหน้าใหม่แล้วตรวจอีกครั้ง';

/**
 * 🔑 **ด่านส่งผลของใบที่มีพื้นที่จากแบบ** (งวด S2a · แผน survey-desk-assessment §3.2) — `null` = ผ่าน ·
 *    `{ status, error }` เมื่อจอส่งสัดส่วนวิธีประเมินไม่ตรงกับฐาน หรือยังไม่ได้เลือกว่าต้องยืนยันหน้างานไหม
 *
 * @param rows           แถวผลวัดทุกแถวของใบ (รวมที่ถูกตัด) — ชุดเดียวกับที่ด่านหกข้อใช้ตัดสิน
 * @param methodMix      `{ onsite, drawing }` ที่จอเห็นตอนเปิดโมดัล (`body.methodMix`) · ไม่ส่ง = จอรุ่นที่ไม่รู้จักวิธีประเมิน
 * @param surveyConfirm  คำตอบของหัวหน้า (`body.surveyConfirm`) — `'needed'` / `'not_needed'`
 *
 * ① จอส่งสัดส่วนมา แต่ไม่ตรงกับแถว            ⇒ 409 `SEND_METHOD_MOVED` (มีคนสลับวิธีหลังเปิดโมดัล — ด่านที่จอโชว์เป็นของวิธีเก่า)
 * ② ใบมีพื้นที่จากแบบ แต่จอไม่ได้ส่งสัดส่วนมา ⇒ 409 เดียวกัน (จอที่ไม่รู้ว่าใบมีพื้นที่จากแบบ ยังไม่ได้ถามคำถามนี้กับหัวหน้า)
 * ③ ใบมีพื้นที่จากแบบ และยังไม่ได้เลือก        ⇒ 400 `SURVEY_CONFIRM_MISSING`
 * ④ นอกนั้น `null` — **ใบลงหน้างานล้วนที่ไม่ส่งอะไรมา (ทุกจอของวันนี้) ผ่านเสมอ**
 * 🔴 ไม่อ่านสวิตช์ — ตัดสินจากแถว: ใบที่มีพื้นที่จากแบบไปแล้วต้องถูกถามแม้สวิตช์ถูกปิดทีหลัง
 * ⚠️ `surveyConfirm` เทียบตรงตัว — ค่าอื่น (`true` · `'yes'` · ว่าง) = ยังไม่ได้เลือก ไม่ถูกเดาเป็นคำตอบ
 */
export function surveySendMethodError(rows, { methodMix = null, surveyConfirm = null } = {}) {
  const mix = surveyMethodMix(rows);
  const seen = methodMix != null;
  if (seen && (Number(methodMix.onsite) !== mix.onsite || Number(methodMix.drawing) !== mix.drawing)) {
    return { status: 409, error: SEND_METHOD_MOVED };
  }
  if (mix.drawing === 0) return null;
  if (!seen) return { status: 409, error: SEND_METHOD_MOVED };
  if (!isConfirmChoice(surveyConfirm)) return { status: 400, error: SURVEY_CONFIRM_MISSING };
  return null;
}

/**
 * ท่อนต่อท้ายบรรทัดส่งผล (เธรด · กระดิ่ง · audit) — `''` เมื่อใบไม่มีพื้นที่จากแบบ (บรรทัดเดิมทุกตัวอักษร)
 *   จากแบบทั้งใบ ⇒ ` · ประเมินจากแบบทั้งใบ` · ผสม ⇒ ` · จากแบบ {k} พื้นที่ ({ชื่อพื้นที่จากแบบที่ยังใช้อยู่})`
 *   แล้วตามด้วย ` · ต้องยืนยันหน้างาน` / ` · ไม่ต้องยืนยันหน้างาน` (ค่าอื่น = ไม่ต่อ — route ตีกลับไปก่อนแล้ว)
 */
export function surveySendMethodText(rows, surveyConfirm) {
  const mix = surveyMethodMix(rows);
  if (mix.drawing === 0) return '';
  const names = (Array.isArray(rows) ? rows : [])
    .filter((row) => row && !isCut(row) && isDrawingZone(row)).map(surveyZoneName);
  const where = mix.onsite === 0
    ? ` · ${SURVEY_METHOD_LABEL.drawing}ทั้งใบ`
    : ` · จากแบบ ${mix.drawing} พื้นที่ (${surveyZoneNamesText(names)})`;
  return where + (isConfirmChoice(surveyConfirm) ? ` · ${SURVEY_CONFIRM_LABEL[surveyConfirm]}` : '');
}

/**
 * ประโยค 409 ของ "เขียนไม่ติดแถวที่ผูก `updatedAt` ไว้" — อ่านซ้ำแค่ `answeredAt` เพื่อเลือกประโยค
 *   ยังว่าง = แถวถูกแตะหลัง route อ่าน (สลับวิธีประเมิน) ⇒ ให้โหลดหน้าใหม่แล้วตรวจด่านของวิธีใหม่
 * ⚠️ อ่านซ้ำไม่สำเร็จ / ใบหายไป = ประโยคเดิม — ไม่กล่าวว่าวิธีประเมินเปลี่ยนตอนที่ไม่รู้ (supabase ไม่ throw)
 */
async function sendMissError(supabase, requestId) {
  const { data: current, error: readError } = await supabase
    .from('dept_requests').select('id, "answeredAt"').eq('id', requestId).maybeSingle();
  return !readError && current && !current.answeredAt ? SEND_METHOD_MOVED : SEND_ALREADY_ANSWERED;
}

/**
 * **จองแถวคำร้องให้การส่งผลครั้งนี้** — แตะ `updatedAt` เป็น `nowIso` เฉพาะแถวที่ยังไม่ตอบและยังถือ `expectUpdatedAt`
 *   คืน `null` = จองได้ · `{ error, status }` = ตีกลับ (ยังไม่ได้เขียนอะไร)
 * ⚠️ เขียนแค่ `updatedAt` — ไม่มีคอลัมน์ไหนของใบเปลี่ยนความหมาย · ล้มหลังจากนี้ ใบยังส่งผลซ้ำได้ (จอโหลดใหม่ได้ค่าใหม่)
 * ⚠️ supabase ไม่ throw — ตรวจ `{ error }` เอง
 */
async function claimRequestForSend(supabase, { requestId, expectUpdatedAt, nowIso }) {
  const { data, error } = await supabase
    .from('dept_requests').update({ updatedAt: nowIso })
    .eq('id', requestId).is('answeredAt', null).eq('updatedAt', expectUpdatedAt)
    .select('id').maybeSingle();
  if (error) return { error: error.message, status: 500 };
  if (data) return null;
  return { error: await sendMissError(supabase, requestId), status: 409 };
}

/**
 * 🔑 **ลำดับการเขียนทั้งหมดของปุ่มส่งผล** — ปิดนัด (ถ้ามี) **ก่อน** แล้วค่อยตอบใบ · คืน
 *   `{ request, closedVisit }` เมื่อสำเร็จ หรือ `{ error, status }` (ยังไม่ได้ตอบใบ ⇒ กดซ้ำได้เสมอ)
 *
 * ⭐ **ไม่มีสภาพครึ่งทางที่ผิดมติ** — ล้มหลังปิดนัดเหลือได้แค่ "นัดปิดแล้ว ใบยังไม่ตอบ" ซึ่งเท่ากับหลังช่างกด
 *    ส่งงานตามปกติ · กดส่งผลรอบสองไม่เจอนัดค้าง จึงตอบใบอย่างเดียวแล้วจบ ⇒ "ตอบแล้วแต่นัดยังเปิด" ไปไม่ถึง
 * ⚠️ ไม่ใช่ transaction (PostgREST ไม่มี) — ความปลอดภัยมาจาก **ลำดับ + เงื่อนไขในคำสั่ง** ไม่ใช่การย้อนกลับ
 *
 * @param open          นัดที่ยังกินสิทธิ์ของใบ (`findSurveyVisit(…, { openOnly: true })`) หรือ null
 * @param closeVisitId  รหัสนัดที่โมดัลยืนยันบอกผู้ใช้ว่าจะปิด (`send.closesVisit.id`) — ไม่ตรงกับนัดค้าง = 409 ·
 *                      นัดนั้นไม่ค้างแล้วและไม่ใช่ "เข้าแล้ว" (ทำไม่ได้ · ยกเลิก · เลื่อน · หาย) = 409 ให้โหลดใหม่
 * @param answerPatch   คอลัมน์ที่จะเขียนลงใบ (`answeredAt` · สถานะจาก `closureStatus` ฯลฯ) — ผู้เรียกประกอบ
 * @param onVisitClosed เรียก **ทันทีหลังปิดนัดสำเร็จ ก่อนตอบใบ** (เธรด/audit ของนัด) — ใบตอบไม่สำเร็จแล้วกดซ้ำ
 *                      รอบสองไม่ได้ปิดนัดเอง ⇒ ถ้าเลื่อนไปเขียนหลังตอบใบ บรรทัด "ปิดพร้อมส่งผล" จะหายถาวร
 * @param needsVisit    ใบนี้ต้องมีนัดไหม (`surveyNeedsVisit` ของแถวที่ด่านเพิ่งอ่าน) — ส่งต่อให้ `surveySendVisitStep` · บังคับส่ง
 * @param expectUpdatedAt `updatedAt` ของแถวคำร้อง **ตามที่ route อ่านมาก่อนอ่านด่าน** — ส่งผลได้เฉพาะแถวที่ยังถือค่านี้
 *                      🔑 เส้นสลับวิธีประเมินแตะ `updatedAt` ของใบเป็นก้าวแรก ⇒ สลับระหว่าง "อ่านด่าน" กับ "ตอบใบ"
 *                         = 409 แทนที่จะตอบด้วยด่านของวิธีเก่า
 *                      🔑 **จองแถวเป็นคำสั่งเขียนแรก** (`claimRequestForSend` — แตะ `updatedAt` เป็น `nowIso` แบบมีเงื่อนไข)
 *                         **ก่อนปิดนัด** ⇒ จองไม่ติด = ยังไม่ได้เขียนอะไรเลย กดซ้ำหลังโหลดใหม่ได้ · แล้วคำสั่งตอบใบผูกกับ
 *                         `nowIso` ที่เพิ่งจอง · 🐞 เดิมผูกเฉพาะคำสั่งตอบใบ (หลังปิดนัด) ⇒ ใบที่เพิ่งพลิกเป็นงานโต๊ะ
 *                         ได้นัด "เข้าแล้ว" ที่ไม่มีใครไป (ผิดแถว 17) แล้วเส้นสลับวิธีก็ยกเลิกนัดนั้นไม่เจออีก
 *                      ⚠️ หน้าต่างที่เหลือ (แถวถูกแตะระหว่างจองกับตอบใบ) = สภาพ "นัดปิดแล้ว ใบยังไม่ตอบ" แบบเดิม — ไม่ใช่ transaction
 *                      ⚠️ ทำเฉพาะเมื่อเป็นสตริงที่มีเนื้อ — ไม่ส่ง/แถวไม่มีค่า = คำสั่งเดิมทุกตัวอักษร ไม่มีคำสั่งจอง
 *                         (route ส่งมาเฉพาะตอนเปิดสวิตช์ `SURVEY_DRAWING_METHOD` — ปิดอยู่ไม่มีเส้นไหนสลับวิธีได้)
 */
export async function surveySendWrites(supabase, {
  requestId, open = null, closeVisitId = null, answerPatch, today = null, nowIso, onVisitClosed = null,
  needsVisit, expectUpdatedAt = null,
} = {}) {
  const step = surveySendVisitStep(open, { today, needsVisit });
  if (step.action === 'block') return { error: step.error, status: 409 };
  /* 🔑 **ผูกกับนัดที่โมดัลบอกไว้** — โมดัลเขียนว่า "ปิดนัด SV-… ไปพร้อมกัน" ⇒ ต้องเป็นนัดตัวนั้นจริง
     · จอที่โหลดไว้ก่อนมีนัดค้าง (หรือจอรุ่นก่อนมติที่ไม่รู้ว่าจะปิดนัด) ไม่ส่งรหัสมา ⇒ ต้องโหลดใหม่ให้เห็นก่อน
     · จอบอกนัดหนึ่ง แต่นัดนั้นไม่ค้างแล้ว (`none`) ⇒ อ่านนัดตัวนั้นใหม่: "เข้าแล้ว" = ไปต่อได้ (ผลเท่ากับที่
       จอสัญญา) · "ทำไม่ได้"/ยกเลิก/เลื่อน/หาย = 409 (`namedVisitGoneError`) — ใบต้องถอยไปลงคิว ไม่ใช่ตอบไปเฉย ๆ */
  if (step.action === 'close' && String(closeVisitId ?? '') !== String(step.visit.id)) {
    return { error: 'นัดของใบนี้เปลี่ยนไปหลังเปิดหน้า — โหลดหน้าใหม่แล้วกดส่งผลอีกครั้ง', status: 409 };
  }
  if (step.action === 'none' && closeVisitId != null && String(closeVisitId) !== '') {
    const gone = await namedVisitGoneError(supabase, { requestId, closeVisitId });
    if (gone) return gone;
  }

  /* 🔑 **จองแถวที่ด่านเพิ่งตัดสิน ก่อนเขียนอย่างอื่น** (ประเมินจากแบบ แถว 19 ②) — ดู `expectUpdatedAt`
     จองไม่ติด = ตีกลับตรงนี้ นัดยังไม่ถูกแตะ */
  const pinned = typeof expectUpdatedAt === 'string' && expectUpdatedAt !== '';
  if (pinned) {
    const claim = await claimRequestForSend(supabase, { requestId, expectUpdatedAt, nowIso });
    if (claim) return claim;
  }

  const closing = await closeSurveyVisitForSend(supabase, { step, nowIso });
  if (closing.error) return { error: closing.error, status: closing.status || 500 };
  const closedVisit = closing.closed;
  if (closedVisit && onVisitClosed) await onVisitClosed(closedVisit, step.visit);

  /* 🔑 **ตอบได้ครั้งเดียว** (`.is('answeredAt', null)`) — หัวหน้าสองคนกดพร้อมกันเคยได้ "ตอบแล้ว" สองรอบ
     (กระดิ่งถึงฝ่ายขายสองเด้ง ตัวเลขเดียวกัน) · คนที่มาช้าได้ 409 แทน */
  /* 🔑 **และต้องเป็นแถวที่เพิ่งจองไว้** (`.eq('updatedAt', nowIso)` · ประเมินจากแบบ แถว 19 ②) — ดู `expectUpdatedAt` */
  let answer = supabase
    .from('dept_requests').update(answerPatch).eq('id', requestId).is('answeredAt', null);
  if (pinned) answer = answer.eq('updatedAt', nowIso);
  const { data, error } = await answer.select().maybeSingle();
  if (error) {
    return {
      error: closedVisit
        ? `ปิดนัด ${codeOf(closedVisit)} แล้ว แต่ส่งผลไม่สำเร็จ — กดส่งผลอีกครั้ง (${error.message})`
        : error.message,
      status: 500,
      closedVisit,
    };
  }
  if (!data) {
    /* ตอบไม่ติดแถว — เมื่อจองไว้มีสองเหตุ: มีคนตอบไปก่อน หรือแถวถูกแตะหลังจอง ⇒ `sendMissError` เลือกประโยค
       ⚠️ ไม่ได้จอง = เหตุเดียว (ตอบไปแล้ว) ⇒ ไม่อ่านซ้ำ คำสั่งชุดเดิม */
    const miss = pinned ? await sendMissError(supabase, requestId) : SEND_ALREADY_ANSWERED;
    return { error: miss, status: 409, closedVisit };
  }
  return { request: data, closedVisit: closedVisit || null };
}

/**
 * 🔑 **ด่านส่งผล: พื้นที่ลงหน้างานต้องมีนัดที่เข้าพื้นที่จริง** (ประเมินจากแบบ แถว 17a) — `null` = ผ่าน ·
 *    ข้อความ 409 เมื่อใบยังมีพื้นที่ลงหน้างาน แต่ไม่มีนัดไหนของใบไปถึงไซต์
 *
 * 🐞 ปิดรูเดิม: พิมพ์ขนาดจากโต๊ะ แนบไฟล์อะไรก็ได้เป็น "ภาพกว้าง" แล้วส่งเป็นงานลงหน้างานทั้งที่ไม่มีใครไป —
 *    `surveySendVisitStep` ตอบ `none` ทั้งตอนไม่มีนัดและตอนนัด "ทำไม่ได้/ยกเลิก" และไม่มีด่านไหนถามต่อ
 *    ⇒ เมื่อมีทางที่ซื่อตรง (สลับพื้นที่เป็นประเมินจากแบบ) ทางอ้อมนี้ต้องปิด · ประโยคบอกทางออกทั้งสองทาง
 *
 * @param rows         แถวผลวัดทุกแถวของใบ (รวมที่ถูกตัด)
 * @param reachedSite  ใบมีนัดที่ **เข้าพื้นที่แล้ว** (เข้าแล้ว · ทำไม่ครบ) อย่างน้อยหนึ่งนัด
 * @param closesVisit  การส่งผลครั้งนี้ปิดนัดที่ยังเปิดเป็น "เข้าแล้ว" (`surveySendVisitStep(...).action === 'close'`)
 *
 * ผ่านเมื่อ: ใบไม่ต้องมีนัด (`surveyNeedsVisit`) · ไม่เหลือพื้นที่ลงหน้างานที่ยังใช้อยู่ (ตัดหมดทั้งใบ — ไม่มีอะไรให้ไปวัด)
 *   · มีนัดที่เข้าพื้นที่แล้ว · หรือส่งผลนี้ปิดนัดให้
 * ⚠️ เอ่ยเฉพาะ **พื้นที่ลงหน้างานที่ยังใช้อยู่** สามชื่อแรก ที่เหลือนับเป็น "และอีก n พื้นที่" — พื้นที่จากแบบไม่ใช่เหตุ
 * 🔴 **ไม่อ่านสวิตช์ `SURVEY_DRAWING_METHOD` เอง** — ไฟล์นี้ถูก import จากจอ · route เป็นคนเลือกว่าจะถามด่านนี้ไหม
 *    (เปิดพร้อมปุ่มสลับวิธี: วันที่มีคำปฏิเสธ ต้องมีทางออกให้กดด้วย)
 */
export function surveySendSiteVisitError(rows, { reachedSite = false, closesVisit = false } = {}) {
  if (reachedSite || closesVisit) return null;
  if (!surveyNeedsVisit(rows) || surveyMethodMix(rows).onsite === 0) return null;
  const names = rows.filter((row) => row && !isCut(row) && !isDrawingZone(row)).map(surveyZoneName);
  const more = names.length > 3 ? ` และอีก ${names.length - 3} พื้นที่` : '';
  return `ใบนี้มีพื้นที่ลงหน้างาน (${names.slice(0, 3).join(' · ')}${more}) แต่ยังไม่มีนัดที่เข้าพื้นที่ — ลงคิวก่อน หรือเปลี่ยนพื้นที่นั้นเป็นประเมินจากแบบ`;
}

/* ══ ส่งผล = ออกเอกสารประเมินด้วย (PR-2 §2 · สวิตช์ `SURVEY_REPORT_ISSUE_AT_SEND`) ══════════════════
 *
 * ⭐ **คำตัดสินและข้อความของ route ส่งผลอยู่ที่นี่** (ตรรกะล้วน เทสต์ได้) — route แค่อ่าน เรียก แล้วตอบ
 * 🔴 **ตีกลับได้เฉพาะก่อนเขียน** — นัดถูกปิดก่อนตอบใบ (`surveySendWrites`) ⇒ หลังจุดนั้นเรื่องของเอกสารไม่มีสิทธิ์ทำให้
 *    การส่งผลล้ม: ผลออกเอกสารกลับไปใน `report` ของคำตอบ 200 เท่านั้น
 * 🔴 **ปัญหาของใบ = ตีกลับ · ปัญหาของระบบ = ไม่ตีกลับ** (มติเจ้าของ 01/10 ข้อ 2) — รูปเปิดไม่ได้/หายจาก Drive · หน้าล้น ·
 *    ไม่มีนัดที่ปิด ตีกลับตอนที่ใบยังแก้ได้ · Drive ล่ม · ที่เก็บ · ข้อมูลบริษัท/แบบฟอร์ม ไม่ตีกลับ (ออกเอกสารตามทีหลังได้)
 */

/** งบเวลาของรอบตรวจรูปก่อนส่งผล (S3) — รอบเติมหลังล็อกมีงบของตัวเอง (`SURVEY_REPORT_IMAGE_BUDGET_MS.send`) */
export const SURVEY_SEND_PREFLIGHT_MS = 60_000;

/** S2 — จอที่โหลดไว้ก่อนเปิดสวิตช์ไม่รู้ว่าการส่งผลออกเอกสารด้วย (ไม่ส่ง `seenWarnings`) ⇒ ต้องโหลดใหม่ให้เห็นก่อนกด */
export const SURVEY_SEND_OLD_PAGE_ERROR = 'หน้านี้เป็นรุ่นเก่า — โหลดหน้าใหม่ก่อนส่งผล (การส่งผลจะออกเอกสาร SU ด้วย)';

/** S5 ข้อ 2 — server เจอคำเตือนที่จอไม่ได้กางให้หัวหน้าอ่าน (หมายเหตุถูกแก้หลังเปิดหน้า) */
export const SURVEY_SEND_WARNINGS_CHANGED_ERROR = 'ข้อความบนเอกสารเปลี่ยนไปหลังเปิดหน้า — โหลดหน้าใหม่แล้วอ่านคำเตือนก่อนส่งอีกครั้ง';

/** S8 — ขั้นออกเลขไม่คืนผล (โหลดโมดูลไม่ได้ · โยนทั้งที่สัญญาว่าไม่โยน) · คำเดียวกับเหตุ `internal` ของขั้นออกเลข */
export const SURVEY_SEND_REPORT_FAILED = 'ออกเอกสารไม่สำเร็จ — กดออกเอกสารอีกครั้ง ถ้ายังไม่ได้ให้แจ้งผู้ดูแลระบบ';

/** ผลของเอกสารเมื่อสวิตช์ปิด — จอรุ่นเก่าไม่อ่านคีย์นี้ (อ่านแค่ `closedVisit`) */
export const SURVEY_SEND_REPORT_OFF = Object.freeze({ state: 'off' });

/**
 * คำเตือนที่ server คิดได้ **แต่จอไม่ได้ส่งกลับมา** ใน `seenWarnings` — ว่าง = หัวหน้าเห็นครบทุกข้อแล้ว
 * ⚠️ เทียบสตริงตรงตัว (ไม่ตัดช่องว่าง ไม่เทียบบางส่วน) — จอส่งลิสต์ของ `document.send.warnings` กลับมาทั้งก้อน ·
 *    คำเตือนที่หายไปแล้ว (หัวหน้าแก้หมายเหตุ) ไม่ใช่เหตุให้ตีกลับ: ตีกลับเฉพาะข้อที่ **ยังไม่เคยเห็น**
 */
export function surveySendUnseenWarnings(warnings, seenWarnings) {
  const seen = new Set(textList(seenWarnings));
  return textList(warnings).filter((line) => !seen.has(line));
}

/* ท่อนตายตัวของประโยค S3 (ระหว่างจำนวนรูปกับรายชื่อไฟล์) — ตัวสร้างกับตัวจำ (`surveySendRefusalKeeps`) ใช้ค่าคงที่เดียวกัน
   ⇒ แก้ถ้อยคำของประโยคเมื่อไร ตัวจำตามไปเอง ไม่เงียบหาย */
const IMAGE_REFUSAL_FIXED = ' รูปเปิดไม่ได้ — อัปใหม่เป็น JPG แล้วส่งอีกครั้ง (ชื่อไฟล์ ';

/**
 * S3 — ประโยค 409 ของรูปที่ **ตัวไฟล์เองเปิดไม่ได้** (`permanent`) หรือ `null` เมื่อไม่มี
 * @param failed `failed` ของ `prepareSurveyReportImages` (`[{ attId, fileName, reason, permanent }]`)
 * ⚠️ ไฟล์ที่ล้มแบบชั่วคราว (Drive ช้า · อัปไม่ขึ้น · หมดงบเวลา · โหลดตัวย่อรูปไม่ได้) ไม่นับ — ไม่ใช่เหตุให้ตีกลับ
 */
export function surveySendImageRefusal(failed) {
  const broken = (Array.isArray(failed) ? failed : []).filter((f) => f?.permanent === true);
  if (!broken.length) return null;
  const names = [...new Set(broken.map((f) => String(f.fileName || f.attId || 'ไฟล์ไม่มีชื่อ')))];
  return `รูป ${broken.length}${IMAGE_REFUSAL_FIXED}${names.join(' · ')}) · ยังไม่ได้ส่งผล`;
}

/**
 * ⭐ **การตีกลับที่การ์ดต้องเก็บไว้ให้อ่านหลังปิดโมดัล** (PR-3 · สเปก §3.5) — วันนี้มีข้อเดียว: รูปเปิดไม่ได้ (S3) ซึ่งพกรายชื่อไฟล์
 *   ที่ต้องอัปใหม่ · โมดัลล้างข้อความของตัวเองตอนปิด ⇒ ไม่เก็บ = หัวหน้าต้องจำชื่อไฟล์เองระหว่างเดินไปแก้
 * ⚠️ การตีกลับอื่น (หน้ารุ่นเก่า · คำเตือนเปลี่ยน · เอกสารออกไม่ได้ · นัด) **ไม่เก็บ** — โหลดใหม่แล้วจอวาดเหตุเหล่านั้นจาก GET เองได้
 * @param message ข้อความ error ของคำขอส่งผล (`e.message`)
 */
export function surveySendRefusalKeeps(message) {
  if (typeof message !== 'string') return false;
  const count = /^รูป \d+/.exec(message)?.[0];
  return !!count && message.startsWith(`${count}${IMAGE_REFUSAL_FIXED}`);
}

/* ท่อนตายตัวของประโยค S5 ข้อ 3 — ตัวสร้างประโยค (`surveySendDocumentRefusal`) กับรูป "หัว + รายการ" ของจอ
   (`surveySendDocumentRefusalList`) ใช้ค่าคงที่ชุดเดียวกัน ⇒ แก้ถ้อยคำเมื่อไร สองรูปตามกันเอง */
const DOCUMENT_REFUSAL_HEAD = 'ออกเอกสารไม่ได้ — ';
const DOCUMENT_REFUSAL_TAIL = ' · ยังไม่ได้ส่งผล';
function documentRefusalTexts(blockers) {
  return [...new Set((Array.isArray(blockers) ? blockers : [])
    .filter((b) => b?.kind === 'content')
    .map((b) => String(b.text ?? '').trim())
    .filter(Boolean))];
}

/**
 * S5 ข้อ 3 — ประโยค 409 ของเหตุที่เอกสารออกไม่ได้ **เพราะเนื้อของใบ** หรือ `null`
 * @param blockers `blockers` ของ `surveyReportPrecheck` (`[{ kind: 'content' | 'system', text }]`)
 * 🔴 ชนิด `system` ถูกข้าม — ข้อมูลบริษัท/แบบฟอร์ม/การอ่านที่ล้ม ไม่ขวางผลประเมินไปถึงฝ่ายขาย
 */
export function surveySendDocumentRefusal(blockers) {
  const texts = documentRefusalTexts(blockers);
  return texts.length ? `${DOCUMENT_REFUSAL_HEAD}${texts.join(' | ')}${DOCUMENT_REFUSAL_TAIL}` : null;
}

/**
 * ⭐ **ประโยคเดียวกับ `surveySendDocumentRefusal` ในรูปที่จอวาดเป็นข้อ ๆ** — `{ lead, items }` หรือ `null` (ไม่มีเหตุของเนื้อใบ)
 * 🐞 UAT PR-3 (S03 · S09 · S15): ประโยคของ route ต่อเหตุด้วย " | " — บนการ์ดกว้าง 298px เหตุสองข้อยาวสามบรรทัดอ่านเป็นก้อนเดียว
 *    แยกไม่ออกว่ามีกี่ข้อ ⇒ จอวาด `lead` ("… ติด n ข้อ …") แล้วตามด้วย `items` ทีละข้อ · ประโยคเต็มของ route ไม่เปลี่ยนสักตัวอักษร
 *    (เป็นข้อความ 409 ของเส้นส่งผล และ `send.reason.detail` ของการ์ด)
 * @param blockers `[{ kind, text }]` ชุดเดียวกับที่ส่งให้ `surveySendDocumentRefusal` — ชนิด `system` ถูกข้ามเหมือนกัน
 */
export function surveySendDocumentRefusalList(blockers) {
  const items = documentRefusalTexts(blockers);
  return items.length
    ? { lead: `${DOCUMENT_REFUSAL_HEAD}ติด ${items.length} ข้อ${DOCUMENT_REFUSAL_TAIL}`, items }
    : null;
}

/**
 * S7 — **ตัวเลขที่ฝ่ายขายถืออยู่** = ยอดของรอบที่ตอบล่าสุด · คืน `totals` หรือ `null` (ส่งรอบแรก = ไม่มีอะไรให้เทียบ)
 * @param rows แถวเธรดของคำร้อง ชนิด `answer` กับ `recall` **ใหม่ก่อน**
 *
 * ⭐ แถวแรกที่พก `meta.totals`: แถว `answer` ของ PR-2 พกยอดที่ส่งออกไป · แถว `recall` พกยอด ณ ตอนดึงกลับ (เท่ากัน —
 *    ระหว่างสองจังหวะนั้นใบล็อก) ⇒ ใบที่ถูกเปิดกลับด้วย "ยังไม่จบ" (ไม่มีแถว `recall`) ก็ยังเทียบกับรอบที่ส่งไปจริง
 * ⚠️ แถว `answer` ก่อน PR-2 ไม่มียอด ⇒ ข้ามไปหาแถว `recall` ถัดไป (พฤติกรรมเดิม)
 * 🔴 เอกสาร SU ไม่ใช่แหล่งของยอด — รอบที่ตอบโดยไม่มีเอกสาร (สวิตช์ปิด · ออกเอกสารล้ม) มีได้ ⇒ เทียบกับเอกสารฉบับก่อน
 *    = บอกฝ่ายขายถึงตัวเลขที่เขาไม่ได้ถืออยู่แล้ว
 */
export function surveySendDiffBaseline(rows) {
  for (const row of Array.isArray(rows) ? rows : []) {
    const totals = row?.meta?.totals;
    if (totals && typeof totals === 'object' && !Array.isArray(totals)) return totals;
  }
  return null;
}

/**
 * S9 — ผลของขั้นออกเลข (`issueSurveyReport`) → คีย์ `report` ของคำตอบ
 *   `{ state: 'issued', docNo, rev, reused, warnings }` | `{ state: 'failed', code, reason, retry }`
 * 🔴 **หยิบทีละคีย์ ห้าม spread** — ผลของขั้นออกเลขพก id ของแถวเอกสาร (= ที่อยู่ไฟล์ PDF) ซึ่งห้ามออก payload
 * ⚠️ ผลที่อ่านไม่ออก (null · ไม่มีเลข) = `failed` ที่กดออกเอกสารซ้ำได้ — การส่งผลสำเร็จไปแล้ว ไม่มีทางตอบว่า "ออกแล้ว" โดยไม่มีเลข
 */
export function surveySendReport(result) {
  const docNo = typeof result?.docNo === 'string' ? result.docNo.trim() : '';
  if (result?.state === 'issued' && docNo) {
    return {
      state: 'issued',
      docNo,
      rev: Number.isInteger(result.rev) ? result.rev : null,
      reused: result.reused === true,
      warnings: textList(result.warnings),
    };
  }
  const known = result?.state === 'failed';
  return {
    state: 'failed',
    code: (known && typeof result.code === 'string' && result.code) || 'internal',
    reason: (known && typeof result.reason === 'string' && result.reason.trim()) || SURVEY_SEND_REPORT_FAILED,
    retry: known ? result.retry === true : true,
  };
}
