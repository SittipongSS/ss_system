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

/* จำนวนคนที่เอ่ยชื่อในการ์ดก่อนยุบเป็น "อีก N คน" — การ์ด Chat ที่ยาวเกินจะถูกอ่านผ่าน
   เท่ากับไม่ได้เขียน · 4 คนพอให้เห็นว่ากองอยู่ที่ใครโดยไม่กลายเป็นรายชื่อทั้งฝ่าย */
export const DIGEST_MAX_OWNERS = 4;

/* เวลาที่ใช้นับอายุของแต่ละสถานะ = จุดตั้งต้นของ SLA ของสถานะนั้น ไม่ใช่ createdAt เสมอ
   (ลีดที่รับเข้ามานานแต่เพิ่งถูกมอบเมื่อวาน ยังไม่ถือว่า AE ดอง) */
const SINCE_OF = {
  new: (lead) => lead.createdAt,
  screened: (lead) => lead.screenedAt || lead.createdAt,
  assigned: (lead) => lead.assignedAt || lead.createdAt,
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
 * @param leads    แถวจาก sales_leads ที่สถานะยังค้าง (new / screened / assigned)
 * @param asOf     เวลาที่ใช้เป็น "วันนี้"
 * @param holidays Set ของวันหยุด (นับวันทำการ)
 * @param nameOf   (assigneeId) → ชื่อปัจจุบัน · ไม่เจอให้คืนค่าว่างแล้วจะถอยไปชื่อในแถว
 */
export function summarizeLeadQueue(leads = [], { asOf, holidays, nameOf = () => null } = {}) {
  const of = (status) => leads.filter((lead) => lead.status === status);
  const oldestOf = (rows) => rows.reduce((max, lead) => Math.max(max, ageOf(lead, asOf, holidays)), 0);

  const screen = of('new');
  const spread = of('screened');
  const contact = of('assigned');

  return {
    total: screen.length + spread.length + contact.length,
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

/** แถวของการ์ด Chat — คืน [] ถ้าไม่มีอะไรค้าง (ผู้เรียกจะได้ไม่ส่งการ์ดเปล่า) */
export function leadDigestRows(summary) {
  if (!summary?.total) return [];
  const rows = [];
  if (summary.screen.count) {
    rows.push({
      label: `รอคัดกรอง (${summary.screen.count})`,
      value: `AE Supervisor คัดกรอง + เลือกทีม${summary.screen.oldest ? ` · ${days(summary.screen.oldest)}` : ''}`,
    });
  }
  if (summary.spread.count) {
    const teams = summary.spread.teams.map((t) => `${t.label} ${t.count}`).join(' · ');
    rows.push({
      label: `รอกระจาย (${summary.spread.count})`,
      value: `Senior AE มอบให้ AE — ${teams}${summary.spread.oldest ? ` · ${days(summary.spread.oldest)}` : ''}`,
    });
  }
  if (summary.contact.count) {
    rows.push({
      label: `รอติดต่อกลับ (${summary.contact.count})`,
      value: describeOwners(summary.contact.owners) || 'AE ติดต่อลูกค้ากลับ',
    });
  }
  return rows;
}
