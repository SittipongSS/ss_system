// ยืนยัน PO ↔ ดีล + ออกใบเสนอราคา (ท่อขายเต็ม — มติ §7 2026-07-19, 1 PO = 1 ดีลรวม)
// เดิม route นี้ปิด Won ทางลัด (markWon ตรง) → เลิกแล้ว. ตอนนี้การยืนยันหนึ่งครั้ง:
//   1. รวมทุกบรรทัดที่เลือกเป็น "ดีลรวมใบเดียวต่อ PO" (SHM_PO <เลขที่>) — ดีล FC ต้นทาง
//      ย้าย junction เข้าดีลรวม แล้วปิดด้วยธง merged (สถิติแพ้กรองออกผ่าน
//      isAdministrativeLoss ใน lib/sales/dashboardMetrics); partial + เลือก "แบ่ง" →
//      ย้ายเฉพาะส่วนที่ PO ครอบ ต้นทางเปิดต่อรอ PO ถัดไป
//   2. ผูกดีลรวมเข้าโครงการ PM ของ PO (ต้องสร้างโครงการก่อน — QT มาตรฐานบังคับ projectId)
//   3. ออก QT "ใบเดียวหลายบรรทัด" ตาม PO (ราคาล็อกจาก master) → คิวเจ้าของดีลเซ็นปกติ
// เหตุผลดีลรวม: การเก็บเงินผูกกับ PO ทั้งใบ — ลูกค้าเซ็น QT ใบเดียว, งวดชำระชุดเดียว,
// SO ใบเดียวยอดตรง PO. จากนั้นวิ่งท่อมาตรฐานล้วน: เซ็น → ส่ง → accept (แนบไฟล์ PO +
// เลือกเดือน = Won) → SO → คิวอนุมัติสองคน → Actual (trigger 0110), ย้อนผ่าน 0116.
import { getSahamitContext, sahamitError, loadSahamitProducts, indexByFgCode } from '@/lib/sahamit/server';
import { canEditSalesPlanning, canViewSalesPlanning, forecastAmount, inSalesEditScope, monthKey, toMoney } from '@/lib/salesPlanning';
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

