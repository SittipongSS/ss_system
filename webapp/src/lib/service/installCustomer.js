// ── ฝ่ายขายคอนเฟิร์มนัดติดตั้งกับลูกค้า (ขั้นเข้าติดตั้ง PR-4 · ม็อก A5 · mig 0425) — ตัวตัดสินล้วน ─────────────
//
// ⭐ มติเจ้าของ 09/11/2026 (N4): TS ยืนยันวันแล้ว ฝ่ายขายต้องโทรคอนเฟิร์มลูกค้า **ทุกครั้ง** — คำตอบมีสองทาง
//    · "ลูกค้ายืนยันวันนี้" → ประทับร่องรอย (`customerConfirmed*`) แล้วเลื่อนร่างขึ้นตารางช่างในคำสั่งเดียวถ้าด่านผ่าน
//      (ด่านติดตอนนั้น เช่นบัญชีถอนคำรับรอง = นัดคงเป็นร่าง พร้อมเหตุและเจ้าของเรื่อง)
//    · "ลูกค้าขอเปลี่ยนวัน" → วันใหม่ + ช่วงเวลา + เหตุ ลงคำขอ (`requestedAt` เดิน) ⇒ ขั้นกลับไป "รอ TS ยืนยันวัน"
//      (`installReaskedAfterConfirm`) · นัดร่างเดิมคงอยู่ TS ยืนยันวันใหม่บนนัดเดิม (โซน/เครื่องที่วางไว้ไม่หาย)
// ⭐ "คุยกับ" บังคับทั้งสองทาง (ม็อก A5) — ลงเธรดของนัด ไม่มีคอลัมน์ (คนที่รับสายไม่ใช่ผู้ติดต่อหน้างานเสมอไป)
// ⚠️ ทำได้เฉพาะนัด **ร่าง** — ขึ้นตารางแล้วเปลี่ยนวันเป็นงานของ TS (เลื่อนนัดพร้อมเหตุที่หน้าจัดคิว · กติกาเดิม)
// ⚠️ ตัวเดียวที่โมดัลบนใบสั่งขายและ API ถาม — ปุ่มกับ API ตอบคำเดียวกัน
import { fmtDate } from '@/lib/format';
import { installReaskedAfterConfirm } from './visitGate';
import { isDraftVisit } from './visitStatus';

export const INSTALL_CUSTOMER_ACTIONS = Object.freeze(['confirm', 'reschedule']);
export const INSTALL_CUSTOMER_LIMITS = Object.freeze({ contactName: 150, contactPhone: 40, note: 1000, reason: 500 });

export const INSTALL_CUSTOMER_TEXT = Object.freeze({
  actionInvalid: 'เลือกคำตอบของลูกค้า: ยืนยันวันนี้ หรือ ขอเปลี่ยนวัน',
  visitMissing: 'ไม่พบนัดติดตั้งนี้ในไซต์ของใบสั่งขาย — โหลดหน้าใหม่',
  notDraft: 'นัดนี้ขึ้นตารางช่างแล้ว — เปลี่ยนวันได้ทาง TS (เลื่อนนัดพร้อมเหตุที่หน้าจัดคิว)',
  notTsConfirmed: 'TS ยังไม่ยืนยันวันของนัดนี้',
  reasked: 'ขอเปลี่ยนวันไปแล้ว — รอ TS ยืนยันวันใหม่ก่อน',
  alreadyConfirmed: 'คอนเฟิร์มลูกค้าแล้ว — นัดยังติดด่านข้ออื่น ให้ TS ปล่อยขึ้นตารางที่หน้าจัดคิว',
  contactRequired: 'ระบุชื่อคนที่คุยด้วย',
  contactLong: 'ชื่อคนที่คุยด้วยยาวเกิน 150 ตัวอักษร',
  phoneLong: 'เบอร์ติดต่อยาวเกิน 40 ตัวอักษร',
  noteLong: 'หมายเหตุยาวเกิน 1000 ตัวอักษร',
  dateRequired: 'ระบุวันใหม่ที่ลูกค้าต้องการ',
  dateInvalid: 'รูปแบบวันที่ไม่ถูกต้อง',
  datePast: 'วันใหม่ต้องไม่ก่อนวันนี้',
  timeInvalid: 'เวลาไม่ถูกต้อง (ชั่วโมง:นาที)',
  timePair: 'ระบุช่วงเวลาให้ครบทั้งเริ่มและจบ หรือเว้นว่างทั้งคู่ (ทั้งวัน)',
  timeOrder: 'เวลาเริ่มต้องก่อนเวลาจบ',
  sameSlot: 'วันและเวลาใหม่เหมือนที่ TS ยืนยันไว้ — ถ้าลูกค้าตกลงตามนี้ ให้เลือก "ลูกค้ายืนยันวันนี้"',
  reasonRequired: 'ใส่เหตุที่ลูกค้าขอเปลี่ยนวันอย่างน้อย 5 ตัวอักษร (TS เห็นตอนยืนยันวันใหม่)',
  reasonLong: 'เหตุที่ขอเปลี่ยนวันยาวเกิน 500 ตัวอักษร',
});

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const text = (value) => String(value ?? '').trim();
const charCount = (value) => [...String(value ?? '')].length;
const hhmm = (value) => text(value).slice(0, 5);

/**
 * นัดนี้รับคำตอบของลูกค้าได้ไหม — `null` = ได้ · ข้อความ = เหตุที่ไม่ได้ (ปุ่มบนการ์ดกับ API ใช้ตัวนี้)
 * @param visit   นัดติดตั้ง (status · installRequestId · tsConfirmedAt · customerConfirmedAt)
 * @param request คำขอติดตั้งของไซต์ (id · requestedAt)
 * @param action  'confirm' | 'reschedule'
 */
