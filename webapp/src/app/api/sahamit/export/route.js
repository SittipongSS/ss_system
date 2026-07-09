import { getSahamitContext, sahamitError, loadSahamitProducts } from '@/lib/sahamit/server';
import { reportToXlsxBuffer } from '@/lib/tax/exportExcel';
import { buildReconMatrix } from '@/lib/sahamit/reconcileClient';
import { materialView } from '@/lib/sahamit/material';
import { PO_STATUS_LABEL } from '@/lib/sahamit/po';
import { ppcOf, casesFromPieces } from '@/lib/sahamit/units';

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
  let products = [];
  try { products = await loadSahamitProducts(supabase, customerId); } catch { products = []; }

  return { rounds: rounds || [], roundsWithLines, pos: pos || [], poLines: poLines || [], posWithLines, holidays, trk: trk || [], coverages: coverages || [], products };
}

function buildReport(view, data, filters = {}) {
  // ชิ้นต่อลังต่อ SKU → คอลัมน์ "จำนวน (ลัง)" (ชิ้นเป็นหลัก, ลังเป็นค่าคำนวณ). '' ถ้ายังไม่ตั้ง.
  const ppcByFg = new Map((data.products || []).map((p) => [String(p.fgCode).trim().toLowerCase(), ppcOf(p)]));
  const casesVal = (fg, pieces) => {
    const c = casesFromPieces(pieces, ppcByFg.get(String(fg).trim().toLowerCase()));
    return c == null ? '' : Number(c.toFixed(2));
  };

  if (view === 'forecast') {
    const rows = [];
    for (const r of data.roundsWithLines) {
      for (const l of r.lines) rows.push({ round: `#${r.roundNo}`, received: r.receivedDate, fgCode: l.fgCode, name: l.productName || '', month: l.month, qty: Number(l.qty || 0), qtyCases: casesVal(l.fgCode, Number(l.qty || 0)) });
    }
    const listReport = {
      title: 'SAHAMIT Forecast (รายรอบ)',
      columns: [
        { key: 'round', label: 'รอบที่' }, { key: 'received', label: 'วันรับ FC', date: true },
        { key: 'fgCode', label: 'รหัสสินค้า' }, { key: 'name', label: 'ชื่อสินค้า' },
        { key: 'month', label: 'เดือนที่ต้องการ' }, { key: 'qty', label: 'จำนวน (ชิ้น)', num: true }, { key: 'qtyCases', label: 'จำนวน (ลัง)', num: true },
      ],
      rows,
    };

    const targetRoundNo = filters.roundNo ? Number(filters.roundNo) : null;
    let round = targetRoundNo ? data.roundsWithLines.find(r => r.roundNo === targetRoundNo) : data.roundsWithLines[data.roundsWithLines.length - 1];
    
    if (round) {
      const monthsSet = new Set();
      const fgMap = new Map();
      for (const l of round.lines) {
        if (Number(l.qty || 0) <= 0) continue;
        monthsSet.add(l.month);
        if (!fgMap.has(l.fgCode)) fgMap.set(l.fgCode, { fgCode: l.fgCode, name: l.productName || '', qty: {}, total: 0 });
        const row = fgMap.get(l.fgCode);
        row.qty[l.month] = (row.qty[l.month] || 0) + Number(l.qty || 0);
        row.total += Number(l.qty || 0);
      }
      const months = [...monthsSet].sort();
      
      const gridColumns = [
        { key: 'fgCode', label: 'รหัสสินค้า' },
        { key: 'name', label: 'ชื่อสินค้า' }
      ];
      for (const m of months) gridColumns.push({ key: `m_${m}`, label: m, num: true });
      gridColumns.push({ key: 'total', label: 'รวม (ชิ้น)', num: true });
      gridColumns.push({ key: 'totalCases', label: 'รวม (ลัง)', num: true });
      
      const gridRows = [...fgMap.values()].sort((a,b) => String(a.fgCode).localeCompare(String(b.fgCode))).map(r => {
        const out = { fgCode: r.fgCode, name: r.name, total: r.total, totalCases: casesVal(r.fgCode, r.total) };
        for (const m of months) out[`m_${m}`] = r.qty[m] || 0;
        return out;
      });

      const gridReport = {
        title: `Matrix (Round #${round.roundNo})`,
        columns: gridColumns,
        rows: gridRows
      };

      return [gridReport, listReport];
    }
    return [listReport];
  }

  if (view === 'po') {
    const poById = new Map(data.pos.map((p) => [p.id, p]));
    const prodByFg = new Map((data.products || []).map((p) => [String(p.fgCode).trim().toLowerCase(), p]));
    const rows = data.poLines.map((l) => {
      const po = poById.get(l.poId) || {};
      const prod = prodByFg.get(String(l.fgCode).trim().toLowerCase());
      return {
        poNumber: po.poNumber || '', fgCode: l.fgCode, name: l.productName || '', 
        brand: prod?.brandName || '', volume: prod?.volume ? `${prod.volume} ${prod.volumeUnit || 'ml'}` : '',
        qty: Number(l.qty || 0), qtyCases: casesVal(l.fgCode, Number(l.qty || 0)),
        docDate: po.docDate, receivedDate: po.receivedDate, dueDate: l.dueDate, expectedDate: l.expectedDate,
        deliveryMonth: l.deliveryMonth || '', actual: l.actualDeliveredDate, status: PO_STATUS_LABEL[l.status] || l.status,
      };
    });
    return {
      title: 'SAHAMIT Purchase Orders',
      columns: [
        { key: 'poNumber', label: 'เลขที่ PO' }, { key: 'fgCode', label: 'รหัสสินค้า' }, { key: 'name', label: 'ชื่อสินค้า' },
        { key: 'brand', label: 'แบรนด์' }, { key: 'volume', label: 'ปริมาตร' },
        { key: 'qty', label: 'จำนวน (ชิ้น)' }, { key: 'qtyCases', label: 'จำนวน (ลัง)' }, { key: 'docDate', label: 'วันเอกสาร', date: true }, { key: 'receivedDate', label: 'วันรับ', date: true },
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
        fgCode: l.fgCode, name: l.productName || '', poNumber: po.poNumber || '', qty: Number(l.qty || 0), qtyCases: casesVal(l.fgCode, Number(l.qty || 0)),
        deliveryMonth: l.deliveryMonth || '', inFc: v.inForecast ? 'ตรง FC' : 'นอก FC', lead: v.leadDays,
        received: po.receivedDate, ready: v.readyDate, due: l.dueDate,
        pm: t.pmArrivedAt ? `มาแล้ว ${t.pmArrivedAt}` : (t.pmDueDate ? `กำหนด ${t.pmDueDate}` : ''),
        rm: t.rmArrivedAt ? `มาแล้ว ${t.rmArrivedAt}` : (t.rmDueDate ? `กำหนด ${t.rmDueDate}` : ''),
        actual: l.actualDeliveredDate, late: v.ourSlip ? 'เราส่งช้า' : (v.lateVsDue ? 'เกินกำหนด(PO/lead)' : ''),
      });
    }
    return {
      title: 'SAHAMIT Material / Lead-time',
      columns: [
        { key: 'fgCode', label: 'รหัสสินค้า' }, { key: 'name', label: 'ชื่อสินค้า' }, { key: 'poNumber', label: 'PO' },
        { key: 'qty', label: 'จำนวน (ชิ้น)' }, { key: 'qtyCases', label: 'จำนวน (ลัง)' }, { key: 'deliveryMonth', label: 'เดือนส่ง' }, { key: 'inFc', label: 'ในแผน' },
        { key: 'lead', label: 'lead(วัน)' }, { key: 'received', label: 'วันรับ', date: true }, { key: 'ready', label: 'วันส่งแนะนำ', date: true },
        { key: 'due', label: 'กำหนดส่ง', date: true }, { key: 'pm', label: 'PM' }, { key: 'rm', label: 'RM' },
        { key: 'actual', label: 'ส่งจริง', date: true }, { key: 'late', label: 'สถานะส่ง' },
      ],
      rows,
    };
  }

  // default: reconcile (flat) — reflect cross-month coverage + ตัวกรอง (แบรนด์/ปริมาตร/หมวด)
  const matrix = buildReconMatrix(data.roundsWithLines, data.posWithLines, data.coverages);
  const prod = new Map((data.products || []).map((p) => [String(p.fgCode).trim().toLowerCase(), p]));
  const { brands = [], volumes = [], categories = [] } = filters;
  const passFilter = (fg) => {
    if (!brands.length && !volumes.length && !categories.length) return true;
    const p = prod.get(String(fg).trim().toLowerCase());
    if (brands.length && !brands.includes(p?.brandName)) return false;
    if (volumes.length && !volumes.includes(p?.volume ? `${p.volume}${p?.volumeUnit || ''}` : '')) return false;
    if (categories.length && !categories.includes(p?.category)) return false;
    return true;
  };
  const rows = [];
  for (const row of matrix.rows) {
    if (!passFilter(row.fgCode)) continue;
    for (const m of matrix.months) {
      const c = row.cells[m];
      if (!c || c.status === 'none') continue;
      rows.push({ fgCode: row.fgCode, name: row.productName || '', month: m, fc: c.fcQty, po: c.poQty, diff: c.poQty - c.fcQty, fcCases: casesVal(row.fgCode, c.fcQty), poCases: casesVal(row.fgCode, c.poQty), status: c.label });
    }
  }
  return {
    title: 'SAHAMIT Reconciliation (FC vs PO)',
    columns: [
      { key: 'fgCode', label: 'รหัสสินค้า' }, { key: 'name', label: 'ชื่อสินค้า' }, { key: 'month', label: 'เดือน' },
      { key: 'fc', label: 'FC (ชิ้น)' }, { key: 'po', label: 'PO (ชิ้น)' }, { key: 'fcCases', label: 'FC (ลัง)' }, { key: 'poCases', label: 'PO (ลัง)' }, { key: 'diff', label: 'PO − FC' }, { key: 'status', label: 'สถานะ' },
    ],
    rows,
  };
}

// GET /api/sahamit/export?view=reconcile|po|material|forecast — download .xlsx.
export async function GET(request) {
  const ctx = await getSahamitContext();
  if (!ctx.ok) return sahamitError(ctx);
  const sp = new URL(request.url).searchParams;
  const view = (sp.get('view') || 'reconcile').toLowerCase();
  const csv = (k) => (sp.get(k) ? sp.get(k).split(',').map((s) => s.trim()).filter(Boolean) : []);
  const filters = { brands: csv('brands'), volumes: csv('volumes'), categories: csv('categories') };

  let data;
  try { data = await loadAll(ctx.supabase, ctx.customerId); }
  catch (e) { return Response.json({ error: e.message }, { status: 500 }); }

  const report = buildReport(view, data, filters);
  const buf = await reportToXlsxBuffer(report);
  
  const now = new Date();
  const yymmdd = now.getFullYear().toString().slice(2) + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
  const hhmmss = String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0') + String(now.getSeconds()).padStart(2, '0');
  const ts = `${yymmdd}-${hhmmss}`;

  return new Response(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${ts}_sahamit_${view}.xlsx"`,
    },
  });
}
