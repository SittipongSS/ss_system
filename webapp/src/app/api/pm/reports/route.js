import { can, viewScope } from '@/lib/permissions';
import { buildPmReport, PM_REPORTS } from '@/lib/pm/reports';
import { reportToXlsxBuffer } from '@/lib/reports/exportExcel';
import { withUser, unauthorized, forbidden, fail } from '@/lib/http';

// exceljs needs the Node runtime (not edge). Always dynamic — depends on user.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/pm/reports?type=project|overdue|team&format=json|xlsx&from=&to=&team=&status=
// PM operational + management reports. Gated on pm:view (the sales-only PM cap)
// — legal has viewScope 'all' but no pm:view, so it must not read PM here.
export const GET = withUser(async ({ user, req }) => {
  if (!user) return unauthorized();
  if (!can(user.role, 'pm:view')) return forbidden();

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type');
  const format = searchParams.get('format') || 'json';
  if (!type || !PM_REPORTS[type]) {
    return fail(`type ไม่ถูกต้อง (${Object.keys(PM_REPORTS).join(', ')})`, 400);
  }

  // Team-scoped roles are pinned to their own team; 'all' roles may filter by ?team.
  const team = viewScope(user.role) === 'team' ? (user.team ?? null) : searchParams.get('team') || null;
  const filter = {
    from: searchParams.get('from') || null,
    to: searchParams.get('to') || null,
    team,
    status: searchParams.get('status') || null,
  };

  let report;
  try {
    report = await buildPmReport(type, filter);
  } catch (e) {
    return fail(e.message, 500);
  }

  if (format === 'xlsx') {
    const buf = await reportToXlsxBuffer(report);
    const fname = `pm-report-${type}-${new Date().toISOString().slice(0, 10)}.xlsx`;
    return new Response(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fname}"`,
      },
    });
  }

  return Response.json(report);
});
