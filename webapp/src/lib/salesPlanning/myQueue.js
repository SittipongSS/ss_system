// ── "คิวของฉัน" — ของค้างทุกชนิดในตารางเดียว (ล้วน ไม่แตะจอ) ─────────────
//
// ⭐ **แดชบอร์ดของฉันตอบว่า "มีอะไรบ้าง" แต่ไม่เคยตอบว่า "เริ่มที่ไหน"**
// (มติผู้ใช้ 2026-08-12 · แบบ ก) — ของค้างเคยกระจายอยู่ **ห้าการ์ด** ในคอลัมน์ขวา
// (ลีดต้องติดต่อ · Won รอออก SO · SO รอออกใบยื่นภาษี · ภาพรวมงาน · Pipeline FC)
// แต่ละใบมีลิงก์ "ดูทั้งหมด" ของตัวเอง ⇒ ไม่มีที่ไหนบอกว่ารวมแล้วค้างกี่ชิ้น
// และอันไหนต้องทำก่อน · คนเปิดมาเจอฟีดกิจกรรมกลางหน้า ซึ่งตอบว่า *อะไรเพิ่งเกิด*
// ไม่ใช่ *ฉันต้องทำอะไร*
//
// ⭐ **คำร้องเข้ามาอยู่ในสายตาแล้ว** — เดิม API ของแดชบอร์ดไม่แตะ `dept_requests`
// สักบรรทัด ⇒ ใบที่ถูกตีกลับ (ม-102) มองไม่เห็นจากหน้านี้เลย ทั้งที่เป็นของค้างที่
// **ไม่มีใครกำลังทำอยู่** (ฝ่ายปล่อยมือแล้ว ผู้ขอยังไม่รู้ตัว)
//
// ⚠️ **ที่นี่ไม่รู้จัก React และไม่ยิง API** — รับก้อนที่ API ส่งมาแล้วแปลงเป็นแถว
// รูปเดียวกันหมด · เทสต์จึงเรียกได้ตรง ๆ โดยไม่ต้องมีจอ
import { fmtDate } from '@/lib/format';
import { requestKindLabel } from '@/lib/master/requestTypes';
import { LEAD_STATUS_LABELS } from '@/lib/sales/leads';

/* ชนิดของงานในคิว — ป้ายบนชิปกรอง · เรียงตาม "ความใกล้ตัวคนขาย" ไม่ใช่ตามตัวอักษร
   ⚠️ คีย์ตรงกับ `kind` ของแถว — เพิ่มชนิดใหม่ต้องเติมที่นี่ ไม่งั้นชิปจะไม่มีให้กด
   ทั้งที่แถวโผล่ในตาราง (เทสต์ `myQueue.test.mjs` ล็อกไว้) */
export const MY_QUEUE_KINDS = [
  { key: 'request', label: 'คำร้อง' },
  { key: 'lead', label: 'ลีด' },
  { key: 'task', label: 'งาน' },
  { key: 'document', label: 'เอกสาร' },
];

/* กลุ่มตามความเร่ง — เรียงจากบนลงล่างตามลำดับที่ต้องลงมือ
   ⚠️ **ไม่มีกลุ่ม "ไม่มีกำหนด"** — ของที่ไม่มีวันกำหนดไปอยู่ "ภายหลัง" ปนกับของที่มี
   วันไกล ๆ เพราะทั้งสองอย่างแปลว่า *ยังไม่ต้องทำวันนี้* ซึ่งเป็นสิ่งเดียวที่คนอ่านสนใจ */
export const MY_QUEUE_GROUPS = [
  { key: 'overdue', label: 'เลยกำหนดแล้ว', tone: 'danger' },
  { key: 'today', label: 'ครบกำหนดวันนี้', tone: 'warning' },
  { key: 'week', label: 'ภายในสัปดาห์นี้', tone: 'info' },
  { key: 'later', label: 'ภายหลัง', tone: 'neutral' },
];

