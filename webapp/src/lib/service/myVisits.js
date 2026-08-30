// ── คิวงานของเจ้าหน้าที่ (S-3) — logic ล้วน ──────────────────────────────────────
//
// ⭐ หน้า "นัดของฉัน" บนมือถือคือ **จุดที่ข้อมูลจริงเข้าระบบ** ถ้าหน้านี้ใช้ยาก ทั้งโมดูลตาย
// ตารางสวยแค่ไหนก็ไม่มีค่าถ้าไม่มีใครปิดงาน แล้วทุกแถวค้างเป็น 'นัดไว้' ตลอดกาล
import { toLocalISODate } from '@/lib/pm/dateHelpers';
import { sortByTime } from './rounds';
import { businessDate } from '@/lib/businessDate';
import { isClosedVisit, isDraftVisit } from './visitStatus';

export const VISIT_SCOPES = ['mine', 'team'];
export const VISIT_SCOPE_LABELS = { mine: 'ของฉัน', team: 'ทั้งทีม' };

const shiftDays = (iso, days) => {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  d.setDate(d.getDate() + days);
  return toLocalISODate(d);
};

// ── จัดกลุ่มคิวเป็น 4 ก้อนตามที่เจ้าหน้าที่คิด ไม่ใช่ตามที่ DB เก็บ ────────────
//
// ⚠️ **"ค้าง" ต้องมาก่อนทุกอย่าง** — นัดที่เลยวันแล้วแต่ยังไม่ปิดคือหนี้ที่โตขึ้น
// ทุกวัน · ถ้าเอาไปไว้ท้ายรายการ (เรียงตามวันตรง ๆ) มันจะเลื่อนหลุดจอไปเรื่อย ๆ
// จนไม่มีใครเห็น แล้วประวัติการเข้าไซต์ก็ขาดเป็นช่วง ๆ โดยไม่มีใครรู้ตัว
//
// ⚠️ นัดที่ปิดไปแล้ววันนี้ยัง**อยู่ในกลุ่มวันนี้** (ไม่หายไปทันทีที่กดปิด) — เจ้าหน้าที่ต้อง
// เห็นว่าตัวเองทำอะไรไปแล้วบ้าง และกดกลับเข้าไปแก้ได้ถ้ากรอกผิด
export function groupVisits(visits = [], todayIso = businessDate()) {
  const tomorrowIso = shiftDays(todayIso, 1);
  const overdue = [];
  const today = [];
  const tomorrow = [];
  const later = [];

  for (const visit of visits) {
    if (visit.status === 'cancelled' || visit.status === 'rescheduled') continue;
    /* 🔴 ร่างไม่โผล่ในคิวของเจ้าหน้าที่ — TS ไม่ใช่ต้นทางของงาน และร่างที่ยังไม่ผ่านด่าน
       ไม่ใช่งานที่ใครควรออกไปทำ (มติผู้ใช้ 2026-08-28) */
    if (isDraftVisit(visit)) continue;
    const date = String(visit.scheduledDate || '');
    if (date < todayIso) {
      /* เลยวันแล้ว: ไปถึงไซต์แล้วและได้ข้อสรุป = ประวัติ (ไม่ต้องทวง) · ที่เหลือ = ค้าง
         🐞 ของเดิมเช็ค `!== 'done'` ⇒ ใบ partial/unable จะค้างในกลุ่ม "ค้างอยู่"
         ของเจ้าหน้าที่ตลอดกาล ทั้งที่ไปมาแล้วและปิดจบไปแล้ว */
      if (!isClosedVisit(visit)) overdue.push(visit);
      continue;
    }
    if (date === todayIso) { today.push(visit); continue; }
    if (date === tomorrowIso) { tomorrow.push(visit); continue; }
    later.push(visit);
  }

  const byDateThenTime = (rows) => {
    const groups = new Map();
    for (const row of rows) {
      const key = row.scheduledDate;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
    return [...groups.keys()].sort().flatMap((key) => sortByTime(groups.get(key)));
  };

  return {
    overdue: byDateThenTime(overdue),
    today: sortByTime(today),
    tomorrow: sortByTime(tomorrow),
    later: byDateThenTime(later),
  };
}

/* ⭐ นัดค้างมากี่วัน — ⚠️ **รูที่ใหญ่ที่สุดของหน้าเจ้าหน้าที่เดิม**: การ์ดแสดงแต่ "เวลา"
   ไม่มีวันที่เลย และกลุ่ม "ค้างอยู่" รวมหลายวันไว้ด้วยกัน ⇒ นัดที่ค้างมาสองเดือน
   หน้าตาเหมือนนัดของเมื่อวานเป๊ะ · คืน null เมื่อยังไม่เลยวัน (ไม่ใช่ 0 —
   "ไม่ค้าง" กับ "ค้างศูนย์วัน" คนละความหมาย และป้ายต้องไม่ขึ้นเลย)
   วันฐานมาจากนาฬิกาไทยเสมอ (businessDate) ไม่ใช่นาฬิกาเครื่องเจ้าหน้าที่ */
export function overdueDays(visit, todayIso = businessDate()) {
  const date = String(visit?.scheduledDate || '');
  if (!date || date >= todayIso) return null;
  const from = new Date(`${date}T00:00:00`);
  const to = new Date(`${todayIso}T00:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  const days = Math.round((to - from) / 86400000);
  return days > 0 ? days : null;
}

// นัดที่ยังต้องทำจริง ๆ วันนี้ — ตัวเลขบนหัวหน้าจอ (ปิดแล้วไม่นับ)
export function openCount(groups) {
  const open = (rows = []) => rows.filter((v) => !isClosedVisit(v)).length;
  return {
    overdue: open(groups?.overdue),
    today: open(groups?.today),
    tomorrow: open(groups?.tomorrow),
  };
}

/* "รอฉันลงมือ" ของเจ้าหน้าที่ = **นัดค้าง + นัดวันนี้ที่ยังไม่ปิด** (ม-116)
   ⚠️ ไม่รวมพรุ่งนี้/วันหลัง — นัดที่ยังไม่ถึงวันไม่ใช่ของค้าง มันคือแผน · ป้ายที่นับ
   แผนล่วงหน้าจะไม่มีวันเป็นศูนย์แล้วคนก็เลิกอ่าน (กติกาเดียวกับที่ไม่ให้ปฏิทินนัดมีป้าย)
   ⚠️ ตัวเลขสองตัวนี้คือตัวเดียวกับที่หัวหน้า "นัดของฉัน" โชว์อยู่แล้ว ("ค้าง N · วันนี้ M")
   ⇒ กดจากป้ายเข้าไปเห็นเลขเดิมทันที ไม่ต้องมีตัวกรองพิเศษ */
export function waitingOnMeVisitCount(visits = [], todayIso = businessDate()) {
  const open = openCount(groupVisits(visits, todayIso));
  return open.overdue + open.today;
}

// ── ค่าตั้งต้นของฟอร์มปิดงาน ─────────────────────────────────────────────
// ⭐ เติมให้ครบที่สุดเท่าที่รู้ — เจ้าหน้าที่ที่ยืนอยู่หน้างานจะไม่พิมพ์เวลาเอง
//   วันที่เข้าจริง  = วันนี้ (ไม่ใช่วันที่นัด — คนปิดงานตอนที่ทำเสร็จจริง)
//   เวลาเริ่ม/จบ    = เวลาที่นัดไว้ ถ้ามี · ไม่มีก็เว้นไว้ให้กดปุ่ม "ตอนนี้"
export function closeFormDefaults(visit, { todayIso = businessDate(), nowHHMM = null } = {}) {
  const hhmm = (value) => (value ? String(value).slice(0, 5) : '');
  return {
    actualDate: visit?.actualDate || todayIso,
    actualStartTime: hhmm(visit?.actualStartTime) || hhmm(visit?.startTime),
    actualEndTime: hhmm(visit?.actualEndTime) || hhmm(visit?.endTime) || nowHHMM || '',
    summary: visit?.summary || '',
    attachments: Array.isArray(visit?.attachments) ? visit.attachments : [],
    customerSignatureUrl: visit?.customerSignatureUrl || null,
  };
}

// ── สิ่งที่ยังไม่ได้กรอก — เตือน ไม่บล็อก ───────────────────────────────
// ⚠️ รูปและลายเซ็น **ไม่บังคับ** (มติผู้ใช้) แต่ต้องบอกให้รู้ว่าขาด ไม่ใช่เงียบ
// ป้ายนี้ติดไปกับนัดหลังปิดงานด้วย เพื่อให้หัวหน้าตามเก็บทีหลังได้
export function missingEvidence(form = {}) {
  const out = [];
  if (!Array.isArray(form.attachments) || form.attachments.length === 0) out.push('ยังไม่มีรูปหน้างาน');
  if (!form.customerSignatureUrl) out.push('ยังไม่มีลายเซ็นผู้รับงาน');
  return out;
}
