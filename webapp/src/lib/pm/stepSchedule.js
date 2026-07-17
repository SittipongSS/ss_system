// วัน–ระยะเวลาของ "ขั้นตอนโครงการ" — เอนจินวันทำการชุดเดียวกับที่ server ใช้ตอนบันทึก
// (recalculateForward) เพื่อให้ค่าที่ฟอร์มโชว์ตรงกับผลจริงหลังกดบันทึก
import { countBusinessDays, isBusinessDay, toLocalISODate } from "@/lib/pm/dateHelpers";

/** วันเริ่ม + จำนวนวันทำการ → วันสิ้นสุด (Date) — เลื่อนวันเริ่มมาเป็นวันทำการก่อน */
export const computeFinish = (startStr, dur) => {
  if (!startStr) return null;
  const d = new Date(startStr);
  if (isNaN(d.getTime())) return null;
  while (!isBusinessDay(d)) d.setDate(d.getDate() + 1);
  let need = Math.max(0, (Number(dur) || 1) - 1);
  while (need > 0) { d.setDate(d.getDate() + 1); if (isBusinessDay(d)) need--; }
  return d;
};

/** ผกผันของ computeFinish: วันเริ่ม + วันสิ้นสุด → ระยะเวลา (วันทำการ, นับรวมวันเริ่ม) */
export const durationFromDates = (startStr, finishStr) => {
  if (!startStr || !finishStr) return 1;
  const s = new Date(startStr); const fe = new Date(finishStr);
  if (isNaN(s.getTime()) || isNaN(fe.getTime()) || fe <= s) return 1;
  return Math.max(1, countBusinessDays(startStr, finishStr) + 1);
};

/**
 * ซิงค์สามช่อง วันเริ่ม / วันสิ้นสุด / จำนวนวันทำการ ให้สอดคล้องกันเสมอ (pure)
 *   แก้วันสิ้นสุด    → คำนวณระยะเวลา แล้ว snap วันสิ้นสุดกลับเป็นวันทำการ (ให้ตรงกับที่ server จะบันทึก)
 *   แก้วันเริ่ม/ระยะเวลา → คำนวณวันสิ้นสุดใหม่
 * ไม่มีวันเริ่ม = คำนวณไม่ได้ ปล่อยค่าที่กรอกไว้ตามเดิม (ขั้นตอนที่อิงงานที่รออยู่ วันเริ่มเว้นว่างได้)
 */
export function syncStepForm(form, changes) {
  const next = { ...form, ...changes };
  if ("finishDate" in changes) {
    if (!next.startDate || !next.finishDate) return next;
    const dur = durationFromDates(next.startDate, next.finishDate);
    next.durationDays = dur;
    const fin = computeFinish(next.startDate, dur);
    if (fin) next.finishDate = toLocalISODate(fin);
    return next;
  }
  const fin = computeFinish(next.startDate, next.durationDays);
  next.finishDate = fin ? toLocalISODate(fin) : "";
  return next;
}
