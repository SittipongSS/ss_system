import { can, viewScope } from '@/lib/permissions';
import { buildMasterReport, MASTER_REPORTS } from '@/lib/master/reports';
import { reportToXlsxBuffer } from '@/lib/reports/exportExcel';
import { withUser, unauthorized, forbidden, fail } from '@/lib/http';

// exceljs needs the Node runtime (not edge). Always dynamic — depends on user.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/master/reports?type=customer|product|usage&format=json|xlsx&from=&to=&team=&customerId=&status=
// Data-quality reports for the central registry. Gated on master read access
// (products OR customers view) — broad, since completeness is everyone's concern.
export const GET = withUser(async ({ user, req }) => {
  if (!user) return unauthorized();
  if (!can(user.role, 'products:view') && !can(user.role, 'customers:view')) return forbidden();

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type');
  const format = searchParams.get('format') || 'json';
  if (!type || !MASTER_REPORTS[type]) {
    return fail(`type ไม่ถูกต้อง (${Object.keys(MASTER_REPORTS).join(', ')})`, 400);
  }

  // Products carry a team; team-scoped roles only see their own team's products.
  // (Customers are a central registry — never team-filtered.)
  const team = viewScope(user.role) === 'team' ? (user.team ?? null) : searchParams.get('team') || null;
  const filter = {
    from: searchParams.get('from') || null,
    to: searchParams.get('to') || null,
    team,
    customerId: searchParams.get('customerId') || null,
    status: searchParams.get('status') || null,
    // Usage counts for tax records (registrations/orders) only for tax-eligible
    // roles — staff/viewer with catalog read must not learn tax activity.
    tax: can(user.role, 'history:view'),
  };

  let report;
  try {
    report = await buildMasterReport(type, filter);
  } catch (e) {
    return fail(e.message, 500);
  }

  if (format === 'xlsx') {
    const buf = await reportToXlsxBuffer(report);
    const fname = `master-report-${type}-${new Date().toISOString().slice(0, 10)}.xlsx`;
    return new Response(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fname}"`,
      },
    });
  }

  return Response.json(report);
});
