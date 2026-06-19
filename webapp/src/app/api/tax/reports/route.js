import { getCurrentUser } from '@/lib/authUser';
import { viewScope } from '@/lib/permissions';
import { buildReport, REPORTS } from '@/lib/tax/reports';
import { reportToXlsxBuffer } from '@/lib/tax/exportExcel';

// exceljs needs the Node runtime (not edge). Always dynamic — depends on user.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/tax/reports?type=period&format=json|xlsx&from=&to=&team=&customerId=
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');
  const format = searchParams.get('format') || 'json';
  if (!type || !REPORTS[type]) {
    return Response.json({ error: `type ไม่ถูกต้อง (${Object.keys(REPORTS).join(', ')})` }, { status: 400 });
  }

  const user = await getCurrentUser();
  // Team-scoped roles are pinned to their own team; 'all' roles may filter by ?team.
  const team = viewScope(user?.role) === 'team' ? (user?.team ?? null) : searchParams.get('team') || null;
  const filter = {
    from: searchParams.get('from') || null,
    to: searchParams.get('to') || null,
    team,
    customerId: searchParams.get('customerId') || null,
  };

  let report;
  try {
    report = await buildReport(type, filter);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }

  if (format === 'xlsx') {
    const buf = await reportToXlsxBuffer(report);
    const fname = `report-${type}-${new Date().toISOString().slice(0, 10)}.xlsx`;
    return new Response(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fname}"`,
      },
    });
  }

  return Response.json(report);
}
