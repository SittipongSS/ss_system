import { getSahamitContext, sahamitError } from '@/lib/sahamit/server';
import { reportToXlsxBuffer } from '@/lib/tax/exportExcel';
import { buildReconMatrix } from '@/lib/sahamit/reconcileClient';
import { materialView } from '@/lib/sahamit/material';
import { PO_STATUS_LABEL } from '@/lib/sahamit/po';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Load the shared data the export views need.
async function loadAll(supabase, customerId) {
  const { data: rounds } = await supabase.from('sahamit_forecast_rounds').select('*').eq('customerId', customerId);
  const roundIds = (rounds || []).map((r) => r.id);
  let fcLines = [];
  if (roundIds.length) ({ data: fcLines } = await supabase.from('sahamit_forecast_lines').select('*').in('roundId', roundIds));
  const roundsWithLines = (rounds || []).map((r) => ({ ...r, lines: (fcLines || []).filter((l) => l.roundId === r.id) }));

  const { data: pos } = await supabase.from('sahamit_pos').select('*').eq('customerId', customerId);
  const poIds = (pos || []).map((p) => p.id);
  let poLines = [];
  if (poIds.length) ({ data: poLines } = await supabase.from('sahamit_po_lines').select('*').in('poId', poIds));
  const posWithLines = (pos || []).map((p) => ({ ...p, lines: (poLines || []).filter((l) => l.poId === p.id) }));

  const { data: hol } = await supabase.from('holidays').select('date');
  const holidays = new Set((hol || []).map((h) => h.date));

  const { data: trk } = await supabase.from('sahamit_material_tracking').select('*').eq('customerId', customerId);
  const { data: coverages } = await supabase.from('sahamit_po_coverage').select('*').eq('customerId', customerId);

  return { rounds: rounds || [], roundsWithLines, pos: pos || [], poLines: poLines || [], posWithLines, holidays, trk: trk || [], coverages: coverages || [] };
}

