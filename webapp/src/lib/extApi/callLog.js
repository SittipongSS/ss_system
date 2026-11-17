// ── ประวัติการเรียก `/api/ext/v1` (มติ 5: เก็บทุกครั้ง · ล้างแถวเกิน 90 วันที่ cron รายวัน) ──────────────────
//
// หนึ่งแถวต่อการเรียก ทั้งผ่านและไม่ผ่าน — คีย์ผิด/ไม่มีคีย์ได้ `clientId` = null (ใช้จับคนลองเดาคีย์)
// ⚠️ เขียนพลาดต้องไม่ล้มคำตอบ (ข้อมูลส่งไปแล้ว/ตัดสินไปแล้ว) — แต่ต้องเห็นใน log ไม่ใช่เงียบ
// ⚠️ ห้ามเก็บ header `Authorization` หรือ secret ใด ๆ — เก็บแค่ path + query (ตัด 500 ตัวอักษร)
export const CALL_LOG_RETENTION_DAYS = 90;
const QUERY_MAX = 500;

export function callLogRow({ clientId = null, method = 'GET', url, status, rowCount = null, startedAt, now = Date.now(), ip = null }) {
  const parsed = new URL(url);
  const query = parsed.search ? parsed.search.slice(1, QUERY_MAX + 1) : null;
  return {
    clientId,
    method,
    path: parsed.pathname.slice(0, 300),
    query,
    status,
    rowCount: Number.isInteger(rowCount) ? rowCount : null,
    durationMs: Number.isFinite(startedAt) ? Math.max(0, Math.round(now - startedAt)) : null,
    ip: ip ? String(ip).split(',')[0].trim().slice(0, 64) : null,
  };
}

export async function recordApiCall(supabase, input) {
  try {
    const { error } = await supabase.from('api_client_calls').insert(callLogRow(input));
    if (error) console.error('[ext-api] บันทึกประวัติการเรียกไม่สำเร็จ', error.message);
  } catch (error) {
    console.error('[ext-api] บันทึกประวัติการเรียกไม่สำเร็จ', error?.message || error);
  }
}

/** ลบประวัติที่เก่ากว่า 90 วัน — เรียกจาก cron รายวัน · คืนจำนวนที่ลบ หรือ throw */
export async function purgeOldApiCalls(supabase, { now = new Date(), days = CALL_LOG_RETENTION_DAYS } = {}) {
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase.from('api_client_calls').delete().lt('at', cutoff).select('id');
  if (error) throw new Error(`ล้างประวัติการเรียก API ไม่สำเร็จ: ${error.message}`);
  return (data || []).length;
}
