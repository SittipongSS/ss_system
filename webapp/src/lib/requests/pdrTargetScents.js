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
export async function pdrTargetScentCheck(supabase, targets = [], { customerId = null } = {}) {
  const ids = [...new Set((targets || []).map((t) => t?.scentId).filter(Boolean))];
  if (!ids.length) return { error: null, scents: [] };
  const { data, error } = await supabase
    .from('scents').select('id, code, name, "customerId", status').in('id', ids);
  if (error) throw error;
  return { error: pdrTargetScentError(targets, data || [], { customerId }), scents: data || [] };
}