// fg ที่ PO นี้เชื่อมไปแล้ว "กับดีลที่ยังไม่ตาย" — ดีลรวมที่ถูก mark lost (เช่น ลูกค้า
// ปฏิเสธ QT แล้วทิ้งดีล หรือย้อน Won เป็น lost ผ่าน 0116) ไม่บล็อก ให้ settle ใหม่ได้
// (ไม่งั้น PO ที่ยังเก็บเงินได้จริงจะตันถาวรจนต้องแก้ DB มือ)
async function loadSettledFg(supabase, customerId, poId) {
  const { data } = await supabase
    .from('sales_deals').select('id, stage, metadata')
    .eq('customerId', customerId).eq('metadata->>sahamitPoId', poId);
  const byFg = new Map(); // normFg → dealId
  for (const d of data || []) {
    if (d.stage === 'lost') continue;
    for (const fg of (d.metadata?.fgCodes || [])) byFg.set(norm(fg), d.id);
  }
  return byFg;
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
  const [{ data: deals }, settledByFg] = await Promise.all([
    supabase.from('sales_deals').select('*')
      .eq('customerId', customerId).is('projectId', null).eq('metadata->>source', 'sahamit-forecast'),
    loadSettledFg(supabase, customerId, po.id),
  ]);
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
// 'whole' = ใช้ทั้งดีล (ยุบทั้งดีลเข้าดีลรวม). default 'split'.
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
    .from('projects').select('id, code, metadata').eq('id', po.projectId).maybeSingle();
  if (!project) return Response.json({ error: 'ไม่พบโครงการ PM ที่ผูกกับ PO นี้' }, { status: 400 });

  const activeLines = (po.lines || []).filter((l) => l.status !== 'cancelled' && toQty(l.qty) > 0);
  const products = await loadSahamitProducts(supabase, customerId);
  const productIndex = indexByFgCode(products);
  const now = new Date().toISOString();
  // ราคาสายสหมิตร = ราคาโรงงาน (costPrice) ทั้งมูลค่าดีลและราคาใน QT (มติ 2026-07-19 —
  // สหมิตรซื้อราคาโรงงาน ยอด QT/SO ต้องตรง PO; createQuotationDraft ตั้ง
  // priceBasis='factory' อัตโนมัติจาก deal.metadata.source แล้ว enforce จาก master)
  const priceOf = (f) => Number(productIndex.get(lc(f))?.price ?? 0) || 0;

  const settledByFg = await loadSettledFg(supabase, customerId, po.id);

  // ── pass 1: คัดบรรทัด + validate ทุกอย่างก่อน แล้วค่อยเขียน (all-or-nothing) ──────
  // dedup ด้วย poLineId (ไม่ใช่ fgCode — PO มีสินค้าเดียวกันสองบรรทัดได้ เช่น คนละ
  // เดือนส่ง ทุกบรรทัดต้องขึ้นใบให้ครบ); ข้ามเฉพาะบรรทัดที่เชื่อมไปแล้วจากรอบก่อน
  const chosen = [];
  const skipped = [];
  const seenLineIds = new Set();
  for (const s of settlements) {
    const line = activeLines.find((l) => l.id === s.poLineId);
    if (!line || seenLineIds.has(line.id)) continue;
    seenLineIds.add(line.id);
    if (!s.dealId && !s.createNew) continue; // ข้าม
    if (settledByFg.has(norm(line.fgCode))) { skipped.push(line.id); continue; } // เชื่อมไปแล้ว
    chosen.push({
      line,
      fg: String(line.fgCode || '').trim(),
      qty: toQty(line.qty),
      product: productIndex.get(lc(line.fgCode)),
      dealId: s.dealId ? String(s.dealId) : null,
      mode: s.mode === 'whole' ? 'whole' : 'split',
    });
  }
  if (!chosen.length) {
    return Response.json({ error: 'รายการที่เลือกถูกเชื่อมไปแล้วทั้งหมด', skipped: skipped.length, settled: 0 }, { status: 409 });
  }

  // โหลดดีลต้นทาง + junction แบบ batch (สอง query — ไม่ N+1 ต่อบรรทัด)
  const dealIds = [...new Set(chosen.filter((c) => c.dealId).map((c) => c.dealId))];
  const [{ data: srcDeals }, { data: srcLinks }] = dealIds.length
    ? await Promise.all([
      supabase.from('sales_deals').select('*').in('id', dealIds),
      supabase.from('sales_deal_forecast_lines').select('*').in('dealId', dealIds),
    ])
    : [{ data: [] }, { data: [] }];
  const srcById = new Map((srcDeals || []).map((d) => [d.id, d]));
  const linksByDeal = new Map();
  for (const l of srcLinks || []) {
    if (!linksByDeal.has(l.dealId)) linksByDeal.set(l.dealId, []);
    linksByDeal.get(l.dealId).push(l);
  }
  for (const dealId of dealIds) {
    const d = srcById.get(dealId);
    if (!d || d.customerId !== customer.id || CLOSED.includes(d.stage)) {
      return Response.json({ error: 'ดีลที่เลือกใช้ไม่ได้ (ไม่พบ/ปิดแล้ว) — รีเฟรชหน้าแล้วลองใหม่' }, { status: 400 });
    }
    if (d.projectId) {
      return Response.json({ error: `ดีล "${d.title}" ผูกโครงการอื่นอยู่แล้ว` }, { status: 400 });
    }
    // สิทธิ์ตามสายขายมาตรฐาน (ae=ของตัวเอง, senior/ac=ทีม, superuser=ทั้งหมด)
    if (!inSalesEditScope(user, d)) {
      return Response.json({ error: `ไม่มีสิทธิ์แก้ดีลของ ${d.ownerName || 'ผู้อื่น'} ("${d.title}")` }, { status: 400 });
    }
  }

  // จัดกลุ่ม operation ราย "ดีลต้นทาง" — ดีลเดียวถูกเลือกให้หลายบรรทัดต้องประมวลผล
  // ครั้งเดียว (need รวมต่อ fg; เลือก 'ทั้งดีล' บรรทัดไหนก็ตาม = ทั้งดีลชนะ)
  const sourceOps = new Map(); // dealId → { deal, links, needByFg: Map(normFg→qty), whole }
  for (const c of chosen) {
    if (!c.dealId) continue;
    if (!sourceOps.has(c.dealId)) {
      sourceOps.set(c.dealId, { deal: srcById.get(c.dealId), links: linksByDeal.get(c.dealId) || [], needByFg: new Map(), whole: false });
    }
    const op = sourceOps.get(c.dealId);
    const k = norm(c.fg);
    op.needByFg.set(k, (op.needByFg.get(k) || 0) + c.qty);
    if (c.mode === 'whole') op.whole = true;
  }

  // ── pass 2: สร้างดีลรวม 1 ใบต่อ PO (+ stage history + snapshot พยากรณ์ ให้ครบคู่
  // เหมือนทุกเส้นทางสร้างดีลอื่นในระบบ) ─────────────────────────────────────────────
  // เจ้าของ = เจ้าของดีล FC ตัวแรกที่ถูกจับคู่ (สหมิตรเป็น AE ทีม KA อยู่แล้ว);
  // ไม่มีดีลต้นทางเลย (ทุกบรรทัดนอก forecast) → ผู้ใช้ที่กดยืนยัน
  const ownerSrc = chosen.map((c) => c.dealId && srcById.get(c.dealId)).find(Boolean) || null;
  const fgList = [...new Set(chosen.map((c) => c.fg))];
  const totalValue = chosen.reduce((sum, c) => sum + c.qty * priceOf(c.fg), 0);
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
    notes: `ดีลรวมจาก PO สหมิตร ${po.poNumber} (${chosen.length} รายการ)`,
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
      productNames: [...new Set(chosen.map((c) => c.line.productName || c.product?.name || c.fg))],
      mergedFromDealIds: [...sourceOps.keys()],
    },
  };
  const { data: merged, error: mergedErr } = await supabase.from('sales_deals').insert(mergedRow).select().single();
  if (mergedErr) return Response.json({ error: mergedErr.message }, { status: 500 });
  await supabase.from('sales_deal_stage_history').insert({
    id: genId('DSH'), dealId: merged.id, fromStage: null, toStage: merged.stage,
    changedBy: user.id || null, changedByName: user.name || null,
  });
  await supabase.from('sales_deal_forecasts').insert({
    id: genId('DFC'), dealId: merged.id, forecastMonth: merged.forecastMonth,
    forecastAmount: forecastAmount(merged), probability: merged.probability,
    source: 'sahamit-po', createdBy: user.id || null, createdByName: user.name || null,
  });

  // ── pass 3: ออก QT ใบเดียวหลายบรรทัดก่อนแตะดีลต้นทาง — พลาดตรงนี้ rollback แค่
  // ดีลรวม (ยังไม่มีอะไรถูกย้าย/ปิด; history/forecast/junction ลบตาม FK cascade) ────
  let quote;
  try {
    ({ quote } = await createQuotationDraft({
      supabase,
      user,
      deal: merged,
      body: {
        lines: chosen.map((c) => ({
          productId: c.product?.id || null,
          fgCode: c.fg,
          description: c.line.productName || undefined,
          qty: c.qty,
        })),
        notes: `ออกจาก PO สหมิตร ${po.poNumber}`,
        metadata: { source: 'sahamit-po', sahamitPoId: po.id, poNumber: po.poNumber },
      },
      request,
    }));
  } catch (e) {
    const { error: rollbackErr } = await supabase.from('sales_deals').delete().eq('id', merged.id);
    const msg = e instanceof QuotationDraftError ? e.message : (e.message || 'ออกใบเสนอราคาไม่สำเร็จ');
    const rollbackNote = rollbackErr ? ` (⚠ ลบดีลรวมคืนไม่สำเร็จ: ${rollbackErr.message} — แจ้งแอดมินลบดีล ${merged.id})` : '';
    return Response.json({ error: msg + rollbackNote }, { status: e instanceof QuotationDraftError ? e.status : 500 });
  }

  // ── pass 4: ย้าย junction FC เข้าดีลรวม + จัดการดีลต้นทาง (ราย "ดีล" ครั้งเดียว) ──
  // การเชื่อม FC ต่อสินค้า×เดือนอยู่ครบบนดีลรวม → FC-vs-PO รายสินค้ายังวัดได้เสมอ.
  // เขียนพลาดจุดไหนเก็บเป็น warning ส่งกลับ (ไม่มี transaction — แนวเดียวกับ route
  // สหมิตรอื่น แต่ต้องไม่เงียบ ให้ผู้ใช้/แอดมินรู้ว่าต้องตามเก็บอะไร)
  const writeWarnings = [];
  const chk = (res, what) => { if (res?.error) writeWarnings.push(`${what}: ${res.error.message}`); };
  const byCreated = (a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')) || String(a.id).localeCompare(String(b.id));
  const mergedSourceIds = [];
  const partialSourceIds = [];
  for (const op of sourceOps.values()) {
    const d = op.deal;
    const rowsAll = [...op.links].sort(byCreated);

    let closeAsMerged = false;
    if (op.whole) {
      // 'ทั้งดีล' = ยุบทั้งดีล → junction ทุกแถว (ทุก fg เต็มจำนวน) ตามไปดีลรวม
      // ไม่ทิ้ง allocation ค้างบนดีลที่ปิด
      for (const row of rowsAll) {
        chk(await supabase.from('sales_deal_forecast_lines').update({ dealId: merged.id }).eq('id', row.id), `ย้าย junction ${row.id}`);
      }
      closeAsMerged = true;
    } else {
      // 'แบ่ง': ย้ายเท่าที่ PO ครอบ (ต่อ fg, first-come ตามลำดับสร้าง)
      let movedQty = 0;
      let movedValue = 0;
      for (const [k, needTotal] of op.needByFg) {
        let need = needTotal;
        for (const row of rowsAll) {
          if (need <= 0) break;
          if (norm(row.fgCode) !== k) continue;
          const alloc = Number(row.qtyAllocated || 0);
          const take = Math.min(alloc, need);
          if (take <= 0) continue;
          if (take >= alloc) {
            chk(await supabase.from('sales_deal_forecast_lines').update({ dealId: merged.id }).eq('id', row.id), `ย้าย junction ${row.id}`);
          } else {
            chk(await supabase.from('sales_deal_forecast_lines').update({ qtyAllocated: alloc - take }).eq('id', row.id), `ลด junction ${row.id}`);
            chk(await supabase.from('sales_deal_forecast_lines').insert({
              id: genId('SDF'),
              dealId: merged.id,
              forecastLineId: row.forecastLineId,
              customerId: row.customerId,
              fgCode: row.fgCode,
              demandMonth: row.demandMonth,
              qtyAllocated: take,
              createdById: user.id || null,
              createdByName: user.name || null,
            }), `เพิ่ม junction ดีลรวม (${row.fgCode})`);
          }
          need -= take;
          movedQty += take;
          movedValue += take * priceOf(row.fgCode);
        }
      }
      // ปิดต้นทางเฉพาะเมื่อไม่เหลือ allocation "สักสินค้าเดียว" — ดีล multi-fg ที่
      // สินค้าอื่นยังมี demand ค้างต้องเปิดต่อ ไม่ใช่โดนปิดทั้งดีล
      const totalAllocAll = rowsAll.reduce((sum, r) => sum + Number(r.qtyAllocated || 0), 0);
      if (movedQty >= totalAllocAll) {
        closeAsMerged = true;
      } else {
        const newValue = Math.max(0, toMoney(Number(d.projectValue || 0) - movedValue));
        chk(await supabase.from('sales_deals').update({
          projectValue: newValue,
          metadata: {
            ...(d.metadata || {}),
            sahamitPartialMergedToDealId: merged.id,
            sahamitPartialMergedPoId: po.id,
          },
          updatedAt: now,
        }).eq('id', d.id), `หักมูลค่าดีลต้นทาง ${d.id}`);
        partialSourceIds.push(d.id);
      }
    }

    if (closeAsMerged) {
      // ปิดต้นทางด้วยธง merged (ไม่ใช่แพ้จริง — สถิติแพ้กรองออกผ่าน isAdministrativeLoss)
      chk(await supabase.from('sales_deals').update({
        stage: 'lost',
        lostReason: `รวมเข้าดีล PO สหมิตร ${po.poNumber}`,
        metadata: {
          ...(d.metadata || {}),
          sahamitMergedIntoDealId: merged.id,
          sahamitMergedPoId: po.id,
          sahamitMergedAt: now,
        },
        updatedAt: now,
      }).eq('id', d.id), `ปิดดีลต้นทาง ${d.id}`);
      await supabase.from('sales_deal_stage_history').insert({
        id: genId('DSH'), dealId: d.id, fromStage: d.stage, toStage: 'lost',
        changedBy: user.id || null, changedByName: user.name || null,
      });
      mergedSourceIds.push(d.id);
    }
  }

  // ลิงก์ PO→ดีล: เก็บดีลรวมใบแรกไว้เสมอ (settle รอบสอง — บรรทัดที่ skip ไว้ — ไม่ทับ)
  await supabase.from('sahamit_pos')
    .update({ salesDealId: po.salesDealId || merged.id, updatedAt: now })
    .eq('id', po.id).eq('customerId', customerId);
  // โครงการ↔ดีล: เอกสารปลายน้ำ (excise from-project / shipment-prep) snapshot
  // metadata.salesDealId จากโครงการ — เดิม create-project เป็นคนเขียน ตอนนี้เขียนที่นี่
  if (!project.metadata?.salesDealId) {
    chk(await supabase.from('projects')
      .update({ metadata: { ...(project.metadata || {}), salesDealId: merged.id } })
      .eq('id', project.id), 'ผูกดีลเข้า metadata โครงการ');
  }

  await recordAudit({
    user,
    action: 'create',
    entityType: 'sales_deal',
    entityId: merged.id,
    after: { deal: merged, quotationId: quote.id, quoteNumber: quote.quoteNumber, mergedSourceIds, partialSourceIds, writeWarnings },
    summary: `รวม PO สหมิตร ${po.poNumber} เป็นดีลเดียว (${chosen.length} รายการ, ยุบ ${mergedSourceIds.length} ดีล${partialSourceIds.length ? `, แบ่ง ${partialSourceIds.length}` : ''}) + ออก QT ${quote.quoteNumber} เข้าคิวเซ็น${writeWarnings.length ? ` ⚠ ${writeWarnings.length} จุดเขียนไม่สำเร็จ` : ''}`,
    request,
  });

  return Response.json({
    settled: chosen.length,
    dealId: merged.id,
    title: merged.title,
    quotationId: quote.id,
    quoteNumber: quote.quoteNumber,
    // ราคาใบ = ราคาโรงงาน (costPrice) จาก master — ยอดรวม 0/ไม่ครบ = master ยังไม่ตั้งราคา
    priceMissing: !(Number(quote.totalAmount) > 0) || chosen.some((c) => !c.product?.id),
    mergedFrom: mergedSourceIds.length,
    partialFrom: partialSourceIds.length,
    skipped: skipped.length,
    warnings: writeWarnings,
  });
}
