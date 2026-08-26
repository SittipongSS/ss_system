// สรุปคิวลีดค้างสำหรับการ์ดสรุปเช้า (cron/daily-digest)
//
// ทำไมต้องมี: การ์ดเดิมบอกแค่ **จำนวนรวม** ต่อสถานะ ("รอติดต่อกลับ 29") ซึ่งอ่านแล้ว
// ไม่รู้ว่าต้องไปตามใครและเรื่องเร่งแค่ไหน — ตรวจข้อมูลจริง 2026-08-08 พบว่าใน 29 ใบนั้น
// มี 14 ใบที่ค้างข้ามเดือนมาแล้ว ใบที่นานสุดค้าง 10 วันทำการ ทั้งที่ SLA คือ 1 วันทำการ
// การ์ดที่บอกแค่ตัวเลขรวมจึงถูกอ่านผ่านทุกเช้าโดยไม่มีใครรู้ว่ามันแย่ขนาดไหน
//
// แยกเป็นฟังก์ชันบริสุทธิ์เพราะตรรกะอยู่ในไฟล์ route แล้วเทสต์เข้าไม่ถึง
// (route เหลือหน้าที่ query + ประกอบข้อความ)

import { businessDaysWaiting } from '@/lib/sales/handoffQueue';
import { leadFollowUpState } from '@/lib/sales/leads';
import { businessDayKey } from '@/lib/datePeriods';

/* จำนวนคนที่เอ่ยชื่อในการ์ดก่อนยุบเป็น "อีก N คน" — การ์ด Chat ที่ยาวเกินจะถูกอ่านผ่าน
   เท่ากับไม่ได้เขียน · 4 คนพอให้เห็นว่ากองอยู่ที่ใครโดยไม่กลายเป็นรายชื่อทั้งฝ่าย */
export const DIGEST_MAX_OWNERS = 4;

/* เวลาที่ใช้นับอายุของแต่ละสถานะ = จุดตั้งต้นของ SLA ของสถานะนั้น ไม่ใช่ createdAt เสมอ
   (ลีดที่รับเข้ามานานแต่เพิ่งถูกมอบเมื่อวาน ยังไม่ถือว่า AE ดอง) */
/* ⚠️ ก๊อปที่ 3 ของ 3 — ต้องตรงกับ `SINCE_OF` ใน leadNotify.js และ `sinceOf` ใน
   cron/daily-digest/route.js · แก้ไม่ครบ = การ์ดกับแจ้งเตือนรายงานคนละชุดใบ */
const SINCE_OF = {
  new: (lead) => lead.createdAt,
  screened: (lead) => lead.screenedAt || lead.createdAt,
  assigned: (lead) => lead.assignedAt || lead.createdAt,
  contacted: (lead) => lead.followUpAt || null,
};

function ageOf(lead, asOf, holidays) {
  const since = SINCE_OF[lead.status]?.(lead);
  return since ? businessDaysWaiting(since, asOf, holidays) : 0;
}

/** จัดกลุ่มแล้วเรียง "ค้างนานสุดขึ้นก่อน" — คนที่ดองนานกว่าต้องถูกเห็นก่อนคนที่ถือเยอะกว่า */
function groupBy(leads, keyOf, labelOf, asOf, holidays) {
  const map = new Map();
  for (const lead of leads) {
    const key = keyOf(lead) ?? '__none__';
    if (!map.has(key)) map.set(key, { key, label: labelOf(lead, key), count: 0, oldest: 0 });
    const entry = map.get(key);
    entry.count += 1;
    entry.oldest = Math.max(entry.oldest, ageOf(lead, asOf, holidays));
  }
  return [...map.values()].sort((a, b) => b.oldest - a.oldest || b.count - a.count);
}

