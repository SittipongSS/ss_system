import { randomUUID } from 'crypto';
import {
  getSahamitContext, sahamitError,
  loadSahamitProducts, indexByFgCode, resolveFgCode,
} from '@/lib/sahamit/server';
import { monthOf, cleanDestination } from '@/lib/sahamit/po';
import { insertPoLinesTolerant } from '@/lib/sahamit/poServer';
import { blockedLinesMessage, diffPoLines, lineLockReason, poDeleteBlock } from '@/lib/sahamit/poEdit';
import { resolveSettledLines } from '@/lib/sahamit/settleLines';
import { refreshSahamitFlags } from '@/lib/sahamit/flagsSync';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// dueDate + destination = ระดับหัว (mig 0058); denormalize ลงบรรทัดด้วยเมื่อแก้
const HEADER_FIELDS = ['poNumber', 'docDate', 'receivedDate', 'dueDate', 'destination', 'quoteRef', 'note'];

async function loadPo(supabase, customerId, id) {
  const { data } = await supabase
    .from('sahamit_pos').select('*').eq('id', id).eq('customerId', customerId).maybeSingle();
  return data;
}

// สิ่งที่ผูกกับ PO นี้ — ใช้ทั้งกติกาลบทั้งใบ และล็อกรายบรรทัดตอนแก้.
// ผูกดีลเก็บใน sales_deals.metadata.sahamitPoId (JSON ไม่มี FK — ต้องนับเอง;
// ดู [[no-real-fk-constraints]]) ส่วน material ผูกด้วย poLineId.
async function loadPoRefs(supabase, customerId, po) {
  const [{ data: lines }, { data: splitChildren }, { data: deals }] = await Promise.all([
    supabase.from('sahamit_po_lines').select('*').eq('poId', po.id).eq('customerId', customerId),
    supabase.from('sahamit_pos').select('id').eq('customerId', customerId).eq('splitFromPoId', po.id),
    supabase.from('sales_deals').select('id, stage, metadata').eq('customerId', customerId).eq('metadata->>sahamitPoId', po.id),
  ]);
  const lineIds = (lines || []).map((l) => l.id);
  let materialLineIds = new Set();
  if (lineIds.length) {
    const { data: trk } = await supabase
      .from('sahamit_material_tracking').select('poLineId').in('poLineId', lineIds);
    materialLineIds = new Set((trk || []).map((t) => t.poLineId));
  }
  // บรรทัดที่ถูกแบ่งส่ง = มีบรรทัดลูกชี้กลับมาหา (splitFromPoLineId)
  let splitParentIds = new Set();
  if (lineIds.length) {
    const { data: children } = await supabase
      .from('sahamit_po_lines').select('splitFromPoLineId').in('splitFromPoLineId', lineIds);
    splitParentIds = new Set((children || []).map((c) => c.splitFromPoLineId));
  }
  // บรรทัดที่ settle แล้ว (เชื่อมดีลรวม + QT) ล็อกด้วย — เทียบราย poLineId ผ่าน
  // resolveSettledLines (ห้ามกลับไปเทียบ fgCode ล้วน): แก้จำนวน = QT/ดีลเพี้ยนจาก PO,
  // ลบแล้วเพิ่ม fgCode เดิม = id ใหม่ดูยังไม่เชื่อม → settle ซ้ำเป็นดีล/QT ซ้ำซ้อน
  const settled = resolveSettledLines(deals);
  const lockOf = (line) => lineLockReason(line, {
    hasMaterial: materialLineIds.has(line.id),
    isSplitParent: splitParentIds.has(line.id),
    isSettled: Boolean(settled.dealFor(line)),
  });
  return { lines: lines || [], splitChildren: splitChildren || [], deals: deals || [], materialLineIds, lockOf };
}

