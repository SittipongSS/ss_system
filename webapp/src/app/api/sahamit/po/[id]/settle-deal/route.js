// ยืนยัน PO ↔ ดีล + ออกใบเสนอราคา (ท่อขายเต็ม — มติ §7 2026-07-19, ปรับ 1 PO = 1 ดีลรวม)
// เดิม route นี้ปิด Won ทางลัด (markWon ตรง) → เลิกแล้ว. ตอนนี้การยืนยันหนึ่งครั้ง:
//   1. รวมทุกบรรทัดที่เลือกเป็น "ดีลรวมใบเดียวต่อ PO" (SHM_PO <เลขที่>) — ดีล FC ต้นทาง
//      ย้าย junction เข้าดีลรวม แล้วปิดด้วยธง merged (กรองออกจากสถิติแพ้ได้);
//      partial + เลือก "แบ่ง" → ย้ายเฉพาะส่วนที่ PO ครอบ ต้นทางเปิดต่อรอ PO ถัดไป
//   2. ผูกดีลรวมเข้าโครงการ PM ของ PO (ต้องสร้างโครงการก่อน — QT มาตรฐานบังคับ projectId)
//   3. ออก QT "ใบเดียวหลายบรรทัด" ตาม PO (ราคาล็อกจาก master) → คิวเจ้าของดีลเซ็นปกติ
// เหตุผลดีลรวม: การเก็บเงินผูกกับ PO ทั้งใบ — ลูกค้าเซ็น QT ใบเดียว, งวดชำระชุดเดียว,
// SO ใบเดียวยอดตรง PO. จากนั้นวิ่งท่อมาตรฐานล้วน: เซ็น → ส่ง → accept (แนบไฟล์ PO +
// เลือกเดือน = Won) → SO → คิวอนุมัติสองคน → Actual (trigger 0110), ย้อนผ่าน 0116.
import { getSahamitContext, sahamitError, loadSahamitProducts, indexByFgCode } from '@/lib/sahamit/server';
import { canEditSalesPlanning, canViewSalesPlanning, inSalesEditScope, monthKey, toMoney } from '@/lib/salesPlanning';
import { monthGap } from '@/lib/salesPlanningForecast';
import { createQuotationDraft, QuotationDraftError } from '@/lib/sales/createQuotationDraft';
import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const CLOSED = ['won', 'in_project', 'lost'];
const lc = (v) => String(v || '').trim().toLowerCase();
// normalize fgCode สำหรับจับคู่: ตัดช่องว่าง/ขีด/จุด ให้ "ABC-001" = "ABC 001" = "abc001"
const norm = (v) => lc(v).replace(/[\s\-_.]/g, '');
function toQty(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

async function loadPoWithLines(supabase, customerId, id) {
  const { data: po, error } = await supabase
    .from('sahamit_pos').select('*').eq('id', id).eq('customerId', customerId).maybeSingle();
  if (error) throw error;
  if (!po) return null;
  const { data: lines, error: lErr } = await supabase
    .from('sahamit_po_lines').select('*').eq('poId', id);
  if (lErr) throw lErr;
  return { ...po, lines: lines || [] };
}

// GET — จับคู่ราย "บรรทัด PO": แต่ละสินค้าใน PO เสนอดีลที่ fgCode ตรง เรียงตาม
// ความใกล้ของ "เดือนคาดปิดดีล" กับ "เดือนที่รับ PO". ไม่แก้ข้อมูล.
export async function GET(request, { params }) {
  const ctx = await getSahamitContext();
  if (!ctx.ok) return sahamitError(ctx);
  const { supabase, customerId, user } = ctx;
  if (!canViewSalesPlanning(user)) return Response.json({ error: 'forbidden' }, { status: 403 });

  const { id } = await params;
  const po = await loadPoWithLines(supabase, customerId, id);
  if (!po) return Response.json({ error: 'ไม่พบ PO นี้' }, { status: 404 });

  const receivedMonth = (po.receivedDate || '').slice(0, 7) || null;
  const activeLines = (po.lines || []).filter((l) => l.status !== 'cancelled' && toQty(l.qty) > 0);

  // ดีล open ที่มาจาก forecast — จับ fgCode จาก deal.metadata.fgCodes (เก็บบนตัวดีลเอง
  // ทุกดีล forecast มี ไม่พึ่ง junction ที่อาจหลุดตอนแก้/ลบรอบ) → map normFg → deals
  const { data: deals } = await supabase.from('sales_deals').select('*')
    .eq('customerId', customerId).is('projectId', null).eq('metadata->>source', 'sahamit-forecast');
  const allOpen = (deals || []).filter((d) => !CLOSED.includes(d.stage));
  const byFg = new Map(); // normFg → Map(dealId→deal)
  for (const d of allOpen) {
    for (const fg of (d.metadata?.fgCodes || [])) {
      const k = norm(fg);
      if (!k) continue;
      if (!byFg.has(k)) byFg.set(k, new Map());
      byFg.get(k).set(d.id, d);
    }
  }

  // จำนวนที่ดีลผูกไว้กับ FC (qtyAllocated รวมต่อ fg) — ให้ UI รู้ว่า PO ครอบบางส่วน
  // (PO qty < alloc) เพื่อเปิดตัวเลือก "แบ่งดีล / ใช้ทั้งดีล" ตามมติ
  const openIds = allOpen.map((d) => d.id);
  const { data: allocRows } = openIds.length
    ? await supabase.from('sales_deal_forecast_lines').select('dealId, fgCode, qtyAllocated').in('dealId', openIds)
    : { data: [] };
  const allocByDealFg = new Map(); // `${dealId}||${normFg}` → qty
  for (const r of allocRows || []) {
    const k = `${r.dealId}||${norm(r.fgCode)}`;
    allocByDealFg.set(k, (allocByDealFg.get(k) || 0) + Number(r.qtyAllocated || 0));
  }

  // บรรทัดที่ PO นี้รวมเข้าดีล/ออก QT ไปแล้ว (จาก deal.metadata.sahamitPoId + fgCodes)
  const { data: settled } = await supabase
    .from('sales_deals').select('id, metadata').eq('customerId', customerId).eq('metadata->>sahamitPoId', po.id);
  const settledByFg = new Map();
  for (const d of settled || []) for (const fg of (d.metadata?.fgCodes || [])) settledByFg.set(norm(fg), d.id);

  const cand = (d, line, match) => ({
    id: d.id, title: d.title, forecastMonth: d.forecastMonth,
    projectValue: d.projectValue, ownerName: d.ownerName, match,
    allocQty: allocByDealFg.get(`${d.id}||${norm(line.fgCode)}`) || 0,
    gap: monthGap(d.forecastMonth, receivedMonth),
  });
  const byGap = (a, b) => a.gap - b.gap || String(a.forecastMonth || '').localeCompare(String(b.forecastMonth || ''));

  const lines = activeLines.map((line) => {
    const k = norm(line.fgCode);
    // เสนอ "เฉพาะดีลที่เลข FG ตรงกับสินค้า" เท่านั้น — ถ้าไม่มี → รวมเข้าดีล PO เลย/ข้าม
    const matched = [...(byFg.get(k)?.values() || [])].map((d) => cand(d, line, true)).sort(byGap);
    return {
      poLineId: line.id,
      fgCode: line.fgCode,
      productName: line.productName,
      qty: toQty(line.qty),
      deliveryMonth: line.deliveryMonth || (line.dueDate || '').slice(0, 7) || null,
      settledDealId: settledByFg.get(k) || null,
      candidates: matched,
      suggestedDealId: matched[0]?.id || null,
    };
  });

  return Response.json({
    poNumber: po.poNumber,
    poReceivedMonth: receivedMonth,
    projectId: po.projectId || null, // ต้องมีก่อนถึงออก QT ได้ (UI ใช้เตือน)
    lines,
  });
}

// POST — ยืนยันทั้งชุด → ดีลรวม 1 ใบ + QT 1 ใบ.
// body: { settlements: [{ poLineId, dealId, mode? } | { poLineId, createNew:true }] }
// mode (เฉพาะ dealId ที่ PO ครอบบางส่วน): 'split' = แบ่งดีล (ส่วนเหลือเปิดต่อ) |
// 'whole' = ใช้ทั้งดีล (ปิดทั้งดีลรวมเข้า PO นี้). default 'split'.
// validation ล้มบรรทัดไหน → ตีกลับทั้งคำขอ (QT ต้องครบตรง PO — ห้ามออกใบขาดบรรทัด)
export async function POST(request, { params }) {
  const ctx = await getSahamitContext();
  if (!ctx.ok) return sahamitError(ctx);
  const { supabase, customerId, customer, user } = ctx;
  if (!canEditSalesPlanning(user)) return Response.json({ error: 'forbidden' }, { status: 403 });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const settlements = Array.isArray(body.settlements) ? body.settlements : [];
  if (!settlements.length) return Response.json({ error: 'ยังไม่ได้เลือกบรรทัดที่จะเชื่อม' }, { status: 400 });

  const po = await loadPoWithLines(supabase, customerId, id);
  if (!po) return Response.json({ error: 'ไม่พบ PO นี้' }, { status: 404 });

  // มติ §7: ยืนยัน "ดีล + โครงการ" ก่อนออก QT — และ QT มาตรฐานบังคับดีลต้องมี projectId
  if (!po.projectId) {
    return Response.json({ error: 'PO นี้ยังไม่มีโครงการ PM — กด "สร้างโครงการ PM" ก่อน แล้วจึงยืนยันดีล/ออกใบเสนอราคา' }, { status: 400 });
  }
  const { data: project } = await supabase
    .from('projects').select('id, code').eq('id', po.projectId).maybeSingle();
  if (!project) return Response.json({ error: 'ไม่พบโครงการ PM ที่ผูกกับ PO นี้' }, { status: 400 });

  const activeLines = (po.lines || []).filter((l) => l.status !== 'cancelled' && toQty(l.qty) > 0);
  const products = await loadSahamitProducts(supabase, customerId);
  const productIndex = indexByFgCode(products);
  const now = new Date().toISOString();
  // มูลค่าดีลฝั่งสหมิตร = ราคาโรงงาน (costPrice) ตามธรรมเนียมโมดูล; ราคาใน QT เป็น
  // retailPriceIncVat จาก master (enforceMasterPrices จัดการ) — คนละตัวกันโดยตั้งใจ
  const priceOf = (f) => Number(productIndex.get(lc(f))?.price ?? 0) || 0;

  // กันเชื่อมซ้ำ: fgCode ที่ PO นี้รวมเข้าดีล/ออก QT ไปแล้ว จะไม่ถูกทำซ้ำ (ข้ามเงียบ ๆ)
  const { data: alreadySettled } = await supabase
    .from('sales_deals').select('metadata').eq('customerId', customerId).eq('metadata->>sahamitPoId', po.id);
  const settledFg = new Set();
  for (const d of alreadySettled || []) for (const fg of (d.metadata?.fgCodes || [])) settledFg.add(norm(fg));

  // ── pass 1: validate ทุกบรรทัดก่อน แล้วค่อยเขียน (all-or-nothing) ────────────
  const plan = []; // { line, fg, qty, product, source: deal|null, links, mode }
  const skipped = [];
  const seenFg = new Set(settledFg);
  for (const s of settlements) {
    const line = activeLines.find((l) => l.id === s.poLineId);
    if (!line) continue;
    if (!s.dealId && !s.createNew) continue; // ข้าม
    const fg = String(line.fgCode || '').trim();
    if (seenFg.has(norm(fg))) { skipped.push(line.id); continue; } // เชื่อมไปแล้ว/ซ้ำในชุด
    seenFg.add(norm(fg));

    let source = null;
    let links = [];
    if (s.dealId) {
      const { data: d } = await supabase.from('sales_deals').select('*').eq('id', s.dealId).maybeSingle();
      if (!d || d.customerId !== customer.id || CLOSED.includes(d.stage)) {
        return Response.json({ error: `${fg}: ดีลที่เลือกใช้ไม่ได้ (ไม่พบ/ปิดแล้ว)` }, { status: 400 });
      }
      if (d.projectId) {
        return Response.json({ error: `${fg}: ดีลนี้ผูกโครงการอื่นอยู่แล้ว` }, { status: 400 });
      }
      // สิทธิ์ตามสายขายมาตรฐาน (ae=ของตัวเอง, senior/ac=ทีม, superuser=ทั้งหมด)
      if (!inSalesEditScope(user, d)) {
        return Response.json({ error: `${fg}: ไม่มีสิทธิ์แก้ดีลของ ${d.ownerName || 'ผู้อื่น'}` }, { status: 400 });
      }
      const { data: linkRows } = await supabase.from('sales_deal_forecast_lines').select('*').eq('dealId', d.id);
      source = d;
      links = linkRows || [];
    }
    plan.push({
      line,
      fg,
      qty: toQty(line.qty),
      product: productIndex.get(lc(fg)),
      source,
      links,
      mode: s.mode === 'whole' ? 'whole' : 'split',
    });
  }
  if (!plan.length) {
    return Response.json({ error: 'รายการที่เลือกถูกเชื่อมไปแล้วทั้งหมด', skipped: skipped.length, settled: 0 }, { status: 409 });
  }

  // ── pass 2: สร้างดีลรวม 1 ใบต่อ PO ──────────────────────────────────────────
  // เจ้าของ = เจ้าของดีล FC ตัวแรกที่ถูกจับคู่ (สหมิตรเป็น AE ทีม KA อยู่แล้ว);
  // ไม่มีดีลต้นทางเลย (ทุกบรรทัดนอก forecast) → ผู้ใช้ที่กดยืนยัน
  const ownerSrc = plan.find((p) => p.source)?.source || null;
  const fgList = plan.map((p) => p.fg);
  const totalValue = plan.reduce((sum, p) => sum + p.qty * priceOf(p.fg), 0);
  const mergedRow = {
    id: genId('DEAL'),
    customerId: customer.id,
    customerName: customer.name || null,
    title: `SHM_PO ${po.poNumber}`,
    stage: 'qualified',
    projectValue: toMoney(totalValue),
    probability: 80,
    forecastMonth: monthKey(po.receivedDate || po.dueDate || now),
    expectedCloseDate: po.dueDate || null,
    depositPaid: false,
    confirmedAt: null,
    notes: `ดีลรวมจาก PO สหมิตร ${po.poNumber} (${plan.length} สินค้า)`,
    ownerId: ownerSrc?.ownerId || user.id || null,
    ownerName: ownerSrc?.ownerName || user.name || null,
    team: 'KA',
    projectId: po.projectId,
    dealType: 'RE-ORDER',
    metadata: {
      source: 'sahamit-po', // ไม่ใช่ sahamit-forecast → กติกา "FC อัพเดทเคลียร์ดีล" ไม่แตะดีลนี้
      projectType: 'RE-ORDER',
      sahamitPoId: po.id,
      poNumber: po.poNumber,
      poReceivedDate: po.receivedDate || null,
      projectCode: project.code || null,
      fgCodes: fgList,
      productNames: plan.map((p) => p.line.productName || p.product?.name || p.fg),
      mergedFromDealIds: plan.filter((p) => p.source).map((p) => p.source.id),
    },
  };
  const { data: merged, error: mergedErr } = await supabase.from('sales_deals').insert(mergedRow).select().single();
  if (mergedErr) return Response.json({ error: mergedErr.message }, { status: 500 });
  await supabase.from('sales_deal_stage_history').insert({
    id: genId('DSH'), dealId: merged.id, fromStage: null, toStage: merged.stage,
    changedBy: user.id || null, changedByName: user.name || null,
  });

  // ── pass 3: ออก QT ใบเดียวหลายบรรทัดก่อนแตะดีลต้นทาง — พลาดตรงนี้ rollback แค่
  // ดีลรวม (ยังไม่มีอะไรถูกย้าย/ปิด) ─────────────────────────────────────────────
  let quote;
  try {
    ({ quote } = await createQuotationDraft({
      supabase,
      user,
      deal: merged,
      body: {
        lines: plan.map((p) => ({
          productId: p.product?.id || null,
          fgCode: p.fg,
          description: p.line.productName || undefined,
          qty: p.qty,
        })),
        notes: `ออกจาก PO สหมิตร ${po.poNumber}`,
        metadata: { source: 'sahamit-po', sahamitPoId: po.id, poNumber: po.poNumber },
      },
      request,
    }));
  } catch (e) {
    await supabase.from('sales_deals').delete().eq('id', merged.id);
    const msg = e instanceof QuotationDraftError ? e.message : (e.message || 'ออกใบเสนอราคาไม่สำเร็จ');
    return Response.json({ error: msg }, { status: e instanceof QuotationDraftError ? e.status : 500 });
  }

  // ── pass 4: ย้าย junction FC เข้าดีลรวม + จัดการดีลต้นทาง ────────────────────
  // การเชื่อม FC ต่อสินค้า×เดือนอยู่ครบบนดีลรวม → FC-vs-PO รายสินค้ายังวัดได้เสมอ
  const mergedSourceIds = [];
  const partialSourceIds = [];
  for (const p of plan) {
    if (!p.source) continue;
    const rows = p.links
      .filter((l) => norm(l.fgCode) === norm(p.fg))
      .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')) || String(a.id).localeCompare(String(b.id)));
    const totalAlloc = rows.reduce((sum, r) => sum + Number(r.qtyAllocated || 0), 0);
    let need = p.qty;
    let covered = 0;
    for (const row of rows) {
      if (need <= 0) break;
      const alloc = Number(row.qtyAllocated || 0);
      const take = Math.min(alloc, need);
      if (take <= 0) continue;
      if (take >= alloc) {
        await supabase.from('sales_deal_forecast_lines').update({ dealId: merged.id }).eq('id', row.id);
      } else {
        await supabase.from('sales_deal_forecast_lines').update({ qtyAllocated: alloc - take }).eq('id', row.id);
        await supabase.from('sales_deal_forecast_lines').insert({
          id: genId('SDF'),
          dealId: merged.id,
          forecastLineId: row.forecastLineId,
          customerId: row.customerId,
          fgCode: row.fgCode,
          demandMonth: row.demandMonth,
          qtyAllocated: take,
          createdById: user.id || null,
          createdByName: user.name || null,
        });
      }
      need -= take;
      covered += take;
    }

    const remainingAlloc = totalAlloc - covered;
    const closeWhole = p.mode === 'whole' || remainingAlloc <= 0;
    if (closeWhole) {
      // ปิดต้นทางด้วยธง merged (ไม่ใช่แพ้จริง — ให้รายงานกรองออกได้เหมือน superseded)
      await supabase.from('sales_deals').update({
        stage: 'lost',
        lostReason: `รวมเข้าดีล PO สหมิตร ${po.poNumber}`,
        metadata: {
          ...(p.source.metadata || {}),
          sahamitMergedIntoDealId: merged.id,
          sahamitMergedPoId: po.id,
          sahamitMergedAt: now,
        },
        updatedAt: now,
      }).eq('id', p.source.id);
      await supabase.from('sales_deal_stage_history').insert({
        id: genId('DSH'), dealId: p.source.id, fromStage: p.source.stage, toStage: 'lost',
        changedBy: user.id || null, changedByName: user.name || null,
      });
      mergedSourceIds.push(p.source.id);
    } else {
      // แบ่ง: ต้นทางเปิดต่อด้วยส่วนที่เหลือ — หักมูลค่าส่วนที่ย้ายออก (ราคาโรงงาน)
      const newValue = Math.max(0, toMoney(Number(p.source.projectValue || 0) - covered * priceOf(p.fg)));
      await supabase.from('sales_deals').update({
        projectValue: newValue,
        metadata: {
          ...(p.source.metadata || {}),
          sahamitPartialMergedToDealId: merged.id,
          sahamitPartialMergedPoId: po.id,
        },
        updatedAt: now,
      }).eq('id', p.source.id);
      partialSourceIds.push(p.source.id);
    }
  }

  await supabase.from('sahamit_pos')
    .update({ salesDealId: merged.id, updatedAt: now })
    .eq('id', po.id).eq('customerId', customerId);

  await recordAudit({
    user,
    action: 'create',
    entityType: 'sales_deal',
    entityId: merged.id,
    after: { deal: merged, quotationId: quote.id, quoteNumber: quote.quoteNumber, mergedSourceIds, partialSourceIds },
    summary: `รวม PO สหมิตร ${po.poNumber} เป็นดีลเดียว (${plan.length} สินค้า, ยุบ ${mergedSourceIds.length} ดีล${partialSourceIds.length ? `, แบ่ง ${partialSourceIds.length}` : ''}) + ออก QT ${quote.quoteNumber} เข้าคิวเซ็น`,
    request,
  });

  return Response.json({
    settled: plan.length,
    dealId: merged.id,
    title: merged.title,
    quotationId: quote.id,
    quoteNumber: quote.quoteNumber,
    // ราคาใบ = retailPriceIncVat จาก master — ยอดรวม 0/ไม่ครบ = master ยังไม่ตั้งราคาขาย
    priceMissing: !(Number(quote.totalAmount) > 0) || plan.some((p) => !p.product?.id),
    mergedFrom: mergedSourceIds.length,
    partialFrom: partialSourceIds.length,
    skipped: skipped.length,
  });
}