function buildReport(view, data) {
  if (view === 'forecast') {
    const rows = [];
    for (const r of data.roundsWithLines) {
      for (const l of r.lines) rows.push({ round: `#${r.roundNo}`, received: r.receivedDate, fgCode: l.fgCode, name: l.productName || '', month: l.month, qty: Number(l.qty || 0) });
    }
    return {
      title: 'SAHAMIT Forecast (รายรอบ)',
      columns: [
        { key: 'round', label: 'รอบที่' }, { key: 'received', label: 'วันรับ FC', date: true },
        { key: 'fgCode', label: 'รหัสสินค้า' }, { key: 'name', label: 'ชื่อสินค้า' },
        { key: 'month', label: 'เดือนที่ต้องการ' }, { key: 'qty', label: 'จำนวน' },
      ],
      rows,
    };
  }

  if (view === 'po') {
    const poById = new Map(data.pos.map((p) => [p.id, p]));
    const rows = data.poLines.map((l) => {
      const po = poById.get(l.poId) || {};
      return {
        poNumber: po.poNumber || '', fgCode: l.fgCode, name: l.productName || '', qty: Number(l.qty || 0),
        docDate: po.docDate, receivedDate: po.receivedDate, dueDate: l.dueDate, expectedDate: l.expectedDate,
        deliveryMonth: l.deliveryMonth || '', actual: l.actualDeliveredDate, status: PO_STATUS_LABEL[l.status] || l.status,
      };
    });
    return {
      title: 'SAHAMIT Purchase Orders',
      columns: [
        { key: 'poNumber', label: 'เลขที่ PO' }, { key: 'fgCode', label: 'รหัสสินค้า' }, { key: 'name', label: 'ชื่อสินค้า' },
        { key: 'qty', label: 'จำนวน' }, { key: 'docDate', label: 'วันเอกสาร', date: true }, { key: 'receivedDate', label: 'วันรับ', date: true },
        { key: 'dueDate', label: 'กำหนดส่ง', date: true }, { key: 'expectedDate', label: 'คาดการณ์ส่ง', date: true },
        { key: 'deliveryMonth', label: 'เดือนส่ง' }, { key: 'actual', label: 'ส่งจริง', date: true }, { key: 'status', label: 'สถานะ' },
      ],
      rows,
    };
  }

  if (view === 'material') {
    const matrix = buildReconMatrix(data.roundsWithLines, data.posWithLines);
    const fcLookup = new Map();
    for (const row of matrix.rows) for (const m of matrix.months) fcLookup.set(`${row.fgCode}||${m}`, row.cells[m]?.fcQty || 0);
    const poById = new Map(data.pos.map((p) => [p.id, p]));
    const trkByLine = new Map(data.trk.map((t) => [t.poLineId, t]));
    const rows = [];
    for (const l of data.poLines) {
      if (l.status === 'cancelled') continue;
      const po = poById.get(l.poId) || {};
      const v = materialView(l, fcLookup.get(`${l.fgCode}||${l.deliveryMonth}`) || 0, po.receivedDate, data.holidays);
      const t = trkByLine.get(l.id) || {};
      rows.push({
        fgCode: l.fgCode, name: l.productName || '', poNumber: po.poNumber || '', qty: Number(l.qty || 0),
        deliveryMonth: l.deliveryMonth || '', inFc: v.inForecast ? 'ตรง FC' : 'นอก FC', lead: v.leadDays,
        received: po.receivedDate, ready: v.readyDate, due: l.dueDate,
        pm: t.pmInStock ? 'พร้อม' : (t.pmArrivedAt ? `มาถึง ${t.pmArrivedAt}` : ''),
        rm: t.rmArrivedAt ? `รับ ${t.rmArrivedAt}` : (t.rmOrderedAt ? `สั่ง ${t.rmOrderedAt}` : ''),
        actual: l.actualDeliveredDate, late: v.ourSlip ? 'เราส่งช้า' : (v.lateVsDue ? 'เกินกำหนด(PO/lead)' : ''),
      });
    }
    return {
      title: 'SAHAMIT Material / Lead-time',
      columns: [
        { key: 'fgCode', label: 'รหัสสินค้า' }, { key: 'name', label: 'ชื่อสินค้า' }, { key: 'poNumber', label: 'PO' },
        { key: 'qty', label: 'จำนวน' }, { key: 'deliveryMonth', label: 'เดือนส่ง' }, { key: 'inFc', label: 'ในแผน' },
        { key: 'lead', label: 'lead(วัน)' }, { key: 'received', label: 'วันรับ', date: true }, { key: 'ready', label: 'วันส่งแนะนำ', date: true },
        { key: 'due', label: 'กำหนดส่ง', date: true }, { key: 'pm', label: 'PM' }, { key: 'rm', label: 'RM' },
        { key: 'actual', label: 'ส่งจริง', date: true }, { key: 'late', label: 'สถานะส่ง' },
      ],
      rows,
    };
  }

  // default: reconcile (flat) — reflect cross-month coverage
  const matrix = buildReconMatrix(data.roundsWithLines, data.posWithLines, data.coverages);
  const rows = [];
  for (const row of matrix.rows) {
    for (const m of matrix.months) {
      const c = row.cells[m];
      if (!c || c.status === 'none') continue;
      rows.push({ fgCode: row.fgCode, name: row.productName || '', month: m, fc: c.fcQty, po: c.poQty, diff: c.poQty - c.fcQty, status: c.label });
    }
  }
  return {
    title: 'SAHAMIT Reconciliation (FC vs PO)',
    columns: [
      { key: 'fgCode', label: 'รหัสสินค้า' }, { key: 'name', label: 'ชื่อสินค้า' }, { key: 'month', label: 'เดือน' },
      { key: 'fc', label: 'FC' }, { key: 'po', label: 'PO' }, { key: 'diff', label: 'PO − FC' }, { key: 'status', label: 'สถานะ' },
    ],
    rows,
  };
}

// GET /api/sahamit/export?view=reconcile|po|material|forecast — download .xlsx.
export async function GET(request) {
  const ctx = await getSahamitContext();
  if (!ctx.ok) return sahamitError(ctx);
  const view = (new URL(request.url).searchParams.get('view') || 'reconcile').toLowerCase();

  let data;
  try { data = await loadAll(ctx.supabase, ctx.customerId); }
  catch (e) { return Response.json({ error: e.message }, { status: 500 }); }

  const report = buildReport(view, data);
  const buf = await reportToXlsxBuffer(report);
  return new Response(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="sahamit_${view}.xlsx"`,
    },
  });
}