/**
 * @param leads    แถวจาก sales_leads ที่สถานะยังค้าง (new / screened / assigned / contacted)
 * @param asOf     เวลาที่ใช้เป็น "วันนี้"
 * @param holidays Set ของวันหยุด (นับวันทำการ)
 * @param nameOf   (assigneeId) → ชื่อปัจจุบัน · ไม่เจอให้คืนค่าว่างแล้วจะถอยไปชื่อในแถว
 * @param withBounceContext  แถวมี `lead.bounce` แนบมาแล้วหรือยัง (ดู attachBounceContext)
 *   🪤 **ไม่ใช่ค่าตั้งต้น true โดยเจตนา** — ผู้เรียกที่ไม่ได้แนบบริบทจะได้ `autoBounced`
 *   เป็น 0 ทุกครั้ง ซึ่งอ่านว่า "ไม่มีใบไหนถูกส่งกลับเลย" ทั้งที่แปลว่า "ไม่ได้ถาม"
 *   ⇒ ไม่ส่งธงมา = **ไม่มีคีย์นี้เลย** หน้าจอจะได้ไม่วาดตัวเลขที่ไม่มีใครยืนยัน
 */
export function summarizeLeadQueue(leads = [], {
  asOf, holidays, nameOf = () => null, withBounceContext = false,
} = {}) {
  const of = (status) => leads.filter((lead) => lead.status === status);
  const oldestOf = (rows) => rows.reduce((max, lead) => Math.max(max, ageOf(lead, asOf, holidays)), 0);

  const screen = of('new');
  const spread = of('screened');
  const contact = of('assigned');

  /* ── ขั้นติดตาม (mig 0289) ────────────────────────────────────────────────
     ⭐ ขั้นนี้ไม่เคยอยู่ในสรุปมาก่อน ทั้งที่เป็นขั้นที่ลีดค้างนานที่สุดในระบบจริง
     (ตรวจ prod 2026-08-25: `contacted` 106 ใบ เทียบกับ `assigned` 9 ใบ)
     ⚠️ ต่างจากขั้นอื่นตรงที่ **นาฬิกาเป็นวันที่ AE รับปากลูกค้าไว้เอง** ไม่ใช่ SLA กลาง
     ⇒ "เลยกำหนด" ที่นี่คือเลยวันที่ตัวเองนัด ไม่ใช่เลย 1 วันทำการ */
  const followUp = of('contacted');
  const todayKey = businessDayKey(asOf);
  const stateOf = (lead) => (lead.followUpAt ? leadFollowUpState(lead.followUpAt, todayKey) : null);
  const dueToday = followUp.filter((l) => stateOf(l) === 'today');
  const overdue = followUp.filter((l) => stateOf(l) === 'late');
  /* 🔴 ใบที่ติดต่อแล้วแต่ **ไม่มีวันติดตามเลย** — ของก่อน mig 0289 ที่ไม่มีนาฬิกาจับ
     ตีกลับอัตโนมัติก็ไม่แตะ (planAutoBounce ข้ามใบที่ไม่มีจุดเริ่ม) ⇒ นอนเงียบตลอดกาล
     ถ้าไม่นับแยกไว้ หน้าจอจะขึ้น "เลยวันติดตาม 0" ทั้งที่มีใบรออยู่ร้อยกว่าใบ */
  const noPlan = followUp.filter((l) => !l.followUpAt);

  return {
    total: screen.length + spread.length + contact.length + followUp.length,
    screen: { count: screen.length, oldest: oldestOf(screen) },
    spread: {
      count: spread.length,
      oldest: oldestOf(spread),
      teams: groupBy(spread, (l) => l.team, (l, key) => (key === '__none__' ? 'ไม่มีทีม' : key), asOf, holidays),
    },
    contact: {
      count: contact.length,
      oldest: oldestOf(contact),
      // ชื่อปัจจุบันก่อนเสมอ — สำเนาชื่อในแถวเป็นชื่อย่อ/ชื่อเก่าอยู่หลายใบบน prod
      owners: groupBy(
        contact,
        (l) => l.assigneeId,
        (l, key) => (key === '__none__' ? 'ยังไม่มีผู้รับผิดชอบ' : nameOf(key) || l.assigneeName || key),
        asOf,
        holidays,
      ),
    },
    followUp: {
      count: followUp.length,
      dueToday: dueToday.length,
      noPlan: noPlan.length,
      late: {
        count: overdue.length,
        oldest: oldestOf(overdue),
        owners: groupBy(
          overdue,
          (l) => l.assigneeId,
          (l, key) => (key === '__none__' ? 'ยังไม่มีผู้รับผิดชอบ' : nameOf(key) || l.assigneeName || key),
          asOf,
          holidays,
        ),
      },
    },
    /* ใบที่กลับมาอยู่คิวเพราะระบบดึงออกจากมือคนเดิม — ต้องถูกคัดใหม่ด้วยสายตาที่ต่างจากเดิม
       ไม่ใช่คัดเข้าทีมเดิมมอบคนเดิมแล้ววนอีกรอบ
       ⚠️ แยกตามขั้นที่ใบไปกองอยู่ ไม่ใช่ยอดรวมก้อนเดียว — คนคัดกรองกับคนกระจายเป็น
       คนละคน ตัวเลขรวมจึงบอกไม่ได้ว่าใครต้องระวัง */
    ...(withBounceContext
      ? {
        autoBounced: {
          screen: screen.filter((l) => (l.bounce?.autoRounds || 0) > 0).length,
          spread: spread.filter((l) => (l.bounce?.autoRounds || 0) > 0).length,
        },
      }
      : null),
  };
}

