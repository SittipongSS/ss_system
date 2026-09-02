import { withUser, fail, forbidden, unauthorized } from '@/lib/http';
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import {
  canViewSalesPlanning, inSalesViewScope, monthKey, salesPlanningViewScope,
} from '@/lib/salesPlanning';
import {
  canExportForecastReport, forecastBreakdownOfDeal, forecastMonthOfDeal,
  monthsInRows, monthsOfYear,
} from '@/lib/sales/forecastBreakdown';
import { buildForecastReportBuffer, forecastReportFilename } from '@/lib/sales/forecastReportWorkbook';
import { businessDate } from '@/lib/businessDate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* ดาวน์โหลดรายงาน FC รายหมวด (.xlsx) — มติผู้ใช้ 2026-09-02
 *
 * สองชีต: "สรุปรายหมวด" (เดือน × หมวด × หน่วย) และ "รายบรรทัด" (ทุกรายการของทุกดีล)
 *
 * ⭐ **แกนเดือน = `endDate` ("วันที่สิ้นสุด" = วันที่ลูกค้าต้องการรับของ)**
 *    (มติผู้ใช้ 2026-09-02) — คนอ่านรายงานนี้คือฝ่ายวางแผนผลิต/จัดซื้อ เขาต้องรู้ว่า
 *    **ของต้องเสร็จเดือนไหน** ไม่ใช่ว่ารายได้ลงบัญชีเดือนไหน
 *
 * ⚠️ **คนละช่องกับ `expectedCloseDate`** ซึ่งเป็นวันปิดการขาย และเป็นตัวกำหนด
 *    `forecastMonth` ที่แดชบอร์ดใช้ · ของจริง 2026-09-02: 212 จาก 384 ดีลมีสองช่องนี้
 *    อยู่คนละเดือน คิดเป็น 30,517,473 บาท (ดีล Won หลายใบใส่ "คาดปิด" เป็นวันเริ่มงาน
 *    ส่วน "สิ้นสุด" เป็นวันส่งของจริง) ⇒ **การกระจายรายเดือนของไฟล์นี้ต่างจากแดชบอร์ด
 *    โดยเจตนา** ยอดรวมทั้งปียังเท่ากัน · เขียนกำกับบนหัวไฟล์แล้ว
 *
 * ⚠️ **86 ดีลยังไม่ได้กรอก `endDate`** (22%) — ถอยไปใช้ `expectedCloseDate` เพื่อไม่ให้
 *    ยอดหายจากไฟล์ · ช่องนี้บังคับกรอกบนฟอร์มแล้ว ตัวเลขนี้จะลดลงเองตามการแก้ดีล
 *
 * ⚠️ **ไม่รวมดีลที่แพ้** — รายงานนี้ไปที่ฝ่ายวางแผนผลิต/จัดซื้อ ดีลที่แพ้แล้วไม่มีของ
 *    ต้องผลิต · ตัวเลขจึงไม่เท่ากับ `fcTotal` บนแดชบอร์ดซึ่งเก็บ FC ของดีลแพ้ไว้
 *    เพื่อวัดความแม่น — เขียนกำกับไว้บนหัวไฟล์แล้ว
 *
 * 🪤 อ่านด้วย `fetchAllResult` ทุกเส้น — `.select()` เปล่าโดนเพดาน 1,000 แถวตัดเงียบ ๆ
 *    รายงานที่ขาดแถวไปโดยไม่มี error คือรายงานที่หลอกคนอ่าน (`check:rowcap` กันไว้)
 */