const dayDiff = (fromIso, toIso) => {
  const a = Date.parse(`${String(fromIso).slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${String(toIso).slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((a - b) / 86400000);
};

/**
 * แถวหนึ่งของคิว — รูปเดียวกันทุกชนิด
 *
 * `due` = วันที่ต้องทำ (ISO `YYYY-MM-DD`) หรือ null · `days` = เหลือกี่วัน (ลบ = เลย)
 * ⚠️ **`step` คือ "ต้องทำอะไร" ไม่ใช่ "นี่คืออะไร"** — คอลัมน์แรกของตารางต้องเป็น
 * คำสั่ง ("โทรกลับลูกค้า") ไม่ใช่ป้ายสถานะ ("ลีด: assigned") · กติกาเดียวกับ
 * `requestNextStep` ของคิวคำร้อง
 */
/* `basis` — วันที่ในแถวหมายถึงอะไร
     'deadline' = **กำหนดส่งจริง** (ฝ่ายรับปาก · วันครบงาน · วันนัดลูกค้า) ⇒ เลยแล้ว = สาย
     'waiting'  = **วันที่เริ่มค้าง** (ถูกตีกลับ · Won แล้วยังไม่ออก SO · ลีดที่ดองไว้)
   🐞 **แยกสองอย่างนี้ไม่ได้แปลว่าโหดกับตัวเอง มันแปลว่าโกหก** — เวอร์ชันแรกให้ทุกแถว
   ใช้กฎเดียวกัน ⇒ ใบเสนอราคาที่เพิ่ง Won เมื่อวาน ขึ้นกลุ่ม "เลยกำหนดแล้ว" ทันที
   ทั้งที่ไม่มีใครเคยรับปากวันไหนไว้เลย · ของแบบนั้นเป็น "ทำได้แล้ววันนี้" ไม่ใช่ "สาย" */
function row({ kind, id, step, title, sub, due, href, urgent = false, basis = 'deadline', todayIso }) {
  const days = due ? dayDiff(due, todayIso) : null;
  const overdue = basis === 'deadline' && days != null && days < 0;
  return {
    key: `${kind}:${id}`,
    kind, id, step, title, sub: sub || '', href, basis,
    due: due || null,
    days,
    overdue,
    urgent: !!urgent,
    dueText: dueTextOf(days, due, basis),
  };
}

// ข้อความวันบนคอลัมน์ขวา — "อีก N วัน" อ่านง่ายกว่าวันที่ดิบตอนกวาดตา (กติกาเดียว
// กับคิวคำร้อง) · วันที่จริงเป็นบรรทัดรองให้จอเป็นคนใส่
function dueTextOf(days, due, basis) {
  if (days == null) return due ? fmtDate(due) : 'ไม่มีกำหนด';
  if (basis === 'waiting') return days < 0 ? `ค้างมา ${Math.abs(days)} วัน` : 'วันนี้';
  if (days < 0) return `เลย ${Math.abs(days)} วัน`;
  if (days === 0) return 'วันนี้';
  if (days === 1) return 'พรุ่งนี้';
  return `อีก ${days} วัน`;
}

/**
 * กลุ่มของแถว
 *
 * ⚠️ **ของที่ "ค้าง" ไปอยู่กลุ่มวันนี้ ไม่ใช่กลุ่มเลยกำหนด** — ไม่มีใครเคยรับปากวันไหน
 * ไว้กับมัน ⇒ เรียกว่า "สาย" ไม่ได้ · แต่ก็ปล่อยลงท้ายคิวไม่ได้เหมือนกัน เพราะมันคือ
 * ของที่ไม่มีใครทวง ซึ่งเป็นเหตุผลที่ทำคิวนี้ตั้งแต่แรก ⇒ ลงกลุ่ม "ทำได้แล้ววันนี้"
 */
export function myQueueGroupKey(item) {
  if (!item) return 'later';
  if (item.overdue) return 'overdue';
  if (item.basis === 'waiting') return 'today';
  if (item.days === 0) return 'today';
  if (item.days != null && item.days <= 7) return 'week';
  return 'later';
}

/**
 * รวมของค้างทุกชนิดเป็นคิวเดียว — เรียงตามความเร่งแล้ว
 *
 * ⚠️ **ของที่ไม่มีกำหนดไม่ได้แปลว่าไม่เร่ง** — ลีดที่มอบหมายมาแล้วไม่มีวันนัด ยัง
 * ต้องโทรกลับ · ใบตีกลับไม่มีกำหนดส่งเลยแต่ค้างที่เราคนเดียว ⇒ ทั้งสองอย่างได้
 * "วันที่เทียม" จากวันที่มันเริ่มค้าง (`bouncedAt` / วันมอบหมาย) ไม่ใช่ถูกดันไปท้าย
 */
export function buildMyQueue({
  requests = [], leads = [], tasks = [], awaitingSalesOrder = [], awaitingFiling = [],
  todayIso = null,
} = {}) {
  const out = [];

  for (const request of requests) {
    // ใบตีกลับคือของค้างของ **ผู้ขอ** — วันที่ใช้เรียงคือวันที่ถูกตีกลับ
    const bounced = request.status === 'draft' && request.bouncedAt;
    /* ⚠️ **ใบที่ฝ่ายยังไม่รับปากต้องมีวันเหมือนกัน แต่คนละความหมาย** — เดิมที่นี่อ่านแต่
       `committedDueDate` ⇒ ใบที่ยังไม่รับปากตกไปกลุ่ม "ไม่มีกำหนด" ขณะที่ปฏิทินบนหน้า
       เดียวกัน (lib/salesPlanning/mySchedule) วางมันบน `requestedDueDate` = **ใบเดียวกัน
       สองวันบนจอเดียว** · ตอนนี้ถอยเป็นวันที่ผู้ขอต้องการ แต่ `basis: 'waiting'` เพราะ
       ยังไม่มีใครรับปาก ⇒ ไม่ขึ้นป้าย "เลยกำหนด" (จะกลายเป็นการโทษฝ่ายที่ยังไม่ได้รับปาก) */
    const committed = bounced ? null : request.committedDueDate || null;
    const requested = bounced ? null : request.requestedDueDate || null;
    out.push(row({
      kind: 'request',
      id: request.id,
      step: bounced ? 'แก้แล้วส่งใหม่' : committed ? 'รอฝ่ายตอบ' : 'รอฝ่ายแจ้งกำหนดส่ง',
      title: request.title || request.customerName || requestKindLabel(request.kind),
      sub: [request.docNo || 'ร่าง', requestKindLabel(request.kind), request.customerName]
        .filter(Boolean).join(' · '),
      due: bounced ? String(request.bouncedAt).slice(0, 10) : committed || requested,
      // ตีกลับ/ยังไม่รับปาก = ค้างที่เรา (ไม่มีคำสัญญา) · ใบที่รับปากแล้ว = กำหนดจริง
      basis: bounced || !committed ? 'waiting' : 'deadline',
      href: `/requests/${request.id}`,
      urgent: !!request.urgent || !!bounced,
      todayIso,
    }));
  }

  for (const lead of leads) {
    const meeting = lead.status === 'meeting' && lead.meetingAt ? String(lead.meetingAt).slice(0, 10) : null;
    out.push(row({
      kind: 'lead',
      id: lead.id,
      step: meeting ? 'นัดหมายลูกค้า' : 'โทรกลับลูกค้า',
      title: lead.company || lead.contactName || 'ลีด',
      sub: LEAD_STATUS_LABELS[lead.status] || lead.status || '',
      // ไม่มีวันนัด = ใช้วันที่ลีดเข้ามาถึงมือเรา ⇒ ลีดที่ดองไว้จะไต่ขึ้นมาเอง
      due: meeting || (lead.assignedAt ? String(lead.assignedAt).slice(0, 10) : null)
        || (lead.createdAt ? String(lead.createdAt).slice(0, 10) : null),
      // มีวันนัด = กำหนดจริง · ไม่มี = นับจากวันที่ลีดมาถึงมือเรา
      basis: meeting ? 'deadline' : 'waiting',
      href: `/sales-planning/leads/${lead.id}`,
      todayIso,
    }));
  }

  for (const task of tasks) {
    out.push(row({
      kind: 'task',
      id: task.id,
      step: task.status === 'in_progress' ? 'ทำต่อให้จบ' : 'เริ่มงานนี้',
      title: task.title || 'งาน',
      sub: [task.category, task.assignedByName ? `มอบโดย ${task.assignedByName}` : null]
        .filter(Boolean).join(' · '),
      due: task.dueDate || null,
      href: '/pm/tasks',
      urgent: !!task.urgent,
      todayIso,
    }));
  }

  /* ⚠️ **รอยต่อเอกสารใช้วันที่ของ "ก้าวก่อนหน้า" เป็นวันเริ่มค้าง** — ใบเสนอราคาที่
     Won แล้วยังไม่ออก SO ไม่มีวันกำหนดของตัวเอง · ถ้าไม่ให้วันมันจะจมอยู่ท้ายคิว
     ตลอดกาล ทั้งที่เป็นงานที่ไม่มีใครทวง (เหตุผลเดียวกับที่ทำคิวนี้ตั้งแต่แรก) */
  for (const quote of awaitingSalesOrder) {
    out.push(row({
      kind: 'document',
      id: quote.id,
      step: 'ออกใบสั่งขาย',
      title: quote.customerName || 'ลูกค้า',
      sub: [quote.quoteNumber, 'Won แล้ว รอออก SO'].filter(Boolean).join(' · '),
      due: quote.acceptedAt ? String(quote.acceptedAt).slice(0, 10) : null,
      basis: 'waiting',
      href: `/sa/quotations/${quote.id}`,
      todayIso,
    }));
  }
  for (const order of awaitingFiling) {
    out.push(row({
      kind: 'document',
      id: order.id,
      step: 'ออกใบยื่นภาษี',
      title: order.customerName || 'ลูกค้า',
      sub: [order.orderNumber, 'อนุมัติแล้ว รอยื่นสรรพสามิต'].filter(Boolean).join(' · '),
      due: order.approvedAt ? String(order.approvedAt).slice(0, 10) : null,
      basis: 'waiting',
      href: `/sa/sales-orders/${order.id}`,
      todayIso,
    }));
  }

  return sortMyQueue(out);
}

/**
 * เรียงคิว — เลยกำหนดก่อน · ใกล้กำหนดก่อน · ด่วนก่อนเมื่อวันเท่ากัน
 *
 * ⚠️ ของที่ไม่มีวันเลยไปท้ายสุดเสมอ **ไม่ว่าอย่างไร** — ไม่ใช่เพราะไม่สำคัญ แต่เพราะ
 * ไม่มีอะไรให้เทียบ · ตัวสร้างแถวข้างบนพยายามให้ "วันที่เริ่มค้าง" กับทุกชนิดแล้ว
 * เพื่อให้เคสนี้เหลือน้อยที่สุด
 */
export function sortMyQueue(items = []) {
  return items
    .map((item, i) => [item, i])
    .sort(([a, ai], [b, bi]) => {
      if ((a.days == null) !== (b.days == null)) return a.days == null ? 1 : -1;
      if (a.days !== b.days && a.days != null) return a.days - b.days;
      if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
      return ai - bi;
    })
    .map(([item]) => item);
}

/** จัดกลุ่มตามความเร่ง — กลุ่มว่างถูกตัดทิ้ง (หัวข้อลอยที่ไม่มีของอ่านเหมือนข้อมูลหาย) */
export function groupMyQueue(items = []) {
  return MY_QUEUE_GROUPS
    .map((group) => ({ ...group, items: items.filter((item) => myQueueGroupKey(item) === group.key) }))
    .filter((group) => group.items.length);
}

/**
 * ตัวเลขบนแถบ — ทุกช่อง **นับจากคิวเดียวกับตารางข้างล่าง** เสมอ
 *
 * 🐞 ของเดิมตัวเลขบนหัวกับรายการข้างล่างมาคนละที่ (แถวบนนับจาก `taskSummary` ที่
 * server สรุปมา ส่วนการ์ดขวานับเอง) ⇒ เลขไม่ตรงกันได้โดยไม่มีใครรู้
 */
export function myQueueCounts(items = []) {
  return {
    total: items.length,
    overdue: items.filter((item) => item.overdue).length,
    today: items.filter((item) => item.days === 0).length,
    bounced: items.filter((item) => item.kind === 'request' && item.step === 'แก้แล้วส่งใหม่').length,
    document: items.filter((item) => item.kind === 'document').length,
    byKind: Object.fromEntries(MY_QUEUE_KINDS.map((k) => [
      k.key, items.filter((item) => item.kind === k.key).length,
    ])),
  };
}
