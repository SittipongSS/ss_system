// ── จบแถวขั้นท้าย (ราคา · Ingredient List) — server only ─────────────────────────────────────────────
//
// ⭐ **ตัวเดียวที่พลิกแถวที่คอนเฟิร์มแล้วเป็น "เสร็จแล้ว"** — ทางใส่ราคาใหม่ · "ใช้ราคานี้" · ตัวเขียน Ingredient List (ม-159)
//   ต้องจบแถวแบบเดียวกันทุกช่อง (ตราปิดฝั่งฝ่าย + actorSide) · ยกมาจาก `items/[itemId]/price/route.js` ทั้งก้อน
//
// ⭐ **ราคากับ Ingredient List มาไม่พร้อมกัน** (มติเจ้าของ 03/11/2026) — ใส่ราคาก่อนแล้วสูตรยังไม่มี Ingredient List
//   = `recordRowPrice` (ประทับ rev ไว้ แถวยังไม่จบ → `rowStage` = awaiting_ingredients) · ครบแล้วค่อย `settleRow`
import { findRequest } from '@/lib/materialPricesAdmin';
import { requestRowsClosurePatch } from '@/lib/requests/stages';
import { requestActorSide } from '@/lib/requests/replyTurn';

/* ── ปิดแถวด้วย rev ราคา + ตราปิดฝั่งฝ่ายของใบ ── */
export async function settleRow(supabase, { id, itemId, revisionId, user, nowIso }) {
  const { error } = await supabase.from('dept_request_items').update({
    answerStatus: 'done',
    answeredRevisionId: revisionId,
    declineReason: null,
    answeredById: user?.id ?? null,
    answeredByName: user?.name ?? null,
    answeredAt: nowIso,
    updatedAt: nowIso,
  }).eq('id', itemId);
  if (error) throw error;

  // ตอบครบทุกแถว → ใบได้ตราปิดฝั่งฝ่าย (`answeredAt`) เอง — ดู `closure.js`
  const after = await findRequest(supabase, id);
  const closurePatch = requestRowsClosurePatch(after, after.items || [], nowIso, {
    actorSide: requestActorSide(user, after),
  });
  if (Object.keys(closurePatch).length) {
    const { error: headError } = await supabase.from('dept_requests')
      .update({ ...closurePatch, updatedAt: nowIso }).eq('id', id);
    if (headError) throw headError;
  }
}

/* ── ใส่ราคาแล้วแต่ยังขาด Ingredient List — ประทับ rev ไว้ แถวยังไม่จบ (ม-159) ──
   ⚠️ ไม่แตะ answerStatus/ตราผู้ตอบ — คนที่ทำให้แถว "ครบ" คือคนที่ปิดมันจริง (`settleRow` ตอนใส่ Ingredient List) */
export async function recordRowPrice(supabase, { itemId, revisionId, nowIso }) {
  const { error } = await supabase.from('dept_request_items').update({
    answeredRevisionId: revisionId,
    updatedAt: nowIso,
  }).eq('id', itemId);
  if (error) throw error;
}
