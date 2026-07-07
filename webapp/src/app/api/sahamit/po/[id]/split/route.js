import { randomUUID } from 'crypto';
import { getSahamitContext, sahamitError } from '@/lib/sahamit/server';
import { insertPoLinesTolerant } from '@/lib/sahamit/poServer';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// POST /api/sahamit/po/[id]/split — แบ่งส่ง: [id] = PO ต้นทาง.
// บันทึก "ยอดส่งจริง" (shippedQty) ต่อบรรทัดของ PO เดิม (qty ยังเต็ม) แล้วเปิด PO ใบใหม่
// = ยอดที่เหลือ (qty − shipped) โยงกลับด้วย splitFromPoId. กระทบยอดจะนับ shippedQty
// ของ PO เดิม + ยอดเต็มของ PO ใหม่ → ไม่ซ้ำ.
// Body: { balancePoNumber, lines: [{ lineId, shippedQty }] }
export async function POST(request, { params }) {
  const ctx = await getSahamitContext();
  if (!ctx.ok) return sahamitError(ctx);
  const { supabase, customerId, user } = ctx;
  const { id } = await params;

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'invalid json' }, { status: 400 }); }
  // เลขที่ PO ยอดเหลือ "ไม่บังคับ" — เว้นว่างได้ ระบบจะตั้งเลขชั่วคราวให้ (แก้ทีหลัง)
  let balancePoNumber = String(body?.balancePoNumber || '').trim();
  const autoNumber = !balancePoNumber;

  // PO ต้นทาง + บรรทัด
  const { data: po } = await supabase
    .from('sahamit_pos').select('*').eq('id', id).eq('customerId', customerId).maybeSingle();
  if (!po) return Response.json({ error: 'ไม่พบ PO ต้นทาง' }, { status: 404 });
  const { data: lines } = await supabase
    .from('sahamit_po_lines').select('*').eq('poId', id).eq('customerId', customerId);
  const lineById = new Map((lines || []).map((l) => [l.id, l]));

  // เลขที่ PO ทั้งหมดของลูกค้า — ใช้ทั้งกันซ้ำ + สร้างเลขยอดเหลือชั่วคราวที่ไม่ชน
  const { data: allPos } = await supabase
    .from('sahamit_pos').select('poNumber').eq('customerId', customerId);
  const takenNumbers = new Set((allPos || []).map((p) => p.poNumber));

  if (autoNumber) {
    // เลขชั่วคราว "<PO แม่>-R" (ต่อท้ายเลขถ้าชน) — ผู้ใช้แก้เป็นเลขจริงภายหลังได้
    const base = `${po.poNumber}-R`;
    balancePoNumber = base;
    for (let i = 2; takenNumbers.has(balancePoNumber); i++) balancePoNumber = `${base}${i}`;
  } else if (takenNumbers.has(balancePoNumber)) {
    return Response.json({ error: `เลขที่ PO "${balancePoNumber}" มีอยู่แล้ว` }, { status: 409 });
  }

  // ตรวจ + เตรียม: shipped ต้อง 0<shipped<qty (มียอดเหลือ) จึงจะแบ่ง
  const req = Array.isArray(body?.lines) ? body.lines : [];
  const updates = []; const balanceLines = [];
  const nowIso = new Date().toISOString();
  const balancePoId = 'SPO-' + randomUUID();

  for (const r of req) {
    const line = lineById.get(r.lineId);
    if (!line) continue;
    const qty = Number(line.qty);
    const shipped = Number(r.shippedQty);
    if (!Number.isFinite(shipped) || shipped < 0 || shipped >= qty) continue; // ไม่มียอดเหลือ = ข้าม
    updates.push({ id: line.id, shippedQty: shipped });
    balanceLines.push({
      id: 'SPL-' + randomUUID(), poId: balancePoId, customerId,
      productId: line.productId, fgCode: line.fgCode, productName: line.productName,
      qty: qty - shipped, dueDate: line.dueDate, expectedDate: null, destination: line.destination,
      expectedHistory: [], actualDeliveredDate: null, deliveryMonth: line.deliveryMonth,
      splitFromPoLineId: line.id, status: 'open', createdAt: nowIso,
    });
  }
  if (!balanceLines.length) return Response.json({ error: 'ไม่มีบรรทัดที่มียอดเหลือให้แบ่ง (ส่งจริงต้องน้อยกว่าจำนวนเต็ม)' }, { status: 400 });

  // 1) สร้างหัว PO ยอดเหลือ (โยงกลับ)
  const balancePo = {
    id: balancePoId, poNumber: balancePoNumber, customerId,
    docDate: null, receivedDate: null, dueDate: po.dueDate, destination: po.destination,
    quoteRef: po.quoteRef || null,
    note: autoNumber ? `ยอดเหลือจาก PO ${po.poNumber} · เลข PO ชั่วคราว (รอแก้เป็นเลขจริง)` : `ยอดเหลือจาก PO ${po.poNumber}`,
    splitFromPoId: po.id, createdById: user?.id ?? null, createdByName: user?.name ?? null,
    createdAt: nowIso, updatedAt: nowIso,
  };
  const { error: pErr } = await supabase.from('sahamit_pos').insert(balancePo);
  if (pErr) return Response.json({ error: pErr.message }, { status: 500 });

  const insErr = await insertPoLinesTolerant(supabase, balanceLines);
  if (insErr) {
    await supabase.from('sahamit_pos').delete().eq('id', balancePoId);
    return Response.json({ error: insErr.message }, { status: 500 });
  }

  // 2) เซ็ต shippedQty บรรทัดเดิม
  for (const u of updates) {
    await supabase.from('sahamit_po_lines').update({ shippedQty: u.shippedQty }).eq('id', u.id).eq('customerId', customerId);
  }

  await recordAudit({
    user, action: 'create', entityType: 'sahamit_po', entityId: balancePoId,
    after: balancePo, summary: `แบ่งส่ง PO ${po.poNumber} → เปิดยอดเหลือ ${balancePoNumber} (${balanceLines.length} รายการ)`, request,
  });
  return Response.json({ balancePo, balanceLines }, { status: 201 });
}
