// ยืนยัน PO ↔ ดีล + ออกใบเสนอราคา (ท่อขายเต็ม — มติ §7 2026-07-19)
// เดิม route นี้ปิด Won ทางลัด (markWon ตรง) → เลิกแล้ว. ตอนนี้ทำแค่ 2 อย่างต่อบรรทัด:
//   1. ผูกดีลเข้าโครงการ PM ของ PO (ต้องสร้างโครงการก่อน — QT มาตรฐานบังคับ projectId)
//   2. ออก QT จากบรรทัด PO (ราคาล็อกจาก master) → เข้าคิว "เจ้าของดีลเซ็น" ปกติ
// จากนั้นวิ่งท่อมาตรฐานล้วน: เซ็น → ส่ง → accept (แนบไฟล์ PO + เลือกเดือน = Won) →
// SO → คิวอนุมัติสองคน → Actual (trigger 0110). ย้อน = ยกเลิก SO ผ่าน reversal 0116.
import { getSahamitContext, sahamitError, loadSahamitProducts, indexByFgCode, sahamitDealTitle } from '@/lib/sahamit/server';
import { canEditSalesPlanning, canViewSalesPlanning, inSalesEditScope, monthKey, toMoney } from '@/lib/salesPlanning';
import { carveOpenDealForPo, monthGap } from '@/lib/salesPlanningForecast';
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

  // บรรทัดที่ PO นี้ออก QT ไปแล้ว (จาก deal.metadata.sahamitPoId + fgCodes)
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
    // เสนอ "เฉพาะดีลที่เลข FG ตรงกับสินค้า" เท่านั้น — ถ้าไม่มี → ให้สร้างดีลใหม่/ข้าม
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

