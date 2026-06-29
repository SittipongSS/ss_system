import ExcelJS from 'exceljs';
import {
  getSahamitContext, sahamitError,
  loadSahamitProducts, indexByFgCode, resolveFgCode,
} from '@/lib/sahamit/server';

export const dynamic = 'force-dynamic';

const MAX_MB = 5;
const MAX_BYTES = MAX_MB * 1024 * 1024;

// Coerce a header cell into a 'YYYY-MM' month, or null if it isn't one.
function monthFromCell(cell) {
  if (!cell) return null;
  const t = (cell.text || '').toString().trim();
  if (/^\d{4}-\d{2}$/.test(t)) return t;
  const v = cell.value;
  if (v instanceof Date) {
    return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, '0')}`;
  }
  return null;
}

// POST /api/sahamit/forecast/import — parse an uploaded .xlsx grid into a
// preview (no DB write). Column layout matches the template: col1 = รหัสสินค้า
// (fgCode), col2 = ชื่อสินค้า, col3+ = month columns headed 'YYYY-MM'. Returns
// resolved rows + the set of unknown fgCodes so the user reviews before saving.
export async function POST(request) {
  const ctx = await getSahamitContext();
  if (!ctx.ok) return sahamitError(ctx);
  const { supabase, customerId } = ctx;

  let form;
  try { form = await request.formData(); } catch { return Response.json({ error: 'invalid form data' }, { status: 400 }); }
  const file = form.get('file');
  if (!file || typeof file.arrayBuffer !== 'function') {
    return Response.json({ error: 'ไม่พบไฟล์' }, { status: 400 });
  }
  if (typeof file.size === 'number' && file.size > MAX_BYTES) {
    return Response.json({ error: `ไฟล์ใหญ่เกินกำหนด (สูงสุด ${MAX_MB} MB)` }, { status: 413 });
  }
  const ext = (file.name || '').split('.').pop()?.toLowerCase() || '';
  if (ext !== 'xlsx') return Response.json({ error: 'รับเฉพาะไฟล์ .xlsx' }, { status: 415 });

  let ws;
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await file.arrayBuffer()));
    ws = wb.worksheets[0];
  } catch {
    return Response.json({ error: 'อ่านไฟล์ Excel ไม่สำเร็จ' }, { status: 422 });
  }
  if (!ws) return Response.json({ error: 'ไฟล์ไม่มีชีตข้อมูล' }, { status: 422 });

  // Map month columns from the header row.
  const monthCols = []; // [{ col, month }]
  ws.getRow(1).eachCell((cell, col) => {
    const m = monthFromCell(cell);
    if (m) monthCols.push({ col, month: m });
  });
  if (!monthCols.length) {
    return Response.json({ error: 'ไม่พบคอลัมน์เดือน (หัวตารางต้องเป็น YYYY-MM)' }, { status: 422 });
  }

  const products = await loadSahamitProducts(supabase, customerId);
  const index = indexByFgCode(products);
  const unknown = new Set();
  const rows = [];

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const fgCode = (row.getCell(1).text || '').toString().trim();
    if (!fgCode) continue;
    const qtyByMonth = {};
    let any = false;
    for (const { col, month } of monthCols) {
      const raw = (row.getCell(col).text || '').toString().trim().replace(/,/g, '');
      if (raw === '') continue;
      const qty = Number(raw);
      if (Number.isFinite(qty) && qty > 0) { qtyByMonth[month] = qty; any = true; }
    }
    if (!any) continue;
    const res = resolveFgCode(index, fgCode);
    if (!res.known) unknown.add(fgCode);
    rows.push({ fgCode, productName: res.productName, known: res.known, qtyByMonth });
  }

  if (!rows.length) return Response.json({ error: 'ไม่พบรายการ FC ในไฟล์' }, { status: 422 });

  const months = monthCols.map((m) => m.month).sort();
  return Response.json({ months, rows, unknownFgCodes: [...unknown] });
}