export const GET = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  /* ⚠️ ด่านคือ `canExportForecastReport` **ไม่ใช่ `canViewSalesPlanning`** —
     ไฟล์นี้มียอด FC ของทุกทีมทุกคนพร้อมชื่อลูกค้าและราคาต่อหน่วยเป็นแถว ๆ
     AE ที่เห็นแค่ดีลของตัวเองบนจอ ต้องไม่ได้ไฟล์ที่เห็นทั้งบริษัท
     (มติผู้ใช้ 2026-09-02: AE Supervisor ขึ้นไป) */
  if (!canExportForecastReport(user.role)) return forbidden();

  const params = new URL(req.url).searchParams;
  const rawYear = params.get('year');
  const year = /^\d{4}$/.test(rawYear || '') ? rawYear : null;

  const [deals, quotations, valueItems, products, productTypes] = await Promise.all([
    fetchAllResult(() => supabase.from('sales_deals')
      .select('id, code, title, stage, "customerName", "ownerId", "ownerName", team, "endDate", "expectedCloseDate", "forecastMonth", metadata, "projectValue", "forecastSource", "forecastQuotationId"')
      .order('id', { ascending: true })),
    fetchAllResult(() => supabase.from('quotations')
      .select('id, "quoteNumber"').order('id', { ascending: true })),
    fetchAllResult(() => supabase.from('sales_deal_value_items')
      .select('*').order('id', { ascending: true })),
    fetchAllResult(() => supabase.from('products')
      .select('id, "fgCode", "productDescription", "categoryCode", volume, "volumeUnit", "saleUnit"')
      .order('id', { ascending: true })),
    fetchAllResult(() => supabase.from('product_types')
      .select('"mainCategoryCode", "mainCategoryName", "typeCode", "nameTh", "nameEn"')
      .order('typeCode', { ascending: true })),
  ]);
  for (const result of [deals, quotations, valueItems, products, productTypes]) {
    if (result.error) return fail(result.error.message, 500);
  }

  /* บรรทัดใบเสนอราคาโหลดเฉพาะใบที่มีดีลชี้อยู่จริง — ตารางนี้โตตามทุกใบที่เคยออก
     (523 แถวเมื่อ 2026-09-02) แต่ที่รายงานใช้คือเศษเสี้ยว ⇒ แคบก่อนอ่านเสมอ */
  const pointedIds = [...new Set(deals.data
    .filter((deal) => deal.forecastSource === 'quotation' && deal.forecastQuotationId)
    .map((deal) => deal.forecastQuotationId))];
  const lines = pointedIds.length
    ? await fetchAllResult(() => supabase.from('quotation_lines')
      .select('id, "quotationId", "productId", "fgCode", description, qty, unit, "unitPrice", "lineTotal", "sortOrder"')
      .in('quotationId', pointedIds).order('id', { ascending: true }))
    : { data: [], error: null };
  if (lines.error) return fail(lines.error.message, 500);

  const productById = new Map(products.data.map((row) => [row.id, row]));
  const quoteNumberById = new Map(quotations.data.map((row) => [row.id, row.quoteNumber]));
  /* ชื่อหมวดบนรายงาน = "กลุ่ม · ชนิด" (เช่น "ODM · เทียนหอม") — รหัส `01-003` อย่างเดียว
     อ่านไม่ออกสำหรับฝ่ายผลิต/จัดซื้อที่ไม่ได้อยู่กับรหัสทั้งวัน · ชื่อไทยก่อน ถ้าไม่มี
     ค่อยใช้อังกฤษ (ทะเบียนมีทั้งสองช่อง และบางแถวกรอกมาไม่ครบ) */
  const categoryNames = new Map(productTypes.data.map((row) => [
    `${row.mainCategoryCode}-${row.typeCode}`,
    [row.mainCategoryName, row.nameTh || row.nameEn].filter(Boolean).join(' · ') || null,
  ]));
  const linesByQuote = new Map();
  for (const line of lines.data) {
    if (!linesByQuote.has(line.quotationId)) linesByQuote.set(line.quotationId, []);
    linesByQuote.get(line.quotationId).push(line);
  }
  const itemsByDeal = new Map();
  for (const item of valueItems.data) {
    if (!itemsByDeal.has(item.dealId)) itemsByDeal.set(item.dealId, []);
    itemsByDeal.get(item.dealId).push(item);
  }

  const rows = [];
  for (const deal of deals.data) {
    if (deal.stage === 'lost') continue;
    if (!inSalesViewScope(user, deal)) continue;
    // กติกาเดือนอยู่ที่ lib (มีเทสต์) — ที่นี่แค่เรียกใช้
    const { month, basis: monthBasis } = forecastMonthOfDeal(deal, monthKey);
    if (year && String(month || '').slice(0, 4) !== year) continue;
    if (!Number(deal.projectValue)) continue;

    const breakdown = forecastBreakdownOfDeal(deal, {
      quotationLines: linesByQuote.get(deal.forecastQuotationId) || [],
      valueItems: itemsByDeal.get(deal.id) || [],
      productById,
      quoteNumber: quoteNumberById.get(deal.forecastQuotationId) || null,
    });
    for (const line of breakdown) {
      rows.push({
        ...line,
        month,
        monthBasis,
        dealCode: deal.code,
        dealTitle: deal.title,
        customerName: deal.customerName,
        ownerName: deal.ownerName,
        team: deal.team,
        stage: deal.stage,
      });
    }
  }
  rows.sort((a, b) => String(a.month || '').localeCompare(String(b.month || ''))
    || String(a.dealCode || '').localeCompare(String(b.dealCode || '')));

  // วันไทยเสมอ (ด่าน check:thaitime) — ไฟล์ที่ประทับวันผิดโซนคือไฟล์ที่ชื่อชนกันข้ามวัน
  const today = businessDate();
  /* ระบุปี = กริดมี 12 คอลัมน์เสมอ แม้บางเดือนยังไม่มียอด — ไฟล์ของแต่ละรอบจะได้มี
     คอลัมน์เท่ากัน เอาไปวางทับกันเทียบเดือนต่อเดือนได้ · ไม่ระบุปีค่อยใช้เดือนที่มีจริง */
  /* ขอบเขตของไฟล์ = ขอบเขตที่ระบบให้คนนี้เห็น ไม่ได้คิดใหม่ที่นี่
     (superuser = ทุกทีม · senior_ae = ทีมตัวเอง ตาม salesPlanningViewScope) */
  const scopeLabel = salesPlanningViewScope(user.role) === 'all'
    ? 'ทั้งบริษัท'
    // ไม่มีทีม = ขอบเขตพิสูจน์ไม่ได้ ⇒ เขียนตรง ๆ ดีกว่าโชว์ "ทีม —" ที่อ่านเหมือนทีมชื่อขีด
    : (user.team ? `ทีม ${user.team}` : 'เฉพาะที่มองเห็น (ไม่ระบุทีม)');
  const buffer = await buildForecastReportBuffer(rows, {
    year,
    scopeLabel,
    months: year ? monthsOfYear(year) : monthsInRows(rows),
    categoryNames,
    generatedAt: today,
    by: user.name || user.id || null,
  });
  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${forecastReportFilename(year, today, scopeLabel)}"`,
      'Cache-Control': 'no-store',
    },
  });
});
