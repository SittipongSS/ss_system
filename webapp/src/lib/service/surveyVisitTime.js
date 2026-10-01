// ── เวลาเข้าประเมินบนรายงานการประเมินพื้นที่ — ตรรกะล้วน (มติเจ้าของข้อ 8) ───────────────────
//
// 🐞 ที่มา (ของจริง RQ-AS-26090186): นัดเก็บ `actualStartTime = actualEndTime = 17:45` — คือนาทีที่หัวหน้ากด
//   "เข้าแล้ว" ย้อนหลัง ไม่ใช่เวลาที่ทีมอยู่หน้างาน (`visitStamp.js`: ปิดงานโดยไม่เคยกดเริ่ม = เริ่ม = จบ = ตอนนี้)
//   พิมพ์ "17:45–17:45 น. (0 นาที)" ลงเอกสารที่ลูกค้าเซ็นรับ = ตัวเลขที่ดูผิดและอธิบายไม่ได้
//
// ⭐ กติกา: เวลาที่บันทึก **เชื่อได้** เมื่อมีทั้งเวลาเริ่มและเวลาจบ จบหลังเริ่ม และนัดไม่ได้ถูกปิดพร้อมการส่งผล
//     ฉบับลูกค้า · เชื่อได้  = "13:05–14:10 น."
//     ฉบับลูกค้า · ไม่เชื่อ = เวลานัด "12:00 น. (ตามนัด)"   (ไม่พิมพ์ค่าที่ไม่เชื่อ และไม่บอกเหตุภายใน)
//     ฉบับภายใน            = บอกทั้งคู่ "12:00 · บันทึก 17:45–17:45 (ปิดงานย้อนหลัง)"
//
// ⚠️ ตารางนัดเก็บ date + time แยกกันเป็น **เวลาไทยล้วน** (mig 0187/0188) ไม่ใช่ timestamptz
//   ⇒ ที่นี่เทียบ/พิมพ์สตริง `HH:MM` ตรง ๆ ได้ ไม่มีโซนเวลาเข้ามาเกี่ยว
// ⚠️ `actualTimeEdited` (หัวหน้าแก้เวลาย้อนหลังผ่านฟอร์มแก้นัด) **ไม่ทำให้ไม่เชื่อ** — เวลาที่คนตั้งใจพิมพ์แก้
//   คือเวลาที่เขายืนยัน · ถ้าแก้แล้วยังได้ 0 นาที กติกาข้อแรกจับอยู่แล้ว
import { fmtDate, normalizeTime } from '@/lib/format';

const DASH = '—';

/** `HH:MM` จากค่าที่ฐานเก็บ (`HH:MM` หรือ `HH:MM:SS`) — อ่านไม่ออก = `null` */
function hhmm(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  return normalizeTime(text.length > 5 ? text.split(':').slice(0, 2).join(':') : text);
}

const dayOf = (value) => {
  const match = String(value ?? '').match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
};

/** วันที่เสร็จอยู่หลังวันเข้า = งานข้ามวัน (mig 0386 · `actualEndDate` ว่าง = วันเดียวกัน) */
function endsOnLaterDay(visit) {
  const end = dayOf(visit?.actualEndDate);
  const start = dayOf(visit?.actualDate);
  return !!end && !!start && end > start;
}

/**
 * เวลาเข้าจริงที่บันทึกไว้เชื่อได้ไหม
 * @param visit แถวนัด (`actualDate` · `actualStartTime` · `actualEndTime` · `actualEndDate`)
 * @param opts.closedBySend นัดถูกปิดพร้อมการส่งผล (`surveySendWrites` ปิดให้ · ช่างไม่ได้กดส่งงาน)
 */
export function visitTimeCredible(visit, { closedBySend = false } = {}) {
  if (!visit || closedBySend) return false;
  const start = hhmm(visit.actualStartTime);
  const end = hhmm(visit.actualEndTime);
  if (!start || !end) return false;
  if (endsOnLaterDay(visit)) return true;
  return end > start;
}

/* ช่วงเวลาที่บันทึก — งานข้ามวันบอกวันที่เสร็จ ("14:00 – 26/09/2026 09:00") ไม่ใช่ช่วงที่อ่านแล้วถอยหลัง */
function actualRange(visit, unit) {
  const start = hhmm(visit?.actualStartTime);
  const end = hhmm(visit?.actualEndTime);
  if (endsOnLaterDay(visit) && start && end) {
    return `${start}${unit} – ${fmtDate(dayOf(visit.actualEndDate))} ${end}${unit}`;
  }
  if (start && end) return `${start}–${end}${unit}`;
  return start || end ? `${start || end}${unit}` : null;
}

function plannedRange(visit) {
  const start = hhmm(visit?.startTime);
  const end = hhmm(visit?.endTime);
  if (!start) return null;
  return end && end > start ? `${start}–${end}` : start;
}

/**
 * ข้อความเวลาเข้าประเมิน
 * @param opts.version      'customer' | 'internal'
 * @param opts.closedBySend ดู `visitTimeCredible`
 * @param opts.credible     ค่าที่ตรึงไว้ในภาพนิ่ง (`snapshot.visit.timeCredible`) — ส่งมา = ใช้ค่านี้ ไม่คิดใหม่
 *                          (กระดาษที่ตรึงแล้วต้องไม่เปลี่ยนเมื่อกติกาข้างบนถูกแก้ทีหลัง)
 */
export function visitTimeText(visit, { version = 'customer', closedBySend = false, credible = null } = {}) {
  const ok = typeof credible === 'boolean' ? credible : visitTimeCredible(visit, { closedBySend });
  const planned = plannedRange(visit);

  if (version === 'internal') {
    const recorded = actualRange(visit, '');
    let actual = 'ไม่มีเวลาเข้าจริง';
    if (ok && recorded) actual = recorded;
    else if (recorded) actual = `บันทึก ${recorded} (${closedBySend ? 'ปิดพร้อมส่งผล' : 'ปิดงานย้อนหลัง'})`;
    return `${planned || DASH} · ${actual}`;
  }

  const recorded = ok ? actualRange(visit, ' น.') : null;
  if (recorded) return recorded;
  return planned ? `${planned} น. (ตามนัด)` : DASH;
}
