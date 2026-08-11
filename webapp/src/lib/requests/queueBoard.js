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
// ⚠️ ดึงตัวเรียงจาก `queue.js` ตรง ๆ ไม่ผ่าน façade `deptRequests.js` — façade
// re-export ไฟล์นี้ด้วย การ import กลับไปหามันคือวงกลม
import { compareRequestUrgency } from '@/lib/requests/queue';

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
  //
  // ⭐ "รอฝ่ายเริ่ม" ≠ "รอฝ่ายทำต่อ" — ตัวแรกคือรับเรื่องแล้วแต่ยังไม่มีของสักชิ้น
  // ตัวหลังคือส่งมาบ้างแล้วแต่ยังไม่ครบ · สองอย่างนี้ผู้ขอทำอะไรต่างกัน (ตัวแรกรอเฉย ๆ
  // ตัวหลังมีของให้ไปรับ) จึงยุบเป็นคำเดียวไม่ได้
  if (!items.length) {
    return request.status === 'pending'
      ? { owner: 'dept', label: 'รอรับเรื่อง' }
      : { owner: 'dept', label: 'รอฝ่ายเริ่ม' };
  }

  // ⚠️ **ไม่ต่อจำนวนท้ายป้าย** (มติผู้ใช้ 2026-08-08) — คิวมีคอลัมน์ "คืบหน้า" ที่บอก
  // `2 / 3` อยู่แล้ว ⇒ ป้ายพูดซ้ำและกินไป 50px (135px → 84px) · ป้ายตอบว่า "ใครค้าง"
  // คอลัมน์ตัวเลขตอบว่า "ค้างเท่าไร" — คนละคำถาม อย่ายัดไว้ที่เดียวกัน
  const summary = requestRowSummary(items);
  if (summary.waitingDept > 0) {
    return { owner: 'dept', label: 'รอฝ่ายทำต่อ' };
  }
  if (summary.waitingRequester > 0) {
    return { owner: 'requester', label: 'รอผู้ขอทำต่อ' };
  }
  // ทุกแถวจบแล้วแต่ใบยังไม่ปิด — คนที่ต้องกดปิดคือผู้ขอ
  return { owner: 'requester', label: 'รอปิดเรื่อง' };
}

// ── แถบตัวเลข 4 ตัว ──────────────────────────────────────────────────────
//
// ⚠️ **นับใบ ไม่ใช่นับแถว** — คิวแสดงรายใบ ตัวเลขที่นับแถวจะไม่ตรงกับจำนวนบรรทัด
// ที่คนเห็นอยู่ตรงหน้า แล้วไม่มีใครรู้ว่าตัวไหนถูก
/**
 * ใบนี้เข้าเงื่อนไขของตัวเลขตัวไหน — **กติกาเดียวที่ทั้งตัวนับและตัวกรองใช้**
 *
 * ⭐ แยกออกมาเพราะตัวเลขบนแถบ **กดกรองได้แล้ว** — ถ้าปล่อยให้ตัวนับกับตัวกรองเขียน
 * เงื่อนไขคนละชุด จะได้อาการ "กด «เลยกำหนด 2» แล้วขึ้นสามใบ" ซึ่งเป็นบั๊กที่หาไม่เจอ
 * เพราะทั้งสองฝั่งดู "ถูก" ในตัวเอง · ตอนนี้ขัดกันไม่ได้เชิงโครงสร้าง
 */
