// ── แถบตัวเลข + ก้าวถัดไป ของคิวคำร้อง (P6b) — logic ล้วน ────────────────
//
// ⭐ **ตัวเลขตัวที่ 4 "รอฝ่ายขายทำต่อ" คือของใหม่ทั้งหมดของหน้านี้** — วันนี้คิวนับ
// ทุกใบที่ยัง open เป็น "งานค้างของฝ่าย" ทั้งที่ครึ่งหนึ่งรอผู้ขอไปรับของ/ส่งลูกค้า
// อยู่ ⇒ ตัวเลขงานค้างของ RD สูงกว่าความจริงตลอดเวลา และไม่มีใครเชื่อมันอีกเลย
//
// ⚠️ อ่านขั้นของแถวจาก `rowStage.js` ที่เดียว — ตัวเดียวกับที่รางบนหน้ารายละเอียดใช้
// ⇒ คิวกับหน้ารายละเอียดขัดกันไม่ได้เชิงโครงสร้าง (ไม่ใช่เพราะมีคนคอยดูให้ตรงกัน)
import { REQUEST_OPEN_STATUSES } from '@/lib/requests/statuses';
import { requestRowSummary } from '@/lib/requests/rowStage';

// ── ก้าวถัดไปของ "ทั้งใบ" ────────────────────────────────────────────────
//
// ต่างจาก `nextStepForRow` ตรงที่คิวไม่ได้แสดงรายแถว — มันต้องตอบคำถามเดียวว่า
// "ใบนี้รอใครอยู่" · ใบที่มีทั้งแถวที่รอฝ่ายและแถวที่รอผู้ขอ ให้ **ฝ่ายมาก่อน**
// เพราะฝ่ายเป็นคนถือคอขวด (ผู้ขอทำต่อไม่ได้จนกว่าของจะมา)
//
// คืน { owner, label } หรือ null เมื่อใบนี้ไม่ต้องการอะไรอีกแล้ว
export function requestNextStep(request) {
  if (!request) return null;
  if (request.status === 'draft') return { owner: 'requester', label: 'ยังไม่ได้ส่ง' };
  if (!REQUEST_OPEN_STATUSES.includes(request.status)) return null;

  const items = request.items || [];
  // ใบที่ยังไม่มีบรรทัด (สอบถาม/พัฒนากลิ่นก่อน RD ส่งของ) — คอขวดอยู่ที่ฝ่ายเสมอ
  if (!items.length) {
    return request.status === 'pending'
      ? { owner: 'dept', label: 'รอรับเรื่อง' }
      : { owner: 'dept', label: 'รอฝ่ายดำเนินการ' };
  }

  const summary = requestRowSummary(items);
  if (summary.waitingDept > 0) {
    return { owner: 'dept', label: `รอฝ่ายทำต่อ ${summary.waitingDept} รายการ` };
  }
  if (summary.waitingRequester > 0) {
    return { owner: 'requester', label: `รอผู้ขอทำต่อ ${summary.waitingRequester} รายการ` };
  }
  // ทุกแถวจบแล้วแต่ใบยังไม่ปิด — คนที่ต้องกดปิดคือผู้ขอ
  return { owner: 'requester', label: 'ครบแล้ว รอปิดเรื่อง' };
}

// ── แถบตัวเลข 4 ตัว ──────────────────────────────────────────────────────
//
// ⚠️ **นับใบ ไม่ใช่นับแถว** — คิวแสดงรายใบ ตัวเลขที่นับแถวจะไม่ตรงกับจำนวนบรรทัด
// ที่คนเห็นอยู่ตรงหน้า แล้วไม่มีใครรู้ว่าตัวไหนถูก
export function queueCounts(rows = [], { todayIso = null } = {}) {
  const out = { unacked: 0, overdue: 0, working: 0, waitingRequester: 0 };
  for (const request of rows) {
    if (!REQUEST_OPEN_STATUSES.includes(request?.status)) continue;
    const next = requestNextStep(request);

    if (request.status === 'pending') out.unacked += 1;
    // ⚠️ เลยกำหนดนับ **เฉพาะใบที่รับปากวันไว้แล้ว** — ใบที่ยังไม่รับเรื่องไม่มี
    // กำหนดให้เลย จึงไม่ใช่ "เลยกำหนด" แต่เป็น "ยังไม่รับเรื่อง" (คนละปัญหา
    // คนละทางแก้ · รวมกันเมื่อไรตัวเลขจะบอกไม่ได้ว่าต้องไปทำอะไร)
    if (todayIso && request.committedDueDate
      && String(request.committedDueDate) < String(todayIso)) out.overdue += 1;

    if (next?.owner === 'dept' && request.status !== 'pending') out.working += 1;
    // ⭐ ตัวที่ 4 — ใบที่ฝ่ายทำส่วนของตัวเองเสร็จแล้วแต่ยังปิดไม่ได้
    if (next?.owner === 'requester') out.waitingRequester += 1;
  }
  return out;
}

