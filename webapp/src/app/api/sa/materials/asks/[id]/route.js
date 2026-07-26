// ── API เคสขอราคาวัสดุรายเคส (mig 0158) ─────────────────────────────────
// GET    : รายละเอียดเคส (canViewCosting)
// PATCH  : submit (ผู้ขอ — ออกเลข PM-/RM- + แจ้ง space ฝ่าย)
//          acknowledge (RD/PC รับเรื่อง) · close (ปิดเคส) · cancel (ผู้ขอยกเลิก)
// DELETE : ร่างที่ยังไม่ส่ง (+ admin ?force=1 ผ่าน RPC)
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canViewCosting, isSuperuser } from '@/lib/permissions';
import {
  acknowledgeAskError, canAnswerAsk, canManageAsk, cancelAskError, closeAskError,
  deleteAskError, generateAskDocNo, submitAskError,
} from '@/lib/materialAsks';
import { findAsk } from '@/lib/materialPricesAdmin';
import { syncCostingPricingStatus } from '@/lib/costingAdmin';
import { chatCard, sendChat } from '@/lib/chat';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  try {
    const user = await getCurrentUser();
    if (!canViewCosting(user)) return Response.json({ error: 'forbidden' }, { status: 403 });
    const { id } = await params;
    const ask = await findAsk(getSupabaseAdmin(), id);
    if (!ask) return Response.json({ error: 'ไม่พบเคสขอราคา' }, { status: 404 });
    // ฝั่ง client ไม่รู้ user id ของตัวเอง (roleContext มีแค่ role/team/ฝ่าย) —
    // ติดธงมาจาก server ให้ปุ่มส่ง/ยกเลิกโผล่เฉพาะกับผู้เปิดเคสจริง ๆ
    return Response.json(
      { ...ask, _mine: canManageAsk(user, ask) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  const { id } = await params;

  const before = await findAsk(supabase, id);
  if (!before) return Response.json({ error: 'ไม่พบเคสขอราคา' }, { status: 404 });
  if (!canViewCosting(user)) return Response.json({ error: 'forbidden' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const action = body.action;
  const nowIso = new Date().toISOString();
  const patch = { updatedAt: nowIso };
  let summary = '';

  try {
    if (action === 'submit') {
      if (!canManageAsk(user, before)) {
        return Response.json({ error: 'ส่งเคสได้เฉพาะผู้เปิดเคส' }, { status: 403 });
      }
      const err = submitAskError(before, before.items);
      if (err) return Response.json({ error: err }, { status: 409 });
      // เลขออกตอนนี้เท่านั้น — ร่างที่ถูกทิ้งจะได้ไม่กินเลขจนขาดช่วง
      patch.docNo = await generateAskDocNo(supabase, before.dept);
      patch.status = 'pending';
      patch.submittedAt = nowIso;
      summary = `ส่งเคสขอราคา ${patch.docNo} ถึงฝ่าย ${before.dept}`;
    } else if (action === 'acknowledge') {
      if (!canAnswerAsk(user, before)) {
        return Response.json({ error: `รับเรื่องได้เฉพาะฝ่าย ${before.dept}` }, { status: 403 });
      }
      const err = acknowledgeAskError(before);
      if (err) return Response.json({ error: err }, { status: 409 });
      patch.status = 'acknowledged';
      patch.acknowledgedById = user?.id ?? null;
      patch.acknowledgedByName = user?.name ?? null;
      patch.acknowledgedAt = nowIso;
      summary = `รับเรื่องเคส ${before.docNo || id}`;
    } else if (action === 'close') {
      if (!canManageAsk(user, before) && !canAnswerAsk(user, before)) {
        return Response.json({ error: 'ไม่มีสิทธิ์ปิดเคสนี้' }, { status: 403 });
      }
      const err = closeAskError(before, before.items);
      if (err) return Response.json({ error: err }, { status: 409 });
      patch.status = 'closed';
      patch.closedById = user?.id ?? null;
      patch.closedByName = user?.name ?? null;
      patch.closedAt = nowIso;
      summary = `ปิดเคส ${before.docNo || id}`;
    } else if (action === 'cancel') {
      if (!canManageAsk(user, before)) {
        return Response.json({ error: 'ยกเลิกได้เฉพาะผู้เปิดเคส' }, { status: 403 });
      }
      const err = cancelAskError(before);
      if (err) return Response.json({ error: err }, { status: 409 });
      const reason = String(body.cancelReason ?? '').trim();
      if (!reason) return Response.json({ error: 'ต้องระบุเหตุผลที่ยกเลิก' }, { status: 400 });
      patch.status = 'cancelled';
      patch.cancelReason = reason.slice(0, 500);
      patch.cancelledAt = nowIso;
      summary = `ยกเลิกเคส ${before.docNo || id}`;
    } else {
      return Response.json({ error: 'action ไม่ถูกต้อง' }, { status: 400 });
    }

    const { error } = await supabase.from('material_price_asks').update(patch).eq('id', id);
    if (error) throw error;

    // ใบขอราคาผลิตที่เคสนี้ถามแทน: เปิดเคส = ใบเป็น 'pricing', ปิด/ยกเลิก = คืนสถานะ
    if (before.costingRequestId) await syncCostingPricingStatus(supabase, before.costingRequestId);

    const after = await findAsk(supabase, id);
    await recordAudit({
      user, action: 'update', entityType: 'material_price_ask', entityId: id, before, after, summary, request,
    });

    // แจ้งฝ่ายเจ้าของเมื่อมีเคสใหม่เข้าคิว (space rd/pc ตามฝ่าย)
    if (action === 'submit') {
      sendChat(after.dept === 'PC' ? 'pc' : 'rd', chatCard({
        title: `เคสขอราคาใหม่ ${after.docNo}`,
        subtitle: after.customerName || 'ราคากลาง',
        rows: [
          { label: 'ผู้ขอ', value: after.requestedByName || '' },
          { label: 'รายการ', value: `${(after.items || []).length} รายการ` },
        ],
        linkPath: `/sa/materials/asks/${id}`,
        linkLabel: 'เปิดเคส',
      }));
    }
    // ผู้ขอควรรู้ว่ามีคนรับเรื่องแล้ว ไม่ต้องเดาว่าเงียบเพราะอะไร
    if (action === 'acknowledge') {
      sendChat('sales', chatCard({
        title: `รับเรื่องเคส ${after.docNo} แล้ว`,
        subtitle: `ฝ่าย ${after.dept} กำลังหาราคา`,
        rows: [{ label: 'ผู้รับเรื่อง', value: after.acknowledgedByName || '' }],
        linkPath: `/sa/materials/asks/${id}`,
        linkLabel: 'เปิดเคส',
      }));
    }
    return Response.json({ ...after, _mine: canManageAsk(user, after) });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  const { id } = await params;

  const before = await findAsk(supabase, id);
  if (!before) return Response.json({ error: 'ไม่พบเคสขอราคา' }, { status: 404 });
  if (!canViewCosting(user)) return Response.json({ error: 'forbidden' }, { status: 403 });

  const force = new URL(request.url).searchParams.get('force') === '1';
  if (force) {
    if (!isSuperuser(user?.role)) return Response.json({ error: 'ต้องเป็นผู้ดูแลระบบ' }, { status: 403 });
  } else {
    if (!canManageAsk(user, before)) return Response.json({ error: 'ไม่มีสิทธิ์ลบเคสนี้' }, { status: 403 });
    const err = deleteAskError(before);
    if (err) return Response.json({ error: err }, { status: 409 });
  }

  // guard ระดับ DB บล็อกการลบเคสที่ส่งแล้ว — admin ต้องผ่าน RPC ที่ตั้ง flag ให้
  const { error } = force
    ? await supabase.rpc('force_delete_material_ask', { p_id: id })
    : await supabase.from('material_price_asks').delete().eq('id', id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (before.costingRequestId) await syncCostingPricingStatus(supabase, before.costingRequestId);

  await recordAudit({
    user, action: 'delete', entityType: 'material_price_ask', entityId: id, before,
    summary: force ? `ลบเคส ${before.docNo || id} (force)` : 'ลบเคสร่างที่ยังไม่ส่ง', request,
  });
  return Response.json({ ok: true });
}