const days = (n) => `นานสุด ${n} วันทำการ`;

/** "Threerapong 6 ใบ (นานสุด 10 วันทำการ) · Kamonrat 5 ใบ · อีก 2 คน" */
export function describeOwners(entries = [], max = DIGEST_MAX_OWNERS) {
  if (!entries.length) return '';
  const shown = entries.slice(0, max).map((entry, index) => {
    // ใส่จำนวนวันเฉพาะรายแรก (ตัวที่แย่ที่สุด) — ทุกตัวใส่ครบแล้วการ์ดยาวจนไม่มีใครอ่าน
    const age = index === 0 && entry.oldest > 0 ? ` · ${days(entry.oldest)}` : '';
    return `${entry.label} ${entry.count} ใบ${age}`;
  });
  const rest = entries.length - shown.length;
  if (rest > 0) shown.push(`อีก ${rest} คน`);
  return shown.join(' · ');
}

/* ── เรื่องเดียวที่ต้องบอกบนหัวคิว ────────────────────────────────────────────
   การ์ดข้างล่างบอก "เท่าไร" ครบแล้ว แถบเตือนมีหน้าที่บอก "แล้วจะเกิดอะไรต่อ"
   ⚠️ **เรื่องเดียว** ไม่ใช่ทุกเรื่องที่เข้าเงื่อนไข — ซ้อนกันหลายแถบคือกลับไปเป็น
   กำแพงตัวเลขอีกแบบหนึ่ง ซึ่งเป็นสิ่งที่แถบนี้มีไว้แก้
   ลำดับความด่วน:
     1. `late`   — เลยวันที่รับปากลูกค้าไว้แล้ว **และมีนาฬิกาเดินอยู่** (ตีกลับอัตโนมัติ)
     2. `noPlan` — ติดต่อแล้วแต่ไม่มีวันติดตามเลย ⇒ **ไม่มีอะไรทวงให้** นอนได้ตลอดกาล
   ข้อ 2 ดังน้อยกว่าเพราะไม่มีเส้นตาย แต่ปล่อยไว้แล้วเงียบกว่าข้อ 1 มาก */
export function leadQueueNotice(summary) {
  const followUp = summary?.followUp;
  if (!followUp) return null;
  if (followUp.late?.count > 0) return { kind: 'late', count: followUp.late.count, tone: 'danger' };
  if (followUp.noPlan > 0) return { kind: 'noPlan', count: followUp.noPlan, tone: 'warning' };
  return null;
}
