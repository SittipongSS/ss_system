import { withUser, ok, fail, forbidden, unauthorized } from '@/lib/http';
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { isSuperuser, userTeams } from '@/lib/permissions';
import { businessDayKey } from '@/lib/datePeriods';
import { LEAD_WORKLOAD_STATUSES, leadWorkloadFrom } from '@/lib/sales/leadWorkload';

export const dynamic = 'force-dynamic';

/** ตำแหน่งที่ "กระจายลีดให้คนอื่น" ได้ — ตรงกับด่าน `assign` ใน transition/route.js
 *  (superuser = admin/ae_supervisor · senior_ae/ac = เฉพาะทีมตัวเอง)
 *  คนอื่นไม่ต้องรู้ภาระของเพื่อนร่วมทีม เพราะไม่ได้เป็นคนตัดสินใจว่าใบไปหาใคร */
const canReadWorkload = (user) =>
  isSuperuser(user?.role) || user?.role === 'senior_ae' || user?.role === 'ac';

/** ภาระงานของ AE ณ ตอนนี้ รายคน — ใช้ตอนเลือกผู้รับผิดชอบ
 *
 *  ⚠️ ขอบเขตต้องแคบเท่าที่คนถามมอบหมายได้จริง: senior_ae/ac เห็นเฉพาะทีมตัวเอง
 *  ⚠️ ไล่ทีละหน้าเสมอ — เพดาน 1,000 แถวตัดเงียบ ๆ แล้วตัวเลขจะต่ำกว่าจริง
 *     ซึ่งอ่านว่า "คนนี้ว่าง" ทั้งที่งานล้นมือ = แย่กว่าไม่มีตัวเลขให้ดูเลย
 */
export const GET = withUser(async ({ user, supabase }) => {
  if (!user) return unauthorized();
  if (!canReadWorkload(user)) return forbidden();

  const teams = isSuperuser(user.role) ? [] : userTeams(user);
  // senior_ae/ac ที่ไม่มีทีมเลย = มอบหมายอะไรไม่ได้ ⇒ คืนก้อนว่าง ไม่ใช่ยิงถามทั้งตาราง
  if (!isSuperuser(user.role) && !teams.length) return ok({ todayKey: null, workload: {} });

  const { data, error } = await fetchAllResult(() => {
    let query = supabase
      .from('sales_leads')
      .select('assigneeId, status, followUpAt')
      .in('status', LEAD_WORKLOAD_STATUSES)
      .not('assigneeId', 'is', null)
      .order('id', { ascending: true });
    if (teams.length) query = query.in('team', teams);
    return query;
  });
  if (error) return fail(error.message, 500);

  const todayKey = businessDayKey(new Date().toISOString());
  return ok({ todayKey, workload: leadWorkloadFrom(data || [], todayKey) });
});
