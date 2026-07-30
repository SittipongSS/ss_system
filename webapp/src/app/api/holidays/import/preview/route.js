import { getCurrentUser } from '@/lib/authUser';
import { can } from '@/lib/permissions';
import { listHolidays } from '@/lib/master/holidays';
import { fetchHolidayIcs } from '@/lib/master/holidayCalendarFeed';
import { diffHolidayYear, filterByYear, parseHolidayIcs } from '@/lib/master/holidayImport';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST /api/holidays/import/preview — ดูว่าปฏิทิน Google มีวันหยุดปีนั้นอะไรบ้าง
// เทียบกับที่มีในระบบ **ยังไม่เขียนอะไรลง DB**
//
// ทำไมเป็น POST ทั้งที่แค่อ่าน: /api/holidays อยู่ใน OPEN_READ_APIS ของ proxy = GET เปิด
// ให้ผู้ล็อกอินทุกคน ถ้าทำเป็น GET ใครก็ยิงให้ระบบวิ่งออกไปหา Google ได้ — POST ตกไปอยู่
// ใต้ apiWriteAllowed (master:manage) ตามที่ควรเป็น
export async function POST(request) {
  const user = await getCurrentUser();
  if (!can(user?.role, 'master:manage')) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const year = Number(body?.year);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return Response.json({ error: 'ระบุปีที่ต้องการนำเข้า' }, { status: 400 });
  }

  let text;
  try {
    text = await fetchHolidayIcs();
  } catch (error) {
    return Response.json({ error: error.message }, { status: error.status || 502 });
  }

  const googleRows = parseHolidayIcs(text);
  // ปีที่ Google ยังไม่ประกาศ ต้องบอกให้ชัด ไม่ใช่โชว์ตารางว่างให้เดาเอง
  if (!filterByYear(googleRows, year).length) {
    return Response.json(
      { error: `ปฏิทิน Google ยังไม่มีข้อมูลวันหยุดปี ${year}` },
      { status: 422 },
    );
  }

  let existing = [];
  try {
    existing = await listHolidays();
  } catch (error) {
    return Response.json({ error: error.message || 'อ่านวันหยุดในระบบไม่สำเร็จ' }, { status: 500 });
  }

  const { rows, summary } = diffHolidayYear(googleRows, existing, year);
  return Response.json({
    year,
    source: 'google-ics',
    fetchedAt: new Date().toISOString(),
    rows,
    summary,
  });
}