// PATCH /api/sahamit/po/[id] — header fields, plus (optional) the full `lines`
// array so the edit page can reuse the create form and save everything in one
// go. ส่ง lines มา = ให้ diff กับของเดิม: เพิ่ม/แก้จำนวน/ลบ ในครั้งเดียว.
// บรรทัดที่ผูกแล้ว (เชื่อมดีล/วัสดุ/แบ่งส่ง/ส่งของแล้ว) ถูกล็อก — แตะแล้ว 409 ทั้งคำขอ
// ไม่ใช่แก้ได้บางส่วนเงียบ ๆ. ไม่ส่ง lines = แก้หัวอย่างเดียวเหมือนเดิม.
export async function PATCH(request, { params }) {
  const ctx = await getSahamitContext();
  if (!ctx.ok) return sahamitError(ctx);
  const { supabase, customerId, user } = ctx;
  const { id } = await params;

  const before = await loadPo(supabase, customerId, id);
  if (!before) return Response.json({ error: 'ไม่พบ PO นี้' }, { status: 404 });

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'invalid json' }, { status: 400 }); }

  const patch = {};
  for (const f of HEADER_FIELDS) if (f in body) patch[f] = body[f] === '' ? null : body[f];
  if ('destination' in patch) patch.destination = cleanDestination(patch.destination);
  if (patch.poNumber) {
    patch.poNumber = String(patch.poNumber).trim();
    const { data: dup } = await supabase
      .from('sahamit_pos').select('id').eq('customerId', customerId).eq('poNumber', patch.poNumber).maybeSingle();
    if (dup && dup.id !== id) return Response.json({ error: `เลขที่ PO "${patch.poNumber}" มีอยู่แล้ว` }, { status: 409 });
  }
  const wantsLines = Array.isArray(body?.lines);
  if (!Object.keys(patch).length && !wantsLines) return Response.json(before);

  // ── บรรทัด: diff ก่อนเขียนอะไรทั้งนั้น เพื่อให้ "ถูกล็อก" ตีกลับก่อน ไม่ใช่แก้หัว
  //    ไปแล้วค่อยพังตอนบรรทัด (คำขอเดียวควรสำเร็จหรือไม่สำเร็จทั้งก้อน)
  let plan = null;
  let refs = null;
  if (wantsLines) {
    refs = await loadPoRefs(supabase, customerId, before);
    plan = diffPoLines(refs.lines, body.lines, refs.lockOf);
    const blocked = blockedLinesMessage(plan.blocked);
    if (blocked) return Response.json({ error: blocked }, { status: 409 });
    const remaining = refs.lines.length - plan.remove.length + plan.insert.length;
    if (remaining < 1) return Response.json({ error: 'PO ต้องมีรายการสินค้าอย่างน้อย 1 รายการ' }, { status: 400 });
  }

  patch.updatedAt = new Date().toISOString();
  const { data: updated, error } = await supabase
    .from('sahamit_pos').update(patch).eq('id', id).eq('customerId', customerId).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  if (plan) {
    const effectiveDue = 'dueDate' in patch ? patch.dueDate : before.dueDate;
    const effectiveDest = 'destination' in patch ? patch.destination : before.destination;
    if (plan.remove.length) {
      await supabase.from('sahamit_po_lines').delete().in('id', plan.remove).eq('customerId', customerId);
    }
    for (const u of plan.update) {
      await supabase.from('sahamit_po_lines').update({ qty: u.qty }).eq('id', u.id).eq('customerId', customerId);
    }
    if (plan.insert.length) {
      const products = await loadSahamitProducts(supabase, customerId).catch(() => []);
      const index = indexByFgCode(products);
      const nowIso = new Date().toISOString();
      const rows = plan.insert.map((l) => {
        const r = resolveFgCode(index, l.fgCode);
        return {
          id: 'SPL-' + randomUUID(), poId: id, customerId,
          productId: r.productId, fgCode: l.fgCode, productName: r.productName, qty: l.qty,
          dueDate: effectiveDue, expectedDate: null, destination: effectiveDest,
          expectedHistory: [], actualDeliveredDate: null, deliveryMonth: monthOf(effectiveDue),
          splitFromPoLineId: null, status: 'open', createdAt: nowIso,
        };
      });
      const insErr = await insertPoLinesTolerant(supabase, rows);
      if (insErr) return Response.json({ error: insErr.message }, { status: 500 });
    }
  }

  // denormalize กำหนดส่ง/สถานที่ ลงทุกบรรทัด (ให้กระทบยอด/วัสดุอ่านรายบรรทัดตรงกับหัว).
  // deliveryMonth คิดจาก expectedDate (ถ้าเลื่อนไว้) ไม่งั้นใช้ dueDate ใหม่.
  const linePatch = {};
  if ('dueDate' in patch) linePatch.dueDate = patch.dueDate;
  if ('destination' in patch) linePatch.destination = patch.destination;
  if (Object.keys(linePatch).length) {
    const { data: lines } = await supabase
      .from('sahamit_po_lines').select('id,expectedDate').eq('poId', id).eq('customerId', customerId);
    for (const l of lines || []) {
      const lp = { ...linePatch };
      if ('dueDate' in patch) lp.deliveryMonth = monthOf(l.expectedDate || patch.dueDate);
      await supabase.from('sahamit_po_lines').update(lp).eq('id', l.id).eq('customerId', customerId);
    }
  }

  const lineNote = plan
    ? ` (บรรทัด +${plan.insert.length} / แก้ ${plan.update.length} / ลบ ${plan.remove.length})`
    : '';
  await recordAudit({
    user, action: 'update', entityType: 'sahamit_po', entityId: id,
    before, after: updated, summary: `แก้ไข PO ${updated.poNumber}${lineNote}`, request,
  });

  // แก้ PO (จำนวน/วันที่รับ/บรรทัด) กระทบการหักยอด FC ที่ลด — รีเฟรชธง. Best-effort.
  try { await refreshSahamitFlags(supabase, customerId); } catch (e) { console.error('[sahamit] flag refresh failed', e?.message || e); }

  return Response.json(updated);
}