export function matchesQueueCount(request, key, { todayIso = null } = {}) {
  if (!REQUEST_OPEN_STATUSES.includes(request?.status)) return false;
  const next = requestNextStep(request);

  if (key === 'unacked') return request.status === 'pending';
  // ⚠️ เลยกำหนดนับ **เฉพาะใบที่รับปากวันไว้แล้ว** — ใบที่ยังไม่รับเรื่องไม่มี
  // กำหนดให้เลย จึงไม่ใช่ "เลยกำหนด" แต่เป็น "ยังไม่รับเรื่อง" (คนละปัญหา
  // คนละทางแก้ · รวมกันเมื่อไรตัวเลขจะบอกไม่ได้ว่าต้องไปทำอะไร)
  if (key === 'overdue') {
    return !!todayIso && !!request.committedDueDate
      && String(request.committedDueDate) < String(todayIso);
  }
  if (key === 'working') return next?.owner === 'dept' && request.status !== 'pending';
  // ⭐ ตัวที่ 4 — ใบที่ฝ่ายทำส่วนของตัวเองเสร็จแล้วแต่ยังปิดไม่ได้
  if (key === 'waitingRequester') return next?.owner === 'requester';
  return false;
}

export function queueCounts(rows = [], { todayIso = null } = {}) {
  const out = { unacked: 0, overdue: 0, working: 0, waitingRequester: 0 };
  for (const request of rows) {
    for (const key of Object.keys(out)) {
      if (matchesQueueCount(request, key, { todayIso })) out[key] += 1;
    }
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

// ── "เริ่มที่นี่" — ใบเดียวที่ควรทำก่อน ──────────────────────────────────
//
// ⭐ อาการ *"ไม่รู้ว่าต้องทำอะไรต่อ"* (มติผู้ใช้ 2026-08-08) — จอภาพรวมกับคิวตอบ
// ได้ว่า **มีอะไรค้างบ้าง** แต่ไม่มีที่ไหนตอบว่า **เริ่มที่ใบไหน** · คนเปิดมาเจอ
// ตัวเลข 4 ตัวกับตารางแล้วต้องตัดสินใจเองทุกเช้าว่าอันไหนก่อน
//
// ⚠️ **ไม่มีกติกาความเร่งชุดใหม่** — เรียงด้วย `compareRequestUrgency` แล้วหยิบ
// กลุ่มแรกจาก `groupQueueRows` ตัวเดียวกับที่คิวใช้ ⇒ ใบที่การ์ดชี้ต้องเป็นใบบนสุด
// ของคิวเสมอ · ประกาศเกณฑ์ของตัวเองเมื่อไรจะได้อาการ "การ์ดบอกใบ A แต่คิวเรียงใบ B
// ไว้บนสุด" ซึ่งอ่านแล้วไม่รู้จะเชื่ออันไหน
//
// ⚠️ ผู้เรียกต้องกรองมาแล้วว่าเป็น **งานของคนนี้/ฝ่ายนี้** — ฟังก์ชันนี้ไม่ตัดสินสิทธิ์
// และไม่รู้ว่าใครเปิดหน้าอยู่ (กติกาเดียวกับ `queueTabRows`)
//
// คืน { request, group, groupLabel, next, due, remaining } หรือ null เมื่อไม่มีอะไรค้าง
export function startHereRequest(rows = [], { todayIso = null } = {}) {
  const open = rows.filter((r) => requestNextStep(r));
  if (!open.length) return null;
  const groups = groupQueueRows(
    open.slice().sort(compareRequestUrgency),
    { todayIso },
  ).filter((g) => g.group !== 'settled');
  const top = groups[0];
  if (!top) return null;
  const request = top.rows[0];
  return {
    request,
    group: top.group,
    groupLabel: top.label,
    next: requestNextStep(request),
    due: requestDueText(request, { todayIso }),
    // ⚠️ **นับที่เหลือ ไม่ใช่นับทั้งหมด** — การ์ดชี้ใบหนึ่งไปแล้ว เลขที่ต่อท้ายจึงต้อง
    // ตอบว่า "หลังใบนี้ยังเหลืออีกเท่าไร" ไม่ใช่พูดซ้ำจำนวนที่แถบตัวเลขบอกอยู่แล้ว
    remaining: open.length - 1,
  };
}

/**
 * คิวถัดไปหลังใบที่การ์ด "เริ่มที่นี่" ชี้ไว้ — เรียงด้วยเกณฑ์เดียวกันเป๊ะ
 *
 * ⭐ **หน้าภาพรวมต้องตอบว่า "แล้วต่อจากนี้ทำอะไร"** (มติผู้ใช้ 2026-08-11 · แบบ ก) —
 * เดิมก้อนที่สองของหน้าคือ "ใกล้ถึงกำหนด 7 วัน" ซึ่งกรองด้วย `committedDueDate`
 * ⇒ **ใบที่ยังไม่มีใครรับหายไปทั้งหมด** เพราะยังไม่มีใครให้วัน · ของด่วนที่สุดของฝ่าย
 * (ใบที่ยังไม่มีใครแตะ) จึงไม่เคยโผล่บนหน้าภาพรวมเลย
 *
 * ⚠️ ใช้ `startHereRequest` เป็นตัวตัดหัว ไม่ใช่ตัดด้วย id ที่ผู้เรียกส่งมา — สองที่
 * ต้องเรียงชุดเดียวกันเสมอ ไม่งั้นการ์ดชี้ใบหนึ่ง แต่ตารางข้างล่างขึ้นใบนั้นเป็นอันดับ 2
 */
export function nextUpRows(rows = [], { todayIso = null, limit = 5 } = {}) {
  const open = rows.filter((r) => requestNextStep(r));
  if (!open.length) return [];
  const ordered = groupQueueRows(open.slice().sort(compareRequestUrgency), { todayIso })
    .filter((g) => g.group !== 'settled')
    .flatMap((g) => g.rows);
  // ตัวแรกคือใบที่การ์ด "เริ่มที่นี่" ชี้อยู่แล้ว — พูดซ้ำสองที่ในจอเดียวคือเสียที่เปล่า
  return ordered.slice(1, 1 + Math.max(0, limit));
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

// ── กำหนดส่งที่ฝ่ายรับปากไว้ — ข้อความพร้อมแสดง ────────────────────────────
//
// ⭐ **คอลัมน์ใหม่ในคิว** (มติผู้ใช้ 2026-08-08) — เดิมต้องเข้าใบถึงจะเห็น ทั้งที่
// "เลยกำหนดไหม" คือคำถามที่สองของหัวหน้าถัดจาก "ต้องทำอะไร"
//
// ⚠️ **นับเฉพาะใบที่รับปากวันไว้แล้ว** — ใบที่ยังไม่รับเรื่องไม่มีกำหนดให้เลย
// (กติกาเดียวกับตัวนับ `overdue` ที่ `matchesQueueCount` ใช้ ⇒ คอลัมน์กับตัวเลข
// บนแถบพูดตรงกันเสมอ)
//
// คืน { date, note, overdue } หรือ null เมื่อยังไม่มีกำหนด
export function requestDueText(request, { todayIso = null } = {}) {
  const due = request?.committedDueDate ? String(request.committedDueDate) : null;
  if (!due) return null;
  if (!todayIso) return { date: due, note: null, overdue: false };

  // ⚠️ ต่างกันเป็น "วัน" ไม่ใช่ชั่วโมง — ทั้งสองค่าเป็น YYYY-MM-DD ของวันไทย
  // (businessDate) · ใช้ Date.parse กับ T00:00:00Z ทั้งคู่จึงไม่มีปัญหาเขตเวลา
  const ms = Date.parse(`${due}T00:00:00Z`) - Date.parse(`${todayIso}T00:00:00Z`);
  if (!Number.isFinite(ms)) return { date: due, note: null, overdue: false };
  const days = Math.round(ms / 86400000);
  if (days < 0) return { date: due, note: `เลย ${-days} วัน`, overdue: true };
  if (days === 0) return { date: due, note: 'วันนี้', overdue: false };
  return { date: due, note: `อีก ${days} วัน`, overdue: false };
}
