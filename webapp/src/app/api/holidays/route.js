import { listHolidays } from '@/lib/master/holidays';
import { cachedJson } from '@/lib/serverCache';

export const dynamic = 'force-dynamic';

// ปฏิทินวันหยุดเหมือนกันทุกผู้ใช้และเปลี่ยนนาน ๆ ครั้ง — cache 5 นาที ลดภาระ DB
const CACHE_TTL_MS = 5 * 60 * 1000;

// GET /api/holidays — the PUBLISHED calendar (any signed-in user; PM/UI reads it).
// Writes go through the draft lifecycle under /api/holidays/draft (Decision 0012)
// — there is no direct add/delete anymore.
export async function GET() {
  try {
    const data = await cachedJson('holidays', CACHE_TTL_MS, () => listHolidays());
    return Response.json(data);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
