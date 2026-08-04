// ── ก้าวของแถวคำร้อง (mig 0202) ──────────────────────────────────────────
//
// PATCH { hop: 'ack'|'ready'|'pickup'|'send'|'outcome', at?, dueAt?, outcome?,
//         confirmedQty?, note? }
//
// ⭐ ทำไมเป็นเส้นรายแถว ไม่ใช่ action บน PATCH ของใบ: **สถานะอยู่ที่แถว ไม่ใช่ที่ใบ**
// (คนละหมวดส่งไม่พร้อมกันได้) ⇒ การกดแต่ละก้าวเป็นเรื่องของแถวนั้นล้วน ๆ
//
// ⚠️ ด่านเรียงสามชั้น และ **ห้ามสลับลำดับ**:
//   1 อ่านใบนี้ได้ไหม (canReadRequestRow — ด่านเดียวกับ GET)
//   2 ก้าวนี้เป็นของฝั่งเรารึเปล่า (HOP_OWNER)
//   3 แถวอยู่ขั้นที่เดินก้าวนี้ได้ไหม + ค่าที่ส่งมาครบไหม (hops.js)
// สลับ 1 กับ 2 เมื่อไร คนนอกจะรู้ได้ว่า id นี้มีอยู่จริงจากข้อความ error ที่ต่างกัน
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canViewCosting } from '@/lib/permissions';
import {
  canAnswerRequest, canManageRequest, canReadRequestRow, deriveRequestStatusAfterAnswer,
} from '@/lib/deptRequests';
import {
  HOP_OWNER, hopLabel, hopPatch, hopStageError, hopUpdateKind, hopValuesError,
} from '@/lib/requests/hops';
import { findRequest } from '@/lib/materialPricesAdmin';
import { appendUpdate } from '@/lib/master/updates';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function PATCH(request, { params }) {
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  const { id, itemId } = await params;

  if (!canViewCosting(user)) return Response.json({ error: 'forbidden' }, { status: 403 });

  const before = await findRequest(supabase, id);
  if (!before) return Response.json({ error: 'ไม่พบคำร้อง' }, { status: 404 });
  if (!canReadRequestRow(user, before)) {
    return Response.json(
      { error: 'คำร้องนี้ไม่ใช่ของคุณ และไม่ได้ส่งถึงฝ่ายของคุณ' }, { status: 403 },
    );
  }

  const row = (before.items || []).find((i) => i.id === itemId);
  if (!row) return Response.json({ error: 'ไม่พบรายการในคำร้องนี้' }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const hop = body.hop;
  const owner = HOP_OWNER[hop];
  if (!owner) return Response.json({ error: 'ก้าวไม่ถูกต้อง' }, { status: 400 });

  // ── 2) ก้าวนี้เป็นของฝั่งไหน ────────────────────────────────────────────
  // ⚠️ ผู้สังเกตการณ์ (executive) อ่านได้ทุกใบ แต่กดก้าวไม่ได้ — canAnswerRequest /
  // canManageRequest ไม่ให้ผ่านอยู่แล้ว ไม่ต้องกันซ้ำ
  const allowed = owner === 'dept'
    ? canAnswerRequest(user, before)
    : canManageRequest(user, before);
  if (!allowed) {
    return Response.json({
      error: owner === 'dept'
        ? `ก้าวนี้เป็นของฝ่าย ${before.dept}`
        : 'ก้าวนี้เป็นของผู้เปิดคำร้อง',
    }, { status: 403 });
  }

  // ── 3) ขั้นตอน + ค่าที่ส่งมา ────────────────────────────────────────────
  const stageError = hopStageError(row, hop);
  if (stageError) return Response.json({ error: stageError }, { status: 409 });
  const valueError = hopValuesError(hop, body);
  if (valueError) return Response.json({ error: valueError }, { status: 400 });

  const nowIso = new Date().toISOString();
  const today = nowIso.slice(0, 10);

  try {
    const patch = { ...hopPatch(hop, body, user, today), updatedAt: nowIso };
    const { error } = await supabase.from('dept_request_items').update(patch).eq('id', itemId);
    if (error) throw error;

    // ── ใบตามแถว ────────────────────────────────────────────────────────
    // รับเรื่องแถวแรก = รับเรื่องทั้งใบ (ใบที่ยังเป็น pending ต้องขยับตาม ไม่งั้น
    // คิวจะโชว์ว่า "ยังไม่มีใครรับ" ทั้งที่ฝ่ายลงมือไปแล้ว)
    const headPatch = {};
    if (hop === 'ack' && before.status === 'pending') {
      headPatch.status = 'acknowledged';
      headPatch.acknowledgedById = user?.id ?? null;
      headPatch.acknowledgedByName = user?.name ?? null;
      headPatch.acknowledgedAt = nowIso;
    }
    // ตอบครบทุกแถว → ใบเป็น answered เอง (กลไกเดิม ไม่แก้)
    const after = await findRequest(supabase, id);
    const derived = deriveRequestStatusAfterAnswer(after.items || [], after.status);
    if (derived !== after.status) headPatch.status = derived;
    if (Object.keys(headPatch).length) {
      const { error: headError } = await supabase
        .from('dept_requests').update({ ...headPatch, updatedAt: nowIso }).eq('id', id);
      if (headError) throw headError;
    }

    // ── ร่องรอย ─────────────────────────────────────────────────────────
    // ⚠️ ลงเธรดของ **ใบ** ไม่ใช่ของแถว — เธรดมีชุดเดียวต่อคำร้อง (ไม่มีเธรดซ้อนรายขั้น)
    const label = hopLabel(hop, body.outcome);
    await appendUpdate(supabase, {
      entityType: 'dept_request',
      entityId: id,
      kind: hopUpdateKind(hop, body.outcome),
      body: `${label} — ${row.label}`,
      user,
    }).catch(() => {});

    await recordAudit({
      user, action: 'update', entityType: 'dept_request', entityId: id,
      before: row, after: { ...row, ...patch },
      summary: `${label}: ${row.label} (${before.docNo || id})`, request,
    });

    return Response.json(await findRequest(supabase, id));
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
