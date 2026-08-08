// ปฏิทินนัดของฝ่ายขาย — กติกาช่วงวันที่ + การประกอบรายการนัด
//
// แยกออกจาก route เป็นฟังก์ชันบริสุทธิ์เพราะกติกาสองข้อนี้พังเงียบทั้งคู่:
// ขอบวันที่เพี้ยนไปหนึ่งวัน กับนัดของทีมอื่นหลุดออกมา — ทั้งคู่ไม่มี error ให้เห็น
// (บทเรียนเดียวกับ meetingTimesSinceBounce/pickNextMeetingAt ใน leads.js)

export const CALENDAR_MAX_DAYS = 92; // ~3 เดือน — กันคำขอที่กวาดทั้งปีในครั้งเดียว

const DAY_MS = 86400000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * ช่วงที่ query จริง — **ถ่างจากที่ผู้ใช้ขอด้านละ 1 วัน**
 *
 * ⚠️ `lead_events.eventAt` เก็บเป็น UTC แต่ปฏิทินบนจอแบ่งช่องตาม *วันตามเวลาไทย* (UTC+7)
 * นัดตีหนึ่งของวันที่ 1 คือ 18:00Z ของวันที่ 31 — ตัดขอบตรง ๆ ตาม UTC แล้วนัดนั้นจะ
 * หายไปจากเดือนที่ผู้ใช้กำลังดูโดยไม่มีอะไรบอก (และไปโผล่ในเดือนก่อนหน้าแทน)
 * ⇒ ดึงเผื่อด้านละวัน แล้วให้ฝั่งหน้าจอแบ่งช่องด้วยเวลาท้องถิ่นของเครื่องผู้ใช้เอง
 * ซึ่งเป็นที่เดียวที่รู้ timezone จริงของคนดู (server ไม่รู้ และ hardcode +07:00 จะพัง
 * ทันทีที่มีคนเปิดจากต่างประเทศ)
 *
 * @returns {{error: string} | {error: null, fromIso: string, untilIso: string}}
 */
export function calendarRange(from, to) {
  if (!DATE_RE.test(String(from || '')) || !DATE_RE.test(String(to || ''))) {
    return { error: 'ต้องระบุช่วงวันที่ (from/to) รูปแบบ YYYY-MM-DD' };
  }
  const fromMs = Date.parse(`${from}T00:00:00Z`);
  const toMs = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return { error: 'ช่วงวันที่ไม่ถูกต้อง' };
  if (toMs < fromMs) return { error: 'วันที่สิ้นสุดต้องไม่มาก่อนวันที่เริ่ม' };

  const days = Math.round((toMs - fromMs) / DAY_MS) + 1;
  if (days > CALENDAR_MAX_DAYS) {
    return { error: `ขอปฏิทินได้ครั้งละไม่เกิน ${CALENDAR_MAX_DAYS} วัน (ขอมา ${days} วัน)` };
  }

  return {
    error: null,
    fromIso: new Date(fromMs - DAY_MS).toISOString(),
    // +2 วัน = ถึงสิ้นวัน `to` (1) แล้วเผื่อขอบอีกวัน (1) · ปลายทางเป็นแบบ "ไม่รวม"
    untilIso: new Date(toMs + 2 * DAY_MS).toISOString(),
  };
}

/**
 * นัดใบนี้อยู่ในเดือนที่กำลังดูไหม — **วัดด้วยเวลาท้องถิ่นของเครื่องผู้ใช้**
 *
 * ⚠️ คู่กับ `calendarRange` ที่ถ่างขอบด้านละวัน: server ไม่รู้ timezone ของคนดู จึงส่ง
 * เผื่อมา แล้ว "ตัดจริง" ต้องเกิดฝั่งหน้าจอ · ถ้าลืมตัด ตัวเลข "N นัด" กับมุมมองรายการ
 * จะกินนัดของเดือนข้างเคียงมาด้วย ขณะที่ตารางเดือนไม่โชว์ (มันวาดเฉพาะช่องของเดือนนี้)
 * = สองมุมมองบนหน้าเดียวกันพูดคนละเลข ซึ่งไม่มี error อะไรฟ้อง
 *
 * @param month เดือนแบบ 0 = มกราคม (ตรงกับ Date#getMonth)
 */
export function isInLocalMonth(iso, year, month) {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return false;
  return at.getFullYear() === year && at.getMonth() === month;
}

/**
 * รวมเหตุการณ์นัดเข้ากับลีดต้นทางที่ผ่าน `applyLeadScope` มาแล้ว
 *
 * ⚠️ นัดที่หาลีดต้นทางไม่เจอใน map = ลีดใบนั้นอยู่นอกขอบเขตของคนดู **ต้องหายไปเงียบ ๆ**
 * ไม่ใช่คืนกลับไปแบบไม่มีชื่อ — จำนวนนัดต่อวันของทีมอื่นก็เป็นข้อมูลของทีมอื่น
 * (ปฏิทินที่หลวมกว่าคิวลีดคือช่องอ่านความเคลื่อนไหวข้ามทีมโดยไม่ตั้งใจ)
 */
export function toCalendarEntries(events = [], leadsById = new Map()) {
  const out = [];
  for (const event of events) {
    const lead = leadsById.get(event?.leadId);
    if (!lead || !event?.eventAt) continue;
    out.push({
      id: event.id,
      leadId: event.leadId,
      at: event.eventAt,
      meetingMode: event.meetingMode || null,
      contactName: lead.contactName || '',
      company: lead.company || null,
      team: lead.team || null,
      assigneeId: lead.assigneeId || null,
      assigneeName: lead.assigneeName || null,
      status: lead.status || null,
      bookedByName: event.createdByName || null,
    });
  }
  return out;
}
