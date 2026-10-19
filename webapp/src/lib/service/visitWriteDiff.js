// ── PATCH ของนัด: เขียนเฉพาะช่องที่เปลี่ยนจริง (รีวิว S2b ข้อ V17 ต่อ · 19/10) ──────────────────────────
//
// 🐞 route ประกอบค่าจาก `{...before, ...body}` (`normalizeVisitInput`) ⇒ ทุกช่องที่ผู้เรียก **ไม่ได้ส่งมา** ได้ค่าจาก `before`
//    ที่อ่านไว้ตอนต้นคำขอ แล้วถูกเขียนกลับทั้งก้อน · มีคนแก้ช่องอื่นในเสี้ยววินาทีเดียวกัน = ค่าของเขาหายเงียบ
//    ของจริง: ฝ่ายขายเลื่อนวันบนใบ (`moveSurveyVisit` ขยับ `scheduledDate`) พอดีกับที่ช่างกด "เริ่มงาน" ⇒ นัดกลับไปวันเดิม
//    · ผู้ช่วยอัปรูปหน้างานพอดีกับที่หัวงานกดส่งงาน ⇒ รูปที่เพิ่งขึ้นหาย
// ⭐ ตัดช่องที่ค่าเท่ากับแถวที่อ่านไว้ทิ้งก่อนเขียน — ช่องที่ไม่ได้เปลี่ยนจึงไม่ทับใคร
// ⚠️ "เท่ากัน" ต้องแน่ใจเท่านั้น: สงสัยเมื่อไร = เขียน (พฤติกรรมเดิม) · ตัดผิดทางเดียวที่อันตรายคือทิ้งค่าที่ผู้ใช้แก้จริง
//    · ว่างทั้งคู่ (null/undefined) = เท่า · ว่างข้างเดียว = ไม่เท่า (`''` กับ `null` ก็ไม่เท่า)
//    · เวลา: ฐานคืน `HH:MM:SS` ฟอร์มส่ง `HH:MM` ⇒ เท่าเมื่อตรงตัว หรือฐานเป็นค่านั้นพอดีวินาที `:00`
//      (ฐานที่มีวินาทีอื่น = ไม่เท่า ⇒ เขียนค่าที่ปัดแล้วตามเดิม — ไม่งั้น CHECK เวลาเริ่ม ≤ จบ เทียบกับวินาทีเก่าแล้วล้ม)
//    · array/object (ผู้ช่วย · รูป): เทียบทั้งก้อนโดย **เรียงคีย์ของ object** ก่อน — jsonb คืนคีย์คนละลำดับกับที่ส่งไป
//      (`{url, kind, name}` กับ `{url, name, kind}`) · ลำดับใน array ยังนับ
//    · อื่น ๆ เทียบเป็นข้อความ (วันที่ `YYYY-MM-DD` · boolean)
// ⚠️ ช่องที่ต้องไปด้วยกัน (`VISIT_COLUMN_GROUPS`) เปลี่ยนช่องเดียว = เขียนทั้งกลุ่ม — ไม่งั้นแถวในฐานเป็นลูกผสมของสองคนเขียน
//    (เวลาเริ่มของคนหนึ่งกับเวลาจบของอีกคน ⇒ CHECK ล้ม · รหัสคนหนึ่งกับชื่ออีกคน · ย้ายแผนแต่ยังถือช่องของรอบเดิม)
// ⚠️ ช่องที่แถวไม่มี (คอลัมน์ใหม่ที่ฐานยังไม่รัน migration · ช่องประทับเวลาที่เพิ่งเกิด) = เขียนตามเดิม

const TIME_COLUMNS = new Set(['startTime', 'endTime', 'actualStartTime', 'actualEndTime']);

export const VISIT_COLUMN_GROUPS = Object.freeze([
  ['startTime', 'endTime'],
  ['assigneeId', 'assigneeName'],
  ['actualDate', 'actualStartTime', 'actualEndTime', 'actualEndDate'],
  ['planId', 'planSlotDate'],
]);

const sortedKeys = (_, value) => (value && typeof value === 'object' && !Array.isArray(value)
  ? Object.fromEntries(Object.keys(value).sort().map((k) => [k, value[k]]))
  : value);
const canonical = (value) => JSON.stringify(value, sortedKeys);

function sameValue(key, next, prev) {
  if (next == null && prev == null) return true;
  if (next == null || prev == null) return false;
  if (TIME_COLUMNS.has(key)) {
    const stored = String(prev);
    const sent = String(next);
    return stored === sent || stored === `${sent}:00`;
  }
  if (typeof next === 'object' || typeof prev === 'object') return canonical(next) === canonical(prev);
  return String(next) === String(prev);
}

/** ก้อนที่จะเขียนลง `service_visits` เหลือเฉพาะช่องที่ต่างจากแถวที่อ่านไว้ (+ เพื่อนร่วมกลุ่ม) — คืน object ใหม่ ไม่แก้ของเดิม */
export function changedVisitColumns(patch = {}, before = {}) {
  const prev = before || {};
  const changed = new Set(Object.keys(patch).filter((key) => !(key in prev) || !sameValue(key, patch[key], prev[key])));
  for (const group of VISIT_COLUMN_GROUPS) {
    if (group.some((key) => changed.has(key))) for (const key of group) if (key in patch) changed.add(key);
  }
  return Object.fromEntries(Object.keys(patch).filter((key) => changed.has(key)).map((key) => [key, patch[key]]));
}
