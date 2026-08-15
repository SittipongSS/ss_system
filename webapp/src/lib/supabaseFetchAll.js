// ── ดึงให้ครบจริง ไม่ให้เพดานของ PostgREST ตัดเงียบ ─────────────────────────
//
// 🐞 **บั๊กจริง (พบ 2026-08-16):** โปรเจกต์ตั้ง Supabase → Settings → API →
// **Max rows = 1000** ⇒ `.select()` ที่ไม่มี `.range()` จะได้คืนมาแค่ 1,000 แถวแรก
// **โดยไม่มี error** โค้ดได้ array ที่สั้นกว่าความจริงแล้วเดินต่อเหมือนไม่มีอะไรเกิดขึ้น
//
// ตอนตรวจพบ ตารางที่เกินเพดานไปแล้วมี 3 ตัว:
//   project_tasks 2,820 · notifications 1,194 · personal_tasks 1,045
// อาการที่เกิดจริง: คิวงานโครงการของผู้ดูแลเห็นแค่ 1,000 จาก 2,820 งาน — และหายเป็น
// ระบบ (เรียงด้วย `stepOrder` ⇒ ขั้นท้าย ๆ ของทุกโครงการหายก่อน) ส่วนตัวเลข KPI
// ของงานส่วนตัวคิดจากข้อมูลไม่ครบโดยไม่มีใครดูออก เพราะมันเป็นตัวเลขสรุป
//
// ⚠️ **ต้องมี `.order()` ที่นิ่งเสมอ** — PostgREST ไม่การันตีลำดับถ้าไม่สั่ง เมื่อไม่มี
// ลำดับที่แน่นอน การไล่ทีละหน้าจะได้แถวซ้ำและแถวหายพร้อมกัน ซึ่งแย่กว่าการถูกตัด
// เพราะมันดูเหมือนข้อมูลครบ
//
// ⚠️ **รับ "ฟังก์ชันที่สร้าง query" ไม่ใช่ตัว query** — builder ของ supabase-js ใช้ยิงซ้ำ
// ไม่ได้ (มันจำ state ของคำขอไว้ในตัว) การส่งฟังก์ชันมาทำให้ทุกหน้าได้ builder ใหม่เสมอ

/** เพดานแถวของโปรเจกต์นี้ (Supabase → Settings → API → Max rows) */
export const SUPABASE_MAX_ROWS = 1000;

/**
 * ดึงทุกแถวของ query โดยไล่ทีละหน้าจนหมด
 *
 * @param makeQuery ฟังก์ชันที่คืน query ใหม่ทุกครั้ง — ต้องมี `.order()` ที่นิ่ง
 *                  เช่น `() => supabase.from('project_tasks').select('*').order('id')`
 * @param pageSize  ขนาดหน้า (ค่าตั้งต้น = เพดาน) — ห้ามเกินเพดาน ไม่งั้นหน้าถูกตัด
 *                  แล้วลูปจะจบก่อนเวลาโดยคิดว่าหมดแล้ว
 * @returns ทุกแถว
 * @throws error ของ Supabase ตัวแรกที่เจอ — ผู้เรียกจัดการต่อเหมือน query ปกติ
 */
export async function fetchAll(makeQuery, { pageSize = SUPABASE_MAX_ROWS } = {}) {
  const size = Math.min(Math.max(1, Math.floor(pageSize)), SUPABASE_MAX_ROWS);
  const rows = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await makeQuery().range(from, from + size - 1);
    if (error) throw error;
    const page = data || [];
    rows.push(...page);
    // หน้าไม่เต็ม = หมดแล้ว · หน้าเต็มพอดี = อาจมีต่อ ต้องยิงอีกรอบเพื่อรู้
    if (page.length < size) return rows;
  }
}

/**
 * เหมือน `fetchAll` แต่คืนรูปเดียวกับ query ปกติ (`{ data, error }`)
 * — ใช้กับ route ที่ส่ง `error` ต่อเข้าตัวจัดการเดิมอยู่แล้ว จะได้ไม่ต้องยก try/catch
 */
export async function fetchAllResult(makeQuery, options) {
  try {
    return { data: await fetchAll(makeQuery, options), error: null };
  } catch (error) {
    return { data: null, error };
  }
}
