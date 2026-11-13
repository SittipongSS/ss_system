// ── งานในไทม์ไลน์ใช้สิทธิ์ของ "ดีล" (งวด P2b ของการยุบดีล/โครงการ · มติเจ้าของ 13/11/2026) ─────────────
//
// ดีลคือหน่วยเดียวของงานขาย ⇒ ขั้นตอนที่มี `dealId` ใช้ขอบเขตของดีลตัดสินว่าใครแก้ได้ ไม่ว่าจะมี
// `projectId` ติดอยู่หรือไม่ (เดิม: มีโครงการ = ใช้ขอบเขตโครงการ · ลอย = ใช้ดีล)
// ขั้นตอนกลางของโครงการ (dealId ว่าง · สหมิตร/ข้อมูลก่อน backfill) ยังใช้ขอบเขตโครงการเหมือนเดิม
//
// แถวขอบเขต = รูปเดียวกับที่ `inScope` / `inPmProjectScope` / `pmTaskEditTier` อ่าน:
//   team → ขอบเขตทีม · ownerId → ขอบเขตของตัวเอง · aeOwner → ชื่อผู้ดูแลแบบเดิมของโครงการ
// 🐞 แถวเดิมของงานลอยไม่มี ownerId ⇒ บทบาทที่มีขอบเขต "ของตัวเอง" แก้ไทม์ไลน์ดีลของตัวเองไม่ได้

export const DEAL_SCOPE_COLUMNS = 'id, team, ownerId, ownerName, projectId';

export function dealScopeRow(deal) {
  if (!deal) return null;
  return { team: deal.team, ownerId: deal.ownerId, aeOwner: deal.ownerName };
}

/**
 * ขั้นตอน + แถวขอบเขต + โครงการ (ถ้ามี — ยังใช้กับด่านโครงการปิดและจุดยึดวันของกราฟ)
 * @returns {{ task, deal, project, scopeRow }}
 */
export async function loadTaskScope(supabase, id) {
  const { data: task, error: taskError } = await supabase.from('project_tasks').select('*').eq('id', id).maybeSingle();
  if (taskError) throw taskError;
  if (!task) return { task: null, deal: null, project: null, scopeRow: null };
  let deal = null;
  if (task.dealId) {
    const { data, error } = await supabase.from('sales_deals').select(DEAL_SCOPE_COLUMNS).eq('id', task.dealId).maybeSingle();
    if (error) throw error;
    deal = data;
  }
  let project = null;
  if (task.projectId) {
    const { data, error } = await supabase.from('projects').select('*').eq('id', task.projectId).maybeSingle();
    if (error) throw error;
    project = data;
  }
  return { task, deal, project, scopeRow: deal ? dealScopeRow(deal) : project };
}