// DELETE /api/sahamit/po/[id] — remove a PO (lines cascade via FK). Scoped.
// กันลบ PO ที่เข้า workflow แล้ว (มติผู้ใช้ 2026-07-17): เดิมลบได้ทันทีโดยไม่เช็ค
// อะไรเลย → โครงการ PM กับดีลที่ settle ไว้จะค้างชี้ PO ที่ไม่มีอยู่ (ผูกด้วย JSON
// ไม่มี FK ช่วย). ตอบเป็นข้อความบอกว่าติดอะไร ไม่ใช่ 403 เปล่า ๆ.
export async function DELETE(request, { params }) {
  const ctx = await getSahamitContext();
  if (!ctx.ok) return sahamitError(ctx);
  const { supabase, customerId, user } = ctx;
  const { id } = await params;

  const before = await loadPo(supabase, customerId, id);
  if (!before) return Response.json({ error: 'ไม่พบ PO นี้' }, { status: 404 });

  const refs = await loadPoRefs(supabase, customerId, before);
  const block = poDeleteBlock({
    projectId: before.projectId,
    splitChildCount: refs.splitChildren.length,
    settledDealCount: refs.deals.length,
    materialLineCount: refs.materialLineIds.size,
    deliveredLineCount: refs.lines.filter((l) => l.actualDeliveredDate).length,
  });
  if (block) return Response.json({ error: block }, { status: 409 });

  const { error } = await supabase
    .from('sahamit_pos').delete().eq('id', id).eq('customerId', customerId);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // ลบ PO ทำให้ยอด PO ที่เคยหักหายไป — รีเฟรชธง. Best-effort.
  try { await refreshSahamitFlags(supabase, customerId); } catch (e) { console.error('[sahamit] flag refresh failed', e?.message || e); }

  await recordAudit({
    user, action: 'delete', entityType: 'sahamit_po', entityId: id,
    before, summary: `ลบ PO ${before.poNumber}`, request,
  });
  return Response.json({ ok: true });
}
