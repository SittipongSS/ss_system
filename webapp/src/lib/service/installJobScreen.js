// ── จอหน้างานติดตั้งของช่าง (ขั้นเข้าติดตั้ง PR-5b · ม็อก C1a/C1/C2/C3) — คำและสถานะของจอ ล้วน ────────────────────
//
// ⭐ มติเจ้าของ 09/11/2026: แถบขั้นใช้คำ **"เริ่มงาน › ทำงาน › ส่งงาน"** (ไม่ใช่ "รับงาน") · ก่อนเริ่มงานเปิดดูโซน/จุดได้
//    แต่บันทึกผลได้หลังกดเริ่มงาน · งานวันอื่นกดเริ่มไม่ได้ (ด่าน server `visitMoveDecision` ตัวเดียวกัน)
// ⚠️ ไฟล์นี้แปลภาพงาน (`installJobView` ของ server) เป็นคำบนจอเท่านั้น — กติกาบันทึก/ส่งงานอยู่ `installJob.js`
import { fmtDate } from '@/lib/format';
import { isClosedVisit } from './visitStatus';

const hhmm = (value) => String(value || '').slice(0, 5);

/** แถบขั้น (StepTrack) — `[{ key, label, state, note }]` */
export function installJobSteps(visit) {
  const started = visit?.status === 'in_progress';
  const closed = isClosedVisit(visit);
  const startNote = visit?.actualStartTime ? `เริ่ม ${hhmm(visit.actualStartTime)} น.` : null;
  return [
    { key: 'start', label: 'เริ่มงาน', state: started || closed ? 'done' : 'now', note: started || closed ? startNote : 'ยังไม่เริ่ม' },
    { key: 'work', label: 'ทำงาน', state: closed ? 'done' : started ? 'now' : 'todo', note: null },
    { key: 'send', label: 'ส่งงาน', state: closed ? 'done' : 'todo', note: closed ? 'ส่งแล้ว' : 'ยังไม่ส่ง' },
  ];
}

/**
 * ปุ่ม "เริ่มงาน" กดได้ไหม — `{ show, can, reason }` (ปุ่มกดไม่ได้ = โชว์เสมอ บอกเหตุ · กติกา GatedAction)
 * ⚠️ ด่านจริงอยู่ server (`visitMoveDecision`) — ที่นี่บอกเหตุก่อนกดเท่านั้น
 */
export function installStartState(visit, todayIso) {
  if (!visit || visit.status === 'in_progress' || isClosedVisit(visit)) return { show: false, can: false, reason: null };
  if (visit.status === 'draft') return { show: true, can: false, reason: 'นัดยังไม่ได้ยืนยันกับลูกค้า — รอฝ่ายขายคอนเฟิร์ม' };
  if (visit.status !== 'scheduled') return { show: true, can: false, reason: 'นัดนี้ไม่ได้อยู่บนตารางงานแล้ว' };
  if (todayIso && visit.scheduledDate && visit.scheduledDate > todayIso) {
    return { show: true, can: false, reason: `งานวันที่ ${fmtDate(visit.scheduledDate)} — ยังกดเริ่มไม่ได้` };
  }
  return { show: true, can: true, reason: null };
}

/** ป้ายสถานะของโซนบนรายการโซน (C1) — `{ text, tone }` */
export function installZoneBadge(zone) {
  if (!zone) return { text: '', tone: 'neutral' };
  if (zone.state === 'complete') {
    return zone.unable
      ? { text: `ครบ · ติดตั้ง ${zone.done}/${zone.total} · ติดไม่ได้ ${zone.unable}`, tone: 'warning' }
      : { text: `ครบ ${zone.done}/${zone.total} จุด`, tone: 'success' };
  }
  if (zone.state === 'working') return { text: `กำลังทำ ${zone.done + zone.unable}/${zone.total} จุด`, tone: 'info' };
  return { text: `ยังไม่เริ่ม 0/${zone.total}`, tone: 'neutral' };
}

/** เครื่องในโซนแบบย่อ — "OV-10 ขาว × 2 · 2 จุด" (ม็อก C1) */
export function installZoneMachines(zone) {
  const counts = new Map();
  for (const spot of zone?.spots || []) {
    const key = [spot.label || spot.model || spot.code, spot.colour].filter(Boolean).join(' ') || 'เครื่อง';
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const machines = [...counts.entries()].map(([name, n]) => `${name} × ${n}`).join(' · ');
  return [machines, `${zone?.total || 0} จุด`].filter(Boolean).join(' · ');
}

/** แถบล่างของรายการโซน — "ยังขาด n จุด ใน m โซน" หรือ "ครบทุกจุดแล้ว" */
export function installMissingText(view) {
  const missing = view?.missing || 0;
  if (!missing) return 'ครบทุกจุดแล้ว — กดส่งงาน';
  const zones = (view?.zones || []).filter((z) => z.state !== 'complete').length;
  return `ยังขาด ${missing} จุด ใน ${zones} โซน`;
}

/** โซนที่ต้องตอบตอนส่งงาน (ยังมีจุดไม่มีผล) — ลำดับเดียวกับรายการโซน */
export const installOpenZones = (view) => (view?.zones || []).filter((z) => z.spots.some((s) => !s.outcome));

/** ร่างของจุดจากภาพงาน — ค่าเริ่มของฟอร์มหน้าโซน (C2) */
export const installSpotDraft = (spot) => ({
  assetId: spot.assetId,
  spotName: spot.spotName || '',
  photoUrl: spot.photoUrl || '',
  photoName: spot.photoName || '',
  outcome: spot.outcome || '',
  reason: spot.reason || '',
  dirty: false,
});

/** ร่างจุดเปลี่ยนจากที่บันทึกไว้ไหม — บอก "ยังไม่ได้บันทึก" บนปุ่ม */
export const installSpotDirty = (draft, spot) => (
  (draft.spotName || '') !== (spot.spotName || '') || (draft.photoUrl || '') !== (spot.photoUrl || '')
  || (draft.outcome || '') !== (spot.outcome || '') || (draft.reason || '') !== (spot.reason || '')
);
