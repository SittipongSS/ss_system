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

// สร้างดีล "1 forecast line = 1 ดีล" (line = สินค้า×เดือน) จากรายการที่เลือก.
// เจ้าของดีล = AE (role=ae) ที่เลือกจาก dropdown เท่านั้น. เลือกหลาย line →
// สร้างหลายดีล (ดีลละ line, junction 1 แถว/ดีล).
export async function POST(request, { params }) {
  const ctx = await getSahamitContext();
  if (!ctx.ok) return sahamitError(ctx);
  const { supabase, customerId, customer, user } = ctx;
  if (!canEditSalesPlanning(user)) return Response.json({ error: 'forbidden' }, { status: 403 });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  const forecastMonth = monthKey(body.forecastMonth);
  if (!forecastMonth) return Response.json({ error: 'ต้องระบุเดือนคาดได้รับ PO (forecastMonth)' }, { status: 400 });

  // เจ้าของดีลต้องเป็น AE (role=ae) เท่านั้น — ตรวจจาก app_metadata ฝั่ง server
  if (!body.ownerId) return Response.json({ error: 'ต้องเลือก AE เจ้าของดีล' }, { status: 400 });
  const { data: ownerRes, error: ownerErr } = await supabase.auth.admin.getUserById(String(body.ownerId));
  const owner = ownerRes?.user;
  if (ownerErr || !owner) return Response.json({ error: 'ไม่พบผู้ใช้ AE ที่เลือก' }, { status: 400 });
  if (owner.app_metadata?.role !== 'ae') return Response.json({ error: 'เจ้าของดีลต้องเป็น AE เท่านั้น' }, { status: 400 });
  const ownerId = owner.id;
  const ownerName = owner.user_metadata?.name || owner.email || null;
  const ownerTeam = owner.app_metadata?.team || user.team || 'KA';

  // เลือกได้ 2 แบบ: lineIds (ราย line, แม่นสุด) หรือ fgCodes (ทุกเดือนของสินค้านั้น)
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

  // กันซ้ำ: forecast line ที่เคยสร้างดีลไปแล้ว (ดีลยังไม่ถูกยกเลิก) จะไม่สร้างดีลซ้ำอีก.
  // ใช้ junction (sales_deal_forecast_lines.forecastLineId) เป็นกุญแจกันซ้ำ.
  const pickedLineIds = picked.map((line) => String(line.id));
  const { data: existingLinks } = await supabase
    .from('sales_deal_forecast_lines')
    .select('forecastLineId, dealId')
    .eq('customerId', customerId)
    .in('forecastLineId', pickedLineIds);
  const blockedLineIds = new Set();
  if (existingLinks?.length) {
    const linkDealIds = [...new Set(existingLinks.map((l) => l.dealId).filter(Boolean))];
    const { data: linkDeals } = await supabase
      .from('sales_deals').select('id, stage').in('id', linkDealIds.length ? linkDealIds : ['__none__']);
    const activeDealIds = new Set((linkDeals || []).filter((d) => d.stage !== 'lost').map((d) => d.id));
    for (const l of existingLinks) if (activeDealIds.has(l.dealId)) blockedLineIds.add(String(l.forecastLineId));
  }
  const toCreate = picked.filter((line) => !blockedLineIds.has(String(line.id)));
  const skipped = picked.length - toCreate.length;
  if (!toCreate.length) {
    return Response.json({ error: 'รายการที่เลือกถูกสร้างเป็นดีลไปแล้วทั้งหมด', skipped, count: 0 }, { status: 409 });
  }

  const now = new Date().toISOString();
  const closeDate = lastDayOfMonth(forecastMonth);
  const created = [];

  // 1 line = 1 ดีล — วนสร้างทีละ line (พร้อม rollback ถ้าพลาดกลางทาง)
  for (const line of toCreate) {
    const product = productIndex.get(String(line.fgCode || '').trim().toLowerCase());
    const price = Number(product?.price ?? 0);
    const qty = Number(line.qty || 0);
    const productName = line.productName || product?.name || line.fgCode;
    const demandMonth = monthKey(line.month);

    const dealRow = {
      id: genId('DEAL'),
      customerId: customer.id,
      customerName: customer.name || null,
      title: `${productName} · ${line.month}`,
      stage: 'qualified',
      projectValue: toMoney(qty * (Number.isFinite(price) ? price : 0)),
      probability: 30,
      forecastMonth,
      expectedCloseDate: closeDate,
      depositPaid: false,
      confirmedAt: null,
      lostReason: null,
      notes: `สร้างจาก FC สหมิตร รอบ #${round.roundNo} · ${line.fgCode} (${line.month})`,
      ownerId,
      ownerName,
      team: ownerTeam,
      metadata: {
        source: 'sahamit-forecast',
        sahamitForecastRoundId: round.id,
        sahamitForecastRoundNo: round.roundNo,
        fgCodes: [line.fgCode],
        productNames: [productName],
        forecastQty: qty,
        demandMonth,
        fcReceivedDate: round.receivedDate || null,
        ownerName,
        syncedAt: now,
      },
    };

    const { data: deal, error: dealError } = await supabase.from('sales_deals').insert(dealRow).select().single();
    if (dealError) {
      if (created.length) await supabase.from('sales_deals').delete().in('id', created.map((d) => d.id));
      return Response.json({ error: dealError.message }, { status: 500 });
    }

    const { error: linkError } = await supabase.from('sales_deal_forecast_lines').insert({
      id: genId('SDF'),
      dealId: deal.id,
      forecastLineId: line.id,
      customerId: customer.id,
      fgCode: line.fgCode,
      demandMonth,
      qtyAllocated: qty,
      createdById: user.id || null,
      createdByName: user.name || null,
    });
    if (linkError) {
      await supabase.from('sales_deals').delete().in('id', [...created.map((d) => d.id), deal.id]);
      return Response.json({ error: `ผูกรายการ FC เข้าดีลไม่สำเร็จ: ${linkError.message}` }, { status: 500 });
    }

    await supabase.from('sales_deal_stage_history').insert({
      id: genId('DSH'), dealId: deal.id, fromStage: null, toStage: deal.stage,
      changedBy: user.id || null, changedByName: user.name || null,
    });
    await supabase.from('sales_deal_forecasts').insert({
      id: genId('DFC'), dealId: deal.id, forecastMonth,
      forecastAmount: forecastAmount(deal), probability: deal.probability,
      source: 'sahamit-forecast', createdBy: user.id || null, createdByName: user.name || null,
    });
    created.push(deal);
  }

  await recordAudit({
    user,
    action: 'create',
    entityType: 'sales_deal',
    entityId: created[0]?.id || round.id,
    after: { count: created.length, ownerName, forecastMonth, skipped },
    summary: `create ${created.length} sales deal(s) from Sahamit FC #${round.roundNo} (1 line = 1 deal, AE ${ownerName}${skipped ? `, ข้ามซ้ำ ${skipped}` : ''})`,
    request,
  });

  return Response.json({ deals: created, count: created.length, skipped });
}