export const QUEUE_COUNT_META = [
  { key: 'unacked', label: 'ยังไม่รับเรื่อง', tone: 'warning' },
  { key: 'overdue', label: 'เลยกำหนด', tone: 'danger' },
  { key: 'working', label: 'กำลังดำเนินการ', tone: 'info' },
  // ⭐ ตัวนี้ไม่มีในระบบวันนี้ — มันคือตัวที่ทำให้ฝ่ายเลิกถูกนับงานที่ไม่ใช่ของตัวเอง
  { key: 'waitingRequester', label: 'รอฝ่ายขายทำต่อ', tone: 'neutral' },
];

// ── แท็บ 3 ตัวคงที่ (P6c) ─────────────────────────────────────────────────
//
// ⭐ **ไม่โตตามจำนวนฝ่าย** (R-4 ของแผน) — ของเดิมเป็น "คิวฝ่าย RD · คิวฝ่าย PC ·
// ที่ฉันเปิด" ซึ่งจะกลายเป็นสี่แท็บทันทีที่ฝ่ายบัญชี (FN) เข้ามาใน P7 และห้าแท็บ
// เมื่อมีฝ่ายถัดไป · คนที่อยู่หลายฝ่ายจะต้องไล่กดทีละแท็บเพื่อดูว่ามีงานอะไรบ้าง
//
// ⇒ ถามคำถามเดียวแทน: **"ตอนนี้เป็นตาใคร"** ซึ่งไม่ขึ้นกับจำนวนฝ่ายเลย
export const QUEUE_TABS = [
  { key: 'todo', label: 'รอฉันตอบ' },
  { key: 'mine', label: 'ที่ฉันเปิด' },
  { key: 'history', label: 'ประวัติ' },
];

// แถวของแต่ละแท็บ
//
// ⚠️ `myDepts` มาจากผู้เรียก (หน้าจอคำนวณจาก canAnswerRequestsFor) — ฟังก์ชันนี้ไม่
// ตัดสินสิทธิ์เอง มันแค่จัดกลุ่มสิ่งที่ server ส่งมาแล้ว · ด่านจริงอยู่ที่ API
export function queueTabRows(rows = [], { tab, myDepts = [] } = {}) {
  if (tab === 'mine') return rows.filter((r) => r._mine);
  if (tab === 'history') {
    // ⚠️ ประวัติ = **ใบที่จบแล้ว** ไม่ใช่ "ทุกใบ" — ถ้ารวมใบที่ยังเปิดอยู่ด้วย
    // มันจะซ้ำกับสองแท็บแรกและไม่มีใครรู้ว่าต้องดูแท็บไหน
    return rows.filter((r) => !requestNextStep(r));
  }
  // todo — ตาของฝ่ายที่ฉันอยู่ · ใบร่างของตัวเองไม่นับ (ยังไม่ได้ส่ง = ตาฉันเอง
  // แต่มันอยู่แท็บ "ที่ฉันเปิด" แล้ว · โผล่สองที่จะทำให้ตัวเลขบนแท็บบวกกันเกินจริง)
  return rows.filter((r) => {
    if (r.status === 'draft') return false;
    const next = requestNextStep(r);
    if (!next) return false;
    return next.owner === 'dept' ? myDepts.includes(r.dept) : !!r._mine;
  });
}

// ── แถวคั่นกลุ่ม ─────────────────────────────────────────────────────────
//
// ⭐ ทำให้ลำดับที่ `compareRequestUrgency` จัดไว้ **มองเห็นได้** — ของเดิมเรียงถูก
// แล้วแต่คนอ่านไม่รู้ว่าทำไมใบนี้อยู่บน เพราะไม่มีอะไรบอกว่าเส้นแบ่งอยู่ตรงไหน
export const QUEUE_GROUPS = [
  { key: 'unacked', label: 'ยังไม่มีใครรับเรื่อง' },
  { key: 'overdue', label: 'เลยกำหนดที่รับปากไว้' },
  { key: 'open', label: 'กำลังดำเนินการ' },
  { key: 'settled', label: 'จบแล้ว' },
];

export function requestGroupKey(request, { todayIso = null } = {}) {
  if (!request) return 'settled';
  if (!REQUEST_OPEN_STATUSES.includes(request.status)) return 'settled';
  if (request.status === 'pending') return 'unacked';
  if (todayIso && request.committedDueDate
    && String(request.committedDueDate) < String(todayIso)) return 'overdue';
  return 'open';
}

