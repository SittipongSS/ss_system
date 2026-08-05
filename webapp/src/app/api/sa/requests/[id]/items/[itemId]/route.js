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
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canViewRequests } from '@/lib/permissions';
import {
  REQUEST_OPEN_STATUSES, REQUEST_STATUS_LABELS,
  canAnswerRequest, canManageRequest, canReadRequestRow, deriveRequestStatusAfterAnswer,
} from '@/lib/deptRequests';
import {
  HOP_OWNER, followUpRowFrom, hopLabel, hopPatch, hopStageError, hopUpdateKind, hopValuesError,
} from '@/lib/requests/hops';
import { findRequest } from '@/lib/materialPricesAdmin';
import { businessDate } from '@/lib/businessDate';
import { normalizeFormulaDelivery } from '@/lib/requests/delivery';
import { findFormulaByIdentity } from '@/lib/master/formulas';
import { createFormula, loadFormulas } from '@/lib/master/scentFormulaAdmin';
import { appendUpdate } from '@/lib/master/updates';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function PATCH(request, { params }) {
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  const { id, itemId } = await params;

  if (!canViewRequests(user)) return Response.json({ error: 'forbidden' }, { status: 403 });

  const before = await findRequest(supabase, id);
  if (!before) return Response.json({ error: 'ไม่พบคำร้อง' }, { status: 404 });
  if (!canReadRequestRow(user, before)) {
    return Response.json(
      { error: 'คำร้องนี้ไม่ใช่ของคุณ และไม่ได้ส่งถึงฝ่ายของคุณ' }, { status: 403 },
    );
  }

  const row = (before.items || []).find((i) => i.id === itemId);
  if (!row) return Response.json({ error: 'ไม่พบรายการในคำร้องนี้' }, { status: 404 });

  // ⚠️ ใบต้องเปิดอยู่ — hopStageError ดูแต่ขั้นของ *แถว* ซึ่งไม่รู้เรื่องใบเลย ⇒ แถวใน
  // ใบร่าง (ยังไม่ส่ง) หรือใบที่ถูกยกเลิก/ปิดไปแล้ว จะเดินก้าวได้ทั้งที่ไม่ควร
  if (!REQUEST_OPEN_STATUSES.includes(before.status)) {
    return Response.json({
      error: `คำร้องอยู่สถานะ "${REQUEST_STATUS_LABELS[before.status] || before.status}" — บันทึกขั้นตอนของรายการไม่ได้`,
    }, { status: 409 });
  }

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

  // ── ส่งของของ "พัฒนาผลิตภัณฑ์" = สูตรเข้าทะเบียนในจังหวะเดียวกัน (P4b) ──
  //
  // ⭐ ต่างจากพัฒนากลิ่นตรงที่ **แถวมีอยู่แล้ว** ⇒ เป็นการขยายก้าว `ready`
  // ไม่ใช่สร้างแถวใหม่ · หมวดกับกลิ่นอยู่บนแถวแล้วและ **คือตัวตนของสูตรพอดี**
  // จึงไม่ถามซ้ำ (ถามซ้ำ = เปิดทางให้กรอกต่างจากที่ขอไว้)
  let formulaDelivery = null;
  if (hop === 'ready' && row.lineKind === 'product_dev') {
    const { value, error } = normalizeFormulaDelivery(body);
    if (error) return Response.json({ error }, { status: 400 });
    formulaDelivery = value;
  }

  const nowIso = new Date().toISOString();
  // ⚠️ วันของก้าวต้องเป็น **วันไทย** ไม่ใช่วัน UTC — ระหว่างเที่ยงคืนถึง 07:00 น.
  // ของไทย UTC ยังเป็นเมื่อวาน ⇒ ก้าวที่กดตอนเช้ามืดจะถูกบันทึกล่วงหน้าไปหนึ่งวัน
  // และเส้นวัด lead time จะติดลบทั้งแถว
  const today = businessDate();

  try {
    const patch = { ...hopPatch(hop, body, user, today), updatedAt: nowIso };

    if (formulaDelivery) {
      // ⚠️ **หมวด × กลิ่นคู่นี้อาจมีสูตรอยู่แล้ว** — เช่นรอบแก้ที่กลับมาที่ของเดิม
      // ⇒ ผูกกับตัวเดิม ไม่ใช่ตีกลับให้ผู้ใช้ไปแก้เอง (ล้มแล้วแถวจะค้างตลอดกาล
      // เพราะไม่มีทางผูกเข้าสูตรที่ชนอยู่ — บทเรียนเดียวกับ "จัดระเบียบ" ของ 0171)
      const existing = findFormulaByIdentity(
        await loadFormulas(supabase, { status: null }),
        { categoryCode: row.categoryCode, scentId: row.scentId },
      );
      const formula = existing || await createFormula(supabase, {
        name: formulaDelivery.name,
        code: formulaDelivery.code,
        formulaDate: formulaDelivery.formulaDate,
        categoryCode: row.categoryCode,
        scentId: row.scentId,
        dealId: before.dealId || null,
      }, user, { accepted: true });
      patch.producedFormulaId = formula.id;
      // ป้ายบนแถวเป็น snapshot ตอนขอ (หมวด · กลิ่น) — เติมรหัสสูตรที่ได้จริงต่อท้าย
      // ให้อ่านออกจากในคำร้องว่าได้สูตรตัวไหน โดยไม่ต้องเปิดทะเบียน
      patch.label = `${row.label} → ${formula.code || formula.name}`;
    }
    const { error } = await supabase.from('dept_request_items').update(patch).eq('id', itemId);
    if (error) throw error;

    // ── ลูกค้าขอให้แก้ = เกิดแถวใหม่เอง ─────────────────────────────────
    // ⭐ ไม่ใช่ปุ่มแยก — มันเป็น **ผลลัพธ์** ของการบันทึกคำตอบ ไม่ใช่การกระทำ
    // ถ้าให้คนกดเอง จะมีช่วงที่คำร้องค้างโดยไม่มีใครเห็นว่ายังมีงานเหลือ
    if (hop === 'outcome' && body.outcome === 'revise') {
      const nextOrder = Math.max(0, ...(before.items || []).map((i) => i.sortOrder || 0)) + 1;
      const { error: nextError } = await supabase.from('dept_request_items').insert({
        id: `DRI-${randomUUID()}`,
        ...followUpRowFrom(row, nextOrder),
        createdAt: nowIso,
        updatedAt: nowIso,
      });
      if (nextError) throw nextError;
    }

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
