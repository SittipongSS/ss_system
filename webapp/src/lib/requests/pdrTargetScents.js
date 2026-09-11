// ── ข้อ 2.1 กลิ่นรายสินค้า — ด่านฝั่ง server ที่ต้องถาม DB (mig 0352) ─────────
//
// ⚠️ แยกจาก `pdrTargets.js` เพราะไฟล์นั้นเป็นของกลางที่ฟอร์มฝั่ง client import ด้วย —
// ตัวที่ถือ `supabase` ต้องไม่หลุดเข้า bundle ของจอ · กติกาจริงยังอยู่ที่
// `pdrTargetScentError` ที่เดียว ไฟล์นี้แค่โหลดแถวกลิ่นมาให้มันตัดสิน
import { pdrTargetScentError } from '@/lib/requests/pdrTargets';

/**
 * กลิ่นที่แถวสินค้าอ้างมีจริง · เป็นของลูกค้าเจ้าของใบ · ใช้ทำสูตรได้
 * — คืน `{ error, scents }` · `scents` = แถวกลิ่นที่โหลดมา (ทางแก้ใบใช้ทำป้ายลงเธรดต่อ)
 *
 * ⚠️ `.in()` ปลอดภัยจากเพดาน 16 KB ของ PostgREST — แถวสินค้ามีเพดาน `MAX_PDR_TARGETS` (20)
 * @param {*} supabase client ที่อ่านทะเบียนกลิ่นได้
 * @param {object[]} targets ผลของ `normalizePdrTargets` (มี `scentId` แล้ว)
 * @param {{ customerId: string|null }} ctx ลูกค้าของใบ (derive จากดีล ไม่ใช่ค่าที่ client ส่ง)
 */
export async function pdrTargetScentCheck(supabase, targets = [], { customerId = null, keep = null } = {}) {
  const ids = [...new Set((targets || []).map((t) => t?.scentId).filter(Boolean))];
  if (!ids.length) return { error: null, scents: [] };
  const { data, error } = await supabase
    .from('scents').select('id, code, name, "customerId", status').in('id', ids);
  if (error) throw error;
  /* ⭐ `keep(row, index)` = แถวเดิมที่ถือกลิ่นเดิมอยู่แล้ว — ไม่ตรวจซ้ำ (ทางแก้ใบส่งมา) ⇒ กลิ่นที่ถูก
     เลิกใช้/ย้ายเจ้าของทีหลังไม่ล็อกการบันทึกช่องอื่น · ⚠️ ตัดสิน **รายแถว ไม่ใช่รายรหัสกลิ่น** —
     แถวใหม่ที่หยิบกลิ่นเลิกใช้ตัวเดิมมาใช้ซ้ำต้องยังโดนตรวจครบ (ผลรีวิวรอบสอง) */
  const fresh = keep ? (targets || []).map((t, i) => (keep(t, i) ? { ...t, scentId: null } : t)) : targets;
  return { error: pdrTargetScentError(fresh, data || [], { customerId }), scents: data || [] };
}

/**
 * ตัวตัดสิน `keep` ของ `pdrTargetScentCheck` — แถวไหน "ถือกลิ่นเดิมของแถวเดิม" (ไม่ต้องตรวจซ้ำ)
 * ⚠️ แถวเดิมหนึ่งแถวใช้สิทธิ์ได้ **ครั้งเดียว** — payload ที่ประกอบเองแล้วส่ง id เดิมซ้ำหลายแถว
 *    จะได้สิทธิ์แถวแรกเท่านั้น (ผลรีวิวรอบสาม) · ฟอร์มพา `id` มาด้วยจาก `pdrTargetValuesFrom`
 * @param beforeTargets แถวในฐานก่อนบันทึก (`findRequest`) · @param rawRows แถวดิบที่ฟอร์มส่งมา
 */
export function pdrTargetKeep(beforeTargets = [], rawRows = []) {
  const scentOfRow = new Map((beforeTargets || []).map((t) => [t.id, t.scentId]));
  const used = new Set();
  return (row, i) => {
    const rawId = rawRows?.[i]?.id;
    if (!rawId || !row?.scentId || used.has(rawId) || scentOfRow.get(rawId) !== row.scentId) return false;
    used.add(rawId);
    return true;
  };
}
