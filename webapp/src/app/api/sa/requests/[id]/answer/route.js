// ── RD/PC ตอบราคาในคำร้องวัสดุ (mig 0158) ────────────────────────────
//
// ตอบที่เดียว ราคาเข้าทะเบียนเลย: คำตอบ = rev ใหม่ของ **วัสดุตัวเดิม** ที่รายการ
// ผูกไว้ (ไม่เกิดวัสดุตัวใหม่อีกแล้ว) และถ้ารายการผูกกลับบรรทัดในใบขอราคาผลิตไว้
// ราคาจะเติมกลับบรรทัดนั้นให้ทันที — เซลไม่ต้องเดินกลับไปกดดึงเอง
//
// ตอบไม่ได้ก็ต้องปิดได้: no_quote + เหตุผล (ของทำไม่ได้/โรงงานไม่รับ/เลิกผลิต)
// ไม่งั้นเคสพวกนี้ค้าง open ตลอดไป
//
// ⚠️ ด่านจริงอยู่ที่นี่: ตรวจทั้งชุดให้ผ่านก่อนค่อยเขียน DB (กันเขียนครึ่ง ๆ กลาง ๆ)
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canViewCosting } from '@/lib/permissions';
import { canQuoteMaterial, normalizeTiers } from '@/lib/materialPrices';
import { answerRequestError, canAnswerRequest, deriveRequestStatusAfterAnswer } from '@/lib/deptRequests';
import { acceptMaterial, appendMaterialRevision, findRequest } from '@/lib/materialPricesAdmin';
import { componentFillFromRevision } from '@/lib/costingLibrary';
import { syncCostingPricingStatus } from '@/lib/costingAdmin';
import { askAnswerUpdates } from '@/lib/costingUpdates';
import { appendRequestEvent } from '@/lib/sales/documentThread';
import { appendUpdate } from '@/lib/master/updates';
import { chatCard, sendChat } from '@/lib/chat';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// PATCH { answers: [{ itemId, tiers: [{ qty?, price }], validUntil?, note }
//                  | { itemId, noQuote: true, reason }] }
export async function PATCH(request, { params }) {
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  const { id } = await params;

  const before = await findRequest(supabase, id);
  if (!before) return Response.json({ error: 'ไม่พบคำร้อง' }, { status: 404 });
  if (!canViewCosting(user)) return Response.json({ error: 'forbidden' }, { status: 403 });
  if (!canAnswerRequest(user, before)) {
    return Response.json({ error: `ตอบราคาได้เฉพาะฝ่าย ${before.dept}` }, { status: 403 });
  }
  const stageError = answerRequestError(before);
  if (stageError) return Response.json({ error: stageError }, { status: 409 });

  const body = await request.json().catch(() => ({}));
  const entries = Array.isArray(body.answers) ? body.answers : [];
  if (!entries.length) return Response.json({ error: 'ไม่มีคำตอบที่จะบันทึก' }, { status: 400 });

  const itemsById = new Map((before.items || []).map((i) => [i.id, i]));

  // ── ตรวจทั้งชุดก่อนเขียน ─────────────────────────────────────────────
  const validated = [];
  for (const entry of entries) {
    const item = itemsById.get(entry?.itemId);
    if (!item) return Response.json({ error: 'ไม่พบรายการที่ระบุ' }, { status: 404 });
    // เช็คซ้ำรายรายการ: เคสอาจถูกแก้ให้ปนชนิดกันภายหลัง proxy มองไม่เห็นระดับนี้
    if (!canQuoteMaterial(user, item.kind)) {
      return Response.json({
        error: `ไม่มีสิทธิ์ตอบราคา "${item.label}"`,
      }, { status: 403 });
    }
    if (entry.noQuote) {
      const reason = String(entry.reason ?? '').trim();
      if (!reason) {
        return Response.json({ error: `"${item.label}": ต้องระบุเหตุผลที่ตอบไม่ได้` }, { status: 400 });
      }
      validated.push({ item, noQuote: true, reason: reason.slice(0, 500) });
      continue;
    }
    const { tiers, error } = normalizeTiers(entry.tiers);
    if (error) return Response.json({ error: `"${item.label}": ${error}` }, { status: 400 });
    validated.push({ item, tiers, validUntil: entry.validUntil || null, note: entry.note || null });
  }

  const nowIso = new Date().toISOString();
  try {
    for (const answer of validated) {
      const { item } = answer;
      if (answer.noQuote) {
        const { error } = await supabase.from('dept_request_items').update({
          priceStatus: 'no_quote',
          noQuoteReason: answer.reason,
          answeredRevisionId: null,
          answeredById: user?.id ?? null,
          answeredByName: user?.name ?? null,
          answeredAt: nowIso,
          updatedAt: nowIso,
        }).eq('id', item.id);
        if (error) throw error;
        continue;
      }

      // ตอบราคาวัสดุร่างที่เซลเสนอมา = รับเข้าทะเบียนไปในตัว
      const { data: material, error: materialError } = await supabase
        .from('material_prices').select('status, scentId, formulaId')
        .eq('id', item.materialId).maybeSingle();
      if (materialError) throw materialError;
      if (material?.status === 'draft') {
        await acceptMaterial(supabase, { materialId: item.materialId, user });
      }

      // ประทับกลิ่น/สูตรที่คำร้องอ้างถึงลงแถววัสดุ (คอลัมน์ของ mig 0171)
      //
      // คำร้องขอราคา F ต้องเลือกกลิ่นจากทะเบียน · FB ต้องเลือกสูตร (requestShapeError
      // บังคับไว้) — ตอนตอบราคาจึงเป็นจังหวะเดียวที่รู้ว่า "ราคาก้อนนี้คือราคาของ
      // กลิ่น/สูตรตัวไหน" · ไม่ประทับ = คอลัมน์ทั้งสองตายอยู่เฉย ๆ และหน้าทะเบียน
      // ตอบไม่ได้ว่าราคานี้มาจากกลิ่นอะไร
      //
      // ⚠️ **ไม่ทับของเดิม** — วัสดุตัวหนึ่งอาจถูกถามซ้ำจากหลายคำร้อง ถ้าใบหลังทับ
      // ใบแรกได้ ประวัติราคาจะชี้กลิ่นผิดตัวย้อนหลังทั้งชุด
      const stamp = {};
      if (before.scentId && !material?.scentId) stamp.scentId = before.scentId;
      if (before.formulaId && !material?.formulaId) stamp.formulaId = before.formulaId;
      if (Object.keys(stamp).length) {
        const { error: stampError } = await supabase.from('material_prices')
          .update({ ...stamp, updatedAt: nowIso }).eq('id', item.materialId);
        if (stampError) throw stampError;
      }

      const { revision } = await appendMaterialRevision(supabase, {
        materialId: item.materialId,
        kind: item.kind,
        tiers: answer.tiers,
        validUntil: answer.validUntil,
        note: answer.note,
        askItemId: item.id,
        user,
      });

      const { error } = await supabase.from('dept_request_items').update({
        priceStatus: 'quoted',
        answeredRevisionId: revision.id,
        noQuoteReason: null,
        answeredById: user?.id ?? null,
        answeredByName: user?.name ?? null,
        answeredAt: nowIso,
        updatedAt: nowIso,
      }).eq('id', item.id);
      if (error) throw error;

      // เติมราคากลับบรรทัดในใบขอราคาผลิตที่รออยู่ (ถ้ารายการนี้ผูกไว้)
      // ไม่ทับบรรทัดที่มีราคาอยู่แล้ว — เซลอาจเลือกใช้ราคาอื่นไปแล้ว
      // ชั้นที่ใช้ = ชั้นที่เซลเลือกไว้บนบรรทัด (0159) ไม่ใช่ชั้นตั้งต้นของรุ่น
      if (item.componentId) {
        const { data: component } = await supabase
          .from('costing_item_components')
          .select('priceTierQty').eq('id', item.componentId).maybeSingle();
        const fill = componentFillFromRevision(revision, { tierQty: component?.priceTierQty ?? null });
        if (fill) {
          await supabase.from('costing_item_components').update({
            ...fill,
            quotedById: user?.id ?? null,
            quotedByName: user?.name ?? null,
            quotedAt: nowIso,
            updatedAt: nowIso,
          }).eq('id', item.componentId).neq('priceStatus', 'quoted');
        }
      }
    }

    // สถานะเคส derive จากรายการเสมอ (ไม่เก็บตัวนับ กัน drift)
    const mid = await findRequest(supabase, id);
    const nextStatus = deriveRequestStatusAfterAnswer(mid.items, mid.status);
    const patch = { status: nextStatus, updatedAt: nowIso };
    if (nextStatus === 'answered') patch.answeredAt = nowIso;
    // ตอบก่อนกดรับเรื่อง = ถือว่ารับเรื่องไปด้วย (คนตอบคือคนรับ)
    if (!mid.acknowledgedAt) {
      patch.acknowledgedById = user?.id ?? null;
      patch.acknowledgedByName = user?.name ?? null;
      patch.acknowledgedAt = nowIso;
    }
    const { error: askError } = await supabase.from('dept_requests').update(patch).eq('id', id);
    if (askError) throw askError;

    // ตอบครบแล้วใบขอราคาผลิตที่รออยู่ไม่ควรค้างสถานะ 'pricing' อีก
    if (before.costingRequestId) await syncCostingPricingStatus(supabase, before.costingRequestId);

    const after = await findRequest(supabase, id);
    const quoted = validated.filter((a) => !a.noQuote).length;
    const skipped = validated.length - quoted;
    await recordAudit({
      user, action: 'update', entityType: 'dept_request', entityId: id, before, after,
      summary: `ตอบเคส ${after.docNo || id}: ราคา ${quoted} รายการ`
        + (skipped ? ` · ตอบไม่ได้ ${skipped} รายการ` : ''),
      request,
    });

    // คำตอบลงเธรดรายรายการ — เหตุผลที่ "ตอบไม่ได้" เคยอยู่แต่ในคอลัมน์ของรายการ
    // คนที่ตามเคสอยู่จึงไม่เห็นว่าเกิดอะไรขึ้นเมื่อไร (ไม่เช็ค error: เขียนเธรดพลาด
    // ต้องไม่ทำให้คำตอบที่บันทึกลงทะเบียนแล้วตอบ 500)
    for (const event of askAnswerUpdates(validated)) {
      await appendUpdate(supabase, { entityType: 'dept_request', entityId: id, ...event, user });
    }

    // ตอบครบแล้ว = เรื่องนี้เดินจบขั้นหนึ่ง ดีลแม่ต้องเห็นด้วย (มติ 2026-08-03)
    //
    // ⚠️ ยิงเฉพาะจังหวะที่ **เพิ่งครบ** ไม่ใช่ทุกครั้งที่บันทึกคำตอบ — ใบที่มี 10
    // รายการตอบทีละใบจะได้ 10 บรรทัดในเธรดดีลทั้งที่ดีลสนใจแค่ "ตอบครบหรือยัง"
    // (บทเรียนเดียวกับที่ dealTaskUpdate ยกมาแค่ 3 จังหวะจากงาน)
    // ⚠️ ไม่ส่ง mentions: คนถูกแท็กตอนเปิดเรื่อง ไม่ใช่ตอนตอบรายบรรทัด
    if (after.status === 'answered' && before.status !== 'answered') {
      await appendRequestEvent(supabase, { request: after, action: 'answer', user, dealOnly: true });
    }

    if (after.status === 'answered') {
      sendChat('sales', chatCard({
        title: `ตอบราคาครบแล้ว ${after.docNo || ''}`,
        subtitle: after.customerName || 'ราคากลาง',
        rows: [
          { label: 'ผู้ตอบ', value: user?.name || '' },
          { label: 'ผู้ขอ', value: after.requestedByName || '' },
        ],
        linkPath: `/sa/requests/${id}`,
        linkLabel: 'เปิดเคส',
      }));
    }
    return Response.json(after);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