// POST — ยืนยันรายบรรทัด. body: { settlements: [{ poLineId, dealId, mode? } | { poLineId, createNew:true }] }
// mode (เฉพาะ dealId ที่ PO ครอบบางส่วน): 'split' = แบ่งดีล (ส่วนเหลือเปิดต่อ) |
// 'whole' = ใช้ทั้งดีล (ปิดทั้งดีลด้วย PO นี้). default 'split'.
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
  const priceOf = (f) => productIndex.get(lc(f))?.price ?? 0;

  // กันเชื่อมซ้ำ: บรรทัดที่ PO นี้ออก QT ไปแล้ว (ดีลมี metadata.sahamitPoId = PO นี้)
  // จะไม่ถูกทำซ้ำ แม้ client ส่งมาอีก. จับด้วย fgCode (normalize) เหมือนตอน GET.
  const { data: alreadySettled } = await supabase
    .from('sales_deals').select('metadata').eq('customerId', customerId).eq('metadata->>sahamitPoId', po.id);
  const settledFg = new Set();
  for (const d of alreadySettled || []) for (const fg of (d.metadata?.fgCodes || [])) settledFg.add(norm(fg));

  const results = [];
  const skipped = [];
  const errors = [];

  for (const s of settlements) {
    const line = activeLines.find((l) => l.id === s.poLineId);
    if (!line) continue;
    if (!s.dealId && !s.createNew) continue; // ข้าม
    if (settledFg.has(norm(line.fgCode))) { skipped.push(line.id); continue; } // เชื่อมไปแล้ว

    const fg = String(line.fgCode || '').trim();
    const qty = toQty(line.qty);
    const product = productIndex.get(lc(fg));
    let target = null; // ดีลที่จะออก QT (ดีลเดิม / ดีลลูกจาก split / ดีลใหม่)

    try {
      if (s.dealId) {
        const { data: d } = await supabase.from('sales_deals').select('*').eq('id', s.dealId).maybeSingle();
        if (!d || d.customerId !== customer.id || CLOSED.includes(d.stage)) {
          errors.push({ poLineId: line.id, error: 'ดีลที่เลือกใช้ไม่ได้ (ไม่พบ/ปิดแล้ว)' });
          continue;
        }
        if (d.projectId && d.projectId !== po.projectId) {
          errors.push({ poLineId: line.id, error: 'ดีลนี้ผูกโครงการอื่นอยู่แล้ว' });
          continue;
        }
        // สิทธิ์ตามสายขายมาตรฐาน (ae=ของตัวเอง, senior/ac=ทีม, superuser=ทั้งหมด)
        if (!inSalesEditScope(user, d)) {
          errors.push({ poLineId: line.id, error: `ไม่มีสิทธิ์แก้ดีลของ ${d.ownerName || 'ผู้อื่น'}` });
          continue;
        }

        // PO ครอบบางส่วน + ผู้ใช้เลือกแบ่งดีล → ดีลลูกเปิด (ไม่ Won) รับส่วนที่ครอบ
        if ((s.mode || 'split') === 'split') {
          const { data: links } = await supabase.from('sales_deal_forecast_lines').select('*').eq('dealId', d.id);
          const carved = await carveOpenDealForPo({
            supabase, user, deal: d, links: links || [],
            poQtyByFg: new Map([[fg, qty]]), priceOf, po, now, request,
          });
          target = carved.deal;
        } else {
          target = d;
        }
      } else {
        // PO นอก forecast → สร้างดีลใหม่ "เปิด" แล้ววิ่งท่อเดียวกัน (ไม่ใช่ won stub แล้ว)
        const price = Number(product?.price ?? 0);
        const dealRow = {
          id: genId('DEAL'),
          customerId: customer.id,
          customerName: customer.name || null,
          title: sahamitDealTitle(product, line.productName || fg),
          stage: 'qualified',
          projectValue: toMoney(qty * (Number.isFinite(price) ? price : 0)),
          probability: 80,
          forecastMonth: monthKey(po.receivedDate || po.dueDate || now),
          expectedCloseDate: po.dueDate || null,
          depositPaid: false,
          confirmedAt: null,
          notes: `สร้างจาก PO สหมิตร ${po.poNumber} (นอก forecast) · ${fg}`,
          ownerId: user.id || null,
          ownerName: user.name || null,
          team: 'KA',
          dealType: 'RE-ORDER',
          metadata: {
            source: 'sahamit-po',
            projectType: 'RE-ORDER',
            fgCodes: [fg],
            productNames: [line.productName || product?.name || fg].filter(Boolean),
            poReceivedDate: po.receivedDate || null,
          },
        };
        const { data: created, error: createErr } = await supabase.from('sales_deals').insert(dealRow).select().single();
        if (createErr) throw createErr;
        await supabase.from('sales_deal_stage_history').insert({
          id: genId('DSH'), dealId: created.id, fromStage: null, toStage: created.stage,
          changedBy: user.id || null, changedByName: user.name || null,
        });
        target = created;
      }

      // ผูกดีลเข้าโครงการของ PO + ประทับ PO ลง metadata (ใช้เป็นกุญแจกันซ้ำ/แสดงสถานะ)
      const { data: linked, error: linkErr } = await supabase
        .from('sales_deals')
        .update({
          projectId: po.projectId,
          metadata: {
            ...(target.metadata || {}),
            sahamitPoId: po.id,
            poNumber: po.poNumber,
            poReceivedDate: po.receivedDate || null,
            projectCode: project.code || null,
            sahamitPoLineId: line.id,
          },
          updatedAt: now,
        })
        .eq('id', target.id).select().single();
      if (linkErr) throw linkErr;

      // ออก QT จากบรรทัด PO — ราคาโดน enforceMasterPrices ทับจาก master เสมอ
      // (สินค้าไม่อยู่ใน master → productId null → ราคา 0 ให้ไปเติมใน editor + แจ้ง warning)
      const { quote } = await createQuotationDraft({
        supabase,
        user,
        deal: linked,
        body: {
          lines: [{ productId: product?.id || null, fgCode: fg, description: line.productName || undefined, qty }],
          notes: `ออกจาก PO สหมิตร ${po.poNumber}`,
          metadata: { source: 'sahamit-po', sahamitPoId: po.id, poNumber: po.poNumber, sahamitPoLineId: line.id },
        },
        request,
      });

      results.push({
        poLineId: line.id,
        dealId: linked.id,
        title: linked.title,
        quotationId: quote.id,
        quoteNumber: quote.quoteNumber,
        // ราคาใบ = retailPriceIncVat จาก master (ไม่ใช่ costPrice ที่ใช้คิดมูลค่าดีล) —
        // เช็คจากยอดรวมใบที่ออกจริง: 0 = master ยังไม่ตั้งราคาขาย/ไม่รู้จักสินค้า
        priceMissing: !product?.id || !(Number(quote.totalAmount) > 0),
      });
      settledFg.add(norm(fg)); // กันซ้ำภายในคำขอเดียวกัน (สองบรรทัด fgCode เดียว)
    } catch (e) {
      errors.push({ poLineId: line.id, error: e instanceof QuotationDraftError ? e.message : (e.message || 'ไม่สำเร็จ') });
    }
  }

  if (results.length) {
    await supabase.from('sahamit_pos')
      .update({ salesDealId: po.salesDealId || results[0].dealId, updatedAt: now })
      .eq('id', po.id).eq('customerId', customerId);
    await recordAudit({
      user,
      action: 'create',
      entityType: 'quotation',
      entityId: results[0].quotationId,
      after: { poId: po.id, poNumber: po.poNumber, results },
      summary: `ยืนยัน PO สหมิตร ${po.poNumber} → ออก QT ${results.length} ใบเข้าคิวเซ็น (ท่อ QT→SO)`,
      request,
    });
  }
  return Response.json({ settled: results.length, results, skipped: skipped.length, errors });
}