// ── จัดแถวเป็นกลุ่มพร้อมแถวคั่น (P6d) ────────────────────────────────────
//
// ⚠️ **จัดกลุ่มจริง ไม่ใช่แค่ดูว่าคีย์เปลี่ยนแล้วแทรกเส้น** — `compareRequestUrgency`
// ไม่ได้เรียงตามลำดับกลุ่มนี้เป๊ะ ๆ (มันเรียงตามความเร่งซึ่งคิดจากหลายอย่าง)
// ⇒ วิธี "เห็นคีย์เปลี่ยนแล้วแทรก" จะได้หัวข้อเดิมโผล่ซ้ำหลายรอบกลางตาราง
//
// คืน [{ group, label, rows }] — กลุ่มที่ว่างถูกตัดทิ้ง (หัวข้อลอยที่ไม่มีของ
// ข้างใต้อ่านเหมือนข้อมูลหาย)
export function groupQueueRows(rows = [], { todayIso = null } = {}) {
  const byKey = new Map(QUEUE_GROUPS.map((g) => [g.key, []]));
  for (const row of rows) {
    const key = requestGroupKey(row, { todayIso });
    (byKey.get(key) || byKey.get('open')).push(row);
  }
  return QUEUE_GROUPS
    .map((g) => ({ group: g.key, label: g.label, rows: byKey.get(g.key) || [] }))
    .filter((g) => g.rows.length);
}

// ── คิวของ "ฝ่าย" (P2) — มุมมองในโมดูลของฝ่ายเอง ─────────────────────────
//
// ⭐ ต่างจาก `queueTabRows` ตรงที่ตัวนั้นตอบคำถามของ **คน** ("ตอนนี้เป็นตาใคร"
// รวมทั้งใบที่ฉันเปิดถึงฝ่ายอื่น) ส่วนตัวนี้ตอบคำถามของ **ฝ่าย** ("งานของฝ่ายเรา
// ค้างอยู่ตรงไหน") ⇒ กรองด้วย `dept` ก่อนเสมอ ไม่ดู `_mine` เลย
//
// ⚠️ ใบร่างไม่เข้าคิวฝ่ายไม่ว่ากรณีใด — ยังไม่ถูกส่ง = ยังไม่ใช่งานของใครนอกจากคนร่าง
export const DEPT_QUEUE_TABS = [
  { key: 'todo', label: 'รอฝ่ายตอบ' },
  // ⭐ ตัวนี้คือ "รอฝ่ายขายทำต่อ" ของแถบตัวเลข — ยกขึ้นมาเป็นแท็บด้วยเพราะ RD ต้อง
  // เปิดดูได้ว่าอะไรค้างอยู่ที่อีกฝั่ง (ของที่ส่งไปแล้วแต่ยังไม่มีใครมารับ)
  { key: 'waiting', label: 'รอฝ่ายขายทำต่อ' },
  { key: 'history', label: 'ประวัติ' },
];

export function deptQueueRows(rows = [], { dept, tab = 'todo' } = {}) {
  const mine = rows.filter((r) => r?.dept === dept && r?.status !== 'draft');
  if (tab === 'history') return mine.filter((r) => !requestNextStep(r));
  const owner = tab === 'waiting' ? 'requester' : 'dept';
  return mine.filter((r) => requestNextStep(r)?.owner === owner);
}

// ── ใกล้ถึงกำหนด (หน้าภาพรวมของฝ่าย) ─────────────────────────────────────
//
// ⚠️ **นับจากวันที่ฝ่าย "รับปาก" ไม่ใช่วันที่ผู้ขอ "อยากได้"** — `committedDueDate`
// คือเส้นที่ใช้วัดว่าช้าหรือยัง (`requestedDueDate` เป็นความหวังของอีกฝั่ง)
// ⇒ ใบที่ยังไม่รับเรื่องจะไม่มีวันนี้เลย และไม่ควรโผล่ที่นี่ — มันอยู่ในตัวเลข
// "ยังไม่รับเรื่อง" ซึ่งเป็นคนละปัญหาคนละทางแก้
export function dueSoonRows(rows = [], { dept, todayIso, days = 7 } = {}) {
  if (!todayIso) return [];
  const limit = new Date(`${todayIso}T00:00:00Z`);
  limit.setUTCDate(limit.getUTCDate() + days);
  const limitIso = limit.toISOString().slice(0, 10);
  return rows
    .filter((r) => r?.dept === dept && r?.status !== 'draft')
    .filter((r) => requestNextStep(r)?.owner === 'dept')
    .filter((r) => r.committedDueDate && String(r.committedDueDate) <= limitIso)
    .sort((a, b) => String(a.committedDueDate).localeCompare(String(b.committedDueDate)));
}
