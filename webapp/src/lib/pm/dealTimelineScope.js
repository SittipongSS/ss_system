// ── งานในไทม์ไลน์ใช้สิทธิ์ของ "ดีล" (งวด P2b ของการยุบดีล/โครงการ · มติเจ้าของ 13/11/2026) ─────────────
//
// ดีลคือหน่วยเดียวของงานขาย ⇒ ขั้นตอนใช้ขอบเขตของดีลตัดสินว่าใครแก้ได้ ไม่ว่าจะมี `projectId` ค้างอยู่หรือไม่
// ⭐ งวด P3b-2 ยุบโครงการ (16/11/2026): ถอดสาขา "ขั้นตอนกลางของโครงการ" (dealId ว่าง — prod มี 0 แถว) และด่าน/จุดยึดวัน
//    ของโครงการ ⇒ ไม่อ่านตาราง `projects` แล้ว · ขั้นที่ไม่มีดีล = ไม่มีขอบเขตให้ตัดสิน (scopeRow ว่าง → ด่านสิทธิ์ปฏิเสธ)
//
// แถวขอบเขต = รูปเดียวกับที่ `inScope` / `inPmProjectScope` / `pmTaskEditTier` อ่าน:
//   team → ขอบเขตทีม · ownerId → ขอบเขตของตัวเอง · aeOwner → ชื่อเจ้าของดีล
// 🐞 แถวเดิมของงานลอยไม่มี ownerId ⇒ บทบาทที่มีขอบเขต "ของตัวเอง" แก้ไทม์ไลน์ดีลของตัวเองไม่ได้

export const DEAL_SCOPE_COLUMNS = 'id, team, ownerId, ownerName';

export function dealScopeRow(deal) {
  if (!deal) return null;
  return { team: deal.team, ownerId: deal.ownerId, aeOwner: deal.ownerName };
}

/**
 * ขั้นตอน + ดีล + แถวขอบเขต
 * @returns {{ task, deal, scopeRow }}
 */
export async function loadTaskScope(supabase, id) {
  const { data: task, error: taskError } = await supabase.from('project_tasks').select('*').eq('id', id).maybeSingle();
  if (taskError) throw taskError;
  if (!task) return { task: null, deal: null, scopeRow: null };
  let deal = null;
  if (task.dealId) {
    const { data, error } = await supabase.from('sales_deals').select(DEAL_SCOPE_COLUMNS).eq('id', task.dealId).maybeSingle();
    if (error) throw error;
    deal = data;
  }
  return { task, deal, scopeRow: dealScopeRow(deal) };
}
