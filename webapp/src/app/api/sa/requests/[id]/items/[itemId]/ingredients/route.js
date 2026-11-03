// ── ใส่ Ingredient List จากแถวคำร้องที่ลูกค้าคอนเฟิร์มแล้ว (ม-159 · มติเจ้าของ 03/11/2026) ─────────────────────
//
// POST { ingredientList }
//
// ⭐ **ก้าวแยกจากราคา** — *"ingredient list กับ ราคา RD จะได้มาไม่พร้อมกัน … แยกส่วนกันดีกว่า แต่ต้องใส่ครบถึงจะจบงาน"*
//   ใส่ก่อนหรือหลังราคาก็ได้: ราคาลงแล้ว = แถวจบทันที (ตัวเขียนปิดให้) · ยังไม่มีราคา = แถวยังเป็น "รอใส่ราคา"
// ⚠️ ค่าไปลง **ทะเบียนสูตร** ไม่ใช่แถว — ผ่าน `saveFormulaIngredientList` ตัวเดียวกับการ์ดหน้าสูตร ⇒ แถวอื่นที่รอสูตรเดียวกัน
//   (ใบอื่น · direction อื่น) จบไปพร้อมกัน
// ⚠️ ด่านชุดเดียวกับขั้นราคา (`price/route.js`): อ่านใบได้ · ตอบฝ่ายนี้ได้ · ใบเปิดอยู่ · แถวคอนเฟิร์มแล้วยังไม่จบ ·
//   สูตรของแถว (สด) ต้องมี Ingredient List (`rowIngredientPlan` ตัวเดียวกับจอ)
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canViewRequests } from '@/lib/permissions';
import { REQUEST_OPEN_STATUSES, REQUEST_STATUS_LABELS } from '@/lib/requests/statuses';
import { canAnswerRequest, canReadRequestRow } from '@/lib/deptRequests';
import { isConfirmedOpenRow } from '@/lib/requests/rowStage';
import { findRequest } from '@/lib/materialPricesAdmin';
import { findFormula } from '@/lib/master/scentFormulaAdmin';
import { INGREDIENT_LIST_LABEL, ingredientListInput, rowIngredientPlan } from '@/lib/master/ingredientList';
import { saveFormulaIngredientList } from '@/lib/master/ingredientListAdmin';

export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  const { id, itemId } = await params;

  if (!canViewRequests(user)) return Response.json({ error: 'forbidden' }, { status: 403 });
  const before = await findRequest(supabase, id);
  if (!before) return Response.json({ error: 'ไม่พบคำร้อง' }, { status: 404 });
  if (!canReadRequestRow(user, before)) {
    return Response.json({ error: 'คำร้องนี้ไม่ใช่ของคุณ และไม่ได้ส่งถึงฝ่ายของคุณ' }, { status: 403 });
  }
  if (!canAnswerRequest(user, before)) {
    return Response.json({ error: `ใส่ ${INGREDIENT_LIST_LABEL} ได้เฉพาะฝ่าย ${before.dept}` }, { status: 403 });
  }
  if (!REQUEST_OPEN_STATUSES.includes(before.status)) {
    return Response.json({
      error: `คำร้องอยู่สถานะ "${REQUEST_STATUS_LABELS[before.status] || before.status}" — ใส่ ${INGREDIENT_LIST_LABEL} ไม่ได้`,
    }, { status: 409 });
  }
  const row = (before.items || []).find((i) => i.id === itemId);
  if (!row) return Response.json({ error: 'ไม่พบรายการในคำร้องนี้' }, { status: 404 });
  if (!isConfirmedOpenRow(row)) {
    return Response.json({
      error: `ใส่ ${INGREDIENT_LIST_LABEL} ได้เมื่อลูกค้าคอนเฟิร์มรายการนี้แล้วและยังไม่จบ`,
    }, { status: 409 });
  }

  let formula;
  try {
    formula = row.producedFormulaId ? await findFormula(supabase, row.producedFormulaId) : null;
  } catch (e) {
    return Response.json({ error: `อ่านทะเบียนสูตรไม่สำเร็จ: ${e.message}` }, { status: 500 });
  }
  if (!rowIngredientPlan(formula).required) {
    return Response.json({
      error: `รายการนี้ไม่ต้องมี ${INGREDIENT_LIST_LABEL} (ไม่ผูกสูตร หรือเป็นสูตรหัวน้ำหอม 02-020)`,
    }, { status: 409 });
  }

  const body = await request.json().catch(() => ({}));
  const { value, error } = ingredientListInput(body.ingredientList);
  if (error) return Response.json({ error }, { status: 400 });

  try {
    await saveFormulaIngredientList(supabase, {
      formula, value, user, request, via: `จากคำร้อง ${before.docNo || id}`,
    });
    return Response.json(await findRequest(supabase, id));
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}
