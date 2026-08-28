// ── Data access ของทะเบียนทีม (mig 0308) ─────────────────────────────────
// แยกจาก route.js เพราะไฟล์ route ของ Next ส่งออกได้เฉพาะ HTTP method
//
// ⚠️ **สมาชิกทีมขายไม่ได้อยู่ที่นี่** — อยู่ที่ `app_metadata.teams` ของบัญชีผู้ใช้
//    ไฟล์นี้อ่านได้แค่ทะเบียนชื่อทีมกับสมาชิกของทีม **ปฏิบัติงาน** (team_members)
import { CLOSED_STAGES } from '@/lib/salesPlanning';

export async function loadTeams(supabase, { department = null, includeInactive = true } = {}) {
  let query = supabase.from('teams').select('*');
  if (department) query = query.eq('department', department);
  if (!includeInactive) query = query.eq('isActive', true);
  const { data, error } = await query.order('sortOrder', { ascending: true }).order('name', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function findTeam(supabase, code) {
  const { data, error } = await supabase.from('teams').select('*').eq('code', code).maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function loadTeamMembers(supabase, { teamCodes = null } = {}) {
  let query = supabase.from('team_members').select('*');
  if (teamCodes) {
    if (!teamCodes.length) return [];
    query = query.in('teamCode', teamCodes);
  }
  const { data, error } = await query.order('teamCode', { ascending: true });
  if (error) throw error;
  return data || [];
}

/* ผลข้างเคียงของการย้ายทีมขาย — **นับ ไม่ย้าย**
   ⚠️ ระบบไม่ย้ายให้อัตโนมัติโดยเจตนา (docs/team-management-plan.md §3.5):
   ย้ายให้เอง = เขียนทับเจ้าของงานหลายสิบใบในคลิกเดียว และมติเดิมบอกว่า
   ดีลเดือนเก่ารายงานใต้ทีมเดิมถูกต้องแล้ว
   ⚠️ นับ **ดีลที่ยังเปิด** ด้วยนิยามกลาง (CLOSED_STAGES) ไม่ใช่ลิสต์สเตจที่เขียนเอง */
export async function teamMoveImpact(supabase, userId, { fromMonth = null } = {}) {
  const [deals, targets] = await Promise.all([
    supabase.from('sales_deals').select('id', { count: 'exact', head: true })
      .eq('ownerId', userId)
      .not('stage', 'in', `(${CLOSED_STAGES.join(',')})`)
      .then(({ count, error }) => { if (error) throw error; return count || 0; }),
    fromMonth
      ? supabase.from('sales_targets').select('id', { count: 'exact', head: true })
        .eq('ownerId', userId).gte('period', fromMonth).gt('targetAmount', 0)
        .then(({ count, error }) => { if (error) throw error; return count || 0; })
      : Promise.resolve(0),
  ]);
  return { openDeals: deals, futureTargets: targets };
}