export function installCustomerVisitError(visit, request, action = 'confirm') {
  if (!INSTALL_CUSTOMER_ACTIONS.includes(action)) return INSTALL_CUSTOMER_TEXT.actionInvalid;
  if (!visit || !request || visit.installRequestId !== request.id) return INSTALL_CUSTOMER_TEXT.visitMissing;
  if (!isDraftVisit(visit)) return INSTALL_CUSTOMER_TEXT.notDraft;
  if (!visit.tsConfirmedAt) return INSTALL_CUSTOMER_TEXT.notTsConfirmed;
  if (installReaskedAfterConfirm(request, visit)) return INSTALL_CUSTOMER_TEXT.reasked;
  if (action === 'confirm' && visit.customerConfirmedAt) return INSTALL_CUSTOMER_TEXT.alreadyConfirmed;
  return null;
}

/* คุยกับใคร (บังคับ) · เบอร์ · หมายเหตุ — ทั้งสองคำตอบถามชุดนี้ */
function contactOf(body) {
  const contactName = text(body?.contactName);
  const contactPhone = text(body?.contactPhone);
  const note = text(body?.note);
  if (!contactName) return { error: INSTALL_CUSTOMER_TEXT.contactRequired };
  if (charCount(contactName) > INSTALL_CUSTOMER_LIMITS.contactName) return { error: INSTALL_CUSTOMER_TEXT.contactLong };
  if (charCount(contactPhone) > INSTALL_CUSTOMER_LIMITS.contactPhone) return { error: INSTALL_CUSTOMER_TEXT.phoneLong };
  if (charCount(note) > INSTALL_CUSTOMER_LIMITS.note) return { error: INSTALL_CUSTOMER_TEXT.noteLong };
  return { value: { contactName, contactPhone: contactPhone || null, note: note || null } };
}

/**
 * ตรวจคำตอบ → `{ value, error }`
 * @param body  `{ action, contactName, contactPhone?, note?, requestedDate?, requestedStartTime?, requestedEndTime?, changeReason? }`
 * @param visit นัดที่ TS ยืนยัน (ใช้เทียบว่าวันใหม่ไม่ใช่ช่องเดิม)
 */
export function installCustomerInput(body = {}, { visit = null, todayIso = null } = {}) {
  const action = text(body?.action);
  if (!INSTALL_CUSTOMER_ACTIONS.includes(action)) return { error: INSTALL_CUSTOMER_TEXT.actionInvalid };
  const contact = contactOf(body);
  if (contact.error) return contact;
  if (action === 'confirm') return { value: { action, ...contact.value } };

  const requestedDate = text(body.requestedDate);
  if (!requestedDate) return { error: INSTALL_CUSTOMER_TEXT.dateRequired };
  if (!DATE_RE.test(requestedDate) || Number.isNaN(Date.parse(`${requestedDate}T00:00:00Z`))) return { error: INSTALL_CUSTOMER_TEXT.dateInvalid };
  if (todayIso && requestedDate < todayIso) return { error: INSTALL_CUSTOMER_TEXT.datePast };
  const start = hhmm(body.requestedStartTime);
  const end = hhmm(body.requestedEndTime);
  if ((start && !TIME_RE.test(start)) || (end && !TIME_RE.test(end))) return { error: INSTALL_CUSTOMER_TEXT.timeInvalid };
  if (Boolean(start) !== Boolean(end)) return { error: INSTALL_CUSTOMER_TEXT.timePair };
  if (start && end && start >= end) return { error: INSTALL_CUSTOMER_TEXT.timeOrder };
  if (visit && requestedDate === text(visit.scheduledDate) && start === hhmm(visit.startTime) && end === hhmm(visit.endTime)) {
    return { error: INSTALL_CUSTOMER_TEXT.sameSlot };
  }
  /* เพดานเดียวกับ CHECK ของ 0425 ("changeReason" 5–500 หลังตัดช่องว่าง) */
  const changeReason = text(body.changeReason);
  if (charCount(changeReason) < 5) return { error: INSTALL_CUSTOMER_TEXT.reasonRequired };
  if (charCount(changeReason) > INSTALL_CUSTOMER_LIMITS.reason) return { error: INSTALL_CUSTOMER_TEXT.reasonLong };

  return {
    value: {
      action, ...contact.value, requestedDate, requestedStartTime: start || null, requestedEndTime: end || null, changeReason,
    },
  };
}

/** ข้อความลงเธรดของนัด — "ใครคุยกับใคร ตอบว่าอะไร" (คอลัมน์ไม่มีที่เก็บคนรับสาย) */
export function installCustomerThreadText(value, { scheduled = false, blocker = '' } = {}) {
  const who = [value.contactName, value.contactPhone].filter(Boolean).join(' ');
  const note = value.note ? ` · ${value.note}` : '';
  if (value.action === 'confirm') {
    const tail = scheduled ? ' · ปล่อยขึ้นตาราง — ด่านครบ' : (blocker ? ` · ยังเป็นร่าง: ${blocker}` : '');
    return `ลูกค้ายืนยันวันนัด (คุยกับ ${who})${note}${tail}`;
  }
  const time = value.requestedStartTime && value.requestedEndTime ? ` ${value.requestedStartTime}–${value.requestedEndTime}` : ' ทั้งวัน';
  return `ลูกค้าขอเปลี่ยนวันเป็น ${fmtDate(value.requestedDate)}${time} เพราะ ${value.changeReason} (คุยกับ ${who})${note} — รอ TS ยืนยันวันใหม่`;
}
