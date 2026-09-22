import { withUser, badRequest, forbidden, unauthorized } from '@/lib/http';
import { canEditSalesTarget } from '@/lib/salesPlanning';
import { businessDayKey, businessTimeKey } from '@/lib/datePeriods';
import { loadTeamNames } from '@/lib/master/teamsRepo';
import { parseReportPeriod, reportPeriodFilename } from '@/lib/sales/reportPeriod';
import { loadSalesReportData } from '@/lib/sales/salesReportData';
import { summarizeSalesReport } from '@/lib/sales/reportSummary';
import { buildSalesReportBuffer } from '@/lib/sales/salesReportWorkbook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** ดาวน์โหลดรายงานยอดขายของงวดที่เลือก (.xlsx) — มติผู้ใช้ 2026-09-22 "ทั้งรายงาน"
 *
 *  ⭐ ด่านเดียวกับหน้าจอ (`salesplan:target` = หัวหน้าฝ่ายขาย + admin) — ไฟล์กางยอดรายคนทั้งฝ่าย
 *  ⭐ งวด/ข้อมูล/ตัวเลขผ่านสามตัวเดียวกับ `../route.js` (parseReportPeriod · loadSalesReportData ·
 *     summarizeSalesReport) ⇒ ไฟล์กับจอบอกเลขเดียวกันทุกช่อง · ห้ามคิดเลขใหม่ในนี้
 */
export const GET = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!canEditSalesTarget(user)) return forbidden();

  const now = new Date();
  const iso = now.toISOString();
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const period = parseReportPeriod(params, { today: businessDayKey(iso) });
  if (period.error) return badRequest(period.error);

  const data = await loadSalesReportData(supabase, period, { now });
  if (data.error) {
    console.error('[sales-report-export] โหลดข้อมูลไม่สำเร็จ:', data.error);
    return Response.json({ error: 'ดาวน์โหลดรายงานยอดขายไม่สำเร็จ' }, { status: data.status || 500 });
  }
  const summary = summarizeSalesReport(data, { now });

  /* ป้ายทีมในไฟล์ — อ่านไม่ได้ = รหัสดิบ แต่ต้องส่งเสียง (แพตเทิร์นเดียวกับรายงานลีด) */
  const teamNames = await loadTeamNames(supabase).catch((err) => {
    console.warn('[sales-report-export] อ่านชื่อทีมไม่สำเร็จ — คอลัมน์ทีมจะขึ้นเป็นรหัส', err?.message);
    return null;
  });

  const buffer = await buildSalesReportBuffer(data, summary, {
    generatedAt: `${businessDayKey(iso)} ${businessTimeKey(iso)}`,
    by: user.name || null,
    teamNames,
    // ลิงก์ในชีตใบสั่งขายชี้กลับหน้าใบ — ใช้ origin ของคำขอ (prod = โดเมนจริง · dev = localhost)
    origin: new URL(req.url).origin,
  });

  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      // ชื่อไฟล์ไทยผ่าน filename* (RFC 5987) — filename เปล่าไว้ให้ตัวที่อ่าน * ไม่เป็น
      'Content-Disposition': 'attachment; filename="sales-report.xlsx"; '
        + `filename*=UTF-8''${encodeURIComponent(reportPeriodFilename(period))}`,
      'Cache-Control': 'no-store',
    },
  });
});
