import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { canEditSalesPlanning, forecastAmount, monthKey, toMoney } from '@/lib/salesPlanning';
import { getSahamitContext, sahamitError, indexByFgCode, loadSahamitProducts } from '@/lib/sahamit/server';

export const dynamic = 'force-dynamic';

function lastDayOfMonth(month) {
  if (!/^\d{4}-\d{2}$/.test(String(month || ''))) return null;
  const [year, mm] = month.split('-').map(Number);
  return new Date(Date.UTC(year, mm, 0)).toISOString().slice(0, 10);
}

async function loadRound(supabase, customerId, id) {
  const { data: round, error } = await supabase
    .from('sahamit_forecast_rounds')
    .select('*')
    .eq('id', id)
    .eq('customerId', customerId)
    .maybeSingle();
  if (error) throw error;
  if (!round) return null;

  const { data: lines, error: lineError } = await supabase
    .from('sahamit_forecast_lines')
    .select('*')
    .eq('roundId', id)
    .eq('customerId', customerId);
  if (lineError) throw lineError;
  return { ...round, lines: lines || [] };
}

// สร้าง "1 ดีล" จาก forecast line ที่ผู้ใช้เลือก (หลาย fgCode) แล้วผูกทุก line
// เข้าดีลผ่าน sales_deal_forecast_lines (many-to-many). ต่างจาก sync เดิมที่
// auto-group ตาม (เดือน×เจ้าของ) เป็นหลายดีล — อันนี้ผู้ใช้คุมว่าจะรวมอะไรเป็นดีลเดียว.
export async function POST(request, { params }) {
  const ctx = await getSahamitContext();
  if (!ctx.ok) return sahamitError(ctx);
  const { supabase, customerId, customer, user } = ctx;
  if (!canEditSalesPlanning(user)) return Response.json({ error: 'forbidden' }, { status: 403 });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  const forecastMonth = monthKey(body.forecastMonth);
  if (!forecastMonth) return Response.json({ error: 'ต้องระบุเดือนคาดได้รับ PO (forecastMonth)' }, { status: 400 });

  // เลือกได้ 2 แบบ: lineIds (ราย line = สินค้า×เดือน, แม่นสุด) หรือ fgCodes (ทุกเดือนของสินค้านั้น)
  const lineIds = new Set((Array.isArray(body.lineIds) ? body.lineIds : []).map((v) => String(v || '')).filter(Boolean));
  const fgCodesSel = new Set(
    (Array.isArray(body.fgCodes) ? body.fgCodes : [])
      .map((fg) => String(fg || '').trim().toLowerCase())
      .filter(Boolean),
  );
  if (!lineIds.size && !fgCodesSel.size) return Response.json({ error: 'ยังไม่ได้เลือกรายการ' }, { status: 400 });

  const round = await loadRound(supabase, customerId, id);
  if (!round) return Response.json({ error: 'ไม่พบรอบ FC นี้' }, { status: 404 });

  const products = await loadSahamitProducts(supabase, customerId);
  const productIndex = indexByFgCode(products);

  const picked = (round.lines || []).filter((line) => {
    if (Number(line.qty || 0) <= 0) return false;
    return lineIds.size
      ? lineIds.has(String(line.id))
      : fgCodesSel.has(String(line.fgCode || '').trim().toLowerCase());
  });
  if (!picked.length) return Response.json({ error: 'รายการที่เลือกไม่มีจำนวนที่ผูกได้' }, { status: 400 });

  let value = 0;
  let totalQty = 0;
  const fgCodes = new Set();
  const productNames = new Set();
  let derivedOwnerName = null;
  let derivedOwnerId = null;
  for (const line of picked) {
    const product = productIndex.get(String(line.fgCode || '').trim().toLowerCase());
    const price = Number(product?.price ?? 0);
    const qty = Number(line.qty || 0);
    value += qty * (Number.isFinite(price) ? price : 0);
    totalQty += qty;
    fgCodes.add(line.fgCode);
    if (line.productName || product?.name) productNames.add(line.productName || product.name);
    // เจ้าของเริ่มต้น = assignee ของสินค้าแรกที่มีค่า (ผู้ใช้ override ผ่าน body ได้)
    if (!derivedOwnerName && product?.assignee) { derivedOwnerName = product.assignee; derivedOwnerId = product.ownerId || null; }
  }

  const ownerName = body.ownerName || derivedOwnerName || user.name || null;
  const ownerId = body.ownerId || (body.ownerName ? null : derivedOwnerId) || user.id || null;
  const closeDate = lastDayOfMonth(forecastMonth);
  const now = new Date().toISOString();
  const sortedFg = [...fgCodes].sort();
  const title = body.title?.trim()
    || `Sahamit FC #${round.roundNo} · ${forecastMonth}${ownerName ? ` · ${ownerName}` : ''}`;

  const metadata = {
    source: 'sahamit-forecast',
    sahamitForecastRoundId: round.id,
    sahamitForecastRoundNo: round.roundNo,
    fgCodes: sortedFg,
    productNames: [...productNames].sort(),
    forecastQty: totalQty,
    fcReceivedDate: round.receivedDate || null,
    ownerName: ownerName || null,
    syncedAt: now,
  };

  const dealRow = {
    id: genId('DEAL'),
    customerId: customer.id,
    customerName: customer.name || null,
    title,
    stage: 'qualified',
    projectValue: toMoney(value),
    probability: 30,
    forecastMonth,
    expectedCloseDate: closeDate,
    depositPaid: false,
    confirmedAt: null,
    lostReason: null,
    notes: body.notes?.trim() || `สร้างจาก FC สหมิตร รอบ #${round.roundNo} (${sortedFg.length} รายการ)`,
    ownerId,
    ownerName,
    team: user.team || 'KA',
    metadata,
  };

  const { data: deal, error: dealError } = await supabase.from('sales_deals').insert(dealRow).select().single();
  if (dealError) return Response.json({ error: dealError.message }, { status: 500 });

  const junctionRows = picked.map((line) => ({
    id: genId('SDF'),
    dealId: deal.id,
    forecastLineId: line.id,
    customerId: customer.id,
    fgCode: line.fgCode,
    demandMonth: monthKey(line.month),
    qtyAllocated: Number(line.qty || 0),
    createdById: user.id || null,
    createdByName: user.name || null,
  }));
  const { error: linkError } = await supabase.from('sales_deal_forecast_lines').insert(junctionRows);
  if (linkError) {
    // rollback ดีลที่เพิ่งสร้าง เพื่อไม่ให้เหลือดีลลอยไม่มี line ผูก
    await supabase.from('sales_deals').delete().eq('id', deal.id);
    return Response.json({ error: `ผูกรายการ FC เข้าดีลไม่สำเร็จ: ${linkError.message}` }, { status: 500 });
  }

  await supabase.from('sales_deal_stage_history').insert({
    id: genId('DSH'),
    dealId: deal.id,
    fromStage: null,
    toStage: deal.stage,
    changedBy: user.id || null,
    changedByName: user.name || null,
  });
  await supabase.from('sales_deal_forecasts').insert({
    id: genId('DFC'),
    dealId: deal.id,
    forecastMonth: deal.forecastMonth || forecastMonth,
    forecastAmount: forecastAmount(deal),
    probability: deal.probability,
    source: 'sahamit-forecast',
    createdBy: user.id || null,
    createdByName: user.name || null,
  });

  await recordAudit({
    user,
    action: 'create',
    entityType: 'sales_deal',
    entityId: deal.id,
    after: { title: deal.title, lines: junctionRows.length, projectValue: deal.projectValue },
    summary: `create Sales deal from Sahamit FC #${round.roundNo} (${junctionRows.length} lines)`,
    request,
  });

  return Response.json({ deal, lines: junctionRows.length });
}
