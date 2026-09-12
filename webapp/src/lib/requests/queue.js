// ── การจัดคิวและป้ายสรุป ──────────────────────────────────────────────────
import { REQUEST_OPEN_STATUSES } from '@/lib/requests/statuses';
import { requestKindLabel } from '@/lib/master/requestTypes';
import { liveDueDate } from '@/lib/requests/dueRound';
import { requestClosureStarted } from '@/lib/requests/closure';

// ── กำหนดวันตอบ ─────────────────────────────────────────────────────────
// ผู้ตอบรับปากวันด้วยก้าว "แจ้งกำหนดส่ง" (แยกจากการรับเรื่อง — มติผู้ใช้ 2026-08-19)
// แล้ววันนั้นเป็นเส้นวัด KPI (ไม่ใช่วันที่ผู้ขอต้องการรับงาน ซึ่งเป็นความคาดหวังฝ่ายเดียว)
export function requestDueTone(request, todayIso) {
  if (!request || !todayIso) return null;
  if (!REQUEST_OPEN_STATUSES.includes(request.status)) return null;
  // มีฝั่งปิดแล้ว = ไม่มีวันให้ตามอีก (ม-145 · ตัวตัดสินเดียวกับคิว)
  if (requestClosureStarted(request)) return null;
  /* ⚠️ **ผ่าน `liveDueDate` ไม่ใช่อ่านคอลัมน์ดิบ** — วันของรอบก่อนไม่ใช่คำสัญญาที่
     ยังอยู่ ⇒ ตกกิ่ง "รอกำหนดส่ง" ข้างล่างซึ่งเป็นคำที่ถูกอยู่แล้ว (2026-08-26) */
  const due = liveDueDate(request);
  // ⚠️ ไม่มีวัน = สองเรื่องคนละเรื่อง (มติผู้ใช้ 2026-08-19) — ยังไม่มีใครรับ vs
  // รับแล้วแต่ยังไม่แจ้งวัน · คนอ่านต้องรู้ว่าต้องไปตามใคร
  if (!due) {
    return request.status === 'pending'
      ? { label: 'ยังไม่รับเรื่อง', color: 'var(--text-3)' }
      : { label: 'รอกำหนดส่ง', color: 'var(--text-3)' };
  }
  if (String(due) < String(todayIso)) return { label: 'เลยกำหนด', color: 'var(--red)' };
  if (String(due) === String(todayIso)) return { label: 'ครบกำหนดวันนี้', color: 'var(--amber)' };
  return null;
}

// ลำดับความเร่งของคิว (ยกมาจากระบบสอบถามเดิม): เรื่องที่ยังไม่มีใครรับมาก่อนเสมอ
// เพราะยังไม่มีใครรับปากวันตอบ = ยังไม่มีกำหนด ถ้าเรียงด้วยวันที่ล้วนมันจะตกไป
// ท้ายคิวทั้งที่เร่งที่สุด
export function compareRequestUrgency(a, b) {
  const taken = (r) => (r?.acknowledgedAt ? 1 : 0);
  if (taken(a) !== taken(b)) return taken(a) - taken(b);
  if (!a?.acknowledgedAt) return String(a?.submittedAt || '').localeCompare(String(b?.submittedAt || ''));
  /* ⚠️ เรียงด้วยวันที่ยังเป็นคำสัญญาอยู่จริง — ใบที่รอแจ้งวันของรอบใหม่ถือวันของรอบก่อน
     ซึ่งเป็นอดีต ⇒ อ่านดิบแล้วมันจะลอยขึ้นหัวคิวเสมือนด่วนที่สุด ทั้งที่ยังไม่มีใคร
     รับปากอะไรสำหรับงานที่กำลังทำอยู่ · ไปกองกับใบไม่มีวัน ('9999') ตามกติกาเดียว
     กับตัวนับ `undated` และกลุ่มของคิว (ตรวจย้อนหลัง 2026-08-26) */
  /* ⚠️ ใบที่มีฝั่งปิดแล้วไปกองกับใบไม่มีวัน (ม-145) — มันไม่ "เลยกำหนด" แล้ว (ไม่แดง ·
     ไม่อยู่กลุ่มเลยกำหนด) · เรียงด้วยวันเก่าของมันเมื่อไร มันจะลอยเหนือใบที่เลยกำหนดจริง
     และการ์ด "เริ่มที่นี่" (ซึ่งจัดกลุ่มก่อน) จะชี้ใบที่ไม่ใช่แถวบนสุดของคิว */
  const dueOf = (r) => (requestClosureStarted(r) ? null : liveDueDate(r));
  return String(dueOf(a) || '9999').localeCompare(String(dueOf(b) || '9999'));
}

// ป้ายสรุปหนึ่งบรรทัดสำหรับคิว/ฟีด — ชนิด + หัวเรื่อง (หรือจำนวนรายการ)
export function requestSummaryText(request, items = []) {
  const kindLabel = requestKindLabel(request?.kind);
  if (request?.title) return `${kindLabel} · ${request.title}`;
  if (items.length) return `${kindLabel} · ${items.length} รายการ`;
  return kindLabel;
}
