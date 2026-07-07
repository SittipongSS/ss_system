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

function dealKey({ roundId, demandMonth, ownerName }) {
  return `${roundId}||${demandMonth}||${ownerName || ''}`;
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

export async function POST(request, { params }) {
  const ctx = await getSahamitContext();
  if (!ctx.ok) return sahamitError(ctx);
  const { supabase, customerId, customer, user } = ctx;
  if (!canEditSalesPlanning(user)) return Response.json({ error: 'forbidden' }, { status: 403 });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const closeMonthByDemand = body.closeMonthByDemand && typeof body.closeMonthByDemand === 'object'
    ? body.closeMonthByDemand
    : {};

  const round = await loadRound(supabase, customerId, id);
  if (!round) return Response.json({ error: 'ไม่พบรอบ FC นี้' }, { status: 404 });

  const products = await loadSahamitProducts(supabase, customerId);
  const productIndex = indexByFgCode(products);
  const groups = new Map();

  for (const line of round.lines || []) {
    const demandMonth = monthKey(line.month);
    const qty = Number(line.qty || 0);
    if (!demandMonth || qty <= 0) continue;
    const product = productIndex.get(String(line.fgCode || '').trim().toLowerCase());
    const ownerName = product?.assignee || user.name || null;
    const key = dealKey({ roundId: round.id, demandMonth, ownerName });
    if (!groups.has(key)) {
      const closeMonth = monthKey(closeMonthByDemand[demandMonth]) || demandMonth;
      groups.set(key, {
        demandMonth,
        closeMonth,
        ownerName,
        ownerId: product?.ownerId || null,
        team: user.team || 'KA',
        qty: 0,
        value: 0,
        fgCodes: new Set(),
        productNames: new Set(),
      });
    }
    const bucket = groups.get(key);
    const price = Number(product?.price ?? 0);
    bucket.qty += qty;
    bucket.value += qty * (Number.isFinite(price) ? price : 0);
    bucket.fgCodes.add(line.fgCode);
    if (line.productName || product?.name) bucket.productNames.add(line.productName || product.name);
  }

  if (!groups.size) return Response.json({ error: 'รอบ FC นี้ไม่มีรายการที่ซิงก์ได้' }, { status: 400 });

  const { data: existingRows, error: existingError } = await supabase
    .from('sales_deals')
    .select('*')
    .eq('customerId', customer.id);
  if (existingError) return Response.json({ error: existingError.message }, { status: 500 });

  const existingByKey = new Map();
  for (const deal of existingRows || []) {
    const meta = deal.metadata || {};
    if (meta.source !== 'sahamit-forecast' || meta.sahamitForecastRoundId !== round.id) continue;
    existingByKey.set(dealKey({
      roundId: round.id,
      demandMonth: meta.sahamitDemandMonth,
      ownerName: deal.ownerName || meta.ownerName || null,
    }), deal);
  }

  const now = new Date().toISOString();
  const created = [];
  const updated = [];
  const skipped = [];

  for (const bucket of groups.values()) {
    const fgCodes = [...bucket.fgCodes].sort();
    const closeDate = lastDayOfMonth(bucket.closeMonth);
    const key = dealKey({ roundId: round.id, demandMonth: bucket.demandMonth, ownerName: bucket.ownerName });
    const existing = existingByKey.get(key);
    const metadata = {
      ...(existing?.metadata || {}),
      source: 'sahamit-forecast',
      sahamitForecastRoundId: round.id,
      sahamitForecastRoundNo: round.roundNo,
      sahamitDemandMonth: bucket.demandMonth,
      fgCodes,
      productNames: [...bucket.productNames].sort(),
      forecastQty: bucket.qty,
      fcReceivedDate: round.receivedDate || null,
      ownerName: bucket.ownerName || null,
      syncedAt: now,
    };

    if (existing && ['won', 'in_project', 'lost'].includes(existing.stage)) {
      skipped.push(existing);
      continue;
    }

    if (existing) {
      // forecastMonth / expectedCloseDate เป็นของสายขาย (Sales Forecast Month = เดือน
      // ที่คาดได้รับ PO) — re-sync ไม่เขียนทับค่าที่ผู้ใช้ปรับแล้ว. FC drift ให้ขึ้นธง
      // แนะนำแทน (Phase 3) ไม่ดันเดือนอัตโนมัติ.
      const { data, error } = await supabase
        .from('sales_deals')
        .update({
          projectValue: toMoney(bucket.value),
          ownerId: existing.ownerId || bucket.ownerId || user.id || null,
          ownerName: existing.ownerName || bucket.ownerName || user.name || null,
          team: existing.team || bucket.team,
          metadata,
          updatedAt: now,
        })
        .eq('id', existing.id)
        .select()
        .single();
      if (error) return Response.json({ error: error.message }, { status: 500 });
      updated.push(data);
      await supabase.from('sales_deal_forecasts').insert({
        id: genId('DFC'),
        dealId: data.id,
        forecastMonth: data.forecastMonth || bucket.closeMonth,
        forecastAmount: forecastAmount(data),
        probability: data.probability,
        source: 'sahamit-forecast',
        createdBy: user.id || null,
        createdByName: user.name || null,
      });
      continue;
    }

    const row = {
      id: genId('DEAL'),
      customerId: customer.id,
      customerName: customer.name || null,
      title: `Sahamit FC ${bucket.demandMonth}${bucket.ownerName ? ` · ${bucket.ownerName}` : ''}`,
      stage: 'qualified',
      projectValue: toMoney(bucket.value),
      probability: 30,
      forecastMonth: bucket.closeMonth,
      expectedCloseDate: closeDate,
      depositPaid: false,
      confirmedAt: null,
      lostReason: null,
      notes: `สร้างจาก FC สหมิตร รอบ #${round.roundNo} เดือนรับของ ${bucket.demandMonth}`,
      ownerId: bucket.ownerId || user.id || null,
      ownerName: bucket.ownerName || user.name || null,
      team: bucket.team,
      metadata,
    };
    const { data, error } = await supabase.from('sales_deals').insert(row).select().single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    created.push(data);
    await supabase.from('sales_deal_stage_history').insert({
      id: genId('DSH'),
      dealId: data.id,
      fromStage: null,
      toStage: data.stage,
      changedBy: user.id || null,
      changedByName: user.name || null,
    });
    await supabase.from('sales_deal_forecasts').insert({
      id: genId('DFC'),
      dealId: data.id,
      forecastMonth: data.forecastMonth || bucket.closeMonth,
      forecastAmount: forecastAmount(data),
      probability: data.probability,
      source: 'sahamit-forecast',
      createdBy: user.id || null,
      createdByName: user.name || null,
    });
  }

  await recordAudit({
    user,
    action: 'update',
    entityType: 'sahamit_forecast_round',
    entityId: round.id,
    after: { created: created.length, updated: updated.length, skipped: skipped.length },
    summary: `sync Sahamit FC #${round.roundNo} to Sales Plan`,
    request,
  });

  return Response.json({ roundId: round.id, created, updated, skipped });
}
