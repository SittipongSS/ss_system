import { withUser, forbidden, unauthorized } from '@/lib/http';
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { applyLeadScope } from '@/lib/sales/leads';
import { canExportLeadReport, leadReportFilename } from '@/lib/sales/leadReport';
import { buildLeadReportBuffer } from '@/lib/sales/leadReportWorkbook';
import { businessTimeKey, dateRangeOfBusinessDays, isDayValue } from '@/lib/datePeriods';
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
  const from = isDayValue(params.get('from')) ? params.get('from') : null;
  const to = isDayValue(params.get('to')) ? params.get('to') : null;
  /* ไม่ระบุช่วง = ทั้งหมด (ตั้งใจ) — ปุ่มบนหน้าจอส่งช่วงมาเสมอ แต่ถ้าใครยิง URL เปล่า
     การคืนทั้งหมดตรงไปตรงมากว่าการเดาช่วงให้ แล้วเขาได้ไฟล์ที่ไม่ตรงกับที่คิด */
  const range = from && to ? dateRangeOfBusinessDays(from, to) : null;

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
  const now = new Date().toISOString();
  const buffer = await buildLeadReportBuffer(leads, {
    from,
    to,
    generatedAt: `${businessDate(now)} ${businessTimeKey(now)}`,
    by: user.name || null,
  });

  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      // ชื่อไฟล์มีอักษรไทยได้ผ่าน filename* (RFC 5987) — filename เปล่าไว้ให้ตัวที่อ่าน * ไม่เป็น
      'Content-Disposition': `attachment; filename="lead-report.xlsx"; `
        + `filename*=UTF-8''${encodeURIComponent(leadReportFilename({ from, to }))}`,
      'Cache-Control': 'no-store',
    },
  });
});
