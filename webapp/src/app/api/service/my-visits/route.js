// ── API คิวงานของช่าง (S-3) ──────────────────────────────────────────────
// GET ?scope=mine|team&back=7&ahead=14
//   mine = นัดที่มอบหมายให้ผู้ใช้คนนี้ · team = ทุกนัดของฝ่าย (ไปแทนกันเป็นเรื่องปกติ)
//
// ⚠️ ช่วงเวลาถอยหลังด้วย (`back`) เพราะ **นัดค้างคือหนี้ที่โตทุกวัน** — ถ้าโหลด
// เฉพาะวันนี้เป็นต้นไป นัดที่ลืมปิดจะหายไปจากสายตาถาวร
import { withUser, ok, fail } from '@/lib/http';
import { toLocalISODate } from '@/lib/pm/dateHelpers';
import { requireService } from '@/lib/service/sitesRepo';
import { loadVisits, sitesForVisits } from '@/lib/service/visitsRepo';

export const dynamic = 'force-dynamic';

const shift = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toLocalISODate(d);
};

const clampDays = (raw, fallback, max) => {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(Math.trunc(n), max);
};

export const GET = withUser(async ({ user, supabase, req }) => {
  const access = requireService({ user });
  if (access.response) return access.response;

  const url = new URL(req.url);
  const scope = url.searchParams.get('scope') === 'team' ? 'team' : 'mine';
  const back = clampDays(url.searchParams.get('back'), 14, 90);
  const ahead = clampDays(url.searchParams.get('ahead'), 14, 90);

  try {
    const visits = await loadVisits(supabase, {
      from: shift(-back),
      to: shift(ahead),
      // ⚠️ กรองที่ **query** ไม่ใช่หลังโหลด — ฝ่ายที่มีนัดหลายร้อยใบต่อเดือน
      // การดึงมาทั้งหมดแล้วกรองบนมือถือคือการจ่ายค่า egress ฟรีทุกครั้งที่เปิดหน้า
      assigneeId: scope === 'mine' ? String(user.id) : null,
    });
    const sites = await sitesForVisits(supabase, visits);
    return ok({ scope, visits, sites: [...sites.values()] });
  } catch (e) {
    return fail(e.message, 500);
  }
});
