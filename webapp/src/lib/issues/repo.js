// ── อ่าน/เขียนตาราง system_issues (mig 0223) ────────────────────────────
// server-only (service-role) — ห้าม import ในฝั่ง client
import { canReadIssueRow, isSystemAdmin } from '@/lib/issues/access';
import { ISSUE_OPEN_STATUSES } from '@/lib/issues/statuses';
import { sortIssueQueue } from '@/lib/issues/model';

const TABLE = 'system_issues';

export async function findIssue(supabase, id) {
  if (!id) return null;
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
  // แยก "อ่านไม่สำเร็จ" ออกจาก "ไม่มีแถวนี้" — ไม่งั้น schema error กลายเป็น 404
  // แล้วไล่ผิดทางยาว (บทเรียนเดียวกับ loadUpdateParent)
  if (error) throw new Error(`อ่านเรื่องแจ้งปัญหาไม่สำเร็จ: ${error.message}`);
  return data || null;
}

/**
 * รายการเรื่อง — **ขอบเขตตัดที่ query ไม่ใช่ที่หน้าจอ**
 * ผู้ใช้ทั่วไปเห็นเฉพาะเรื่องของตัวเอง (มติ Q12) จึงใส่ `.eq('reportedById')`
 * ตั้งแต่ระดับ query ไม่ใช่ดึงมาทั้งตารางแล้วค่อยกรองใน JS
 */
export async function listIssues(supabase, user, { status = null, kind = null, mine = false } = {}) {
  let query = supabase.from(TABLE).select('*');

  if (!isSystemAdmin(user)) {
    query = query.eq('reportedById', String(user?.id || ''));
  } else if (mine) {
    query = query.eq('assigneeId', String(user?.id || ''));
  }

  if (status === 'open') query = query.in('status', ISSUE_OPEN_STATUSES);
  else if (status) query = query.in('status', String(status).split(',').filter(Boolean));
  if (kind) query = query.in('kind', String(kind).split(',').filter(Boolean));

  const { data, error } = await query.order('createdAt', { ascending: false }).limit(200);
  if (error) throw new Error(`อ่านรายการเรื่องแจ้งปัญหาไม่สำเร็จ: ${error.message}`);
  return sortIssueQueue(data || []);
}

/**
 * เรื่องอื่นที่มาจากหน้าเดียวกัน — ใช้สองที่ (กันแจ้งซ้ำตอนพิมพ์ · การ์ดในหน้ารายละเอียด)
 *
 * ⚠️ คืน **หัวข้อกับสถานะเท่านั้น** ไม่มีรายละเอียด ไม่มีไฟล์แนบ เพราะผู้ใช้ทั่วไป
 * เห็นเรื่องของคนอื่นไม่ได้ (มติ Q12) — ที่ยอมให้เห็นคือ "มีคนแจ้งไปแล้ว" ซึ่งกันงาน
 * ซ้ำได้โดยไม่เปิดเนื้อในของใคร
 */
export async function issuesForPage(supabase, pageUrl, { excludeId = null, limit = 3 } = {}) {
  if (!pageUrl) return [];
  let query = supabase.from(TABLE)
    .select('id, code, title, status, kind')
    .eq('pageUrl', pageUrl)
    .in('status', ISSUE_OPEN_STATUSES);
  if (excludeId) query = query.neq('id', excludeId);
  const { data, error } = await query.order('createdAt', { ascending: false }).limit(limit);
  if (error) return []; // การ์ดเสริม — พังแล้วต้องไม่ทำให้หน้าหลักพัง
  return data || [];
}

// โหลดแถว + เช็คสิทธิ์ในก้าวเดียว — ทุก route ของรายใบเรียกตัวนี้
// คืน `{ response }` เมื่อไม่ผ่าน (รูปแบบเดียวกับ requireProduction/requireJob)
export async function requireIssue({ user, supabase, id, admin = false }, http) {
  if (!user?.id) return { response: http.unauthorized() };
  const row = await findIssue(supabase, id);
  if (!row) return { response: http.notFound('ไม่พบเรื่องที่ระบุ') };
  if (!canReadIssueRow(user, row)) return { response: http.forbidden() };
  if (admin && !isSystemAdmin(user)) return { response: http.forbidden('เฉพาะผู้ดูแลระบบ') };
  return { row };
}
