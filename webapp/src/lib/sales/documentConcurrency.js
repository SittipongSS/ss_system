// ด่านกันชนกัน (optimistic lock) ของ workflow action ที่ทำงานผ่าน RPC.
//
// **ค่าที่ส่งเข้า p_expected_updated_at ต้องมาจากหน้าเว็บ ไม่ใช่แถวที่ server เพิ่งอ่าน**
// — ถ้า route อ่านแถวเองแล้วส่ง updatedAt ของตัวเองกลับเข้า RPC ด่านจะจับได้แค่ race
// ระดับมิลลิวินาทีระหว่าง SELECT กับ RPC ไม่ใช่ "แท็บค้าง" ซึ่งคือเคสที่ข้อความของ
// workflow_stale บอกว่ากัน (บั๊ก A2 พบ 2026-07-26).
//
// ⚠️ ห้าม normalize เป็น ISO ด้วย `new Date(v).toISOString()` — timestamptz ของ Postgres
// เก็บระดับไมโครวินาที (`...:14.840307+00:00`) ส่วน Date ของ JS ตัดเหลือมิลลิวินาที
// ค่าที่ถูกปัดจะไม่มีวันเท่ากับแถวจริง = ทุก action ตายด้วย workflow_stale. ส่งข้อความดิบ
// ที่หน้าเว็บได้จาก GET กลับไปตรง ๆ เท่านั้น.

const MISSING_MESSAGE = 'คำขอไม่ได้ระบุเวอร์ชันของเอกสาร กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง';
const INVALID_MESSAGE = 'เวอร์ชันของเอกสารในคำขอไม่ถูกต้อง กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง';

export function resolveExpectedUpdatedAt(body) {
  const raw = body?.expectedUpdatedAt;
  if (raw === undefined || raw === null || raw === '') {
    return { ok: false, value: null, error: MISSING_MESSAGE };
  }
  if (typeof raw !== 'string') {
    return { ok: false, value: null, error: INVALID_MESSAGE };
  }
  const value = raw.trim();
  if (!value) return { ok: false, value: null, error: MISSING_MESSAGE };
  if (!Number.isFinite(Date.parse(value))) {
    return { ok: false, value: null, error: INVALID_MESSAGE };
  }
  return { ok: true, value, error: null };
}
