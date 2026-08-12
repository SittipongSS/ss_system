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

/** ส่วนต่าง "ของจริง − แผน" เป็นวันทำการ (บวก = ช้ากว่าแผน · ลบ = เร็วกว่า · 0 = ตรงวัน)
 *  คืน null เมื่อยังไม่มีของจริง หรือแผนหาย — คนละเรื่องกับ 0 ที่แปลว่าตรงวันจริง ๆ
 *  นับเป็นวันทำการเหมือนทุกอย่างในไทม์ไลน์ ไม่ใช่วันปฏิทิน: ช้าข้ามสุดสัปดาห์ = ช้า 1 วันทำงาน */
export const actualVariance = (planStr, actualStr) => {
  if (!planStr || !actualStr) return null;
  const plan = new Date(planStr); const actual = new Date(actualStr);
  if (isNaN(plan.getTime()) || isNaN(actual.getTime())) return null;
  return countBusinessDays(planStr, actualStr);
};

/** เลื่อนวันที่ไปข้างหน้าให้ตกวันทำการ — กติกาเดียวกับที่ recalculateGraph ฝั่ง server
 *  ทำกับวันที่ปักหมุด (`while (!isBusinessDay(pinned)) …`) ⇒ ค่าที่พรีวิวโชว์ = ค่าที่จะถูกบันทึก */
export const snapToBusinessDay = (dateStr) => {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  while (!isBusinessDay(d)) d.setDate(d.getDate() + 1);
  return toLocalISODate(d);
};

const normalizeDuration = (value) => Math.max(1, Number(value) || 1);

/**
 * แกนกลางของสามช่อง วันเริ่ม / วันสิ้นสุด / จำนวนวันทำการ — **ที่เดียวที่รู้กติกา** (pure)
 * ทุกทางฝั่ง client เรียกผ่านตัวนี้: ฟอร์มขั้นตอน (`syncStepForm`) · ตารางไทม์ไลน์กับ
 * มุมมองเอกสาร (`syncStepPatch`) ⇒ แก้ช่องเดียวกันจากคนละหน้าต้องได้ผลเท่ากัน
 *
 *   ไม่มีวันเริ่ม        → ไม่มีวันสิ้นสุด (ขั้นตอนไหลตามงานที่รออยู่ ให้ server กางตอนบันทึก)
 *                        ยกเว้นผู้ใช้กรอกวันสิ้นสุดมาเอง = ปล่อยตามที่กรอก ไม่คำนวณมั่ว
 *   แก้วันสิ้นสุด        → ได้จำนวนวัน แล้ว snap วันสิ้นสุดกลับเป็นวันทำการ
 *   แก้วันเริ่ม/จำนวนวัน → คำนวณวันสิ้นสุดใหม่จากจำนวนวัน
 *
 * `finishEdited` = ผู้ใช้แก้ช่องวันสิ้นสุดในรอบนี้ (ไม่ใช่ค่าที่ติดมาจากของเดิม)
 */
export function resolveStepDates({ startDate, finishDate, durationDays }, { finishEdited = false } = {}) {
  const start = snapToBusinessDay(startDate);
  if (!start) {
    return {
      startDate: startDate || "",
      finishDate: finishEdited ? (finishDate || "") : "",
      durationDays: normalizeDuration(durationDays),
    };
  }
  const dur = finishEdited && finishDate
    ? durationFromDates(start, finishDate)
    : normalizeDuration(durationDays);
  return { startDate: start, durationDays: dur, finishDate: toLocalISODate(computeFinish(start, dur)) };
}

/**
 * ฟอร์มขั้นตอน: ค่าเดิมทั้งฟอร์ม + ช่องที่เพิ่งแก้ → ฟอร์มที่สามช่องสอดคล้องกัน (pure)
 * ฟิลด์อื่นของฟอร์มติดมาครบ
 */
export function syncStepForm(form, changes) {
  const next = { ...form, ...changes };
  return { ...next, ...resolveStepDates(next, { finishEdited: "finishDate" in changes }) };
}

/**
 * ตารางไทม์ไลน์ / มุมมองเอกสาร: แถวปัจจุบัน + แพตช์ที่ผู้ใช้เพิ่งแก้ → แพตช์ที่สามช่อง
 * สอดคล้องกัน (pure) · แตะเฉพาะตอนแพตช์มีช่องวันจริง ๆ ฟิลด์อื่น (สถานะ/ผู้รับผิดชอบ/ลำดับ)
 * ผ่านไปตามเดิม
 *
 * ต่างจาก `syncStepForm` แค่รูปข้อมูล: คืนเฉพาะคีย์ที่ต้องส่งไปกับแพตช์ ไม่ใช่ทั้งฟอร์ม
 *   - ล้างช่องวันสิ้นสุด = ไม่มีอะไรให้เปลี่ยน (วันสิ้นสุดเป็นค่าคำนวณ) ⇒ ถอดคีย์ทิ้ง
 *   - ตั้งวันเริ่มเอง = ปักหมุด `startLocked` (กติกาเดียวกับ server) เพื่อให้พรีวิวกราฟ
 *     ไม่ดูดแถวนี้กลับไปเกาะ anchor/predecessors ระหว่างยังไม่กดบันทึก
 */
export function syncStepPatch(task, patch) {
  const next = { ...patch };
  if ("finishDate" in next && !next.finishDate) delete next.finishDate;
  const touchesDates = ["startDate", "finishDate", "durationDays"].some((k) => k in next);
  if (!touchesDates) return next;
  if ("startDate" in patch) next.startLocked = !!patch.startDate;

  const resolved = resolveStepDates(
    {
      startDate: "startDate" in next ? next.startDate : task.startDate,
      finishDate: "finishDate" in next ? next.finishDate : task.finishDate,
      durationDays: "durationDays" in next ? next.durationDays : task.durationDays,
    },
    { finishEdited: "finishDate" in next },
  );
  if (!resolved.startDate) return next; // ไม่มีวันเริ่ม = ให้ server กางเอง ไม่เดาวันให้
  return { ...next, ...resolved };
}
