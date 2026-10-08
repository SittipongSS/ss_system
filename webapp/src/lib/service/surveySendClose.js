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
// 🔴 **ไม่ประทับเวลาจบเป็นเวลาที่กดส่งผล** — วันส่งผล ≠ วันเข้าพื้นที่ (มติ 21/09) ห่างกันได้หลายวัน
//    ⇒ เวลาจบ "ตอนนี้" = ชั่วโมงงานเพี้ยน และถ้าเช้ากว่าเวลาเริ่ม ฐานตีกลับ · เก็บเวลาที่ช่างประทับไว้จริงเท่านั้น
// 🔴 **ปิดเป็น "เข้าแล้ว" อย่างเดียว** — จอประเมินไม่มี "ทำไม่ครบ" (พื้นที่ที่วัดไม่ได้ใช้ "ตัดพื้นที่นี้ออก")
//    และนัดที่ "ทำไม่ได้" ผ่านด่านส่งผลไม่ได้อยู่แล้ว (ไม่มีขนาด/รูป) · ห้ามเดาเป็นสถานะอื่น
import { fmtDate } from '@/lib/format';
import { VISIT_STATUS_LABELS, isOpenVisit } from './visitStatus';

/** สถานะที่ส่งผลปิดให้ได้ — ชุดเดียวกับ `isOpenVisit` (เงื่อนไขของคำสั่ง update ต้องตรงกับตัวตัดสิน) */
export const SEND_CLOSABLE_VISIT_STATES = ['scheduled', 'in_progress'];

const codeOf = (visit) => visit?.code || visit?.id || 'นัด';
const dayOf = (value) => (value ? String(value).slice(0, 10) : null);
const timeOf = (value) => (value ? String(value).slice(0, 5) : null);
/* ลิสต์ข้อความที่มาจากนอกไฟล์ (body ของคำขอ · ผลของตัวตรวจ) — เก็บเฉพาะสตริงที่มีเนื้อ ไม่ตัด ไม่แก้ตัวอักษร */
const textList = (value) => (Array.isArray(value) ? value : []).filter((t) => typeof t === 'string' && t.trim() !== '');

/**
 * ส่งผลแล้วนัดของใบจะเป็นยังไง — คืน `{ action: 'none' | 'block' | 'close', ... }`
 *
 * @param visit   นัดที่ **ยังกินสิทธิ์ของใบ** (`findSurveyVisit(…, { openOnly: true })`) หรือ null
 * @param today   วันไทยวันนี้ `YYYY-MM-DD` (`businessDate()` ของผู้เรียก — ไฟล์นี้ไม่อ่านนาฬิกาเอง)
 *
 * - `none`  — ไม่มีนัดค้าง / นัดปิดไปแล้ว (เข้าแล้ว · ทำไม่ได้ · ยกเลิก · เลื่อนแล้ว) ⇒ ไม่แตะนัด
 * - `block` — นัดยังเป็น **ร่าง** (ยังไม่ขึ้นตารางช่าง) ⇒ ส่งผลไม่ได้ พร้อมทางออก
 *   ⚠️ ปิดร่างเป็น "เข้าแล้ว" = บันทึกว่าไปหน้างานทั้งที่นัดไม่เคยขึ้นตารางใคร · ยกเลิกร่างให้เอง = ตัดสินแทนผู้จัดคิว
 * - `close` — นัดนัดไว้/กำลังทำ ⇒ ปิดเป็น "เข้าแล้ว" ไปพร้อมกัน · `patch` ไม่มีคีย์เวลาเลย (เวลาที่ช่างประทับไว้อยู่ครบ)
 *   · วันเข้าจริง = ที่ช่างกดเริ่มไว้ · ไม่เคยกดเริ่ม = วันนัด (วันนัดยังไม่มาถึง = วันนี้ — ไปวัดก่อนวันนัด)
 */
export function surveySendVisitStep(visit, { today = null } = {}) {
  if (!visit) return { action: 'none', visit: null };
  const code = codeOf(visit);
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
 */
export function surveySendConfirm({
  docNo = null, closesVisit = null, sendBackPending = null, sizeReview = null,
  issuesDocument = false, replacesDocNo = null, warnings = null, documentUnknown = false,
} = {}) {
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
  if (closesVisit) effects.push(surveySendVisitEffect(closesVisit));
  /* ⭐ ส่งผล = ออกเอกสารประเมินด้วย (PR-2) — เลขเอกสารถาวร แก้ไม่ได้หลังออก ⇒ ต้องอยู่ในรายการผลก่อนกด (#1223)
     · คำเตือนของข้อความบนฉบับลูกค้าตามมาทีละข้อ: หัวหน้าอ่านแล้วส่งต่อ หรือปิดกล่องกลับไปแก้ */
  if (issuesDocument) {
    const replaced = String(replacesDocNo ?? '').trim();
    effects.push((replaced
      ? `ออกเอกสารประเมินฉบับใหม่ (Rev ถัดไป) แทน ${replaced} ที่ใช้ไม่ได้แล้ว`
      : 'ออกเอกสารประเมิน (เลข SU) ไปพร้อมกัน')
      + ' — ฝ่ายขายดาวน์โหลดฉบับลูกค้าได้ที่หน้าคำร้อง · เอกสารที่ออกแล้วแก้ไม่ได้ (แก้ = ดึงผลกลับแล้วส่งใหม่เป็น Rev ถัดไป)');
  }
  for (const line of [...new Set(textList(warnings))]) effects.push(`ฉบับลูกค้าจะพิมพ์ตามที่กรอกไว้ — ${line}`);
  if (documentUnknown === true) {
    effects.push('อ่านสถานะเอกสารประเมินไม่สำเร็จ — ถ้าระบบเปิดออกเอกสารตอนส่งผลอยู่ การส่งครั้งนี้จะออกเลข SU ด้วย');
  }
  effects.push('ใบจะจบเมื่อฝ่ายขายกด “ปิดเรื่อง”');
  return { effects, confirmLabel: closesVisit ? 'ส่งผลและปิดนัด' : 'ส่งผล' };
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
 */
export async function surveySendWrites(supabase, {
  requestId, open = null, closeVisitId = null, answerPatch, today = null, nowIso, onVisitClosed = null,
} = {}) {
  const step = surveySendVisitStep(open, { today });
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

  const closing = await closeSurveyVisitForSend(supabase, { step, nowIso });
  if (closing.error) return { error: closing.error, status: closing.status || 500 };
  const closedVisit = closing.closed;
  if (closedVisit && onVisitClosed) await onVisitClosed(closedVisit, step.visit);

  /* 🔑 **ตอบได้ครั้งเดียว** (`.is('answeredAt', null)`) — หัวหน้าสองคนกดพร้อมกันเคยได้ "ตอบแล้ว" สองรอบ
     (กระดิ่งถึงฝ่ายขายสองเด้ง ตัวเลขเดียวกัน) · คนที่มาช้าได้ 409 แทน */
  const { data, error } = await supabase
    .from('dept_requests').update(answerPatch).eq('id', requestId).is('answeredAt', null)
    .select().maybeSingle();
  if (error) {
    return {
      error: closedVisit
        ? `ปิดนัด ${codeOf(closedVisit)} แล้ว แต่ส่งผลไม่สำเร็จ — กดส่งผลอีกครั้ง (${error.message})`
        : error.message,
      status: 500,
      closedVisit,
    };
  }
  if (!data) return { error: 'ใบนี้ถูกส่งผลไปแล้ว — โหลดหน้าใหม่เพื่อดูผลล่าสุด', status: 409, closedVisit };
  return { request: data, closedVisit: closedVisit || null };
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
