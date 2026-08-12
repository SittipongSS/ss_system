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
  HOP_OWNER, followUpRowFrom, hopLabel, hopLabelFor, hopPatch, hopStageError, hopUpdateKind,
  hopValuesError,
} from '@/lib/requests/hops';
import { isDocLineKind } from '@/lib/requests/docTypes';
import { findRequest } from '@/lib/materialPricesAdmin';
import { businessDate } from '@/lib/businessDate';
import { normalizeFormulaDelivery } from '@/lib/requests/delivery';
import { reworkHopError } from '@/lib/requests/rework';
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

  // ⚠️ **สายพัฒนากลิ่นส่งของผ่านโมดัลเท่านั้น** — ปุ่มบนรางประทับแค่วัน ไม่สร้าง
  // กลิ่นเข้าทะเบียน ⇒ แถวจะออกจากคิวรอเติมทั้งที่ยังไม่มีกลิ่นผูก แล้วค้างถาวร
  const reworkError = reworkHopError(row, hop);
  if (reworkError) return Response.json({ error: reworkError }, { status: 409 });

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

  // ── ส่งเอกสารต้องมีไฟล์แนบบนแถวก่อน (ม-89) ─────────────────────────────
  //
  // ⭐ มติผู้ใช้: "การส่งเอกสาร RD ต้องแนบไฟล์เอกสารด้วย หลายไฟล์ได้" — ก้าวส่ง
  // ของสายเอกสารที่ไม่มีไฟล์คือการบอกว่า "ส่งแล้ว" ทั้งที่ไม่มีอะไรให้รับ ⇒ SA กด
  // "ได้รับแล้ว" ไม่ได้จริง และแท็บเอกสารของดีลจะขึ้นแถวที่เปิดแล้วว่างเปล่า
  // · หลายไฟล์ได้อยู่แล้ว (AttachmentsPanel ไม่จำกัดจำนวน) — ด่านนี้ขอแค่ ≥ 1
  if (hop === 'ready' && isDocLineKind(row.lineKind)) {
    const { count, error: fileError } = await supabase
      .from('attachments').select('id', { count: 'exact', head: true })
      .eq('entityType', 'dept_request_item').eq('entityId', row.id);
    if (fileError) return Response.json({ error: fileError.message }, { status: 500 });
    if (!count) {
      return Response.json({
        error: 'ต้องแนบไฟล์เอกสารบนรายการนี้ก่อนกดส่ง — แนบได้หลายไฟล์ในหน้าต่างส่งเอกสาร',
      }, { status: 400 });
    }
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

    // ── ลูกค้าคอนเฟิร์ม = กลิ่นใช้งานได้จริง (มติผู้ใช้ 2026-08-12) ────────
    // เดิมทะเบียนค้าง "กำลังพัฒนา" จนกว่า RD จะไปกดเปลี่ยนเองอีกรอบ — ก้าวที่
    // แปลว่าลูกค้าอนุมัติเกิดตรงนี้แล้ว ทะเบียนต้องขยับตามเอง
    // ⚠️ flip เฉพาะ developing → active (เส้นเดียวที่ ALLOWED_TRANSITIONS ของ
    // ทะเบียนอนุญาตจากจุดนี้) — กลิ่นที่ถูกเก็บเข้ากรุระหว่างทางไม่ฟื้นเอง
    // ⚠️ ล้มแล้วไม่ throw — เหตุผลเดียวกับบล็อกวันส่งข้างล่าง
    if (hop === 'outcome' && body.outcome === 'confirmed' && row.producedScentId) {
      const { error: scentError } = await supabase.from('scents').update({
        status: 'active',
        updatedAt: nowIso,
      }).eq('id', row.producedScentId).eq('status', 'developing');
      if (scentError) console.error('[requests] เปลี่ยนสถานะกลิ่นเป็น active ไม่สำเร็จ:', scentError.message);
    }

    // ── วันส่งลูกค้าไหลกลับขึ้นทะเบียนกลิ่น (ม-66 · mig 0224) ─────────────
    //
    // ⭐ **ทะเบียนต้องตอบได้ว่ากลิ่นตัวนี้ถึงมือลูกค้าเมื่อไร** — ก่อนหน้านี้ `scents.sentAt`
    // ถูกเขียนตอน RD ส่งมอบให้ฝ่ายขาย ซึ่งเร็วกว่าความจริงเสมอ · ส่วนวันที่ลูกค้า
    // ได้รับจริง (แถวคำร้อง) ไม่เคยไหลกลับมาที่ทะเบียนเลย
    //
    // ⚠️ **เขียนทับได้เสมอ ไม่เช็คว่าว่างก่อน** — SA แก้วันที่ส่งย้อนหลังเป็นเรื่องปกติ
    // (กดผิดวันแล้วมาแก้) · เช็คว่าว่างก่อนแล้วการแก้ครั้งที่สองจะเงียบหายไป
    //
    // ⚠️ ล้มแล้ว **ไม่ throw** — ก้าวของแถวบันทึกสำเร็จไปแล้ว ย้อนไม่ได้ · ปล่อยให้
    // ทั้ง request ล้มจะได้ผู้ใช้กดซ้ำแล้วเจอ "ทำไปแล้ว" ทั้งที่ของจริงบันทึกไปรอบแรก
    if (hop === 'send' && row.producedScentId) {
      const { error: scentError } = await supabase.from('scents').update({
        sentAt: patch.sentAt,
        sentById: user?.id ?? null,
        sentByName: user?.name ?? null,
        updatedAt: nowIso,
      }).eq('id', row.producedScentId);
      if (scentError) console.error('[requests] เขียนวันส่งลูกค้าลงทะเบียนกลิ่นไม่สำเร็จ:', scentError.message);
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
    const label = hopLabelFor(row, hop, body.outcome);
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
