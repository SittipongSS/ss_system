// ── การจัดคิวและป้ายสรุป ──────────────────────────────────────────────────
import { REQUEST_OPEN_STATUSES } from '@/lib/requests/statuses';
import { requestKindLabel } from '@/lib/master/requestTypes';

// ── กำหนดวันตอบ ─────────────────────────────────────────────────────────
// ยกมาจากระบบสอบถามเดิม: ผู้ตอบระบุ "วันที่จะตอบ" ตอนกดรับเรื่อง แล้ววันนั้นเป็น
// เส้นวัด KPI (ไม่ใช่วันที่ผู้ขออยากได้ ซึ่งเป็นความคาดหวังฝ่ายเดียว)
export function requestDueTone(request, todayIso) {
  if (!request || !todayIso) return null;
  if (!REQUEST_OPEN_STATUSES.includes(request.status)) return null;
  const due = request.committedDueDate;
  if (!due) return { label: 'ยังไม่รับเรื่อง', color: 'var(--text-3)' };
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
  return String(a?.committedDueDate || '9999').localeCompare(String(b?.committedDueDate || '9999'));
}

// ป้ายสรุปหนึ่งบรรทัดสำหรับคิว/ฟีด — ชนิด + หัวเรื่อง (หรือจำนวนรายการ)
export function requestSummaryText(request, items = []) {
  const kindLabel = requestKindLabel(request?.kind);
  if (request?.title) return `${kindLabel} · ${request.title}`;
  if (items.length) return `${kindLabel} · ${items.length} รายการ`;
  return kindLabel;
}
