// ── ขั้นใส่ราคาของแถวสายพัฒนา — ขั้นสุดท้ายในใบเดิม (P3c) ─────────────────
//
// POST { price, validUntil?, note? }
//
// ⭐ **ราคาเป็นขั้นสุดท้ายของสายงาน ไม่ใช่คำร้องใบใหม่** (มติผู้ใช้) — เดิมต้องเปิด
// "ขอราคา F" อีกใบแล้วผูกกันเองในหัว ⇒ "กลิ่นนี้คอนเฟิร์มแล้วยังไม่ได้ขอราคา"
// กลายเป็นของที่ไม่มีใครเห็น · ตอนนี้เป็นขั้นบนแถวเดิมที่หน้าจอเตือนให้เอง
//
// ⚠️ **ไม่เขียนกลไกราคาใหม่** — ใช้ `ensureMaterial` + `appendMaterialRevision`
// ชุดเดียวกับที่คำร้องขอราคาวัสดุใช้ ⇒ ราคาที่ได้เข้าทะเบียนวัสดุเป็น rev ปกติ
// อ่านได้จากทุกที่ที่อ่านราคาอยู่แล้ว (ใบขอราคาผลิต · หน้าทะเบียน)
//
// ⚠️ กลิ่นไม่มี "สูตร" — ตัวตนของวัสดุจึงเป็น `RM_F + ชื่อ + ลูกค้า` และผูกกลับหา
// กลิ่นด้วยคอลัมน์ `material_prices.scentId` (0171) ซึ่งประทับตรงนี้จังหวะเดียว
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canViewRequests } from '@/lib/permissions';
import { canAnswerRequest, canReadRequestRow, deriveRequestStatusAfterAnswer } from '@/lib/deptRequests';
import { canPriceRow } from '@/lib/requests/rowStage';
import { normalizeQuotedPrice } from '@/lib/materialPrices';
import { appendMaterialRevision, ensureMaterial, findRequest } from '@/lib/materialPricesAdmin';
import { findScent } from '@/lib/master/scentFormulaAdmin';
import { appendUpdate } from '@/lib/master/updates';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
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
  if (!canAnswerRequest(user, before)) {
    return Response.json({ error: `ใส่ราคาได้เฉพาะฝ่าย ${before.dept}` }, { status: 403 });
  }

  const row = (before.items || []).find((i) => i.id === itemId);
  if (!row) return Response.json({ error: 'ไม่พบรายการในคำร้องนี้' }, { status: 404 });

  // ⭐ ด่านเดียวกับที่หน้าจอใช้ตัดสินว่าจะโชว์ปุ่มไหม — `canPriceRow` ที่ P1b-1
  // เขียนไว้ ⇒ ปุ่มกับ API ขัดกันไม่ได้เชิงโครงสร้าง
  if (!canPriceRow(row)) {
    return Response.json({
      error: 'ใส่ราคาได้เมื่อลูกค้าคอนเฟิร์มรายการนี้แล้วเท่านั้น',
    }, { status: 409 });
  }
  if (!row.producedScentId) {
    return Response.json({
      error: 'รายการนี้ยังไม่ผูกกลิ่นในทะเบียน — ใส่ราคาไม่ได้',
    }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  // ⚠️ F/FB **ไม่มีชั้นจำนวน** (มติผู้ใช้ 2026-08-03) — หัวน้ำหอมคิดราคาต่อกิโลเดียว
  // ไม่ลดตามจำนวน · รับ `price` ตัวเดียว ไม่ใช่ tiers
  const { value: price, error: priceError } = normalizeQuotedPrice('RM_F', body.price);
  if (priceError) return Response.json({ error: priceError }, { status: 400 });

  const nowIso = new Date().toISOString();
  try {
    const scent = await findScent(supabase, row.producedScentId);
    if (!scent) return Response.json({ error: 'ไม่พบกลิ่นในทะเบียน' }, { status: 400 });

    // ตัวตนของวัสดุ = RM_F + ชื่อ + ลูกค้า · ถามซ้ำรอบสองจะเจอตัวเดิมแล้วต่อ rev
    // ไม่ใช่เกิดวัสดุตัวใหม่ (บั๊กที่ ensureMaterial ถูกเขียนขึ้นมาปิด)
    const { material } = await ensureMaterial(supabase, {
      kind: 'RM_F',
      label: scent.name,
      customerId: scent.customerId,
      customerName: scent.customerName,
      user,
    });

    // ประทับกลิ่นลงแถววัสดุ — **ไม่ทับของเดิม** เพราะวัสดุตัวหนึ่งอาจถูกถามซ้ำจาก
    // หลายคำร้อง ถ้าใบหลังทับได้ ประวัติราคาจะชี้กลิ่นผิดตัวย้อนหลังทั้งชุด
    if (!material.scentId) {
      const { error: stampError } = await supabase.from('material_prices')
        .update({ scentId: scent.id, updatedAt: nowIso }).eq('id', material.id);
      if (stampError) throw stampError;
    }

    const { revision } = await appendMaterialRevision(supabase, {
      materialId: material.id,
      kind: 'RM_F',
      price,
      validUntil: body.validUntil || null,
      note: body.note || null,
      askItemId: row.id,
      user,
    });

    const { error } = await supabase.from('dept_request_items').update({
      answerStatus: 'done',
      answeredRevisionId: revision.id,
      declineReason: null,
      answeredById: user?.id ?? null,
      answeredByName: user?.name ?? null,
      answeredAt: nowIso,
      updatedAt: nowIso,
    }).eq('id', itemId);
    if (error) throw error;

    // ตอบครบทุกแถว → ใบเป็น answered เอง (กลไกเดิม ไม่แก้)
    const after = await findRequest(supabase, id);
    const derived = deriveRequestStatusAfterAnswer(after.items || [], after.status);
    if (derived !== after.status) {
      const { error: headError } = await supabase.from('dept_requests')
        .update({ status: derived, updatedAt: nowIso }).eq('id', id);
      if (headError) throw headError;
    }

    await appendUpdate(supabase, {
      entityType: 'dept_request',
      entityId: id,
      kind: 'quoted',
      body: `ใส่ราคา ${scent.code || scent.name} — ${price.toLocaleString('th-TH')} ฿/กก.`,
      user,
    }).catch(() => {});

    await recordAudit({
      user, action: 'update', entityType: 'dept_request', entityId: id,
      before: row, after: { ...row, answerStatus: 'done', answeredRevisionId: revision.id },
      summary: `ใส่ราคา ${scent.code || scent.name} (${before.docNo || id})`,
      request,
    });

    return Response.json(await findRequest(supabase, id));
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}
