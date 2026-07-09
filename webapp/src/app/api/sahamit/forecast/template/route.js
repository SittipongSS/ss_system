import ExcelJS from 'exceljs';
import { getSahamitContext, sahamitError, loadSahamitProducts } from '@/lib/sahamit/server';

export const dynamic = 'force-dynamic';

// GET /api/sahamit/forecast/template?months=2026-01,2026-02,... — download an
// .xlsx grid pre-filled with AR-109's products (col1 fgCode, col2 name) and one
// empty column per requested month (header 'YYYY-MM'). The user fills quantities
// and re-uploads via /import. Round-trips with the import parser.
export async function GET(request) {
  const ctx = await getSahamitContext();
  if (!ctx.ok) return sahamitError(ctx);
  const { supabase, customerId } = ctx;

  const monthsParam = new URL(request.url).searchParams.get('months') || '';
  const months = monthsParam.split(',').map((m) => m.trim()).filter((m) => /^\d{4}-\d{2}$/.test(m));
  if (!months.length) return Response.json({ error: 'ระบุเดือน (months=YYYY-MM,YYYY-MM)' }, { status: 400 });

  const products = await loadSahamitProducts(supabase, customerId);
  products.sort((a, b) => String(a.fgCode || '').localeCompare(String(b.fgCode || '')));

  const wb = new ExcelJS.Workbook();
  wb.creator = 'SAHAMIT';
  const ws = wb.addWorksheet('Forecast');

  const header = ['รหัสสินค้า', 'ชื่อสินค้า', 'แบรนด์', 'ปริมาตร', ...months];
  const headerRow = ws.addRow(header);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC17A52' } };
    cell.alignment = { horizontal: 'center' };
  });

  for (const p of products) {
    ws.addRow([p.fgCode, p.name, p.brandName || '', p.volume ? `${p.volume} ${p.volumeUnit || 'ml'}` : '', ...months.map(() => '')]);
  }

  ws.getColumn(1).width = 18;
  ws.getColumn(2).width = 36;
  ws.getColumn(3).width = 20;
  ws.getColumn(4).width = 15;
  for (let i = 0; i < months.length; i++) ws.getColumn(5 + i).width = 11;
  ws.views = [{ state: 'frozen', xSplit: 4, ySplit: 1 }];

  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  return new Response(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="sahamit_forecast_template.xlsx"',
    },
  });
}
