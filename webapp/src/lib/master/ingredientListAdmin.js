// ── เขียน Ingredient List ลงทะเบียนสูตร + ปิดแถวคำร้องที่รออยู่ (ม-159) — server only ─────────────────────
//
// ⭐ **ทางเขียนเดียวของทั้งระบบ** — หน้า "รอใส่ราคา" · ปุ่มบนแถวในหน้าคำร้อง (`items/[itemId]/ingredients`) · การ์ดหน้าสูตร
//   (`PATCH formulas/[id]` action `ingredients`) เรียกตัวนี้ตัวเดียว ⇒ ใส่ที่ไหนก็ปิดแถวที่ "รอ Ingredient List" เหมือนกัน
//   (มติเจ้าของ 03/11/2026: แยกก้าวจากราคา แต่ต้องครบถึงจบงาน · ใส่ได้สามที่)
//
// ⚠️ แถวที่ปิดได้ = ผูกสูตรนี้ · ลูกค้าคอนเฟิร์มแล้ว · ราคาลงแล้ว (`rowStage` = awaiting_ingredients) · ใบยังเปิดอยู่
//   (ด่านใบเปิดชุดเดียวกับขั้นราคา — ใบปิด/ยกเลิกแล้วไม่ถูกแตะ)
import { REQUEST_OPEN_STATUSES } from '@/lib/requests/statuses';
import { rowStage } from '@/lib/requests/rowStage';
import { findRequest } from '@/lib/materialPricesAdmin';
import { settleRow } from '@/lib/requests/rowSettle';
import { updateFormula } from '@/lib/master/scentFormulaAdmin';
import { appendUpdate } from '@/lib/master/updates';
import { recordAudit } from '@/lib/audit';
import { INGREDIENT_LIST_LABEL } from '@/lib/master/ingredientList';

/**
 * @param formula แถวสูตรก่อนแก้ (อ่านจากฐานแล้ว)
 * @param value   ค่าที่ผ่าน `ingredientListInput` แล้ว (null = ลบ — ผู้เรียกกันสูตรที่ต้องมีไว้แล้ว)
 * @param via     ข้อความที่มาสำหรับ audit (เช่น "จากคำร้อง RQ-…") · null = หน้าสูตร
 * คืน `{ formula, settled: [{ requestId, docNo, itemId }] }`
 */
export async function saveFormulaIngredientList(supabase, { formula, value, user, request = null, via = null }) {
  let after = formula;
  if ((formula.ingredientList || null) !== value) {
    after = await updateFormula(supabase, formula.id, { ingredientList: value });
    const verb = formula.ingredientList ? (value ? 'แก้' : 'ลบ') : 'ใส่';
    await recordAudit({
      user, action: 'update', entityType: 'formula', entityId: formula.id, request,
      before: formula, after,
      summary: `${verb} ${INGREDIENT_LIST_LABEL} สูตร ${after?.code || after?.name || formula.id}${via ? ` ${via}` : ''}`,
    });
  }
  const settled = value ? await settleRowsAwaitingIngredients(supabase, { formula: after, user, request }) : [];
  return { formula: after, settled };
}

/* แถวที่รอ Ingredient List ของสูตรนี้ → เสร็จแล้ว (ใบละหนึ่งบรรทัดเธรด + audit) */
async function settleRowsAwaitingIngredients(supabase, { formula, user, request }) {
  const { data: rows, error } = await supabase.from('dept_request_items')
    .select('id, "requestId"')
    .eq('producedFormulaId', formula.id)
    .eq('outcome', 'confirmed')
    .not('answeredRevisionId', 'is', null)
    .not('answerStatus', 'in', '("done","declined")')
    .order('id');
  if (error) throw error;
  const requestIds = [...new Set((rows || []).map((r) => r.requestId))];
  const settled = [];
  const target = formula.code || formula.name || formula.id;
  for (const requestId of requestIds) {
    const ask = await findRequest(supabase, requestId);
    if (!ask || !REQUEST_OPEN_STATUSES.includes(ask.status)) continue;
    const waiting = (ask.items || []).filter((i) => i.producedFormulaId === formula.id
      && rowStage(i) === 'awaiting_ingredients');
    if (!waiting.length) continue;
    const nowIso = new Date().toISOString();
    for (const row of waiting) {
      await settleRow(supabase, { id: requestId, itemId: row.id, revisionId: row.answeredRevisionId, user, nowIso });
      settled.push({ requestId, docNo: ask.docNo || null, itemId: row.id });
    }
    await appendUpdate(supabase, {
      entityType: 'dept_request', entityId: requestId, kind: 'ingredients',
      body: `ใส่ ${INGREDIENT_LIST_LABEL} สูตร ${target} — ${waiting.length} รายการครบแล้ว (ราคา + ${INGREDIENT_LIST_LABEL})`,
      user,
    }).catch(() => {});
    await recordAudit({
      user, action: 'update', entityType: 'dept_request', entityId: requestId, request,
      before: { items: waiting }, after: { items: waiting.map((r) => ({ ...r, answerStatus: 'done' })) },
      summary: `ปิดรายการที่รอ ${INGREDIENT_LIST_LABEL} สูตร ${target} (${ask.docNo || requestId})`,
    });
  }
  return settled;
}
