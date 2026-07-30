import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { can } from '@/lib/permissions';
import { listHolidays } from '@/lib/master/holidays';
import { normalizeImportRows, sanitizeHolidayName } from '@/lib/master/holidayImport';
import { invalidateCache } from '@/lib/serverCache';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST /api/holidays/import/commit — บันทึกเฉพาะวันที่ผู้ใช้ติ๊กไว้ในหน้าพรีวิว
//
// เขียนแบบ upsert ล้วน (เพิ่ม/แก้ชื่อ) — **ไม่ลบอะไรทั้งสิ้น** วันหยุดที่บริษัทตั้งเองและ
// ไม่มีในปฏิทิน Google (เช่นวันเข้าพรรษา) จึงอยู่ครบเสมอ · กดซ้ำได้ไม่จำกัด (idempotent)
// เพราะ holidays.date เป็น primary key
export async function POST(request) {
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  if (!can(user?.role, 'master:manage')) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const year = Number(body?.year);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return Response.json({ error: 'ระบุปีที่ต้องการนำเข้า' }, { status: 400 });
  }

  // ตรวจซ้ำฝั่ง server เสมอ ไม่เชื่อค่าที่ client ส่งมา (รวมถึง action ที่พรีวิวคำนวณไว้)
  const { rows, error: invalid } = normalizeImportRows(body?.rows, year);
  if (invalid) return Response.json({ error: invalid }, { status: 400 });

  let before = [];
  try {
    before = await listHolidays();
  } catch (error) {
    return Response.json({ error: error.message || 'อ่านวันหยุดในระบบไม่สำเร็จ' }, { status: 500 });
  }
  const current = new Map(before.map((row) => [row.date, sanitizeHolidayName(row.name)]));

  // นับผลจากของจริงในฐาน ไม่ใช่จากที่ client บอก
  let inserted = 0;
  let renamed = 0;
  let unchanged = 0;
  for (const row of rows) {
    if (!current.has(row.date)) inserted += 1;
    else if (current.get(row.date) !== row.name) renamed += 1;
    else unchanged += 1;
  }

  // ห้ามใส่ createdAt ใน payload — จะทับวันที่สร้างเดิมของแถวที่มีอยู่แล้ว
  const { error } = await supabase
    .from('holidays')
    .upsert(rows.map(({ date, name }) => ({ date, name })), { onConflict: 'date' });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  invalidateCache('holidays');

  await recordAudit({
    user,
    action: 'update',
    entityType: 'holiday',
    entityId: String(year),
    after: { inserted, renamed, unchanged, source: 'google-ics' },
    // หนึ่งรายการต่อการนำเข้า ไม่ใช่รายวัน — ไม่งั้น audit ของวันนั้นถูกกลบด้วย 20 แถว
    summary: `นำเข้าวันหยุดปี ${year} จากปฏิทิน Google — เพิ่ม ${inserted}${renamed ? ` แก้ชื่อ ${renamed}` : ''}`,
    request,
  });

  let holidays = before;
  try {
    holidays = await listHolidays();
  } catch {
    /* เขียนสำเร็จแล้ว — อ่านกลับไม่ได้ก็ยังตอบ 200 ให้ UI ไปโหลดเองรอบหน้า */
  }

  return Response.json({ summary: { inserted, renamed, unchanged }, holidays });
}
