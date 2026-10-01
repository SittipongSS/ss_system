// ── API คิวงานของเจ้าหน้าที่ (S-3) ──────────────────────────────────────────────
// GET ?scope=mine|team&back=7&ahead=14&assignee=<id>            ← แบบเดิม (ไม่มี from/to)
// GET ?scope=mine&from=YYYY-MM-DD&to=YYYY-MM-DD&assignee=<id>   ← แบบช่วงวัน (แผน operation-crew §5 · S2)
//   mine = นัดที่มอบหมายให้ผู้ใช้คนนี้ · team = ทุกนัดของฝ่าย (ไปแทนกันเป็นเรื่องปกติ)
//   assignee = ดูคิวของเจ้าหน้าที่คนอื่นแบบเจาะคน (หน้า "งานวันนี้" เปิดจากลิงก์ ?user=
//   ของหน้าจัดคิว — F-1) · ใช้ได้เฉพาะ scope=mine และผู้ที่ผ่าน requireService อยู่แล้ว
//
// ⚠️ ช่วงเวลาถอยหลังด้วย (`back`) เพราะ **นัดค้างคือหนี้ที่โตทุกวัน** — ถ้าโหลด
// เฉพาะวันนี้เป็นต้นไป นัดที่ลืมปิดจะหายไปจากสายตาถาวร
//
// ⭐ **สองแบบ เลือกจาก query** (R3) —
//   · ไม่มี `from`/`to` = **แบบเดิมทุกอย่าง** (ถอย/ล่วง 14 วัน · นัดค้างปนอยู่ใน `visits` · ไม่มีคีย์ `overdue`)
//     หน้า "งานวันนี้" ตัวเก่า (`today/page.js`) อ่านแค่ `data.visits` แล้วแยกค้างอยู่เอง (`groupVisits`)
//     ⇒ ห้ามเปลี่ยนทรงคำตอบของทางนี้จนกว่าจอใหม่ขึ้นและบังคับรีเฟรชไปหนึ่งรอบ (ถอดทิ้งใน PR-3)
//   · มี `from`/`to` = คิวแบบช่วงวันของจอใหม่ + `overdue` (ไม่มีขอบล่าง) + `sentBack` + ของประกอบการ์ด
// 🔴 **"วันนี้" มาจากนาฬิกาไทย** (`businessDate`) — 🐞 ของเดิมเลื่อนวันด้วยนาฬิกาของเครื่อง server (UTC บน
//    Vercel) ⇒ ตี 0–7 ไทย ช่วงวันเลื่อนถอยไปหนึ่งวันทั้งก้อน
// 🔴 **ช่างเห็นแค่งานตัวเอง** (มติ 26/09 · `usesCrewShell`) — scope/assignee ของช่างถูกบังคับเป็นตัวเองที่ server
//    ไม่ใช่แค่จอไม่ส่งมา (URL พิมพ์เองได้)
import { withUser, ok, fail, badRequest } from '@/lib/http';
import { businessDate } from '@/lib/businessDate';
import { addDays } from '@/lib/datePeriods';
import { usesCrewShell } from '@/lib/permissions';
import { myWorkWindow } from '@/lib/service/crew/workWindow';
import { requireService } from '@/lib/service/sitesRepo';
import { enrichMyWork, loadMyWorkRows, loadVisits, sitesForVisits } from '@/lib/service/visitsRepo';

export const dynamic = 'force-dynamic';

/* ⚠️ **ไม่ส่งมา = 0 (วันนี้วันเดียว) — คงไว้ตั้งใจจนกว่าจอใหม่ขึ้น (PR-3)** — `Number(null)` = 0 ผ่านด่าน
   `Number.isFinite` ⇒ หน้างานวันนี้ตัวเก่า (เรียก `?scope=mine` เฉย ๆ) ได้ช่วงวันนี้วันเดียวมาตั้งแต่ S-3
   (กลุ่ม ค้างอยู่ / พรุ่งนี้ / ถัดไป ว่าง ขณะที่ป้ายเมนูนับ −14…+14) · 🔴 ห้ามแก้ใน PR-1: ถ้าเปิดช่วง ±14 ตรงนี้
   การ์ดวันข้างหน้าจะโผล่พร้อมปุ่ม "เริ่มงาน" ที่ด่านวันนัด (`crew/jobStart.js`) ตีกลับ 409 ทุกครั้ง
   ⇒ จอใหม่ (แถบวัน) ใช้ทาง from/to แทน แล้วทางนี้ถูกถอดทิ้งใน PR-3 */
const clampDays = (raw, fallback, max) => {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(Math.trunc(n), max);
};

export const GET = withUser(async ({ user, supabase, req }) => {
  const access = requireService({ user });
  if (access.response) return access.response;

  const url = new URL(req.url);
  const crewShell = usesCrewShell(user);
  const scope = !crewShell && url.searchParams.get('scope') === 'team' ? 'team' : 'mine';
  // ไปแทนกัน: ขอคิวของเจ้าหน้าที่คนอื่นแบบเจาะคน — ไม่ต้องแคบสิทธิ์กว่า requireService
  // เพราะ scope=team เดิมก็เห็นนัดทุกคนทั้งฝ่ายอยู่แล้ว อันนี้แค่กรองให้แคบลง
  // ⚠️ ช่างขอคิวคนอื่นไม่ได้ (ไม่เห็นทั้งฝ่ายตั้งแต่ต้น) ⇒ ทิ้งค่าที่ส่งมา
  const assignee = crewShell ? '' : (url.searchParams.get('assignee') || '').trim();
  // ⚠️ กรองที่ **query** ไม่ใช่หลังโหลด — ฝ่ายที่มีนัดหลายร้อยใบต่อเดือน
  // การดึงมาทั้งหมดแล้วกรองบนมือถือคือการจ่ายค่า egress ฟรีทุกครั้งที่เปิดหน้า
  const assigneeId = scope === 'mine' ? (assignee || String(user.id)) : null;
  const today = businessDate();
  const rawFrom = url.searchParams.get('from');
  const rawTo = url.searchParams.get('to');

  try {
    if (rawFrom == null && rawTo == null) {
      const back = clampDays(url.searchParams.get('back'), 14, 90);
      const ahead = clampDays(url.searchParams.get('ahead'), 14, 90);
      const visits = await loadVisits(supabase, {
        from: addDays(today, -back), to: addDays(today, ahead), assigneeId,
      });
      const sites = await sitesForVisits(supabase, visits);
      return ok({ scope, visits, sites: [...sites.values()] });
    }

    const span = myWorkWindow(rawFrom, rawTo, today);
    if (span.error) return badRequest(span.error);
    const rows = await loadMyWorkRows(supabase, { assigneeId, from: span.from, to: span.to, today });
    const work = await enrichMyWork(supabase, rows, { personId: assigneeId, viewerId: user.id });
    const sites = await sitesForVisits(supabase, [...work.visits, ...work.overdue, ...work.sentBack]);
    return ok({
      scope, today, from: span.from, to: span.to,
      visits: work.visits, overdue: work.overdue, sentBack: work.sentBack,
      sites: [...sites.values()],
    });
  } catch (e) {
    return fail(e.message, 500);
  }
});
