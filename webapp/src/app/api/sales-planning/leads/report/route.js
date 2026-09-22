import { withUser, forbidden, unauthorized } from '@/lib/http';
import { loadTeamNames } from '@/lib/master/teamsRepo';
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { applyLeadScope } from '@/lib/sales/leads';
import { canExportLeadReport, leadReportFilename } from '@/lib/sales/leadReport';
import { buildLeadReportBuffer } from '@/lib/sales/leadReportWorkbook';
import { businessDayKey, businessTimeKey, dateRangeOfBusinessDays } from '@/lib/datePeriods';
import { parseReportPeriodParams, reportPeriodLabel } from '@/lib/sales/reportPeriod';
import { businessDate } from '@/lib/businessDate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** ดาวน์โหลดรายงานลีดตามช่วงวัน (.xlsx)
 *
 *  ⚠️ ด่านคือ `canExportLeadReport` **ไม่ใช่ `canSeeLeadKpi`** — แท็บ KPI เปิดให้
 *  ผู้สังเกตการณ์/ผู้บริหารดูตัวเลขรวม แต่ไฟล์นี้มีชื่อ/เบอร์/อีเมลลูกค้าเป็นแถว ๆ
 *  (มติผู้ใช้ 2026-08-27: เฉพาะ Marketing กับ Admin)
 *
 *  ⚠️ ช่วงวันต้องผ่าน `dateRangeOfBusinessDays` เหมือนแท็บ KPI เป๊ะ — ขอบเป็น **ต้นวัน
 *  เวลาไทย** ไม่ใช่สตริงวันเปล่าที่ Postgres อ่านเป็น 00:00 UTC ⇒ ไม่งั้นไฟล์กับตัวเลข
 *  บนจอจะนับลีดที่เข้ามาตอนดึกคนละช่วง แล้วไม่มีใครรู้ว่าอันไหนถูก
 *
 *  🪤 อ่านด้วย `fetchAllResult` เสมอ — `.select()` เปล่าโดนเพดาน 1,000 แถวตัดเงียบ ๆ
 *  รายงานที่ขาดแถวไปโดยไม่มี error คือรายงานที่หลอกคนอ่าน (และ `check:rowcap` กันไว้)
 */
export const GET = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!canExportLeadReport(user.role)) return forbidden();

  const params = new URL(req.url).searchParams;
  /* ⭐ งวดชุดเดียวกับจอ (มติผู้ใช้ 2026-09-22 "ใช้เหมือนกัน") — รายเดือน / ทุกเดือน / ช่วงวัน
     🐞 เดิมรับแค่ from/to ⇒ โหมด "รายเดือน" บนจอกดดาวน์โหลดแล้วได้ **ลีดทั้งหมดตั้งแต่เปิดระบบ**
        ไม่ใช่ลีดของเดือนที่ค้างอยู่บนปุ่ม · ตอนนี้ทุกโหมดแปลงเป็นช่วงวันไทยเดียวกับแท็บ KPI
     ไม่ระบุงวดเลย = ทั้งหมด (ตั้งใจ — ลิงก์ URL เปล่าคืนทั้งหมดตรงไปตรงมากว่าการเดางวดให้) */
  const nowIso = new Date().toISOString();
  const period = parseReportPeriodParams(params, { today: businessDayKey(nowIso) });
  if (period?.error) return Response.json({ error: period.error }, { status: 400 });
  const from = period?.from || null;
  const to = period?.to || null;
  const range = period ? dateRangeOfBusinessDays(period.from, period.to) : null;

  const { data, error } = await fetchAllResult(() => {
    let query = supabase.from('sales_leads').select('*')
      .order('createdAt', { ascending: false })
      .order('id', { ascending: true });
    // แกนเดียวกับแท็บ KPI: วันที่ **รับลีดเข้าระบบ**
    if (range) query = query.gte('createdAt', range.from).lt('createdAt', range.until);
    /* ขอบเขตตามสิทธิ์ — วันนี้ทั้ง admin และ marketing เห็นทุกใบอยู่แล้ว จึงไม่ตัดอะไรออก
       แต่ต้องเรียกไว้ ไม่ใช่ละไว้เพราะ "วันนี้ไม่มีผล": วันไหนเปิดสิทธิ์ให้ role อื่น
       ไฟล์นี้จะกลายเป็นทางลัดออกนอกขอบเขตทันทีโดยไม่มีใครนึกถึง */
    return applyLeadScope(query, user);
  });
  if (error) {
    console.error('[lead-report] อ่านลีดไม่สำเร็จ:', error.message);
    return Response.json({ error: 'ดาวน์โหลดรายงานลีดไม่สำเร็จ' }, { status: 500 });
  }

  const leads = data || [];
  /* ป้ายทีมในไฟล์ Excel — โหลดครั้งเดียวต่อคำขอ · อ่านไม่ได้ = รหัสดิบ แต่ต้องส่งเสียง */
  const teamNames = await loadTeamNames(supabase).catch((err) => {
    console.warn('[lead-report] อ่านชื่อทีมไม่สำเร็จ — คอลัมน์ทีมจะขึ้นเป็นรหัส', err?.message);
    return null;
  });
  const now = nowIso;
  const buffer = await buildLeadReportBuffer(leads, {
    from,
    to,
    label: period ? reportPeriodLabel(period) : null,
    generatedAt: `${businessDate(now)} ${businessTimeKey(now)}`,
    by: user.name || null,
    teamNames,
  });

  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      // ชื่อไฟล์มีอักษรไทยได้ผ่าน filename* (RFC 5987) — filename เปล่าไว้ให้ตัวที่อ่าน * ไม่เป็น
      'Content-Disposition': `attachment; filename="lead-report.xlsx"; `
        + `filename*=UTF-8''${encodeURIComponent(leadReportFilename({ from, to, period }))}`,
      'Cache-Control': 'no-store',
    },
  });
});
